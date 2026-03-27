/**
 * Pose Engine
 * Executes poses by mapping them to hardware commands with safety enforcement
 */

import { getPose } from './poseRepository.js';
import servoService from '../hardwareService/servo.js';
import { getCalibrationStore } from '../../server/calibration/store.js';
import actuatorPositionStore from '../actuatorPositionStore.js';
import fs from 'fs/promises';
import path from 'path';
import { fileURLToPath } from 'url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

/**
 * Execute a pose
 * @param {Object} params - Execution parameters
 * @param {number} params.characterId - Character ID
 * @param {number} params.poseId - Pose ID
 * @param {Object} params.options - Execution options
 * @returns {Promise<Object>} - Execution result
 */
export async function executePose({ characterId, poseId, options = {} }) {
    console.log(`🎭 Executing pose ${poseId} for character ${characterId}`);

    try {
        // Load pose data
        const pose = await getPose(characterId, poseId);
        if (!pose) {
            throw new Error(`Pose ${poseId} not found for character ${characterId}`);
        }

        console.log(`📋 Executing pose: ${pose.name}`);

        // Validate and prepare parts
        const partCommands = await preparePoseCommands(pose, options);

        // Execute commands
        const results = await executeCommands(partCommands, pose.concurrent || false);

        // Return execution summary
        return {
            success: true,
            poseId,
            poseName: pose.name,
            executedParts: results.length,
            results,
            executionTime: Date.now()
        };

    } catch (error) {
        console.error(`❌ Pose execution failed:`, error.message);
        return {
            success: false,
            poseId,
            error: error.message,
            executionTime: Date.now()
        };
    }
}

/**
 * Prepare pose commands with safety validation
 * @param {Object} pose - Pose data
 * @param {Object} options - Execution options
 * @returns {Promise<Array>} - Array of validated commands
 */
async function preparePoseCommands(pose, options) {
    const commands = [];

    for (const part of pose.parts) {
        try {
            console.log(`🔧 Preparing part ${part.partId} (${part.type})`);
            const command = await preparePart(part, options);
            if (command) {
                commands.push(command);
                console.log(`✅ Part ${part.partId} prepared successfully`);
            } else {
                console.warn(`⚠️ Part ${part.partId} returned null command`);
            }
        } catch (error) {
            console.warn(`⚠️ Skipping part ${part.partId}: ${error.message}`);
        }
    }

    if (commands.length === 0) {
        throw new Error('No valid commands could be prepared for this pose');
    }

    return commands;
}

/**
 * Prepare individual part command
 * @param {Object} part - Part configuration
 * @param {Object} options - Execution options
 * @returns {Promise<Object>} - Prepared command
 */
async function preparePart(part, options) {
    const { partId, type, target } = part;

    // Load part metadata
    const partMetadata = await getPartMetadata(partId);
    if (!partMetadata) {
        throw new Error(`Part ${partId} not found in parts.json`);
    }

    // Validate part type matches (normalize underscores vs hyphens)
    const normalizedPoseType = type.replace('_', '-');
    const normalizedPartType = partMetadata.type.replace('_', '-');
    if (normalizedPartType !== normalizedPoseType) {
        throw new Error(`Part type mismatch: expected ${type}, got ${partMetadata.type}`);
    }

    // Prepare command based on part type (normalize underscores vs hyphens)
    const normalizedType = type.replace('_', '-');
    switch (normalizedType) {
        case 'servo':
            return await prepareServoCommand(partId, target, partMetadata, options);

        case 'linear-actuator':
            return await prepareActuatorCommand(partId, target, partMetadata, options);

        case 'motor':
            return await prepareMotorCommand(partId, target, partMetadata, options);

        case 'light':
            return await prepareLightCommand(partId, target, partMetadata, options);

        case 'led':
            return await prepareLEDCommand(partId, target, partMetadata, options);

        default:
            throw new Error(`Unsupported part type: ${type}`);
    }
}

/**
 * Prepare servo command with safety checks
 * @param {number} partId - Part ID
 * @param {Object} target - Target configuration
 * @param {Object} partMetadata - Part metadata from parts.json
 * @param {Object} options - Execution options
 * @returns {Promise<Object>} - Servo command
 */
