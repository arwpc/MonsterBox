#!/usr/bin/env node
/**
 * ElevenLabs Integration Test Suite
 * Comprehensive testing of all ElevenLabs functionality
 */

require('dotenv').config();
const WebSocket = require('ws');
const fetch = require('node-fetch');

class ElevenLabsIntegrationTest {
    constructor() {
        this.baseURL = 'http://localhost:3000';
        this.wsURL = 'ws://localhost:8771';
        this.testResults = {
            passed: 0,
            failed: 0,
            tests: []
        };
    }

    /**
     * Run all tests
     */
    async runAllTests() {
        console.log('🧪 ElevenLabs Integration Test Suite');
        console.log('===================================');
        
        try {
            // Test 1: Service Status
            await this.testServiceStatus();
            
            // Test 2: Character Availability
            await this.testCharacterAvailability();
            
            // Test 3: Conversation Starters
            await this.testConversationStarters();
            
            // Test 4: WebSocket Connection
            await this.testWebSocketConnection();
            
            // Test 5: Character Selection
            await this.testCharacterSelection();
            
            // Test 6: AI Management Integration
            await this.testAIManagementIntegration();
            
            // Test 7: ChatterPi UI
            await this.testChatterPiUI();
            
            // Test 8: Legacy API Compatibility
            await this.testLegacyAPICompatibility();
            
            // Generate report
            this.generateReport();
            
        } catch (error) {
            console.error('💥 Test suite failed:', error.message);
            process.exit(1);
        }
    }

    /**
     * Test service status endpoint
     */
    async testServiceStatus() {
        console.log('\n🔍 Test 1: Service Status');
        
        try {
            const response = await fetch(`${this.baseURL}/chatterpi/api/status`);
            const result = await response.json();
            
            this.assert(response.ok, 'Status endpoint should return 200');
            this.assert(result.success, 'Status response should be successful');
            this.assert(result.data.isRunning, 'ElevenLabs service should be running');
            this.assert(result.data.port === 8771, 'Service should be on port 8771');
            this.assert(result.data.availableAgents === 4, 'Should have 4 available agents');
            
            console.log('   ✅ Service status test passed');
            this.recordTest('Service Status', true);
            
        } catch (error) {
            console.log('   ❌ Service status test failed:', error.message);
            this.recordTest('Service Status', false, error.message);
        }
    }

    /**
     * Test character availability
     */
    async testCharacterAvailability() {
        console.log('\n🎭 Test 2: Character Availability');
        
        try {
            const response = await fetch(`${this.baseURL}/chatterpi/api/characters`);
            const result = await response.json();
            
            this.assert(response.ok, 'Characters endpoint should return 200');
            this.assert(result.success, 'Characters response should be successful');
            this.assert(Array.isArray(result.data), 'Should return array of characters');
            this.assert(result.data.length === 4, 'Should have 4 characters');
            
            // Check each character has required fields
            result.data.forEach(char => {
                this.assert(char.id, 'Character should have ID');
                this.assert(char.name, 'Character should have name');
                this.assert(typeof char.available === 'boolean', 'Character should have availability status');
            });
            
            const availableCount = result.data.filter(char => char.available).length;
            this.assert(availableCount === 4, 'All characters should be available');
            
            console.log('   ✅ Character availability test passed');
            this.recordTest('Character Availability', true);
            
        } catch (error) {
            console.log('   ❌ Character availability test failed:', error.message);
            this.recordTest('Character Availability', false, error.message);
        }
    }

    /**
     * Test conversation starters
     */
    async testConversationStarters() {
        console.log('\n💡 Test 3: Conversation Starters');
        
        try {
            // Test for character 1 (Orlok)
            const response = await fetch(`${this.baseURL}/chatterpi/api/conversation-starters/1`);
            const result = await response.json();
            
            this.assert(response.ok, 'Conversation starters endpoint should return 200');
            this.assert(result.success, 'Conversation starters response should be successful');
            this.assert(result.data.characterId === 1, 'Should return correct character ID');
            this.assert(result.data.characterName === 'Orlok', 'Should return correct character name');
            this.assert(Array.isArray(result.data.conversationStarters), 'Should return array of starters');
            this.assert(result.data.conversationStarters.length === 5, 'Should have 5 conversation starters');
            
            console.log('   ✅ Conversation starters test passed');
            this.recordTest('Conversation Starters', true);
            
        } catch (error) {
            console.log('   ❌ Conversation starters test failed:', error.message);
            this.recordTest('Conversation Starters', false, error.message);
        }
    }

    /**
     * Test WebSocket connection
     */
    async testWebSocketConnection() {
        console.log('\n🔗 Test 4: WebSocket Connection');
        
        return new Promise((resolve) => {
            try {
                const ws = new WebSocket(this.wsURL);
                let connected = false;
                
                const timeout = setTimeout(() => {
                    if (!connected) {
                        ws.close();
                        console.log('   ❌ WebSocket connection test failed: Timeout');
                        this.recordTest('WebSocket Connection', false, 'Connection timeout');
                        resolve();
                    }
                }, 5000);
                
                ws.on('open', () => {
                    connected = true;
                    clearTimeout(timeout);
                    
                    console.log('   ✅ WebSocket connection test passed');
                    this.recordTest('WebSocket Connection', true);
                    
                    ws.close();
                    resolve();
                });
                
                ws.on('error', (error) => {
                    clearTimeout(timeout);
                    console.log('   ❌ WebSocket connection test failed:', error.message);
                    this.recordTest('WebSocket Connection', false, error.message);
                    resolve();
                });
                
            } catch (error) {
                console.log('   ❌ WebSocket connection test failed:', error.message);
                this.recordTest('WebSocket Connection', false, error.message);
                resolve();
            }
        });
    }

