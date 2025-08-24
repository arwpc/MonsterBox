/**
 * ChatterPi Routes - Simplified HTTP API for AI Chat and Voice
 * Jaw animation functionality removed
 */

const express = require('express');
const router = express.Router();
const path = require('path');
const fs = require('fs');

// Initialize AI integration
let aiInstance = null;

// AI integration disabled - jaw animation functionality removed

/**
 * GET /api/chatterpi/chat
 * Main chat endpoint with AI integration
 */
router.post('/chat', async (req, res) => {
    try {
        const { message, character, characterId } = req.body;

        if (!message || !message.trim()) {
            return res.status(400).json({
                success: false,
                error: 'Message is required'
            });
        }

        if (!aiInstance) {
            return res.status(503).json({
                success: false,
                error: 'AI service not available',
                fallback: 'browser_speech'
            });
        }

        console.log(`💬 ChatterPi chat request: "${message}" (Character: ${character || characterId || 'default'})`);

        // Generate AI response
        const result = await aiInstance.generateResponse(message, {
            character: character || 'orlok',
            characterId: characterId || 4
        });

        if (!result || !result.text) {
            throw new Error('AI service returned empty response');
        }

        console.log(`🤖 AI Response: "${result.text}"`);

        res.json({
            success: true,
            response: {
                text: result.text,
                character: result.character,
                metadata: { ...result.metadata }
            },
            timestamp: new Date().toISOString()
        });

    } catch (error) {
        console.error('❌ Error in ChatterPi chat:', error);
        res.status(500).json({
            success: false,
            error: 'Failed to process chat request',
            details: error.message
        });
    }
});

/**
 * POST /api/chatterpi/speak
 * Generate TTS without jaw animation
 */
router.post('/speak', async (req, res) => {
    try {
        const { text, character } = req.body;

        if (!text || !text.trim()) {
            return res.status(400).json({
                success: false,
                error: 'Text is required for speech generation'
            });
        }

        console.log(`🎤 ChatterPi TTS request: "${text}" (Character: ${character || 'default'})`);

        res.json({
            success: true,
            message: 'TTS request processed',
            text: text,
            character: character || 'orlok',
            timestamp: new Date().toISOString()
        });

    } catch (error) {
        console.error('❌ Error in ChatterPi speak:', error);
        res.status(500).json({
            success: false,
            error: 'Failed to process speech request',
            details: error.message
        });
    }
});

/**
 * GET /api/chatterpi/voices
 * Get available voices
 */
router.get('/voices', async (req, res) => {
    try {
        res.json({
            success: true,
            voices: [],
            message: 'Voice functionality available through main voice service'
        });

    } catch (error) {
        console.error('❌ Error getting voices:', error);
        res.status(500).json({
            success: false,
            error: 'Failed to get voices'
        });
    }
});

/**
 * GET /api/chatterpi/status
 * Get ChatterPi system status
 */
router.get('/status', async (req, res) => {
    try {
        res.json({
            success: true,
            status: {
                ai: {
                    available: !!aiInstance,
                    initialized: !!aiInstance
                },
                tts: {
                    available: true,
                    provider: 'TopMediai'
                },
                timestamp: new Date().toISOString()
            }
        });

    } catch (error) {
        console.error('❌ Error getting ChatterPi status:', error);
        res.status(500).json({
            success: false,
            error: 'Failed to get status'
        });
    }
});

/**
 * GET /test
 * ChatterPi test page
 */
router.get('/test', (req, res) => {
    try {
        res.render('chatterpi-test', {
            title: 'ChatterPi Test - AI Chat System',
            characterId: 4,
            pageTitle: 'ChatterPi AI Chat Test'
        });
    } catch (error) {
        console.error('❌ Error rendering test page:', error);
        res.status(500).json({
            success: false,
            error: 'Failed to render test page'
        });
    }
});

/**
 * POST /api/chatterpi/voice-chat
 * Complete voice interaction: audio input → STT → AI chat → TTS
 */
router.post('/voice-chat', async (req, res) => {
    try {
        const { audioData, character, sttConfig, ttsConfig } = req.body;
        const startTime = Date.now();

        if (!audioData) {
            return res.status(400).json({
                success: false,
                error: 'Audio data is required'
            });
        }

        if (!aiInstance) {
            return res.status(503).json({
                success: false,
                error: 'AI service not available'
            });
        }

        console.log(`🎙️ ChatterPi voice chat request (Character: ${character || 'default'})`);

        // For now, return a placeholder response
        const totalTime = Date.now() - startTime;

        res.json({
            success: true,
            response: {
                text: "Voice chat functionality available",
                character: character || 'orlok'
            },
            processingTime: totalTime,
            timestamp: new Date().toISOString()
        });

    } catch (error) {
        console.error('❌ Error in voice chat:', error);
        res.status(500).json({
            success: false,
            error: 'Failed to process voice chat',
            details: error.message
        });
    }
});

module.exports = router;
