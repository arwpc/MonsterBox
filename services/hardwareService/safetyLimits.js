/**
 * Hardware Safety Limits
 *
 * Re-implements the safety-limit layer that was dropped when per-part calibration
 * moved to unified profiles. Two jobs:
 *
 *  1. CLAMP  — bound every outgoing hardware command (angle, duration) to
 *              what the part is known to survive, and block moves that are known
 *              to damage hardware (e.g. retracting an actuator already sitting at
 *              its mechanical minimum).
 *  2. SERIALIZE — parts that share a fused power rail are never energized
 *              concurrently, and get a cooldown between commands, so simultaneous
 *              inrush current cannot pop the fuse.
 *
 * Limits come from two places and the MORE RESTRICTIVE value always wins:
 *   - `config/hardware-safety.json` — committed, deploys with the code, reviewable.
 *   - the node-local calibration profile's optional `safety` block — lets a node
 *     tighten (never loosen) its own limits after calibration.
 *
 * With neither present this module is a pass-through, so untouched parts behave
 * exactly as before.
 */

import fs from 'fs/promises';
import path from 'path';
import { fileURLToPath } from 'url';
import { isPlaceholderProfile } from '../../server/calibration/store.js';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

const SAFETY_CONFIG_PATH = path.resolve(__dirname, '../../config/hardware-safety.json');

// Physically broken hardware. Deliberately NOT part of the limit system above:
// nothing in the request path consults it and it never refuses an operator command.
// It exists so code that picks a part on its own initiative (a test suite, a
// diagnostic sweep) does not select a damaged one. See the file's own _readme.
const PHYSICAL_FAULTS_PATH = path.resolve(__dirname, '../../config/physical-faults.json');

// The config is read on the hot path of every hardware command. Cache it — this
// runs off an SD card and scene playback issues hundreds of commands a minute.
let _configCache = null;
let _configCacheAt = 0;
const CONFIG_TTL_MS = 30_000;

let _faultsCache = null;
let _faultsCacheAt = 0;

export function invalidateSafetyConfigCache() {
    _configCache = null;
    _configCacheAt = 0;
    _faultsCache = null;
    _faultsCacheAt = 0;
}

async function loadPhysicalFaults() {
    const now = Date.now();
    if (_faultsCache && (now - _faultsCacheAt) < CONFIG_TTL_MS) return _faultsCache;
    try {
        const raw = await fs.readFile(PHYSICAL_FAULTS_PATH, 'utf8');
        _faultsCache = JSON.parse(raw || '{}');
    } catch (e) {
        if (!e || e.code !== 'ENOENT') {
            console.warn(`⚠️  physical-faults.json unreadable (${e.message}) — automated suites will treat all hardware as healthy`);
        }
        _faultsCache = {};
    }
    _faultsCacheAt = now;
    return _faultsCache;
}

/**
 * Is this part recorded as physically broken right now?
 *
 * Advisory only. The operator may still drive a broken part deliberately; this
 * just stops automated callers from choosing one.
 *
 * @returns {Promise<{broken: boolean, reason: string|null}>}
 */
export async function getPhysicalFault(characterId, partId) {
    const cfg = await loadPhysicalFaults();
    const charCfg = (cfg.characters && cfg.characters[String(characterId)]) || {};
    const entry = (charCfg.parts && charCfg.parts[String(partId)]) || null;
    if (!entry || entry.status !== 'broken') return { broken: false, reason: null };
    return { broken: true, reason: entry.reason || 'declared physically broken' };
}

async function loadSafetyConfig() {
    const now = Date.now();
    if (_configCache && (now - _configCacheAt) < CONFIG_TTL_MS) return _configCache;
    try {
        const raw = await fs.readFile(SAFETY_CONFIG_PATH, 'utf8');
        _configCache = JSON.parse(raw || '{}');
    } catch (e) {
        // Missing or malformed config must never block hardware — degrade to no limits.
        if (!e || e.code !== 'ENOENT') {
            console.warn(`⚠️  hardware-safety.json unreadable (${e.message}) — proceeding without configured limits`);
        }
        _configCache = {};
    }
    _configCacheAt = now;
    return _configCache;
}

function minDefined(a, b) {
    if (a == null) return b;
    if (b == null) return a;
    return Math.min(a, b);
}

function maxDefined(a, b) {
    if (a == null) return b;
    if (b == null) return a;
    return Math.max(a, b);
}

/**
 * Merge the committed limits for a part with any node-local profile override,
 * keeping whichever value is tighter.
 *
 * @param {string|number} characterId
 * @param {string|number} partId
 * @param {Object|null} profile - calibration profile for the part, if any
 * @returns {Promise<Object>} merged safety descriptor (empty object = no limits)
 */
