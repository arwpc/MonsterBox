/**
 * MonsterBox 4.0 - ElevenLabs API Routes
 * RESTful API endpoints for ElevenLabs integration
 */

import express from 'express';
import multer from 'multer';
import elevenLabsConfigService from '../../services/elevenLabsConfigService.js';
import { getSTTConfig, saveSTTConfig, getTTSConfig, saveTTSConfig } from '../../services/aiConfigStore.js';

const router = express.Router();

// Configure multer for file uploads
const upload = multer({
    storage: multer.memoryStorage(),
    limits: {
        fileSize: 10 * 1024 * 1024 // 10MB limit
    },
    fileFilter: (req, file, cb) => {
        // Accept audio files
        if (file.mimetype.startsWith('audio/')) {
            cb(null, true);
        } else {
            cb(new Error('Only audio files are allowed'), false);
        }
    }
});

// Middleware to check if ElevenLabs is configured
const requireElevenLabsConfig = (req, res, next) => {
    if (!elevenLabsConfigService.isElevenLabsConfigured()) {
        return res.status(400).json({
            success: false,
            error: 'ElevenLabs API not configured. Please set ELEVENLABS_API_KEY in .env file.'
        });
    }
    next();
};

// Configuration status
router.get('/status', (req, res) => {
    try {
        const isConfigured = elevenLabsConfigService.isElevenLabsConfigured();
        const maskedApiKey = elevenLabsConfigService.getMaskedApiKey();
        const audioConfig = elevenLabsConfigService.getAudioConfig();

        res.json({
            success: true,
            configured: isConfigured,
            apiKey: maskedApiKey,
            audioConfig
        });
    } catch (error) {
        console.error('Error getting ElevenLabs status:', error);
        res.status(500).json({
            success: false,
            error: 'Failed to get configuration status'
        });
    }
});

// Test API connection
router.post('/test-connection', requireElevenLabsConfig, async (req, res) => {
    try {
        // Import services dynamically to avoid circular dependencies
        const { default: elevenLabsTTSService } = await import('../../services/elevenLabsTTSService.js');

        // Test by fetching voices (lightweight operation)
        const result = await elevenLabsTTSService.getVoices();

        if (result.success) {
            res.json({
                success: true,
                message: 'ElevenLabs API connection successful',
                voiceCount: result.voices.length
            });
        } else {
            res.status(400).json({
                success: false,
                error: result.error
            });
        }
    } catch (error) {
        console.error('API connection test failed:', error);
        res.status(500).json({
            success: false,
            error: 'API connection test failed'
        });
    }
});

// STT Routes
router.get('/stt/capabilities', async (req, res) => {
    try {
        const { default: elevenLabsSTTService } = await import('../../services/elevenLabsSTTService.js');
        const capabilities = await elevenLabsSTTService.getSTTCapabilities();
        res.json(capabilities);
    } catch (error) {
        console.error('Error getting STT capabilities:', error);
        res.status(500).json({
            success: false,
            error: 'Failed to get STT capabilities'
        });
    }
});

router.post('/stt/transcribe', requireElevenLabsConfig, upload.single('audio'), async (req, res) => {
    try {
        const { default: elevenLabsSTTService } = await import('../../services/elevenLabsSTTService.js');

        if (!req.file) {
            return res.status(400).json({ success: false, error: 'No audio file provided' });
        }

        const audioBuffer = req.file.buffer;
        const options = Object.assign({}, req.body || {}, { mimeType: req.file.mimetype });

        const result = await elevenLabsSTTService.transcribeAudio(audioBuffer, options);
        if (result && result.success) {
            return res.json({
                success: true,
                text: result.transcript || result.text || '',
                confidence: result.confidence || null,
                language: result.language || null,
                duration: result.duration || null
            });
        }
        return res.status(400).json(result || { success: false, error: 'Transcription failed' });
    } catch (error) {
        console.error('STT transcription error:', error);
        res.status(500).json({ success: false, error: 'Transcription failed' });
    }
});


// Real-time STT server-side listener (Microphone Part)
router.post('/stt/listen/start', requireElevenLabsConfig, async (req, res) => {
    try {
        const { default: serverSTTListener } = await import('../../services/serverSTTListener.js');
        const { deviceId = 'default', model = 'eleven_multilingual_v2', language = 'auto' } = req.body || {};
        const result = serverSTTListener.startSession({ deviceId, model, language });
        res.json(result);
    } catch (error) {
        console.error('Error starting STT listener:', error);
        res.status(500).json({ success: false, error: 'Failed to start listener' });
    }
});

