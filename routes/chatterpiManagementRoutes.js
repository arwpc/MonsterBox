/**
 * ChatterPi Jaw Animation Management Routes
 * 
 * Comprehensive ChatterPi management system that consolidates and enhances
 * jaw animation functionality while reorganizing AI-related pages.
 * 
 * Features:
 * - Real-time servo control via WebSocket (port 8773)
 * - Multi-source audio processing (TTS, files, microphone, streams)
 * - Character integration and configuration management
 * - Advanced audio analysis with WebRTC VAD
 * - Hardware-timed PWM control for GPIO pin 18
 * - Configuration presets and real-time tuning
 */

const express = require('express');
const router = express.Router();
const logger = require('../scripts/logger');
const characterService = require('../services/characterService');
const { ServoWebSocketClient } = require('../services/servoWebSocketClient');

// Global service instances
let servoWebSocketClient = null;
let audioProcessor = null;

// Initialize servo WebSocket client for port 8773
function initializeServoClient() {
    if (!servoWebSocketClient) {
        servoWebSocketClient = new ServoWebSocketClient({
            host: '127.0.0.1',
            port: 8773 // Unified servo service port (ChatterPi jaw animation)
        });
        
        servoWebSocketClient.on('connected', () => {
            logger.info('✅ ChatterPi connected to unified servo service on port 8773');
            // Initialize ChatterPi jaw servo configuration
            initializeJawServoConfig();
        });

        servoWebSocketClient.on('disconnected', () => {
            logger.warn('⚠️ ChatterPi servo service disconnected');
        });

        servoWebSocketClient.on('error', (error) => {
            logger.error('❌ ChatterPi servo service error:', error);
        });
    }
    return servoWebSocketClient;
}

// Initialize jaw servo configuration for ChatterPi
async function initializeJawServoConfig() {
    try {
        const client = servoWebSocketClient;
        if (!client || !client.isConnected) return;

        // Configure GPIO pin 18 for ChatterPi jaw servo
        await client.sendRequest('configure_servo', {
            servo_id: '18',
            pin: 18,
            type: 'gpio',
            min_angle: 0,
            max_angle: 180,
            closed_angle: 50,  // ChatterPi closed position
            open_angle: 30,    // ChatterPi open position
            frequency: 50,     // 50Hz PWM frequency
            enable_jitter_reduction: true,
            step_threshold: 0.5
        });

        logger.info('🦴 ChatterPi jaw servo configured on GPIO pin 18');
    } catch (error) {
        logger.error('Failed to initialize jaw servo config:', error);
    }
}

// ChatterPi main management page
router.get('/', async (req, res) => {
    try {
        // Get all characters for selection
        const characters = await characterService.getAllCharacters();
        
        // Get default character (Character 4 - Skulltalker)
        const defaultCharacter = characters.find(c => c.id === 4) || characters[0];
        
        // Load jaw animation configuration for default character
        let jawConfig = {};
        if (defaultCharacter) {
            try {
                jawConfig = await characterService.getCharacterJawAnimationConfig(defaultCharacter.id);
            } catch (error) {
                logger.warn('Could not load jaw animation config for character:', error);
                jawConfig = getDefaultJawConfig();
            }
        }
        
        res.render('chatterpi-management', {
            title: 'ChatterPi Jaw Animation Management',
            pageTitle: 'ChatterPi Jaw Animation Control',
            pageDescription: 'Comprehensive jaw animation management with real-time control and character integration',
            breadcrumbs: [
                { name: 'Home', url: '/' },
                { name: 'ChatterPi', url: '/chatterpi' }
            ],
            characters,
            defaultCharacter,
            jawConfig,
            servoConnected: servoWebSocketClient?.isConnected || false
        });
    } catch (error) {
        logger.error('ChatterPi management page error:', error);
        res.status(500).render('error', {
            title: 'Error',
            message: 'Failed to load ChatterPi management page',
            error: error.message
        });
    }
});

// API: Get system status
router.get('/api/status', async (req, res) => {
    try {
        const client = initializeServoClient();
        
        const status = {
            servo: {
                connected: client.isConnected,
                port: 8773,
                pin: 18
            },
            audio: {
                processing: !!audioProcessor,
                sources: ['tts', 'files', 'microphone', 'streams']
            },
            animation: {
                active: false, // Will be updated based on actual state
                character: 4 // Default Skulltalker
            },
            timestamp: new Date().toISOString()
        };
        
        res.json({ success: true, status });
    } catch (error) {
        logger.error('Status check error:', error);
        res.status(500).json({ success: false, error: error.message });
    }
});

