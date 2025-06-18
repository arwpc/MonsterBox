/**
 * ChatterPi Routes - Enhanced HTTP API for AI Chat and Jaw Control
 * Includes advanced audio processing configuration endpoints
 */

const express = require('express');
const router = express.Router();
const ChatterPiAI = require('../scripts/chatterpi/ai_integration');
const { spawn } = require('child_process');
const WebSocket = require('ws');
const fs = require('fs').promises;
const path = require('path');

// Initialize AI integration and service manager
let aiInstance = null;
let chatterPiServiceManager = null;
let ttsAnimation = null;

try {
    aiInstance = new ChatterPiAI({
        characterId: 'orlok',
        maxTokens: 150,
        temperature: 0.7
    });
    console.log('✅ ChatterPi AI integration initialized');

    // Initialize TTS Animation Integration
    const TTSAnimationIntegration = require('../scripts/chatterpi/tts_animation_integration');
    ttsAnimation = new TTSAnimationIntegration({
        topmediaiApiKey: process.env.TOPMEDIAI_API_KEY,
        streamingEnabled: true,
        realtimeAnimation: true
    });

    // Initialize TTS integration
    ttsAnimation.initialize().then(success => {
        if (success) {
            console.log('✅ TTS Animation Integration initialized');
        } else {
            console.warn('⚠️ TTS Animation Integration failed to initialize');
        }
    });

    // Initialize the consolidated service manager
    const ChatterPiServiceManager = require('../services/chatterPiServiceManager');
    chatterPiServiceManager = new ChatterPiServiceManager();

} catch (error) {
    console.error('❌ Failed to initialize ChatterPi AI:', error.message);
}

// Service manager integration
function setServiceManager(serviceManager) {
    chatterPiServiceManager = serviceManager;
    console.log('✅ ChatterPi Service Manager integrated with routes');
}

// Get jaw WebSocket connection from service manager
function getJawWebSocket() {
    if (chatterPiServiceManager) {
        return chatterPiServiceManager.getWebSocket('jawAnimator');
    }
    return null;
}

/**
 * POST /api/chatterpi/chat
 * Send a message to the AI and get a response
 */
router.post('/chat', async (req, res) => {
    try {
        const { message, character } = req.body;
        
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
                fallback: getFallbackResponse(character || 'orlok')
            });
        }
        
        // Set character if provided
        if (character && aiInstance.characters[character]) {
            aiInstance.config.characterId = character;
        }
        
        console.log(`🎭 Processing chat message: "${message}" for character: ${aiInstance.config.characterId}`);
        
        // Generate AI response
        const result = await aiInstance.generateResponse(message);
        
        // Generate animatronic animation data
        const jawAnimation = generateJawAnimation(result.text);

        // Trigger animatronic animation using service manager
        if (chatterPiServiceManager) {
            try {
                const success = chatterPiServiceManager.sendJawCommand({
                    type: 'start_animation',
                    character: result.character,
                    text: result.text
                });

                if (success) {
                    console.log('🎭 Animatronic animation triggered via service manager');
                } else {
                    console.warn('⚠️ Animatronic animation service not available');
                }
            } catch (error) {
                console.error('Error triggering animatronic animation:', error.message);
            }
        }

        // Try TTS with animation integration
        let ttsResult = null;
        if (ttsAnimation) {
            try {
                ttsResult = await ttsAnimation.speakWithAnimation(
                    result.text,
                    result.character || 'orlok'
                );
                console.log('🎤 TTS with animation:', ttsResult.success ? 'success' : 'fallback');
            } catch (error) {
                console.warn('TTS animation failed, using fallback:', error.message);
            }
        }

        res.json({
            success: true,
            data: {
                userMessage: message,
                aiResponse: {
                    text: result.text,
                    character: result.character,
                    metadata: result.metadata
                },
                jawAnimation: jawAnimation,
                tts: ttsResult ? {
                    enabled: ttsResult.success,
                    provider: ttsResult.success ? ttsResult.audioResult?.provider : 'fallback',
                    animationEnabled: ttsResult.animationEnabled
                } : null,
                timestamp: new Date().toISOString()
            }
        });
        
    } catch (error) {
        console.error('❌ Error in chat endpoint:', error);
        
        res.status(500).json({
            success: false,
            error: 'Failed to process chat message',
            fallback: getFallbackResponse(req.body.character || 'orlok'),
            details: error.message
        });
    }
});

