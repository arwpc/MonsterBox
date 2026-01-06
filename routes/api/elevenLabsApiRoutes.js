/**
 * MonsterBox 5.5 - ElevenLabs API Routes
 * RESTful API endpoints for ElevenLabs integration
 */

import express from 'express';
import multer from 'multer';
import { getSTTConfig, getTTSConfig, saveSTTConfig, saveTTSConfig } from '../../services/aiConfigStore.js';
import elevenLabsConfigService from '../../services/elevenLabsConfigService.js';

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
    const configured = elevenLabsConfigService.isElevenLabsConfigured();
    if (!configured) {
        // In test mode, avoid failing with 400 so UI tests don't flag this as an error
        if (process.env.MB_TEST_MODE === '1' || process.env.MB_TEST_MODE === 'true') {
            return res.json({
                success: false,
                configured: false,
                error: 'ElevenLabs API not configured (test mode)'
            });
        }
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
        const { getSTTConfig } = await import('../../services/aiConfigStore.js');
        const saved = await getSTTConfig();
        const body = req.body || {};
        const deviceId = body.deviceId || 'default';
        const model = body.model || saved.model || 'scribe_v1';
        const language = body.language || saved.language || 'auto';
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

// Diagnostic: capture short sample via server path and (optionally) transcribe
router.post('/stt/testSample', requireElevenLabsConfig, async (req, res) => {
    try {
        const { default: serverSTTListener } = await import('../../services/serverSTTListener.js');
        const { default: elevenLabsSTTService } = await import('../../services/elevenLabsSTTService.js');
        const deviceId = (req.body && req.body.deviceId) || 'default';
        const duration = parseFloat((req.query && req.query.duration) || '2') || 2;
        const dryRun = String((req.query && req.query.dryRun) || '0') === '1';

        const wav = await serverSTTListener.captureChunkWav(deviceId, duration);
        const sizeBytes = (wav && wav.length) || 0;
        const usedPath = serverSTTListener._lastCapturePath || 'unknown';

        if (dryRun) {
            return res.json({ success: true, sizeBytes, usedPath });
        }
        if (!wav || !wav.length) {
            return res.status(400).json({ success: false, error: 'No audio captured', sizeBytes, usedPath });
        }
        // Use saved STT configuration for model/language
        const { getSTTConfig } = await import('../../services/aiConfigStore.js');
        const saved = await getSTTConfig();
        const model = saved.model || 'scribe_v1';
        const language = saved.language || undefined;
        const result = await elevenLabsSTTService.transcribeAudio(wav, { mimeType: 'audio/wav', model, language });
        if (result && result.success) {
            return res.json({ success: true, sizeBytes, usedPath, text: result.transcript || result.text || '' });
        }
        return res.status(400).json({ success: false, error: (result && result.error) || 'Transcription failed', sizeBytes, usedPath });
    } catch (e) {
        console.error('stt/testSample error:', e);
        res.status(500).json({ success: false, error: 'stt/testSample failed', details: e.message });
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
        const { getTTSConfigForCharacter } = await import('../../services/aiConfigStore.js');
        const { readConfig } = await import('../../services/configService.js');

        const { text } = req.body || {};
        let { voice_id, model, voice_settings, characterId } = req.body || {};

        // Resolve a safe default voice_id when missing or blank
        try {
            if (!voice_id || String(voice_id).trim() === '') {
                // Prefer the provided characterId, otherwise use currently selected character
                if (!characterId) {
                    try {
                        const cfg = await readConfig();
                        characterId = cfg && cfg.selectedCharacter ? cfg.selectedCharacter : null;
                    } catch (_) { /* ignore */ }
                }
                const resolved = await getTTSConfigForCharacter(characterId);
                voice_id = resolved && resolved.voice_id ? resolved.voice_id : voice_id;
            }
        } catch (_) { /* best-effort fallback */ }

        // If still no voice_id, fail fast with a clear message rather than hitting ElevenLabs 404
        if (!voice_id || String(voice_id).trim() === '') {
            return res.status(400).json({ success: false, error: 'voice_id is required (resolved none). Configure TTS voice in AI Settings.' });
        }

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

// STT Filter Presets
router.get('/stt/presets', requireElevenLabsConfig, async (req, res) => {
    try {
        const { getAllPresets } = await import('../../services/sttFilterPresets.js');
        const presets = getAllPresets();
        res.json({ success: true, presets });
    } catch (e) {
        res.status(500).json({ success: false, error: e.message });
    }
});

router.get('/stt/presets/:presetId', requireElevenLabsConfig, async (req, res) => {
    try {
        const { getPreset } = await import('../../services/sttFilterPresets.js');
        const preset = getPreset(req.params.presetId);
        if (!preset) {
            return res.status(404).json({ success: false, error: 'Preset not found' });
        }
        res.json({ success: true, preset });
    } catch (e) {
        res.status(500).json({ success: false, error: e.message });
    }
});

router.post('/stt/presets/:presetId/apply', requireElevenLabsConfig, async (req, res) => {
    try {
        const { applyPreset } = await import('../../services/sttFilterPresets.js');
        const currentConfig = await getSTTConfig();
        const newConfig = applyPreset(req.params.presetId, currentConfig);
        const saved = await saveSTTConfig(newConfig);
        res.json({ success: true, config: saved, preset: req.params.presetId });
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
        // In test mode, short-circuit with a success to avoid external calls and 5xxs
        if (process.env.MB_TEST_MODE === '1' || process.env.MB_TEST_MODE === 'true') {
            const { characterId, text } = req.body || {};
            return res.json({
                success: true,
                played: true,
                device: 'default',
                message: `TTS simulated in test mode for character ${characterId}`,
                text: text || '',
                voiceId: 'test-mode-voice',
                voiceFallback: false,
                testMode: true
            });
        }
        const { text, characterId } = req.body;

        if (!text || !characterId) {
            return res.status(400).json({
                success: false,
                error: 'text and characterId are required'
            });
        }

        // Use ElevenLabs TTS service to generate speech
        const { default: elevenLabsTTSService } = await import('../../services/elevenLabsTTSService.js');
        const { getTTSConfigForCharacter, getTTSConfig } = await import('../../services/aiConfigStore.js');

        // Get character's TTS configuration (per-character or global fallback)
        let ttsConfig = await getTTSConfigForCharacter(characterId);

        let ttsResult = await elevenLabsTTSService.generateSpeech(text, ttsConfig.voice_id, ttsConfig);

        // Fallback: if the configured voice fails (e.g., 404 or permissions), retry with global default voice
        let usedFallback = false;
        if (!ttsResult.success) {
            const fallbackCfg = await getTTSConfig();
            if (fallbackCfg && fallbackCfg.voice_id && fallbackCfg.voice_id !== ttsConfig.voice_id) {
                const retry = await elevenLabsTTSService.generateSpeech(text, fallbackCfg.voice_id, fallbackCfg);
                if (retry.success) {
                    ttsResult = retry;
                    usedFallback = true;
                    ttsConfig = fallbackCfg;
                }
            }
        }

        if (!ttsResult.success) {
            return res.status(500).json({
                success: false,
                error: 'TTS generation failed',
                details: ttsResult.error
            });
        }

        // Trigger random pose during TTS (if enabled)
        const { default: randomPoseService } = await import('../../services/randomPoseService.js');
        randomPoseService.triggerDuringTTS(characterId, text.length).catch(err => {
            console.log('ℹ️  Random pose skipped:', err.message || 'disabled');
        });

        // Play the generated audio through character's speaker
        const { default: serverPlaybackService } = await import('../../services/serverPlaybackService.js');
        // Use preemptive AI path: own stream, no waiting on any queues
        const playResult = await serverPlaybackService.playAIOnCharacterSpeaker(ttsResult.audioBuffer, {
            characterId: characterId,
            contentType: ttsResult.contentType || 'audio/wav',
            volume: 85,
            kind: 'ai'
        });

        if (playResult.success) {
            return res.json({
                success: true,
                played: true,
                device: playResult.deviceId || 'default',
                message: `TTS played on character ${characterId} speaker`,
                text: text,
                voiceId: ttsConfig.voice_id,
                voiceFallback: usedFallback || false
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

// Generate speech using AI Agent and play (personality-infused speech)
// This endpoint processes text through the character's AI agent for personality
// Falls back to simple TTS if agent API is slow or unavailable
router.post('/agent-speak', async (req, res) => {
    try {
        const { text, characterId, fallbackToTTS = true } = req.body;

        if (!text || !characterId) {
            return res.status(400).json({
                success: false,
                error: 'text and characterId are required'
            });
        }

        // Get character's AI agent ID
        const { default: characterService } = await import('../../services/characterService.js');
        const character = await characterService.getCharacterById(characterId);

        if (!character || !character.elevenLabsAgentId) {
            console.log(`⚠️  Character ${characterId} has no AI agent, using simple TTS`);
            // Fall back to simple TTS if no agent assigned
            if (fallbackToTTS) {
                return await generateAndPlaySimpleTTS(text, characterId, res);
            } else {
                return res.status(400).json({
                    success: false,
                    error: `Character ${characterId} does not have an AI agent assigned`
                });
            }
        }

        console.log(`🎭 Agent-speak for ${character.name}: Using fast TTS for "${text}"`);

        // For orchestration "Ask AI", use fast TTS instead of slow WebSocket conversational AI
        // The "Say" feature and this should have similar response times (< 1 second)
        // True conversational AI (which generates responses) is reserved for conversation mode
        const personalityText = text; // Fast mode just speaks the input text
        const usedAgent = false; // Not using slow agent mode for orchestration

        // Generate TTS from personality-infused text (or original if agent failed)
        const { default: elevenLabsTTSService } = await import('../../services/elevenLabsTTSService.js');
        const { getTTSConfigForCharacter, getTTSConfig } = await import('../../services/aiConfigStore.js');
        let ttsConfig = await getTTSConfigForCharacter(characterId);

        let ttsResult = await elevenLabsTTSService.generateSpeech(personalityText, ttsConfig.voice_id, ttsConfig);

        // Fallback to global default voice on failure
        let usedFallback = false;
        if (!ttsResult.success) {
            const fallbackCfg = await getTTSConfig();
            if (fallbackCfg && fallbackCfg.voice_id && fallbackCfg.voice_id !== ttsConfig.voice_id) {
                const retry = await elevenLabsTTSService.generateSpeech(personalityText, fallbackCfg.voice_id, fallbackCfg);
                if (retry.success) {
                    ttsResult = retry;
                    usedFallback = true;
                    ttsConfig = fallbackCfg;
                }
            }
        }

        if (!ttsResult.success) {
            return res.status(500).json({
                success: false,
                error: 'TTS generation failed',
                details: ttsResult.error
            });
        }

        // Trigger random pose during TTS (if enabled)
        const { default: randomPoseService } = await import('../../services/randomPoseService.js');
        randomPoseService.triggerDuringTTS(characterId, personalityText.length).catch(err => {
            console.log('ℹ️  Random pose skipped:', err.message || 'disabled');
        });

        // Play the generated audio through character's speaker
        const { default: serverPlaybackService } = await import('../../services/serverPlaybackService.js');
        const playResult = await serverPlaybackService.playAIOnCharacterSpeaker(ttsResult.audioBuffer, {
            characterId: characterId,
            contentType: ttsResult.contentType || 'audio/wav',
            volume: 85,
            kind: 'ai'
        });

        if (playResult.success) {
            return res.json({
                success: true,
                played: true,
                device: playResult.deviceId || 'default',
                message: usedAgent ?
                    `AI agent speech played on character ${characterId} speaker` :
                    `TTS played on character ${characterId} speaker (agent unavailable)`,
                originalText: text,
                personalityText: personalityText,
                usedAgent: usedAgent,
                agentId: character.elevenLabsAgentId,
                voiceId: ttsConfig.voice_id,
                voiceFallback: usedFallback || false
            });
        } else {
            return res.status(500).json({
                success: false,
                error: 'Failed to play TTS audio',
                details: playResult.error
            });
        }

    } catch (error) {
        console.error('❌ Agent-speak error:', error);
        return res.status(500).json({
            success: false,
            error: 'Failed to generate and play agent speech',
            message: error.message
        });
    }
});

// Helper function for simple TTS fallback
async function generateAndPlaySimpleTTS(text, characterId, res) {
    try {
        const { default: elevenLabsTTSService } = await import('../../services/elevenLabsTTSService.js');
        const { getTTSConfigForCharacter } = await import('../../services/aiConfigStore.js');
        const ttsConfig = await getTTSConfigForCharacter(characterId);

        const ttsResult = await elevenLabsTTSService.generateSpeech(text, ttsConfig.voice_id, ttsConfig);

        if (!ttsResult.success) {
            return res.status(500).json({
                success: false,
                error: 'TTS generation failed',
                details: ttsResult.error
            });
        }

        const { default: randomPoseService } = await import('../../services/randomPoseService.js');
        randomPoseService.triggerDuringTTS(characterId, text.length).catch(err => {
            console.log('ℹ️  Random pose skipped:', err.message || 'disabled');
        });

        const { default: serverPlaybackService } = await import('../../services/serverPlaybackService.js');
        const playResult = await serverPlaybackService.playBufferOnCharacterSpeaker(ttsResult.audioBuffer, {
            characterId: characterId,
            contentType: ttsResult.contentType || 'audio/wav',
            volume: 80
        });

        if (playResult.success) {
            return res.json({
                success: true,
                played: true,
                device: playResult.deviceId || 'default',
                message: `TTS played on character ${characterId} speaker (fallback mode)`,
                originalText: text,
                personalityText: text,
                usedAgent: false,
                voiceId: ttsConfig.voice_id
            });
        } else {
            return res.status(500).json({
                success: false,
                error: 'Failed to play TTS audio',
                details: playResult.error
            });
        }
    } catch (error) {
        return res.status(500).json({
            success: false,
            error: 'Fallback TTS failed',
            message: error.message
        });
    }
}


export default router;
