/**
 * AI Integration API Routes
 * 
 * Provides REST API endpoints for AI conversation management,
 * character interactions, TTS generation, and jaw animation control.
 */

const express = require('express');
const router = express.Router();
const { authenticateJWT } = require('../../middleware/auth');
const aiIntegrationService = require('../../services/ai/aiIntegrationService');
const logger = require('../../scripts/logger');

/**
 * GET /api/ai/status
 * Get AI integration service status
 */
router.get('/status', authenticateJWT, (req, res) => {
    try {
        const statistics = aiIntegrationService.getStatistics();
        res.json({
            success: true,
            data: statistics,
            timestamp: new Date().toISOString()
        });
    } catch (error) {
        logger.error('Failed to get AI service status:', error);
        res.status(500).json({
            success: false,
            error: 'Failed to retrieve AI service status',
            code: 'AI_STATUS_ERROR'
        });
    }
});

/**
 * GET /api/ai/characters
 * Get all character profiles
 */
router.get('/characters', authenticateJWT, (req, res) => {
    try {
        const characters = aiIntegrationService.getCharacterProfiles();
        res.json({
            success: true,
            data: characters,
            count: Object.keys(characters).length,
            timestamp: new Date().toISOString()
        });
    } catch (error) {
        logger.error('Failed to get character profiles:', error);
        res.status(500).json({
            success: false,
            error: 'Failed to retrieve character profiles',
            code: 'CHARACTER_PROFILES_ERROR'
        });
    }
});

/**
 * GET /api/ai/characters/:characterId
 * Get specific character profile
 */
router.get('/characters/:characterId', authenticateJWT, (req, res) => {
    try {
        const { characterId } = req.params;
        const characters = aiIntegrationService.getCharacterProfiles();
        const character = characters[characterId];
        
        if (!character) {
            return res.status(404).json({
                success: false,
                error: `Character not found: ${characterId}`,
                code: 'CHARACTER_NOT_FOUND'
            });
        }
        
        res.json({
            success: true,
            data: character,
            characterId,
            timestamp: new Date().toISOString()
        });
    } catch (error) {
        logger.error(`Failed to get character ${req.params.characterId}:`, error);
        res.status(500).json({
            success: false,
            error: 'Failed to retrieve character profile',
            code: 'CHARACTER_PROFILE_ERROR'
        });
    }
});

/**
 * PUT /api/ai/characters/:characterId
 * Update character profile
 */
router.put('/characters/:characterId', authenticateJWT, (req, res) => {
    try {
        const { characterId } = req.params;
        const { name, systemPrompt, voiceId, personality, responseStyle, maxTokens } = req.body;
        
        const updates = {};
        if (name) updates.name = name;
        if (systemPrompt) updates.systemPrompt = systemPrompt;
        if (voiceId) updates.voiceId = voiceId;
        if (personality) updates.personality = personality;
        if (responseStyle) updates.responseStyle = responseStyle;
        if (maxTokens) updates.maxTokens = parseInt(maxTokens);
        
        aiIntegrationService.updateCharacterProfile(characterId, updates);
        
        res.json({
            success: true,
            message: `Character profile updated: ${characterId}`,
            data: aiIntegrationService.getCharacterProfiles()[characterId],
            timestamp: new Date().toISOString()
        });
    } catch (error) {
        logger.error(`Failed to update character ${req.params.characterId}:`, error);
        res.status(500).json({
            success: false,
            error: error.message,
            code: 'CHARACTER_UPDATE_ERROR'
        });
    }
});

/**
 * POST /api/ai/chat/:characterId
 * Send chat message to character and get AI response
 */
router.post('/chat/:characterId', authenticateJWT, async (req, res) => {
    try {
        const { characterId } = req.params;
        const { message, generateTTS, enableJawSync } = req.body;
        
        if (!message || typeof message !== 'string') {
            return res.status(400).json({
                success: false,
                error: 'Message is required',
                code: 'MISSING_MESSAGE'
            });
        }
        
        const options = {
            generateTTS: generateTTS !== false,
            enableJawSync: enableJawSync !== false
        };
        
        const result = await aiIntegrationService.processConversation(characterId, message, options);
        
        res.json({
            success: true,
            data: result,
            timestamp: new Date().toISOString()
        });
    } catch (error) {
        logger.error(`Failed to process chat for ${req.params.characterId}:`, error);
        res.status(500).json({
            success: false,
            error: error.message,
            code: 'CHAT_PROCESSING_ERROR'
        });
    }
});

/**
 * POST /api/ai/response/:characterId
 * Generate AI response only (no TTS or jaw animation)
 */
router.post('/response/:characterId', authenticateJWT, async (req, res) => {
    try {
        const { characterId } = req.params;
        const { message } = req.body;
        
        if (!message || typeof message !== 'string') {
            return res.status(400).json({
                success: false,
                error: 'Message is required',
                code: 'MISSING_MESSAGE'
            });
        }
        
        const result = await aiIntegrationService.generateResponse(characterId, message);
        
        res.json({
            success: true,
            data: result,
            timestamp: new Date().toISOString()
        });
    } catch (error) {
        logger.error(`Failed to generate response for ${req.params.characterId}:`, error);
        res.status(500).json({
            success: false,
            error: error.message,
            code: 'RESPONSE_GENERATION_ERROR'
        });
    }
});

/**
 * POST /api/ai/tts/:characterId
 * Generate TTS audio for text
 */