/**
 * POST /api/chatterpi/speak
 * Generate TTS with real-time jaw animation
 */
router.post('/speak', async (req, res) => {
    try {
        const { text, character, voiceConfig } = req.body;

        if (!text || !text.trim()) {
            return res.status(400).json({
                success: false,
                error: 'Text is required'
            });
        }

        if (!ttsAnimation) {
            return res.status(503).json({
                success: false,
                error: 'TTS Animation service not available',
                fallback: 'browser_speech'
            });
        }

        console.log(`🎤 TTS request: "${text}" for character: ${character || 'orlok'}`);

        const result = await ttsAnimation.speakWithAnimation(
            text,
            character || 'orlok',
            voiceConfig || {}
        );

        if (result.success) {
            res.json({
                success: true,
                data: {
                    text,
                    character: character || 'orlok',
                    audioResult: {
                        provider: result.audioResult.provider,
                        format: result.audioResult.format,
                        duration: result.audioResult.duration,
                        timestamp: result.audioResult.timestamp
                    },
                    animationEnabled: result.animationEnabled,
                    voiceConfig: result.voiceConfig
                }
            });
        } else {
            res.json({
                success: false,
                error: result.error,
                fallback: result.fallback,
                text,
                character: result.character
            });
        }

    } catch (error) {
        console.error('❌ Error in TTS speak endpoint:', error);
        res.status(500).json({
            success: false,
            error: 'Failed to generate speech',
            details: error.message
        });
    }
});

/**
 * GET /api/chatterpi/voices
 * Get available TTS voices
 */
router.get('/voices', async (req, res) => {
    try {
        if (!ttsAnimation) {
            return res.status(503).json({
                success: false,
                error: 'TTS service not available'
            });
        }

        const voices = await ttsAnimation.getAvailableVoices();

        res.json({
            success: true,
            voices: voices,
            characterMappings: ttsAnimation.characterVoices
        });

    } catch (error) {
        console.error('❌ Error getting voices:', error);
        res.status(500).json({
            success: false,
            error: 'Failed to get voices',
            details: error.message
        });
    }
});

/**
 * POST /api/chatterpi/jaw/move
 * Move jaw to specific angle
 */
router.post('/jaw/move', async (req, res) => {
    try {
        const { angle, duration, curve_type } = req.body;

        if (angle === undefined) {
            return res.status(400).json({
                success: false,
                error: 'Angle is required'
            });
        }

        if (!chatterPiServiceManager) {
            return res.status(503).json({
                success: false,
                error: 'ChatterPi service manager not available'
            });
        }

        console.log(`🦴 Moving jaw to ${angle}°`);

        const success = chatterPiServiceManager.sendJawCommand({
            type: 'jaw_move',
            angle: parseFloat(angle),
            duration: parseFloat(duration || 0.5),  // Faster default duration
            curve_type: curve_type || 'linear'      // Linear for real-time response
        });

        if (!success) {
            return res.status(503).json({
                success: false,
                error: 'Animatronic animation system not available'
            });
        }

        res.json({
            success: true,
            message: `Jaw moving to ${angle}°`,
            angle: parseFloat(angle),
            timestamp: new Date().toISOString()
        });

    } catch (error) {
        console.error('❌ Error in jaw move endpoint:', error);
        res.status(500).json({
            success: false,
            error: 'Failed to move jaw',
            details: error.message
        });
    }
});

/**
 * POST /api/chatterpi/jaw/start-animation
 * Start audio-driven jaw animation
 */
router.post('/jaw/start-animation', async (req, res) => {
    try {
        const jawWebSocket = getJawWebSocket();
        if (!jawWebSocket || jawWebSocket.readyState !== WebSocket.OPEN) {
            return res.status(503).json({
                success: false,
                error: 'Jaw animation system not available'
            });
        }

        console.log('🎤 Starting audio-driven jaw animation');

        jawWebSocket.send(JSON.stringify({
            type: 'start_animation'
        }));

        res.json({
            success: true,
            message: 'Audio-driven jaw animation started',
            timestamp: new Date().toISOString()
        });

    } catch (error) {
        console.error('❌ Error starting jaw animation:', error);
        res.status(500).json({
            success: false,
            error: 'Failed to start jaw animation',
            details: error.message
        });
    }
});

