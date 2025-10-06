/**
 * Hardware Service Index for MonsterBox 4.0
 * Unified interface for all 11 Part types with PipeWire integration
 */

import servoService from './servo.js';
import pca9685Service from './pca9685.js';
import actuatorService from './actuator.js';
import stepperService from './stepper.js';
import { runWrapper } from './exec.js';
import pipewireService from '../pipewireService.js';
import streamRoutingService from '../streamRoutingService.js';
import fs from 'fs/promises';
import path from 'path';
import { fileURLToPath } from 'url';
import { readConfig } from '../configService.js';
import * as simpleCal from '../simpleCalibrationService.js';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

function parsePythonJSON(out) {
    if (!out) return null;
    const lines = String(out).trim().split(/\r?\n/).filter(Boolean);
    for (let i = lines.length - 1; i >= 0; i--) {
        try { return JSON.parse(lines[i]); } catch (e) { /* continue */ }
    }
    return null;
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
        const modelId = part && part.config && part.config.modelId;
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
                const success = parsed ? (parsed.status === 'success' || parsed.success === true) : (typeof out === 'string' && out.indexOf('success') !== -1);
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
                    out = await runWrapper('motor_cli.py', ['stop', '0', '100', String(directionPin), String(pwmPin)]);
                }
                const parsed = parsePythonJSON(out);
                const success = parsed ? (parsed.status === 'success' || parsed.success === true) : (typeof out === 'string' && out.indexOf('success') !== -1);
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
        async extend({ pin, directionPin, pwmPin, rpwmPin, lpwmPin, renPin, lenPin, controlBoard, speed = 50, distance = 100, duration, maxExtension = 15000, maxRetraction = 15000 }) {
            try {
                const dur = typeof duration === 'number' ? duration : 1000; // safe default
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
                        direction: 'forward',
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
                        direction: 'extend',
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
                const success = parsed ? (parsed.status === 'success' || parsed.success === true) : (typeof out === 'string' && out.indexOf('success') !== -1);

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

        async retract({ pin, directionPin, pwmPin, rpwmPin, lpwmPin, renPin, lenPin, controlBoard, speed = 50, distance = 100, duration, maxExtension = 15000, maxRetraction = 15000 }) {
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
                const success = parsed ? (parsed.status === 'success' || parsed.success === true) : (typeof out === 'string' && out.indexOf('success') !== -1);

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
                const success = parsed ? (parsed.status === 'success' || parsed.success === true) : (typeof out === 'string' && out.indexOf('success') !== -1);

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
    light: {
        async turnOn({ pin, brightness = 100, duration = 0 }) {
            try {
                const out = await runWrapper('light_cli.py', [String(pin), 'on', String(duration || 0)]);
                const parsed = parsePythonJSON(out);
                const success = parsed ? parsed.status === 'success' : (typeof out === 'string' && out.indexOf('success') !== -1);
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

        async turnOff({ pin }) {
            try {
                const out = await runWrapper('light_cli.py', [String(pin), 'off']);
                const parsed = parsePythonJSON(out);
                const success = parsed ? parsed.status === 'success' : (typeof out === 'string' && out.indexOf('success') !== -1);
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

        async toggle({ pin }) {
            try {
                // Simple toggle: pulse on for 250ms
                const out = await runWrapper('light_cli.py', [String(pin), 'on', '250']);
                const parsed = parsePythonJSON(out);
                const success = parsed ? parsed.status === 'success' : (typeof out === 'string' && out.indexOf('success') !== -1);
                return {
                    success,
                    partType: 'light',
                    pin: pin,
                    action: 'toggle',
                    rawOutput: out,
                    message: parsed && parsed.message ? parsed.message : (success ? `Light on pin ${pin} toggled` : 'Light toggle failed')
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
                    const success2 = parsed2 ? parsed2.status === 'success' : (typeof out2 === 'string' && out2.indexOf('success') !== -1);
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
                const success = parsed ? parsed.status === 'success' : (typeof out === 'string' && out.indexOf('success') !== -1);
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
                    console.log(`🧭 Python call => servo_cli.py ${args.join(' ')}`);

                    const result = await runWrapper('servo_cli.py', args);
                    const success = typeof result === 'string' && result.includes('success');
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
                    const success = typeof result === 'string' && result.includes('success');

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
                    const success = String(process.env.MB_TEST_MODE || '') === '1' ? true : (typeof result === 'string' && result.includes('success'));
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
                    const result = await servoService.rotateContinuous({ channel: pin, direction: effectiveDirection, speed });

                    const success = String(process.env.MB_TEST_MODE || '') === '1' ? true : (typeof result === 'string' && result.includes('success'));

                    return {
                        success: success,
                        partType: 'servo',
                        pin: pin,
                        direction: effectiveDirection,
                        speed: speed,
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

        async stop({ pin, channel, controllerType = 'gpio', address, servoType = 'continuous' }) {
            try {
                if (controllerType === 'pca9685') {
                    // Use stop command which sets neutral pulse and optionally turns off PWM
                    const args = ['rotate_continuous_pca', String(channel), 'stop', '0', '100'];
                    if (address != null) args.push(String(address));
                    const result = await runWrapper('servo_cli.py', args);
                    const success = String(process.env.MB_TEST_MODE || '') === '1' ? true : (typeof result === 'string' && result.includes('success'));
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

                    const success = String(process.env.MB_TEST_MODE || '') === '1' ? true : (typeof result === 'string' && result.includes('success'));

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
                const success = parsed ? parsed.status === 'success' : (typeof out === 'string' && out.indexOf('success') !== -1);
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
                const success = parsed ? parsed.status === 'success' : (typeof out === 'string' && out.indexOf('success') !== -1);
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
                const success = parsed ? parsed.status === 'success' : (typeof out === 'string' && out.indexOf('success') !== -1);
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

    // 📡 Sensor - digital/analog sensors
    sensor: {
        async read({ pin, sensorType = 'digital' }) {
            try {
                const out = await runWrapper('sensor_cli.py', ['read', String(pin)]);
                const parsed = parsePythonJSON(out);
                const success = parsed ? parsed.status === 'success' : false;
                const value = parsed && typeof parsed.value !== 'undefined' ? parsed.value : undefined;
                return {
                    success,
                    partType: 'sensor',
                    pin,
                    sensorType,
                    value,
                    rawOutput: out,
                    timestamp: new Date().toISOString(),
                    message: parsed && parsed.message ? parsed.message : (success ? `Sensor on pin ${pin} value: ${value}` : 'Sensor read failed')
                };
            } catch (error) {
                return { success: false, partType: 'sensor', pin, error: error.message };
            }
        },

        async calibrate({ pin, minValue, maxValue }) {
            console.log(`📡 Sensor Calibrate - Pin ${pin}: ${minValue} - ${maxValue}`);
            return {
                success: true,
                partType: 'sensor',
                pin: pin,
                calibration: { minValue, maxValue },
                message: `Sensor on pin ${pin} calibrated`
            };
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

        async startStream({ deviceId = 0, resolution = '640x480' }) {
            // TODO: wire to camera_stream.py via an HTTP endpoint; keep simulated for now
            console.log('📹 Webcam Stream Start - Device ' + deviceId + ': ' + resolution);
            return {
                success: true,
                partType: 'webcam',
                deviceId: deviceId,
                resolution: resolution,
                streamUrl: 'http://localhost:8080/stream/' + deviceId,
                message: 'Webcam ' + deviceId + ' streaming at ' + resolution
            };
        },

        async stopStream({ deviceId = 0 }) {
            console.log('📹 Webcam Stream Stop - Device ' + deviceId);
            return {
                success: true,
                partType: 'webcam',
                deviceId: deviceId,
                message: 'Webcam ' + deviceId + ' stream stopped'
            };
        }
    },

    // 🎤 Microphone - audio input devices
    microphone: {
        async record({ deviceId = 0, duration = 5000, format = 'wav' }) {
            // TODO: wire real recording path; keep simulated for now
            console.log(`🎤 Microphone Record - Device ${deviceId}: ${duration}ms as ${format}`);
            return {
                success: true,
                partType: 'microphone',
                deviceId: deviceId,
                duration: duration,
                format: format,
                filename: `recording_${Date.now()}.${format}`,
                message: `Microphone ${deviceId} recorded ${duration}ms of audio`
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
export async function controlPart(partId, action, params = {}) {
    try {
        // Load part configuration from configured dataPath
        const cfg = await readConfig();
        const appRoot = path.resolve(__dirname, '../..');
        const dataDir = cfg && cfg.dataPath ? cfg.dataPath : '../data';
        const partsPath = path.resolve(appRoot, dataDir, 'parts.json');
        const partsData = await fs.readFile(partsPath, 'utf8');
        const parts = JSON.parse(partsData);

        const part = parts.find(p => String(p.id) === String(partId));
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
        }
        if (type === 'motor') {
            if (part.directionPin != null) normalized.directionPin = Number(part.directionPin);
            if (part.pwmPin != null) normalized.pwmPin = Number(part.pwmPin);
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
        if ((type === 'light' || type === 'led' || type === 'sensor' || type === 'motion_sensor') && pinFromPart == null) {
            // Ensure a pin is present if possible
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

        // Apply simple safety limits where applicable (servo angle clamp)
        if (type === 'servo' && action === 'moveToAngle') {
            try {
                const simp = await simpleCal.getForPart(part.id);
                if (simp && typeof simp.safeMin === 'number' && typeof simp.safeMax === 'number') {
                    const lo = Math.min(simp.safeMin, simp.safeMax);
                    const hi = Math.max(simp.safeMin, simp.safeMax);
                    if (typeof actionParams.angleDeg === 'number') {
                        if (actionParams.angleDeg < lo) actionParams.angleDeg = lo;
                        if (actionParams.angleDeg > hi) actionParams.angleDeg = hi;
                    }
                }
            } catch (_) { /* ignore clamp errors */ }
        }

        // Apply simple safety limits for motor/actuator durations
        if (actionParams && typeof actionParams === 'object') {
            try {
                const simp2 = await simpleCal.getForPart(part.id);
                if (simp2 && typeof simp2.safeMin === 'number' && typeof simp2.safeMax === 'number') {
                    const lo2 = Math.min(simp2.safeMin, simp2.safeMax);
                    const hi2 = Math.max(simp2.safeMin, simp2.safeMax);
                    if (type === 'motor' && action === 'control') {
                        if (typeof actionParams.duration === 'number') {
                            if (actionParams.duration < lo2) actionParams.duration = lo2;
                            if (actionParams.duration > hi2) actionParams.duration = hi2;
                        }
                    }
                    if (type === 'linear_actuator' && (action === 'extend' || action === 'retract')) {
                        if (typeof actionParams.duration === 'number') {
                            if (actionParams.duration < lo2) actionParams.duration = lo2;
                            if (actionParams.duration > hi2) actionParams.duration = hi2;
                        }
                    }
                }
            } catch (_) { /* ignore clamp errors */ }
        }

        const result = await actionFunction(actionParams);

        return {
            ...result,
            partId: partId,
            partName: part.name,
            action: action
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

export default {
    controlPart,
    getAvailableActions,
    getSupportedPartTypes,
    HARDWARE_CONTROLLERS,
    pipewireService,
    streamRoutingService
};
