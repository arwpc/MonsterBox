/**
 * Transition Engine — smooth servo movement with velocity-based easing.
 *
 * Calculates intermediate positions at ~50Hz (20ms intervals) using
 * high-resolution self-correcting timer loops. Easing is applied to
 * the velocity profile (not raw position) for organic deceleration.
 */

import { record } from './movementTelemetry.js';
import { getEffectiveWindow, clampIntoWindow } from '../poses/poseBounds.js';

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
 * Interval between HARDWARE frames of a stepped multi-servo transition.
 *
 * Deliberately slower than STEP_INTERVAL_MS. Each frame is a full batchMoveServos
 * call, which re-reads the character's parts and calibration and takes the safety
 * layer's locks; 50Hz of that on an SD-card-backed Pi buys nothing a servo can
 * express. ~12Hz is well above the rate at which these servos actually slew.
 */
const FRAME_INTERVAL_MS = 80;

/** Hard ceiling on frames per transition, so a long duration cannot flood the bus. */
const MAX_FRAMES = 64;

/** Below this travel, easing is invisible and a single command is honest. */
const MIN_STEPPED_DELTA_DEG = 3;

/** Below this duration there is no room to ease; go straight there. */
const MIN_STEPPED_DURATION_MS = 250;

// ---- Believed servo position -------------------------------------------------
// Easing needs a starting angle, and these servos have no feedback. This is the
// last angle we COMMANDED, which is a belief, not a measurement — named that way
// on purpose. A part we have never commanded has no entry, and a transition
// without a start angle degrades to a single move rather than inventing one.
const _believedAngles = new Map(); // `${characterId}:${partId}` -> degrees

function believedKey(characterId, partId) {
    return `${characterId}:${String(partId)}`;
}

/** Last angle commanded for a part, or null if it has never been commanded. */
function getBelievedAngle(characterId, partId) {
    const value = _believedAngles.get(believedKey(characterId, partId));
    return value == null ? null : value;
}

/** Record the angle we just commanded for a part. */
function setBelievedAngle(characterId, partId, angle) {
    if (angle == null || !Number.isFinite(Number(angle))) return;
    _believedAngles.set(believedKey(characterId, partId), Number(angle));
}

/** Forget all believed positions (test hook / after an emergency stop). */
function clearBelievedAngles() {
    _believedAngles.clear();
}

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

function sleep(ms) {
    return new Promise(resolve => setTimeout(resolve, ms));
}

function throwIfAborted(signal) {
    if (signal && signal.aborted) {
        const err = new Error('Transition aborted');
        err.name = 'AbortError';
        throw err;
    }
}

/**
 * Decide how each part should be moved: eased over time, or in one command.
 *
 * A part is only stepped when all of these hold:
 *   - we believe where it currently is (no feedback exists, so a start angle we
 *     have not commanded ourselves would be a guess),
 *   - it has far enough to travel for easing to be visible,
 *   - it is NOT on a serialized power group. Frame-stepping a fused-rail part
 *     would take the rail's mutex and its cooldown once per frame — turning a
 *     2 s move into half a minute of repeated inrush on the exact rail whose
 *     fuse has blown before. Those parts get one command, as they always have.
 */
async function planParts(characterId, parts, options) {
    const steppable = [];
    const direct = [];

    for (const part of parts) {
        const partId = String(part.partId);
        const rawTarget = part.value ?? (part.target && part.target.angleDeg) ?? part.angleDeg;
        if (rawTarget == null) continue;
        const toAngle = Number(rawTarget);
        if (!Number.isFinite(toAngle)) continue;

        const entry = { partId, toAngle };

        if (options.stepped === false) {
            direct.push(entry);
            continue;
        }

        let window = null;
        try {
            window = await getEffectiveWindow(characterId, part.partId);
        } catch (_) { /* treat as unknown; the hardware layer still clamps */ }

        if (window && (window.blocked || window.powerGroup)) {
            direct.push(entry);
            continue;
        }

        const fromAngle = part.currentValue != null
            ? Number(part.currentValue)
            : getBelievedAngle(characterId, partId);

        if (fromAngle == null || !Number.isFinite(fromAngle)) {
            direct.push(entry);
            continue;
        }

        if (Math.abs(toAngle - fromAngle) < MIN_STEPPED_DELTA_DEG) {
            direct.push(entry);
            continue;
        }

        // Intermediate frames must respect the same window as the endpoints —
        // an overshoot easing curve is otherwise a bounds violation with a nice name.
        entry.fromAngle = window ? clampIntoWindow(fromAngle, window.lo, window.hi) : fromAngle;
        entry.toAngle = window ? clampIntoWindow(toAngle, window.lo, window.hi) : toAngle;
        entry.lo = window ? window.lo : null;
        entry.hi = window ? window.hi : null;
        steppable.push(entry);
    }

    return { steppable, direct };
}

