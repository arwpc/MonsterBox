#!/usr/bin/env node
/**
 * ElevenLabs API Connectivity Test
 * Tests basic API connectivity and agent creation functionality
 */

require('dotenv').config();
const fetch = require('node-fetch');

class ElevenLabsAPITest {
    constructor() {
        this.apiKey = process.env.ELEVENLABS_API_KEY;
        
        if (!this.apiKey) {
            throw new Error('ELEVENLABS_API_KEY environment variable is required');
        }
        
        this.baseURL = 'https://api.elevenlabs.io/v1';
        this.headers = {
            'xi-api-key': this.apiKey,
            'Content-Type': 'application/json'
        };
        
        console.log('🔑 ElevenLabs API Key configured');
        console.log(`   Key prefix: ${this.apiKey.substring(0, 8)}...`);
    }
    
    /**
     * Test basic API connectivity
     */
    async testConnectivity() {
        try {
            console.log('\n🌐 Testing API connectivity...');

            // Test by getting user info
            const response = await fetch(`${this.baseURL}/user`, {
                method: 'GET',
                headers: this.headers
            });

            if (!response.ok) {
                throw new Error(`HTTP ${response.status}: ${response.statusText}`);
            }

            const user = await response.json();

            console.log('✅ API connectivity successful');
            console.log(`   User ID: ${user.xi_api_key?.substring(0, 8)}...`);
            console.log(`   Subscription: ${user.subscription?.tier || 'Unknown'}`);

            return true;
        } catch (error) {
            console.error('❌ API connectivity failed:', error.message);
            return false;
        }
    }
    
    /**
     * Test voice listing
     */
    async testVoices() {
        try {
            console.log('\n🎤 Testing voice listing...');

            const response = await fetch(`${this.baseURL}/voices`, {
                method: 'GET',
                headers: this.headers
            });

            if (!response.ok) {
                throw new Error(`HTTP ${response.status}: ${response.statusText}`);
            }

            const data = await response.json();

            console.log(`✅ Retrieved ${data.voices.length} voices`);

            // Show first few voices
            const sampleVoices = data.voices.slice(0, 3);
            sampleVoices.forEach(voice => {
                console.log(`   - ${voice.name} (${voice.voice_id})`);
                console.log(`     Category: ${voice.category || 'Unknown'}`);
                console.log(`     Labels: ${voice.labels ? Object.keys(voice.labels).join(', ') : 'None'}`);
            });

            return data.voices;
        } catch (error) {
            console.error('❌ Voice listing failed:', error.message);
            return null;
        }
    }
    
    /**
     * Test conversational AI agent creation
     */
    async testAgentCreation() {
        try {
            console.log('\n🤖 Testing conversational AI agent creation...');

            // Get available voices first
            const voicesResponse = await fetch(`${this.baseURL}/voices`, {
                method: 'GET',
                headers: this.headers
            });

            if (!voicesResponse.ok) {
                throw new Error(`Failed to get voices: HTTP ${voicesResponse.status}`);
            }

            const voicesData = await voicesResponse.json();
            if (!voicesData.voices || voicesData.voices.length === 0) {
                throw new Error('No voices available for agent creation');
            }

            // Use first available voice
            const testVoice = voicesData.voices[0];
            console.log(`   Using voice: ${testVoice.name} (${testVoice.voice_id})`);

            // Create a test agent
            const agentConfig = {
                name: 'MonsterBox Test Agent',
                prompt: 'You are a helpful test assistant for MonsterBox. Keep responses brief and friendly.',
                voice_id: testVoice.voice_id,
                conversation_config: {
                    turn_detection: {
                        type: 'server_vad',
                        threshold: 0.5,
                        prefix_padding_ms: 300,
                        silence_duration_ms: 200
                    }
                }
            };

            const createResponse = await fetch(`${this.baseURL}/convai/agents/create`, {
                method: 'POST',
                headers: this.headers,
                body: JSON.stringify(agentConfig)
            });

            if (!createResponse.ok) {
                const errorText = await createResponse.text();
                throw new Error(`HTTP ${createResponse.status}: ${errorText}`);
            }

            const agent = await createResponse.json();

            console.log('✅ Agent creation successful');
            console.log(`   Agent ID: ${agent.agent_id}`);
            console.log(`   Agent Name: ${agent.name}`);

            // Clean up - delete the test agent
            try {
                const deleteResponse = await fetch(`${this.baseURL}/convai/agents/${agent.agent_id}`, {
                    method: 'DELETE',
                    headers: this.headers
                });

                if (deleteResponse.ok) {
                    console.log('🗑️  Test agent cleaned up');
                } else {
                    console.warn('⚠️  Failed to clean up test agent: HTTP', deleteResponse.status);
                }
            } catch (cleanupError) {
                console.warn('⚠️  Failed to clean up test agent:', cleanupError.message);
            }

            return agent;
        } catch (error) {
            console.error('❌ Agent creation failed:', error.message);
            return null;
        }
    }
    