/**
 * POST /api/chatterpi/jaw/stop-animation
 * Stop audio-driven jaw animation
 */
router.post('/jaw/stop-animation', async (req, res) => {
    try {
        const jawWebSocket = getJawWebSocket();
        if (!jawWebSocket || jawWebSocket.readyState !== WebSocket.OPEN) {
            return res.status(503).json({
                success: false,
                error: 'Jaw animation system not available'
            });
        }

        console.log('🛑 Stopping audio-driven jaw animation');

        jawWebSocket.send(JSON.stringify({
            type: 'stop_animation'
        }));

        res.json({
            success: true,
            message: 'Audio-driven jaw animation stopped',
            timestamp: new Date().toISOString()
        });

    } catch (error) {
        console.error('❌ Error stopping jaw animation:', error);
        res.status(500).json({
            success: false,
            error: 'Failed to stop jaw animation',
            details: error.message
        });
    }
});

/**
 * GET /api/chatterpi/jaw/status
 * Get jaw animation system status
 */
router.get('/jaw/status', async (req, res) => {
    try {
        const jawWebSocket = getJawWebSocket();
        if (!jawWebSocket || jawWebSocket.readyState !== WebSocket.OPEN) {
            return res.json({
                success: false,
                error: 'Jaw animation system not available',
                connected: false
            });
        }

        jawWebSocket.send(JSON.stringify({
            type: 'get_status'
        }));

        res.json({
            success: true,
            connected: true,
            message: 'Status request sent',
            timestamp: new Date().toISOString()
        });

    } catch (error) {
        console.error('❌ Error getting jaw status:', error);
        res.status(500).json({
            success: false,
            error: 'Failed to get jaw status',
            details: error.message
        });
    }
});

/**
 * GET /api/chatterpi/characters
 * Get list of available characters
 */
router.get('/characters', (req, res) => {
    try {
        if (!aiInstance) {
            return res.status(503).json({
                success: false,
                error: 'AI service not available'
            });
        }
        
        const characters = Object.entries(aiInstance.characters).map(([id, info]) => ({
            id: id,
            name: info.name,
            personality: info.personality || 'mysterious'
        }));
        
        res.json({
            success: true,
            characters: characters,
            current: aiInstance.config.characterId
        });
        
    } catch (error) {
        console.error('❌ Error getting characters:', error);
        res.status(500).json({
            success: false,
            error: 'Failed to get characters'
        });
    }
});

/**
 * POST /api/chatterpi/character
 * Set the active character
 */
router.post('/character', (req, res) => {
    try {
        const { character } = req.body;
        
        if (!character) {
            return res.status(400).json({
                success: false,
                error: 'Character ID is required'
            });
        }
        
        if (!aiInstance) {
            return res.status(503).json({
                success: false,
                error: 'AI service not available'
            });
        }
        
        if (!aiInstance.characters[character]) {
            return res.status(400).json({
                success: false,
                error: `Unknown character: ${character}`,
                available: Object.keys(aiInstance.characters)
            });
        }
        
        aiInstance.config.characterId = character;
        
        console.log(`🎭 Character changed to: ${character}`);
        
        res.json({
            success: true,
            character: {
                id: character,
                name: aiInstance.characters[character].name
            }
        });
        
    } catch (error) {
        console.error('❌ Error setting character:', error);
        res.status(500).json({
            success: false,
            error: 'Failed to set character'
        });
    }
});

/**
 * GET /api/chatterpi/greeting
 * Get a character greeting message
 */
router.get('/greeting/:character?', async (req, res) => {
    try {
        const character = req.params.character || 'orlok';
        
        if (!aiInstance) {
            return res.json({
                success: true,
                greeting: getFallbackGreeting(character),
                fallback: true
            });
        }
        
        // Set character
        if (aiInstance.characters[character]) {
            aiInstance.config.characterId = character;
        }
        
        const greetingPrompts = {
            orlok: "Introduce yourself as Count Orlok. Welcome the visitor to your domain with a brief, ominous but polite greeting.",
            skeleton: "Introduce yourself as a friendly skeleton. Give a brief, humorous greeting with a bone pun."
        };
        
        const prompt = greetingPrompts[character] || greetingPrompts.orlok;
        
        const result = await aiInstance.generateResponse(prompt);
        const jawAnimation = generateJawAnimation(result.text);
        
        res.json({
            success: true,
            greeting: result.text,
            character: result.character,
            jawAnimation: jawAnimation,
            timestamp: new Date().toISOString()
        });
        
    } catch (error) {
        console.error('❌ Error generating greeting:', error);
        res.json({
            success: true,
            greeting: getFallbackGreeting(req.params.character || 'orlok'),
            fallback: true,
            error: error.message
        });
    }
});

