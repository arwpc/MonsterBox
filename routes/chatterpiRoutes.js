/**
 * ChatterPi Routes - Simple HTTP API for AI Chat and Jaw Control
 * Replaces complex WebSocket approach with simple REST endpoints
 */

const express = require('express');
const router = express.Router();
const ChatterPiAI = require('../scripts/chatterpi/ai_integration');

// Initialize AI integration
let aiInstance = null;

try {
    aiInstance = new ChatterPiAI({
        characterId: 'orlok',
        maxTokens: 150,
        temperature: 0.7
    });
    console.log('✅ ChatterPi AI integration initialized');
} catch (error) {
    console.error('❌ Failed to initialize ChatterPi AI:', error.message);
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
