/**
 * Pose Library — Read and select poses for the movement system.
 *
 * Reads poses from data/character-{id}/poses.json and provides
 * filtering, lookup, and weighted random selection for idle loops.
 */

import fs from 'fs/promises';
import path from 'path';
import { fileURLToPath } from 'url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const DATA_DIR = path.resolve(__dirname, '../../data');

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
        tags: Array.isArray(pose.tags) ? pose.tags : [],
        weight: typeof pose.weight === 'number' && pose.weight > 0 ? pose.weight : 10
    };
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
export async function getIdlePoses(characterId) {
    const allPoses = await loadPoses(characterId);
    const idleTagged = allPoses.map(withDefaults).filter(p => p.tags.includes('idle'));

    if (idleTagged.length === 0 && allPoses.length > 0) {
        console.warn(`[poseLibrary] Character ${characterId} has ${allPoses.length} poses but none tagged "idle" — idle loop will stay still. Tag the poses you want it to pick.`);
    }
    return idleTagged;
}

/**
 * Weighted random selection from idle poses.
 *
 * @param {number|string} characterId
 * @param {number|string|null} excludeId - Pose ID to exclude (avoid repeating current pose)
 * @returns {Promise<Object|null>} Selected pose or null if none available
 */
export async function getRandomIdlePose(characterId, excludeId = null) {
    const poses = await getIdlePoses(characterId);
    if (poses.length === 0) return null;

    // Filter out the excluded pose (if any) — fall back to full list if only one pose
    let candidates = excludeId != null
        ? poses.filter(p => String(p.id) !== String(excludeId))
        : poses;
    if (candidates.length === 0) candidates = poses;

    // Weighted random selection
    const totalWeight = candidates.reduce((sum, p) => sum + p.weight, 0);
    let roll = Math.random() * totalWeight;

    for (const pose of candidates) {
        roll -= pose.weight;
        if (roll <= 0) return pose;
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

export default { getIdlePoses, getRandomIdlePose, getPoseById };
