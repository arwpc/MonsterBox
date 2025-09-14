/**
 * Hardware Service Index for MonsterBox 4.0
 * Unified interface for all 11 Part types with direct local function calls
 */

import servoService from './servo.js';
import pca9685Service from './pca9685.js';
import actuatorService from './actuator.js';
import { runWrapper } from './exec.js';
import fs from 'fs/promises';
import path from 'path';
import { fileURLToPath } from 'url';
import { readConfig } from '../configService.js';

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

// Hardware control functions for each part type
const HARDWARE_CONTROLLERS = {
    // 🔄 Motor - DC motors for movement
    motor: {
        async control({ pin, direction = 'forward', speed = 50, duration = 1000 }) {
            try {
                const out = await runWrapper('motor_cli.py', [String(direction), String(speed), String(duration), String(pin)]);
                const parsed = parsePythonJSON(out);
                const success = parsed ? parsed.status === 'success' : (typeof out === 'string' && out.indexOf('success') !== -1);
                return {
                    success,
                    partType: 'motor',
                    pin: pin,
                    direction: direction,
                    speed: speed,
                    duration: duration,
                    rawOutput: out,
                    message: parsed && parsed.message ? parsed.message : (success ? `Motor on pin ${pin} ${direction} at ${speed}%` : 'Motor command failed')
                };
            } catch (error) {
                return { success: false, partType: 'motor', pin: pin, error: error.message };
            }
        },

        async stop({ pin }) {
            try {
                const out = await runWrapper('motor_cli.py', ['stop', '0', '100', String(pin)]);
                const parsed = parsePythonJSON(out);
                const success = parsed ? parsed.status === 'success' : (typeof out === 'string' && out.indexOf('success') !== -1);
                return {
                    success,
                    partType: 'motor',
                    pin: pin,
                    rawOutput: out,
                    message: parsed && parsed.message ? parsed.message : (success ? `Motor on pin ${pin} stopped` : 'Motor stop failed')
                };
            } catch (error) {
                return { success: false, partType: 'motor', pin: pin, error: error.message };
            }
        }
    },

    // 🦴 Linear Actuator - extending/retracting movements (real hardware via Python wrapper)
    linear_actuator: {
        async extend({ pin, directionPin, pwmPin, speed = 50, distance = 100, duration }) {
            try {
                // Prefer explicit pins; else derive from base pin: dir=pin, pwm=pin+1
                const dirPin = (typeof directionPin === 'number') ? directionPin : (typeof pin === 'number' ? pin : parseInt(pin, 10));
                const pwm = (typeof pwmPin === 'number') ? pwmPin : (typeof pin === 'number' ? pin + 1 : parseInt(pin, 10) + 1);
                const dur = typeof duration === 'number' ? duration : 1000; // safe default

                const out = await actuatorService.controlActuator({ directionPin: dirPin, pwmPin: pwm, direction: 'extend', speed, duration: dur });
                // controlActuator returns wrapper output (string). Parse last JSON line if present
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
                    action: 'extend',
                    speed: speed,
                    duration: dur,
                    rawOutput: out,
                    message: parsed && parsed.message ? parsed.message : (success ? `Linear actuator (dir=${dirPin}, pwm=${pwm}) extending` : 'Actuator extend failed')
                };
            } catch (error) {
                return { success: false, partType: 'linear_actuator', pin, error: error.message };
            }
        },

        async retract({ pin, directionPin, pwmPin, speed = 50, distance = 100, duration }) {
            try {
                const dirPin = (typeof directionPin === 'number') ? directionPin : (typeof pin === 'number' ? pin : parseInt(pin, 10));
                const pwm = (typeof pwmPin === 'number') ? pwmPin : (typeof pin === 'number' ? pin + 1 : parseInt(pin, 10) + 1);
                const dur = typeof duration === 'number' ? duration : 1000;

                const out = await actuatorService.controlActuator({ directionPin: dirPin, pwmPin: pwm, direction: 'retract', speed, duration: dur });
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
                    action: 'retract',
                    speed: speed,
                    duration: dur,
                    rawOutput: out,
                    message: parsed && parsed.message ? parsed.message : (success ? `Linear actuator (dir=${dirPin}, pwm=${pwm}) retracting` : 'Actuator retract failed')
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
        async moveToAngle({ partId, pin, channel, angleDeg, controllerType = 'gpio', address }) {
            try {
                if (controllerType === 'pca9685') {
                    return await pca9685Service.moveServoToAngle({ channel, angleDeg, address });
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

        async rotateContinuous({ pin, channel, direction, speed, controllerType = 'gpio', address }) {
            try {
                if (controllerType === 'pca9685') {
                    return await pca9685Service.controlContinuousServo({ channel, direction, speed, address });
                } else {
                    const result = await servoService.rotateContinuous({ channel: pin, direction, speed });

                    const success = typeof result === 'string' && result.includes('success');

                    return {
                        success: success,
                        partType: 'servo',
                        pin: pin,
                        direction: direction,
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

        async stop({ pin, channel, controllerType = 'gpio', address }) {
            try {
                if (controllerType === 'pca9685') {
                    return await pca9685Service.setPWM({ channel, pulseWidthUs: 0, address });
                } else {
                    const result = await servoService.stop({ channel: pin });

                    const success = typeof result === 'string' && result.includes('success');

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

        async getLevel({ deviceId = 0 }) {
            try {
                const out = await runWrapper('microphone_cli.py', ['get_level', String(deviceId), '44100', '1', '1']);
                const parsed = parsePythonJSON(out);
                const success = parsed ? parsed.status === 'success' : false;
                const level = parsed && (parsed.level || parsed.audio_level);
                return {
                    success,
                    partType: 'microphone',
                    deviceId,
                    level,
                    timestamp: new Date().toISOString(),
                    message: (parsed && parsed.message) || `Microphone ${deviceId} level read`
                };
            } catch (err) {
                return { success: false, partType: 'microphone', deviceId, error: String(err.message || err) };
            }
        }
    },

    // 🔊 Speaker - audio output devices
    speaker: {
        async play({ deviceId = 0, filename, volume = 50 }) {
            try {
                const args = ['play', String(filename)];
                if (typeof volume === 'number') args.push(String(volume));
                const out = await runWrapper('speaker_cli.py', args);
                const parsed = parsePythonJSON(out);
                const success = parsed ? parsed.status === 'success' : false;
                return {
                    success,
                    partType: 'speaker',
                    deviceId,
                    filename,
                    volume,
                    pid: parsed && parsed.pid,
                    message: (parsed && parsed.message) || `Speaker ${deviceId} play`
                };
            } catch (err) {
                return { success: false, partType: 'speaker', deviceId, filename, error: String(err.message || err) };
            }
        },

        async setVolume({ deviceId = 0, volume }) {
            if (volume < 0 || volume > 100) {
                throw new Error(`Invalid volume: ${volume}%. Must be 0-100%`);
            }
            try {
                const out = await runWrapper('speaker_cli.py', ['set_volume', String(volume)]);
                const parsed = parsePythonJSON(out);
                const success = parsed ? parsed.status === 'success' : false;
                return {
                    success,
                    partType: 'speaker',
                    deviceId,
                    volume,
                    message: (parsed && parsed.message) || `Speaker ${deviceId} volume set to ${volume}%`
                };
            } catch (err) {
                return { success: false, partType: 'speaker', deviceId, error: String(err.message || err) };
            }
        },

        async stop({ deviceId = 0 }) {
            try {
                const out = await runWrapper('speaker_cli.py', ['stop']);
                const parsed = parsePythonJSON(out);
                const success = parsed ? parsed.status === 'success' : false;
                return {
                    success,
                    partType: 'speaker',
                    deviceId,
                    message: (parsed && parsed.message) || `Speaker ${deviceId} stopped`
                };
            } catch (err) {
                return { success: false, partType: 'speaker', deviceId, error: String(err.message || err) };
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

        const controller = HARDWARE_CONTROLLERS[part.type];
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

        if (part.type === 'servo') {
            if (part.usePCA9685 === true || part.controllerType === 'pca9685') {
                normalized.controllerType = 'pca9685';
                if (part.channel != null) normalized.channel = part.channel;
                const addrRaw = part.pca9685Settings && part.pca9685Settings.address;
                if (addrRaw != null) {
                    normalized.address = (typeof addrRaw === 'string' && addrRaw.startsWith('0x')) ? parseInt(addrRaw, 16) : addrRaw;
                }
            }
        }
        if (part.type === 'linear_actuator') {
            if (part.directionPin != null) normalized.directionPin = Number(part.directionPin);
            if (part.pwmPin != null) normalized.pwmPin = Number(part.pwmPin);
            if (part.maxExtension != null) normalized.maxExtension = Number(part.maxExtension);
            if (part.maxRetraction != null) normalized.maxRetraction = Number(part.maxRetraction);
        }
        if ((part.type === 'light' || part.type === 'led' || part.type === 'sensor' || part.type === 'motion_sensor') && pinFromPart == null) {
            // Ensure a pin is present if possible
            if (part.gpioPin != null) normalized.pin = (typeof part.gpioPin === 'string' ? parseInt(part.gpioPin, 10) : part.gpioPin);
        }

        const actionParams = {
            ...params,
            partId: part.id,
            pin: pinFromPart,
            ...normalized
        };

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
    const controller = HARDWARE_CONTROLLERS[partType];
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

export default {
    controlPart,
    getAvailableActions,
    getSupportedPartTypes,
    HARDWARE_CONTROLLERS
};