export async function getPartSafety(characterId, partId, profile = null) {
    const cfg = await loadSafetyConfig();
    const charCfg = (cfg.characters && cfg.characters[String(characterId)]) || {};
    const fromFile = (charCfg.parts && charCfg.parts[String(partId)]) || {};
    const fromProfile = (profile && profile.safety) || {};

    const merged = {
        // Tightest cap wins.
        maxDurationMs: minDefined(fromFile.maxDurationMs, fromProfile.maxDurationMs),
        // Tightest angle window wins (highest floor, lowest ceiling).
        minAngle: maxDefined(fromFile.minAngle, fromProfile.minAngle),
        maxAngle: minDefined(fromFile.maxAngle, fromProfile.maxAngle),
        // Either source may forbid motion; neither may permit what the other forbids.
        noRetractBelowMin: !!(fromFile.noRetractBelowMin || fromProfile.noRetractBelowMin),
        blockAllMotion: !!(fromFile.blockAllMotion || fromProfile.blockAllMotion),
        blockReason: fromFile.blockReason || fromProfile.blockReason || null,
        // Parts an automated suite must not drive on a real node (see isTestSafePart).
        excludeFromAutomatedTests: !!(fromFile.excludeFromAutomatedTests || fromProfile.excludeFromAutomatedTests),
        powerGroup: fromProfile.powerGroup || fromFile.powerGroup || null,
        notes: fromFile.notes || fromProfile.notes || null
    };

    if (merged.powerGroup) {
        const groups = charCfg.powerGroups || {};
        merged.powerGroupConfig = groups[merged.powerGroup] || { serialize: true, cooldownMs: 0 };
    }
    return merged;
}

/**
 * May an automated test suite physically drive this part?
 *
 * Unit tests run on real nodes, so a suite that picks "the first servo" can end up
 * repeatedly slamming a high-torque servo on a shared fuse — which is exactly what
 * was happening to one node's elbow on every `npm run test:smoke`. Tests should
 * select parts through this helper instead of taking the first of a type.
 *
 * @returns {Promise<boolean>}
 */
export async function isTestSafePart(characterId, partId, profile = null) {
    // config/hardware-safety.json is empty by operator ruling (2026-08-20), so the
    // three flags below are all false for every part and this used to degrade to
    // "everything is test-safe" — which made callers pick parts[0], which on the
    // affected node was a dead elbow on a fused rail. The physical-fault inventory is what actually
    // carries that knowledge now, and it is checked FIRST so an emptied safety
    // config can never again turn this helper into a pass-through.
    const fault = await getPhysicalFault(characterId, partId);
    if (fault.broken) return false;

    const safety = await getPartSafety(characterId, partId, profile);
    return !safety.excludeFromAutomatedTests && !safety.blockAllMotion && !safety.powerGroup;
}

const RETRACT_DIRECTIONS = new Set(['retract', 'reverse', 'down', 'in']);

/**
 * Clamp an outgoing hardware command to its safe envelope.
 *
 * @param {Object} ctx
 * @param {string} ctx.type - normalized part type (underscore style)
 * @param {string} ctx.action
 * @param {Object} ctx.params - action params (not mutated)
 * @param {Object|null} ctx.profile - calibration profile, if any
 * @param {Object} ctx.safety - from getPartSafety()
 * @param {string|number} ctx.partId
 * @param {boolean} [ctx.calibrationOverride] - supervised-calibration mode:
 *   relaxes the ANGLE WINDOW and the DURATION cap, nothing else. Calibration
 *   is the act of measuring a part's real travel, and the angle window — which
 *   encodes the PREVIOUS measurement (or a guess) — made that impossible: the
 *   operator was stopped at the old ceiling on the very page whose job is to
 *   find the new one. The duration cap likewise stopped homing short of the
 *   endstop while the tracker still recorded "homed". What NEVER relaxes:
 *   blockAllMotion, noRetractBelowMin, and power-group serialization — those
 *   protect wiring and fuses, and no measurement is worth re-blowing the fuse
 *   that taught us to add them. Only the operator-supervised calibration
 *   endpoints may set this flag.
 * @returns {{params: Object, adjustments: string[], blocked: string|null}}
 */