// API: Move servo to specific angle
router.post('/api/servo/move', async (req, res) => {
    try {
        const { angle, duration = 0.5, characterId = 4 } = req.body;
        
        if (angle === undefined || angle < 0 || angle > 180) {
            return res.status(400).json({
                success: false,
                error: 'Valid angle (0-180) is required'
            });
        }
        
        const client = initializeServoClient();
        
        if (!client.isConnected) {
            return res.status(503).json({
                success: false,
                error: 'Servo service not connected'
            });
        }
        
        // Use servo ID 18 for ChatterPi jaw (GPIO pin 18) with hardware-timed PWM
        await moveJawServo(angle, duration, characterId);

        logger.info(`🦴 ChatterPi jaw moved to ${angle}° for character ${characterId}`);

        res.json({
            success: true,
            message: 'Servo moved successfully',
            angle,
            duration,
            characterId,
            timestamp: new Date().toISOString()
        });
    } catch (error) {
        logger.error('Servo move error:', error);
        res.status(500).json({ success: false, error: error.message });
    }
});

// API: Start jaw animation
router.post('/api/animation/start', async (req, res) => {
    try {
        const { characterId = 4, audioSource = 'microphone' } = req.body;
        
        const client = initializeServoClient();
        
        if (!client.isConnected) {
            return res.status(503).json({
                success: false,
                error: 'Servo service not connected'
            });
        }
        
        // Start jaw animation with specified audio source using hardware control
        const result = await startJawAnimation(characterId, audioSource);

        logger.info(`🎤 Started jaw animation for character ${characterId} with ${audioSource}`);

        res.json({
            success: true,
            message: 'Jaw animation started with hardware-timed PWM',
            characterId,
            audioSource,
            result,
            timestamp: new Date().toISOString()
        });
    } catch (error) {
        logger.error('Animation start error:', error);
        res.status(500).json({ success: false, error: error.message });
    }
});

// API: Stop jaw animation
router.post('/api/animation/stop', async (req, res) => {
    try {
        const { characterId = 4 } = req.body;
        
        const client = initializeServoClient();
        
        if (!client.isConnected) {
            return res.status(503).json({
                success: false,
                error: 'Servo service not connected'
            });
        }
        
        const result = await stopJawAnimation(characterId);

        logger.info(`⏹️ Stopped jaw animation for character ${characterId}`);

        res.json({
            success: true,
            message: 'Jaw animation stopped with return to closed position',
            characterId,
            result,
            timestamp: new Date().toISOString()
        });
    } catch (error) {
        logger.error('Animation stop error:', error);
        res.status(500).json({ success: false, error: error.message });
    }
});

// API: Get character jaw configuration with voice settings
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

        // Get jaw animation configuration
        let jawConfig;
        try {
            jawConfig = await characterService.getCharacterJawAnimationConfig(characterId);
        } catch (error) {
            logger.warn(`No jaw config found for character ${characterId}, using defaults`);
            jawConfig = getDefaultJawConfig();
        }

        // Get voice configuration if available
        const voiceConfig = character.voiceConfig || {};

        // Get AI configuration if available
        const aiConfig = character.aiConfig || {};

        res.json({
            success: true,
            character: {
                id: character.id,
                name: character.name,
                description: character.description
            },
            config: {
                jaw: jawConfig,
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

// API: Update character jaw configuration with automatic persistence
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

        if (config.jaw) {
            // Validate and save jaw animation configuration
            const validatedJawConfig = characterService.validateJawAnimationConfig(config.jaw);
            await characterService.updateCharacterJawAnimationConfig(characterId, validatedJawConfig);
            updatedConfig.jaw = validatedJawConfig;
        }

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

        // Apply configuration to active servo if this is the current character
        await applyCharacterConfigToServo(characterId, updatedConfig);

        logger.info(`💾 Updated configuration for character ${characterId} (${character.name})`);

        res.json({
            success: true,
            message: 'Configuration updated and applied successfully',
            characterId,
            characterName: character.name,
            config: updatedConfig,
            timestamp: new Date().toISOString()
        });
    } catch (error) {
        logger.error('Update character config error:', error);
        res.status(500).json({ success: false, error: error.message });
    }
});