/**
 * POST /api/chatterpi/jaw/animate
 * Send jaw animation commands
 */
router.post('/jaw/animate', (req, res) => {
    try {
        const { text, animation } = req.body;

        let jawAnimation;
        if (animation) {
            jawAnimation = animation;
        } else if (text) {
            jawAnimation = generateJawAnimation(text);
        } else {
            return res.status(400).json({
                success: false,
                error: 'Either text or animation data is required'
            });
        }

        // Here you would send the animation to the jaw servo
        // For now, just return the animation data
        console.log('🦴 Jaw animation requested:', jawAnimation);

        res.json({
            success: true,
            jawAnimation: jawAnimation,
            message: 'Jaw animation data generated'
        });

    } catch (error) {
        console.error('❌ Error generating jaw animation:', error);
        res.status(500).json({
            success: false,
            error: 'Failed to generate jaw animation'
        });
    }
});

/**
 * POST /api/chatterpi/jaw/config
 * Update enhanced audio processing configuration
 */
router.post('/jaw/config', async (req, res) => {
    try {
        const config = req.body;

        // Validate configuration
        if (config.audio) {
            const { smoothing_attack, smoothing_release, silence_threshold, silence_timeout } = config.audio;

            if (smoothing_attack && (smoothing_attack < 0.01 || smoothing_attack > 1.0)) {
                return res.status(400).json({
                    success: false,
                    error: 'Invalid smoothing_attack. Must be between 0.01 and 1.0.'
                });
            }

            if (smoothing_release && (smoothing_release < 0.001 || smoothing_release > 0.5)) {
                return res.status(400).json({
                    success: false,
                    error: 'Invalid smoothing_release. Must be between 0.001 and 0.5.'
                });
            }

            if (silence_threshold && (silence_threshold < 0.001 || silence_threshold > 0.1)) {
                return res.status(400).json({
                    success: false,
                    error: 'Invalid silence_threshold. Must be between 0.001 and 0.1.'
                });
            }

            if (silence_timeout && (silence_timeout < 100 || silence_timeout > 2000)) {
                return res.status(400).json({
                    success: false,
                    error: 'Invalid silence_timeout. Must be between 100 and 2000 ms.'
                });
            }
        }

        if (config.servo) {
            const { step_threshold } = config.servo;

            if (step_threshold && (step_threshold < 0.1 || step_threshold > 5.0)) {
                return res.status(400).json({
                    success: false,
                    error: 'Invalid step_threshold. Must be between 0.1 and 5.0.'
                });
            }
        }

        // Send configuration update command via WebSocket
        const jawWebSocket = getJawWebSocket();
        if (jawWebSocket && jawWebSocket.readyState === WebSocket.OPEN) {
            jawWebSocket.send(JSON.stringify({
                type: 'update_config',
                config: config
            }));
        }

        console.log('🔧 Configuration updated:', config);

        res.json({
            success: true,
            message: 'Configuration updated successfully',
            data: config
        });

    } catch (error) {
        console.error('❌ Error in jaw config endpoint:', error);
        res.status(500).json({
            success: false,
            error: 'Internal server error'
        });
    }
});

/**
 * POST /api/chatterpi/voice-chat
 * Complete voice interaction: audio input → STT → AI chat → TTS → jaw animation
 */