router.post('/stt/listen/stop', async (req, res) => {
    try {
        const { default: serverSTTListener } = await import('../../services/serverSTTListener.js');
        const { sessionId } = req.body || {};
        if (!sessionId) return res.status(400).json({ success: false, error: 'sessionId required' });
        const result = serverSTTListener.stopSession(sessionId);
        res.json(result);
    } catch (error) {
        console.error('Error stopping STT listener:', error);
        res.status(500).json({ success: false, error: 'Failed to stop listener' });
    }
});

router.get('/stt/listen/status', async (req, res) => {
    try {
        const { default: serverSTTListener } = await import('../../services/serverSTTListener.js');
        const { sessionId } = req.query || {};
        if (!sessionId) return res.status(400).json({ success: false, error: 'sessionId required' });
        const result = serverSTTListener.getStatus(sessionId);
        res.json(result);
    } catch (error) {
        console.error('Error getting STT listener status:', error);
        res.status(500).json({ success: false, error: 'Failed to get status' });
    }
});

// Agent Routes
router.get('/agents', requireElevenLabsConfig, async (req, res) => {
    try {
        const { default: elevenLabsAgentService } = await import('../../services/elevenLabsAgentService.js');
        const result = await elevenLabsAgentService.getAgents();
        res.json(result);
    } catch (error) {
        console.error('Error getting agents:', error);
        res.status(500).json({
            success: false,
            error: 'Failed to get agents'
        });
    }
});

router.get('/agents/:id', requireElevenLabsConfig, async (req, res) => {
    try {
        const { default: elevenLabsAgentService } = await import('../../services/elevenLabsAgentService.js');
        const result = await elevenLabsAgentService.getAgent(req.params.id);
        res.json(result);
    } catch (error) {
        console.error('Error getting agent:', error);
        res.status(500).json({
            success: false,
            error: 'Failed to get agent'
        });
    }
});

router.post('/agents', requireElevenLabsConfig, async (req, res) => {
    try {
        const { default: elevenLabsAgentService } = await import('../../services/elevenLabsAgentService.js');
        const result = await elevenLabsAgentService.createAgent(req.body);
        res.json(result);
    } catch (error) {
        console.error('Error creating agent:', error);
        res.status(500).json({
            success: false,
            error: 'Failed to create agent'
        });
    }
});

router.patch('/agents/:id', requireElevenLabsConfig, async (req, res) => {
    try {
        const { default: elevenLabsAgentService } = await import('../../services/elevenLabsAgentService.js');
        const result = await elevenLabsAgentService.updateAgent(req.params.id, req.body);
        res.json(result);
    } catch (error) {
        console.error('Error updating agent:', error);
        res.status(500).json({
            success: false,
            error: 'Failed to update agent'
        });
    }
});

router.delete('/agents/:id', requireElevenLabsConfig, async (req, res) => {
    try {
        const { default: elevenLabsAgentService } = await import('../../services/elevenLabsAgentService.js');
        const result = await elevenLabsAgentService.deleteAgent(req.params.id);
        res.json(result);
    } catch (error) {
        console.error('Error deleting agent:', error);
        res.status(500).json({
            success: false,
            error: 'Failed to delete agent'
        });
    }
});

router.get('/models', requireElevenLabsConfig, async (req, res) => {
    try {
        const { default: elevenLabsAgentService } = await import('../../services/elevenLabsAgentService.js');
        const result = await elevenLabsAgentService.getAvailableModels();
        res.json(result);
    } catch (error) {
        console.error('Error getting models:', error);
        res.status(500).json({
            success: false,
            error: 'Failed to get models'
        });
    }
});

// TTS Routes
router.get('/voices', requireElevenLabsConfig, async (req, res) => {
    try {
        const { default: elevenLabsTTSService } = await import('../../services/elevenLabsTTSService.js');
        const result = await elevenLabsTTSService.getVoices();
        res.json(result);
    } catch (error) {
        console.error('Error getting voices:', error);
        res.status(500).json({
            success: false,
            error: 'Failed to get voices'
        });
    }
});

