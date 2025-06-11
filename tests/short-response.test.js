const { expect } = require('chai');
const ChatterPiAI = require('../scripts/chatterpi/ai_integration');

describe('🎭 Short Response Validation Tests', function() {
    this.timeout(30000);
    
    let aiSystem;
    
    before(async function() {
        // Initialize AI system with test configuration
        aiSystem = new ChatterPiAI({
            characterId: 'orlok',
            openaiApiKey: process.env.OPENAI_API_KEY || 'test-key',
            maxTokens: 50, // Very low to encourage short responses
            temperature: 0.7
        });
    });
    
    describe('🧛 Count Orlok - Ultra Short Responses', function() {
        it('should generate responses with 6 words or fewer', async function() {
            const testMessages = [
                "Hello there",
                "What do you want?",
                "Tell me about yourself",
                "Are you dangerous?",
                "What are you thinking?"
            ];
            
            const responses = [];
            for (const message of testMessages) {
                const result = await aiSystem.generateResponse(message);
                responses.push(result.text);
                
                // Count words
                const wordCount = result.text.trim().split(/\s+/).length;
                console.log(`📝 "${message}" → "${result.text}" (${wordCount} words)`);
                
                // Verify word count
                expect(wordCount).to.be.at.most(6, `Response "${result.text}" has ${wordCount} words, should be 6 or fewer`);
                expect(result.text.length).to.be.greaterThan(0, 'Response should not be empty');
            }
            
            // Check for variation
            const uniqueResponses = new Set(responses);
            expect(uniqueResponses.size).to.be.greaterThan(1, 'Responses should vary');
            
            console.log('🧛 All Orlok responses:', responses);
        });
        
        it('should use menacing single words when appropriate', async function() {
            const result = await aiSystem.generateResponse("Who are you?");
            const wordCount = result.text.trim().split(/\s+/).length;
            
            console.log(`👹 Single word test: "${result.text}" (${wordCount} words)`);
            
            // Should be very short for simple questions
            expect(wordCount).to.be.at.most(3, 'Simple questions should get very short answers');
        });
    });
    
    describe('👩 Mina Harker - Natural Short Responses', function() {
        before(function() {
            // Switch to Mina character
            aiSystem.config.characterId = 'mina';
        });
        
        it('should generate responses with 10 words or fewer', async function() {
            const testMessages = [
                "Something strange is happening",
                "Do you see that shadow?",
                "I'm frightened",
                "What should we do?",
                "Is that real?"
            ];
            
            const responses = [];
            for (const message of testMessages) {
                const result = await aiSystem.generateResponse(message);
                responses.push(result.text);
                
                // Count words
                const wordCount = result.text.trim().split(/\s+/).length;
                console.log(`📝 "${message}" → "${result.text}" (${wordCount} words)`);
                
                // Verify word count
                expect(wordCount).to.be.at.most(10, `Response "${result.text}" has ${wordCount} words, should be 10 or fewer`);
                expect(result.text.length).to.be.greaterThan(0, 'Response should not be empty');
            }
            
            console.log('👩 All Mina responses:', responses);
        });
        
        it('should show natural human reactions', async function() {
            const result = await aiSystem.generateResponse("There's something behind you!");
            const wordCount = result.text.trim().split(/\s+/).length;
            
            console.log(`😱 Fear reaction: "${result.text}" (${wordCount} words)`);
            
            // Should be a natural, short reaction
            expect(wordCount).to.be.at.most(6, 'Fear reactions should be brief');
            expect(result.text).to.match(/[?!.]/, 'Should have appropriate punctuation');
        });
    });
    
    describe('🔄 Fallback Response Testing', function() {
        it('should provide short fallback responses when API fails', async function() {
            // Temporarily break the API key to test fallback
            const originalKey = aiSystem.openai?.apiKey;
            if (aiSystem.openai) {
                aiSystem.openai.apiKey = 'invalid-key';
            }
            
            const result = await aiSystem.generateResponse("Test fallback");
            const wordCount = result.text.trim().split(/\s+/).length;
            
            console.log(`🛡️ Fallback: "${result.text}" (${wordCount} words)`);
            
            // Fallback should also be short
            expect(wordCount).to.be.at.most(6, 'Fallback responses should be short too');
            expect(result.metadata.model).to.equal('enhanced-fallback');
            
            // Restore API key if it existed
            if (aiSystem.openai && originalKey) {
                aiSystem.openai.apiKey = originalKey;
            }
        });
    });
    
    describe('📊 Response Quality Metrics', function() {
        it('should maintain quality while being concise', async function() {
            aiSystem.config.characterId = 'orlok';
            
            const testConversations = [
                "Are you evil?",
                "What do you eat?", 
                "Where do you live?",
                "How old are you?",
                "Do you sleep?"
            ];
            
            const results = [];
            for (const question of testConversations) {
                const result = await aiSystem.generateResponse(question);
                const wordCount = result.text.trim().split(/\s+/).length;
                
                results.push({
                    question,
                    response: result.text,
                    wordCount,
                    isAppropriate: wordCount <= 6 && result.text.length > 0
                });
            }
            
            // All responses should be appropriate length
            const appropriateCount = results.filter(r => r.isAppropriate).length;
            expect(appropriateCount).to.equal(results.length, 'All responses should be appropriately short');
            
            // Check for some variation
            const uniqueResponses = new Set(results.map(r => r.response));
            expect(uniqueResponses.size).to.be.greaterThan(2, 'Should have some response variation');
            
            console.log('📊 Quality test results:');
            results.forEach(r => {
                console.log(`   "${r.question}" → "${r.response}" (${r.wordCount} words)`);
            });
        });
    });
});
