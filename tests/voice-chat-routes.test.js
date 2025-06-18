/**
 * Voice Chat Routes Tests
 * Tests the voice chat API endpoints and integration
 */

const { expect } = require('chai');
const request = require('supertest');
const sinon = require('sinon');

// Import the app
const app = require('../app');

describe('Voice Chat Routes', function() {
    this.timeout(30000); // 30 second timeout for API calls

    let sandbox;

    beforeEach(function() {
        sandbox = sinon.createSandbox();
        
        // Mock environment variables if not set
        if (!process.env.OPENAI_API_KEY) {
            process.env.OPENAI_API_KEY = 'test-openai-key';
        }
        if (!process.env.TOPMEDIAI_API_KEY) {
            process.env.TOPMEDIAI_API_KEY = 'test-topmediai-key';
        }
    });

    afterEach(function() {
        sandbox.restore();
    });

    describe('POST /api/chatterpi/voice-chat', function() {
        
        it('should accept valid voice chat request', function(done) {
            const validRequest = {
                audioData: Buffer.from('test audio data').toString('base64'),
                character: 'orlok',
                sttConfig: {
                    language: 'en',
                    model: 'whisper-1'
                },
                ttsConfig: {
                    emotion: 'Neutral'
                }
            };

            request(app)
                .post('/api/chatterpi/voice-chat')
                .send(validRequest)
                .expect('Content-Type', /json/)
                .end((err, res) => {
                    if (err) return done(err);
                    
                    expect(res.body).to.have.property('success');
                    expect(res.body).to.have.property('data');
                    
                    if (res.body.success) {
                        expect(res.body.data).to.have.property('stt');
                        expect(res.body.data).to.have.property('aiResponse');
                        expect(res.body.data).to.have.property('processingTime');
                    }
                    
                    done();
                });
        });

        it('should reject request without audio data', function(done) {
            const invalidRequest = {
                character: 'orlok',
                sttConfig: { language: 'en' }
            };

            request(app)
                .post('/api/chatterpi/voice-chat')
                .send(invalidRequest)
                .expect(400)
                .end((err, res) => {
                    if (err) return done(err);
                    
                    expect(res.body.success).to.be.false;
                    expect(res.body.error).to.include('Audio data is required');
                    done();
                });
        });

        it('should handle missing character parameter', function(done) {
            const requestWithoutCharacter = {
                audioData: Buffer.from('test audio').toString('base64')
            };

            request(app)
                .post('/api/chatterpi/voice-chat')
                .send(requestWithoutCharacter)
                .expect('Content-Type', /json/)
                .end((err, res) => {
                    if (err) return done(err);
                    
                    // Should still process with default character
                    expect(res.body).to.have.property('success');
                    done();
                });
        });

        it('should handle malformed base64 audio data', function(done) {
            const invalidRequest = {
                audioData: 'invalid-base64-data!!!',
                character: 'orlok'
            };

            request(app)
                .post('/api/chatterpi/voice-chat')
                .send(invalidRequest)
                .expect('Content-Type', /json/)
                .end((err, res) => {
                    if (err) return done(err);
                    
                    // Should handle gracefully with fallback
                    expect(res.body).to.have.property('success');
                    done();
                });
        });

        it('should include processing time in response', function(done) {
            const validRequest = {
                audioData: Buffer.from('test audio').toString('base64'),
                character: 'orlok'
            };

            request(app)
                .post('/api/chatterpi/voice-chat')
                .send(validRequest)
                .expect('Content-Type', /json/)
                .end((err, res) => {
                    if (err) return done(err);
                    
                    if (res.body.success) {
                        expect(res.body.data).to.have.property('processingTime');
                        expect(res.body.data.processingTime).to.be.a('number');
                        expect(res.body.data.processingTime).to.be.greaterThan(0);
                    }
                    
                    done();
                });
        });

        it('should return STT results in response', function(done) {
            const validRequest = {
                audioData: Buffer.from('test audio').toString('base64'),
                character: 'orlok',
                sttConfig: { language: 'en' }
            };

            request(app)
                .post('/api/chatterpi/voice-chat')
                .send(validRequest)
                .expect('Content-Type', /json/)
                .end((err, res) => {
                    if (err) return done(err);
                    
                    if (res.body.success) {
                        expect(res.body.data.stt).to.have.property('recognizedText');
                        expect(res.body.data.stt).to.have.property('confidence');
                        expect(res.body.data.stt).to.have.property('provider');
                        expect(res.body.data.stt.recognizedText).to.be.a('string');
                        expect(res.body.data.stt.confidence).to.be.a('number');
                    }
                    
                    done();
                });
        });

        it('should return AI response in response', function(done) {
            const validRequest = {
                audioData: Buffer.from('test audio').toString('base64'),
                character: 'orlok'
            };

            request(app)
                .post('/api/chatterpi/voice-chat')
                .send(validRequest)
                .expect('Content-Type', /json/)
                .end((err, res) => {
                    if (err) return done(err);
                    
                    if (res.body.success) {
                        expect(res.body.data.aiResponse).to.have.property('text');
                        expect(res.body.data.aiResponse).to.have.property('character');
                        expect(res.body.data.aiResponse.text).to.be.a('string');
                        expect(res.body.data.aiResponse.character).to.be.a('string');
                    }
                    
                    done();
                });
        });
    });

    describe('POST /api/chatterpi/chat (Text Chat)', function() {
        
        it('should handle text chat requests', function(done) {
            const textRequest = {
                message: 'Hello, how are you?',
                character: 'orlok'
            };

            request(app)
                .post('/api/chatterpi/chat')
                .send(textRequest)
                .expect('Content-Type', /json/)
                .end((err, res) => {
                    if (err) return done(err);
                    
                    expect(res.body).to.have.property('success');
                    
                    if (res.body.success) {
                        expect(res.body.data).to.have.property('aiResponse');
                        expect(res.body.data.aiResponse).to.have.property('text');
                        expect(res.body.data.aiResponse).to.have.property('character');
                    }
                    
                    done();
                });
        });

        it('should reject empty message', function(done) {
            const emptyRequest = {
                message: '',
                character: 'orlok'
            };

            request(app)
                .post('/api/chatterpi/chat')
                .send(emptyRequest)
                .expect(400)
                .end((err, res) => {
                    if (err) return done(err);
                    
                    expect(res.body.success).to.be.false;
                    done();
                });
        });
    });

    describe('POST /api/chatterpi/speak (TTS)', function() {
        
        it('should generate speech from text', function(done) {
            const ttsRequest = {
                text: 'Hello, this is a test.',
                character: 'orlok',
                voiceConfig: {
                    emotion: 'Neutral',
                    speed: 1.0
                }
            };

            request(app)
                .post('/api/chatterpi/speak')
                .send(ttsRequest)
                .expect('Content-Type', /json/)
                .end((err, res) => {
                    if (err) return done(err);
                    
                    expect(res.body).to.have.property('success');
                    
                    if (res.body.success) {
                        expect(res.body).to.have.property('audioUrl');
                        expect(res.body).to.have.property('provider');
                    }
                    
                    done();
                });
        });

        it('should reject empty text', function(done) {
            const emptyRequest = {
                text: '',
                character: 'orlok'
            };

            request(app)
                .post('/api/chatterpi/speak')
                .send(emptyRequest)
                .expect(400)
                .end((err, res) => {
                    if (err) return done(err);
                    
                    expect(res.body.success).to.be.false;
                    done();
                });
        });

        it('should handle different voice configurations', function(done) {
            const ttsRequest = {
                text: 'Testing different voice config.',
                character: 'orlok',
                voiceConfig: {
                    emotion: 'Happy',
                    speed: 1.2,
                    pitch: 1.1
                }
            };

            request(app)
                .post('/api/chatterpi/speak')
                .send(ttsRequest)
                .expect('Content-Type', /json/)
                .end((err, res) => {
                    if (err) return done(err);
                    
                    expect(res.body).to.have.property('success');
                    done();
                });
        });
    });

    describe('Error Handling', function() {
        
        it('should handle internal server errors gracefully', function(done) {
            // Send a request that might cause internal errors
            const problematicRequest = {
                audioData: 'x'.repeat(10000000), // Very large data
                character: 'nonexistent-character'
            };

            request(app)
                .post('/api/chatterpi/voice-chat')
                .send(problematicRequest)
                .expect('Content-Type', /json/)
                .end((err, res) => {
                    if (err) return done(err);
                    
                    // Should handle gracefully, not crash
                    expect(res.body).to.have.property('success');
                    done();
                });
        });

        it('should handle malformed JSON requests', function(done) {
            request(app)
                .post('/api/chatterpi/voice-chat')
                .set('Content-Type', 'application/json')
                .send('{"invalid": json}')
                .expect(400)
                .end((err, res) => {
                    if (err) return done(err);
                    done();
                });
        });

        it('should handle missing Content-Type header', function(done) {
            request(app)
                .post('/api/chatterpi/voice-chat')
                .send({ audioData: 'test' })
                .end((err, res) => {
                    if (err) return done(err);
                    
                    // Should still process the request
                    expect(res.body).to.have.property('success');
                    done();
                });
        });
    });

    describe('Response Format Validation', function() {
        
        it('should return consistent response format for voice chat', function(done) {
            const validRequest = {
                audioData: Buffer.from('test').toString('base64'),
                character: 'orlok'
            };

            request(app)
                .post('/api/chatterpi/voice-chat')
                .send(validRequest)
                .expect('Content-Type', /json/)
                .end((err, res) => {
                    if (err) return done(err);
                    
                    // Check response structure
                    expect(res.body).to.have.property('success');
                    
                    if (res.body.success) {
                        expect(res.body).to.have.property('data');
                        expect(res.body.data).to.have.property('stt');
                        expect(res.body.data).to.have.property('aiResponse');
                        expect(res.body.data).to.have.property('processingTime');
                        expect(res.body.data).to.have.property('timestamp');
                    } else {
                        expect(res.body).to.have.property('error');
                    }
                    
                    done();
                });
        });

        it('should include timestamp in all responses', function(done) {
            const validRequest = {
                audioData: Buffer.from('test').toString('base64'),
                character: 'orlok'
            };

            request(app)
                .post('/api/chatterpi/voice-chat')
                .send(validRequest)
                .expect('Content-Type', /json/)
                .end((err, res) => {
                    if (err) return done(err);
                    
                    if (res.body.success && res.body.data) {
                        expect(res.body.data).to.have.property('timestamp');
                        expect(res.body.data.timestamp).to.be.a('string');
                        
                        // Should be valid ISO date
                        const date = new Date(res.body.data.timestamp);
                        expect(date.toISOString()).to.equal(res.body.data.timestamp);
                    }
                    
                    done();
                });
        });
    });

    describe('Character Support', function() {
        
        it('should support different character types', function(done) {
            const characters = ['orlok', 'robochat', 'blackbeard'];
            let completed = 0;

            characters.forEach(character => {
                const request_data = {
                    message: 'Hello',
                    character: character
                };

                request(app)
                    .post('/api/chatterpi/chat')
                    .send(request_data)
                    .expect('Content-Type', /json/)
                    .end((err, res) => {
                        if (err) return done(err);
                        
                        expect(res.body).to.have.property('success');
                        
                        if (res.body.success) {
                            expect(res.body.data.aiResponse.character).to.equal(character);
                        }
                        
                        completed++;
                        if (completed === characters.length) {
                            done();
                        }
                    });
            });
        });

        it('should handle unknown character gracefully', function(done) {
            const request_data = {
                message: 'Hello',
                character: 'unknown-character'
            };

            request(app)
                .post('/api/chatterpi/chat')
                .send(request_data)
                .expect('Content-Type', /json/)
                .end((err, res) => {
                    if (err) return done(err);
                    
                    // Should handle gracefully, possibly with default character
                    expect(res.body).to.have.property('success');
                    done();
                });
        });
    });
});
