/**
 * Pose Engine
 * Executes poses by routing through hardwareService.controlPart()
 * which handles PCA9685 detection, pin normalization, calibration, etc.
 */

import { getPose } from './poseRepository.js';
import { controlPart, batchMoveServos } from '../hardwareService/index.js';
import { applyPoseJitter } from './poseBounds.js';
import { evaluatePoseHealth, HEALTH } from './poseHealth.js';

/**
 * Execute a pose
 * @param {Object} params - Execution parameters
 * @param {number} params.characterId - Character ID
 * @param {number} params.poseId - Pose ID
 * @param {Object} params.options - Execution options
 * @returns {Promise<Object>} - Execution result
 */
export async function executePose({ characterId, poseId, pose: providedPose, options = {} }) {
    console.log(`🎭 Executing pose ${poseId} for character ${characterId}`);
    const startTime = Date.now();

    try {
        // Use a caller-provided (e.g. amplitude-scaled) pose if given, otherwise load it.
        const loaded = providedPose || await getPose(characterId, poseId);
        if (!loaded) {
            throw new Error(`Pose ${poseId} not found for character ${characterId}`);
        }

        if (!loaded.parts || loaded.parts.length === 0) {
            throw new Error('Pose has no parts to execute');
        }

        // Per-pose jitterDeg: the same pose never lands twice. The offset is drawn
        // INSIDE the part's calibrated/configured window (see poseBounds), so the
        // variation can never be the thing that pushes a part past its limit.
        let pose = loaded;
        if (options.jitter !== false) {
            const jitterResult = await applyPoseJitter(loaded, characterId, {
                jitterDeg: options.jitterDeg,
                rng: options.rng
            });
            pose = jitterResult.pose;
            if (jitterResult.applied.length > 0) {
                const summary = jitterResult.applied
                    .map(a => `${a.partId}: ${a.from}°→${a.to}° (window ${a.lo ?? '-'}..${a.hi ?? '-'})`)
                    .join(', ');
                console.log(`🎲 Jitter applied — ${summary}`);
            }
        }

        console.log(`📋 Executing pose: ${pose.name} (${pose.parts.length} parts)`);

        // Health is advisory here rather than a refusal: a deliberate, operator-driven
        // "play this pose" should still reach the hardware safety layer and be refused
        // THERE, with its reason, instead of being silently swallowed one level up.
        // What this does is stop the failure from being a mystery.
        let health = null;
        if (options.skipHealthCheck !== true) {
            try {
                health = await evaluatePoseHealth(characterId, pose);
                if (health.status !== HEALTH.OK) {
                    console.warn(`⚠️  Pose "${pose.name}" is ${health.status}: ` +
                        health.reasons.map(r => r.message + (r.blockReason ? ` — ${r.blockReason}` : '')).join(' | '));
                }
            } catch (err) {
                console.warn(`⚠️  Could not evaluate pose health: ${err.message}`);
            }
        }

        // Separate servo parts (for batching) from non-servo parts
        const servoParts = [];
        const otherParts = [];
        for (const part of pose.parts) {
            const t = (part.type || '').replace(/_/g, '-');
            if (t === 'servo' && part.target && part.target.angleDeg != null) {
                servoParts.push(part);
            } else {
                otherParts.push(part);
            }
        }

        // Execute servo batch + other parts concurrently.
        //
        // A pose that declares a transition duration is eased over that duration
        // through the transition engine; without one, servos are sent a single
        // target and move at whatever speed they happen to have. `transitionProfile`
        // only means something on the first path.
        const transitionDurationMs = options.transitionDurationMs ?? pose.transitionDurationMs;
        const batchPromise = servoParts.length === 0
            ? Promise.resolve({ success: true, results: [] })
            : (transitionDurationMs > 0
                ? import('../movement/transitionEngine.js').then(engine =>
                    engine.transitionServos(characterId, servoParts, {
                        durationMs: transitionDurationMs,
                        easing: pose.transitionProfile || 'ease_in_out',
                        signal: options.signal
                    }).then(results => ({ success: results.every(r => r.success !== false), results })))
                : batchMoveServos(servoParts.map(p => ({ partId: p.partId, angleDeg: p.target.angleDeg })), { characterId }));

        const otherPromises = otherParts.map(part => executePosePart(part, options, characterId));

        const [batchResult, ...otherSettled] = await Promise.all([
            batchPromise,
            ...otherPromises.map(p => p.then(r => ({ status: 'fulfilled', value: r })).catch(e => ({ status: 'rejected', reason: e })))
        ]);

        const results = [
            ...(batchResult.results || []),
            ...otherSettled.map((s, i) => {
                if (s.status === 'fulfilled') return s.value;
                return { success: false, partId: otherParts[i].partId, error: s.reason?.message || 'Unknown error' };
            })
        ];

        const elapsed = Date.now() - startTime;
        console.log(`🎭 Pose "${pose.name}" completed in ${elapsed}ms`);

        // Remember where we just sent each servo. Easing needs a start angle and
        // these servos have no feedback, so the last commanded angle is the only
        // "current position" that exists. Best-effort: never fail a pose over it.
        if (servoParts.length > 0 && !(transitionDurationMs > 0)) {
            try {
                const engine = await import('../movement/transitionEngine.js');
                for (const part of servoParts) {
                    engine.setBelievedAngle(characterId, part.partId, part.target.angleDeg);
                }
            } catch (_) { /* position tracking is an optimisation, not a requirement */ }
        }

        // `some` reported success whenever ANY part moved, so a pose whose actuator
        // failed outright still came back success:true as long as a servo worked —
        // which is exactly how a broken actuator path stayed hidden. Report the truth
        // and name the parts that failed, while keeping `success` meaningful for
        // callers that only check the flag.
        const failedParts = results.filter(r => !r.success);
        return {
            success: failedParts.length === 0,
            partialFailure: failedParts.length > 0 && failedParts.length < results.length,
            poseId,
            poseName: pose.name,
            executedParts: results.filter(r => r.success).length,
            failedParts: failedParts.map(r => ({ partId: r.partId, error: r.error })),
            health: health ? health.status : null,
            healthReasons: health ? health.reasons : [],
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
async function executePosePart(part, options, characterId) {
    const { partId, type, target } = part;
    // Part IDs are only unique within a character, so every hardware call must
    // carry the character it was resolved against.
    const hw = { characterId };
    const normalizedType = (type || '').replace(/_/g, '-');

    try {
        switch (normalizedType) {
            case 'servo': {
                if (target.angleDeg != null) {
                    const result = await controlPart(String(partId), 'moveToAngle', {
                        angleDeg: target.angleDeg,
                        duration: target.durationMs ?? target.duration ?? 1000
                    }, hw);
                    return { success: result.success !== false, partId, ...result };
                }
                if (target.continuous) {
                    const { direction, durationMs, speedPct = 50 } = target.continuous;
                    const result = await controlPart(String(partId), 'rotateContinuous', {
                        direction: direction || 'stop',
                        speed: speedPct,
                        duration: durationMs || 1000
                    }, hw);
                    return { success: result.success !== false, partId, ...result };
                }
                throw new Error(`Invalid servo target for part ${partId}`);
            }

            case 'linear-actuator': {
                const { distance, speed = 50 } = target;
                const direction = target.direction || (distance > 0 ? 'extend' : 'retract');
                // 'control' is a MOTOR action — the linear-actuator controller exposes
                // jog/extend/retract/stop, so every actuator pose failed with
                // "Action 'control' not supported for part type: linear_actuator" and
                // never moved. jog is the unified entry point and applies the part's
                // invertDirection centrally. The scene executor already had this right.
                // The pose editor writes `duration`; this engine originally read only
                // `durationMs`, so any actuator pose authored in the UI silently ran for
                // the 2000ms default — a long time on a 500ms-class part. Accept both.
                const result = await controlPart(String(partId), 'jog', {
                    direction,
                    speed: Math.max(1, Math.min(100, speed)),
                    duration: target.durationMs ?? target.duration ?? 2000
                }, hw);
                return { success: result.success !== false, partId, ...result };
            }

            case 'motor': {
                const { speed = 50, direction = 'forward', duration = 1000 } = target;
                const result = await controlPart(String(partId), 'control', {
                    direction,
                    speed: Math.max(0, Math.min(100, speed)),
                    duration
                }, hw);
                return { success: result.success !== false, partId, ...result };
            }

            case 'light':
            case 'led': {
                // Editor writes `state`, engine originally read only `action`.
                const action = target.action || target.state || 'toggle';
                const result = await controlPart(String(partId), action, {
                    brightness: target.brightness || 100,
                    duration: target.durationMs ?? target.duration ?? 1000
                }, hw);
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
