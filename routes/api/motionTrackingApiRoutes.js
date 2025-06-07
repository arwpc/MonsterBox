const express = require('express');
const router = express.Router();
const characterService = require('../../services/characterService');
const logger = require('../../scripts/logger');
const { spawn } = require('child_process');
const path = require('path');

// Store active motion tracking processes
const activeTrackers = new Map();

/**
 * Start motion tracking for a character
 */
router.post('/start/:characterId', async (req, res) => {
    try {
        const characterId = parseInt(req.params.characterId);
        if (isNaN(characterId)) {
            return res.status(400).json({
                success: false,
                message: 'Invalid character ID'
            });
        }

        const character = await characterService.getCharacterById(characterId);
        if (!character) {
            return res.status(404).json({
                success: false,
                message: 'Character not found'
            });
        }

        if (!character.animatronic || !character.animatronic.motion_tracking || !character.animatronic.motion_tracking.enabled) {
            return res.status(400).json({
                success: false,
                message: 'Motion tracking not enabled for this character'
            });
        }

        // Check if already running
        if (activeTrackers.has(characterId)) {
            return res.json({
                success: true,
                message: 'Motion tracking already active',
                characterId: characterId
            });
        }

        // Start motion tracking process
        const scriptPath = path.join(__dirname, '../../scripts/motion_tracker.py');
        const sensitivity = character.animatronic.motion_tracking.sensitivity || 50;
        const deviceId = 0; // Default camera device

        const trackerProcess = spawn('python3', [
            scriptPath,
            '--device', deviceId.toString(),
            '--sensitivity', sensitivity.toString(),
            '--duration', '3600' // Run for 1 hour
        ]);

        // Store process info
        activeTrackers.set(characterId, {
            process: trackerProcess,
            startTime: new Date(),
            characterId: characterId
        });

        // Handle process events
        trackerProcess.on('error', (error) => {
            logger.error(`Motion tracker error for character ${characterId}:`, error);
            activeTrackers.delete(characterId);
        });

        trackerProcess.on('exit', (code) => {
            logger.info(`Motion tracker exited for character ${characterId} with code ${code}`);
            activeTrackers.delete(characterId);
        });

        logger.info(`Motion tracking started for character ${characterId}`);

        res.json({
            success: true,
            message: 'Motion tracking started',
            characterId: characterId,
            sensitivity: sensitivity
        });

    } catch (error) {
        logger.error('Error starting motion tracking:', error);
        res.status(500).json({
            success: false,
            message: 'Internal server error',
            error: error.message
        });
    }
});

/**
 * Stop motion tracking for a character
 */
router.post('/stop/:characterId', async (req, res) => {
    try {
        const characterId = parseInt(req.params.characterId);
        if (isNaN(characterId)) {
            return res.status(400).json({
                success: false,
                message: 'Invalid character ID'
            });
        }

        const trackerInfo = activeTrackers.get(characterId);
        if (!trackerInfo) {
            return res.json({
                success: false,
                message: 'No active motion tracking found for this character'
            });
        }

        // Stop the process
        trackerInfo.process.kill('SIGTERM');
        activeTrackers.delete(characterId);

        logger.info(`Motion tracking stopped for character ${characterId}`);

        res.json({
            success: true,
            message: 'Motion tracking stopped',
            characterId: characterId
        });

    } catch (error) {
        logger.error('Error stopping motion tracking:', error);
        res.status(500).json({
            success: false,
            message: 'Internal server error',
            error: error.message
        });
    }
});

/**
 * Get motion tracking status for a character
 */
router.get('/status/:characterId', async (req, res) => {
    try {
        const characterId = parseInt(req.params.characterId);
        if (isNaN(characterId)) {
            return res.status(400).json({
                success: false,
                message: 'Invalid character ID'
            });
        }

        const character = await characterService.getCharacterById(characterId);
        if (!character) {
            return res.status(404).json({
                success: false,
                message: 'Character not found'
            });
        }

        const trackerInfo = activeTrackers.get(characterId);
        const isActive = !!trackerInfo;

        res.json({
            success: true,
            characterId: characterId,
            motionTrackingEnabled: character.animatronic?.motion_tracking?.enabled || false,
            isActive: isActive,
            startTime: trackerInfo ? trackerInfo.startTime : null,
            uptime: trackerInfo ? Date.now() - trackerInfo.startTime.getTime() : 0
        });

    } catch (error) {
        logger.error('Error getting motion tracking status:', error);
        res.status(500).json({
            success: false,
            message: 'Internal server error',
            error: error.message
        });
    }
});

/**
 * Update motion tracking settings for a character
 */
router.post('/settings/:characterId', async (req, res) => {
    try {
        const characterId = parseInt(req.params.characterId);
        if (isNaN(characterId)) {
            return res.status(400).json({
                success: false,
                message: 'Invalid character ID'
            });
        }

        const { enabled, sensitivity, min_area } = req.body;

        const character = await characterService.getCharacterById(characterId);
        if (!character) {
            return res.status(404).json({
                success: false,
                message: 'Character not found'
            });
        }

        // Update motion tracking settings
        if (!character.animatronic) {
            character.animatronic = {};
        }
        if (!character.animatronic.motion_tracking) {
            character.animatronic.motion_tracking = {};
        }

        if (enabled !== undefined) character.animatronic.motion_tracking.enabled = enabled;
        if (sensitivity !== undefined) character.animatronic.motion_tracking.sensitivity = sensitivity;
        if (min_area !== undefined) character.animatronic.motion_tracking.min_area = min_area;

        // Save updated character
        await characterService.updateCharacter(characterId, character);

        logger.info(`Motion tracking settings updated for character ${characterId}`);

        res.json({
            success: true,
            message: 'Motion tracking settings updated',
            settings: character.animatronic.motion_tracking
        });

    } catch (error) {
        logger.error('Error updating motion tracking settings:', error);
        res.status(500).json({
            success: false,
            message: 'Internal server error',
            error: error.message
        });
    }
});

module.exports = router;
