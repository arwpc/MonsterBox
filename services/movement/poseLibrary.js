/**
 * Pose Library — Read and select poses for the movement system.
 *
 * Reads poses from data/character-{id}/poses.json and provides
 * filtering, lookup, and weighted random selection for idle loops.
 */

import fs from 'fs/promises';
import path from 'path';
import { fileURLToPath } from 'url';
import { annotatePoses, HEALTH } from '../poses/poseHealth.js';
import { readPartAngle } from '../poses/poseBounds.js';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const DATA_DIR = path.resolve(__dirname, '../../data');

/**
 * Distance at which a candidate pose is half as likely as one already under the
 * character's nose. Tuned for a head servo whose useful travel is ~60 degrees.
 */
const DISTANCE_HALF_WEIGHT_DEG = 12;

/** Below this much travel a "new" pose reads as no movement at all. */
const MIN_MEANINGFUL_MOVE_DEG = 4;

// Blocked poses are announced once per process, not once per idle tick — the
// idle loop asks for this list every few seconds and the log lives on an SD card.
const _announcedBlocked = new Set();

/**
 * Load all poses for a character from its poses.json file.
 *
 * @param {number|string} characterId
 * @returns {Promise<Array>} Array of pose objects (empty if file missing)
 */
async function loadPoses(characterId) {
    const filePath = path.join(DATA_DIR, `character-${characterId}`, 'poses.json');
    try {
        const raw = await fs.readFile(filePath, 'utf8');
        const data = JSON.parse(raw);
        // poses.json wraps the array in { characterId, poses: [...] }
        const poses = Array.isArray(data) ? data : (data.poses || []);
        return poses;
    } catch (err) {
        if (err.code === 'ENOENT') {
            console.log(`[PoseLibrary] No poses.json for character ${characterId}`);
            return [];
        }
        console.error(`[PoseLibrary] Error reading poses for character ${characterId}:`, err.message);
        return [];
    }
}

/**
 * Apply default values to optional pose fields.
 *
 * @param {Object} pose - Raw pose object
 * @returns {Object} Pose with defaults applied (does not mutate original)
 */
function withDefaults(pose) {
    return {
        ...pose,
        holdVariance: pose.holdVariance ?? 500,
        transitionProfile: pose.transitionProfile || 'ease_in_out',
        // null means "use the character's movement-config default" rather than
        // baking a number in here where two defaults could disagree.
        transitionDurationMs: typeof pose.transitionDurationMs === 'number' && pose.transitionDurationMs > 0
            ? pose.transitionDurationMs
            : null,
        jitterDeg: typeof pose.jitterDeg === 'number' && pose.jitterDeg > 0 ? pose.jitterDeg : 0,
        tags: Array.isArray(pose.tags) ? pose.tags : [],
        weight: typeof pose.weight === 'number' && pose.weight > 0 ? pose.weight : 10
    };
}

/**
 * Angles a pose commands, keyed by String(partId). Only angular parts count —
 * a light or a timed actuator pulse has no position to be near or far from.
 */
export function poseAngles(pose) {
    const angles = {};
    if (!pose || !Array.isArray(pose.parts)) return angles;
    for (const part of pose.parts) {
        const angle = readPartAngle(part);
        if (angle != null && Number.isFinite(angle)) angles[String(part.partId)] = angle;
    }
    return angles;
}

/**
 * Mean absolute travel between the current position and a candidate pose,
 * over the parts they have in common. Returns null when they share none, which
 * means "distance is unknown" — not "distance is zero".
 */
export function poseDistance(currentAngles, pose) {
    if (!currentAngles) return null;
    const target = poseAngles(pose);
    let total = 0;
    let count = 0;
    for (const [partId, angle] of Object.entries(target)) {
        const from = currentAngles[partId];
        if (from == null || !Number.isFinite(Number(from))) continue;
        total += Math.abs(angle - Number(from));
        count++;
    }
    return count === 0 ? null : total / count;
}

/**
 * Turn a travel distance into a selection multiplier.
 *
 * Two things are being suppressed. Big jumps, because a head that alternates
 * between its extremes reads as a windshield wiper rather than a creature looking
 * around. And near-zero moves, because re-selecting where you already are burns a
 * hold with nothing to watch. What is left is a preference for small, plausible
 * shifts with the occasional larger one.
 */
export function distanceFactor(distance, options = {}) {
    if (distance == null) return 1; // unknown distance must not bias anything
    const halfWeightDeg = options.halfWeightDeg || DISTANCE_HALF_WEIGHT_DEG;
    const minMoveDeg = options.minMoveDeg != null ? options.minMoveDeg : MIN_MEANINGFUL_MOVE_DEG;

    const normalized = distance / halfWeightDeg;
    const proximity = 1 / (1 + normalized * normalized);
    const meaningful = minMoveDeg > 0 ? Math.min(1, distance / minMoveDeg) : 1;
    return proximity * meaningful;
}

