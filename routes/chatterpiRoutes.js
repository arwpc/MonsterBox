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
        const { text, character, characterId, voiceConfig } = req.body;

        if (!text || !text.trim()) {
            return res.status(400).json({
                success: false,
                error: 'Text is required for speech generation'
            });
        }

        console.log(`🎤 ChatterPi TTS request: "${text}" (Character: ${character || 'default'})`);

        // Get voice service
        const VoiceService = require('../services/voiceService');
        const voiceService = new VoiceService();

        // Get character's voice settings
        let voiceSettings = null;
        if (characterId) {
            try {
                voiceSettings = await voiceService.getVoiceByCharacterId(characterId);
            } catch (error) {
                console.warn(`⚠️ Could not get voice settings for character ${characterId}:`, error.message);
            }
        }

        // Use default voice if no character voice found
        const speakerId = voiceSettings?.speaker_id || 'en-US-AriaNeural';
        const options = {
            ...voiceSettings?.settings,
            ...voiceConfig
        };

        // Generate speech
        const result = await voiceService.generateSpeech(text, speakerId, options, characterId);

        if (result && result.audioUrl) {
            res.json({
                success: true,
                audioUrl: result.audioUrl,
                text: text,
                character: character || 'orlok',
                provider: 'TopMediai',
                duration: result.duration,
                timestamp: new Date().toISOString()
            });
        } else {
            throw new Error('Failed to generate audio');
        }

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
 * POST /api/chatterpi/voice-chat
 * Complete voice interaction: audio input → STT → AI chat → TTS
 */
router.post('/voice-chat', async (req, res) => {
    try {
        const { audioData, character, characterId, sttConfig, ttsConfig, sttOnly } = req.body;
        const startTime = Date.now();

        if (!audioData) {
            return res.status(400).json({
                success: false,
                error: 'Audio data is required'
            });
        }

        console.log(`🎙️ ChatterPi voice chat request (Character: ${character || 'default'})`);

        const result = {
            success: true,
            data: {},
            processingTime: {},
            timestamp: new Date().toISOString()
        };

        // Step 1: Speech-to-Text
        const sttStartTime = Date.now();
        try {
            // Convert base64 audio to buffer
            const audioBuffer = Buffer.from(audioData, 'base64');

            // Use OpenAI Whisper for STT
            const OpenAI = require('openai');
            const openai = new OpenAI({
                apiKey: process.env.OPENAI_API_KEY
            });

            // Create a temporary file for the audio
            const fs = require('fs');
            const path = require('path');
            const tempDir = path.join(__dirname, '../temp');
            if (!fs.existsSync(tempDir)) {
                fs.mkdirSync(tempDir, { recursive: true });
            }

            const tempFilePath = path.join(tempDir, `audio_${Date.now()}.webm`);
            fs.writeFileSync(tempFilePath, audioBuffer);

            // Transcribe audio
            const transcription = await openai.audio.transcriptions.create({
                file: fs.createReadStream(tempFilePath),
                model: 'whisper-1',
                language: sttConfig?.language || 'en'
            });

            // Clean up temp file
            fs.unlinkSync(tempFilePath);

            const sttTime = Date.now() - sttStartTime;
            result.data.stt = {
                text: transcription.text,
                confidence: 1.0 // Whisper doesn't provide confidence scores
            };
            result.processingTime.stt = sttTime;

            console.log(`🎤 STT completed in ${sttTime}ms: "${transcription.text}"`);

            // If STT only, return early
            if (sttOnly) {
                result.processingTime.total = Date.now() - startTime;
                return res.json(result);
            }

            // Step 2: AI Response (if not STT only)
            if (aiInstance && transcription.text.trim()) {
                const aiStartTime = Date.now();

                const aiResponse = await aiInstance.processConversation(transcription.text, {
                    generateSpeech: false
                });

                const aiTime = Date.now() - aiStartTime;
                result.data.aiResponse = aiResponse.aiResponse;
                result.processingTime.ai = aiTime;

                console.log(`🤖 AI response in ${aiTime}ms: "${aiResponse.aiResponse.text}"`);
            }

        } catch (sttError) {
            console.error('❌ STT Error:', sttError);
            result.data.stt = {
                text: '',
                error: sttError.message
            };
        }

        result.processingTime.total = Date.now() - startTime;
        res.json(result);

    } catch (error) {
        console.error('❌ Error in voice chat:', error);
        res.status(500).json({
            success: false,
            error: 'Failed to process voice chat',
            details: error.message
        });
    }
});

