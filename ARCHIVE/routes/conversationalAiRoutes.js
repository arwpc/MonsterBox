const express = require('express');
const router = express.Router();
const characterService = require('../services/characterService');

// Conversational AI API routes
router.get('/status', async (req, res) => {
    try {
        let status = {
            isRunning: false,
            port: 'N/A',
            availableAgents: 0,
            activeConnections: 0
        };
        
        if (global.elevenLabsService) {
            status = global.elevenLabsService.getStatus();
        }

        res.json({
            success: true,
            data: status
        });
    } catch (error) {
        console.error('❌ Get conversational AI status error:', error);
        res.status(500).json({
            success: false,
            error: error.message
        });
    }
});

router.get('/characters', async (req, res) => {
    try {
        const characters = await characterService.getAllCharacters();
        
        // Add availability status for each character
        const charactersWithStatus = characters.map(character => ({
            ...character,
            available: true, // For now, assume all characters are available
            hasElevenLabsAgent: !!character.elevenLabsAgentId
        }));

        res.json({
            success: true,
            data: charactersWithStatus
        });
    } catch (error) {
        console.error('❌ Get characters error:', error);
        res.status(500).json({
            success: false,
            error: error.message
        });
    }
});

router.post('/start-conversation', async (req, res) => {
    try {
        const { characterId } = req.body;
        
        if (!characterId) {
            return res.status(400).json({
                success: false,
                error: 'Character ID is required'
            });
        }

        // Get character details
        const character = await characterService.getCharacterById(characterId);
        if (!character) {
            return res.status(404).json({
                success: false,
                error: 'Character not found'
            });
        }

        // For now, return success - the actual conversation will be handled via WebSocket
        res.json({
            success: true,
            data: {
                characterId: characterId,
                characterName: character.char_name,
                message: 'Conversation ready to start. Connect via WebSocket to begin.'
            }
        });
    } catch (error) {
        console.error('❌ Start conversation error:', error);
        res.status(500).json({
            success: false,
            error: error.message
        });
    }
});

module.exports = router;
