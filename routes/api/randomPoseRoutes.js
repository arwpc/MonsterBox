/**
 * Random Pose API Routes
 * Control random pose generation during conversations
 */

import express from 'express';
import randomPoseService from '../../services/randomPoseService.js';

const router = express.Router();

/**
 * Get current random pose configuration
 */
router.get('/settings', (req, res) => {
    try {
        const config = randomPoseService.getConfig();
        res.json({
            success: true,
            enabled: !!config.enabled,
            cooldownMs: config.cooldownMs,
            minAmplitude: config.minAmplitude,
            maxAmplitude: config.maxAmplitude,
            settings: config
        });
    } catch (error) {
        console.error('Error getting random pose settings:', error);
        res.status(500).json({
            success: false,
            error: 'Failed to get random pose settings',
            message: error.message
        });
    }
});

router.get('/config', (req, res) => {
    try {
        const config = randomPoseService.getConfig();
        res.json({
            success: true,
            config
        });
    } catch (error) {
        console.error('Error getting random pose config:', error);
        res.status(500).json({
            success: false,
            error: 'Failed to get configuration',
            message: error.message
        });
    }
});

/**
 * Update random pose configuration
 */
router.post('/config', express.json(), (req, res) => {
    try {
        const result = randomPoseService.updateConfig(req.body);
        res.json(result);
    } catch (error) {
        console.error('Error updating random pose config:', error);
        res.status(500).json({
            success: false,
            error: 'Failed to update configuration',
            message: error.message
        });
    }
});

/**
 * Enable random poses for a character
 */
router.post('/enable', express.json(), async (req, res) => {
    try {
        const { characterId, cooldownMs, minAmplitude, maxAmplitude } = req.body || {};

        const resolvedCharacterId = characterId || req.app?.locals?.config?.selectedCharacter;
        if (!resolvedCharacterId) {
            return res.status(400).json({ success: false, error: 'characterId is required' });
        }

        const result = await randomPoseService.enable(resolvedCharacterId, {
            cooldownMs,
            minAmplitude,
            maxAmplitude
        });

        res.json(Object.assign({}, result, { characterId: resolvedCharacterId }));
    } catch (error) {
        console.error('Error enabling random poses:', error);
        res.status(500).json({
            success: false,
            error: 'Failed to enable random poses',
            message: error.message
        });
    }
});

/**
 * Disable random poses
 */
router.post('/disable', (req, res) => {
    try {
        const result = randomPoseService.disable();
        res.json(result);
    } catch (error) {
        console.error('Error disabling random poses:', error);
        res.status(500).json({
            success: false,
            error: 'Failed to disable random poses',
            message: error.message
        });
    }
});

/**
 * Manually trigger a random pose
 */
router.post('/trigger', express.json(), async (req, res) => {
    try {
        const { characterId } = req.body;

        if (!characterId) {
            return res.status(400).json({
                success: false,
                error: 'characterId is required'
            });
        }

        const result = await randomPoseService.generateAndExecuteRandomPose(characterId);
        res.json(result);
    } catch (error) {
        console.error('Error triggering random pose:', error);
        res.status(500).json({
            success: false,
            error: 'Failed to trigger random pose',
            message: error.message
        });
    }
});

/**
 * Ensure default poses exist for a character
 */
router.post('/ensure-defaults', express.json(), async (req, res) => {
    try {
        const { characterId } = req.body;

        if (!characterId) {
            return res.status(400).json({
                success: false,
                error: 'characterId is required'
            });
        }

        const result = await randomPoseService.ensureDefaultPoses(characterId);
        res.json(result);
    } catch (error) {
        console.error('Error ensuring default poses:', error);
        res.status(500).json({
            success: false,
            error: 'Failed to ensure default poses',
            message: error.message
        });
    }
});

export default router;

