/**
 * Hardware Safety Limits
 *
 * Re-implements the safety-limit layer that was dropped when per-part calibration
 * moved to unified profiles. Two jobs:
 *
 *  1. CLAMP  — bound every outgoing hardware command (angle, speed, duration) to
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

// The config is read on the hot path of every hardware command. Cache it — this
// runs off an SD card and scene playback issues hundreds of commands a minute.
let _configCache = null;
let _configCacheAt = 0;
const CONFIG_TTL_MS = 30_000;

export function invalidateSafetyConfigCache() {
    _configCache = null;
    _configCacheAt = 0;
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
        maxSpeedPct: minDefined(fromFile.maxSpeedPct, fromProfile.maxSpeedPct),
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
    const safety = await getPartSafety(characterId, partId, profile);
    return !safety.excludeFromAutomatedTests && !safety.blockAllMotion && !safety.powerGroup;
}

const RETRACT_DIRECTIONS = new Set(['retract', 'reverse', 'down', 'in']);

// Actions that energize a motor/actuator and therefore draw current.
const ENERGIZING_ACTIONS = new Set([
    'moveToAngle', 'rotateContinuous', 'controlActuator', 'control',
    'moveSteps', 'setSpeed', 'move', 'jog', 'jogRaw', 'goto'
]);

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
 * @returns {{params: Object, adjustments: string[], blocked: string|null}}
 */
export function applySafetyLimits({ type, action, params, profile, safety, partId }) {
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
    if (isAngular) {
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

    // --- Speed cap: limits peak current draw, which is what pops a shared fuse ---
    if (safety.maxSpeedPct != null) {
        for (const key of ['speed', 'speedPct']) {
            if (out[key] != null) {
                const requested = Number(out[key]);
                if (!Number.isNaN(requested) && requested > safety.maxSpeedPct) {
                    adjustments.push(`${key} ${requested}% → ${safety.maxSpeedPct}% (speed cap)`);
                    out[key] = safety.maxSpeedPct;
                }
            }
        }
        // A move with no explicit speed would otherwise run at the controller
        // default (75-100%), silently escaping the cap.
        if (out.speed == null && ENERGIZING_ACTIONS.has(action) &&
            (type === 'linear_actuator' || type === 'motor')) {
            out.speed = safety.maxSpeedPct;
            adjustments.push(`speed defaulted to ${safety.maxSpeedPct}% (speed cap)`);
        }
    }

    // --- Duration cap: bounds how long a stalled part can sit drawing stall current ---
    if (safety.maxDurationMs != null && out.duration != null) {
        const requested = Number(out.duration);
        if (!Number.isNaN(requested) && requested > safety.maxDurationMs) {
            adjustments.push(`duration ${requested}ms → ${safety.maxDurationMs}ms (duration cap)`);
            out.duration = safety.maxDurationMs;
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
    applySafetyLimits,
    runInPowerGroup,
    invalidateSafetyConfigCache,
    resetPowerGroups
};
