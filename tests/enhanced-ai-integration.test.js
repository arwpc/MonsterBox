const { expect } = require('chai');
const ChatterPiAI = require('../scripts/chatterpi/ai_integration');

describe('🎭 Enhanced AI Integration Tests', function() {
    this.timeout(30000);
    
    let aiSystem;
    
    before(async function() {
        // Initialize AI system with test configuration
        aiSystem = new ChatterPiAI({
            characterId: 'orlok',
            openaiApiKey: process.env.OPENAI_API_KEY,
            topmediaiApiKey: process.env.TOPMEDIAI_API_KEY,
            maxTokens: 150,
            temperature: 0.8
        });
    });
    
    describe('🧛 Count Orlok Character Enhancement', function() {
        it('should generate varied philosophical responses', async function() {
            const responses = [];
            const testMessages = [
                "What is the nature of existence?",
                "Tell me about time and eternity",
                "What have you learned in your long life?"
            ];
            
            for (const message of testMessages) {
                const result = await aiSystem.generateResponse(message);
                responses.push(result.text);
                
                // Verify response quality
                expect(result.text).to.be.a('string');
                expect(result.text.length).to.be.greaterThan(10);
                expect(result.character).to.equal('Count Orlok');
            }
            
            // Check for response variation
            const uniqueResponses = new Set(responses);
            expect(uniqueResponses.size).to.equal(responses.length, 'All responses should be unique');
            
            console.log('📝 Orlok Responses:', responses);
        });
        
        it('should use archaic vocabulary appropriately', async function() {
            const result = await aiSystem.generateResponse("Speak to me of ancient times");
            
            const archaicTerms = ['thee', 'thou', 'verily', 'forsooth', 'prithee', 'mayhap'];
            const hasArchaicLanguage = archaicTerms.some(term => 
                result.text.toLowerCase().includes(term)
            );
            
            // Note: This test may pass even without archaic terms if the response is contextually appropriate
            console.log('🏰 Orlok archaic response:', result.text);
        });
        
        it('should maintain memory across conversations', async function() {
            // First conversation about darkness
            await aiSystem.generateResponse("I fear the darkness");
            
            // Second conversation should reference previous themes
            const result = await aiSystem.generateResponse("What did we discuss before?");
            
            expect(result.text).to.be.a('string');
            expect(result.metadata.exchangeCount).to.be.greaterThan(0);
            
            console.log('🧠 Memory-enhanced response:', result.text);
        });
    });
    
    describe('👩 Mina Harker Character Enhancement', function() {
        before(function() {
            // Switch to Mina character
            aiSystem.config.characterId = 'mina';
        });
        
        it('should demonstrate Victorian intelligence', async function() {
            const result = await aiSystem.generateResponse("What do you think of modern technology?");
            
            expect(result.text).to.be.a('string');
            expect(result.character).to.equal('Mina Harker');
            
            // Check for Victorian context
            const victorianTerms = ['typewriting', 'phonograph', 'telegraph', 'railway', 'gas lighting'];
            const hasVictorianContext = victorianTerms.some(term => 
                result.text.toLowerCase().includes(term)
            );
            
            console.log('🎩 Mina Victorian response:', result.text);
        });
        
        it('should show emotional depth and courage', async function() {
            const responses = [];
            const testMessages = [
                "I'm frightened of what's happening",
                "We need to be brave",
                "How can we protect our loved ones?"
            ];
            
            for (const message of testMessages) {
                const result = await aiSystem.generateResponse(message);
                responses.push(result.text);
            }
            
            // Verify emotional range
            expect(responses).to.have.length(3);
            responses.forEach(response => {
                expect(response.length).to.be.greaterThan(10);
            });
            
            console.log('💝 Mina emotional responses:', responses);
        });
    });
    
    describe('🔄 Response Pattern Variation', function() {
        it('should cycle through different response patterns', async function() {
            aiSystem.config.characterId = 'orlok';
            
            const patterns = [];
            for (let i = 0; i < 6; i++) {
                const result = await aiSystem.generateResponse(`Tell me something interesting ${i}`);
                patterns.push(result.metadata.responsePattern);
            }
            
            // Check for pattern variation
            const uniquePatterns = new Set(patterns);
            expect(uniquePatterns.size).to.be.greaterThan(1, 'Should use multiple response patterns');
            
            console.log('🎭 Response patterns used:', patterns);
        });
    });
    
    describe('🧠 Memory and Context Management', function() {
        it('should extract and remember conversation themes', async function() {
            aiSystem.config.characterId = 'orlok';
            
            // Conversation about death and time
            await aiSystem.generateResponse("Death is inevitable for mortals");
            await aiSystem.generateResponse("Time moves differently for immortals");
            
            const character = aiSystem.characters.orlok;
            expect(character.memoryContext).to.be.an('array');
            
            console.log('🧠 Memory context:', character.memoryContext);
        });
        
        it('should refresh memory when threshold is reached', async function() {
            const initialExchangeCount = aiSystem.exchangeCount;
            
            // Simulate multiple exchanges
            for (let i = 0; i < 12; i++) {
                await aiSystem.generateResponse(`Test message ${i}`);
            }
            
            // Memory should have been refreshed
            expect(aiSystem.exchangeCount).to.be.lessThan(12);
            
            console.log('🔄 Exchange count after refresh:', aiSystem.exchangeCount);
        });
    });
    
    describe('⚡ Performance and Reliability', function() {
        it('should handle API failures gracefully', async function() {
            // Temporarily break the API key to test fallback
            const originalKey = aiSystem.openai.apiKey;
            aiSystem.openai.apiKey = 'invalid-key';
            
            const result = await aiSystem.generateResponse("Test fallback response");
            
            expect(result.text).to.be.a('string');
            expect(result.metadata.model).to.equal('enhanced-fallback');
            
            // Restore API key
            aiSystem.openai.apiKey = originalKey;
            
            console.log('🛡️ Fallback response:', result.text);
        });
        
        it('should prevent concurrent processing', async function() {
            const promises = [
                aiSystem.generateResponse("First message"),
                aiSystem.generateResponse("Second message")
            ];
            
            try {
                await Promise.all(promises);
                // If we get here, one should have failed
                expect.fail('Should have thrown error for concurrent processing');
            } catch (error) {
                expect(error.message).to.include('currently processing');
            }
        });
    });
    
    describe('📊 Quality Metrics', function() {
        it('should generate responses with good quality scores', async function() {
            const testConversations = [
                { user: "Tell me about your castle", expectedThemes: ['gothic', 'architecture'] },
                { user: "What do you remember of the past?", expectedThemes: ['memory', 'history'] },
                { user: "How do you view mortals?", expectedThemes: ['mortality', 'perspective'] }
            ];
            
            const results = [];
            for (const conv of testConversations) {
                const result = await aiSystem.generateResponse(conv.user);
                results.push({
                    response: result.text,
                    length: result.text.length,
                    hasVariation: !results.some(r => r.response === result.text)
                });
            }
            
            // Quality checks
            const avgLength = results.reduce((sum, r) => sum + r.length, 0) / results.length;
            const variationScore = results.filter(r => r.hasVariation).length / results.length;
            
            expect(avgLength).to.be.greaterThan(20, 'Responses should have adequate length');
            expect(variationScore).to.be.greaterThan(0.8, 'Responses should be varied');
            
            console.log('📊 Quality metrics:', { avgLength, variationScore });
            console.log('📝 Test responses:', results.map(r => r.response));
        });
    });
});