/**
 * Get poses tagged "idle" for a character.
 *
 * Returns ONLY poses explicitly tagged "idle". This used to fall back to every
 * pose in the library when nothing was tagged — which fails open on a live
 * animatronic: remove the last idle tag and the loop starts picking gesture
 * poses at random, driving arms, actuators and lights that were authored to be
 * fired deliberately by a scene. An idle loop with nothing to play should do
 * nothing, which the caller already handles.
 *
 * @param {number|string} characterId
 * @returns {Promise<Array>} Idle-tagged poses with defaults applied
 */
export async function getIdlePoses(characterId, options = {}) {
    const allPoses = await loadPoses(characterId);
    const idleTagged = allPoses.map(withDefaults).filter(p => p.tags.includes('idle'));

    if (idleTagged.length === 0 && allPoses.length > 0) {
        console.warn(`[poseLibrary] Character ${characterId} has ${allPoses.length} poses but none tagged "idle" — idle loop will stay still. Tag the poses you want it to pick.`);
    }
    if (idleTagged.length === 0) return [];

    // Health is computed at load, not at execution: a pose that depends on a
    // quarantined or missing part cannot perform, and letting the idle loop pick
    // it means the character freezes for a hold while reporting that it moved.
    const annotated = await annotatePoses(characterId, idleTagged);
    if (options.includeBlocked) return annotated;

    const performable = [];
    for (const pose of annotated) {
        if (pose.health && pose.health.status === HEALTH.BLOCKED) {
            const key = `${characterId}:${pose.id}`;
            if (!_announcedBlocked.has(key)) {
                _announcedBlocked.add(key);
                const why = (pose.health.reasons || [])
                    .filter(r => r.level === HEALTH.BLOCKED)
                    .map(r => r.message)
                    .join('; ');
                console.warn(`[poseLibrary] Idle pose "${pose.name}" (${pose.id}) excluded — ${why}`);
            }
            continue;
        }
        performable.push(pose);
    }

    if (performable.length === 0 && annotated.length > 0) {
        console.warn(`[poseLibrary] Character ${characterId} has ${annotated.length} idle pose(s) but every one is blocked by hardware safety limits — idle loop will stay still.`);
    }
    return performable;
}

/**
 * Weighted random selection from idle poses, biased toward nearby positions.
 *
 * @param {number|string} characterId
 * @param {number|string|null} excludeId - Pose ID to exclude (avoid repeating current pose)
 * @param {Object} [options]
 * @param {Object} [options.currentAngles] - partId -> degrees, the position we are moving FROM
 * @param {number} [options.halfWeightDeg]
 * @param {number} [options.minMoveDeg]
 * @param {function} [options.rng]
 * @returns {Promise<Object|null>} Selected pose or null if none available
 */
export async function getRandomIdlePose(characterId, excludeId = null, options = {}) {
    const poses = await getIdlePoses(characterId);
    if (poses.length === 0) return null;

    // Filter out the excluded pose (if any) — fall back to full list if only one pose
    let candidates = excludeId != null
        ? poses.filter(p => String(p.id) !== String(excludeId))
        : poses;
    if (candidates.length === 0) candidates = poses;

    const rng = options.rng || Math.random;
    const currentAngles = options.currentAngles || null;

    let weights = candidates.map(pose => {
        const distance = poseDistance(currentAngles, pose);
        return Math.max(0, pose.weight * distanceFactor(distance, options));
    });

    // If distance weighting has zeroed everything (every candidate is where we
    // already are), fall back to the authored weights rather than returning null.
    let totalWeight = weights.reduce((sum, w) => sum + w, 0);
    if (!(totalWeight > 1e-9)) {
        weights = candidates.map(p => p.weight);
        totalWeight = weights.reduce((sum, w) => sum + w, 0);
    }

    let roll = rng() * totalWeight;
    for (let i = 0; i < candidates.length; i++) {
        roll -= weights[i];
        if (roll <= 0) return candidates[i];
    }

    // Fallback (shouldn't reach here, but be safe)
    return candidates[candidates.length - 1];
}

/**
 * Look up a single pose by ID.
 *
 * @param {number|string} characterId
 * @param {number|string} poseId
 * @returns {Promise<Object|null>} Pose with defaults or null if not found
 */
export async function getPoseById(characterId, poseId) {
    const allPoses = await loadPoses(characterId);
    const match = allPoses.find(p => String(p.id) === String(poseId));
    return match ? withDefaults(match) : null;
}

export default { getIdlePoses, getRandomIdlePose, getPoseById, poseAngles, poseDistance, distanceFactor };