router.post('/tts/:characterId', authenticateJWT, async (req, res) => {
    try {
        const { characterId } = req.params;
        const { text, voiceId, speed, pitch } = req.body;
        
        if (!text || typeof text !== 'string') {
            return res.status(400).json({
                success: false,
                error: 'Text is required',
                code: 'MISSING_TEXT'
            });
        }
        
        const options = {};
        if (voiceId) options.voiceId = voiceId;
        if (speed) options.speed = parseFloat(speed);
        if (pitch) options.pitch = parseFloat(pitch);
        
        const result = await aiIntegrationService.generateTTS(characterId, text, options);
        
        if (!result) {
            return res.status(503).json({
                success: false,
                error: 'TTS service unavailable',
                code: 'TTS_UNAVAILABLE'
            });
        }
        
        res.json({
            success: true,
            data: result,
            timestamp: new Date().toISOString()
        });
    } catch (error) {
        logger.error(`Failed to generate TTS for ${req.params.characterId}:`, error);
        res.status(500).json({
            success: false,
            error: error.message,
            code: 'TTS_GENERATION_ERROR'
        });
    }
});

/**
 * GET /api/ai/history/:characterId
 * Get conversation history for character
 */
router.get('/history/:characterId', authenticateJWT, (req, res) => {
    try {
        const { characterId } = req.params;
        const { limit } = req.query;
        
        let history = aiIntegrationService.getConversationHistory(characterId);
        
        if (limit) {
            const limitNum = parseInt(limit);
            history = history.slice(-limitNum);
        }
        
        res.json({
            success: true,
            data: history,
            count: history.length,
            characterId,
            timestamp: new Date().toISOString()
        });
    } catch (error) {
        logger.error(`Failed to get history for ${req.params.characterId}:`, error);
        res.status(500).json({
            success: false,
            error: 'Failed to retrieve conversation history',
            code: 'HISTORY_ERROR'
        });
    }
});

/**
 * DELETE /api/ai/history/:characterId
 * Clear conversation history for character
 */
router.delete('/history/:characterId', authenticateJWT, (req, res) => {
    try {
        const { characterId } = req.params;
        aiIntegrationService.clearConversationHistory(characterId);
        
        res.json({
            success: true,
            message: `Conversation history cleared for ${characterId}`,
            timestamp: new Date().toISOString()
        });
    } catch (error) {
        logger.error(`Failed to clear history for ${req.params.characterId}:`, error);
        res.status(500).json({
            success: false,
            error: 'Failed to clear conversation history',
            code: 'HISTORY_CLEAR_ERROR'
        });
    }
});

/**
 * POST /api/ai/jaw-animation/:characterId
 * Trigger jaw animation for character
 */
router.post('/jaw-animation/:characterId', authenticateJWT, (req, res) => {
    try {
        const { characterId } = req.params;
        const { text } = req.body;
        
        if (!text || typeof text !== 'string') {
            return res.status(400).json({
                success: false,
                error: 'Text is required for jaw animation',
                code: 'MISSING_TEXT'
            });
        }
        
        aiIntegrationService.triggerJawAnimation(characterId, text);
        
        res.json({
            success: true,
            message: `Jaw animation triggered for ${characterId}`,
            data: { characterId, text },
            timestamp: new Date().toISOString()
        });
    } catch (error) {
        logger.error(`Failed to trigger jaw animation for ${req.params.characterId}:`, error);
        res.status(500).json({
            success: false,
            error: error.message,
            code: 'JAW_ANIMATION_ERROR'
        });
    }
});

/**
 * GET /api/ai/statistics
 * Get detailed AI service statistics
 */
router.get('/statistics', authenticateJWT, (req, res) => {
    try {
        const statistics = aiIntegrationService.getStatistics();
        res.json({
            success: true,
            data: statistics,
            timestamp: new Date().toISOString()
        });
    } catch (error) {
        logger.error('Failed to get AI statistics:', error);
        res.status(500).json({
            success: false,
            error: 'Failed to retrieve AI statistics',
            code: 'STATISTICS_ERROR'
        });
    }
});

/**
 * POST /api/ai/test/:characterId
 * Test AI functionality for character
 */
router.post('/test/:characterId', authenticateJWT, async (req, res) => {
    try {
        const { characterId } = req.params;
        const testMessage = "Hello, can you hear me?";
        
        const result = await aiIntegrationService.generateResponse(characterId, testMessage);
        
        res.json({
            success: true,
            message: `AI test successful for ${characterId}`,
            data: {
                testMessage,
                response: result,
                characterId
            },
            timestamp: new Date().toISOString()
        });
    } catch (error) {
        logger.error(`Failed to test AI for ${req.params.characterId}:`, error);
        res.status(500).json({
            success: false,
            error: error.message,
            code: 'AI_TEST_ERROR'
        });
    }
});

/**
 * GET /api/ai/health
 * Get AI service health status
 */
router.get('/health', authenticateJWT, (req, res) => {
    try {
        const stats = aiIntegrationService.getStatistics();
        const isHealthy = stats.isInitialized && !stats.errors > 10;
        
        res.json({
            success: true,
            data: {
                healthy: isHealthy,
                initialized: stats.isInitialized,
                totalConversations: stats.totalConversations,
                totalResponses: stats.totalResponses,
                averageResponseTime: stats.averageResponseTime,
                errorRate: stats.errors / Math.max(stats.totalResponses, 1),
                uptime: stats.uptime,
                activeConversations: stats.activeConversations
            },
            timestamp: new Date().toISOString()
        });
    } catch (error) {
        logger.error('Failed to get AI health status:', error);
        res.status(500).json({
            success: false,
            error: 'Failed to retrieve AI health status',
            code: 'HEALTH_CHECK_ERROR'
        });
    }
});

module.exports = router;