export function applySafetyLimits({ type, action, params, profile, safety, partId, calibrationOverride = false }) {
    const out = Object.assign({}, params);
    const adjustments = [];
    let blocked = null;

    if (!safety) return { params: out, adjustments, blocked };

    // --- Hard block: part quarantined entirely ---
    // Used when we cannot trust what a command will do physically — e.g. an actuator
    // whose wiring is ambiguous, so "extend" might actually retract. A direction-string
    // guard is worthless there, because the string and the physical effect disagree.
    // Refusing every move is the only safe stance until a human traces the wiring.
    if (safety.blockAllMotion) {
        blocked = `Part ${partId} is quarantined by hardware safety limits` +
                  (safety.blockReason ? `: ${safety.blockReason}` : '');
        return { params: out, adjustments, blocked };
    }

    // --- Hard block: retraction of a part sitting at its mechanical minimum ---
    // `jog-raw` deliberately bypasses bounds, so this is the only thing standing
    // between a bad command and a bent actuator.
    if (safety.noRetractBelowMin && out.direction != null) {
        if (RETRACT_DIRECTIONS.has(String(out.direction).toLowerCase())) {
            blocked = `Part ${partId} is at its mechanical minimum; retraction is disabled by hardware safety limits`;
            return { params: out, adjustments, blocked };
        }
    }

    // --- Angle clamp: calibrated bounds, further tightened by configured limits ---
    const isAngular = (type === 'servo' || type === 'continuous_servo') && out.angleDeg != null;
    if (isAngular && calibrationOverride) {
        // Loud on purpose: every unclamped excursion should be findable in the
        // log next to whatever happened during it.
        adjustments.push(`angle window NOT applied (supervised calibration override)`);
    }
    if (isAngular && !calibrationOverride) {
        // An autoGenerated profile is a PLACEHOLDER the calibration store stamps on
        // every uncalibrated absolute-servo (the full 0-180 mechanical span), not a
        // measurement. Treating it as calibration means believing a part is bounded
        // when nothing has ever measured it. Ignore it here so only genuinely
        // configured limits apply, and so an uncalibrated part reads as uncalibrated.
        const isPlaceholder = isPlaceholderProfile(profile);
        const bounds = (!isPlaceholder && profile && profile.bounds) || {};
        const lo = maxDefined(bounds.minAngle, safety.minAngle);
        const hi = minDefined(bounds.maxAngle, safety.maxAngle);
        const requested = Number(out.angleDeg);
        if (!Number.isNaN(requested)) {
            let clamped = requested;
            if (lo != null && clamped < lo) clamped = lo;
            if (hi != null && clamped > hi) clamped = hi;
            if (clamped !== requested) {
                adjustments.push(`angleDeg ${requested}° → ${clamped}° (bounds ${lo ?? '-'}..${hi ?? '-'})`);
                out.angleDeg = clamped;
            }
        }
    }

    // --- Duration cap: bounds how long a stalled part can sit drawing stall current ---
    if (safety.maxDurationMs != null && out.duration != null && !calibrationOverride) {
        const requested = Number(out.duration);
        if (!Number.isNaN(requested) && requested > safety.maxDurationMs) {
            adjustments.push(`duration ${requested}ms → ${safety.maxDurationMs}ms (duration cap)`);
            out.duration = safety.maxDurationMs;
        }
    } else if (safety.maxDurationMs != null && out.duration != null && calibrationOverride) {
        const requested = Number(out.duration);
        if (!Number.isNaN(requested) && requested > safety.maxDurationMs) {
            adjustments.push(`duration cap ${safety.maxDurationMs}ms NOT applied to ${requested}ms (supervised calibration override)`);
        }
    }

    return { params: out, adjustments, blocked };
}

// --- Power-group serialization -------------------------------------------------
// Parts sharing a fused rail must never be energized at the same time. Each group
// gets a promise-chain mutex plus a cooldown, so back-to-back commands on the pair
// cannot stack their inrush currents.

const _groupChains = new Map();   // groupKey -> Promise (tail of the queue)
const _groupLastEnd = new Map();  // groupKey -> timestamp of last release

function sleep(ms) {
    return new Promise(resolve => setTimeout(resolve, ms));
}

/**
 * Run `fn` with exclusive access to the part's power group.
 * Parts with no power group run immediately, unserialized.
 *
 * @param {string|number} characterId
 * @param {Object} safety - from getPartSafety()
 * @param {Function} fn - async worker
 */
export async function runInPowerGroup(characterId, safety, fn) {
    const group = safety && safety.powerGroup;
    const groupCfg = (safety && safety.powerGroupConfig) || {};
    if (!group || groupCfg.serialize === false) return fn();

    const key = `${characterId}:${group}`;
    const prev = _groupChains.get(key) || Promise.resolve();

    let release;
    const current = new Promise(resolve => { release = resolve; });
    // Queue behind whatever is already running on this rail. `prev` never rejects:
    // `current` only ever resolves, because release() runs in a finally.
    const tail = prev.then(() => current);
    _groupChains.set(key, tail);

    await prev;

    const cooldownMs = Number(groupCfg.cooldownMs || 0);
    if (cooldownMs > 0) {
        const since = Date.now() - (_groupLastEnd.get(key) || 0);
        if (since < cooldownMs) await sleep(cooldownMs - since);
    }

    try {
        return await fn();
    } finally {
        _groupLastEnd.set(key, Date.now());
        release();
        // Drop the chain entry once this is the tail, so the map can't grow forever.
        if (_groupChains.get(key) === tail) _groupChains.delete(key);
    }
}

/** Test hook: forget queued power-group state. */
export function resetPowerGroups() {
    _groupChains.clear();
    _groupLastEnd.clear();
}

export default {
    getPartSafety,
    isTestSafePart,
    getPhysicalFault,
    applySafetyLimits,
    runInPowerGroup,
    invalidateSafetyConfigCache,
    resetPowerGroups
};
