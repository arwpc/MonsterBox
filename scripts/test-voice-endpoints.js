#!/usr/bin/env node

/**
 * Test Voice API Endpoints
 * 
 * This script tests all the voice-related API endpoints to ensure they work correctly
 * with the new TopMediai integration.
 */

const axios = require('axios');

const BASE_URL = 'http://localhost:3000';

async function testVoiceEndpoints() {
    console.log('🧪 Testing Voice API Endpoints\n');
    
    try {
        // Test 1: Get available voices
        console.log('📋 Test 1: GET /api/voice/available');
        const voicesResponse = await axios.get(`${BASE_URL}/api/voice/available`);
        console.log(`✅ Status: ${voicesResponse.status}`);
        console.log(`   Voices loaded: ${voicesResponse.data.length}`);
        
        if (voicesResponse.data.length > 0) {
            const sampleVoice = voicesResponse.data[0];
            console.log(`   Sample voice: ${sampleVoice.name} (${sampleVoice.speaker_id})`);
            
            // Test 2: Get voice capabilities
            console.log('\n🔧 Test 2: GET /api/voice/capabilities/:speaker_id');
            try {
                const capabilitiesResponse = await axios.get(`${BASE_URL}/api/voice/capabilities/${sampleVoice.speaker_id}`);
                console.log(`✅ Status: ${capabilitiesResponse.status}`);
                console.log(`   Emotions: ${capabilitiesResponse.data.emotions.join(', ')}`);
                console.log(`   Gender: ${capabilitiesResponse.data.gender}`);
                console.log(`   Language: ${capabilitiesResponse.data.language}`);
            } catch (capError) {
                console.log(`❌ Capabilities test failed: ${capError.response?.status} ${capError.message}`);
            }
            
            // Test 3: Generate speech
            console.log('\n🎤 Test 3: POST /api/voice/generate');
            try {
                const generateResponse = await axios.post(`${BASE_URL}/api/voice/generate`, {
                    speaker_id: sampleVoice.speaker_id,
                    text: 'Hello, this is a test of the TopMediai voice integration.',
                    options: {
                        emotion: 'Neutral',
                        speed: 1.0,
                        pitch: 0,
                        volume: 0
                    }
                });
                console.log(`✅ Status: ${generateResponse.status}`);
                console.log(`   Generated file: ${generateResponse.data.filename}`);
                console.log(`   Audio URL: ${generateResponse.data.path}`);
                console.log(`   Provider: ${generateResponse.data.metadata?.provider || 'Unknown'}`);
            } catch (genError) {
                console.log(`❌ Generation test failed: ${genError.response?.status} ${genError.message}`);
            }
            
            // Test 4: Get voice settings for character 1 (Orlok)
            console.log('\n⚙️ Test 4: GET /api/voice/settings/1');
            try {
                const settingsResponse = await axios.get(`${BASE_URL}/api/voice/settings/1`);
                console.log(`✅ Status: ${settingsResponse.status}`);
                console.log(`   Character 1 voice: ${settingsResponse.data.speaker_id}`);
                console.log(`   Settings: ${JSON.stringify(settingsResponse.data.settings)}`);
            } catch (settingsError) {
                console.log(`❌ Settings test failed: ${settingsError.response?.status} ${settingsError.message}`);
            }
            
            // Test 5: Generate speech for scene (character-specific)
            console.log('\n🎬 Test 5: POST /api/voice/generate-for-scene');
            try {
                const sceneResponse = await axios.post(`${BASE_URL}/api/voice/generate-for-scene`, {
                    text: 'Welcome to my castle, mortal. You have entered the domain of Count Orlok.',
                    characterId: 1
                });
                console.log(`✅ Status: ${sceneResponse.status}`);
                console.log(`   Scene audio generated: ${sceneResponse.data.filename}`);
                console.log(`   Sound ID: ${sceneResponse.data.soundId}`);
            } catch (sceneError) {
                console.log(`❌ Scene generation test failed: ${sceneError.response?.status} ${sceneError.message}`);
            }
            
            // Test 6: Test voice connection
            console.log('\n🔗 Test 6: POST /api/voice/test-connection');
            try {
                const connectionResponse = await axios.post(`${BASE_URL}/api/voice/test-connection`, {
                    speaker_id: sampleVoice.speaker_id
                });
                console.log(`✅ Status: ${connectionResponse.status}`);
                console.log(`   Connection test: ${connectionResponse.data.message}`);
                console.log(`   Provider: ${connectionResponse.data.provider}`);
            } catch (connError) {
                console.log(`❌ Connection test failed: ${connError.response?.status} ${connError.message}`);
            }
        }
        
        console.log('\n🎉 Voice endpoint testing completed!');
        
    } catch (error) {
        console.error('❌ Test failed:', error.message);
        if (error.response) {
            console.error(`   Status: ${error.response.status}`);
            console.error(`   Data:`, error.response.data);
        }
    }
}

// Run the test
if (require.main === module) {
    testVoiceEndpoints();
}

module.exports = { testVoiceEndpoints };
