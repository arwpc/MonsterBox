/**
 * Hardware Service Index for MonsterBox
 * Unified interface for all 11 Part types with PipeWire integration
 */

import { spawn } from 'child_process';
import fs from 'fs/promises';
import os from 'os';
import path from 'path';
import { fileURLToPath } from 'url';
import { readConfig } from '../configService.js';
import pipewireService from '../pipewireService.js';
import streamRoutingService from '../streamRoutingService.js';
import actuatorService from './actuator.js';
import { runPy, runWrapper } from './exec.js';
import servoService from './servo.js';
import stepperService from './stepper.js';
import { getCalibrationStore, isPlaceholderProfile } from '../../server/calibration/store.js';
import { getPartSafety, applySafetyLimits, runInPowerGroup } from './safetyLimits.js';
import servoDaemonClient from './servoDaemonClient.js';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

// mjpg-streamer owns webcam streaming (same endpoints webcamController proxies).
const MJPG_STREAMER_URL = 'http://127.0.0.1:8090';
const MJPG_STREAM_ENDPOINT = `${MJPG_STREAMER_URL}/?action=stream`;

/**
 * Did a Python wrapper report success?
 *
 * The wrappers emit one envelope on stdout: {ok, op, part, data, error, timing_ms,
 * clamps} plus the legacy `success`/`status`/`message` mirrors this function
 * reads. Those mirrors are load-bearing — see python_wrappers/mb_response.py.
 *
 * Prefers the parsed JSON envelope. The string fallback exists because some
 * wrappers still print a bare word, but it used to be a raw substring test —
 * so any output containing "success" anywhere passed, including the word
 * "unsuccessful" and log lines that merely mention it. stdout also carries
 * pca9685_control's log JSON, which makes an accidental match easy. Matching on
 * a word boundary keeps the fallback without the false positives.
 */
function wrapperSucceeded(out, parsed) {
    if (parsed && typeof parsed === 'object') {
        if (parsed.success === true) return true;
        if (parsed.success === false) return false;
        if (typeof parsed.status === 'string') return parsed.status === 'success';
    }
    if (typeof out !== 'string') return false;
    if (/unsuccessful/i.test(out)) return false;
    return /(^|[^a-zA-Z])success(ful)?([^a-zA-Z]|$)/.test(out);
}

function parsePythonJSON(out) {
    if (!out) return null;
    const lines = String(out).trim().split(/\r?\n/).filter(Boolean);
    for (let i = lines.length - 1; i >= 0; i--) {
        try { return JSON.parse(lines[i]); } catch (e) { /* continue */ }
    }
    return null;
}

/**
 * Clamps the Python wrapper applied on its own, as human-readable strings.
 *
 * config/hardware-safety.json is now enforced in BOTH layers: Node clamps first,
 * and the wrapper re-applies the same committed config as an independent
 * backstop (it can only narrow, never widen). A clamp that only the wrapper
 * made would otherwise be invisible — which is how "ask for 8s, get 5s, never
 * be told" happened.
 */
function extractWrapperClamps(result) {
    if (!result || typeof result !== 'object') return [];
    const parsed = parsePythonJSON(result.rawOutput);
    if (!parsed || !Array.isArray(parsed.clamps)) return [];
    return parsed.clamps.map(c =>
        `${c.field} ${c.requested} → ${c.applied} (${c.reason}, enforced at the wrapper)`);
}

async function getDataDir() {
    const cfg = await readConfig();
    const appRoot = path.resolve(__dirname, '../..');
    return path.resolve(appRoot, cfg && cfg.dataPath ? cfg.dataPath : '../data');
}

function typeToModelsFile(type) {
    var t = (type || '').replace(/\-/g, '_');
    switch (t) {
        case 'servo': return 'servo_models.json';
        case 'motor': return 'motor_models.json';
        case 'stepper': return 'motor_models.json'; // stepper models are stored with motors
        case 'led': return 'led_models.json';
        case 'light': return 'light_models.json';
        case 'linear_actuator': return 'linear_actuator_models.json';
        case 'sensor': return 'sensor_models.json';
        case 'motion_sensor': return 'motion_sensor_models.json';
        case 'microphone': return 'microphone_models.json';
        case 'speaker': return 'speaker_models.json';
        case 'webcam': return 'webcam_models.json';
        case 'head_tracking': return 'head_tracking_models.json';
        default: return null;
    }
}

async function getModelDefaultsForPart(part) {
    try {
        // modelId lives at the TOP level of a part (sibling of config) in every
        // per-character parts.json; the older nested config.modelId form still
        // exists on a couple of parts, so accept both. Reading only the nested
        // form silently returned {} for 36 of 59 fleet parts, so model defaults
        // never reached the hardware merge below.
        const modelId = (part && part.modelId) || (part && part.config && part.config.modelId);
        if (!modelId) return {};
        const fname = typeToModelsFile(part.type);
        if (!fname) return {};
        const dataDir = await getDataDir();
        const filePath = path.resolve(dataDir, fname);
        const raw = await fs.readFile(filePath, 'utf8');
        const models = JSON.parse(raw);
        const model = Array.isArray(models) ? models.find(m => String(m.id) === String(modelId)) : null;
        if (model && model.defaults && typeof model.defaults === 'object') {
            return Object.assign({}, model.defaults);
        }
        return {};
    } catch (e) {
        return {};
    }
}

