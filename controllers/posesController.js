/**
 * Poses Controller
 * Handles pose management and execution
 */

import poseRepository from '../services/poses/poseRepository.js';
import poseEngine from '../services/poses/poseEngine.js';

/**
 * Get all poses for current character
 */
export async function getAllPoses(req, res) {
    try {
        const characterId = getCurrentCharacterId(req);
        const posesData = await poseRepository.loadPoses(characterId);
        
        res.json({
            success: true,
            characterId,
            poses: posesData.poses,
            templates: posesData.templates
        });
    } catch (error) {
        console.error('Error loading poses:', error);
        res.status(500).json({
            success: false,
            error: 'Failed to load poses',
            message: error.message
        });
    }
}

/**
 * Get a specific pose
 */
export async function getPose(req, res) {
    try {
        const characterId = getCurrentCharacterId(req);
        const poseId = parseInt(req.params.id);
        
        const pose = await poseRepository.getPose(characterId, poseId);
        if (!pose) {
            return res.status(404).json({
                success: false,
                error: 'Pose not found'
            });
        }
        
        res.json({
            success: true,
            pose
        });
    } catch (error) {
        console.error('Error getting pose:', error);
        res.status(500).json({
            success: false,
            error: 'Failed to get pose',
            message: error.message
        });
    }
}

/**
 * Create a new pose
 */
export async function createPose(req, res) {
    try {
        const characterId = getCurrentCharacterId(req);
        const poseData = req.body;
        
        // Validate pose data
        poseRepository.validatePose(poseData);
        
        // Create pose
        const newPose = await poseRepository.addPose(characterId, poseData);
        
        res.status(201).json({
            success: true,
            pose: newPose,
            message: 'Pose created successfully'
        });
    } catch (error) {
        console.error('Error creating pose:', error);
        res.status(400).json({
            success: false,
            error: 'Failed to create pose',
            message: error.message
        });
    }
}

/**
 * Update an existing pose
 */
export async function updatePose(req, res) {
    try {
        const characterId = getCurrentCharacterId(req);
        const poseId = parseInt(req.params.id);
        const updates = req.body;
        
        // Validate updates if they include pose structure
        if (updates.parts || updates.name) {
            poseRepository.validatePose({ ...updates, parts: updates.parts || [] });
        }
        
        const updatedPose = await poseRepository.updatePose(characterId, poseId, updates);
        if (!updatedPose) {
            return res.status(404).json({
                success: false,
                error: 'Pose not found'
            });
        }
        
        res.json({
            success: true,
            pose: updatedPose,
            message: 'Pose updated successfully'
        });
    } catch (error) {
        console.error('Error updating pose:', error);
        res.status(400).json({
            success: false,
            error: 'Failed to update pose',
            message: error.message
        });
    }
}

/**
 * Delete a pose
 */
export async function deletePose(req, res) {
    try {
        const characterId = getCurrentCharacterId(req);
        const poseId = parseInt(req.params.id);
        
        const deleted = await poseRepository.deletePose(characterId, poseId);
        if (!deleted) {
            return res.status(404).json({
                success: false,
                error: 'Pose not found'
            });
        }
        
        res.json({
            success: true,
            message: 'Pose deleted successfully'
        });
    } catch (error) {
        console.error('Error deleting pose:', error);
        res.status(500).json({
            success: false,
            error: 'Failed to delete pose',
            message: error.message
        });
    }
}

/**
 * Execute a pose
 */
export async function executePose(req, res) {
    try {
        const characterId = getCurrentCharacterId(req);
        const poseId = parseInt(req.params.id);
        const options = req.body || {};
        const fireAndForget = req.query.async === '1' || req.body?.async;

        console.log(`🎭 Executing pose ${poseId} for character ${characterId}${fireAndForget ? ' (async)' : ''}`);

        // In test mode, always respond immediately with simulated success
        const isTest = String(process.env.MB_TEST_MODE || '').toLowerCase() === '1' || String(process.env.NODE_ENV || '').toLowerCase() === 'test';
        if (isTest) {
            return res.json({
                success: true,
                result: { success: true, simulated: true, poseId, message: 'Simulated pose execution in test mode' },
                message: `Pose ${poseId} simulated successfully`
            });
        }

        // Fire-and-forget: respond immediately, execute in background
        if (fireAndForget) {
            poseEngine.executePose({ characterId, poseId, options }).catch(e => {
                console.error(`❌ Background pose ${poseId} failed:`, e.message);
            });
            return res.json({ success: true, async: true, poseId, message: 'Pose execution started' });
        }

        // Synchronous: wait for completion
        const result = await poseEngine.executePose({
            characterId,
            poseId,
            options
        });

        if (result.success) {
            res.json({
                success: true,
                result,
                message: `Pose "${result.poseName}" executed successfully`
            });
        } else {
            res.status(400).json({
                success: false,
                error: 'Pose execution failed',
                result
            });
        }
    } catch (error) {
        console.error('Error executing pose:', error);
        res.status(500).json({
            success: false,
            error: 'Failed to execute pose',
            message: error.message
        });
    }
}