// API: Switch active character and load configuration
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
        const jawConfig = await characterService.getCharacterJawAnimationConfig(characterId);
        const voiceConfig = character.voiceConfig || {};
        const aiConfig = character.aiConfig || {};

        // Load character parts and servo mappings
        const partsInfo = await loadCharacterParts(characterId);

        // Apply configuration to servo service
        await applyCharacterConfigToServo(characterId, { jaw: jawConfig, voice: voiceConfig, ai: aiConfig });

        logger.info(`🎭 Activated character ${characterId} (${character.name}) with loaded configuration`);

        res.json({
            success: true,
            message: 'Character activated and configuration loaded',
            character: {
                id: character.id,
                name: character.name,
                description: character.description
            },
            config: {
                jaw: jawConfig,
                voice: voiceConfig,
                ai: aiConfig
            },
            parts: partsInfo,
            timestamp: new Date().toISOString()
        });
    } catch (error) {
        logger.error('Character activation error:', error);
        res.status(500).json({ success: false, error: error.message });
    }
});

// API: Get character parts and servo mappings
router.get('/api/character/:id/parts', async (req, res) => {
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

        const partsInfo = await loadCharacterParts(characterId);

        res.json({
            success: true,
            character: {
                id: character.id,
                name: character.name
            },
            parts: partsInfo,
            timestamp: new Date().toISOString()
        });
    } catch (error) {
        logger.error('Get character parts error:', error);
        res.status(500).json({ success: false, error: error.message });
    }
});

// API: Apply configuration preset
router.post('/api/preset/:presetName', async (req, res) => {
    try {
        const { presetName } = req.params;
        const { characterId = 4 } = req.body;

        const presets = getDefaultJawConfig().presets;

        if (!presets[presetName]) {
            return res.status(400).json({
                success: false,
                error: 'Invalid preset name',
                availablePresets: Object.keys(presets)
            });
        }

        const preset = presets[presetName];

        // Apply preset to servo service
        const client = initializeServoClient();
        if (client.isConnected) {
            await client.sendRequest('update_jaw_config', {
                character_id: characterId,
                servo_id: '18',
                config: preset
            });
        }

        logger.info(`🎛️ Applied ${presetName} preset for character ${characterId}`);

        res.json({
            success: true,
            message: `Applied ${presetName} preset`,
            preset,
            characterId
        });
    } catch (error) {
        logger.error('Apply preset error:', error);
        res.status(500).json({ success: false, error: error.message });
    }
});

// API: Send real-time audio data
router.post('/api/audio/data', async (req, res) => {
    try {
        const { audioData, volume, timestamp, characterId = 4 } = req.body;

        if (volume === undefined && !audioData) {
            return res.status(400).json({
                success: false,
                error: 'Audio data or volume is required'
            });
        }

        const client = initializeServoClient();

        if (!client.isConnected) {
            return res.status(503).json({
                success: false,
                error: 'Servo service not connected'
            });
        }

        // Send audio data for processing
        await client.sendRequest('process_audio', {
            character_id: characterId,
            servo_id: '18',
            volume: volume,
            audio_data: audioData,
            timestamp: timestamp || Date.now()
        });

        res.json({
            success: true,
            message: 'Audio data processed',
            timestamp: new Date().toISOString()
        });
    } catch (error) {
        logger.error('Audio data processing error:', error);
        res.status(500).json({ success: false, error: error.message });
    }
});

// API: Process TTS audio for jaw animation
router.post('/api/audio/tts', async (req, res) => {
    try {
        const { text, voiceId, characterId = 4 } = req.body;

        if (!text) {
            return res.status(400).json({
                success: false,
                error: 'Text is required for TTS processing'
            });
        }

        const client = initializeServoClient();

        if (!client.isConnected) {
            return res.status(503).json({
                success: false,
                error: 'Servo service not connected'
            });
        }

        // Process TTS with jaw animation
        const result = await client.sendRequest('process_tts', {
            character_id: characterId,
            servo_id: '18',
            text: text,
            voice_id: voiceId,
            enable_jaw_animation: true
        });

        logger.info(`🗣️ Processing TTS with jaw animation for character ${characterId}`);

        res.json({
            success: true,
            message: 'TTS processing started with jaw animation',
            characterId,
            text: text.substring(0, 50) + (text.length > 50 ? '...' : ''),
            result,
            timestamp: new Date().toISOString()
        });
    } catch (error) {
        logger.error('TTS processing error:', error);
        res.status(500).json({ success: false, error: error.message });
    }
});

