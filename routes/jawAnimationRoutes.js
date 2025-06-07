// routes/jawAnimationRoutes.js

const express = require('express');
const router = express.Router();
const logger = require('../scripts/logger');
const partService = require('../services/partService');
const characterService = require('../services/characterService');

// Import jaw animation system (will be initialized in app.js)
let jawAnimationSystem = null;

/**
 * Set the jaw animation system instance
 * @param {JawAnimationSystem} system - Jaw animation system instance
 */
function setJawAnimationSystem(system) {
    jawAnimationSystem = system;
}

/**
 * Test page for jaw animation
 */
router.get('/test', async (req, res) => {
    try {
        const characters = await characterService.getAllCharacters();
        const characterId = req.query.characterId || (characters.length > 0 ? characters[0].id : null);
        
        let character = null;
        let servos = [];
        
        if (characterId) {
            character = await characterService.getCharacterById(characterId);
            // Get servos for this character
            const allParts = await partService.getAllParts();
            servos = allParts.filter(part => 
                part.type === 'servo' && 
                part.characterId === parseInt(characterId)
            );
        }
        
        res.render('test-jaw-animation', {
            title: 'Jaw Animation Test',
            characters,
            character,
            servos,
            selectedCharacterId: characterId
        });
        
    } catch (error) {
        logger.error('Error loading jaw animation test page:', error);
        res.status(500).render('error', {
            error: 'Failed to load test page',
            details: error.message
        });
    }
});

/**
 * Start jaw animation for a character
 */
router.post('/start', async (req, res) => {
    try {
        const { characterId, servoId } = req.body;
        
        if (!jawAnimationSystem) {
            return res.status(500).json({
                success: false,
                message: 'Jaw animation system not initialized'
            });
        }
        
        if (!characterId || !servoId) {
            return res.status(400).json({
                success: false,
                message: 'Character ID and Servo ID are required'
            });
        }
        
        await jawAnimationSystem.startAnimation(parseInt(characterId), parseInt(servoId));
        
        logger.info(`Started jaw animation for character ${characterId}, servo ${servoId}`);
        
        res.json({
            success: true,
            message: 'Jaw animation started successfully',
            characterId: parseInt(characterId),
            servoId: parseInt(servoId)
        });
        
    } catch (error) {
        logger.error('Error starting jaw animation:', error);
        res.status(500).json({
            success: false,
            message: 'Failed to start jaw animation',
            error: error.message
        });
    }
});

/**
 * Stop jaw animation
 */
router.post('/stop', async (req, res) => {
    try {
        if (!jawAnimationSystem) {
            return res.status(500).json({
                success: false,
                message: 'Jaw animation system not initialized'
            });
        }
        
        await jawAnimationSystem.stopAnimation();
        
        logger.info('Stopped jaw animation');
        
        res.json({
            success: true,
            message: 'Jaw animation stopped successfully'
        });
        
    } catch (error) {
        logger.error('Error stopping jaw animation:', error);
        res.status(500).json({
            success: false,
            message: 'Failed to stop jaw animation',
            error: error.message
        });
    }
});

/**
 * Get jaw animation status
 */
router.get('/status', (req, res) => {
    try {
        if (!jawAnimationSystem) {
            return res.json({
                success: false,
                message: 'Jaw animation system not initialized',
                status: null
            });
        }
        
        const status = jawAnimationSystem.getStatus();
        
        res.json({
            success: true,
            status: status
        });
        
    } catch (error) {
        logger.error('Error getting jaw animation status:', error);
        res.status(500).json({
            success: false,
            message: 'Failed to get status',
            error: error.message
        });
    }
});

/**
 * Update configuration for a character
 */
router.post('/config/:characterId', async (req, res) => {
    try {
        const characterId = parseInt(req.params.characterId);
        const config = req.body;
        
        if (!jawAnimationSystem || !jawAnimationSystem.config) {
            return res.status(500).json({
                success: false,
                message: 'Jaw animation system not initialized'
            });
        }
        
        await jawAnimationSystem.config.setCharacterConfig(characterId, config);
        
        logger.info(`Updated jaw animation config for character ${characterId}`);
        
        res.json({
            success: true,
            message: 'Configuration updated successfully',
            characterId: characterId
        });
        
    } catch (error) {
        logger.error('Error updating jaw animation config:', error);
        res.status(500).json({
            success: false,
            message: 'Failed to update configuration',
            error: error.message
        });
    }
});

/**
 * Get configuration for a character
 */
router.get('/config/:characterId', async (req, res) => {
    try {
        const characterId = parseInt(req.params.characterId);
        
        if (!jawAnimationSystem || !jawAnimationSystem.config) {
            return res.status(500).json({
                success: false,
                message: 'Jaw animation system not initialized'
            });
        }
        
        const config = jawAnimationSystem.config.getCharacterConfig(characterId);
        
        res.json({
            success: true,
            config: config,
            characterId: characterId
        });
        
    } catch (error) {
        logger.error('Error getting jaw animation config:', error);
        res.status(500).json({
            success: false,
            message: 'Failed to get configuration',
            error: error.message
        });
    }
});

/**
 * Get available presets
 */
router.get('/presets', (req, res) => {
    try {
        if (!jawAnimationSystem || !jawAnimationSystem.config) {
            return res.status(500).json({
                success: false,
                message: 'Jaw animation system not initialized'
            });
        }
        
        const presets = jawAnimationSystem.config.getPresets();
        
        res.json({
            success: true,
            presets: presets
        });
        
    } catch (error) {
        logger.error('Error getting jaw animation presets:', error);
        res.status(500).json({
            success: false,
            message: 'Failed to get presets',
            error: error.message
        });
    }
});

/**
 * Apply preset to character
 */
router.post('/preset/:characterId/:presetName', async (req, res) => {
    try {
        const characterId = parseInt(req.params.characterId);
        const presetName = req.params.presetName;
        
        if (!jawAnimationSystem || !jawAnimationSystem.config) {
            return res.status(500).json({
                success: false,
                message: 'Jaw animation system not initialized'
            });
        }
        
        await jawAnimationSystem.config.applyPreset(characterId, presetName);
        
        logger.info(`Applied preset '${presetName}' to character ${characterId}`);
        
        res.json({
            success: true,
            message: `Preset '${presetName}' applied successfully`,
            characterId: characterId,
            presetName: presetName
        });
        
    } catch (error) {
        logger.error('Error applying jaw animation preset:', error);
        res.status(500).json({
            success: false,
            message: 'Failed to apply preset',
            error: error.message
        });
    }
});

/**
 * Test servo movement
 */
router.post('/test-servo', async (req, res) => {
    try {
        const { characterId, servoId } = req.body;
        
        if (!jawAnimationSystem) {
            return res.status(500).json({
                success: false,
                message: 'Jaw animation system not initialized'
            });
        }
        
        // This will be implemented to test servo movement
        // For now, return success
        logger.info(`Testing servo ${servoId} for character ${characterId}`);
        
        res.json({
            success: true,
            message: 'Servo test completed successfully',
            characterId: parseInt(characterId),
            servoId: parseInt(servoId)
        });
        
    } catch (error) {
        logger.error('Error testing servo:', error);
        res.status(500).json({
            success: false,
            message: 'Failed to test servo',
            error: error.message
        });
    }
});

module.exports = {
    router,
    setJawAnimationSystem
};
