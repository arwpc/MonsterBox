/**
 * Test AI Agent Integration
 * Verifies that each character uses its assigned AI agent with unique personality
 */

import axios from 'axios';
import fs from 'fs/promises';
import path from 'path';
import { fileURLToPath } from 'url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

const BASE_URL = 'http://localhost:3000';
const TEST_TIMEOUT = 60000; // 60 seconds for AI agent processing

// Test phrases to verify personality
const TEST_PHRASES = {
    greeting: "Hello, welcome to our haunted house",
    question: "What brings you here tonight?",
    command: "Come closer if you dare"
};

/**
 * Load character data
 */
async function loadCharacters() {
    try {
        const charactersPath = path.resolve(__dirname, '../data/characters.json');
        const data = await fs.readFile(charactersPath, 'utf8');
        return JSON.parse(data);
    } catch (error) {
        console.error('❌ Failed to load characters:', error.message);
        return [];
    }
}

/**
 * Test AI agent speech for a character
 */
async function testAgentSpeech(characterId, characterName, agentId, testPhrase) {
    console.log(`\n🎭 Testing ${characterName} (Character ${characterId})`);
    console.log(`   Agent ID: ${agentId}`);
    console.log(`   Test phrase: "${testPhrase}"`);
    
    try {
        const response = await axios.post(
            `${BASE_URL}/api/elevenlabs/agent-speak`,
            {
                text: testPhrase,
                characterId: characterId
            },
            {
                headers: { 'Content-Type': 'application/json' },
                timeout: TEST_TIMEOUT
            }
        );

        if (response.data.success) {
            console.log(`   ✅ Success!`);
            console.log(`   Original: "${response.data.originalText}"`);
            console.log(`   Personality: "${response.data.personalityText}"`);
            console.log(`   Voice ID: ${response.data.voiceId}`);
            console.log(`   Agent ID: ${response.data.agentId}`);
            
            // Check if personality was applied (text changed)
            if (response.data.originalText !== response.data.personalityText) {
                console.log(`   🎉 Personality transformation detected!`);
                return { success: true, transformed: true, data: response.data };
            } else {
                console.log(`   ⚠️  No personality transformation (text unchanged)`);
                return { success: true, transformed: false, data: response.data };
            }
        } else {
            console.log(`   ❌ Failed: ${response.data.error}`);
            return { success: false, error: response.data.error };
        }
    } catch (error) {
        console.log(`   ❌ Error: ${error.message}`);
        if (error.response) {
            console.log(`   Response: ${JSON.stringify(error.response.data)}`);
        }
        return { success: false, error: error.message };
    }
}

/**
 * Test simple TTS (for comparison)
 */
async function testSimpleTTS(characterId, characterName, testPhrase) {
    console.log(`\n🔊 Testing simple TTS for ${characterName} (Character ${characterId})`);
    console.log(`   Test phrase: "${testPhrase}"`);
    
    try {
        const response = await axios.post(
            `${BASE_URL}/api/elevenlabs/generate-and-play`,
            {
                text: testPhrase,
                characterId: characterId
            },
            {
                headers: { 'Content-Type': 'application/json' },
                timeout: TEST_TIMEOUT
            }
        );

        if (response.data.success) {
            console.log(`   ✅ Simple TTS Success`);
            console.log(`   Text: "${response.data.text}"`);
            console.log(`   Voice ID: ${response.data.voiceId}`);
            return { success: true, data: response.data };
        } else {
            console.log(`   ❌ Failed: ${response.data.error}`);
            return { success: false, error: response.data.error };
        }
    } catch (error) {
        console.log(`   ❌ Error: ${error.message}`);
        return { success: false, error: error.message };
    }
}

/**
 * Main test function
 */
async function runTests() {
    console.log('🎃 MonsterBox AI Agent Integration Test 🎃');
    console.log('==========================================\n');
    
    // Load characters
    const characters = await loadCharacters();
    const testableCharacters = characters.filter(c => c.elevenLabsAgentId);
    
    if (testableCharacters.length === 0) {
        console.log('❌ No characters with AI agents found!');
        process.exit(1);
    }
    
    console.log(`Found ${testableCharacters.length} characters with AI agents:\n`);
    testableCharacters.forEach(c => {
        console.log(`  - ${c.name} (ID: ${c.id}, Agent: ${c.elevenLabsAgentId})`);
    });
    
    const results = {
        total: 0,
        success: 0,
        failed: 0,
        transformed: 0,
        details: []
    };
    
    // Test each character with AI agent
    console.log('\n\n📋 Testing AI Agent Speech\n');
    console.log('='.repeat(50));
    
    for (const character of testableCharacters) {
        const testPhrase = TEST_PHRASES.greeting;
        const result = await testAgentSpeech(
            character.id,
            character.name,
            character.elevenLabsAgentId,
            testPhrase
        );
        
        results.total++;
        if (result.success) {
            results.success++;
            if (result.transformed) {
                results.transformed++;
            }
        } else {
            results.failed++;
        }
        
        results.details.push({
            character: character.name,
            characterId: character.id,
            agentId: character.elevenLabsAgentId,
            result: result
        });
        
        // Wait between tests to avoid rate limiting
        await new Promise(resolve => setTimeout(resolve, 2000));
    }
    
    // Test simple TTS for comparison (optional)
    console.log('\n\n📋 Testing Simple TTS (for comparison)\n');
    console.log('='.repeat(50));
    
    const firstCharacter = testableCharacters[0];
    await testSimpleTTS(firstCharacter.id, firstCharacter.name, TEST_PHRASES.greeting);
    
    // Print summary
    console.log('\n\n📊 Test Summary\n');
    console.log('='.repeat(50));
    console.log(`Total tests: ${results.total}`);
    console.log(`✅ Successful: ${results.success}`);
    console.log(`❌ Failed: ${results.failed}`);
    console.log(`🎉 Personality transformations: ${results.transformed}`);
    console.log('');
    
    if (results.failed > 0) {
        console.log('❌ Some tests failed. Check the details above.');
        process.exit(1);
    } else if (results.transformed === 0) {
        console.log('⚠️  All tests passed, but no personality transformations detected.');
        console.log('   This might indicate AI agents are not processing text correctly.');
        process.exit(1);
    } else {
        console.log('✅ All tests passed! AI agents are working correctly.');
        console.log(`   ${results.transformed}/${results.total} characters showed personality transformation.`);
        process.exit(0);
    }
}

// Run tests
runTests().catch(error => {
    console.error('❌ Test execution failed:', error);
    process.exit(1);
});