/**
 * Transition multiple servos simultaneously to their target positions.
 * Used by idleLoopService and the pose engine to move all servos in a pose together.
 *
 * When a duration is given and the start angles are known, this now really eases:
 * intermediate positions are computed from the named easing curve and issued as
 * whole-pose frames, so `transitionProfile` finally describes something that
 * happens. Parts that cannot be stepped safely fall back to the single batched
 * command this function has always issued.
 *
 * @param {number|string} characterId - Character ID (for context/logging)
 * @param {Array<{partId: string|number, value: number, currentValue?: number}>} parts - Parts to transition
 * @param {object} [options] - Transition options
 * @param {number} [options.durationMs=2000] - Transition duration
 * @param {string} [options.easing='ease_in_out'] - Easing function name
 * @param {number} [options.maxSpeedDegPerSec] - Speed limit
 * @param {boolean} [options.stepped] - Force stepping on/off (default: auto)
 * @param {number} [options.frameIntervalMs] - Hardware frame interval
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
    throwIfAborted(signal);

    const startTime = Date.now();

    let hwService = null;
    try {
        const hw = await import('../hardwareService/index.js');
        hwService = hw.default || hw;
    } catch (_) {}

    if (hwService && typeof hwService.batchMoveServos === 'function') {
        try {
            const frameIntervalMs = Math.max(20, Number(options.frameIntervalMs) || FRAME_INTERVAL_MS);
            const wantsStepping = options.stepped !== false && durationMs >= MIN_STEPPED_DURATION_MS;
            const plan = wantsStepping
                ? await planParts(characterId, parts, options)
                : { steppable: [], direct: parts.map(p => ({
                      partId: String(p.partId),
                      toAngle: Number(p.value ?? (p.target && p.target.angleDeg) ?? p.angleDeg)
                  })).filter(c => Number.isFinite(c.toAngle)) };

            const results = [];

            // Frames for the eased parts, all moving together.
            if (plan.steppable.length > 0) {
                let easedDurationMs = Math.max(durationMs, MIN_STEPPED_DURATION_MS);
                if (maxSpeedDegPerSec && maxSpeedDegPerSec > 0) {
                    const maxDelta = plan.steppable.reduce(
                        (m, p) => Math.max(m, Math.abs(p.toAngle - p.fromAngle)), 0);
                    const minDurationMs = (maxDelta / maxSpeedDegPerSec) * 1000;
                    if (easedDurationMs < minDurationMs) easedDurationMs = Math.ceil(minDurationMs);
                }

                const frames = Math.min(MAX_FRAMES, Math.max(2, Math.round(easedDurationMs / frameIntervalMs)));
                const easingFn = EASING[easing] || EASING.ease_in_out;
                const tracks = plan.steppable.map(p => ({
                    ...p,
                    angles: precomputeAngles(p.fromAngle, p.toAngle, frames, easingFn)
                        // Overshoot/bounce curves leave the endpoints' span on purpose;
                        // the window is not negotiable, so re-clamp every frame.
                        .map(a => clampIntoWindow(a, p.lo, p.hi))
                }));

                const perFrameMs = easedDurationMs / frames;
                let lastFrameResult = null;

                for (let frame = 0; frame < frames; frame++) {
                    throwIfAborted(signal);
                    const frameStart = Date.now();
                    const commands = tracks.map(t => ({ partId: t.partId, angleDeg: t.angles[frame] }));
                    lastFrameResult = await hwService.batchMoveServos(commands, { characterId });
                    const spent = Date.now() - frameStart;
                    const remaining = perFrameMs - spent;
                    if (remaining > 1 && frame < frames - 1) await sleep(remaining);
                }

                const elapsed = Date.now() - startTime;
                for (let i = 0; i < tracks.length; i++) {
                    setBelievedAngle(characterId, tracks[i].partId, tracks[i].toAngle);
                    results.push({
                        partId: tracks[i].partId,
                        fromAngle: tracks[i].fromAngle,
                        toAngle: tracks[i].toAngle,
                        actualDurationMs: elapsed,
                        steps: frames,
                        eased: true,
                        easing,
                        success: lastFrameResult?.results?.[i]?.success !== false
                    });
                }
            }

            // Everything that could not be eased: one batched command, as before.
            if (plan.direct.length > 0) {
                throwIfAborted(signal);
                // Pass the character explicitly: part IDs are only unique within a
                // character, and resolving against the mutable selectedCharacter on disk
                // can land a command on a different physical channel.
                const batchResult = await hwService.batchMoveServos(
                    plan.direct.map(c => ({ partId: c.partId, angleDeg: c.toAngle })),
                    { characterId }
                );
                const elapsed = Date.now() - startTime;
                for (let i = 0; i < plan.direct.length; i++) {
                    setBelievedAngle(characterId, plan.direct[i].partId, plan.direct[i].toAngle);
                    results.push({
                        partId: plan.direct[i].partId,
                        fromAngle: null,
                        toAngle: plan.direct[i].toAngle,
                        actualDurationMs: elapsed,
                        steps: 1,
                        batch: true,
                        success: batchResult.results?.[i]?.success !== false
                    });
                }
            }

            const elapsed = Date.now() - startTime;
            // record(characterId, servoPartId, metric, value) — was called with the
            // wrong shape, corrupting telemetry (characterId='cycle_time_ms', etc.).
            record(characterId, '*', 'cycle_time_ms', elapsed);
            record(characterId, '*', 'commands_per_second', parts.length / (elapsed / 1000 || 1));
            return results;
        } catch (err) {
            if (err.name === 'AbortError') throw err;
            console.warn('[TransitionEngine] Batch move failed, falling back to individual:', err.message);
        }
    }

    // Fallback: individual servo transitions (for GPIO or if batch unavailable)
    const promises = parts.map(part => {
        const partId = String(part.partId);
        const targetAngle = part.value ?? (part.target && part.target.angleDeg) ?? part.angleDeg;
        const fromAngle = part.currentValue ?? targetAngle;
        const toAngle = targetAngle;

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
    record(characterId, '*', 'cycle_time_ms', elapsed);
    record(characterId, '*', 'commands_per_second', parts.length / (elapsed / 1000 || 1));

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

export {
    EASING,
    STEP_INTERVAL_MS,
    FRAME_INTERVAL_MS,
    MIN_STEPPED_DELTA_DEG,
    MIN_STEPPED_DURATION_MS,
    transitionServo,
    transitionServos,
    computeTransitionAngles,
    precomputeAngles,
    getBelievedAngle,
    setBelievedAngle,
    clearBelievedAngles
};
