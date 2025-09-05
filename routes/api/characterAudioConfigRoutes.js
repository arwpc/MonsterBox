/**
 * Character Audio Configuration API Routes
 * Provides REST API endpoints for managing per-character audio settings
 */

const express = require('express');
const router = express.Router();
const characterAudioConfigService = require('../../services/characterAudioConfigService');
const logger = require('../../scripts/logger');

/**
 * GET /api/character-audio-config/:characterId
 * Get audio configuration for a specific character
 */
router.get('/:characterId', async (req, res) => {
    try {
        const characterId = req.params.characterId;
        
        if (!characterId || isNaN(parseInt(characterId))) {
            return res.status(400).json({
                success: false,
                error: 'Invalid character ID'
            });
        }
        
        const config = await characterAudioConfigService.getCharacterAudioConfig(characterId);
        
        res.json({
            success: true,
            data: config
        });
        
    } catch (error) {
        logger.error('Error getting character audio config:', error);
        res.status(500).json({
            success: false,
            error: 'Failed to get character audio configuration'
        });
    }
});

/**
 * PUT /api/character-audio-config/:characterId
 * Update audio configuration for a specific character
 */
router.put('/:characterId', async (req, res) => {
    try {
        const characterId = req.params.characterId;
        const updates = req.body;
        
        if (!characterId || isNaN(parseInt(characterId))) {
            return res.status(400).json({
                success: false,
                error: 'Invalid character ID'
            });
        }
        
        // Validate the configuration
        const validation = characterAudioConfigService.validateAudioConfig(updates);
        if (!validation.isValid) {
            return res.status(400).json({
                success: false,
                error: 'Invalid configuration',
                details: validation.errors
            });
        }
        
        const updatedConfig = await characterAudioConfigService.updateCharacterAudioConfig(characterId, updates);
        
        res.json({
            success: true,
            data: updatedConfig,
            message: 'Character audio configuration updated successfully'
        });
        
    } catch (error) {
        logger.error('Error updating character audio config:', error);
        res.status(500).json({
            success: false,
            error: 'Failed to update character audio configuration'
        });
    }
});

/**
 * GET /api/character-audio-config
 * Get all character audio configurations
 */
router.get('/', async (req, res) => {
    try {
        const configs = await characterAudioConfigService.getAllCharacterAudioConfigs();
        
        res.json({
            success: true,
            data: configs
        });
        
    } catch (error) {
        logger.error('Error getting all character audio configs:', error);
        res.status(500).json({
            success: false,
            error: 'Failed to get character audio configurations'
        });
    }
});

/**
 * DELETE /api/character-audio-config/:characterId
 * Delete audio configuration for a specific character
 */
router.delete('/:characterId', async (req, res) => {
    try {
        const characterId = req.params.characterId;
        
        if (!characterId || isNaN(parseInt(characterId))) {
            return res.status(400).json({
                success: false,
                error: 'Invalid character ID'
            });
        }
        
        const deleted = await characterAudioConfigService.deleteCharacterAudioConfig(characterId);
        
        if (deleted) {
            res.json({
                success: true,
                message: 'Character audio configuration deleted successfully'
            });
        } else {
            res.status(404).json({
                success: false,
                error: 'Character audio configuration not found'
            });
        }
        
    } catch (error) {
        logger.error('Error deleting character audio config:', error);
        res.status(500).json({
            success: false,
            error: 'Failed to delete character audio configuration'
        });
    }
});

/**
 * GET /api/character-audio-config/:characterId/optimized
 * Get optimized audio settings for real-time processing
 */
router.get('/:characterId/optimized', async (req, res) => {
    try {
        const characterId = req.params.characterId;
        
        if (!characterId || isNaN(parseInt(characterId))) {
            return res.status(400).json({
                success: false,
                error: 'Invalid character ID'
            });
        }
        
        const optimizedSettings = await characterAudioConfigService.getOptimizedAudioSettings(characterId);
        
        res.json({
            success: true,
            data: optimizedSettings
        });
        
    } catch (error) {
        logger.error('Error getting optimized audio settings:', error);
        res.status(500).json({
            success: false,
            error: 'Failed to get optimized audio settings'
        });
    }
});

/**
 * POST /api/character-audio-config/:characterId/validate
 * Validate audio configuration without saving
 */
router.post('/:characterId/validate', async (req, res) => {
    try {
        const config = req.body;
        const validation = characterAudioConfigService.validateAudioConfig(config);
        
        res.json({
            success: true,
            data: validation
        });
        
    } catch (error) {
        logger.error('Error validating audio config:', error);
        res.status(500).json({
            success: false,
            error: 'Failed to validate audio configuration'
        });
    }
});

/**
 * GET /api/character-audio-config/:characterId/export
 * Export character audio configuration
 */
router.get('/:characterId/export', async (req, res) => {
    try {
        const characterId = req.params.characterId;
        
        if (!characterId || isNaN(parseInt(characterId))) {
            return res.status(400).json({
                success: false,
                error: 'Invalid character ID'
            });
        }
        
        const exportData = await characterAudioConfigService.exportCharacterAudioConfig(characterId);
        
        // Set headers for file download
        res.setHeader('Content-Type', 'application/json');
        res.setHeader('Content-Disposition', `attachment; filename="character-${characterId}-audio-config.json"`);
        
        res.json(exportData);
        
    } catch (error) {
        logger.error('Error exporting character audio config:', error);
        res.status(500).json({
            success: false,
            error: 'Failed to export character audio configuration'
        });
    }
});

/**
 * POST /api/character-audio-config/:characterId/import
 * Import character audio configuration
 */
