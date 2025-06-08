#!/usr/bin/env node

/**
 * ChatterPi AI Integration Test Script
 * 
 * Tests the AI integration components independently before full system startup.
 */

require('dotenv').config();
const ChatterPiAI = require('./ai_integration');

async function testAIIntegration() {
    console.log(`
🧪 ChatterPi AI Integration Test
================================

Testing AI components before full system startup...
`);
    
    let testsPassed = 0;
    let testsTotal = 0;
    
    // Test 1: API Key Configuration
    testsTotal++;
    console.log('🔑 Test 1: API Key Configuration');
    try {
        const openaiKey = process.env.OPENAI_API_KEY;
        const topmediaiKey = process.env.TOPMEDIAI_API_KEY;
        
        if (!openaiKey) {
            throw new Error('OpenAI API key not found');
        }
        
        if (openaiKey.includes('your_') || openaiKey.includes('_here')) {
            throw new Error('OpenAI API key appears to be a placeholder');
        }
        
        console.log(`   ✅ OpenAI API key configured (${openaiKey.substring(0, 10)}...)`);
        
        if (topmediaiKey && !topmediaiKey.includes('your_')) {
            console.log(`   ✅ TopMediai API key configured (${topmediaiKey.substring(0, 8)}...)`);
        } else {
            console.log('   ⚠️ TopMediai API key not configured (TTS will be disabled)');
        }
        
        testsPassed++;
        
    } catch (error) {
        console.log(`   ❌ Failed: ${error.message}`);
    }
    
    // Test 2: AI Client Initialization
    testsTotal++;
    console.log('\n🤖 Test 2: AI Client Initialization');
    try {
        const ai = new ChatterPiAI({ characterId: 'orlok' });
        console.log('   ✅ ChatterPiAI instance created successfully');
        console.log(`   ✅ Character: ${ai.config.characterId}`);
        console.log(`   ✅ Available characters: ${Object.keys(ai.characters).join(', ')}`);
        
        testsPassed++;
        
    } catch (error) {
        console.log(`   ❌ Failed: ${error.message}`);
    }
    
    // Test 3: Character Configuration
    testsTotal++;
    console.log('\n🎭 Test 3: Character Configuration');
    try {
        const ai = new ChatterPiAI({ characterId: 'orlok' });
        const orlokConfig = ai.characters.orlok;
        
        if (!orlokConfig) {
            throw new Error('Orlok character configuration not found');
        }
        
        console.log(`   ✅ Character name: ${orlokConfig.name}`);
        console.log(`   ✅ Voice ID: ${orlokConfig.voiceId}`);
        console.log(`   ✅ Personality: ${orlokConfig.personality}`);
        console.log(`   ✅ System prompt length: ${orlokConfig.systemPrompt.length} characters`);
        
        testsPassed++;
        
    } catch (error) {
        console.log(`   ❌ Failed: ${error.message}`);
    }
    
    // Test 4: AI Response Generation (if API key is valid)
    testsTotal++;
    console.log('\n💬 Test 4: AI Response Generation');
    try {
        const ai = new ChatterPiAI({ characterId: 'orlok' });
        
        console.log('   🔄 Generating test response...');
        const result = await ai.generateResponse("Hello, who are you?");
        
        if (!result || !result.text) {
            throw new Error('No response generated');
        }
        
        console.log(`   ✅ Response generated: "${result.text}"`);
        console.log(`   ✅ Character: ${result.character}`);
        console.log(`   ✅ Model: ${result.metadata.model}`);
        console.log(`   ✅ Tokens used: ${result.metadata.tokens}`);
        
        testsPassed++;
        
    } catch (error) {
        console.log(`   ❌ Failed: ${error.message}`);
        if (error.message.includes('API key')) {
            console.log('   💡 This might be due to API key issues or network connectivity');
        }
    }
    
    // Test 5: Conversation History Management
    testsTotal++;
    console.log('\n📚 Test 5: Conversation History Management');
    try {
        const ai = new ChatterPiAI({ characterId: 'orlok' });
        
        // Add some test history
        ai.conversationHistory.push(
            { role: 'user', content: 'Hello' },
            { role: 'assistant', content: 'Greetings, mortal...' }
        );
        
        const stats = ai.getStats();
        
        if (stats.conversationLength !== 2) {
            throw new Error('Conversation history not managed correctly');
        }
        
        console.log(`   ✅ History length: ${stats.conversationLength}`);
        console.log(`   ✅ Character ID: ${stats.characterId}`);
        console.log(`   ✅ Available characters: ${stats.availableCharacters.join(', ')}`);
        
        // Test history clearing
        ai.clearHistory();
        const clearedStats = ai.getStats();
        
        if (clearedStats.conversationLength !== 0) {
            throw new Error('History not cleared properly');
        }
        
        console.log('   ✅ History clearing works correctly');
        
        testsPassed++;
        
    } catch (error) {
        console.log(`   ❌ Failed: ${error.message}`);
    }
    
    // Test 6: Fallback Response System
    testsTotal++;
    console.log('\n🛡️ Test 6: Fallback Response System');
    try {
        const ai = new ChatterPiAI({ characterId: 'orlok' });
        
        const fallbackResponse = ai.getFallbackResponse();
        
        if (!fallbackResponse || typeof fallbackResponse !== 'string') {
            throw new Error('Fallback response not generated');
        }
        
        console.log(`   ✅ Fallback response: "${fallbackResponse}"`);
        
        // Test with different character
        ai.config.characterId = 'skeleton';
        const skeletonFallback = ai.getFallbackResponse();
        
        console.log(`   ✅ Skeleton fallback: "${skeletonFallback}"`);
        
        testsPassed++;
        
    } catch (error) {
        console.log(`   ❌ Failed: ${error.message}`);
    }
    
    // Test 7: Event System
    testsTotal++;
    console.log('\n📡 Test 7: Event System');
    try {
        const ai = new ChatterPiAI({ characterId: 'orlok' });
        
        let eventReceived = false;
        
        ai.on('response_generated', (data) => {
            eventReceived = true;
            console.log(`   ✅ Event received: response_generated`);
            console.log(`   ✅ Event data: ${JSON.stringify(data, null, 2)}`);
        });
        
        // Simulate event emission
        ai.emit('response_generated', {
            userMessage: 'Test',
            aiResponse: 'Test response',
            character: 'Count Orlok',
            timestamp: new Date().toISOString()
        });
        
        if (!eventReceived) {
            throw new Error('Event system not working');
        }
        
        testsPassed++;
        
    } catch (error) {
        console.log(`   ❌ Failed: ${error.message}`);
    }
    
    // Test Results
    console.log(`
📊 Test Results
===============
Tests Passed: ${testsPassed}/${testsTotal}
Success Rate: ${Math.round((testsPassed / testsTotal) * 100)}%
`);
    
    if (testsPassed === testsTotal) {
        console.log('🎉 All tests passed! AI integration is ready.');
        console.log('\n🚀 You can now start the full ChatterPi AI system with:');
        console.log('   node scripts/chatterpi/start_ai_system.js orlok');
        return true;
    } else {
        console.log('⚠️ Some tests failed. Please check the configuration and try again.');
        console.log('\n🔧 Common issues:');
        console.log('   - Check API keys in .env file');
        console.log('   - Ensure internet connectivity for API calls');
        console.log('   - Verify all required dependencies are installed');
        return false;
    }
}

// Run tests if called directly
if (require.main === module) {
    testAIIntegration()
        .then(success => {
            process.exit(success ? 0 : 1);
        })
        .catch(error => {
            console.error('\n💥 Test execution failed:', error.message);
            process.exit(1);
        });
}

module.exports = { testAIIntegration };
