#!/usr/bin/env node

console.log('🎯 Testing AI Integration...');

try {
    require('dotenv').config();
    console.log('✅ dotenv loaded');
    
    const OpenAI = require('openai');
    console.log('✅ OpenAI module loaded');
    
    const apiKey = process.env.OPENAI_API_KEY;
    console.log('🔑 API Key present:', apiKey ? 'YES' : 'NO');
    console.log('🔑 API Key length:', apiKey ? apiKey.length : 0);
    
    if (!apiKey) {
        console.log('❌ No OpenAI API key found');
        process.exit(1);
    }
    
    const openai = new OpenAI({ apiKey: apiKey });
    console.log('✅ OpenAI client created');
    
    // Test a simple completion
    console.log('🧠 Testing OpenAI API call...');
    
    openai.chat.completions.create({
        model: 'gpt-3.5-turbo',
        messages: [
            { role: 'system', content: 'You are Count Orlok. Respond in character with one sentence.' },
            { role: 'user', content: 'Hello' }
        ],
        max_tokens: 50
    }).then(completion => {
        console.log('✅ OpenAI API call successful!');
        console.log('🧛‍♂️ Response:', completion.choices[0].message.content);
        process.exit(0);
    }).catch(error => {
        console.log('❌ OpenAI API call failed:', error.message);
        process.exit(1);
    });
    
} catch (error) {
    console.log('💥 Error:', error.message);
    process.exit(1);
}