router.post('/:characterId/import', async (req, res) => {
    try {
        const characterId = req.params.characterId;
        const importData = req.body;
        
        if (!characterId || isNaN(parseInt(characterId))) {
            return res.status(400).json({
                success: false,
                error: 'Invalid character ID'
            });
        }
        
        if (!importData || !importData.config) {
            return res.status(400).json({
                success: false,
                error: 'Invalid import data format'
            });
        }
        
        await characterAudioConfigService.importCharacterAudioConfig(characterId, importData);
        
        res.json({
            success: true,
            message: 'Character audio configuration imported successfully'
        });
        
    } catch (error) {
        logger.error('Error importing character audio config:', error);
        res.status(500).json({
            success: false,
            error: error.message || 'Failed to import character audio configuration'
        });
    }
});

/**
 * POST /api/character-audio-config/:characterId/reset
 * Reset character audio configuration to defaults
 */
router.post('/:characterId/reset', async (req, res) => {
    try {
        const characterId = req.params.characterId;
        
        if (!characterId || isNaN(parseInt(characterId))) {
            return res.status(400).json({
                success: false,
                error: 'Invalid character ID'
            });
        }
        
        // Delete existing config to trigger default creation
        await characterAudioConfigService.deleteCharacterAudioConfig(characterId);
        
        // Get the default configuration
        const defaultConfig = await characterAudioConfigService.getCharacterAudioConfig(characterId);
        
        res.json({
            success: true,
            data: defaultConfig,
            message: 'Character audio configuration reset to defaults'
        });
        
    } catch (error) {
        logger.error('Error resetting character audio config:', error);
        res.status(500).json({
            success: false,
            error: 'Failed to reset character audio configuration'
        });
    }
});

/**
 * GET /api/character-audio-config/:characterId/test
 * Test character audio configuration
 */
router.get('/:characterId/test', async (req, res) => {
    try {
        const characterId = req.params.characterId;
        
        if (!characterId || isNaN(parseInt(characterId))) {
            return res.status(400).json({
                success: false,
                error: 'Invalid character ID'
            });
        }
        
        const config = await characterAudioConfigService.getCharacterAudioConfig(characterId);
        const optimizedSettings = await characterAudioConfigService.getOptimizedAudioSettings(characterId);
        
        // Perform basic configuration tests
        const testResults = {
            configExists: !!config,
            microphoneEnabled: config.microphone?.enabled || false,
            sttEnabled: config.stt?.enabled || false,
            jawAnimationEnabled: config.jawAnimation?.enabled || false,
            optimizedSettingsGenerated: !!optimizedSettings,
            lastModified: config.lastModified,
            testTimestamp: new Date().toISOString()
        };
        
        res.json({
            success: true,
            data: {
                config: config,
                optimizedSettings: optimizedSettings,
                testResults: testResults
            }
        });
        
    } catch (error) {
        logger.error('Error testing character audio config:', error);
        res.status(500).json({
            success: false,
            error: 'Failed to test character audio configuration'
        });
    }
});

/**
 * GET /api/character-audio-config/:characterId/speaker
 * Get speaker configuration for a character
 */
router.get('/:characterId/speaker', async (req, res) => {
    try {
        const characterId = req.params.characterId;

        if (!characterId || isNaN(parseInt(characterId))) {
            return res.status(400).json({
                success: false,
                error: 'Invalid character ID'
            });
        }

        const speakerConfig = await characterAudioConfigService.getCharacterSpeakerConfig(characterId);
        const audioDevice = await characterAudioConfigService.getCharacterAudioOutputDevice(characterId);

        res.json({
            success: true,
            data: {
                speakerConfig,
                audioDevice
            }
        });

    } catch (error) {
        logger.error('Error getting character speaker config:', error);
        res.status(500).json({
            success: false,
            error: 'Failed to get character speaker configuration'
        });
    }
});

/**
 * PUT /api/character-audio-config/:characterId/speaker
 * Set character's default speaker
 */
router.put('/:characterId/speaker', async (req, res) => {
    try {
        const characterId = req.params.characterId;
        const { speakerId, outputDevice, volume, enabled } = req.body;

        if (!characterId || isNaN(parseInt(characterId))) {
            return res.status(400).json({
                success: false,
                error: 'Invalid character ID'
            });
        }

        const updatedConfig = await characterAudioConfigService.setCharacterDefaultSpeaker(
            characterId,
            speakerId,
            outputDevice,
            volume,
            enabled
        );

        res.json({
            success: true,
            data: updatedConfig,
            message: 'Default speaker updated successfully'
        });

    } catch (error) {
        logger.error('Error setting character default speaker:', error);
        res.status(500).json({
            success: false,
            error: 'Failed to set character default speaker'
        });
    }
});

/**
 * GET /api/character-audio-config/:characterId/speaker-parts
 * Get available speaker parts for a character
 */
router.get('/:characterId/speaker-parts', async (req, res) => {
    try {
        const characterId = parseInt(req.params.characterId);

        if (!characterId || isNaN(characterId)) {
            return res.status(400).json({
                success: false,
                error: 'Invalid character ID'
            });
        }

        const partService = require('../../services/partService');
        const allParts = await partService.getPartsByCharacter(characterId);
        const speakerParts = allParts.filter(part => part.type === 'speaker');

        res.json({
            success: true,
            data: speakerParts
        });

    } catch (error) {
        logger.error('Error getting character speaker parts:', error);
        res.status(500).json({
            success: false,
            error: 'Failed to get character speaker parts'
        });
    }
});

module.exports = router;