// Hardware control functions for each part type
const HARDWARE_CONTROLLERS = {
    // 🔄 Motor - DC motors for movement
    motor: {
        async control({ directionPin, pwmPin, rpwmPin, lpwmPin, renPin, lenPin, controlBoard, pwmFrequency, direction = 'forward', speed = 50, duration = 1000 }) {
            try {
                // Normalize direction naming (map cw/ccw -> forward/backward)
                const dirRaw = String(direction || '').toLowerCase();
                const normDir = (dirRaw === 'cw' || dirRaw === 'fwd' || dirRaw === 'forward') ? 'forward'
                    : (dirRaw === 'ccw' || dirRaw === 'rev' || dirRaw === 'reverse' || dirRaw === 'back' || dirRaw === 'backward') ? 'backward'
                        : (dirRaw === 'stop' ? 'stop' : dirRaw);

                let out;
                if (String(controlBoard || '').toUpperCase() === 'BTS7960' && rpwmPin != null && lpwmPin != null) {
                    // Use generic BTS7960 controller (same as linear actuator)
                    const btsDir = (normDir === 'backward') ? 'reverse' : (normDir === 'forward' ? 'forward' : 'forward');
                    const cfg = {
                        controlBoard: 'BTS7960',
                        rpwmPin: Number(rpwmPin),
                        lpwmPin: Number(lpwmPin),
                        direction: btsDir,
                        speed: Number(normDir === 'stop' ? 0 : speed),
                        duration: Number(normDir === 'stop' ? 0 : duration)
                    };
                    if (renPin != null) cfg.renPin = Number(renPin);
                    if (lenPin != null) cfg.lenPin = Number(lenPin);
                    if (pwmFrequency != null) cfg.pwmFrequency = Number(pwmFrequency);
                    out = await runWrapper('linear_actuator_control_v2.py', [JSON.stringify(cfg)]);
                } else {
                    // Legacy path: MDD10A/Cytron via motor_cli.py with dir+pwm pins
                    out = await runWrapper('motor_cli.py', [String(normDir), String(speed), String(duration), String(directionPin), String(pwmPin)]);
                }

                const parsed = parsePythonJSON(out);
                const success = wrapperSucceeded(out, parsed);
                return {
                    success,
                    partType: 'motor',
                    directionPin: directionPin,
                    pwmPin: pwmPin,
                    rpwmPin: rpwmPin,
                    lpwmPin: lpwmPin,
                    controlBoard: controlBoard,
                    direction: normDir,
                    speed: speed,
                    duration: duration,
                    rawOutput: out,
                    message: parsed && parsed.message ? parsed.message : (success ? `Motor ${normDir} at ${speed}%` : 'Motor command failed')
                };
            } catch (error) {
                return { success: false, partType: 'motor', directionPin: directionPin, pwmPin: pwmPin, rpwmPin, lpwmPin, error: error.message };
            }
        },

        async stop({ directionPin, pwmPin, rpwmPin, lpwmPin, renPin, lenPin, controlBoard }) {
            try {
                let out;
                if (String(controlBoard || '').toUpperCase() === 'BTS7960' && rpwmPin != null && lpwmPin != null) {
                    const cfg = {
                        controlBoard: 'BTS7960',
                        rpwmPin: Number(rpwmPin),
                        lpwmPin: Number(lpwmPin),
                        direction: 'forward',
                        speed: 0,
                        duration: 0
                    };
                    if (renPin != null) cfg.renPin = Number(renPin);
                    if (lenPin != null) cfg.lenPin = Number(lenPin);
                    out = await runWrapper('linear_actuator_control_v2.py', [JSON.stringify(cfg)]);
                } else {
                    // 'stop' is not a direction motor_control.py accepts (forward|backward|
                    // reverse only), so this always errored out and never stopped anything.
                    // Speed 0 drives the PWM pin LOW and releases the pins — a real stop.
                    out = await runWrapper('motor_cli.py', ['forward', '0', '100', String(directionPin), String(pwmPin)]);
                }
                const parsed = parsePythonJSON(out);
                const success = wrapperSucceeded(out, parsed);
                return {
                    success,
                    partType: 'motor',
                    directionPin: directionPin,
                    pwmPin: pwmPin,
                    rpwmPin: rpwmPin,
                    lpwmPin: lpwmPin,
                    rawOutput: out,
                    message: parsed && parsed.message ? parsed.message : (success ? `Motor stopped` : 'Motor stop failed')
                };
            } catch (error) {
                return { success: false, partType: 'motor', directionPin: directionPin, pwmPin: pwmPin, rpwmPin, lpwmPin, error: error.message };
            }
        }
    },

    // 🦴 Linear Actuator - extending/retracting movements (real hardware via Python wrapper)
    linear_actuator: {
        async jog({ pin, directionPin, pwmPin, rpwmPin, lpwmPin, renPin, lenPin, controlBoard, invertDirection, direction, speed = 50, distance = 100, duration, maxExtension = 15000, maxRetraction = 15000 }) {
            // If invertDirection is set, swap extend/retract so wiring polarity doesn't matter
            const effectiveDir = invertDirection ? (direction === 'extend' ? 'retract' : 'extend') : direction;
            console.log(`🦴 linear_actuator.jog: direction=${direction}${invertDirection ? ` (inverted→${effectiveDir})` : ''}, speed=${speed}%, duration=${duration}ms`);
            // Unified jog action that routes to extend/retract based on direction
            if (effectiveDir === 'extend') {
                const result = await this.extend({ pin, directionPin, pwmPin, rpwmPin, lpwmPin, renPin, lenPin, controlBoard, speed, distance, duration, maxExtension, maxRetraction });
                console.log(`🦴 linear_actuator.jog: extend completed`);
                return { ...result, action: direction }; // report original direction to caller
            } else if (effectiveDir === 'retract') {
                const result = await this.retract({ pin, directionPin, pwmPin, rpwmPin, lpwmPin, renPin, lenPin, controlBoard, speed, distance, duration, maxExtension, maxRetraction });
                console.log(`🦴 linear_actuator.jog: retract completed`);
                return { ...result, action: direction }; // report original direction to caller
            } else {
                throw new Error(`Invalid direction for jog: ${direction}. Must be 'extend' or 'retract'.`);
            }
        },

        async extend({ pin, directionPin, pwmPin, rpwmPin, lpwmPin, renPin, lenPin, controlBoard, invertDirection, speed = 50, distance = 100, duration, maxExtension = 15000, maxRetraction = 15000 }) {
            // When called directly (not via jog), handle invertDirection by delegating to retract
            if (invertDirection) {
                console.log(`🦴 extend() inverted → calling retract() instead`);
                const result = await this.retract({ pin, directionPin, pwmPin, rpwmPin, lpwmPin, renPin, lenPin, controlBoard, speed, distance, duration, maxExtension, maxRetraction });
                return { ...result, action: 'extend' };
            }
            console.log(`🦴 extend() called: board=${controlBoard}, dirPin=${directionPin}, pwmPin=${pwmPin}, speed=${speed}, duration=${duration}`);
            try {
                const dur = typeof duration === 'number' ? duration : 1000; // safe default
                const board = controlBoard || 'MDD10A';
                console.log(`🦴 extend() normalized: board=${board}, dur=${dur}`);

                let out;
                if (board === 'BTS7960' && rpwmPin !== undefined && lpwmPin !== undefined) {
                    console.log(`🦴 extend() using BTS7960 path...`);
                    // Use new v2 script for BTS7960
                    const config = JSON.stringify({
                        controlBoard: 'BTS7960',
                        rpwmPin: parseInt(rpwmPin),
                        lpwmPin: parseInt(lpwmPin),
                        renPin: renPin !== undefined ? parseInt(renPin) : null,
                        lenPin: lenPin !== undefined ? parseInt(lenPin) : null,
                        direction: 'forward',
                        speed,
                        duration: dur
                    });
                    out = await runWrapper('linear_actuator_control_v2.py', [config]);
                } else {
                    console.log(`🦴 extend() using MDD10A/Cytron path...`);
                    // Use legacy script for MDD10A/Cytron
                    const dirPin = (typeof directionPin === 'number') ? directionPin : (typeof pin === 'number' ? pin : parseInt(pin, 10));
                    const pwm = (typeof pwmPin === 'number') ? pwmPin : (typeof pin === 'number' ? pin + 1 : parseInt(pin, 10) + 1);

                    console.log(`🦴 extend() calling actuatorService.controlActuator with dirPin=${dirPin}, pwm=${pwm}, speed=${speed}, duration=${dur}`);
                    out = await actuatorService.controlActuator({
                        directionPin: dirPin,
                        pwmPin: pwm,
                        direction: 'extend',
                        speed,
                        duration: dur,
                        maxExtension: maxExtension,
                        maxRetraction: maxRetraction
                    });
                    console.log(`🦴 extend() actuatorService.controlActuator completed, out length=${String(out).length}`);
                }

                console.log(`🦴 extend() parsing output...`);
                // Parse output
                const parsed = (() => {
                    try {
                        const lines = String(out).trim().split(/\r?\n/).filter(Boolean);
                        for (let i = lines.length - 1; i >= 0; i--) {
                            try { return JSON.parse(lines[i]); } catch (e) { /* continue */ }
                        }
                        return null;
                    } catch { return null; }
                })();
                const success = wrapperSucceeded(out, parsed);

                return {
                    success,
                    partType: 'linear_actuator',
                    pin: pin,
                    directionPin: directionPin,
                    pwmPin: pwmPin,
                    rpwmPin: rpwmPin,
                    lpwmPin: lpwmPin,
                    controlBoard: board,
                    action: 'extend',
                    speed: speed,
                    duration: dur,
                    rawOutput: out,
                    message: parsed && parsed.message ? parsed.message : (success ? `Linear actuator extending` : 'Actuator extend failed')
                };
            } catch (error) {
                return { success: false, partType: 'linear_actuator', pin, error: error.message };
            }
        },

        async retract({ pin, directionPin, pwmPin, rpwmPin, lpwmPin, renPin, lenPin, controlBoard, invertDirection, speed = 50, distance = 100, duration, maxExtension = 15000, maxRetraction = 15000 }) {
            // When called directly (not via jog), handle invertDirection by delegating to extend
            if (invertDirection) {
                console.log(`🦴 retract() inverted → calling extend() instead`);
                const result = await this.extend({ pin, directionPin, pwmPin, rpwmPin, lpwmPin, renPin, lenPin, controlBoard, speed, distance, duration, maxExtension, maxRetraction });
                return { ...result, action: 'retract' };
            }
            try {
                const dur = typeof duration === 'number' ? duration : 1000;
                const board = controlBoard || 'MDD10A';

                let out;
                if (board === 'BTS7960' && rpwmPin !== undefined && lpwmPin !== undefined) {
                    // Use new v2 script for BTS7960
                    const config = JSON.stringify({
                        controlBoard: 'BTS7960',
                        rpwmPin: parseInt(rpwmPin),
                        lpwmPin: parseInt(lpwmPin),
                        renPin: renPin !== undefined ? parseInt(renPin) : null,
                        lenPin: lenPin !== undefined ? parseInt(lenPin) : null,
                        direction: 'backward',
                        speed,
                        duration: dur
                    });
                    out = await runWrapper('linear_actuator_control_v2.py', [config]);
                } else {
                    // Use legacy script for MDD10A/Cytron
                    const dirPin = (typeof directionPin === 'number') ? directionPin : (typeof pin === 'number' ? pin : parseInt(pin, 10));
                    const pwm = (typeof pwmPin === 'number') ? pwmPin : (typeof pin === 'number' ? pin + 1 : parseInt(pin, 10) + 1);

                    out = await actuatorService.controlActuator({
                        directionPin: dirPin,
                        pwmPin: pwm,
                        direction: 'retract',
                        speed,
                        duration: dur,
                        maxExtension: maxExtension,
                        maxRetraction: maxRetraction
                    });
                }

                // Parse output
                const parsed = (() => {
                    try {
                        const lines = String(out).trim().split(/\r?\n/).filter(Boolean);
                        for (let i = lines.length - 1; i >= 0; i--) {
                            try { return JSON.parse(lines[i]); } catch (e) { /* continue */ }
                        }
                        return null;
                    } catch { return null; }
                })();
                const success = wrapperSucceeded(out, parsed);

                return {
                    success,
                    partType: 'linear_actuator',
                    pin: pin,
                    directionPin: directionPin,
                    pwmPin: pwmPin,
                    rpwmPin: rpwmPin,
                    lpwmPin: lpwmPin,
                    controlBoard: board,
                    action: 'retract',
                    speed: speed,
                    duration: dur,
                    rawOutput: out,
                    message: parsed && parsed.message ? parsed.message : (success ? `Linear actuator retracting` : 'Actuator retract failed')
                };
            } catch (error) {
                return { success: false, partType: 'linear_actuator', pin, error: error.message };
            }
        },

        async stop({ pin, directionPin, pwmPin }) {
            try {
                const dirPin = (typeof directionPin === 'number') ? directionPin : (typeof pin === 'number' ? pin : parseInt(pin, 10));
                const pwm = (typeof pwmPin === 'number') ? pwmPin : (typeof pin === 'number' ? pin + 1 : parseInt(pin, 10) + 1);

                const out = await actuatorService.stopActuator({ directionPin: dirPin, pwmPin: pwm });
                const parsed = (() => {
                    try {
                        const lines = String(out).trim().split(/\r?\n/).filter(Boolean);
                        for (let i = lines.length - 1; i >= 0; i--) {
                            try { return JSON.parse(lines[i]); } catch (e) { /* continue */ }
                        }
                        return null;
                    } catch { return null; }
                })();
                const success = wrapperSucceeded(out, parsed);

                return {
                    success,
                    partType: 'linear_actuator',
                    pin: pin,
                    directionPin: dirPin,
                    pwmPin: pwm,
                    action: 'stop',
                    rawOutput: out,
                    message: parsed && parsed.message ? parsed.message : (success ? `Linear actuator (dir=${dirPin}, pwm=${pwm}) stopped` : 'Actuator stop failed')
                };
            } catch (error) {
                return { success: false, partType: 'linear_actuator', pin, error: error.message };
            }
        }
    },

    // 💡 Light - basic on/off lighting
    // Track light state per pin/channel for true toggle behavior
    _lightState: {},
    light: {
        async turnOn({ pin, channel, controllerType, address, brightness = 100, duration = 0 }) {
            try {
                // PCA9685 channel light: use servo_cli.py to set angle 180 (full duty = on)
                if (controllerType === 'pca9685' && channel != null) {
                    const args = ['move_to_pca', String(channel), '180'];
                    if (address != null) args.push(String(address));
                    const out = await runWrapper('servo_cli.py', args);
                    const success = wrapperSucceeded(out, parsePythonJSON(out));
                    const key = `pca_ch${channel}`;
                    if (success) HARDWARE_CONTROLLERS._lightState[key] = 'on';
                    return { success, partType: 'light', channel, state: 'on', rawOutput: out, message: success ? `PCA9685 ch${channel} light on` : 'Light on failed' };
                }
                const out = await runWrapper('light_cli.py', [String(pin), 'on', String(duration || 0)]);
                const parsed = parsePythonJSON(out);
                const success = wrapperSucceeded(out, parsed);
                if (success) HARDWARE_CONTROLLERS._lightState[pin] = 'on';
                return {
                    success,
                    partType: 'light',
                    pin: pin,
                    state: 'on',
                    brightness: brightness,
                    rawOutput: out,
                    message: parsed && parsed.message ? parsed.message : (success ? `Light on pin ${pin} turned on` : 'Light on failed')
                };
            } catch (error) {
                return { success: false, partType: 'light', pin: pin, error: error.message };
            }
        },

        async turnOff({ pin, channel, controllerType, address }) {
            try {
                // PCA9685 channel light: use servo_cli.py to set angle 0 (zero duty = off)
                if (controllerType === 'pca9685' && channel != null) {
                    const args = ['move_to_pca', String(channel), '0'];
                    if (address != null) args.push(String(address));
                    const out = await runWrapper('servo_cli.py', args);
                    const success = wrapperSucceeded(out, parsePythonJSON(out));
                    const key = `pca_ch${channel}`;
                    if (success) HARDWARE_CONTROLLERS._lightState[key] = 'off';
                    return { success, partType: 'light', channel, state: 'off', rawOutput: out, message: success ? `PCA9685 ch${channel} light off` : 'Light off failed' };
                }
                const out = await runWrapper('light_cli.py', [String(pin), 'off']);
                const parsed = parsePythonJSON(out);
                const success = wrapperSucceeded(out, parsed);
                if (success) HARDWARE_CONTROLLERS._lightState[pin] = 'off';
                return {
                    success,
                    partType: 'light',
                    pin: pin,
                    state: 'off',
                    rawOutput: out,
                    message: parsed && parsed.message ? parsed.message : (success ? `Light on pin ${pin} turned off` : 'Light off failed')
                };
            } catch (error) {
                return { success: false, partType: 'light', pin: pin, error: error.message };
            }
        },

        async toggle({ pin, channel, controllerType, address }) {
            try {
                // PCA9685 channel light: toggle via servo angle 0/180
                if (controllerType === 'pca9685' && channel != null) {
                    const key = `pca_ch${channel}`;
                    const currentState = HARDWARE_CONTROLLERS._lightState[key] || 'off';
                    const newState = currentState === 'on' ? 'off' : 'on';
                    const angle = newState === 'on' ? '180' : '0';
                    const args = ['move_to_pca', String(channel), angle];
                    if (address != null) args.push(String(address));
                    const out = await runWrapper('servo_cli.py', args);
                    const success = wrapperSucceeded(out, parsePythonJSON(out));
                    if (success) HARDWARE_CONTROLLERS._lightState[key] = newState;
                    return { success, partType: 'light', channel, state: newState, action: 'toggle', rawOutput: out, message: success ? `PCA9685 ch${channel} light ${newState}` : 'Light toggle failed' };
                }
                const currentState = HARDWARE_CONTROLLERS._lightState[pin] || 'off';
                const newState = currentState === 'on' ? 'off' : 'on';
                const out = await runWrapper('light_cli.py', [String(pin), newState, '0']);
                const parsed = parsePythonJSON(out);
                const success = wrapperSucceeded(out, parsed);
                if (success) HARDWARE_CONTROLLERS._lightState[pin] = newState;
                return {
                    success,
                    partType: 'light',
                    pin: pin,
                    state: newState,
                    action: 'toggle',
                    rawOutput: out,
                    message: parsed && parsed.message ? parsed.message : (success ? `Light on pin ${pin} turned ${newState}` : 'Light toggle failed')
                };
            } catch (error) {
                return { success: false, partType: 'light', pin: pin, error: error.message };
            }
        }
    },

    // 🔆 LED - PWM-controlled with brightness
    led: {
        async setBrightness({ pin, brightness, duration }) {
            if (brightness < 0 || brightness > 100) {
                throw new Error(`Invalid brightness: ${brightness}%. Must be 0-100%`);
            }
            const tryDigitalFallback = async () => {
                try {
                    const state = brightness > 0 ? 'on' : 'off';
                    const out2 = await runWrapper('light_cli.py', [String(pin), state, '0']);
                    const parsed2 = parsePythonJSON(out2);
                    const success2 = wrapperSucceeded(out2, parsed2);
                    return {
                        success: success2,
                        partType: 'led',
                        pin,
                        brightness,
                        rawOutput: out2,
                        message: (parsed2 && parsed2.message) || (success2
                            ? `LED on pin ${pin} set to ${brightness}% (digital on/off fallback)`
                            : 'LED command failed (digital fallback)')
                    };
                } catch (e2) {
                    return { success: false, partType: 'led', pin, error: e2.message };
                }
            };
            try {
                const args = [String(pin), String(brightness)];
                if (typeof duration === 'number') args.push(String(duration));
                const out = await runWrapper('led_cli.py', args);
                const parsed = parsePythonJSON(out);
                const success = wrapperSucceeded(out, parsed);
                if (!success) {
                    // PWM path failed; try a simple digital on/off as a real-hardware fallback
                    return await tryDigitalFallback();
                }
                return {
                    success,
                    partType: 'led',
                    pin: pin,
                    brightness: brightness,
                    rawOutput: out,
                    message: parsed && parsed.message ? parsed.message : `LED on pin ${pin} set to ${brightness}%`
                };
            } catch (error) {
                // If the primary path throws, attempt the digital fallback
                const fb = await tryDigitalFallback();
                if (fb.success) return fb;
                return { success: false, partType: 'led', pin: pin, error: error.message };
            }
        },

        async fade({ pin, fromBrightness, toBrightness, duration = 1000 }) {
            console.log(`🔆 LED Fade - Pin ${pin}: ${fromBrightness}% → ${toBrightness}% over ${duration}ms`);
            return {
                success: true,
                partType: 'led',
                pin: pin,
                fromBrightness: fromBrightness,
                toBrightness: toBrightness,
                duration: duration,
                message: `LED on pin ${pin} fading from ${fromBrightness}% to ${toBrightness}%`
            };
        },

        async blink({ pin, brightness = 100, onTime = 500, offTime = 500, cycles = 1 }) {
            console.log(`🔆 LED Blink - Pin ${pin}: ${cycles} cycles at ${brightness}%`);
            return {
                success: true,
                partType: 'led',
                pin: pin,
                brightness: brightness,
                onTime: onTime,
                offTime: offTime,
                cycles: cycles,
                message: `LED on pin ${pin} blinking ${cycles} times`
            };
        },

        async toggle({ pin }) {
            const currentState = HARDWARE_CONTROLLERS._lightState[pin] || 'off';
            const newState = currentState === 'on' ? 'off' : 'on';
            try {
                const out = await runWrapper('light_cli.py', [String(pin), newState, '0']);
                const parsed = parsePythonJSON(out);
                const success = wrapperSucceeded(out, parsed);
                if (success) HARDWARE_CONTROLLERS._lightState[pin] = newState;
                return {
                    success,
                    partType: 'led',
                    pin: pin,
                    state: newState,
                    action: 'toggle',
                    rawOutput: out,
                    message: parsed && parsed.message ? parsed.message : (success ? `LED on pin ${pin} turned ${newState}` : 'LED toggle failed')
                };
            } catch (error) {
                return { success: false, partType: 'led', pin: pin, error: error.message };
            }
        }
    },

    // 🦷 Servo - precise angle control: standard, continuous, feedback
    servo: {
        async moveToAngle({ partId, pin, channel, angleDeg, controllerType = 'gpio', address, servoType = 'standard' }) {
            try {
                // Normalize servoType to robustly route commands
                const st = String(servoType || '').toLowerCase();
                const normType = (st === 'cont' || st === 'cr') ? 'continuous'
                    : (st === 'positional' || st === 'position' || st === 'multi' || st === 'multi_turn' || st === 'multi-turn') ? 'feedback'
                        : (st || 'standard');

                if (controllerType === 'pca9685') {
                    let args, commandType;

                    // Route to appropriate function based on normalized servo type
                    if (normType === 'continuous') {
                        // For continuous servos, convert angle to direction/speed for rotation
                        // This is a fallback - continuous servos should use rotateContinuous action
                        const direction = angleDeg > 0 ? 'cw' : 'ccw';
                        const rawSpeed = Math.min(100, Math.abs(angleDeg));
                        const speedInt = Math.max(0, Math.min(100, Math.round(rawSpeed)));
                        args = ['rotate_continuous_pca', String(channel), direction, String(speedInt), '1000'];
                        commandType = 'continuous rotation';
                    } else if (normType === 'feedback') {
                        // Use multi-turn function for positional/feedback servos (supports 0-1800°)
                        args = ['move_to_pca_multi', String(channel), String(angleDeg)];
                        commandType = 'multi-turn positioning';
                    } else {
                        // Standard servo - use regular PCA9685 function (0-180°)
                        args = ['move_to_pca', String(channel), String(angleDeg)];
                        commandType = 'standard positioning';
                    }

                    if (address != null) args.push(String(address));

                    // Helpful debug
                    console.log(`🦷 Servo route: type=${servoType} (norm=${normType}), ctl=pca9685, ch=${channel}, addr=${address != null ? address : '0x40'}, angle=${angleDeg}`);

                    // Standard positioning goes through the shared servo daemon when it
                    // is up. This is the path the idle loop and head tracking hammer, and
                    // it was spawning a process per command — each of which re-initialised
                    // the PCA9685 and blanked every other channel. angleDeg has already
                    // been through applySafetyLimits() in controlPart(); the daemon only
                    // re-clamps to 0-180 on top.
                    if (normType !== 'continuous' && normType !== 'feedback') {
                        try {
                            await servoDaemonClient.ensureDaemon();
                            await servoDaemonClient.moveOne(channel, angleDeg, { address });
                            return {
                                success: true,
                                partType: 'servo',
                                channel,
                                angleDeg,
                                servoType: normType,
                                controllerType: 'pca9685',
                                viaDaemon: true,
                                message: `PCA9685 ch${channel} ${commandType} to ${angleDeg}°`
                            };
                        } catch (daemonErr) {
                            console.warn(`⚙️  Servo daemon unavailable for ch${channel} (${daemonErr.message}) — falling back to servo_cli.py`);
                        }
                    }

                    console.log(`🧭 Python call => servo_cli.py ${args.join(' ')}`);

                    const result = await runWrapper('servo_cli.py', args);
                    const success = wrapperSucceeded(result, parsePythonJSON(result));
                    return {
                        success,
                        partType: 'servo',
                        channel,
                        angleDeg,
                        servoType: normType,
                        controllerType: 'pca9685',
                        rawOutput: result,
                        message: success ? `PCA9685 ch${channel} ${commandType} to ${angleDeg}°` : `Servo command failed: ${result}`
                    };
                } else {
                    const result = await servoService.moveToAngle({ partId, angleDeg });

                    // Convert string result to structured response
                    const success = wrapperSucceeded(result, parsePythonJSON(result));

                    return {
                        success: success,
                        partType: 'servo',
                        pin: pin,
                        angleDeg: angleDeg,
                        controllerType: 'gpio',
                        rawOutput: result,
                        message: success ? `Servo on pin ${pin} moved to ${angleDeg}°` : `Servo command failed: ${result}`
                    };
                }
            } catch (error) {
                return {
                    success: false,
                    partType: 'servo',
                    pin: pin,
                    error: error.message
                };
            }
        },

        async rotateContinuous({ pin, channel, direction, speed, controllerType = 'gpio', address, servoType = 'continuous', duration = 1000, invertDirection = false }) {
            try {
                // Normalize direction based on optional invert flag
                const effectiveDirection = invertDirection
                    ? (direction === 'cw' ? 'ccw' : (direction === 'ccw' ? 'cw' : direction))
                    : direction;

                if (controllerType === 'pca9685') {
                    // All servo types can use rotate_continuous_pca for continuous rotation
                    // The function handles the appropriate pulse width ranges internally
                    const speedInt = Math.max(0, Math.min(100, Math.round(Number(speed) || 0)));
                    const durInt = Math.max(0, Math.round(Number(duration) || 0));
                    const args = ['rotate_continuous_pca', String(channel), String(effectiveDirection), String(speedInt), String(durInt)];
                    if (address != null) args.push(String(address));
                    const result = await runWrapper('servo_cli.py', args);
                    const success = wrapperSucceeded(result, parsePythonJSON(result));
                    return {
                        success,
                        partType: 'servo',
                        channel,
                        direction: effectiveDirection,
                        speed,
                        duration,
                        servoType,
                        controllerType: 'pca9685',
                        rawOutput: result,
                        message: success ? `PCA9685 ch${channel} ${servoType} servo ${effectiveDirection} at ${speed}%` : `Servo command failed: ${result}`
                    };
                } else {
                    // Pass duration through — it was dropped here, so the gpio branch
                    // always ran continuous servos for servo.js's default 1000ms
                    // regardless of the requested duration (which the response echoed).
                    const result = await servoService.rotateContinuous({ channel: pin, direction: effectiveDirection, speed, duration });

                    const success = wrapperSucceeded(result, parsePythonJSON(result));

                    return {
                        success: success,
                        partType: 'servo',
                        pin: pin,
                        direction: effectiveDirection,
                        speed: speed,
                        duration,
                        controllerType: 'gpio',
                        rawOutput: result,
                        message: success ? `Continuous servo on pin ${pin} rotating ${direction}` : `Servo command failed: ${result}`
                    };
                }
            } catch (error) {
                return {
                    success: false,
                    partType: 'servo',
                    pin: pin,
                    error: error.message
                };
            }
        },

        /**
         * jog: legacy calibration records (pre-v9.3 auto-created profiles) can
         * route a servo through the open-loop adapter, which speaks 'jog'.
         * Refusing outright produced "Action 'jog' not supported for part
         * type: servo" ×8 in one night on a continuous head servo — and left
         * that page with no working Stop. Map it onto the real primitives.
         */
        async jog({ pin, channel, direction, speed = 50, duration = 1000, controllerType = 'gpio', address, servoType = 'continuous', invertDirection = false }) {
            const dir = String(direction || '').toLowerCase();
            if (dir === 'stop') {
                return this.stop({ pin, channel, controllerType, address, servoType });
            }
            const rotation = (dir === 'cw' || dir === 'extend' || dir === 'forward') ? 'cw'
                : (dir === 'ccw' || dir === 'retract' || dir === 'reverse') ? 'ccw'
                    : null;
            if (!rotation) {
                return { success: false, partType: 'servo', channel, error: `Unsupported jog direction for a servo: ${direction}` };
            }
            return this.rotateContinuous({ pin, channel, direction: rotation, speed, duration, controllerType, address, servoType, invertDirection });
        },

        async stop({ pin, channel, controllerType = 'gpio', address, servoType = 'continuous' }) {
            try {
                if (controllerType === 'pca9685') {
                    // Use stop command which sets neutral pulse and optionally turns off PWM
                    const args = ['rotate_continuous_pca', String(channel), 'stop', '0', '100'];
                    if (address != null) args.push(String(address));
                    const result = await runWrapper('servo_cli.py', args);
                    const success = wrapperSucceeded(result, parsePythonJSON(result));
                    return {
                        success,
                        partType: 'servo',
                        channel,
                        servoType,
                        controllerType: 'pca9685',
                        rawOutput: result,
                        message: success ? `PCA9685 ch${channel} ${servoType} servo stopped` : `Servo stop failed: ${result}`
                    };
                } else {
                    const result = await servoService.stop({ channel: pin });

                    const success = wrapperSucceeded(result, parsePythonJSON(result));

                    return {
                        success: success,
                        partType: 'servo',
                        pin: pin,
                        controllerType: 'gpio',
                        rawOutput: result,
                        message: success ? `Servo on pin ${pin} stopped` : `Servo stop failed: ${result}`
                    };
                }
            } catch (error) {
                return {
                    success: false,
                    partType: 'servo',
                    pin: pin,
                    error: error.message
                };
            }
        }
    },


    // 🧭 Stepper - step/dir control (NEMA 17, etc.)
    stepper: {
        async moveSteps({ stepPin, dirPin, direction = 'cw', steps, stepDelayUs = 1000, enablePin }) {
            try {
                const out = await stepperService.moveSteps({ stepPin, dirPin, direction, steps, stepDelayUs, enablePin });
                const parsed = parsePythonJSON(out);
                const success = wrapperSucceeded(out, parsed);
                return {
                    success,
                    partType: 'stepper',
                    stepPin,
                    dirPin,
                    direction,
                    steps,
                    stepDelayUs,
                    enablePin,
                    rawOutput: out,
                    message: parsed && parsed.message ? parsed.message : (success ? `Stepper (${stepPin}/${dirPin}) ${direction} ${steps} steps` : 'Stepper move failed')
                };
            } catch (error) {
                return { success: false, partType: 'stepper', stepPin, dirPin, error: error.message };
            }
        },

        async rotate({ stepPin, dirPin, direction = 'cw', revolutions = 1, microstepping = 16, rpm = 60, enablePin }) {
            try {
                const out = await stepperService.rotate({ stepPin, dirPin, direction, revolutions, microstepping, rpm, enablePin });
                const parsed = parsePythonJSON(out);
                const success = wrapperSucceeded(out, parsed);
                return {
                    success,
                    partType: 'stepper',
                    stepPin,
                    dirPin,
                    direction,
                    revolutions,
                    microstepping,
                    rpm,
                    enablePin,
                    rawOutput: out,
                    message: parsed && parsed.message ? parsed.message : (success ? `Stepper (${stepPin}/${dirPin}) ${direction} ${revolutions} rev @ μ${microstepping}, ${rpm} RPM` : 'Stepper rotate failed')
                };
            } catch (error) {
                return { success: false, partType: 'stepper', stepPin, dirPin, error: error.message };
            }
        },

        async stop({ enablePin } = {}) {
            try {
                const out = await stepperService.stop({ enablePin });
                const parsed = parsePythonJSON(out);
                const success = wrapperSucceeded(out, parsed);
                return {
                    success,
                    partType: 'stepper',
                    enablePin,
                    rawOutput: out,
                    message: parsed && parsed.message ? parsed.message : (success ? 'Stepper stopped' : 'Stepper stop failed')
                };
            } catch (error) {
                return { success: false, partType: 'stepper', error: error.message };
            }
        }
    },



    // 🔍 Motion Sensor - PIR motion detection
    motion_sensor: {
        async read({ pin }) {
            try {
                const out = await runWrapper('sensor_cli.py', ['read', String(pin)]);
                const parsed = parsePythonJSON(out);
                const success = parsed ? parsed.status === 'success' : false;
                const value = parsed && typeof parsed.value !== 'undefined' ? parsed.value : undefined;
                const motionDetected = value === 1;
                return {
                    success,
                    partType: 'motion_sensor',
                    pin,
                    motionDetected,
                    rawOutput: out,
                    timestamp: new Date().toISOString(),
                    message: parsed && parsed.message ? parsed.message : (success ? `Motion: ${motionDetected ? 'detected' : 'none'}` : 'Motion read failed')
                };
            } catch (error) {
                return { success: false, partType: 'motion_sensor', pin, error: error.message };
            }
        },

        async detectMotion({ pin, duration = 10 }) {
            try {
                console.log(`🔍 Starting motion detection on pin ${pin} for ${duration}s`);
                const out = await runWrapper('motion_detect_cli.py', ['detect', String(pin), String(duration)]);
                const parsed = parsePythonJSON(out);
                const success = parsed ? parsed.status === 'success' || parsed.status === 'completed' : false;
                return {
                    success,
                    partType: 'motion_sensor',
                    pin,
                    duration,
                    detections: parsed && parsed.detections ? parsed.detections : 0,
                    rawOutput: out,
                    timestamp: new Date().toISOString(),
                    message: parsed && parsed.message ? parsed.message : (success ? `Motion detection completed: ${parsed.detections || 0} detections` : 'Motion detection failed')
                };
            } catch (error) {
                return { success: false, partType: 'motion_sensor', pin, duration, error: error.message };
            }
        },

        async startMonitoring({ pin, duration = 0 }) {
            try {
                console.log(`🔍 Starting continuous motion monitoring on pin ${pin}`);
                // This will be handled by streaming in the routes
                return {
                    success: true,
                    partType: 'motion_sensor',
                    pin,
                    duration,
                    message: `Motion monitoring started on pin ${pin}`
                };
            } catch (error) {
                return { success: false, partType: 'motion_sensor', pin, error: error.message };
            }
        },

        async stopMonitoring({ pin }) {
            try {
                console.log(`🛑 Stopping motion monitoring on pin ${pin}`);
                return {
                    success: true,
                    partType: 'motion_sensor',
                    pin,
                    message: `Motion monitoring stopped on pin ${pin}`
                };
            } catch (error) {
                return { success: false, partType: 'motion_sensor', pin, error: error.message };
            }
        },

        async setSensitivity({ pin, sensitivity }) {
            console.log(`🔍 Motion Sensor Sensitivity - Pin ${pin}: ${sensitivity}%`);
            return {
                success: true,
                partType: 'motion_sensor',
                pin: pin,
                sensitivity: sensitivity,
                message: `Motion sensor on pin ${pin} sensitivity set to ${sensitivity}%`
            };
        }
    },

    // 📹 Webcam - video capture devices
    webcam: {
        async capture({ deviceId = 0, resolution = '640x480' }) {
            try {
                const [w, h] = String(resolution).split('x').map(function (v) { return parseInt(v, 10); });
                const out = await runWrapper('webcam_cli.py', ['capture', String(deviceId), String(w || 640), String(h || 480)]);
                const parsed = parsePythonJSON(out);
                const success = parsed ? parsed.status === 'success' : false;
                return {
                    success: success,
                    partType: 'webcam',
                    deviceId: deviceId,
                    resolution: resolution,
                    filename: parsed && parsed.filename,
                    message: (parsed && parsed.message) || ('Webcam ' + deviceId + ' capture attempted')
                };
            } catch (err) {
                return { success: false, partType: 'webcam', deviceId: deviceId, resolution: resolution, error: String(err.message || err) };
            }
        },

        async listControls({ deviceId = 0 }) {
            try {
                const out = await runWrapper('webcam_cli.py', ['list_ctrls', String(deviceId)]);
                const parsed = parsePythonJSON(out);
                const success = parsed ? parsed.status === 'success' : false;
                return {
                    success: success,
                    partType: 'webcam',
                    deviceId: deviceId,
                    controls: parsed && parsed.controls,
                    rawOutput: parsed && parsed.rawOutput,
                    message: (parsed && parsed.message) || 'Listed controls'
                };
            } catch (err) {
                return { success: false, partType: 'webcam', deviceId: deviceId, error: String(err.message || err) };
            }
        },

        async setControls({ deviceId = 0, controls }) {
            try {
                // controls is an object { name: value, ... } -> build name=value pairs
                var kvPairs = [];
                Object.keys(controls || {}).forEach(function (name) {
                    var val = controls[name];
                    // v4l2-ctl expects booleans as 0/1 and strings need quotes removed
                    if (typeof val === 'boolean') val = val ? 1 : 0;
                    kvPairs.push(name + '=' + String(val));
                });
                const kv = kvPairs.join(',');
                const out = await runWrapper('webcam_cli.py', ['set_ctrls', String(deviceId), kv]);
                const parsed = parsePythonJSON(out);
                const success = parsed ? parsed.status === 'success' : false;
                return {
                    success: success,
                    partType: 'webcam',
                    deviceId: deviceId,
                    applied: controls,
                    rawOutput: parsed && parsed.rawOutput,
                    message: (parsed && parsed.message) || 'Controls applied'
                };
            } catch (err) {
                return { success: false, partType: 'webcam', deviceId: deviceId, error: String(err.message || err) };
            }
        },

        // Streaming is owned by the mjpg-streamer systemd service on :8090, which the
        // app proxies (webcamController.streamMJPEG) and the Fleet Command Center
        // consumes. This reports that service's REAL state rather than fabricating a
        // stream URL — a caller that gets success:true here can actually pull frames.
        async startStream({ deviceId = 0, resolution = '640x480', partId } = {}) {
            const probe = async () => {
                try {
                    const controller = new AbortController();
                    const timer = setTimeout(() => controller.abort(), 3000);
                    try {
                        const res = await fetch(`${MJPG_STREAMER_URL}/?action=snapshot`, { signal: controller.signal });
                        return res.ok;
                    } finally {
                        clearTimeout(timer);
                    }
                } catch (_) {
                    return false;
                }
            };

            let live = await probe();
            if (!live) {
                // The service may simply not be started yet; try once, then re-probe.
                try {
                    await new Promise((resolve) => {
                        const proc = spawn('systemctl', ['start', 'mjpg-streamer'], { stdio: 'ignore' });
                        proc.on('exit', resolve);
                        proc.on('error', resolve);
                    });
                    await new Promise(resolve => setTimeout(resolve, 1200));
                    live = await probe();
                } catch (_) { /* fall through to the honest failure below */ }
            }

            if (!live) {
                return {
                    success: false,
                    partType: 'webcam',
                    deviceId: deviceId,
                    error: 'mjpg-streamer is not serving frames on ' + MJPG_STREAMER_URL +
                           '. Start the service (systemctl start mjpg-streamer) or apply a device via /setup/calibration.'
                };
            }

            const proxyPath = partId != null
                ? `/setup/calibration/api/webcam/parts/${partId}/stream`
                : null;
            console.log('📹 Webcam stream available for device ' + deviceId);
            return {
                success: true,
                partType: 'webcam',
                deviceId: deviceId,
                resolution: resolution,
                streamUrl: proxyPath,
                directStreamUrl: MJPG_STREAM_ENDPOINT,
                snapshotUrl: `${MJPG_STREAMER_URL}/?action=snapshot`,
                serviceManaged: true,
                message: 'mjpg-streamer is serving frames; stream is available through the app proxy'
            };
        },

        // mjpg-streamer is a single shared service feeding the dashboard, the pose
        // editor and the fleet proxy. Stopping it for one caller would black out every
        // other consumer, so this detaches rather than killing the service, and says so.
        async stopStream({ deviceId = 0 } = {}) {
            console.log('📹 Webcam stream released - Device ' + deviceId);
            return {
                success: true,
                partType: 'webcam',
                deviceId: deviceId,
                serviceManaged: true,
                message: 'Released this consumer. mjpg-streamer stays running for other consumers; ' +
                         'stop it explicitly with systemctl if the camera must be freed.'
            };
        }
    },

    // 🎤 Microphone - audio input devices
    microphone: {
        // Real capture. Delegates to serverSTTListener.captureChunkWav — the one
        // canonical mic path (PipeWire source resolution + microphone_cli.py
        // record_wav) — instead of keeping a second, simulated implementation.
        async record({ deviceId = 'default', duration = 5000, format = 'wav' } = {}) {
            const durationSec = Math.max(0.1, Number(duration) / 1000);
            console.log(`🎤 Microphone Record - Device ${deviceId}: ${duration}ms as ${format}`);

            if (String(format).toLowerCase() !== 'wav') {
                return {
                    success: false,
                    partType: 'microphone',
                    deviceId: deviceId,
                    error: `Unsupported format '${format}'. The capture path produces WAV (PCM 16 kHz mono).`
                };
            }

            let buffer;
            try {
                const { default: serverSTTListener } = await import('../serverSTTListener.js');
                buffer = await serverSTTListener.captureChunkWav(deviceId, durationSec);
            } catch (err) {
                return {
                    success: false,
                    partType: 'microphone',
                    deviceId: deviceId,
                    error: `Capture failed: ${err.message}`
                };
            }

            // An empty buffer means the device produced nothing — report the failure
            // instead of the old unconditional success.
            if (!buffer || buffer.length === 0) {
                return {
                    success: false,
                    partType: 'microphone',
                    deviceId: deviceId,
                    duration: duration,
                    format: format,
                    bytes: 0,
                    error: 'No audio captured — check the microphone is connected and the PipeWire source is correct.'
                };
            }

            const filename = `recording_${Date.now()}.wav`;
            const filePath = path.join(os.tmpdir(), filename);
            try {
                await fs.writeFile(filePath, buffer);
            } catch (err) {
                return {
                    success: false,
                    partType: 'microphone',
                    deviceId: deviceId,
                    error: `Captured ${buffer.length} bytes but could not write ${filePath}: ${err.message}`
                };
            }

            return {
                success: true,
                partType: 'microphone',
                deviceId: deviceId,
                duration: duration,
                format: 'wav',
                filename: filename,
                filePath: filePath,
                bytes: buffer.length,
                message: `Captured ${buffer.length} bytes of audio from ${deviceId}`
            };
        },

        async getLevel({ deviceId = 'default', sampleRate = 16000, channels = 1, duration = 0.15 }) {
            if (process.env.MB_DEBUG_AUDIO === '1') console.log(`🎤 Getting level for PipeWire source: ${deviceId}`);

            async function probe(dev) {
                const out = await runWrapper('microphone_cli.py',
                    ['get_level', String(dev), String(sampleRate), String(channels), String(duration)],
                    { enableLogging: false, timeoutMs: 5000 });
                return parsePythonJSON(out);
            }

            try {
                let used = deviceId || 'default';
                let parsed = await probe(used);
                let fallbackUsed = false;

                if (!parsed || parsed.status !== 'success') {
                    // Try PipeWire/Pulse fallbacks
                    const fallbacks = ['default', 'pulse'].filter(d => String(d) !== String(used));
                    for (let i = 0; i < fallbacks.length; i++) {
                        try {
                            const p = await probe(fallbacks[i]);
                            if (p && p.status === 'success') {
                                parsed = p;
                                used = fallbacks[i];
                                fallbackUsed = true;
                                break;
                            }
                        } catch (_) { /* ignore */ }
                    }
                }

                const success = parsed ? parsed.status === 'success' : false;
                const level = parsed && (parsed.level || parsed.audio_level);

                return {
                    success,
                    partType: 'microphone',
                    deviceId: used,
                    level: level || 0,
                    timestamp: new Date().toISOString(),
                    message: (parsed && parsed.message) || `PipeWire microphone ${used} level: ${level || 0}`,
                    fallbackUsed,
                    sampleRate,
                    channels,
                    duration
                };
            } catch (err) {
                console.error(`🎤 Microphone level error:`, err.message);
                return {
                    success: false,
                    partType: 'microphone',
                    deviceId,
                    error: String(err.message || err),
                    level: 0
                };
            }
        }
    },

    // 🔊 Speaker - PipeWire audio output devices with stream routing
    speaker: {
        async play({ audioDeviceId, deviceId = 'default', filename, volume = 50, bass, treble, partId = null }) {
            try {
                console.log(`🔊 Playing ${filename} on PipeWire sink: ${audioDeviceId || deviceId}`);

                const args = ['play', String(filename)];
                if (typeof volume === 'number') args.push(String(volume));

                // Use PipeWire sink ID
                const dev = audioDeviceId || deviceId || 'default';
                if (dev !== undefined && dev !== null && String(dev) !== '') {
                    args.push('--device');
                    args.push(String(dev));
                }

                // Pass-through EQ placeholders
                if (typeof bass === 'number') { args.push('--bass'); args.push(String(bass)); }
                if (typeof treble === 'number') { args.push('--treble'); args.push(String(treble)); }

                const out = await runWrapper('speaker_cli.py', args);
                const parsed = parsePythonJSON(out);
                const success = parsed ? parsed.status === 'success' : false;

                let streamId = null;
                if (success && parsed.pid) {
                    // Register the stream for routing management
                    streamId = streamRoutingService.registerStream(parsed.pid, filename, dev, partId);
                }

                return {
                    success,
                    partType: 'speaker',
                    deviceId: dev,
                    filename,
                    volume,
                    pid: parsed && parsed.pid,
                    streamId: streamId,
                    player: parsed && parsed.player,
                    message: (parsed && parsed.message) || `PipeWire speaker ${dev} playing ${filename}`
                };
            } catch (err) {
                console.error(`🔊 Speaker play error:`, err.message);
                return {
                    success: false,
                    partType: 'speaker',
                    deviceId: audioDeviceId || deviceId,
                    filename,
                    error: String(err.message || err)
                };
            }
        },

        async setVolume({ audioDeviceId, deviceId = 'default', volume }) {
            if (volume < 0 || volume > 100) {
                throw new Error(`Invalid volume: ${volume}%. Must be 0-100%`);
            }
            try {
                console.log(`🔊 Setting volume ${volume}% for PipeWire sink: ${audioDeviceId || deviceId}`);

                const args = ['set_volume', String(volume)];
                const dev = audioDeviceId || deviceId || 'default';
                if (dev !== undefined && dev !== null && String(dev) !== '') {
                    args.push('--device');
                    args.push(String(dev));
                }

                const out = await runWrapper('speaker_cli.py', args);
                const parsed = parsePythonJSON(out);
                const success = parsed ? parsed.status === 'success' : false;

                return {
                    success,
                    partType: 'speaker',
                    deviceId: dev,
                    volume,
                    message: (parsed && parsed.message) || `PipeWire speaker ${dev} volume set to ${volume}%`
                };
            } catch (err) {
                console.error(`🔊 Speaker volume error:`, err.message);
                return {
                    success: false,
                    partType: 'speaker',
                    deviceId: audioDeviceId || deviceId,
                    error: String(err.message || err)
                };
            }
        },

        async stop({ audioDeviceId, deviceId = 'default', partId = null }) {
            try {
                console.log(`🔊 Stopping PipeWire speaker: ${audioDeviceId || deviceId}`);

                // Stop streams via routing service if partId provided
                if (partId) {
                    const results = await streamRoutingService.stopStreamsForPart(partId);
                    console.log(`🔊 Stopped ${results.length} streams for part ${partId}`);
                }

                const args = ['stop'];
                const dev = audioDeviceId || deviceId || 'default';
                if (dev !== undefined && dev !== null && String(dev) !== '') {
                    args.push('--device');
                    args.push(String(dev));
                }

                const out = await runWrapper('speaker_cli.py', args);
                const parsed = parsePythonJSON(out);
                const success = parsed ? parsed.status === 'success' : false;

                return {
                    success,
                    partType: 'speaker',
                    deviceId: dev,
                    message: (parsed && parsed.message) || `PipeWire speaker ${dev} stopped`
                };
            } catch (err) {
                console.error(`🔊 Speaker stop error:`, err.message);
                return {
                    success: false,
                    partType: 'speaker',
                    deviceId: audioDeviceId || deviceId,
                    error: String(err.message || err)
                };
            }
        },

        // New PipeWire stream routing functions
        async moveStream({ streamId, sinkId }) {
            try {
                console.log(`🔄 Moving stream ${streamId} to sink ${sinkId}`);
                const result = await streamRoutingService.moveStreamToSink(streamId, sinkId);
                return {
                    success: true,
                    partType: 'speaker',
                    streamId,
                    sinkId,
                    message: `Stream ${streamId} moved to ${sinkId}`
                };
            } catch (err) {
                console.error(`🔄 Stream move error:`, err.message);
                return {
                    success: false,
                    partType: 'speaker',
                    streamId,
                    sinkId,
                    error: String(err.message || err)
                };
            }
        },

        async listStreams({ partId = null }) {
            try {
                const streams = partId
                    ? streamRoutingService.getStreamsForPart(partId)
                    : streamRoutingService.getActiveStreams();

                return {
                    success: true,
                    partType: 'speaker',
                    streams: streams,
                    count: streams.length,
                    message: `Found ${streams.length} active streams`
                };
            } catch (err) {
                console.error(`🔊 List streams error:`, err.message);
                return {
                    success: false,
                    partType: 'speaker',
                    error: String(err.message || err),
                    streams: []
                };
            }
        },

        async getStreamStats() {
            try {
                const stats = streamRoutingService.getStreamStats();
                return {
                    success: true,
                    partType: 'speaker',
                    stats: stats,
                    message: `Stream statistics retrieved`
                };
            } catch (err) {
                console.error(`🔊 Stream stats error:`, err.message);
                return {
                    success: false,
                    partType: 'speaker',
                    error: String(err.message || err)
                };
            }
        }
    },

    // 🎯 Head Tracking - computer vision tracking
    head_tracking: {
        async startTracking({ cameraId = 0, trackingMode = 'face' }) {
            console.log(`🎯 Head Tracking Start - Camera ${cameraId}: ${trackingMode} mode`);
            return {
                success: true,
                partType: 'head_tracking',
                cameraId: cameraId,
                trackingMode: trackingMode,
                message: `Head tracking started on camera ${cameraId} in ${trackingMode} mode`
            };
        },

        async getPosition({ cameraId = 0 }) {
            try {
                const out = await runWrapper('head_tracking_cli.py', ['get_position', String(cameraId)]);
                const parsed = parsePythonJSON(out);
                const success = parsed ? parsed.status === 'success' : false;
                return {
                    success,
                    partType: 'head_tracking',
                    cameraId,
                    position: parsed && parsed.position,
                    timestamp: new Date().toISOString(),
                    message: (parsed && parsed.message) || `Head position read`
                };
            } catch (err) {
                return { success: false, partType: 'head_tracking', cameraId, error: String(err.message || err) };
            }
        },

        async stopTracking({ cameraId = 0 }) {
            console.log(`🎯 Head Tracking Stop - Camera ${cameraId}`);
            return {
                success: true,
                partType: 'head_tracking',
                cameraId: cameraId,
                message: `Head tracking stopped on camera ${cameraId}`
            };
        }
    },

    // 🎵 PipeWire Audio System Integration
    pipewire: {
        async listSinks() {
            try {
                const sinks = await pipewireService.listSinks();
                return {
                    success: true,
                    partType: 'pipewire',
                    sinks: sinks,
                    count: sinks.length,
                    message: `Found ${sinks.length} PipeWire sinks`
                };
            } catch (err) {
                console.error(`🎵 PipeWire list sinks error:`, err.message);
                return {
                    success: false,
                    partType: 'pipewire',
                    error: String(err.message || err),
                    sinks: []
                };
            }
        },

        async listSources() {
            try {
                const sources = await pipewireService.listSources();
                return {
                    success: true,
                    partType: 'pipewire',
                    sources: sources,
                    count: sources.length,
                    message: `Found ${sources.length} PipeWire sources`
                };
            } catch (err) {
                console.error(`🎵 PipeWire list sources error:`, err.message);
                return {
                    success: false,
                    partType: 'pipewire',
                    error: String(err.message || err),
                    sources: []
                };
            }
        },

        async checkAvailability() {
            try {
                const tools = await pipewireService.checkPipeWireAvailability();
                return {
                    success: true,
                    partType: 'pipewire',
                    tools: tools,
                    message: 'PipeWire availability checked'
                };
            } catch (err) {
                console.error(`🎵 PipeWire availability check error:`, err.message);
                return {
                    success: false,
                    partType: 'pipewire',
                    error: String(err.message || err),
                    tools: {}
                };
            }
        },

        async setDefaultSink({ sinkId }) {
            try {
                const result = await pipewireService.setDefaultSink(sinkId);
                return {
                    success: result.success,
                    partType: 'pipewire',
                    sinkId: sinkId,
                    message: result.success ? `Default sink set to ${sinkId}` : result.error
                };
            } catch (err) {
                console.error(`🎵 Set default sink error:`, err.message);
                return {
                    success: false,
                    partType: 'pipewire',
                    sinkId: sinkId,
                    error: String(err.message || err)
                };
            }
        },

        async setDefaultSource({ sourceId }) {
            try {
                const result = await pipewireService.setDefaultSource(sourceId);
                return {
                    success: result.success,
                    partType: 'pipewire',
                    sourceId: sourceId,
                    message: result.success ? `Default source set to ${sourceId}` : result.error
                };
            } catch (err) {
                console.error(`🎵 Set default source error:`, err.message);
                return {
                    success: false,
                    partType: 'pipewire',
                    sourceId: sourceId,
                    error: String(err.message || err)
                };
            }
        }
    }
};

