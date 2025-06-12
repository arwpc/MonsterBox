#!/usr/bin/env node

/**
 * Simple test for AI integration
 */

require('dotenv').config();
const OpenAI = require('openai');

console.log('🧪 Testing AI Integration...');
console.log('OpenAI API Key exists:', !!process.env.OPENAI_API_KEY);

if (!process.env.OPENAI_API_KEY) {
    console.error('❌ No OpenAI API key found');
    process.exit(1);
}

const openai = new OpenAI({
    apiKey: process.env.OPENAI_API_KEY
});

async function testAI() {
    try {
        console.log('🧠 Sending test request to OpenAI...');
        
        const completion = await openai.chat.completions.create({
            model: 'gpt-3.5-turbo',
            messages: [
                {
                    role: 'system',
                    content: 'You are Count Orlok, an ancient vampire. Respond in character with a mysterious, eloquent tone.'
                },
                {
                    role: 'user',
                    content: 'Hello, Count Orlok'
                }
            ],
            max_tokens: 150,
            temperature: 0.7
        });

        const response = completion.choices[0].message.content;
        console.log('✅ AI Response received:');
        console.log('🎭 Count Orlok:', response);
        
        return response;
        
    } catch (error) {
        console.error('❌ AI Error:', error.message);
        throw error;
    }
}

// Run the test
testAI()
    .then(() => {
        console.log('✅ AI test completed successfully');
        process.exit(0);
    })
    .catch((error) => {
        console.error('💥 AI test failed:', error.message);
        process.exit(1);
    });
