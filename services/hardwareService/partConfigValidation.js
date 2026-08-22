/**
 * Part-config patch validation, shared by every writer that lands config
 * values in a character's parts.json (the calibration Overrides POST, the
 * calibration PUT /api/parts/:id, and the global PUT /api/parts/:id).
 *
 * Why this exists: config.servoType is a load-bearing identity key. The
 * knight's 900° head servo is driven correctly ONLY while
 * servoType === 'multi-turn' and rotationRangeDeg declares the real span —
 * a writer that stores a typo (or a UI select that cannot represent the
 * value and posts a retype) makes a commanded 450 real degrees land at 900,
 * which wraps the head cabling. channel decides WHICH servo moves, so a
 * stray value drives the wrong part. These three keys are therefore
 * validated in one place before any writer persists them.
 *
 * Contract: null is the deliberate "delete this key" signal on all of these
 * writers and is always accepted; absent keys are untouched. Only a value
 * that is PRESENT and NON-NULL is validated.
 */

export const SERVO_TYPES = ['standard', 'continuous', 'multi-turn', 'feedback'];

const ROTATION_RANGE_MIN_DEG = 1;
const ROTATION_RANGE_MAX_DEG = 3600;
const PCA9685_CHANNEL_MIN = 0;
const PCA9685_CHANNEL_MAX = 15;

// Number('') and Number('  ') are 0, which would let a blank string slip
// through a range check and be persisted verbatim — treat blank as NaN.
function asNumber(value) {
    if (typeof value === 'string' && value.trim() === '') return NaN;
    return Number(value);
}

/**
 * Validate the identity keys of a part-config patch.
 *
 * @param {object|undefined|null} patch — the config fragment about to be
 *   written (an overrides object or an updates.config object). Non-objects
 *   and absent patches validate trivially; the caller's own shape checks
 *   still apply.
 * @returns {{ok: true} | {ok: false, error: string}}
 */
export function validatePartConfigPatch(patch) {
    if (patch == null || typeof patch !== 'object' || Array.isArray(patch)) {
        return { ok: true };
    }

    if (patch.servoType !== undefined && patch.servoType !== null) {
        const normalized = String(patch.servoType).trim().toLowerCase();
        if (!SERVO_TYPES.includes(normalized)) {
            return {
                ok: false,
                error: `Invalid servoType "${patch.servoType}" — accepted values: ${SERVO_TYPES.join(', ')} (or null to remove the override)`
            };
        }
    }

    if (patch.rotationRangeDeg !== undefined && patch.rotationRangeDeg !== null) {
        const range = asNumber(patch.rotationRangeDeg);
        if (!Number.isFinite(range) || range < ROTATION_RANGE_MIN_DEG || range > ROTATION_RANGE_MAX_DEG) {
            return {
                ok: false,
                error: `Invalid rotationRangeDeg "${patch.rotationRangeDeg}" — must be a finite number of degrees between ${ROTATION_RANGE_MIN_DEG} and ${ROTATION_RANGE_MAX_DEG} (or null to remove the override)`
            };
        }
    }

    if (patch.channel !== undefined && patch.channel !== null) {
        const channel = asNumber(patch.channel);
        if (!Number.isInteger(channel) || channel < PCA9685_CHANNEL_MIN || channel > PCA9685_CHANNEL_MAX) {
            return {
                ok: false,
                error: `Invalid channel "${patch.channel}" — must be an integer between ${PCA9685_CHANNEL_MIN} and ${PCA9685_CHANNEL_MAX} (or null to remove the override)`
            };
        }
    }

    return { ok: true };
}

export default validatePartConfigPatch;
