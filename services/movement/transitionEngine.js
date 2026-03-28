/**
 * Transition Engine — smooth servo movement with velocity-based easing.
 *
 * Calculates intermediate positions at ~50Hz (20ms intervals) using
 * high-resolution self-correcting timer loops. Easing is applied to
 * the velocity profile (not raw position) for organic deceleration.
 */

import { record } from './movementTelemetry.js';

/**
 * Collection of easing functions.
 * Each takes a normalized time value t (0..1) and returns a normalized output (0..1).
 *
 * These are applied to the VELOCITY profile, meaning the derivative of the
 * position curve follows the easing shape. Position is computed by integrating
 * the eased velocity, producing smoother acceleration/deceleration.
 */
const EASING = {
    /** Constant speed from start to finish. */
    linear(t) {
        return t;
    },

    /** Starts slow, accelerates toward the end (quadratic). */
    ease_in(t) {
        return t * t;
    },

    /** Starts fast, decelerates toward the end (quadratic). */
    ease_out(t) {
        return t * (2 - t);
    },

    /** Slow start and end with faster middle (cosine-based for smooth velocity). */
    ease_in_out(t) {
        // Cosine interpolation — produces a smooth sinusoidal velocity profile
        // with zero velocity at both endpoints (no abrupt start or stop)
        return 0.5 * (1 - Math.cos(Math.PI * t));
    },

    /**
     * Overshoots the target then settles back smoothly via bezier continuation.
     * The overshoot is ~10% of travel distance, with smooth deceleration
     * into the final position — no discrete position jumps.
     */
    overshoot(t) {
        if (t <= 0) return 0;
        if (t >= 1) return 1;

        // Phase 1 (0..0.75): Accelerate past target using smooth cubic
        // Phase 2 (0.75..1): Settle back to target with cosine deceleration
        const overshootAmount = 0.10; // 10% overshoot

        if (t < 0.75) {
            // Cubic ease to overshoot position (1 + overshootAmount)
            const p = t / 0.75; // normalize to 0..1 within phase 1
            // Smooth cubic: starts slow, reaches (1 + overshoot) at p=1
            const eased = p * p * (3 - 2 * p); // smoothstep
            return eased * (1 + overshootAmount);
        } else {
            // Cosine settle-back from overshoot to 1.0
            const p = (t - 0.75) / 0.25; // normalize to 0..1 within phase 2
            const settleEase = 0.5 * (1 - Math.cos(Math.PI * p));
            const overshootPos = 1 + overshootAmount;
            return overshootPos + (1 - overshootPos) * settleEase;
        }
    },

    /** Bounces at the end like a dropped ball. */
    bounce(t) {
        if (t < 1 / 2.75) {
            return 7.5625 * t * t;
        } else if (t < 2 / 2.75) {
            return 7.5625 * (t -= 1.5 / 2.75) * t + 0.75;
        } else if (t < 2.5 / 2.75) {
            return 7.5625 * (t -= 2.25 / 2.75) * t + 0.9375;
        } else {
            return 7.5625 * (t -= 2.625 / 2.75) * t + 0.984375;
        }
    }
};

/** Interval between step callbacks in milliseconds (~50Hz). */
const STEP_INTERVAL_MS = 20;

/**
 * Self-correcting high-resolution timer that maintains consistent tick rate.
 * Uses setTimeout with drift compensation instead of setInterval to prevent
 * accumulating timing errors that cause jerky movement.
 *
 * @param {function} callback - Called on each tick
 * @param {number} intervalMs - Target interval in milliseconds
 * @returns {{ clear: function }} Handle with clear() method to stop
 */
function preciseInterval(callback, intervalMs) {
    let expected = Date.now() + intervalMs;
    let timer = null;
    let stopped = false;

    function tick() {
        if (stopped) return;
        callback();
        // Compensate for drift by adjusting next timeout
        const drift = Date.now() - expected;
        expected += intervalMs;
        // Clamp to prevent negative timeout (if tick took longer than interval)
        const nextDelay = Math.max(1, intervalMs - drift);
        timer = setTimeout(tick, nextDelay);
    }

    timer = setTimeout(tick, intervalMs);

    return {
        clear() {
            stopped = true;
            if (timer !== null) {
                clearTimeout(timer);
                timer = null;
            }
        }
    };
}

/**
 * Pre-compute all interpolated angles for a transition.
 * This guarantees every position is calculated upfront and no frames are
 * dropped due to timing variance during playback.
 *
 * @param {number} fromAngle - Starting angle
 * @param {number} toAngle - Target angle
 * @param {number} totalSteps - Number of interpolation steps
 * @param {function} easingFn - Easing function (t => easedT)
 * @returns {number[]} Array of rounded angle values, one per step
 */
