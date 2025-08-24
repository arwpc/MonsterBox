/**
 * Conversational AI Routes - ElevenLabs Integration
 * Handles Voice Chat interface and API endpoints for ElevenLabs service
 */

const express = require('express');
const router = express.Router();
const characterService = require('../services/characterService');

/**
 * Conversational AI Main Interface
 */
router.get('/', async (req, res) => {
    try {
        // Get all characters for selection
        const characters = await characterService.getAllCharacters();

        // Get ElevenLabs service status
        let serviceStatus = null;
        if (global.elevenLabsService) {
            serviceStatus = global.elevenLabsService.getStatus();
        }

        res.render('conversational-ai', {
            title: 'Voice Chat - ElevenLabs Conversational AI',
            characters: characters,
            serviceStatus: serviceStatus,
            currentCharacterId: req.characterId || 4 // Default to Skulltalker
        });

    } catch (error) {
        console.error('Error loading Conversational AI interface:', error);
        res.status(500).render('error', {
            title: 'Voice Chat Error',
            message: 'Failed to load Voice Chat interface',
            error: error
        });
    }
});

/**
 * ChatterPi Advanced Audio Settings
 */
router.get('/advanced-audio-settings', async (req, res) => {
    try {
        const characters = await characterService.getAllCharacters();
        
        res.render('chatterpi-advanced-audio-settings', {
            title: 'ChatterPi - Advanced Audio Settings',
            characters: characters,
            currentCharacterId: req.characterId || 4
        });
        
    } catch (error) {
        console.error('Error loading ChatterPi advanced settings:', error);
        res.status(500).render('error', {
            title: 'Settings Error',
            message: 'Failed to load advanced audio settings',
            error: error
        });
    }
});

/**
 * API: Get ElevenLabs Service Status
 */
router.get('/api/status', (req, res) => {
    try {
        if (!global.elevenLabsService) {
            return res.status(503).json({
                success: false,
                error: 'ElevenLabs service not available'
            });
        }
        
        const status = global.elevenLabsService.getStatus();
        
        res.json({
            success: true,
            data: status
        });
        
    } catch (error) {
        console.error('Error getting service status:', error);
        res.status(500).json({
            success: false,
            error: 'Failed to get service status'
        });
    }
});

/**
 * API: Get Character Conversation Starters
 */
router.get('/api/conversation-starters/:characterId', async (req, res) => {
    try {
        const characterId = parseInt(req.params.characterId);
        
        if (!global.elevenLabsService) {
            return res.status(503).json({
                success: false,
                error: 'ElevenLabs service not available'
            });
        }
        
        const agents = global.elevenLabsService.agents;
        const agent = agents.get(characterId);
        
        if (!agent) {
            return res.status(404).json({
                success: false,
                error: 'Character not found'
            });
        }
        
        res.json({
            success: true,
            data: {
                characterId: characterId,
                characterName: agent.name,
                conversationStarters: agent.conversationStarters
            }
        });
        
    } catch (error) {
        console.error('Error getting conversation starters:', error);
        res.status(500).json({
            success: false,
            error: 'Failed to get conversation starters'
        });
    }
});

/**
 * API: Start Conversation Session
 */
router.post('/api/start-conversation', async (req, res) => {
    try {
        const { characterId } = req.body;
        
        if (!characterId) {
            return res.status(400).json({
                success: false,
                error: 'Character ID is required'
            });
        }
        
        if (!global.elevenLabsService) {
            return res.status(503).json({
                success: false,
                error: 'ElevenLabs service not available'
            });
        }
        
        // Get character information
        const character = await characterService.getCharacterById(characterId);
        const agents = global.elevenLabsService.agents;
        const agent = agents.get(parseInt(characterId));
        
        if (!agent) {
            return res.status(404).json({
                success: false,
                error: 'Character agent not found'
            });
        }
        
        res.json({
            success: true,
            data: {
                characterId: characterId,
                characterName: character.char_name,
                agentId: agent.agentId,
                websocketUrl: `ws://localhost:${global.elevenLabsService.port}`,
                conversationStarters: agent.conversationStarters
            }
        });
        
    } catch (error) {
        console.error('Error starting conversation:', error);
        res.status(500).json({
            success: false,
            error: 'Failed to start conversation'
        });
    }
});

/**
 * API: Get Available Characters
 */
router.get('/api/characters', async (req, res) => {
    try {
        const characters = await characterService.getAllCharacters();
        
        if (!global.elevenLabsService) {
            return res.json({
                success: true,
                data: characters.map(char => ({
                    id: char.id,
                    name: char.char_name,
                    description: char.char_description,
                    available: false
                }))
            });
        }
        
        const agents = global.elevenLabsService.agents;
        
        const charactersWithAgents = characters.map(char => ({
            id: char.id,
            name: char.char_name,
            description: char.char_description,
            available: agents.has(char.id),
            agentId: agents.has(char.id) ? agents.get(char.id).agentId : null
        }));
        
        res.json({
            success: true,
            data: charactersWithAgents
        });
        
    } catch (error) {
        console.error('Error getting characters:', error);
        res.status(500).json({
            success: false,
            error: 'Failed to get characters'
        });
    }
});

/**
 * API: Test ElevenLabs Connection
 */
router.post('/api/test-connection', async (req, res) => {
    try {
        if (!global.elevenLabsService) {
            return res.status(503).json({
                success: false,
                error: 'ElevenLabs service not available'
            });
        }
        
        const status = global.elevenLabsService.getStatus();
        
        res.json({
            success: true,
            data: {
                isRunning: status.isRunning,
                port: status.port,
                availableAgents: status.availableAgents,
                activeConnections: status.activeConnections,
                message: 'ElevenLabs service is running and ready'
            }
        });
        
    } catch (error) {
        console.error('Error testing connection:', error);
        res.status(500).json({
            success: false,
            error: 'Connection test failed'
        });
    }
});

/**
 * Legacy API: Chat endpoint for backward compatibility
 */
router.post('/api/chat', async (req, res) => {
    try {
        const { message, character } = req.body;
        
        if (!message) {
            return res.status(400).json({
                success: false,
                error: 'Message is required'
            });
        }
        
        // For now, return a response indicating the new system
        res.json({
            success: true,
            data: {
                aiResponse: {
                    text: `Hello! I'm now powered by ElevenLabs Conversational AI. Please use the new WebSocket interface for real-time conversations. Your message was: "${message}"`,
                    character: character || 'System'
                }
            }
        });
        
    } catch (error) {
        console.error('Error in legacy chat endpoint:', error);
        res.status(500).json({
            success: false,
            error: 'Chat request failed'
        });
    }
});

module.exports = router;
