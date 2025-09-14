/**
 * Enhanced Test Chat Comprehensive Test Suite
 * Tests for ElevenLabs Conversational AI integration and Enhanced Chat functionality
 * Using Mocha and Supertest for API testing
 */

const request = require('supertest');
const { expect } = require('chai');
const app = require('../app');

describe('Enhanced Test Chat - Comprehensive Test Suite', function() {
    this.timeout(30000); // Extended timeout for AI operations

    describe('Enhanced Test Chat Page Loading', function() {
        it('should load the Enhanced Test Chat page successfully', function(done) {
            request(app)
                .get('/test-chat')
                .expect(200)
                .end((err, res) => {
                    if (err) return done(err);
                    
                    // Check that the page includes the enhanced test chat elements
                    expect(res.text).to.include('Enhanced Test Chat');
                    expect(res.text).to.include('ElevenLabs Conversational AI Interface');
                    expect(res.text).to.include('enhanced-test-chat.js');
                    expect(res.text).to.include('EnhancedTestChat');
                    
                    done();
                });
        });

        it('should include all essential UI elements in the page', function(done) {
            request(app)
                .get('/test-chat')
                .expect(200)
                .end((err, res) => {
                    if (err) return done(err);
                    
                    // Check for character selection
                    expect(res.text).to.include('id="characterSelect"');
                    expect(res.text).to.include('id="assistantDisplay"');
                    
                    // Check for voice controls
                    expect(res.text).to.include('id="elevenLabsToggle"');
                    expect(res.text).to.include('id="ttsToggle"');
                    expect(res.text).to.include('id="liveModeToggle"');
                    
                    // Check for chat interface
                    expect(res.text).to.include('id="chatMessages"');
                    expect(res.text).to.include('id="chatInput"');
                    expect(res.text).to.include('id="sendButton"');
                    
                    // Check for performance metrics
                    expect(res.text).to.include('id="voiceInputTime"');
                    expect(res.text).to.include('id="agentTime"');
                    expect(res.text).to.include('id="voiceOutputTime"');
                    
                    done();
                });
        });

        it('should load with AI-enabled characters available', function(done) {
            request(app)
                .get('/test-chat')
                .expect(200)
                .end((err, res) => {
                    if (err) return done(err);
                    
                    // Check that AI-enabled characters are available
                    expect(res.text).to.include('hasAI');
                    expect(res.text).to.include('characters');
                    
                    done();
                });
        });

        it('should include performance metric labels', function(done) {
            request(app)
                .get('/test-chat')
                .expect(200)
                .end((err, res) => {
                    if (err) return done(err);
                    
                    // Check performance metric labels
                    expect(res.text).to.include('Voice Input');
                    expect(res.text).to.include('Agent');
                    expect(res.text).to.include('Voice Output');
                    
                    done();
                });
        });
    });

    describe('API Endpoints for Enhanced Test Chat', function() {
        it('should provide character data for the interface', function(done) {
            request(app)
                .get('/api/characters')
                .expect(200)
                .expect('Content-Type', /json/)
                .end((err, res) => {
                    if (err) return done(err);
                    
                    expect(Array.isArray(res.body)).to.be.true;
                    expect(res.body.length).to.be.greaterThan(0);
                    
                    // Check character structure
                    const character = res.body[0];
                    expect(character).to.have.property('id');
                    expect(character).to.have.property('name');
                    
                    done();
                });
        });

        it('should handle AI chat requests', function(done) {
            const chatRequest = {
                message: 'Hello, this is a test message for the Enhanced Test Chat.',
                character: 'orlok',
                characterId: 1,
                liveMode: false
            };

            request(app)
                .post('/api/ai/chat')
                .send(chatRequest)
                .expect('Content-Type', /json/)
                .end((err, res) => {
                    if (err) return done(err);
                    
                    expect(res.body).to.have.property('success');
                    
                    if (res.body.success) {
                        expect(res.body.data).to.have.property('aiResponse');
                        expect(res.body.data.aiResponse).to.have.property('text');
                        expect(res.body.data.aiResponse).to.have.property('character');
                        expect(res.body.data).to.have.property('processingTime');
                    }
                    
                    done();
                });
        });

        it('should handle live mode chat requests', function(done) {
            const liveChatRequest = {
                message: 'Hello in live mode',
                character: 'orlok',
                characterId: 1,
                liveMode: true,
                context: []
            };

            request(app)
                .post('/api/ai/chat')
                .send(liveChatRequest)
                .expect('Content-Type', /json/)
                .end((err, res) => {
                    if (err) return done(err);
                    
                    expect(res.body).to.have.property('success');
                    
                    if (res.body.success) {
                        expect(res.body.data).to.have.property('aiResponse');
                        expect(res.body.data.aiResponse).to.have.property('text');
                    }
                    
                    done();
                });
        });

        it('should validate required fields in chat requests', function(done) {
            const invalidRequest = {
                character: 'orlok'
                // Missing message field
            };

            request(app)
                .post('/api/ai/chat')
                .send(invalidRequest)
                .expect(400)
                .end((err, res) => {
                    if (err) return done(err);
                    
                    expect(res.body).to.have.property('success', false);
                    expect(res.body).to.have.property('error');
                    expect(res.body.error).to.include('Message is required');
                    
                    done();
                });
        });
    });

    describe('Voice Processing Endpoints', function() {
        it('should handle STT requests for live mode', function(done) {
            const sttRequest = {
                audioData: Buffer.from('test audio data').toString('base64'),
                character: 'orlok',
                characterId: 1,
                sttOnly: true
            };

            request(app)
                .post('/api/voice/transcribe')
                .send(sttRequest)
                .expect('Content-Type', /json/)
                .end((err, res) => {
                    if (err) return done(err);
                    
                    expect(res.body).to.have.property('success');
                    
                    if (res.body.success) {
                        expect(res.body.data).to.have.property('stt');
                        expect(res.body.data.stt).to.have.property('text');
                        expect(res.body.data).to.have.property('processingTime');
                    }
                    
                    done();
                });
        });

        it('should handle TTS requests for responses', function(done) {
            const ttsRequest = {
                text: 'Hello, this is a test response from the AI.',
                character: 'orlok',
                characterId: 1,
                voiceConfig: {}
            };

            request(app)
                .post('/api/voice/speak')
                .send(ttsRequest)
                .expect('Content-Type', /json/)
                .end((err, res) => {
                    if (err) return done(err);
                    
                    expect(res.body).to.have.property('success');
                    
                    if (res.body.success) {
                        expect(res.body).to.have.property('audioUrl');
                        expect(res.body).to.have.property('processingTime');
                    }
                    
                    done();
                });
        });

        it('should validate audio data in STT requests', function(done) {
            const invalidSTTRequest = {
                character: 'orlok',
                sttOnly: true
                // Missing audioData
            };

            request(app)
                .post('/api/voice/transcribe')
                .send(invalidSTTRequest)
                .expect(400)
                .end((err, res) => {
                    if (err) return done(err);
                    
                    expect(res.body).to.have.property('success', false);
                    expect(res.body).to.have.property('error');
                    
                    done();
                });
        });

        it('should validate text in TTS requests', function(done) {
            const invalidTTSRequest = {
                character: 'orlok',
                characterId: 1
                // Missing text
            };

            request(app)
                .post('/api/voice/speak')
                .send(invalidTTSRequest)
                .expect(400)
                .end((err, res) => {
                    if (err) return done(err);
                    
                    expect(res.body).to.have.property('success', false);
                    expect(res.body).to.have.property('error');
                    
                    done();
                });
        });
    });

    describe('ElevenLabs Service Integration', function() {
        it('should provide ElevenLabs service status', function(done) {
            request(app)
                .get('/api/conversational-ai/status')
                .expect(200)
                .expect('Content-Type', /json/)
                .end((err, res) => {
                    if (err) return done(err);
                    
                    expect(res.body).to.have.property('success');
                    expect(res.body).to.have.property('data');
                    
                    if (res.body.success) {
                        expect(res.body.data).to.have.property('isRunning');
                        expect(res.body.data).to.have.property('port');
                        expect(res.body.data).to.have.property('availableAgents');
                        expect(res.body.data).to.have.property('activeConnections');
                    }
                    
                    done();
                });
        });

        it('should provide available characters for conversational AI', function(done) {
            request(app)
                .get('/api/conversational-ai/characters')
                .expect(200)
                .expect('Content-Type', /json/)
                .end((err, res) => {
                    if (err) return done(err);
                    
                    expect(res.body).to.have.property('success');
                    expect(res.body).to.have.property('data');
                    
                    if (res.body.success) {
                        expect(Array.isArray(res.body.data)).to.be.true;
                        
                        if (res.body.data.length > 0) {
                            const character = res.body.data[0];
                            expect(character).to.have.property('id');
                            expect(character).to.have.property('available');
                            expect(character).to.have.property('hasElevenLabsAgent');
                        }
                    }
                    
                    done();
                });
        });

        it('should handle conversation start requests', function(done) {
            const startRequest = {
                characterId: 1
            };

            request(app)
                .post('/api/conversational-ai/start-conversation')
                .send(startRequest)
                .expect('Content-Type', /json/)
                .end((err, res) => {
                    if (err) return done(err);

                    expect(res.body).to.have.property('success');

                    if (res.body.success) {
                        expect(res.body.data).to.have.property('characterId');
                        expect(res.body.data).to.have.property('characterName');
                        expect(res.body.data).to.have.property('message');
                    }

                    done();
                });
        });

        it('should validate character ID in conversation start requests', function(done) {
            const invalidRequest = {};

            request(app)
                .post('/api/conversational-ai/start-conversation')
                .send(invalidRequest)
                .expect(400)
                .end((err, res) => {
                    if (err) return done(err);

                    expect(res.body).to.have.property('success', false);
                    expect(res.body).to.have.property('error');
                    expect(res.body.error).to.include('Character ID is required');

                    done();
                });
        });
    });

    describe('Enhanced Test Chat JavaScript Integration', function() {
        it('should serve the enhanced test chat JavaScript file', function(done) {
            request(app)
                .get('/js/enhanced-test-chat.js')
                .expect(200)
                .expect('Content-Type', /javascript/)
                .end((err, res) => {
                    if (err) return done(err);

                    // Check for key class and methods
                    expect(res.text).to.include('class EnhancedTestChat');
                    expect(res.text).to.include('initializeElevenLabsConnection');
                    expect(res.text).to.include('handleCharacterSelection');
                    expect(res.text).to.include('sendMessage');
                    expect(res.text).to.include('toggleElevenLabs');
                    expect(res.text).to.include('toggleTTS');
                    expect(res.text).to.include('toggleLiveMode');

                    done();
                });
        });

        it('should include WebSocket connection handling', function(done) {
            request(app)
                .get('/js/enhanced-test-chat.js')
                .expect(200)
                .end((err, res) => {
                    if (err) return done(err);

                    // Check for WebSocket functionality
                    expect(res.text).to.include('WebSocket');
                    expect(res.text).to.include('elevenLabsWs');
                    expect(res.text).to.include('handleElevenLabsMessage');
                    expect(res.text).to.include('startConversation');
                    expect(res.text).to.include('sendTextToAgent');

                    done();
                });
        });

        it('should include Live Mode functionality', function(done) {
            request(app)
                .get('/js/enhanced-test-chat.js')
                .expect(200)
                .end((err, res) => {
                    if (err) return done(err);

                    // Check for Live Mode functionality
                    expect(res.text).to.include('startLiveMode');
                    expect(res.text).to.include('stopLiveMode');
                    expect(res.text).to.include('startContinuousListening');
                    expect(res.text).to.include('processLiveModeAudio');
                    expect(res.text).to.include('speakLiveModeText');
                    expect(res.text).to.include('MediaRecorder');

                    done();
                });
        });

        it('should include performance metrics tracking', function(done) {
            request(app)
                .get('/js/enhanced-test-chat.js')
                .expect(200)
                .end((err, res) => {
                    if (err) return done(err);

                    // Check for performance metrics
                    expect(res.text).to.include('updatePerformanceMetric');
                    expect(res.text).to.include('voiceInput');
                    expect(res.text).to.include('agent');
                    expect(res.text).to.include('voiceOutput');
                    expect(res.text).to.include('processingTime');

                    done();
                });
        });
    });

    describe('Character and Assistant Integration', function() {
        it('should handle different character types', function(done) {
            const characters = ['orlok', 'skulltalker', 'pumpkinhead'];
            let completed = 0;

            characters.forEach(character => {
                const chatRequest = {
                    message: 'Hello test',
                    character: character,
                    characterId: 1
                };

                request(app)
                    .post('/api/ai/chat')
                    .send(chatRequest)
                    .expect('Content-Type', /json/)
                    .end((err, res) => {
                        if (err) return done(err);

                        expect(res.body).to.have.property('success');

                        completed++;
                        if (completed === characters.length) {
                            done();
                        }
                    });
            });
        });

        it('should provide character-specific responses', function(done) {
            const chatRequest = {
                message: 'Tell me about yourself',
                character: 'orlok',
                characterId: 1
            };

            request(app)
                .post('/api/ai/chat')
                .send(chatRequest)
                .expect('Content-Type', /json/)
                .end((err, res) => {
                    if (err) return done(err);

                    expect(res.body).to.have.property('success');

                    if (res.body.success) {
                        expect(res.body.data.aiResponse).to.have.property('text');
                        expect(res.body.data.aiResponse).to.have.property('character');
                        expect(res.body.data.aiResponse.character).to.equal('orlok');
                    }

                    done();
                });
        });

        it('should handle unknown characters gracefully', function(done) {
            const chatRequest = {
                message: 'Hello',
                character: 'unknown-character',
                characterId: 999
            };

            request(app)
                .post('/api/ai/chat')
                .send(chatRequest)
                .expect('Content-Type', /json/)
                .end((err, res) => {
                    if (err) return done(err);

                    // Should handle gracefully, possibly with default character or error
                    expect(res.body).to.have.property('success');

                    done();
                });
        });
    });

    describe('Performance and Reliability', function() {
        it('should handle multiple concurrent chat requests', function(done) {
            const requests = [];
            const numRequests = 3;
            let completed = 0;

            for (let i = 0; i < numRequests; i++) {
                const chatRequest = {
                    message: `Concurrent test message ${i + 1}`,
                    character: 'orlok',
                    characterId: 1
                };

                const req = request(app)
                    .post('/api/ai/chat')
                    .send(chatRequest)
                    .expect('Content-Type', /json/)
                    .end((err, res) => {
                        if (err) return done(err);

                        expect(res.body).to.have.property('success');

                        completed++;
                        if (completed === numRequests) {
                            done();
                        }
                    });

                requests.push(req);
            }
        });

        it('should respond within reasonable time limits', function(done) {
            this.timeout(15000); // 15 second timeout for AI response

            const startTime = Date.now();
            const chatRequest = {
                message: 'Quick response test',
                character: 'orlok',
                characterId: 1
            };

            request(app)
                .post('/api/ai/chat')
                .send(chatRequest)
                .expect('Content-Type', /json/)
                .end((err, res) => {
                    if (err) return done(err);

                    const responseTime = Date.now() - startTime;

                    expect(res.body).to.have.property('success');
                    expect(responseTime).to.be.lessThan(15000); // Should respond within 15 seconds

                    if (res.body.success) {
                        expect(res.body.data).to.have.property('processingTime');
                        expect(res.body.data.processingTime).to.be.a('number');
                    }

                    done();
                });
        });

        it('should maintain consistent response format', function(done) {
            const chatRequest = {
                message: 'Format consistency test',
                character: 'orlok',
                characterId: 1
            };

            request(app)
                .post('/api/ai/chat')
                .send(chatRequest)
                .expect('Content-Type', /json/)
                .end((err, res) => {
                    if (err) return done(err);

                    // Check response structure consistency
                    expect(res.body).to.have.property('success');

                    if (res.body.success) {
                        expect(res.body).to.have.property('data');
                        expect(res.body.data).to.have.property('aiResponse');
                        expect(res.body.data).to.have.property('processingTime');
                        expect(res.body.data).to.have.property('timestamp');
                        expect(res.body.data.aiResponse).to.have.property('text');
                        expect(res.body.data.aiResponse).to.have.property('character');
                    } else {
                        expect(res.body).to.have.property('error');
                    }

                    done();
                });
        });
    });
});
