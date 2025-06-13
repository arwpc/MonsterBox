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

// Initialize AI integration
let aiInstance = null;
let jawBridgeProcess = null;
let jawWebSocket = null;
let enhancedAnimatorProcess = null;

try {
    aiInstance = new ChatterPiAI({
        characterId: 'orlok',
        maxTokens: 150,
        temperature: 0.7
    });
    console.log('✅ ChatterPi AI integration initialized');

    // Start the jaw animation bridge
    startJawBridge();
} catch (error) {
    console.error('❌ Failed to initialize ChatterPi AI:', error.message);
}

// Start the jaw animation bridge process
function startJawBridge() {
    try {
        console.log('🦴 Starting ChatterPi jaw animation bridge...');

        jawBridgeProcess = spawn('python3', ['scripts/chatterpi/web_jaw_bridge.py'], {
            stdio: ['pipe', 'pipe', 'pipe'],
            cwd: process.cwd()
        });

        jawBridgeProcess.stdout.on('data', (data) => {
            console.log(`Jaw Bridge: ${data.toString().trim()}`);
        });

        jawBridgeProcess.stderr.on('data', (data) => {
            console.error(`Jaw Bridge Error: ${data.toString().trim()}`);
        });

        jawBridgeProcess.on('close', (code) => {
            console.log(`Jaw Bridge process exited with code ${code}`);
            jawBridgeProcess = null;
        });

        // Connect to the jaw bridge WebSocket after a delay
        setTimeout(connectToJawBridge, 3000);

    } catch (error) {
        console.error('❌ Failed to start jaw bridge:', error.message);
    }
}

// Connect to the jaw animation bridge WebSocket
function connectToJawBridge() {
    try {
        jawWebSocket = new WebSocket('ws://localhost:8765');

        jawWebSocket.on('open', () => {
            console.log('✅ Connected to ChatterPi jaw animation bridge');
        });

        jawWebSocket.on('error', (error) => {
            console.error('❌ Jaw bridge WebSocket error:', error.message);
        });

        jawWebSocket.on('close', () => {
            console.log('🔌 Jaw bridge WebSocket disconnected');
            jawWebSocket = null;
        });

    } catch (error) {
        console.error('❌ Failed to connect to jaw bridge:', error.message);
    }
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
        
        // Generate jaw animation data
        const jawAnimation = generateJawAnimation(result.text);

        // Trigger jaw animation if bridge is connected
        if (jawWebSocket && jawWebSocket.readyState === WebSocket.OPEN) {
            try {
                jawWebSocket.send(JSON.stringify({
                    type: 'start_animation',
                    character: result.character,
                    text: result.text
                }));
            } catch (error) {
                console.error('Error triggering jaw animation:', error.message);
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

        if (!jawWebSocket || jawWebSocket.readyState !== WebSocket.OPEN) {
            return res.status(503).json({
                success: false,
                error: 'Jaw animation system not available'
            });
        }

        console.log(`🦴 Moving jaw to ${angle}°`);

        jawWebSocket.send(JSON.stringify({
            type: 'jaw_move',
            angle: parseFloat(angle),
            duration: parseFloat(duration || 1.0),
            curve_type: curve_type || 'ease_in_out'
        }));

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

module.exports = router;
