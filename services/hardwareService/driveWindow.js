/**
 * Drive window for an absolute servo: the angle span a RUNTIME mover (jaw
 * animation, head tracking, speech co-expression, gesture engine) may command.
 *
 * Doctrine change, 2026-09-07 (operator ruling — "all hardware works; every
 * outstanding issue is software"): an UNCALIBRATED servo is driven through its
 * full mechanical span, it is no longer refused. Refusing was the v10 behaviour
 * ("no usable calibrated window — refusing to drive it") and, after the
 * 2026-09-06 fleet-wide calibration wipe, it left every jaw, neck and eye on the
 * fleet motionless while each direct command still worked — exactly the
 * "servos don't move" report this module answers.
 *
 * Resolution order:
 *   1. a MEASURED calibration window (store.get(): placeholders and degenerate
 *      windows are already withheld there);
 *   2. a caller-supplied preferred window — e.g. the jaw's own operator-authored
 *      min/max from super-powers.json, which is visible and editable in the UI;
 *   3. the placeholder span the calibration store stamped for this part;
 *   4. 0..rotationRangeDeg (180 for a standard servo).
 *
 * `calibrated` says whether (1) was used, so UIs can still show "not calibrated".
 * The fallback is logged once per part per process so it is never silent.
 */
import { getCalibrationStore, isPlaceholderProfile } from '../../server/calibration/store.js';

const announced = new Set();

function isWindow(w) {
    return !!(w && typeof w.minAngle === 'number' && typeof w.maxAngle === 'number'
        && Number.isFinite(w.minAngle) && Number.isFinite(w.maxAngle) && w.maxAngle > w.minAngle);
}

/**
 * Full mechanical span for a part, from its own config when it declares one.
 * @param {object} part
 * @returns {{minAngle:number, maxAngle:number}}
 */
export function fullSpanFor(part) {
    const cfg = (part && part.config) || {};
    const declared = Number(cfg.rotationRangeDeg ?? part?.rotationRangeDeg ?? cfg.maxAngle ?? cfg.rangeDeg);
    let span = Number.isFinite(declared) && declared > 0 ? declared : 180;
    // A multi-turn servo (the knight's 900° neck) can wrap its own head cabling
    // if swept through its whole range, so an UNCALIBRATED multi-turn part falls
    // back to a single turn's worth of travel, not the full range. Calibration
    // widens it deliberately.
    const multiTurn = String(cfg.servoType || part?.servoType || '').toLowerCase().includes('multi') || span > 360;
    if (multiTurn && span > 180) span = 180;
    return { minAngle: 0, maxAngle: span };
}

/**
 * @param {string|number} characterId
 * @param {object} part  parts.json entry (needs id; config used for the span)
 * @param {{preferred?:{minAngle:number,maxAngle:number}, preferredSource?:string, quiet?:boolean, store?:object}} [opts]
 *   `store` is a test seam (a JsonCalibrationStore on a scratch file); production callers omit it.
 * @returns {Promise<{minAngle:number, maxAngle:number, calibrated:boolean, source:string}>}
 */
export async function resolveDriveWindow(characterId, part, opts = {}) {
    let profile = null;
    try {
        const store = opts.store || getCalibrationStore();
        profile = await store.get(part.id, characterId);
    } catch (_) { /* uncalibrated — fall through */ }

    if (profile && !isPlaceholderProfile(profile) && isWindow(profile.bounds)) {
        return { minAngle: profile.bounds.minAngle, maxAngle: profile.bounds.maxAngle, calibrated: true, source: 'calibration' };
    }

    let out;
    if (isWindow(opts.preferred)) {
        out = { minAngle: opts.preferred.minAngle, maxAngle: opts.preferred.maxAngle, calibrated: false, source: opts.preferredSource || 'config' };
    } else if (profile && isWindow(profile.placeholderBounds)) {
        out = { minAngle: profile.placeholderBounds.minAngle, maxAngle: profile.placeholderBounds.maxAngle, calibrated: false, source: 'placeholder-span' };
    } else {
        const span = fullSpanFor(part);
        out = { minAngle: span.minAngle, maxAngle: span.maxAngle, calibrated: false, source: 'full-span' };
    }

    const key = `${characterId}:${part && part.id}`;
    if (!opts.quiet && !announced.has(key)) {
        announced.add(key);
        console.log(`[drive-window] character ${characterId} part ${part && part.id} ("${part && part.name}") is not calibrated — driving from its ${out.source} ${out.minAngle}..${out.maxAngle}°; calibrate it on /setup/calibration to refine`);
    }
    return out;
}

/** Test hook: forget which parts have been announced. */
export function _resetAnnouncements() {
    announced.clear();
}

export default { resolveDriveWindow, fullSpanFor };
