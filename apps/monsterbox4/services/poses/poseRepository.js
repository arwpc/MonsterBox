/**
 * Pose Repository
 * Handles reading and writing pose data to/from storage
 */

import fs from 'fs/promises';
import path from 'path';
import { fileURLToPath } from 'url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

const POSES_FILE = path.resolve(__dirname, '../../../data/poses.json');

/**
 * Load all poses for a character
 * @param {number} characterId - Character ID
 * @returns {Promise<Object>} - Poses data
 */
export async function loadPoses(characterId) {
    try {
        const data = await fs.readFile(POSES_FILE, 'utf8');
        const posesData = JSON.parse(data);

        // Filter poses for the specified character
        if (posesData.characterId === characterId) {
            return posesData;
        }

        // Return empty structure if no poses for this character
        return {
            characterId,
            poses: [],
            templates: posesData.templates || {}
        };
    } catch (error) {
        console.warn('⚠️ Could not load poses:', error.message);
        return {
            characterId,
            poses: [],
            templates: {}
        };
    }
}

/**
 * Save poses data
 * @param {Object} posesData - Complete poses data structure
 * @returns {Promise<void>}
 */
export async function savePoses(posesData) {
    try {
        const jsonData = JSON.stringify(posesData, null, 2);
        await fs.writeFile(POSES_FILE, jsonData, 'utf8');
        console.log('✅ Poses saved successfully');
    } catch (error) {
        console.error('❌ Failed to save poses:', error.message);
        throw error;
    }
}

/**
 * Get a specific pose by ID
 * @param {number} characterId - Character ID
 * @param {number} poseId - Pose ID
 * @returns {Promise<Object|null>} - Pose data or null if not found
 */
export async function getPose(characterId, poseId) {
    const posesData = await loadPoses(characterId);
    return posesData.poses.find(pose => pose.id === poseId) || null;
}

/**
 * Add a new pose
 * @param {number} characterId - Character ID
 * @param {Object} poseData - Pose data (without ID)
 * @returns {Promise<Object>} - Created pose with ID
 */
export async function addPose(characterId, poseData) {
    const posesData = await loadPoses(characterId);

    // Generate new ID
    const maxId = posesData.poses.reduce((max, pose) => Math.max(max, pose.id), 0);
    const newId = maxId + 1;

    // Create new pose
    const newPose = {
        id: newId,
        ...poseData,
        created: new Date().toISOString()
    };

    posesData.poses.push(newPose);
    await savePoses(posesData);

    return newPose;
}

/**
 * Update an existing pose
 * @param {number} characterId - Character ID
 * @param {number} poseId - Pose ID
 * @param {Object} updates - Pose updates
 * @returns {Promise<Object|null>} - Updated pose or null if not found
 */
export async function updatePose(characterId, poseId, updates) {
    const posesData = await loadPoses(characterId);
    const poseIndex = posesData.poses.findIndex(pose => pose.id === poseId);

    if (poseIndex === -1) {
        return null;
    }

    // Update pose
    posesData.poses[poseIndex] = {
        ...posesData.poses[poseIndex],
        ...updates,
        id: poseId, // Ensure ID doesn't change
        modified: new Date().toISOString()
    };

    await savePoses(posesData);
    return posesData.poses[poseIndex];
}

/**
 * Delete a pose
 * @param {number} characterId - Character ID
 * @param {number} poseId - Pose ID
 * @returns {Promise<boolean>} - True if deleted, false if not found
 */
export async function deletePose(characterId, poseId) {
    const posesData = await loadPoses(characterId);
    const poseIndex = posesData.poses.findIndex(pose => pose.id === poseId);

    if (poseIndex === -1) {
        return false;
    }

    posesData.poses.splice(poseIndex, 1);
    await savePoses(posesData);

    return true;
}

/**
 * Get pose templates
 * @returns {Promise<Object>} - Pose templates
 */
export async function getTemplates() {
    try {
        const data = await fs.readFile(POSES_FILE, 'utf8');
        const posesData = JSON.parse(data);
        return posesData.templates || {};
    } catch (error) {
        console.warn('⚠️ Could not load pose templates:', error.message);
        return {};
    }
}

/**
 * Get poses by category
 * @param {number} characterId - Character ID
 * @param {string} category - Pose category
 * @returns {Promise<Array>} - Poses in category
 */
export async function getPosesByCategory(characterId, category) {
    const posesData = await loadPoses(characterId);
    return posesData.poses.filter(pose => pose.category === category);
}

/**
 * Validate pose data structure
 * @param {Object} poseData - Pose data to validate
 * @throws {Error} - If validation fails
 */
export function validatePose(poseData) {
    if (!poseData.name || typeof poseData.name !== 'string') {
        throw new Error('Pose name is required and must be a string');
    }

    if (!poseData.parts || !Array.isArray(poseData.parts) || poseData.parts.length === 0) {
        throw new Error('Pose must have at least one part');
    }

    for (const part of poseData.parts) {
        if (!part.partId || typeof part.partId !== 'number') {
            throw new Error('Each part must have a valid partId');
        }

        if (!part.type || typeof part.type !== 'string') {
            throw new Error('Each part must have a valid type');
        }

        if (!part.target || typeof part.target !== 'object') {
            throw new Error('Each part must have a target configuration');
        }
    }
}

export default {
    loadPoses,
    savePoses,
    getPose,
    addPose,
    updatePose,
    deletePose,
    getTemplates,
    getPosesByCategory,
    validatePose
};