/**
 * Control hardware part by ID
 * @param {string} partId - Part ID
 * @param {string} action - Action to perform
 * @param {Object} params - Action parameters
 * @returns {Promise<Object>} - Control result
 */
export async function controlPart(partId, action, params = {}, options = {}) {
    try {
        // Prefer the caller's character. Falling back to selectedCharacter on disk is
        // genuinely dangerous: that value is global mutable state other processes
        // rewrite mid-session, and part IDs are only unique WITHIN a character. A
        // "part 4" command resolved against the wrong character has been observed
        // driving a completely different PCA9685 channel on the physical board.
        // Callers that know their character must pass options.characterId.
        const cfg = await readConfig();
        const appRoot = path.resolve(__dirname, '../..');
        const characterId = options.characterId != null
            ? options.characterId
            : (cfg && cfg.selectedCharacter);

        let parts = [];
        let part = null;

        // Try character-specific parts file using selectedCharacter
        if (characterId) {
            try {
                const characterPartsPath = path.resolve(appRoot, `data/character-${characterId}`, 'parts.json');
                const partsData = await fs.readFile(characterPartsPath, 'utf8');
                parts = JSON.parse(partsData);
                part = parts.find(p => String(p.id) === String(partId));
            } catch (e) {
                // Character parts file doesn't exist, will try fallback
            }
        }

        // Fall back to dataPath-based parts.json
        if (!part) {
            try {
                const dataDir = cfg && cfg.dataPath ? cfg.dataPath : 'data';
                const partsPath = path.resolve(appRoot, dataDir, 'parts.json');
                const partsData = await fs.readFile(partsPath, 'utf8');
                parts = JSON.parse(partsData);
                part = parts.find(p => String(p.id) === String(partId));
            } catch (e) {
                // Fallback parts file doesn't exist
            }
        }

        if (!part) {
            throw new Error(`Part ${partId} not found`);
        }

        // Normalize type to underscore style for controller lookup
        const type = (part.type || '').replace(/\-/g, '_');
        const controller = HARDWARE_CONTROLLERS[type];
        if (!controller) {
            throw new Error(`No controller found for part type: ${part.type}`);
        }

        const actionFunction = controller[action];
        if (!actionFunction) {
            throw new Error(`Action '${action}' not supported for part type: ${part.type}`);
        }

        // Normalize legacy part fields and merge with action parameters
        const pinFromPart = (part.pin != null)
            ? part.pin
            : (part.gpioPin != null
                ? (typeof part.gpioPin === 'string' ? parseInt(part.gpioPin, 10) : part.gpioPin)
                : undefined);

        const normalized = Object.assign({}, part.config || {});

        if (type === 'servo') {
            // Respect PCA9685 configuration whether specified at root or in part.config
            const rootCtl = part.controllerType;
            const cfgCtl = part.config && part.config.controllerType;
            if (part.usePCA9685 === true || rootCtl === 'pca9685' || cfgCtl === 'pca9685') {
                normalized.controllerType = 'pca9685';
                // Channel/address can be provided either at root or within config
                if (part.channel != null) normalized.channel = part.channel;
                if (part.config && part.config.channel != null) normalized.channel = part.config.channel;
                const addrRaw = (part.pca9685Settings && part.pca9685Settings.address) || (part.config && part.config.address);
                if (addrRaw != null) {
                    normalized.address = (typeof addrRaw === 'string' && String(addrRaw).startsWith('0x')) ? parseInt(String(addrRaw), 16) : addrRaw;
                }
            }
        }
        if (type === 'linear_actuator') {
            // MDD10A/Cytron pins
            if (part.directionPin != null) normalized.directionPin = Number(part.directionPin);
            if (part.pwmPin != null) normalized.pwmPin = Number(part.pwmPin);
            // BTS7960 pins
            if (part.rpwmPin != null) normalized.rpwmPin = Number(part.rpwmPin);
            if (part.lpwmPin != null) normalized.lpwmPin = Number(part.lpwmPin);
            if (part.renPin != null) normalized.renPin = Number(part.renPin);
            if (part.lenPin != null) normalized.lenPin = Number(part.lenPin);
            // Board type and limits
            if (part.controlBoard != null) normalized.controlBoard = part.controlBoard;
            if (part.maxExtension != null) normalized.maxExtension = Number(part.maxExtension);
            if (part.maxRetraction != null) normalized.maxRetraction = Number(part.maxRetraction);
            // Per-part direction inversion for actuators wired with reversed polarity
            if (part.invertDirection != null) normalized.invertDirection = !!part.invertDirection;
            if (part.config && part.config.invertDirection != null) normalized.invertDirection = !!part.config.invertDirection;
        }
        if (type === 'motor') {
            // MDD10A/Cytron pins
            if (part.directionPin != null) normalized.directionPin = Number(part.directionPin);
            if (part.pwmPin != null) normalized.pwmPin = Number(part.pwmPin);
            // BTS7960 pins (same as linear actuator)
            if (part.rpwmPin != null) normalized.rpwmPin = Number(part.rpwmPin);
            if (part.lpwmPin != null) normalized.lpwmPin = Number(part.lpwmPin);
            if (part.renPin != null) normalized.renPin = Number(part.renPin);
            if (part.lenPin != null) normalized.lenPin = Number(part.lenPin);
            // Board type and limits
            if (part.controlBoard != null) normalized.controlBoard = part.controlBoard;
            if (part.maxDuration != null) normalized.maxDuration = Number(part.maxDuration);
        }
        if (type === 'stepper') {
            // Normalize pins for stepper: prefer explicit stepPin/dirPin; else derive from base pin
            if (part.stepPin != null) normalized.stepPin = Number(part.stepPin);
            if (part.dirPin != null) normalized.dirPin = Number(part.dirPin);
            if (normalized.stepPin == null && normalized.dirPin == null && pinFromPart != null) {
                const base = Number(pinFromPart);
                normalized.stepPin = base;
                normalized.dirPin = base + 1;
            }
            if (part.enablePin != null) normalized.enablePin = Number(part.enablePin);
        }
        if (type === 'light' || type === 'led') {
            // PCA9685 channel light support (e.g., laser powered by PCA9685)
            const cfgCtl = part.config && part.config.controllerType;
            if (cfgCtl === 'pca9685') {
                normalized.controllerType = 'pca9685';
                if (part.config && part.config.channel != null) normalized.channel = part.config.channel;
                const addrRaw = part.config && part.config.address;
                if (addrRaw != null) {
                    normalized.address = (typeof addrRaw === 'string' && String(addrRaw).startsWith('0x')) ? parseInt(String(addrRaw), 16) : addrRaw;
                }
            } else if (pinFromPart == null && part.gpioPin != null) {
                normalized.pin = (typeof part.gpioPin === 'string' ? parseInt(part.gpioPin, 10) : part.gpioPin);
            }
        }
        if ((type === 'sensor' || type === 'motion_sensor') && pinFromPart == null) {
            if (part.gpioPin != null) normalized.pin = (typeof part.gpioPin === 'string' ? parseInt(part.gpioPin, 10) : part.gpioPin);
        }

        // Merge order: model defaults < part config < explicit params
        const modelDefaults = await getModelDefaultsForPart(part);

        const actionParams = Object.assign({}, modelDefaults, normalized, params, {
            partId: part.id,
            pin: pinFromPart
        });

        // Stepper convenience: convert 'speed' (steps/sec) -> stepDelayUs if not provided
        if (type === 'stepper' && action === 'moveSteps') {
            if ((actionParams.stepDelayUs == null || isNaN(Number(actionParams.stepDelayUs))) && actionParams.speed != null) {
                const s = Math.max(1, Number(actionParams.speed));
                actionParams.stepDelayUs = Math.max(200, Math.round(1_000_000 / s));
            }
        }

        // Safety limits: clamp the command to what this part can physically survive
        // before it ever reaches the controller. The calibration profile is loaded
        // once here and reused by the invert step below.
        let calProfile = null;
        try {
            calProfile = await getCalibrationStore().get(partId, characterId);
        } catch (_) { /* uncalibrated part — configured safety limits still apply */ }

        const safety = await getPartSafety(characterId, partId, calProfile);
        // options.calibrationOverride: supervised-calibration mode from the
        // calibration endpoints only — relaxes the angle window and duration
        // cap so an operator can measure real travel; quarantines, retract
        // blocks, speed caps and power groups still apply (see safetyLimits).
        const limited = applySafetyLimits({
            type, action, params: actionParams, profile: calProfile, safety, partId,
            calibrationOverride: options.calibrationOverride === true
        });
        if (limited.blocked) {
            console.warn(`🛑 Safety limit blocked ${action} on part ${partId} (${part.name}): ${limited.blocked}`);
            return {
                success: false,
                partId,
                partName: part.name,
                action,
                error: limited.blocked,
                blockedBySafetyLimit: true
            };
        }
        if (limited.adjustments.length > 0) {
            console.warn(`🛡️  Safety limits applied to part ${partId} (${part.name}): ${limited.adjustments.join('; ')}`);
        }
        Object.assign(actionParams, limited.params);
        // Return the adjustments too, not just log them. Callers were reporting the
        // REQUESTED value back to the operator with clamped:false, so a servo that
        // the safety layer moved to 60 was displayed as sitting at 45. A confident
        // wrong number is worse than a blank field.
        const safetyAdjustments = limited.adjustments;

        // System-wide servo invert: mirror angle within calibrated bounds
        // Uses (minAngle + maxAngle - angle) so the servo stays within its calibrated range.
        // Without bounds, falls back to (0 + 180 - angle) = legacy 180-angle behavior.
        // An autoGenerated placeholder profile carries exactly 0/180, so it yields that
        // same legacy result — no autoGenerated guard is needed here.
        if (type === 'servo' && action === 'moveToAngle' && actionParams.angleDeg != null) {
            if (calProfile && calProfile.capability && calProfile.capability.invert) {
                const minA = calProfile.bounds?.minAngle ?? 0;
                const maxA = calProfile.bounds?.maxAngle ?? 180;
                actionParams.angleDeg = minA + maxA - actionParams.angleDeg;
            }
        }

        console.log(`🔧 Calling ${action} on ${type} controller with params:`, { speed: actionParams.speed, duration: actionParams.duration, direction: actionParams.direction });
        // Parts sharing a fused rail are serialized so they are never energized together.
        const result = await runInPowerGroup(characterId, safety, () => actionFunction.call(controller, actionParams));
        console.log(`🔧 Controller ${action} completed`);

        // Fold in anything the wrapper narrowed on its own so the operator sees
        // every clamp, not just the ones this layer made.
        const wrapperClamps = extractWrapperClamps(result);
        if (wrapperClamps.length > 0) {
            console.warn(`🛡️  Wrapper safety limits applied to part ${partId} (${part.name}): ${wrapperClamps.join('; ')}`);
            safetyAdjustments.push(...wrapperClamps);
        }

        return {
            ...result,
            partId: partId,
            partName: part.name,
            action: action,
            safetyAdjustments,
            clamped: safetyAdjustments.length > 0,
            // The value actually sent to the hardware, whatever was requested.
            appliedParams: { angleDeg: actionParams.angleDeg, speed: actionParams.speed, duration: actionParams.duration }
        };

    } catch (error) {
        console.error(`Error controlling part ${partId}:`, error);
        return {
            success: false,
            partId: partId,
            action: action,
            error: error.message
        };
    }
}