router.post('/voice-chat', async (req, res) => {
    try {
        const { audioData, character, sttConfig, ttsConfig } = req.body;

        if (!audioData) {
            return res.status(400).json({
                success: false,
                error: 'Audio data is required'
            });
        }

        console.log('🎤 Processing voice chat request...');
        const startTime = Date.now();

        // Step 1: Convert speech to text using OpenAI Whisper
        let recognizedText = '';
        let sttResult = null;

        try {
            const OpenAI = require('openai');
            const openai = new OpenAI({
                apiKey: process.env.OPENAI_API_KEY
            });

            // Convert base64 audio to buffer if needed
            const audioBuffer = Buffer.isBuffer(audioData) ?
                audioData : Buffer.from(audioData, 'base64');

            // Create a temporary file for Whisper API
            const fs = require('fs').promises;
            const path = require('path');
            const tempFile = path.join('/tmp', `whisper_${Date.now()}.wav`);
            await fs.writeFile(tempFile, audioBuffer);

            // Call OpenAI Whisper API
            const transcription = await openai.audio.transcriptions.create({
                file: require('fs').createReadStream(tempFile),
                model: sttConfig?.model || 'whisper-1',
                language: sttConfig?.language || 'en'
            });

            // Clean up temp file
            await fs.unlink(tempFile).catch(() => {});

            recognizedText = transcription.text || '';
            sttResult = {
                text: recognizedText,
                confidence: 1.0, // Whisper doesn't provide confidence
                provider: 'OpenAI Whisper'
            };

            console.log(`🗣️ Speech recognized: "${recognizedText}"`);

        } catch (sttError) {
            console.warn('OpenAI Whisper STT failed, using fallback:', sttError.message);
            recognizedText = 'Hello, how are you?'; // Fallback text
            sttResult = {
                text: recognizedText,
                confidence: 0.1,
                provider: 'Fallback',
                error: sttError.message
            };
        }

        // Step 2: Generate AI response
        let aiResponse = null;
        try {
            if (character && aiInstance.config.characterId !== character) {
                aiInstance.config.characterId = character;
            }

            aiResponse = await aiInstance.generateResponse(recognizedText);
            console.log(`🤖 AI response: "${aiResponse.text}"`);

        } catch (aiError) {
            console.error('AI response failed:', aiError.message);
            return res.status(500).json({
                success: false,
                error: 'AI response generation failed',
                details: aiError.message,
                sttResult: sttResult
            });
        }

        // Step 3: Generate TTS and trigger jaw animation
        let ttsResult = null;
        if (ttsAnimation) {
            try {
                ttsResult = await ttsAnimation.speakWithAnimation(
                    aiResponse.text,
                    character || 'orlok',
                    ttsConfig || {}
                );
                console.log('🎤 TTS with animation:', ttsResult.success ? 'success' : 'fallback');
            } catch (ttsError) {
                console.warn('TTS animation failed:', ttsError.message);
            }
        }

        // Step 4: Generate jaw animation data
        const jawAnimation = generateJawAnimation(aiResponse.text);

        const totalTime = Date.now() - startTime;
        console.log(`✅ Voice chat completed in ${totalTime}ms`);

        res.json({
            success: true,
            data: {
                stt: {
                    recognizedText: recognizedText,
                    confidence: sttResult?.confidence || 0,
                    provider: sttResult?.provider || 'Unknown'
                },
                aiResponse: {
                    text: aiResponse.text,
                    character: aiResponse.character,
                    metadata: aiResponse.metadata
                },
                tts: ttsResult ? {
                    enabled: ttsResult.success,
                    provider: ttsResult.success ? ttsResult.audioResult?.provider : 'fallback',
                    animationEnabled: ttsResult.animationEnabled
                } : null,
                jawAnimation: jawAnimation,
                processingTime: totalTime,
                timestamp: new Date().toISOString()
            }
        });

    } catch (error) {
        console.error('❌ Voice chat error:', error.message);
        res.status(500).json({
            success: false,
            error: 'Voice chat processing failed',
            details: error.message
        });
    }
});

/**
 * POST /api/chatterpi/jaw/save-config
 * Save configuration to file
 */
router.post('/jaw/save-config', async (req, res) => {
    try {
        const config = req.body;
        const configPath = path.join(__dirname, '../data/chatterpi-config.json');

        // Add timestamp and version
        config.saved_at = new Date().toISOString();
        config.version = '2.0.0';

        // Ensure data directory exists
        const dataDir = path.dirname(configPath);
        await fs.mkdir(dataDir, { recursive: true });

        await fs.writeFile(configPath, JSON.stringify(config, null, 2));

        console.log('✅ ChatterPi configuration saved to file');

        res.json({
            success: true,
            message: 'Configuration saved successfully',
            data: { saved_at: config.saved_at }
        });
    } catch (error) {
        console.error('❌ Error saving configuration:', error);
        res.status(500).json({
            success: false,
            error: 'Failed to save configuration'
        });
    }
});