/**
 * GET /api/characters
 * Get all AI-enabled characters with assistant information
 */
router.get('/api/characters', async (req, res) => {
    try {
        const characterService = require('../services/characterService');
        const fs = require('fs').promises;
        const path = require('path');

        // Get all characters
        const characters = await characterService.getAllCharacters();

        // Load assistants configuration
        let assistants = {};
        try {
            const assistantsPath = path.join(__dirname, '../data/assistants-config.json');
            const assistantsData = await fs.readFile(assistantsPath, 'utf8');
            const assistantsConfig = JSON.parse(assistantsData);
            assistants = assistantsConfig.assistants || {};
        } catch (error) {
            console.warn('⚠️ Could not load assistants config:', error.message);
        }

        // Filter and enhance characters with assistant info
        const aiEnabledCharacters = characters
            .filter(char => char.aiConfig && char.aiConfig.enabled && char.openaiAssistantId)
            .map(char => ({
                id: char.id,
                name: char.char_name,
                description: char.char_description,
                assistantId: char.openaiAssistantId,
                assistantInfo: assistants[char.openaiAssistantId] || null,
                voiceConfig: char.voiceConfig || null,
                sttConfig: char.sttConfig || null
            }));

        res.json({
            success: true,
            characters: aiEnabledCharacters,
            count: aiEnabledCharacters.length
        });
    } catch (error) {
        console.error('❌ Error fetching characters:', error);
        res.status(500).json({
            success: false,
            error: 'Failed to fetch characters'
        });
    }
});

/**
 * GET /api/character/:id/config
 * Get specific character configuration including voice and STT settings
 */
router.get('/api/character/:id/config', async (req, res) => {
    try {
        const characterId = parseInt(req.params.id);
        const characterService = require('../services/characterService');
        const characterAudioConfigService = require('../services/characterAudioConfigService');

        // Get character
        const character = await characterService.getCharacterById(characterId);
        if (!character) {
            return res.status(404).json({
                success: false,
                error: 'Character not found'
            });
        }

        // Get audio configuration
        let audioConfig = null;
        try {
            audioConfig = await characterAudioConfigService.getCharacterAudioConfig(characterId);
        } catch (error) {
            console.warn(`⚠️ Could not load audio config for character ${characterId}:`, error.message);
        }

        res.json({
            success: true,
            character: {
                id: character.id,
                name: character.char_name,
                description: character.char_description,
                assistantId: character.openaiAssistantId,
                voiceConfig: character.voiceConfig || null,
                audioConfig: audioConfig
            }
        });
    } catch (error) {
        console.error('❌ Error fetching character config:', error);
        res.status(500).json({
            success: false,
            error: 'Failed to fetch character configuration'
        });
    }
});

/**
 * POST /api/stt/start
 * Start speech-to-text for a character
 */
router.post('/api/stt/start', async (req, res) => {
    try {
        const { characterId } = req.body;

        if (!characterId) {
            return res.status(400).json({
                success: false,
                error: 'Character ID is required'
            });
        }

        // TODO: Implement STT start logic with microphone integration
        console.log(`🎤 Starting STT for character ${characterId}`);

        res.json({
            success: true,
            message: 'STT started successfully',
            characterId: characterId,
            status: 'listening'
        });
    } catch (error) {
        console.error('❌ Error starting STT:', error);
        res.status(500).json({
            success: false,
            error: 'Failed to start STT'
        });
    }
});

/**
 * POST /api/stt/stop
 * Stop speech-to-text
 */
router.post('/api/stt/stop', async (req, res) => {
    try {
        const { characterId } = req.body;

        // TODO: Implement STT stop logic
        console.log(`🎤 Stopping STT for character ${characterId || 'unknown'}`);

        res.json({
            success: true,
            message: 'STT stopped successfully',
            status: 'stopped'
        });
    } catch (error) {
        console.error('❌ Error stopping STT:', error);
        res.status(500).json({
            success: false,
            error: 'Failed to stop STT'
        });
    }
});

module.exports = router;
