/**
 * Hardware Service Index for MonsterBox 4.0
 * Unified interface for all 11 Part types with direct local function calls
 */

import servoService from './servo.js';
import pca9685Service from './pca9685.js';
import fs from 'fs/promises';
import path from 'path';
import { fileURLToPath } from 'url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

// Hardware control functions for each part type
const HARDWARE_CONTROLLERS = {
    // 🔄 Motor - DC motors for movement
    motor: {
        async control({ pin, direction, speed = 50, duration = 1000 }) {
            console.log(`🔄 Motor Control - Pin ${pin}: ${direction} at ${speed}% for ${duration}ms`);
            return {
                success: true,
                partType: 'motor',
                pin: pin,
                direction: direction,
                speed: speed,
                duration: duration,
                message: `Motor on pin ${pin} ${direction} at ${speed}% speed`
            };
        },

        async stop({ pin }) {
            console.log(`🔄 Motor Stop - Pin ${pin}`);
            return {
                success: true,
                partType: 'motor',
                pin: pin,
                message: `Motor on pin ${pin} stopped`
            };
        }
    },

    // 🦴 Linear Actuator - extending/retracting movements
    linear_actuator: {
        async extend({ pin, speed = 50, distance = 100 }) {
            console.log(`🦴 Linear Actuator Extend - Pin ${pin}: ${distance}mm at ${speed}% speed`);
            return {
                success: true,
                partType: 'linear_actuator',
                pin: pin,
                action: 'extend',
                distance: distance,
                speed: speed,
                message: `Linear actuator on pin ${pin} extending ${distance}mm`
            };
        },

        async retract({ pin, speed = 50, distance = 100 }) {
            console.log(`🦴 Linear Actuator Retract - Pin ${pin}: ${distance}mm at ${speed}% speed`);
            return {
                success: true,
                partType: 'linear_actuator',
                pin: pin,
                action: 'retract',
                distance: distance,
                speed: speed,
                message: `Linear actuator on pin ${pin} retracting ${distance}mm`
            };
        },

        async stop({ pin }) {
            console.log(`🦴 Linear Actuator Stop - Pin ${pin}`);
            return {
                success: true,
                partType: 'linear_actuator',
                pin: pin,
                message: `Linear actuator on pin ${pin} stopped`
            };
        }
    },

    // 💡 Light - basic on/off lighting
    light: {
        async turnOn({ pin, brightness = 100 }) {
            console.log(`💡 Light On - Pin ${pin}: ${brightness}% brightness`);
            return {
                success: true,
                partType: 'light',
                pin: pin,
                state: 'on',
                brightness: brightness,
                message: `Light on pin ${pin} turned on at ${brightness}%`
            };
        },

        async turnOff({ pin }) {
            console.log(`💡 Light Off - Pin ${pin}`);
            return {
                success: true,
                partType: 'light',
                pin: pin,
                state: 'off',
                message: `Light on pin ${pin} turned off`
            };
        },

        async toggle({ pin }) {
            console.log(`💡 Light Toggle - Pin ${pin}`);
            return {
                success: true,
                partType: 'light',
                pin: pin,
                action: 'toggle',
                message: `Light on pin ${pin} toggled`
            };
        }
    },

    // 🔆 LED - PWM-controlled with brightness
    led: {
        async setBrightness({ pin, brightness }) {
            if (brightness < 0 || brightness > 100) {
                throw new Error(`Invalid brightness: ${brightness}%. Must be 0-100%`);
            }

            console.log(`🔆 LED Brightness - Pin ${pin}: ${brightness}%`);
            return {
                success: true,
                partType: 'led',
                pin: pin,
                brightness: brightness,
                message: `LED on pin ${pin} set to ${brightness}% brightness`
            };
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
        async moveToAngle({ pin, channel, angleDeg, controllerType = 'gpio', address }) {
            try {
                if (controllerType === 'pca9685') {
                    return await pca9685Service.moveServoToAngle({ channel, angleDeg, address });
                } else {
                    const result = await servoService.moveToAngle({ partId: pin, angleDeg });

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
            console.log(`📡 Sensor Read - Pin ${pin}: ${sensorType} sensor`);

            // Simulate sensor reading
            const value = sensorType === 'digital' ? Math.random() > 0.5 : Math.random() * 1024;

            return {
                success: true,
                partType: 'sensor',
                pin: pin,
                sensorType: sensorType,
                value: value,
                timestamp: new Date().toISOString(),
                message: `Sensor on pin ${pin} read: ${value}`
            };
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
            console.log(`🔍 Motion Sensor Read - Pin ${pin}`);

            // Simulate motion detection
            const motionDetected = Math.random() > 0.7;

            return {
                success: true,
                partType: 'motion_sensor',
                pin: pin,
                motionDetected: motionDetected,
                timestamp: new Date().toISOString(),
                message: `Motion sensor on pin ${pin}: ${motionDetected ? 'Motion detected!' : 'No motion'}`
            };
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
            console.log(`📹 Webcam Capture - Device ${deviceId}: ${resolution}`);
            return {
                success: true,
                partType: 'webcam',
                deviceId: deviceId,
                resolution: resolution,
                filename: `capture_${Date.now()}.jpg`,
                message: `Webcam ${deviceId} captured image at ${resolution}`
            };
        },

        async startStream({ deviceId = 0, resolution = '640x480' }) {
            console.log(`📹 Webcam Stream Start - Device ${deviceId}: ${resolution}`);
            return {
                success: true,
                partType: 'webcam',
                deviceId: deviceId,
                resolution: resolution,
                streamUrl: `http://localhost:8080/stream/${deviceId}`,
                message: `Webcam ${deviceId} streaming at ${resolution}`
            };
        },

        async stopStream({ deviceId = 0 }) {
            console.log(`📹 Webcam Stream Stop - Device ${deviceId}`);
            return {
                success: true,
                partType: 'webcam',
                deviceId: deviceId,
                message: `Webcam ${deviceId} stream stopped`
            };
        }
    },

    // 🎤 Microphone - audio input devices
    microphone: {
        async record({ deviceId = 0, duration = 5000, format = 'wav' }) {
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
            console.log(`🎤 Microphone Level - Device ${deviceId}`);

            // Simulate audio level
            const level = Math.random() * 100;

            return {
                success: true,
                partType: 'microphone',
                deviceId: deviceId,
                level: level,
                timestamp: new Date().toISOString(),
                message: `Microphone ${deviceId} level: ${level.toFixed(1)}%`
            };
        }
    },

    // 🔊 Speaker - audio output devices
    speaker: {
        async play({ deviceId = 0, filename, volume = 50 }) {
            console.log(`🔊 Speaker Play - Device ${deviceId}: ${filename} at ${volume}%`);
            return {
                success: true,
                partType: 'speaker',
                deviceId: deviceId,
                filename: filename,
                volume: volume,
                message: `Speaker ${deviceId} playing ${filename} at ${volume}% volume`
            };
        },

        async setVolume({ deviceId = 0, volume }) {
            if (volume < 0 || volume > 100) {
                throw new Error(`Invalid volume: ${volume}%. Must be 0-100%`);
            }

            console.log(`🔊 Speaker Volume - Device ${deviceId}: ${volume}%`);
            return {
                success: true,
                partType: 'speaker',
                deviceId: deviceId,
                volume: volume,
                message: `Speaker ${deviceId} volume set to ${volume}%`
            };
        },

        async stop({ deviceId = 0 }) {
            console.log(`🔊 Speaker Stop - Device ${deviceId}`);
            return {
                success: true,
                partType: 'speaker',
                deviceId: deviceId,
                message: `Speaker ${deviceId} stopped`
            };
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
            console.log(`🎯 Head Tracking Position - Camera ${cameraId}`);

            // Simulate head position
            const position = {
                x: Math.random() * 640,
                y: Math.random() * 480,
                confidence: Math.random()
            };

            return {
                success: true,
                partType: 'head_tracking',
                cameraId: cameraId,
                position: position,
                timestamp: new Date().toISOString(),
                message: `Head position: (${position.x.toFixed(0)}, ${position.y.toFixed(0)}) confidence: ${(position.confidence * 100).toFixed(1)}%`
            };
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
        // Load part configuration
        const partsPath = path.resolve(__dirname, '../../data/parts.json');
        const partsData = await fs.readFile(partsPath, 'utf8');
        const parts = JSON.parse(partsData);

        const part = parts.find(p => p.id === partId);
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

        // Merge part configuration with action parameters
        const actionParams = {
            ...params,
            pin: part.pin,
            ...part.config
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