async function prepareServoCommand(partId, target, partMetadata, options) {
    const calibration = await servoService.getCalibration(partId);

    // Handle different target types
    if (target.angleDeg !== undefined) {
        // Standard servo angle movement
        const safeAngle = clampServoAngle(target.angleDeg, calibration);
        const pulseUs = servoService.angleToPulse(safeAngle, calibration);

        return {
            type: 'servo',
            action: 'moveTo',
            partId,
            params: {
                channel: partMetadata.gpioPin || partMetadata.channel || 18,
                pulseUs,
                duration: target.durationMs || 1000
            }
        };
    }

    if (target.continuous) {
        // Continuous servo movement
        return await prepareContinuousServoCommand(partId, target.continuous, partMetadata, calibration);
    }

    throw new Error(`Invalid servo target configuration for part ${partId}`);
}

/**
 * Prepare continuous servo command
 * @param {number} partId - Part ID
 * @param {Object} continuous - Continuous servo config
 * @param {Object} partMetadata - Part metadata
 * @param {Object} calibration - Servo calibration
 * @returns {Promise<Object>} - Continuous servo command
 */
async function prepareContinuousServoCommand(partId, continuous, partMetadata, calibration) {
    const { direction, durationMs, speedPct = 50, pattern } = continuous;

    // Handle special patterns
    if (pattern === 'wiggle' || direction === 'random') {
        return {
            type: 'servo',
            action: 'randomMovement',
            partId,
            params: {
                channel: partMetadata.gpioPin || partMetadata.channel || 18,
                duration: durationMs || 3000,
                calibration
            }
        };
    }

    // Handle rotation commands
    if (direction === 'rotate_360') {
        return {
            type: 'servo',
            action: 'rotateContinuous',
            partId,
            params: {
                channel: partMetadata.gpioPin || partMetadata.channel || 18,
                direction: 'cw',
                speed: speedPct,
                duration: durationMs || 2000
            }
        };
    }

    // Standard continuous movement
    return {
        type: 'servo',
        action: 'rotateContinuous',
        partId,
        params: {
            channel: partMetadata.gpioPin || partMetadata.channel || 18,
            direction: direction || 'stop',
            speed: speedPct,
            duration: durationMs || 1000
        }
    };
}

/**
 * Prepare linear actuator command
 * @param {number} partId - Part ID
 * @param {Object} target - Target configuration
 * @param {Object} partMetadata - Part metadata from parts.json
 * @param {Object} options - Execution options
 * @returns {Promise<Object>} - Actuator command
 */
async function prepareActuatorCommand(partId, target, partMetadata, options) {
    const { distance, speed = 50 } = target;

    if (distance === undefined) {
        throw new Error(`Linear actuator target must specify distance for part ${partId}`);
    }

    let clampedDistance = Math.max(0, Math.min(distance, partMetadata.maxExtension || 15000));
    let effectiveDuration = target.durationMs || 2000;

    // Enforce calibration bounds: calculate max safe duration from current position
    try {
        const store = getCalibrationStore();
        const profile = await store.get(parseInt(partId, 10));
        if (profile && profile.bounds && profile.bounds.minP != null && profile.bounds.maxP != null) {
            const posState = actuatorPositionStore.load(parseInt(partId, 10));
            const currentP = (posState && posState.currentP != null) ? posState.currentP : 0.5;
            const motion = profile.motion;
            if (motion && motion.bins && motion.bins.length > 0) {
                const bin = motion.bins.reduce((best, b) =>
                    Math.abs(b.pwmPct - speed) < Math.abs(best.pwmPct - speed) ? b : best
                );
                const rate = bin.unitsPerSec || 0.2;
                // Determine direction from distance (naive: > halfway means extend)
                const isExtend = clampedDistance > (partMetadata.maxExtension || 15000) / 2;
                const maxSafe = isExtend
                    ? Math.max(0, profile.bounds.maxP - currentP)
                    : Math.max(0, currentP - profile.bounds.minP);
                const maxSafeDuration = Math.round((maxSafe / rate) * 1000);
                effectiveDuration = Math.min(effectiveDuration, maxSafeDuration);
                clampedDistance = Math.min(clampedDistance, maxSafeDuration);
            }
        }
    } catch (e) {
        // Non-fatal: proceed with original values
    }

    return {
        type: 'linear_actuator',
        action: 'moveTo',
        partId,
        params: {
            directionPin: partMetadata.directionPin || 18,
            pwmPin: partMetadata.pwmPin || 13,
            distance: clampedDistance,
            speed: Math.max(1, Math.min(100, speed)),
            duration: effectiveDuration
        }
    };
}

/**
 * Prepare motor command
 * @param {number} partId - Part ID
 * @param {Object} target - Target configuration
 * @param {Object} partMetadata - Part metadata from parts.json
 * @param {Object} options - Execution options
 * @returns {Promise<Object>} - Motor command
 */