/**
 * Get available actions for a part type
 * @param {string} partType - Part type
 * @returns {Array<string>} - Available actions
 */
export function getAvailableActions(partType) {
    const key = (partType || '').replace(/\-/g, '_');
    const controller = HARDWARE_CONTROLLERS[key];
    if (!controller) {
        return [];
    }

    return Object.keys(controller);
}

/**
 * Get all supported part types
 * @returns {Array<string>} - Supported part types
 */
export function getSupportedPartTypes() {
    return Object.keys(HARDWARE_CONTROLLERS);
}

// Initialize PipeWire stream routing service
streamRoutingService.startPeriodicCleanup(30000); // Clean up dead streams every 30 seconds

/**
 * Global Power Control
 * @param {boolean} state - True for ON, False for OFF
 */
export async function setPower(state) {
    try {
        const scriptPath = path.resolve(__dirname, '../../scripts/set_power.py');
        // runPy, not runWrapper: runWrapper resolves its first argument against
        // python_wrappers/, so passing 'python3' invoked the interpreter on a
        // non-existent python_wrappers/python3 and set_power.py never ran.
        await runPy([scriptPath, state ? 'on' : 'off']);
        return { success: true, state };
    } catch(err) {
        console.error("Set Power Error", err);
        return { success: false, error: err.message };
    }
}

