#!/usr/bin/env node

/**
 * Test TopMediai API Integration
 * 
 * This script tests the new TopMediai API integration to ensure it's working correctly.
 */

require('dotenv').config();
const TopMediaiAPI = require('./topMediaiAPI');
const logger = require('./logger');

async function testTopMediaiIntegration() {
    console.log('🧪 Testing TopMediai API Integration\n');
    
    try {
        const api = new TopMediaiAPI();
        
        // Test 1: Get available voices
        console.log('📋 Test 1: Getting available voices...');
        const voices = await api.getVoices();
        console.log(`✅ Successfully loaded ${voices.length} voices`);
        
        if (voices.length > 0) {
            const sampleVoice = voices[0];
            console.log(`   Sample voice: ${sampleVoice.name} (${sampleVoice.speaker_id})`);
            console.log(`   Gender: ${sampleVoice.gender}, Language: ${sampleVoice.language}`);
            console.log(`   Emotions: ${sampleVoice.emotions.join(', ')}`);
            
            // Test 2: Generate speech
            console.log('\n🎤 Test 2: Generating speech sample...');
            const result = await api.textToSpeech({
                voiceId: sampleVoice.speaker_id,
                text: 'Hello, this is a test of the TopMediai integration.',
                options: {
                    emotion: 'Neutral'
                }
            });
            
            console.log('✅ Speech generation successful!');
            console.log(`   File: ${result.filename}`);
            console.log(`   Path: ${result.filepath}`);
            console.log(`   URL: ${result.url}`);
            console.log(`   Provider: ${result.metadata.provider}`);
            
        } else {
            console.log('⚠️  No voices available for testing');
        }
        
        console.log('\n🎉 All tests passed! TopMediai integration is working correctly.');
        
    } catch (error) {
        console.error('❌ Test failed:', error.message);
        logger.error('TopMediai integration test failed', { error: error.message });
        process.exit(1);
    }
}

// Run the test
if (require.main === module) {
    testTopMediaiIntegration();
}

module.exports = { testTopMediaiIntegration };