    /**
     * Test character selection
     */
    async testCharacterSelection() {
        console.log('\n🎯 Test 5: Character Selection');
        
        try {
            const response = await fetch(`${this.baseURL}/chatterpi/api/start-conversation`, {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ characterId: 1 })
            });
            
            const result = await response.json();
            
            this.assert(response.ok, 'Start conversation endpoint should return 200');
            this.assert(result.success, 'Start conversation response should be successful');
            this.assert(result.data.characterId === 1, 'Should return correct character ID');
            this.assert(result.data.characterName === 'Orlok', 'Should return correct character name');
            this.assert(result.data.agentId, 'Should return agent ID');
            this.assert(result.data.websocketUrl, 'Should return WebSocket URL');
            this.assert(Array.isArray(result.data.conversationStarters), 'Should return conversation starters');
            
            console.log('   ✅ Character selection test passed');
            this.recordTest('Character Selection', true);
            
        } catch (error) {
            console.log('   ❌ Character selection test failed:', error.message);
            this.recordTest('Character Selection', false, error.message);
        }
    }

    /**
     * Test AI Management integration
     */
    async testAIManagementIntegration() {
        console.log('\n🤖 Test 6: AI Management Integration');
        
        try {
            // Test AI Management page loads
            const response = await fetch(`${this.baseURL}/ai-management`);
            this.assert(response.ok, 'AI Management page should load');
            
            // Test assistants endpoint
            const assistantsResponse = await fetch(`${this.baseURL}/ai-management/assistants`);
            this.assert(assistantsResponse.ok, 'AI Management assistants page should load');
            
            console.log('   ✅ AI Management integration test passed');
            this.recordTest('AI Management Integration', true);
            
        } catch (error) {
            console.log('   ❌ AI Management integration test failed:', error.message);
            this.recordTest('AI Management Integration', false, error.message);
        }
    }

    /**
     * Test ChatterPi UI
     */
    async testChatterPiUI() {
        console.log('\n🖥️ Test 7: ChatterPi UI');
        
        try {
            const response = await fetch(`${this.baseURL}/chatterpi`);
            const html = await response.text();
            
            this.assert(response.ok, 'ChatterPi page should load');
            this.assert(html.includes('ChatterPi'), 'Page should contain ChatterPi title');
            this.assert(html.includes('ElevenLabs'), 'Page should mention ElevenLabs');
            this.assert(html.includes('Service Status'), 'Page should show service status');
            this.assert(html.includes('Select Character'), 'Page should have character selection');
            
            console.log('   ✅ ChatterPi UI test passed');
            this.recordTest('ChatterPi UI', true);
            
        } catch (error) {
            console.log('   ❌ ChatterPi UI test failed:', error.message);
            this.recordTest('ChatterPi UI', false, error.message);
        }
    }

    /**
     * Test legacy API compatibility
     */
    async testLegacyAPICompatibility() {
        console.log('\n🔄 Test 8: Legacy API Compatibility');
        
        try {
            const response = await fetch(`${this.baseURL}/chatterpi/api/chat`, {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ 
                    message: 'Hello test',
                    character: 'Orlok'
                })
            });
            
            const result = await response.json();
            
            this.assert(response.ok, 'Legacy chat endpoint should return 200');
            this.assert(result.success, 'Legacy chat response should be successful');
            this.assert(result.data.aiResponse, 'Should return AI response');
            this.assert(result.data.aiResponse.text, 'Should return response text');
            
            console.log('   ✅ Legacy API compatibility test passed');
            this.recordTest('Legacy API Compatibility', true);
            
        } catch (error) {
            console.log('   ❌ Legacy API compatibility test failed:', error.message);
            this.recordTest('Legacy API Compatibility', false, error.message);
        }
    }

    /**
     * Assert condition
     */
    assert(condition, message) {
        if (!condition) {
            throw new Error(message);
        }
    }

    /**
     * Record test result
     */
    recordTest(testName, passed, error = null) {
        this.testResults.tests.push({
            name: testName,
            passed,
            error
        });
        
        if (passed) {
            this.testResults.passed++;
        } else {
            this.testResults.failed++;
        }
    }

    /**
     * Generate test report
     */
    generateReport() {
        console.log('\n📊 Test Results Summary');
        console.log('=======================');
        console.log(`Total Tests: ${this.testResults.tests.length}`);
        console.log(`Passed: ${this.testResults.passed}`);
        console.log(`Failed: ${this.testResults.failed}`);
        console.log(`Success Rate: ${Math.round((this.testResults.passed / this.testResults.tests.length) * 100)}%`);
        
        console.log('\nDetailed Results:');
        this.testResults.tests.forEach(test => {
            const status = test.passed ? '✅ PASS' : '❌ FAIL';
            console.log(`  ${status} - ${test.name}`);
            if (!test.passed && test.error) {
                console.log(`    Error: ${test.error}`);
            }
        });
        
        const allPassed = this.testResults.failed === 0;
        console.log(`\n🎯 Overall Result: ${allPassed ? '✅ ALL TESTS PASSED' : '❌ SOME TESTS FAILED'}`);
        
        if (allPassed) {
            console.log('\n🎉 ElevenLabs Integration is working perfectly!');
            console.log('🚀 Ready for production use');
        } else {
            console.log('\n⚠️  Some tests failed - please review and fix issues');
        }
        
        return allPassed;
    }
}

// Run tests if called directly
if (require.main === module) {
    const tester = new ElevenLabsIntegrationTest();
    tester.runAllTests()
        .then(() => {
            const allPassed = tester.testResults.failed === 0;
            process.exit(allPassed ? 0 : 1);
        })
        .catch(error => {
            console.error('💥 Test suite crashed:', error.message);
            process.exit(1);
        });
}

module.exports = ElevenLabsIntegrationTest;
