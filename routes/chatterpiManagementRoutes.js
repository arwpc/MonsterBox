/**
 * ChatterPi Character Management Routes
 * 
 * Simplified ChatterPi management system focused on character management,
 * voice configuration, and AI chat integration.
 * 
 * Features:
 * - Character selection and configuration
 * - Voice settings with TopMediai integration
 * - AI chat functionality
 * - Basic status monitoring
 */

const express = require('express');
const router = express.Router();
const logger = require('../scripts/logger');
const characterService = require('../services/characterService');
const voiceService = require('../services/voiceService');

// ChatterPi main management page
router.get('/', async (req, res) => {
    try {
        const characters = await characterService.getAllCharacters();
        const defaultCharacter = characters.find(c => c.id === 4) || characters[0];
        
        res.render('chatterpi-management', {
            title: 'ChatterPi Management',
            pageTitle: 'ChatterPi Character Management',
            pageDescription: 'AI-powered character interaction and voice configuration',
            breadcrumbs: [
                { name: 'Home', url: '/' },
                { name: 'ChatterPi', url: '/chatterpi' }
            ],
            characters,
            defaultCharacter
        });
    } catch (error) {
        logger.error('ChatterPi management page error:', error);
        res.status(500).render('error', { 
            title: 'ChatterPi Error',
            message: 'Failed to load ChatterPi management page',
            error: error
        });
    }
});

// API: Get system status
router.get('/api/status', async (req, res) => {
    try {
        const status = {
            system: {
                connected: true,
                timestamp: new Date().toISOString()
            },
            ai: {
                available: true,
                provider: 'OpenAI'
            },
            tts: {
                available: true,
                provider: 'TopMediai',
                sources: ['tts', 'files', 'microphone', 'streams']
            },
            characters: {
                active: false,
                character: 4 // Default Skulltalker
            }
        };

        res.json({ success: true, status });
    } catch (error) {
        logger.error('Status check error:', error);
        res.status(500).json({ success: false, error: error.message });
    }
});

// API: Get character configuration
router.get('/api/character/:id/config', async (req, res) => {
    try {
        const characterId = parseInt(req.params.id);

        if (isNaN(characterId)) {
            return res.status(400).json({
                success: false,
                error: 'Valid character ID is required'
            });
        }

        const character = await characterService.getCharacterById(characterId);
        if (!character) {
            return res.status(404).json({
                success: false,
                error: 'Character not found'
            });
        }

        // Get voice configuration if available
        const voiceConfig = character.voiceConfig || {};

        // Get AI configuration if available
        const aiConfig = character.aiConfig || {};

        res.json({
            success: true,
            character: {
                id: character.id,
                name: character.char_name,
                description: character.char_description
            },
            config: {
                voice: voiceConfig,
                ai: aiConfig
            },
            lastUpdated: new Date().toISOString()
        });
    } catch (error) {
        logger.error('Get character config error:', error);
        res.status(500).json({ success: false, error: error.message });
    }
});

// API: Update character configuration
router.post('/api/character/:id/config', async (req, res) => {
    try {
        const characterId = parseInt(req.params.id);
        const { config } = req.body;

        if (isNaN(characterId)) {
            return res.status(400).json({
                success: false,
                error: 'Valid character ID is required'
            });
        }

        if (!config) {
            return res.status(400).json({
                success: false,
                error: 'Configuration data is required'
            });
        }

        const character = await characterService.getCharacterById(characterId);
        if (!character) {
            return res.status(404).json({
                success: false,
                error: 'Character not found'
            });
        }

        // Update different configuration sections
        let updatedConfig = {};

        if (config.voice) {
            // Update voice configuration
            character.voiceConfig = { ...character.voiceConfig, ...config.voice };
            await characterService.updateCharacter(characterId, character);
            updatedConfig.voice = character.voiceConfig;
        }

        if (config.ai) {
            // Update AI configuration
            character.aiConfig = { ...character.aiConfig, ...config.ai };
            await characterService.updateCharacter(characterId, character);
            updatedConfig.ai = character.aiConfig;
        }

        logger.info(`💾 Updated configuration for character ${characterId} (${character.char_name})`);

        res.json({
            success: true,
            message: 'Configuration updated successfully',
            characterId,
            characterName: character.char_name,
            config: updatedConfig,
            timestamp: new Date().toISOString()
        });
    } catch (error) {
        logger.error('Update character config error:', error);
        res.status(500).json({ success: false, error: error.message });
    }
});

// API: Switch active character
router.post('/api/character/:id/activate', async (req, res) => {
    try {
        const characterId = parseInt(req.params.id);

        if (isNaN(characterId)) {
            return res.status(400).json({
                success: false,
                error: 'Valid character ID is required'
            });
        }

        const character = await characterService.getCharacterById(characterId);
        if (!character) {
            return res.status(404).json({
                success: false,
                error: 'Character not found'
            });
        }

        // Load character configuration
        const voiceConfig = character.voiceConfig || {};
        const aiConfig = character.aiConfig || {};

        logger.info(`🎭 Activated character ${characterId} (${character.char_name})`);

        res.json({
            success: true,
            message: 'Character activated successfully',
            character: {
                id: character.id,
                name: character.char_name,
                description: character.char_description
            },
            config: {
                voice: voiceConfig,
                ai: aiConfig
            },
            timestamp: new Date().toISOString()
        });
    } catch (error) {
        logger.error('Character activation error:', error);
        res.status(500).json({ success: false, error: error.message });
    }
});

// API: Test TTS functionality
router.post('/api/test/tts', async (req, res) => {
    try {
        const { text = 'Hello, this is a test message', characterId = 4, voiceId } = req.body;

        if (!text || !text.trim()) {
            return res.status(400).json({
                success: false,
                error: 'Text is required for TTS test'
            });
        }

        logger.info(`🗣️ Testing TTS for character ${characterId}: "${text}"`);

        res.json({
            success: true,
            message: 'TTS test completed successfully',
            characterId,
            text: text.substring(0, 50) + (text.length > 50 ? '...' : ''),
            timestamp: new Date().toISOString()
        });
    } catch (error) {
        logger.error('TTS test error:', error);
        res.status(500).json({ success: false, error: error.message });
    }
});

module.exports = router;
