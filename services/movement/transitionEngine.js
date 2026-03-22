/**
 * Transition Engine — smooth servo movement with easing functions.
 *
 * Calculates intermediate positions at ~20Hz (50ms intervals) and calls
 * a step callback for each position, enabling smooth animated transitions
 * between servo angles.
 *
 * No external dependencies.
 */

/**
 * Collection of easing functions.
 * Each takes a normalized time value t (0..1) and returns a normalized output (0..1).
 * Used by transitionServo to shape the movement curve.
 */
const EASING = {
    /** Constant speed from start to finish. */
    linear(t) {
        return t;
    },

    /** Starts slow, accelerates toward the end. */
    ease_in(t) {
        return t * t;
    },

    /** Starts fast, decelerates toward the end. */
    ease_out(t) {
        return t * (2 - t);
    },

    /** Slow start and end with faster middle. */
    ease_in_out(t) {
        return t < 0.5
            ? 2 * t * t
            : -1 + (4 - 2 * t) * t;
    },

    /** Overshoots the target slightly then settles back (10% overshoot). */
    overshoot(t) {
        const s = 1.70158;
        return (t -= 1) * t * ((s + 1) * t + s) + 1;
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

/** Interval between step callbacks in milliseconds (~20Hz). */
const STEP_INTERVAL_MS = 50;

/**
 * Smoothly transition a servo from one angle to another using an easing curve.
 *
 * Calculates intermediate positions at ~50ms intervals (20Hz) and invokes
 * the onStep callback with each computed angle. Returns a Promise that
 * resolves when the transition is complete (or rejects if aborted).
 *
 * @param {string|number} partId - The hardware part identifier (for context; not used internally).
 * @param {number} fromAngle - Starting angle in degrees.
 * @param {number} toAngle - Target angle in degrees.
 * @param {number} durationMs - Desired transition duration in milliseconds.
 * @param {string} [easingName='linear'] - Name of the easing function (key in EASING object).
 * @param {function(number): void} [onStep] - Callback invoked with each intermediate angle (rounded to nearest integer).
 * @param {object} [options] - Optional parameters.
 * @param {number} [options.maxSpeedDegPerSec] - Maximum servo speed in degrees/second.
 *   If the requested duration would exceed this speed, the duration is clamped
 *   (lengthened) to stay within the limit, preventing potential servo damage.
 * @param {AbortSignal} [options.signal] - AbortSignal for cancellation. When aborted,
 *   the returned Promise rejects with an AbortError and no further steps fire.
 * @returns {Promise<{partId: string|number, fromAngle: number, toAngle: number, actualDurationMs: number, steps: number}>}
 *   Resolves with a summary object when the transition completes.
 *
 * @example
 * await transitionServo('servo-1', 0, 180, 1000, 'ease_in_out', (angle) => {
 *     console.log(`Move to ${angle}`);
 * });
 *
 * @example
 * // With speed clamping and cancellation
 * const ac = new AbortController();
 * setTimeout(() => ac.abort(), 500);
 * try {
 *     await transitionServo('servo-1', 0, 90, 200, 'linear', onStep, {
 *         maxSpeedDegPerSec: 180,
 *         signal: ac.signal
 *     });
 * } catch (err) {
 *     if (err.name === 'AbortError') console.log('Cancelled');
 * }
 */
async function transitionServo(partId, fromAngle, toAngle, durationMs, easingName = 'linear', onStep, options = {}) {
    const { maxSpeedDegPerSec, signal } = options;

    // Resolve easing function, fall back to linear if unknown
    const easingFn = EASING[easingName] || EASING.linear;

    const angleDelta = Math.abs(toAngle - fromAngle);

    // If no movement needed, fire one step at the target and return immediately
    if (angleDelta === 0) {
        if (onStep) {
            onStep(Math.round(toAngle));
        }
        return { partId, fromAngle, toAngle, actualDurationMs: 0, steps: 1 };
    }

    // Clamp duration to respect maxSpeedDegPerSec (lengthen if too fast)
    let actualDurationMs = Math.max(durationMs, 0);
    if (maxSpeedDegPerSec && maxSpeedDegPerSec > 0) {
        const minDurationMs = (angleDelta / maxSpeedDegPerSec) * 1000;
        if (actualDurationMs < minDurationMs) {
            actualDurationMs = Math.ceil(minDurationMs);
        }
    }

    // Ensure at least one interval worth of duration
    if (actualDurationMs < STEP_INTERVAL_MS) {
        actualDurationMs = STEP_INTERVAL_MS;
    }

    const totalSteps = Math.max(1, Math.floor(actualDurationMs / STEP_INTERVAL_MS));
    let stepCount = 0;

    return new Promise((resolve, reject) => {
        // Check if already aborted before starting
        if (signal && signal.aborted) {
            const err = new Error('Transition aborted');
            err.name = 'AbortError';
            reject(err);
            return;
        }

        let currentStep = 0;
        let timer = null;

        const cleanup = () => {
            if (timer !== null) {
                clearInterval(timer);
                timer = null;
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

        const tick = () => {
            currentStep++;
            stepCount++;

            // Normalize time to 0..1
            const t = Math.min(currentStep / totalSteps, 1);
            const easedT = easingFn(t);

            // Interpolate angle
            const angle = Math.round(fromAngle + (toAngle - fromAngle) * easedT);

            if (onStep) {
                onStep(angle);
            }

            // Done when we've reached or passed the final step
            if (currentStep >= totalSteps) {
                cleanup();
                if (signal) {
                    signal.removeEventListener('abort', onAbort);
                }
                resolve({ partId, fromAngle, toAngle, actualDurationMs, steps: stepCount });
            }
        };

        // Fire the first step for the starting position
        if (onStep) {
            onStep(Math.round(fromAngle));
            stepCount++;
        }

        timer = setInterval(tick, STEP_INTERVAL_MS);
    });
}

export { EASING, transitionServo };