// API: Process audio file for jaw animation
router.post('/api/audio/file', async (req, res) => {
    try {
        const { filePath, characterId = 4 } = req.body;

        if (!filePath) {
            return res.status(400).json({
                success: false,
                error: 'File path is required'
            });
        }

        const client = initializeServoClient();

        if (!client.isConnected) {
            return res.status(503).json({
                success: false,
                error: 'Servo service not connected'
            });
        }

        // Process audio file with jaw animation
        const result = await client.sendRequest('process_audio_file', {
            character_id: characterId,
            servo_id: '18',
            file_path: filePath,
            enable_jaw_animation: true
        });

        logger.info(`📁 Processing audio file with jaw animation for character ${characterId}`);

        res.json({
            success: true,
            message: 'Audio file processing started with jaw animation',
            characterId,
            filePath,
            result,
            timestamp: new Date().toISOString()
        });
    } catch (error) {
        logger.error('Audio file processing error:', error);
        res.status(500).json({ success: false, error: error.message });
    }
});

// API: Start microphone audio processing
router.post('/api/audio/microphone/start', async (req, res) => {
    try {
        const { characterId = 4, sampleRate = 44100, channels = 1 } = req.body;

        const client = initializeServoClient();

        if (!client.isConnected) {
            return res.status(503).json({
                success: false,
                error: 'Servo service not connected'
            });
        }

        // Start microphone processing with WebRTC VAD
        const result = await client.sendRequest('start_microphone_processing', {
            character_id: characterId,
            servo_id: '18',
            sample_rate: sampleRate,
            channels: channels,
            enable_vad: true,
            enable_jaw_animation: true
        });

        logger.info(`🎤 Started microphone processing with jaw animation for character ${characterId}`);

        res.json({
            success: true,
            message: 'Microphone processing started with jaw animation',
            characterId,
            sampleRate,
            channels,
            result,
            timestamp: new Date().toISOString()
        });
    } catch (error) {
        logger.error('Microphone processing start error:', error);
        res.status(500).json({ success: false, error: error.message });
    }
});

// API: Stop microphone audio processing
router.post('/api/audio/microphone/stop', async (req, res) => {
    try {
        const { characterId = 4 } = req.body;

        const client = initializeServoClient();

        if (!client.isConnected) {
            return res.status(503).json({
                success: false,
                error: 'Servo service not connected'
            });
        }

        // Stop microphone processing
        const result = await client.sendRequest('stop_microphone_processing', {
            character_id: characterId,
            servo_id: '18'
        });

        logger.info(`🎤 Stopped microphone processing for character ${characterId}`);

        res.json({
            success: true,
            message: 'Microphone processing stopped',
            characterId,
            result,
            timestamp: new Date().toISOString()
        });
    } catch (error) {
        logger.error('Microphone processing stop error:', error);
        res.status(500).json({ success: false, error: error.message });
    }
});

// API: Process audio stream
router.post('/api/audio/stream', async (req, res) => {
    try {
        const { streamUrl, characterId = 4, format = 'mp3' } = req.body;

        if (!streamUrl) {
            return res.status(400).json({
                success: false,
                error: 'Stream URL is required'
            });
        }

        const client = initializeServoClient();

        if (!client.isConnected) {
            return res.status(503).json({
                success: false,
                error: 'Servo service not connected'
            });
        }

        // Process audio stream with jaw animation
        const result = await client.sendRequest('process_audio_stream', {
            character_id: characterId,
            servo_id: '18',
            stream_url: streamUrl,
            format: format,
            enable_jaw_animation: true
        });

        logger.info(`📡 Processing audio stream with jaw animation for character ${characterId}`);

        res.json({
            success: true,
            message: 'Audio stream processing started with jaw animation',
            characterId,
            streamUrl,
            format,
            result,
            timestamp: new Date().toISOString()
        });
    } catch (error) {
        logger.error('Audio stream processing error:', error);
        res.status(500).json({ success: false, error: error.message });
    }
});

// API: Get real-time audio analysis
router.get('/api/audio/analysis', async (req, res) => {
    try {
        const { characterId = 4 } = req.query;

        const client = initializeServoClient();

        if (!client.isConnected) {
            return res.status(503).json({
                success: false,
                error: 'Servo service not connected'
            });
        }

        // Get current audio analysis data
        const result = await client.sendRequest('get_audio_analysis', {
            character_id: characterId,
            servo_id: '18'
        });

        res.json({
            success: true,
            analysis: result,
            timestamp: new Date().toISOString()
        });
    } catch (error) {
        logger.error('Audio analysis error:', error);
        res.status(500).json({ success: false, error: error.message });
    }
});