/**
 * GET /api/chatterpi/jaw/load-config
 * Load configuration from file
 */
router.get('/jaw/load-config', async (req, res) => {
    try {
        const configPath = path.join(__dirname, '../data/chatterpi-config.json');

        try {
            const configData = await fs.readFile(configPath, 'utf8');
            const config = JSON.parse(configData);

            res.json({
                success: true,
                message: 'Configuration loaded successfully',
                data: config
            });
        } catch (fileError) {
            // File doesn't exist or is invalid, return default config
            const defaultConfig = {
                version: '2.0.0',
                calibration: {
                    closed_angle: 50,
                    open_angle: 30,
                    servo_pin: 18
                },
                audio: {
                    smoothing_attack: 0.1,
                    smoothing_release: 0.01,
                    silence_threshold: 0.005,
                    silence_timeout: 500
                },
                servo: {
                    step_threshold: 1.0
                },
                update_rate_hz: 50
            };

            res.json({
                success: true,
                message: 'Default configuration loaded',
                data: defaultConfig
            });
        }
    } catch (error) {
        console.error('❌ Error loading configuration:', error);
        res.status(500).json({
            success: false,
            error: 'Failed to load configuration'
        });
    }
});

/**
 * Generate jaw animation data from text
 */
function generateJawAnimation(text) {
    const words = text.split(' ');
    const animation = [];

    // Jaw configuration (CORRECTED: Closed=70°, Open=30°)
    const closedAngle = 70;  // Mouth closed
    const openAngle = 30;    // Mouth open

    words.forEach((word, i) => {
        const openingFactor = Math.min(1.0, word.length / 8.0);
        // Since open < closed, we need to invert the calculation
        const angle = closedAngle - (openingFactor * (closedAngle - openAngle));

        animation.push({
            word: word,
            angle: Math.max(openAngle, Math.min(closedAngle, angle + (Math.random() * 6 - 3))),
            duration: 0.2 + word.length * 0.05,
            delay: i * 0.3
        });
    });

    return animation;
}

/**
 * Get fallback response when AI is not available
 */
function getFallbackResponse(character) {
    const fallbacks = {
        orlok: [
            "The shadows whisper secrets I cannot share...",
            "Verily, the night holds many mysteries.",
            "The ancient ways are not easily explained."
        ],
        skeleton: [
            "That's a bone-afide good question!",
            "I'm having a bone to pick with my memory right now.",
            "That really tickles my funny bone!"
        ]
    };
    
    const responses = fallbacks[character] || fallbacks.orlok;
    return responses[Math.floor(Math.random() * responses.length)];
}

/**
 * Get fallback greeting when AI is not available
 */
function getFallbackGreeting(character) {
    const greetings = {
        orlok: "Greetings, mortal... You have entered my domain. What brings thee to these ancient halls?",
        skeleton: "Well, well, well... looks like I've got a bone to pick with a new visitor! Welcome!"
    };
    
    return greetings[character] || greetings.orlok;
}

/**
 * GET /api/chatterpi/system/status
 * Get comprehensive system status including all services
 */
router.get('/system/status', (req, res) => {
    try {
        if (!chatterPiServiceManager) {
            return res.json({
                success: false,
                error: 'Service manager not initialized',
                services: {},
                timestamp: new Date().toISOString()
            });
        }

        const status = chatterPiServiceManager.getServiceStatus();

        res.json({
            success: true,
            ...status,
            realTimeOptimizations: {
                enabled: true,
                features: [
                    'Fast silence detection (50ms)',
                    'Rapid jaw closing (8x faster)',
                    'Minimal audio buffering (2 frames)',
                    'High update rate (100Hz)',
                    'Immediate servo response'
                ]
            }
        });

    } catch (error) {
        console.error('❌ Error getting system status:', error);
        res.status(500).json({
            success: false,
            error: 'Failed to get system status',
            details: error.message
        });
    }
});

module.exports = router;
module.exports.setServiceManager = setServiceManager;