/**
 * Batch move multiple PCA9685 servos in a single Python call.
 * Avoids repeated subprocess spawn overhead for multi-servo poses.
 * @param {Array<{partId: string|number, angleDeg: number}>} commands
 * @returns {Promise<{success: boolean, results: Array}>}
 */
export async function batchMoveServos(commands, options = {}) {
    if (!commands || commands.length === 0) return { success: true, results: [] };

    // Same rule as controlPart: the caller's character wins over the mutable
    // selectedCharacter on disk, because part IDs are only unique within a character.
    const cfg = await readConfig();
    const appRoot = path.resolve(__dirname, '../..');
    const characterId = options.characterId != null
        ? options.characterId
        : (cfg && cfg.selectedCharacter);

    // Load parts once
    let parts = [];
    try {
        const charPartsPath = path.resolve(appRoot, `data/character-${characterId}`, 'parts.json');
        parts = JSON.parse(await fs.readFile(charPartsPath, 'utf8'));
    } catch (_) {
        try {
            const dataDir = cfg && cfg.dataPath ? cfg.dataPath : 'data';
            parts = JSON.parse(await fs.readFile(path.resolve(appRoot, dataDir, 'parts.json'), 'utf8'));
        } catch (_2) {}
    }

    // Load calibration once
    const calStore = getCalibrationStore();

    // Build batch pairs for PCA9685 servos, fall back to individual for others.
    // Parts on a shared power rail are pulled OUT of the batch: a single batch_pca
    // call moves every listed channel at once, which is exactly the simultaneous
    // inrush that pops a shared fuse. They are issued serially instead.
    const pcaPairs = [];
    const fallbackCmds = [];
    const serializedCmds = [];
    const blockedResults = [];

    // Part types that support moveToAngle
    const servoTypes = new Set(['servo', 'continuous_servo', 'continuous-servo']);

    for (const cmd of commands) {
        const part = parts.find(p => String(p.id) === String(cmd.partId));
        if (!part) continue;

        // Skip non-servo parts — they don't support moveToAngle
        const partType = (part.type || '').replace(/-/g, '_');
        if (!servoTypes.has(partType) && !servoTypes.has(part.type)) continue;

        const partCfg = part.config || {};
        const isPCA = partCfg.controllerType === 'pca9685' || part.usePCA9685 === true ||
                       part.controllerType === 'pca9685' || partCfg.address != null || partCfg.channel != null;

        let profile = null;
        try {
            profile = await calStore.get(cmd.partId, characterId);
        } catch (_) { /* uncalibrated — configured safety limits still apply */ }

        // Same safety envelope the single-part path enforces.
        const safety = await getPartSafety(characterId, cmd.partId, profile);
        const limited = applySafetyLimits({
            type: partType, action: 'moveToAngle',
            params: { angleDeg: cmd.angleDeg }, profile, safety, partId: cmd.partId
        });
        if (limited.blocked) {
            console.warn(`🛑 Safety limit blocked batch move on part ${cmd.partId} (${part.name}): ${limited.blocked}`);
            blockedResults.push({ success: false, partId: cmd.partId, error: limited.blocked, blockedBySafetyLimit: true });
            continue;
        }
        if (limited.adjustments.length > 0) {
            console.warn(`🛡️  Safety limits applied to part ${cmd.partId} (${part.name}): ${limited.adjustments.join('; ')}`);
        }

        if (isPCA && partCfg.channel != null) {
            let angle = limited.params.angleDeg;
            // Apply invert if needed
            if (profile && profile.capability && profile.capability.invert) {
                const minA = profile.bounds?.minAngle ?? 0;
                const maxA = profile.bounds?.maxAngle ?? 180;
                angle = minA + maxA - angle;
            }
            // Carry the effective window down to the daemon as a backstop. This
            // is the SAME window applySafetyLimits just enforced (configured
            // limits intersected with real, non-placeholder calibration), so it
            // can only re-clamp — never widen — what was already decided above.
            const boundsMin = isPlaceholderProfile(profile) ? null : profile?.bounds?.minAngle;
            const boundsMax = isPlaceholderProfile(profile) ? null : profile?.bounds?.maxAngle;
            const windowMin = [safety.minAngle, boundsMin].filter(v => v != null).reduce((a, b) => Math.max(a, b), -Infinity);
            const windowMax = [safety.maxAngle, boundsMax].filter(v => v != null).reduce((a, b) => Math.min(a, b), Infinity);

            const pair = {
                channel: partCfg.channel,
                angle,
                partId: cmd.partId,
                safety,
                address: partCfg.address,
                min: Number.isFinite(windowMin) ? windowMin : null,
                max: Number.isFinite(windowMax) ? windowMax : null
            };
            if (safety.powerGroup) serializedCmds.push(pair);
            else pcaPairs.push(pair);
        } else {
            fallbackCmds.push(Object.assign({}, cmd, { angleDeg: limited.params.angleDeg }));
        }
    }

    const results = [...blockedResults];

    // Batch PCA9685 command.
    //
    // Preferred path is the shared servo daemon: one long-lived process owns the
    // I2C bus, so the chip is never re-initialised and every channel in this
    // batch is written back-to-back under one lock (~0.3ms apart) instead of
    // being blanked by the next command's chip reset. Spawning servo_cli.py per
    // batch is kept as the fallback for when the daemon is not up.
    if (pcaPairs.length > 0) {
        const daemonMoves = pcaPairs.map(p => ({
            channel: p.channel, angle: p.angle, min: p.min, max: p.max
        }));
        let dispatched = false;

        try {
            await servoDaemonClient.ensureDaemon();
            const daemonResults = await servoDaemonClient.moveMany(daemonMoves, {
                address: pcaPairs[0].address
            });
            dispatched = true;
            for (let i = 0; i < pcaPairs.length; i++) {
                const p = pcaPairs[i];
                const r = daemonResults[i];
                results.push({
                    success: !r || r.status === 'success',
                    partId: p.partId,
                    angleDeg: r && r.angle != null ? r.angle : p.angle,
                    batch: true,
                    viaDaemon: true,
                    ...(r && r.status === 'error' ? { error: r.error } : {})
                });
            }
        } catch (daemonErr) {
            console.warn(`⚙️  Servo daemon unavailable for batch (${daemonErr.message}) — falling back to servo_cli.py`);
        }

        if (!dispatched) {
            try {
                const args = pcaPairs.map(p => `${p.channel}:${p.angle}`);
                const out = await runWrapper('servo_cli.py', ['batch_pca', ...args]);
                const parsed = parsePythonJSON(out);
                const success = wrapperSucceeded(out, parsed);
                // The wrapper reports each channel separately, and its own safety
                // backstop can refuse one channel while the rest of the pose moves.
                // Reporting the batch's overall verdict for every part hid that.
                const perChannel = new Map(
                    (parsed && Array.isArray(parsed.data?.results) ? parsed.data.results : [])
                        .map(r => [String(r.channel), r])
                );
                for (const p of pcaPairs) {
                    const r = perChannel.get(String(p.channel));
                    results.push({
                        success: r ? r.status === 'success' : success,
                        partId: p.partId,
                        angleDeg: r && r.angle != null ? r.angle : p.angle,
                        batch: true,
                        ...(r && r.status === 'error' ? { error: r.error } : {})
                    });
                }
            } catch (e) {
                for (const p of pcaPairs) {
                    results.push({ success: false, partId: p.partId, error: e.message });
                }
            }
        }
    }

    // Power-grouped servos: one at a time, with the group's cooldown between them,
    // so a pose that touches both ends of a fused rail can never energize them together.
    // These deliberately do NOT join the batch above — the whole point of the group
    // is that its members are never commanded in the same breath.
    for (const p of serializedCmds) {
        try {
            const out = await runInPowerGroup(characterId, p.safety, async () => {
                try {
                    await servoDaemonClient.ensureDaemon();
                    await servoDaemonClient.moveMany(
                        [{ channel: p.channel, angle: p.angle, min: p.min, max: p.max }],
                        { address: p.address }
                    );
                    return 'daemon:ok';
                } catch (daemonErr) {
                    console.warn(`⚙️  Servo daemon unavailable for part ${p.partId} (${daemonErr.message}) — falling back to servo_cli.py`);
                    return runWrapper('servo_cli.py', ['batch_pca', `${p.channel}:${p.angle}`]);
                }
            });
            const success = out === 'daemon:ok' || wrapperSucceeded(out, parsePythonJSON(out));
            results.push({ success, partId: p.partId, angleDeg: p.angle, serialized: true });
        } catch (e) {
            results.push({ success: false, partId: p.partId, error: e.message, serialized: true });
        }
    }

    // Fallback individual commands for non-PCA9685 servos
    for (const cmd of fallbackCmds) {
        try {
            // Carry the character here too — same class of bug as the batch path above.
            const r = await controlPart(String(cmd.partId), 'moveToAngle', { angleDeg: cmd.angleDeg }, { characterId });
            results.push({ ...r, partId: cmd.partId });
        } catch (e) {
            results.push({ success: false, partId: cmd.partId, error: e.message });
        }
    }

    return { success: results.some(r => r.success), results };
}

export default {
    controlPart,
    batchMoveServos,
    setPower,
    getAvailableActions,
    getSupportedPartTypes,
    HARDWARE_CONTROLLERS,
    pipewireService,
    streamRoutingService
};