async function prepareMotorCommand(partId, target, partMetadata, options) {
    const { speed = 50, direction = 'forward', duration = 1000 } = target;

    let effectiveDuration = duration;

    // Enforce calibration bounds for motors (same open-loop issues as linear actuators)
    try {
        const store = getCalibrationStore();
        const profile = await store.get(parseInt(partId, 10));
        if (profile && profile.bounds && profile.bounds.minP != null && profile.bounds.maxP != null) {
            const posState = actuatorPositionStore.load(parseInt(partId, 10));
            const currentP = (posState && posState.currentP != null) ? posState.currentP : 0.5;
            const motion = profile.motion;
            if (motion && motion.bins && motion.bins.length > 0) {
                const bin = motion.bins.reduce((best, b) =>
                    Math.abs(b.pwmPct - speed) < Math.abs(best.pwmPct - speed) ? b : best
                );
                const rate = bin.unitsPerSec || 0.2;
                const isForward = direction === 'forward' || direction === 'extend';
                const maxSafe = isForward
                    ? Math.max(0, profile.bounds.maxP - currentP)
                    : Math.max(0, currentP - profile.bounds.minP);
                const maxSafeDuration = Math.round((maxSafe / rate) * 1000);
                effectiveDuration = Math.min(effectiveDuration, maxSafeDuration);
            }
        }
    } catch (e) {
        // Non-fatal: proceed with original duration
    }

    return {
        type: 'motor',
        action: 'run',
        partId,
        params: {
            pin: partMetadata.pin || partMetadata.gpioPin,
            speed: Math.max(0, Math.min(100, speed)),
            direction: direction,
            duration: effectiveDuration
        }
    };
}

/**
 * Execute prepared commands
 * @param {Array} commands - Array of commands to execute
 * @param {boolean} concurrent - Execute concurrently or sequentially
 * @returns {Promise<Array>} - Execution results
 */
async function executeCommands(commands, concurrent = false) {
    if (concurrent) {
        // Execute all commands simultaneously
        const promises = commands.map(cmd => executeCommand(cmd));
        return await Promise.allSettled(promises);
    } else {
        // Execute commands sequentially
        const results = [];
        for (const command of commands) {
            const result = await executeCommand(command);
            results.push(result);
        }
        return results;
    }
}

/**
 * Execute individual command
 * @param {Object} command - Command to execute
 * @returns {Promise<Object>} - Execution result
 */
async function executeCommand(command) {
    try {
        console.log(`🔧 Executing ${command.type} command for part ${command.partId}`);

        switch (command.type) {
            case 'servo':
                return await executeServoCommand(command);

            case 'linear_actuator':
                return await executeActuatorCommand(command);

            case 'motor':
                return await executeMotorCommand(command);

            case 'light':
                return await executeLightCommand(command);

            case 'led':
                return await executeLEDCommand(command);

            default:
                throw new Error(`Unsupported command type: ${command.type}`);
        }
    } catch (error) {
        return {
            success: false,
            partId: command.partId,
            error: error.message
        };
    }
}

/**
 * Execute servo command
 * @param {Object} command - Servo command
 * @returns {Promise<Object>} - Execution result
 */
async function executeServoCommand(command) {
    const { action, partId, params } = command;

    switch (action) {
        case 'moveTo':
            await servoService.moveTo(params);
            break;

        case 'rotateContinuous':
            await servoService.rotateContinuous(params);
            break;

        case 'randomMovement':
            await executeRandomMovement(params);
            break;

        default:
            throw new Error(`Unknown servo action: ${action}`);
    }

    return {
        success: true,
        partId,
        action,
        params
    };
}

/**
 * Execute linear actuator command
 * @param {Object} command - Actuator command
 * @returns {Promise<Object>} - Execution result
 */
async function executeActuatorCommand(command) {
    const { action, partId, params } = command;

    // Import actuator service
    const { default: actuatorService } = await import('../hardwareService/actuator.js');

    switch (action) {
        case 'moveTo':
            await actuatorService.moveTo(params);
            break;

        default:
            throw new Error(`Unknown actuator action: ${action}`);
    }

    return {
        success: true,
        partId,
        action,
        params
    };
}

/**
 * Execute motor command
 * @param {Object} command - Motor command
 * @returns {Promise<Object>} - Execution result
 */
async function executeMotorCommand(command) {
    const { action, partId, params } = command;

    // Import motor service
    const { default: motorService } = await import('../hardwareService/motor.js');

    switch (action) {
        case 'run':
            await motorService.run(params);
            break;

        default:
            throw new Error(`Unknown motor action: ${action}`);
    }

    return {
        success: true,
        partId,
        action,
        params
    };
}