    /**
     * Test WebSocket URL generation
     */
    async testWebSocketUrl() {
        try {
            console.log('\n🔗 Testing WebSocket URL generation...');

            // Create a temporary agent for testing
            const voicesResponse = await fetch(`${this.baseURL}/voices`, {
                method: 'GET',
                headers: this.headers
            });

            const voicesData = await voicesResponse.json();
            const testVoice = voicesData.voices[0];

            const agentConfig = {
                name: 'WebSocket Test Agent',
                prompt: 'Test agent for WebSocket URL generation.',
                voice_id: testVoice.voice_id,
                conversation_config: {
                    turn_detection: {
                        type: 'server_vad',
                        threshold: 0.5,
                        prefix_padding_ms: 300,
                        silence_duration_ms: 200
                    }
                }
            };

            const createResponse = await fetch(`${this.baseURL}/convai/agents/create`, {
                method: 'POST',
                headers: this.headers,
                body: JSON.stringify(agentConfig)
            });

            const agent = await createResponse.json();

            // Wait a moment for agent to be ready
            await new Promise(resolve => setTimeout(resolve, 1000));

            // Get signed URL for WebSocket connection
            const urlResponse = await fetch(`${this.baseURL}/convai/conversation/get-signed-url?agent_id=${agent.agent_id}`, {
                method: 'GET',
                headers: this.headers
            });

            if (!urlResponse.ok) {
                throw new Error(`Failed to get signed URL: HTTP ${urlResponse.status}`);
            }

            const urlData = await urlResponse.json();

            console.log('✅ WebSocket URL generation successful');
            console.log(`   URL prefix: ${urlData.signed_url.substring(0, 50)}...`);

            // Clean up
            await fetch(`${this.baseURL}/convai/agents/${agent.agent_id}`, {
                method: 'DELETE',
                headers: this.headers
            });
            console.log('🗑️  WebSocket test agent cleaned up');

            return urlData;
        } catch (error) {
            console.error('❌ WebSocket URL generation failed:', error.message);
            return null;
        }
    }
    
    /**
     * Run all tests
     */
    async runAllTests() {
        console.log('🧪 ElevenLabs API Connectivity Test Suite');
        console.log('==========================================');
        
        const results = {
            connectivity: false,
            voices: false,
            agentCreation: false,
            webSocketUrl: false
        };
        
        // Test connectivity
        results.connectivity = await this.testConnectivity();
        
        if (results.connectivity) {
            // Test voices
            const voices = await this.testVoices();
            results.voices = voices !== null;
            
            if (results.voices) {
                // Test agent creation
                const agent = await this.testAgentCreation();
                results.agentCreation = agent !== null;
                
                // Test WebSocket URL generation
                const wsUrl = await this.testWebSocketUrl();
                results.webSocketUrl = wsUrl !== null;
            }
        }
        
        // Summary
        console.log('\n📊 Test Results Summary');
        console.log('========================');
        console.log(`API Connectivity: ${results.connectivity ? '✅ PASS' : '❌ FAIL'}`);
        console.log(`Voice Listing: ${results.voices ? '✅ PASS' : '❌ FAIL'}`);
        console.log(`Agent Creation: ${results.agentCreation ? '✅ PASS' : '❌ FAIL'}`);
        console.log(`WebSocket URL: ${results.webSocketUrl ? '✅ PASS' : '❌ FAIL'}`);
        
        const allPassed = Object.values(results).every(result => result);
        console.log(`\n🎯 Overall Result: ${allPassed ? '✅ ALL TESTS PASSED' : '❌ SOME TESTS FAILED'}`);
        
        return results;
    }
}

// Run tests if called directly
if (require.main === module) {
    const tester = new ElevenLabsAPITest();
    tester.runAllTests()
        .then(results => {
            const allPassed = Object.values(results).every(result => result);
            process.exit(allPassed ? 0 : 1);
        })
        .catch(error => {
            console.error('💥 Test suite failed:', error.message);
            process.exit(1);
        });
}

module.exports = ElevenLabsAPITest;