router.get('/voices/:id', requireElevenLabsConfig, async (req, res) => {
    try {
        const { default: elevenLabsTTSService } = await import('../../services/elevenLabsTTSService.js');
        const result = await elevenLabsTTSService.getVoice(req.params.id);
        res.json(result);
    } catch (error) {
        console.error('Error getting voice:', error);
        res.status(500).json({
            success: false,
            error: 'Failed to get voice'
        });
    }
});

router.post('/tts/generate', requireElevenLabsConfig, async (req, res) => {
    try {
        const { default: elevenLabsTTSService } = await import('../../services/elevenLabsTTSService.js');
        const { text, voice_id, model, voice_settings } = req.body;

        // Convert frontend format to service format
        const options = {
            model: model,
            stability: voice_settings?.stability,
            similarity_boost: voice_settings?.similarity_boost,
            style: voice_settings?.style,
            use_speaker_boost: voice_settings?.use_speaker_boost
        };

        const result = await elevenLabsTTSService.generateSpeech(text, voice_id, options);

        if (result.success) {
            res.set({
                'Content-Type': result.contentType,
                'Content-Length': result.audioBuffer.length
            });
            res.send(result.audioBuffer);
        } else {
            res.status(400).json(result);
        }
    } catch (error) {
        console.error('TTS generation error:', error);
        res.status(500).json({
            success: false,
            error: 'TTS generation failed'
        });
    }
});

router.get('/tts/models', requireElevenLabsConfig, async (req, res) => {
    try {
        const { default: elevenLabsTTSService } = await import('../../services/elevenLabsTTSService.js');
        const result = await elevenLabsTTSService.getTTSModels();
        res.json(result);
    } catch (error) {
        console.error('Error getting TTS models:', error);
        res.status(500).json({
            success: false,
            error: 'Failed to get TTS models'
        });
    }
});

// STT Config
router.get('/stt/config', requireElevenLabsConfig, async (req, res) => {
    try {
        const cfg = await getSTTConfig();
        res.json({ success: true, config: cfg });
    } catch (e) {
        res.status(500).json({ success: false, error: e.message });
    }
});
router.post('/stt/config', requireElevenLabsConfig, async (req, res) => {
    try {
        const saved = await saveSTTConfig(req.body || {});
        res.json({ success: true, config: saved });
    } catch (e) {
        res.status(500).json({ success: false, error: e.message });
    }
});

// TTS Config
router.get('/tts/config', requireElevenLabsConfig, async (req, res) => {
    try {
        const cfg = await getTTSConfig();
        res.json({ success: true, config: cfg });
    } catch (e) {
        res.status(500).json({ success: false, error: e.message });
    }
});
router.post('/tts/config', requireElevenLabsConfig, async (req, res) => {
    try {
        const saved = await saveTTSConfig(req.body || {});
        res.json({ success: true, config: saved });
    } catch (e) {
        res.status(500).json({ success: false, error: e.message });
    }
});

// Voice cloning
router.post('/voices/clone', requireElevenLabsConfig, upload.array('files', 5), async (req, res) => {
    try {
        const { default: elevenLabsTTSService } = await import('../../services/elevenLabsTTSService.js');
        const name = (req.body && req.body.name) || 'Cloned Voice';
        const description = (req.body && req.body.description) || '';
        const files = (req.files || []).map(f => f.buffer);
        const result = await elevenLabsTTSService.cloneVoice(name, description, files);
        res.json(result);
    } catch (error) {
        console.error('Voice cloning error:', error);
        res.status(500).json({ success: false, error: 'Voice cloning failed' });
    }
});

// OLD CONVERSATION ENDPOINTS DISABLED - USE REAL-TIME WEBSOCKET ONLY
// All conversation functionality now handled by WebSocket service on port 8795
// Visit /ai-settings/agents and use Chat buttons for real-time conversation

router.post('/conversation/test', requireElevenLabsConfig, async (req, res) => {
    res.status(410).json({
        success: false,
        error: 'HTTP conversation endpoints disabled. Use real-time WebSocket on port 8795.',
        websocket_url: 'ws://localhost:8795',
        ui_url: '/ai-settings/agents'
    });
});