/**
 * Get poses by category
 */
export async function getPosesByCategory(req, res) {
    try {
        const characterId = getCurrentCharacterId(req);
        const category = req.params.category;
        
        const poses = await poseRepository.getPosesByCategory(characterId, category);
        
        res.json({
            success: true,
            category,
            poses
        });
    } catch (error) {
        console.error('Error getting poses by category:', error);
        res.status(500).json({
            success: false,
            error: 'Failed to get poses by category',
            message: error.message
        });
    }
}

/**
 * Get pose templates
 */
export async function getTemplates(req, res) {
    try {
        const characterId = getCurrentCharacterId(req);
        const templates = await poseRepository.getTemplates(characterId);

        res.json({
            success: true,
            templates
        });
    } catch (error) {
        console.error('Error getting templates:', error);
        res.status(500).json({
            success: false,
            error: 'Failed to get templates',
            message: error.message
        });
    }
}

/**
 * Create pose from template
 */
export async function createFromTemplate(req, res) {
    try {
        const characterId = getCurrentCharacterId(req);
        const { templateName, option, customName, partId } = req.body;
        
        if (!templateName || !option || !partId) {
            return res.status(400).json({
                success: false,
                error: 'Template name, option, and partId are required'
            });
        }
        
        // Load templates
        const templates = await poseRepository.getTemplates(characterId);
        const template = templates[templateName];
        
        if (!template) {
            return res.status(404).json({
                success: false,
                error: 'Template not found'
            });
        }
        
        // Find option
        const templateOption = template.options.find(opt => opt.name === option);
        if (!templateOption) {
            return res.status(404).json({
                success: false,
                error: 'Template option not found'
            });
        }
        
        // Create pose from template
        const poseData = createPoseFromTemplate(templateName, templateOption, partId, customName);
        
        // Save pose
        const newPose = await poseRepository.addPose(characterId, poseData);
        
        res.status(201).json({
            success: true,
            pose: newPose,
            message: 'Pose created from template successfully'
        });
    } catch (error) {
        console.error('Error creating pose from template:', error);
        res.status(400).json({
            success: false,
            error: 'Failed to create pose from template',
            message: error.message
        });
    }
}

/**
 * Create pose data from template
 * @param {string} templateName - Template name
 * @param {Object} option - Template option
 * @param {number} partId - Part ID
 * @param {string} customName - Custom pose name
 * @returns {Object} - Pose data
 */
function createPoseFromTemplate(templateName, option, partId, customName) {
    const poseName = customName || `${templateName} - ${option.name}`;
    
    let target;
    if (templateName === 'elbow') {
        target = { angleDeg: option.angleDeg };
    } else if (templateName === 'head') {
        if (option.action === 'stop') {
            target = { continuous: { direction: 'stop', durationMs: 100 } };
        } else if (option.action === 'random') {
            target = { continuous: { direction: 'random', durationMs: 3000, pattern: 'wiggle' } };
        } else if (option.action === 'rotate_360') {
            target = { continuous: { direction: 'rotate_360', durationMs: 2000 } };
        }
    }
    
    return {
        name: poseName,
        description: `${option.name} pose created from ${templateName} template`,
        parts: [{
            partId: parseInt(partId),
            type: 'servo',
            target
        }],
        category: templateName,
        concurrent: false,
        notes: `Generated from ${templateName} template`
    };
}

/**
 * Get current character ID from request/config
 * @param {Object} req - Express request object
 * @returns {number} - Character ID
 */
function getCurrentCharacterId(req) {
    const characterId = parseInt(req.query.characterId) ||
           parseInt(req.app.locals?.config?.selectedCharacter);
    if (!characterId) {
        throw new Error('Character ID required — no character selected');
    }
    return characterId;
}

export default {
    getAllPoses,
    getPose,
    createPose,
    updatePose,
    deletePose,
    executePose,
    getPosesByCategory,
    getTemplates,
    createFromTemplate
};