// API: Get servo status
router.get('/api/servo/status', async (req, res) => {
    try {
        const { characterId = 4 } = req.query;

        const status = await getServoStatus(characterId);

        res.json({
            success: true,
            status,
            timestamp: new Date().toISOString()
        });
    } catch (error) {
        logger.error('Servo status error:', error);
        res.status(500).json({ success: false, error: error.message });
    }
});

// API: Calibrate servo
router.post('/api/servo/calibrate', async (req, res) => {
    try {
        const { characterId = 4 } = req.body;

        const result = await calibrateServo(characterId);

        logger.info(`🎯 Completed servo calibration for character ${characterId}`);

        res.json({
            success: true,
            message: 'Servo calibration completed',
            result,
            characterId,
            timestamp: new Date().toISOString()
        });
    } catch (error) {
        logger.error('Servo calibration error:', error);
        res.status(500).json({ success: false, error: error.message });
    }
});

// API: Test servo connection and movement
router.post('/api/test/servo', async (req, res) => {
    try {
        const { characterId = 4 } = req.body;

        // Test sequence using hardware-timed PWM: closed -> open -> closed
        const testSequence = [
            { angle: 50, duration: 1.0 }, // Closed
            { angle: 30, duration: 1.0 }, // Open
            { angle: 50, duration: 1.0 }  // Closed
        ];

        for (const step of testSequence) {
            await moveJawServo(step.angle, step.duration, characterId);
            await new Promise(resolve => setTimeout(resolve, step.duration * 1000));
        }

        logger.info(`🧪 Completed hardware-timed servo test for character ${characterId}`);

        res.json({
            success: true,
            message: 'Hardware-timed servo test completed successfully',
            testSequence,
            characterId,
            timestamp: new Date().toISOString()
        });
    } catch (error) {
        logger.error('Servo test error:', error);
        res.status(500).json({ success: false, error: error.message });
    }
});

// Apply character configuration to servo service
async function applyCharacterConfigToServo(characterId, config) {
    try {
        const client = initializeServoClient();

        if (!client.isConnected) {
            logger.warn('Servo service not connected, configuration will be applied when connected');
            return;
        }

        // Apply jaw animation configuration
        if (config.jaw) {
            await client.sendRequest('update_character_config', {
                character_id: characterId,
                servo_id: '18',
                jaw_config: {
                    closed_angle: config.jaw.servo?.closedAngle || 50,
                    open_angle: config.jaw.servo?.openAngle || 30,
                    attack_time: config.jaw.audioAnalysis?.attackTime || 0.1,
                    release_time: config.jaw.audioAnalysis?.releaseTime || 0.01,
                    sensitivity: config.jaw.audioAnalysis?.sensitivity || 0.005,
                    volume_threshold: config.jaw.audioAnalysis?.volumeThreshold || 0.005,
                    smoothing_factor: config.jaw.audioAnalysis?.smoothingFactor || 0.8,
                    step_threshold: config.jaw.servo?.stepThreshold || 0.5,
                    update_rate: config.jaw.servo?.updateRate || 50
                }
            });
        }

        // Apply voice configuration for TTS integration
        if (config.voice && config.voice.speaker_id) {
            await client.sendRequest('update_voice_config', {
                character_id: characterId,
                voice_config: {
                    speaker_id: config.voice.speaker_id,
                    speed: config.voice.speed || 1.0,
                    pitch: config.voice.pitch || 1.0,
                    volume: config.voice.volume || 1.0,
                    emotion: config.voice.emotion || 'neutral'
                }
            });
        }

        logger.info(`⚙️ Applied configuration to servo service for character ${characterId}`);
    } catch (error) {
        logger.error('Failed to apply character config to servo:', error);
    }
}