function precomputeAngles(fromAngle, toAngle, totalSteps, easingFn) {
    const angles = new Array(totalSteps);
    for (let i = 0; i < totalSteps; i++) {
        const t = (i + 1) / totalSteps;
        const easedT = easingFn(Math.min(Math.max(t, 0), 1));
        angles[i] = Math.round(fromAngle + (toAngle - fromAngle) * easedT);
    }
    // Ensure final position is exactly the target
    if (totalSteps > 0) {
        angles[totalSteps - 1] = Math.round(toAngle);
    }
    return angles;
}

/**
 * Smoothly transition a servo from one angle to another using an easing curve.
 *
 * Calculates intermediate positions at ~20ms intervals (50Hz) and invokes
 * the onStep callback with each computed angle. Uses a self-correcting
 * high-resolution timer to maintain consistent update rate.
 *
 * All positions are pre-computed before playback begins, ensuring every
 * intermediate angle is delivered in sequence with no skipping.
 *
 * @param {string|number} partId - The hardware part identifier.
 * @param {number} fromAngle - Starting angle in degrees.
 * @param {number} toAngle - Target angle in degrees.
 * @param {number} durationMs - Desired transition duration in milliseconds.
 * @param {string} [easingName='ease_in_out'] - Name of the easing function.
 * @param {function(number): void} [onStep] - Callback invoked with each intermediate angle.
 * @param {object} [options] - Optional parameters.
 * @param {number} [options.maxSpeedDegPerSec] - Maximum servo speed in degrees/second.
 * @param {AbortSignal} [options.signal] - AbortSignal for cancellation.
 * @returns {Promise<{partId, fromAngle, toAngle, actualDurationMs, steps, angles}>}
 */
async function transitionServo(partId, fromAngle, toAngle, durationMs, easingName = 'ease_in_out', onStep, options = {}) {
    const { maxSpeedDegPerSec, signal } = options;

    // Resolve easing function, fall back to ease_in_out if unknown
    const easingFn = EASING[easingName] || EASING.ease_in_out;

    const angleDelta = Math.abs(toAngle - fromAngle);

    // If no movement needed, fire one step at the target and return immediately
    if (angleDelta === 0) {
        if (onStep) {
            onStep(Math.round(toAngle));
        }
        return { partId, fromAngle, toAngle, actualDurationMs: 0, steps: 1, angles: [Math.round(toAngle)] };
    }

    // Clamp duration to respect maxSpeedDegPerSec (lengthen if too fast)
    let actualDurationMs = Math.max(durationMs, 0);
    if (maxSpeedDegPerSec && maxSpeedDegPerSec > 0) {
        const minDurationMs = (angleDelta / maxSpeedDegPerSec) * 1000;
        if (actualDurationMs < minDurationMs) {
            actualDurationMs = Math.ceil(minDurationMs);
        }
    }

    // Ensure at least two intervals worth of duration for smooth movement
    if (actualDurationMs < STEP_INTERVAL_MS * 2) {
        actualDurationMs = STEP_INTERVAL_MS * 2;
    }

    const totalSteps = Math.max(2, Math.floor(actualDurationMs / STEP_INTERVAL_MS));

    // Pre-compute all angles upfront — no positions will be skipped
    const angles = precomputeAngles(fromAngle, toAngle, totalSteps, easingFn);

    return new Promise((resolve, reject) => {
        // Check if already aborted before starting
        if (signal && signal.aborted) {
            const err = new Error('Transition aborted');
            err.name = 'AbortError';
            reject(err);
            return;
        }

        let currentStep = 0;
        let interval = null;

        const cleanup = () => {
            if (interval !== null) {
                interval.clear();
                interval = null;
            }
        };

        // Listen for abort signal
        const onAbort = () => {
            cleanup();
            const err = new Error('Transition aborted');
            err.name = 'AbortError';
            reject(err);
        };

        if (signal) {
            signal.addEventListener('abort', onAbort, { once: true });
        }

        // Fire starting position immediately
        if (onStep) {
            onStep(Math.round(fromAngle));
        }

        const tick = () => {
            if (currentStep >= totalSteps) {
                cleanup();
                if (signal) {
                    signal.removeEventListener('abort', onAbort);
                }
                resolve({ partId, fromAngle, toAngle, actualDurationMs, steps: totalSteps + 1, angles });
                return;
            }

            const angle = angles[currentStep];
            currentStep++;

            if (onStep) {
                onStep(angle);
            }

            // Auto-complete on last step
            if (currentStep >= totalSteps) {
                cleanup();
                if (signal) {
                    signal.removeEventListener('abort', onAbort);
                }
                resolve({ partId, fromAngle, toAngle, actualDurationMs, steps: totalSteps + 1, angles });
            }
        };

        // Use self-correcting timer for consistent 50Hz
        interval = preciseInterval(tick, STEP_INTERVAL_MS);
    });
}

