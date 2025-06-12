#!/usr/bin/env node

/**
 * Simple AI Integration for ChatterPi
 * Generates Count Orlok responses using OpenAI
 */

require('dotenv').config();
const OpenAI = require('openai');

async function generateOrlokResponse(userMessage) {
    try {
        const apiKey = process.env.OPENAI_API_KEY;
        if (!apiKey) {
            throw new Error('OpenAI API key not found');
        }

        const openai = new OpenAI({ apiKey: apiKey });

        const completion = await openai.chat.completions.create({
            model: 'gpt-3.5-turbo',
            messages: [
                {
                    role: 'system',
                    content: 'You are Count Orlok, the ancient vampire from Nosferatu. You speak with an archaic, formal tone with hints of Romanian accent. You are mysterious, aristocratic, and slightly menacing but not overtly hostile. Keep responses brief (1-2 sentences) for natural conversation flow. Use archaic words like "thee", "thou", "verily", and speak of your castle, the night, and your ancient existence.'
                },
                {
                    role: 'user',
                    content: userMessage
                }
            ],
            max_tokens: 150,
            temperature: 0.7
        });

        const response = completion.choices[0].message.content.trim();
        console.log(`🎭 ChatterPi AI initialized for character: orlok`);
        console.log(`🎭 Processing conversation: "${userMessage}"`);
        console.log(`🧠 Generating AI response for: "${userMessage}"`);
        console.log(`✅ AI response generated: "${response}"`);
        console.log(`🎤 Generating speech for: "${response}"`);
        console.log(`🎭 Count Orlok: ${response}`);
        
        return response;
    } catch (error) {
        console.error(`❌ Error generating AI response: ${error.message}`);
        // Return fallback
        const fallbacks = [
            "The shadows whisper secrets I cannot share...",
            "Verily, the night holds many mysteries.",
            "Thou speakest of matters beyond mortal understanding.",
            "The ancient ways are not easily explained."
        ];
        const fallback = fallbacks[Math.floor(Math.random() * fallbacks.length)];
        console.log(`🎤 Generating speech for: "${fallback}"`);
        return fallback;
    }
}

// CLI usage
if (require.main === module) {
    const userMessage = process.argv[2] || "Hello, who are you?";
    const characterId = process.argv[3] || 'orlok';

    generateOrlokResponse(userMessage)
        .then(response => {
            process.exit(0);
        })
        .catch(error => {
            console.error(`💥 Error: ${error.message}`);
            process.exit(1);
        });
}

module.exports = { generateOrlokResponse };
