/**
 * Pose Engine
 * Executes poses by routing through hardwareService.controlPart()
 * which handles PCA9685 detection, pin normalization, calibration, etc.
 */

import { getPose } from './poseRepository.js';
import { controlPart } from '../hardwareService/index.js';

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
    const startTime = Date.now();

    try {
        // Load pose data
        const pose = await getPose(characterId, poseId);
        if (!pose) {
            throw new Error(`Pose ${poseId} not found for character ${characterId}`);
        }

        console.log(`📋 Executing pose: ${pose.name} (${pose.parts.length} parts)`);

        if (!pose.parts || pose.parts.length === 0) {
            throw new Error('Pose has no parts to execute');
        }

        // Execute all parts concurrently through controlPart()
        const promises = pose.parts.map(part => executePosePart(part, options));
        const settled = await Promise.allSettled(promises);

        const results = settled.map((s, i) => {
            if (s.status === 'fulfilled') return s.value;
            return { success: false, partId: pose.parts[i].partId, error: s.reason?.message || 'Unknown error' };
        });

        const elapsed = Date.now() - startTime;
        console.log(`🎭 Pose "${pose.name}" completed in ${elapsed}ms`);

        return {
            success: results.some(r => r.success),
            poseId,
            poseName: pose.name,
            executedParts: results.filter(r => r.success).length,
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
 * Execute a single pose part through the hardware abstraction layer
 * @param {Object} part - Part from pose definition
 * @param {Object} options - Execution options
 * @returns {Promise<Object>} - Execution result
 */
async function executePosePart(part, options) {
    const { partId, type, target } = part;
    const normalizedType = (type || '').replace(/_/g, '-');

    try {
        switch (normalizedType) {
            case 'servo': {
                if (target.angleDeg != null) {
                    const result = await controlPart(String(partId), 'moveToAngle', {
                        angleDeg: target.angleDeg,
                        duration: target.durationMs || 1000
                    });
                    return { success: result.success !== false, partId, ...result };
                }
                if (target.continuous) {
                    const { direction, durationMs, speedPct = 50 } = target.continuous;
                    const result = await controlPart(String(partId), 'rotateContinuous', {
                        direction: direction || 'stop',
                        speed: speedPct,
                        duration: durationMs || 1000
                    });
                    return { success: result.success !== false, partId, ...result };
                }
                throw new Error(`Invalid servo target for part ${partId}`);
            }

            case 'linear-actuator': {
                const { distance, speed = 50 } = target;
                const direction = target.direction || (distance > 0 ? 'extend' : 'retract');
                const result = await controlPart(String(partId), 'control', {
                    direction,
                    speed: Math.max(1, Math.min(100, speed)),
                    duration: target.durationMs || 2000
                });
                return { success: result.success !== false, partId, ...result };
            }

            case 'motor': {
                const { speed = 50, direction = 'forward', duration = 1000 } = target;
                const result = await controlPart(String(partId), 'control', {
                    direction,
                    speed: Math.max(0, Math.min(100, speed)),
                    duration
                });
                return { success: result.success !== false, partId, ...result };
            }

            case 'light':
            case 'led': {
                const action = target.action || 'toggle';
                const result = await controlPart(String(partId), action, {
                    brightness: target.brightness || 100,
                    duration: target.duration || 1000
                });
                return { success: result.success !== false, partId, ...result };
            }

            default:
                throw new Error(`Unsupported part type: ${type}`);
        }
    } catch (error) {
        console.warn(`⚠️ Part ${partId} (${type}) failed: ${error.message}`);
        return { success: false, partId, error: error.message };
    }
}

export default { executePose };