/**
 * Execute light command
 * @param {Object} command - Light command
 * @returns {Promise<Object>} - Execution result
 */
async function executeLightCommand(command) {
    const { action, partId, params } = command;

    // Import light service
    const { default: lightService } = await import('../hardwareService/light.js');

    switch (action) {
        case 'toggle':
        case 'turnOn':
        case 'turnOff':
            await lightService[action](params);
            break;

        default:
            throw new Error(`Unknown light action: ${action}`);
    }

    return {
        success: true,
        partId,
        action,
        params
    };
}

/**
 * Execute LED command
 * @param {Object} command - LED command
 * @returns {Promise<Object>} - Execution result
 */
async function executeLEDCommand(command) {
    const { action, partId, params } = command;

    // Import light service (LEDs use same service as lights)
    const { default: lightService } = await import('../hardwareService/light.js');

    switch (action) {
        case 'on':
        case 'off':
        case 'toggle':
            await lightService[action](params);
            break;

        default:
            throw new Error(`Unknown LED action: ${action}`);
    }

    return {
        success: true,
        partId,
        action,
        params
    };
}

/**
 * Execute random movement pattern
 * @param {Object} params - Movement parameters
 * @returns {Promise<void>}
 */
async function executeRandomMovement(params) {
    const { channel, duration, calibration } = params;
    const moves = Math.floor(duration / 1000) * 2; // 2 moves per second

    for (let i = 0; i < moves; i++) {
        // Random small movements
        const randomAngle = (Math.random() - 0.5) * 90; // ±45 degrees
        const pulseUs = servoService.angleToPulse(randomAngle, calibration);

        await servoService.moveTo({ channel, pulseUs, duration: 200 });
        await new Promise(resolve => setTimeout(resolve, 300));
    }

    // Return to neutral
    const neutralUs = calibration?.stop_pulse_us || 1500;
    await servoService.moveTo({ channel, pulseUs: neutralUs, duration: 500 });
}

/**
 * Clamp servo angle to safe range
 * @param {number} angle - Desired angle
 * @param {Object} calibration - Servo calibration data
 * @returns {number} - Safe angle
 */
function clampServoAngle(angle, calibration) {
    if (!calibration || !calibration.positions) {
        // Default safe range
        return Math.max(-90, Math.min(90, angle));
    }

    const minAngle = calibration.positions.min?.angle || -90;
    const maxAngle = calibration.positions.max?.angle || 90;

    return Math.max(minAngle, Math.min(maxAngle, angle));
}

/**
 * Prepare light command
 * @param {number} partId - Part ID
 * @param {Object} target - Target configuration
 * @param {Object} partMetadata - Part metadata
 * @param {Object} options - Execution options
 * @returns {Promise<Object>} - Light command
 */
async function prepareLightCommand(partId, target, partMetadata, options) {
    return {
        type: 'light',
        partId,
        action: target.action || 'toggle',
        brightness: target.brightness || 100,
        duration: target.duration || 1000
    };
}

/**
 * Prepare LED command
 * @param {number} partId - Part ID
 * @param {Object} target - Target configuration
 * @param {Object} partMetadata - Part metadata
 * @param {Object} options - Execution options
 * @returns {Promise<Object>} - LED command
 */
async function prepareLEDCommand(partId, target, partMetadata, options) {
    return {
        type: 'led',
        partId,
        action: target.action || 'on',
        color: target.color || '#FFFFFF',
        brightness: target.brightness || 100,
        duration: target.duration || 1000
    };
}

/**
 * Get part metadata from parts.json
 * @param {number} partId - Part ID
 * @returns {Promise<Object|null>} - Part metadata
 */
async function getPartMetadata(partId) {
    try {
        // Import the parts service to get current parts data
        const { default: partsService } = await import('../configService.js');
        const config = await partsService.readConfig();

        // Load parts from character-specific directory
        const characterId = config.selectedCharacter;
        if (!characterId) {
            throw new Error('No character selected — set selectedCharacter in app-config.json');
        }
        const partsPath = path.resolve(__dirname, `../../data/character-${characterId}/parts.json`);
        const partsData = await fs.readFile(partsPath, 'utf8');
        const parts = JSON.parse(partsData);

        // parts.json is an array, not an object with a parts property
        return parts.find(part => part.id == partId) || null;
    } catch (error) {
        console.warn(`⚠️ Could not load part metadata: ${error.message}`);
        return null;
    }
}

export default { executePose };