router.post('/conversation', requireElevenLabsConfig, upload.single('audio'), async (req, res) => {
    res.status(410).json({
        success: false,
        error: 'HTTP conversation endpoints disabled. Use real-time WebSocket on port 8795.',
        websocket_url: 'ws://localhost:8795',
        ui_url: '/ai-settings/agents'
    });
});

router.post('/conversation/play', requireElevenLabsConfig, async (req, res) => {
    res.status(410).json({
        success: false,
        error: 'HTTP conversation endpoints disabled. Use real-time WebSocket on port 8795.',
        websocket_url: 'ws://localhost:8795',
        ui_url: '/ai-settings/agents'
    });
});

// Play base64 audio data through character's configured speaker
router.post('/play-audio', async (req, res) => {
    try {
        const { audioData, characterId, format = 'mp3' } = req.body;

        if (!audioData || !characterId) {
            return res.status(400).json({
                success: false,
                error: 'audioData and characterId are required'
            });
        }

        const fs = await import('fs');
        const path = await import('path');
        const os = await import('os');

        // Create temporary file from base64 data
        const tempDir = os.tmpdir();
        const tempFileName = `audio_${Date.now()}_${Math.random().toString(36).substr(2, 9)}.${format}`;
        const tempFilePath = path.join(tempDir, tempFileName);

        // Convert base64 to buffer and write to temp file
        const audioBuffer = Buffer.from(audioData, 'base64');
        await fs.promises.writeFile(tempFilePath, audioBuffer);

        // Use server playback service to play through character's speaker
        const { default: serverPlaybackService } = await import('../../services/serverPlaybackService.js');
        const result = await serverPlaybackService.playBufferOnCharacterSpeaker(audioBuffer, {
            characterId: characterId,
            contentType: `audio/${format}`,
            volume: 80
        });

        // Clean up temp file
        try {
            await fs.promises.unlink(tempFilePath);
        } catch (cleanupError) {
            console.warn('⚠️ Failed to clean up temp audio file:', cleanupError.message);
        }

        if (result.success) {
            return res.json({
                success: true,
                played: true,
                device: result.deviceId || 'default',
                message: `Audio played on character ${characterId} speaker`
            });
        } else {
            return res.status(500).json({
                success: false,
                error: 'Failed to play audio',
                details: result.error
            });
        }

    } catch (error) {
        console.error('❌ Error playing base64 audio:', error);
        return res.status(500).json({
            success: false,
            error: 'Failed to play audio',
            details: error.message
        });
    }
});

// Generate TTS and play on character's configured speaker
router.post('/generate-and-play', async (req, res) => {
    try {
        const { text, characterId } = req.body;

        if (!text || !characterId) {
            return res.status(400).json({
                success: false,
                error: 'text and characterId are required'
            });
        }

        // Use ElevenLabs TTS service to generate speech
        const { default: elevenLabsTTSService } = await import('../../services/elevenLabsTTSService.js');

        // Get character's voice settings (if available)
        let voiceId = 'pNInz6obpgDQGcFmaJgB'; // Default voice
        // TODO: Get character's configured voice ID from database/config

        const ttsResult = await elevenLabsTTSService.generateSpeech(text, voiceId, {
            model: 'eleven_multilingual_v2',
            stability: 0.5,
            similarity_boost: 0.75
        });

        if (!ttsResult.success) {
            return res.status(500).json({
                success: false,
                error: 'TTS generation failed',
                details: ttsResult.error
            });
        }

        // Play the generated audio through character's speaker
        const { default: serverPlaybackService } = await import('../../services/serverPlaybackService.js');
        const playResult = await serverPlaybackService.playBufferOnCharacterSpeaker(ttsResult.audioBuffer, {
            characterId: characterId,
            contentType: 'audio/mpeg',
            volume: 80
        });

        if (playResult.success) {
            return res.json({
                success: true,
                played: true,
                device: playResult.deviceId || 'default',
                message: `TTS played on character ${characterId} speaker`,
                text: text
            });
        } else {
            return res.status(500).json({
                success: false,
                error: 'Failed to play TTS audio',
                details: playResult.error
            });
        }

    } catch (error) {
        console.error('❌ Error generating and playing TTS:', error);
        return res.status(500).json({
            success: false,
            error: 'Failed to generate and play TTS',
            details: error.message
        });
    }
});


export default router;