// Load character parts and servo mappings
async function loadCharacterParts(characterId) {
    try {
        const character = await characterService.getCharacterById(characterId);
        if (!character) {
            throw new Error('Character not found');
        }

        // Get character parts (servos, motors, lights, etc.)
        const parts = character.parts || [];

        // Find jaw servo part
        const jawServoPart = parts.find(part =>
            part.type === 'servo' &&
            (part.name.toLowerCase().includes('jaw') || part.pin === 18)
        );

        // Auto-configure jaw servo if found
        if (jawServoPart) {
            const client = initializeServoClient();
            if (client.isConnected) {
                await client.sendRequest('configure_servo', {
                    servo_id: jawServoPart.id || '18',
                    pin: jawServoPart.pin || 18,
                    type: jawServoPart.controlType || 'gpio',
                    min_angle: jawServoPart.minAngle || 0,
                    max_angle: jawServoPart.maxAngle || 180,
                    name: jawServoPart.name || 'Jaw Servo'
                });

                logger.info(`🔧 Auto-configured jaw servo from character parts: ${jawServoPart.name}`);
            }
        }

        return {
            parts,
            jawServoPart,
            totalParts: parts.length
        };
    } catch (error) {
        logger.error('Failed to load character parts:', error);
        return { parts: [], jawServoPart: null, totalParts: 0 };
    }
}

// Hardware-timed PWM control for ChatterPi jaw servo
async function moveJawServo(angle, duration = 0.5, characterId = 4) {
    const client = initializeServoClient();

    if (!client.isConnected) {
        throw new Error('Servo service not connected');
    }

    // Validate angle range for ChatterPi (30° open, 50° closed)
    const clampedAngle = Math.max(0, Math.min(180, angle));

    // Send hardware-timed PWM command
    await client.sendRequest('jaw_move_precise', {
        servo_id: '18',
        angle: clampedAngle,
        duration: duration,
        character_id: characterId,
        use_hardware_timing: true,
        pwm_frequency: 50,
        curve_type: 'ease_in_out'
    });

    return clampedAngle;
}

// Start continuous jaw animation with audio synchronization
async function startJawAnimation(characterId = 4, audioSource = 'microphone') {
    const client = initializeServoClient();

    if (!client.isConnected) {
        throw new Error('Servo service not connected');
    }

    // Start jaw animation with audio synchronization
    const result = await client.sendRequest('start_jaw_animation', {
        servo_id: '18',
        character_id: characterId,
        audio_source: audioSource,
        closed_angle: 50,
        open_angle: 30,
        smoothing_factor: 0.8,
        attack_time: 0.1,
        release_time: 0.01,
        sensitivity: 0.005,
        volume_threshold: 0.005,
        enable_vad: true,
        enable_hardware_timing: true
    });

    return result;
}

// Stop jaw animation
async function stopJawAnimation(characterId = 4) {
    const client = initializeServoClient();

    if (!client.isConnected) {
        throw new Error('Servo service not connected');
    }

    // Stop jaw animation and return to closed position
    const result = await client.sendRequest('stop_jaw_animation', {
        servo_id: '18',
        character_id: characterId,
        return_to_closed: true,
        closed_angle: 50
    });

    return result;
}

// Get real-time servo status
async function getServoStatus(characterId = 4) {
    const client = initializeServoClient();

    if (!client.isConnected) {
        throw new Error('Servo service not connected');
    }

    // Get current servo status
    const result = await client.sendRequest('get_servo_status', {
        servo_id: '18',
        character_id: characterId
    });

    return result;
}

// Calibrate servo positions
async function calibrateServo(characterId = 4) {
    const client = initializeServoClient();

    if (!client.isConnected) {
        throw new Error('Servo service not connected');
    }

    // Run servo calibration sequence
    const result = await client.sendRequest('calibrate_servo', {
        servo_id: '18',
        character_id: characterId,
        test_positions: [0, 30, 50, 90, 180],
        hold_duration: 1.0
    });

    return result;
}

// Default jaw animation configuration
function getDefaultJawConfig() {
    return {
        servo: {
            pin: 18,
            closedAngle: 50,  // ChatterPi closed position
            openAngle: 30,    // ChatterPi open position
            stepThreshold: 0.5,
            updateRate: 50
        },
        audioAnalysis: {
            smoothingFactor: 0.8,
            attackTime: 0.1,
            releaseTime: 0.01,
            sensitivity: 0.005,
            volumeThreshold: 0.005,
            silenceTimeout: 500
        },
        presets: {
            smooth: {
                attackTime: 0.1,
                releaseTime: 0.01,
                sensitivity: 0.005
            },
            responsive: {
                attackTime: 0.05,
                releaseTime: 0.005,
                sensitivity: 0.01
            },
            debug: {
                attackTime: 0.2,
                releaseTime: 0.1,
                sensitivity: 0.02
            }
        }
    };
}

module.exports = router;