/**
 * Transition multiple servos simultaneously to their target positions.
 * Used by idleLoopService to move all claimed servos in a pose together.
 *
 * @param {number|string} characterId - Character ID (for context/logging)
 * @param {Array<{partId: string|number, value: number, currentValue?: number}>} parts - Parts to transition
 * @param {object} [options] - Transition options
 * @param {number} [options.durationMs=2000] - Transition duration
 * @param {string} [options.easing='ease_in_out'] - Easing function name
 * @param {number} [options.maxSpeedDegPerSec] - Speed limit
 * @param {AbortSignal} [options.signal] - Cancellation signal
 * @returns {Promise<Array>} Results from each servo transition
 */
async function transitionServos(characterId, parts, options = {}) {
    const {
        durationMs = 2000,
        easing = 'ease_in_out',
        maxSpeedDegPerSec,
        signal
    } = options;

    if (!parts || parts.length === 0) {
        return [];
    }

    // Check abort signal before starting
    if (signal && signal.aborted) {
        const err = new Error('Transition aborted');
        err.name = 'AbortError';
        throw err;
    }

    const startTime = Date.now();

    // For PCA9685 servos: send target angles in one batch command.
    // The servo hardware moves at its own speed — no need for 50Hz intermediate steps.
    // This avoids spawning hundreds of Python subprocesses per transition.
    let hwService = null;
    try {
        const hw = await import('../hardwareService/index.js');
        hwService = hw.default || hw;
    } catch (_) {}

    if (hwService && typeof hwService.batchMoveServos === 'function') {
        const commands = parts.map(p => ({
            partId: String(p.partId),
            angleDeg: p.value
        }));
        try {
            const batchResult = await hwService.batchMoveServos(commands);
            const elapsed = Date.now() - startTime;
            record('cycle_time_ms', elapsed, { characterId, partCount: parts.length });
            record('commands_per_second', parts.length / (elapsed / 1000 || 1), { characterId });
            return parts.map((p, i) => ({
                partId: String(p.partId),
                fromAngle: p.currentValue ?? p.value,
                toAngle: p.value,
                actualDurationMs: elapsed,
                steps: 1,
                batch: true,
                success: batchResult.results?.[i]?.success !== false
            }));
        } catch (err) {
            console.warn('[TransitionEngine] Batch move failed, falling back to individual:', err.message);
        }
    }

    // Fallback: individual servo transitions (for GPIO or if batch unavailable)
    const promises = parts.map(part => {
        const partId = String(part.partId);
        const fromAngle = part.currentValue ?? part.value;
        const toAngle = part.value;

        const onStep = hwService ? (angle) => {
            hwService.controlPart(partId, 'moveToAngle', { angleDeg: angle }).catch(() => {});
        } : null;

        return transitionServo(partId, fromAngle, toAngle, durationMs, easing, onStep, {
            maxSpeedDegPerSec,
            signal
        }).catch(err => {
            if (err.name === 'AbortError') throw err;
            console.warn(`[TransitionEngine] Servo ${partId} transition failed:`, err.message);
            return { partId, fromAngle, toAngle, actualDurationMs: 0, steps: 0, error: err.message };
        });
    });

    const results = await Promise.all(promises);

    const elapsed = Date.now() - startTime;
    record('cycle_time_ms', elapsed, { characterId, partCount: parts.length });
    record('commands_per_second', parts.length / (elapsed / 1000 || 1), { characterId });

    return results;
}

/**
 * Get the pre-computed angle sequence for a transition without executing it.
 * Useful for feeding into servoCommandBuffer.queueTransitionSequence().
 *
 * @param {number} fromAngle - Starting angle
 * @param {number} toAngle - Target angle
 * @param {number} durationMs - Duration in milliseconds
 * @param {string} [easingName='ease_in_out'] - Easing function name
 * @returns {{ angles: number[], intervalMs: number, totalSteps: number }}
 */
function computeTransitionAngles(fromAngle, toAngle, durationMs, easingName = 'ease_in_out') {
    const easingFn = EASING[easingName] || EASING.ease_in_out;
    const angleDelta = Math.abs(toAngle - fromAngle);

    if (angleDelta === 0) {
        return { angles: [Math.round(toAngle)], intervalMs: STEP_INTERVAL_MS, totalSteps: 1 };
    }

    const actualDurationMs = Math.max(durationMs, STEP_INTERVAL_MS * 2);
    const totalSteps = Math.max(2, Math.floor(actualDurationMs / STEP_INTERVAL_MS));
    const angles = precomputeAngles(fromAngle, toAngle, totalSteps, easingFn);

    return { angles, intervalMs: STEP_INTERVAL_MS, totalSteps };
}

export { EASING, STEP_INTERVAL_MS, transitionServo, transitionServos, computeTransitionAngles, precomputeAngles };
