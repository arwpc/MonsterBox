/**
 * TopMediai TTS Integration Tests
 * Tests the TopMediai Text-to-Speech API integration
 */

const { expect } = require('chai');
const sinon = require('sinon');
const axios = require('axios');

const TopMediaiAPI = require('../scripts/topMediaiAPI');

describe('TopMediai TTS Integration', function() {
    this.timeout(30000); // 30 second timeout for API calls

    let topMediaiAPI;
    let sandbox;

    beforeEach(function() {
        sandbox = sinon.createSandbox();
        
        // Mock environment variable if not set
        if (!process.env.TOPMEDIAI_API_KEY) {
            process.env.TOPMEDIAI_API_KEY = 'test-topmediai-key';
        }
        
        topMediaiAPI = new TopMediaiAPI();
    });

    afterEach(function() {
        sandbox.restore();
    });

    describe('Initialization and Configuration', function() {
        
        it('should initialize with correct configuration', function() {
            expect(topMediaiAPI.apiKey).to.equal(process.env.TOPMEDIAI_API_KEY);
            expect(topMediaiAPI.baseURL).to.equal('https://api.topmediai.com/v1');
            expect(topMediaiAPI.rateLimitPerMinute).to.equal(100);
        });

        it('should create axios instance with correct base URL', function() {
            expect(topMediaiAPI.axiosInstance.defaults.baseURL).to.equal('https://api.topmediai.com/v1');
            expect(topMediaiAPI.axiosInstance.defaults.timeout).to.equal(30000);
        });

        it('should initialize with empty cache', function() {
            expect(topMediaiAPI.voicesCache).to.be.null;
            expect(topMediaiAPI.voicesCacheExpiry).to.be.null;
        });
    });

    describe('Rate Limiting', function() {
        
        it('should track request count and timing', async function() {
            const initialCount = topMediaiAPI.requestCount;
            const initialTime = topMediaiAPI.lastRequestTime;
            
            await topMediaiAPI.checkRateLimit();
            
            expect(topMediaiAPI.requestCount).to.be.greaterThan(initialCount);
            expect(topMediaiAPI.lastRequestTime).to.be.greaterThan(initialTime);
        });

        it('should enforce rate limits', async function() {
            // Set up rate limit scenario
            topMediaiAPI.requestCount = 100;
            topMediaiAPI.lastRequestTime = Date.now() - 30000; // 30 seconds ago
            
            // This should not throw an error since enough time has passed
            await topMediaiAPI.checkRateLimit();
            
            expect(topMediaiAPI.requestCount).to.equal(1); // Should reset
        });

        it('should delay requests when rate limit is exceeded', async function() {
            // Set up rate limit exceeded scenario
            topMediaiAPI.requestCount = 100;
            topMediaiAPI.lastRequestTime = Date.now() - 10000; // 10 seconds ago (not enough time)
            
            const startTime = Date.now();
            await topMediaiAPI.checkRateLimit();
            const endTime = Date.now();
            
            // Should have waited some time
            expect(endTime - startTime).to.be.greaterThan(0);
        });
    });

    describe('Voice List API', function() {
        
        it('should fetch voices from API with correct headers', async function() {
            const mockVoices = [
                { id: 'voice1', name: 'Voice 1', language: 'en' },
                { id: 'voice2', name: 'Voice 2', language: 'en' }
            ];

            const axiosStub = sandbox.stub(topMediaiAPI.axiosInstance, 'get').resolves({
                data: mockVoices
            });

            const voices = await topMediaiAPI.getVoices();

            expect(axiosStub.calledOnce).to.be.true;
            expect(axiosStub.firstCall.args[0]).to.equal('/voices_list');
            expect(axiosStub.firstCall.args[1].headers['x-api-key']).to.equal(process.env.TOPMEDIAI_API_KEY);
            expect(voices).to.deep.equal(mockVoices);
        });

        it('should cache voices list for subsequent requests', async function() {
            const mockVoices = [{ id: 'voice1', name: 'Voice 1' }];
            const axiosStub = sandbox.stub(topMediaiAPI.axiosInstance, 'get').resolves({
                data: mockVoices
            });

            // First call
            const voices1 = await topMediaiAPI.getVoices();
            // Second call
            const voices2 = await topMediaiAPI.getVoices();

            expect(axiosStub.calledOnce).to.be.true; // Should only call API once
            expect(voices1).to.deep.equal(voices2);
            expect(topMediaiAPI.voicesCache).to.not.be.null;
        });

        it('should refresh cache when expired', async function() {
            const mockVoices = [{ id: 'voice1', name: 'Voice 1' }];
            const axiosStub = sandbox.stub(topMediaiAPI.axiosInstance, 'get').resolves({
                data: mockVoices
            });

            // Set expired cache
            topMediaiAPI.voicesCache = [{ id: 'old-voice' }];
            topMediaiAPI.voicesCacheExpiry = Date.now() - 1000; // Expired

            const voices = await topMediaiAPI.getVoices();

            expect(axiosStub.calledOnce).to.be.true;
            expect(voices).to.deep.equal(mockVoices);
        });

        it('should handle API errors gracefully', async function() {
            const axiosStub = sandbox.stub(topMediaiAPI.axiosInstance, 'get').rejects(
                new Error('API Error')
            );

            try {
                await topMediaiAPI.getVoices();
                expect.fail('Should have thrown an error');
            } catch (error) {
                expect(error.message).to.include('API Error');
            }
        });
    });

    describe('Text-to-Speech API', function() {
        
        it('should format TTS request correctly', async function() {
            const mockAudioData = Buffer.from('mock audio data');
            const axiosStub = sandbox.stub(topMediaiAPI.axiosInstance, 'post').resolves({
                data: mockAudioData
            });

            const params = {
                text: 'Hello, world!',
                voiceId: 'test-voice-id',
                options: { emotion: 'Happy' }
            };

            await topMediaiAPI.generateSpeech(params);

            expect(axiosStub.calledOnce).to.be.true;
            expect(axiosStub.firstCall.args[0]).to.equal('/text2speech');
            
            const requestBody = axiosStub.firstCall.args[1];
            expect(requestBody.text).to.equal('Hello, world!');
            expect(requestBody.speaker).to.equal('test-voice-id');
            expect(requestBody.emotion).to.equal('Happy');
            
            const headers = axiosStub.firstCall.args[2].headers;
            expect(headers['x-api-key']).to.equal(process.env.TOPMEDIAI_API_KEY);
            expect(headers['Content-Type']).to.equal('application/json');
        });

        it('should handle successful TTS response', async function() {
            const mockAudioData = Buffer.from('mock audio data');
            sandbox.stub(topMediaiAPI.axiosInstance, 'post').resolves({
                data: mockAudioData
            });

            const params = {
                text: 'Test speech',
                voiceId: 'voice1',
                options: { emotion: 'Neutral' }
            };

            const result = await topMediaiAPI.generateSpeech(params);

            expect(result.success).to.be.true;
            expect(result.audioData).to.be.instanceOf(Buffer);
            expect(result.provider).to.equal('TopMediai');
            expect(result.isRealAudio).to.be.true;
        });

        it('should handle TTS API errors with fallback', async function() {
            sandbox.stub(topMediaiAPI.axiosInstance, 'post').rejects(
                new Error('TTS API Error')
            );

            const params = {
                text: 'Test speech',
                voiceId: 'voice1',
                options: { emotion: 'Neutral' }
            };

            const result = await topMediaiAPI.generateSpeech(params);

            expect(result.success).to.be.true; // Should succeed with fallback
            expect(result.provider).to.equal('System'); // Should use system fallback
            expect(result.isRealAudio).to.be.false;
        });

        it('should validate input parameters', async function() {
            try {
                await topMediaiAPI.generateSpeech({
                    text: '', // Empty text
                    voiceId: 'voice1'
                });
                expect.fail('Should have thrown an error for empty text');
            } catch (error) {
                expect(error.message).to.include('Text is required');
            }
        });

        it('should handle retry logic with exponential backoff', async function() {
            let callCount = 0;
            sandbox.stub(topMediaiAPI.axiosInstance, 'post').callsFake(() => {
                callCount++;
                if (callCount < 3) {
                    const error = new Error('Temporary error');
                    error.response = { status: 429 }; // Rate limit
                    throw error;
                }
                return Promise.resolve({ data: Buffer.from('success') });
            });

            const params = {
                text: 'Test speech',
                voiceId: 'voice1'
            };

            const result = await topMediaiAPI.generateSpeech(params);

            expect(callCount).to.equal(3); // Should have retried
            expect(result.success).to.be.true;
        });
    });

    describe('System Fallback TTS', function() {
        
        it('should generate system TTS when TopMediai fails', async function() {
            const result = await topMediaiAPI.generateSystemTTS('Hello world', {
                voice: 'default'
            });

            expect(result.success).to.be.true;
            expect(result.provider).to.equal('System');
            expect(result.audioData).to.be.instanceOf(Buffer);
            expect(result.isRealAudio).to.be.false;
        });

        it('should handle different system TTS options', async function() {
            const options = {
                voice: 'female',
                speed: 1.2,
                pitch: 1.0
            };

            const result = await topMediaiAPI.generateSystemTTS('Test text', options);

            expect(result.success).to.be.true;
            expect(result.metadata).to.include.keys(['voice', 'speed', 'pitch']);
        });
    });

    describe('Cache Management', function() {
        
        it('should clear all caches when requested', function() {
            // Set up cache data
            topMediaiAPI.voicesCache = ['voice1', 'voice2'];
            topMediaiAPI.voicesCacheExpiry = Date.now() + 10000;

            topMediaiAPI.clearCache();

            expect(topMediaiAPI.voicesCache).to.be.null;
            expect(topMediaiAPI.voicesCacheExpiry).to.be.null;
        });

        it('should respect cache expiry times', function() {
            const now = Date.now();
            
            // Set cache that expires in future
            topMediaiAPI.voicesCache = ['voice1'];
            topMediaiAPI.voicesCacheExpiry = now + 10000;
            expect(topMediaiAPI.isCacheValid()).to.be.true;

            // Set cache that has expired
            topMediaiAPI.voicesCacheExpiry = now - 1000;
            expect(topMediaiAPI.isCacheValid()).to.be.false;
        });
    });

    describe('Error Handling and Logging', function() {
        
        it('should log API requests and responses', async function() {
            const mockAudioData = Buffer.from('mock audio');
            sandbox.stub(topMediaiAPI.axiosInstance, 'post').resolves({
                data: mockAudioData
            });

            // Mock logger to capture logs
            const logSpy = sandbox.spy(console, 'log');

            const params = {
                text: 'Test logging',
                voiceId: 'voice1'
            };

            await topMediaiAPI.generateSpeech(params);

            // Should have logged the request
            expect(logSpy.called).to.be.true;
        });

        it('should handle network timeouts gracefully', async function() {
            const timeoutError = new Error('Request timeout');
            timeoutError.code = 'ECONNABORTED';
            
            sandbox.stub(topMediaiAPI.axiosInstance, 'post').rejects(timeoutError);

            const params = {
                text: 'Test timeout',
                voiceId: 'voice1'
            };

            const result = await topMediaiAPI.generateSpeech(params);

            expect(result.success).to.be.true; // Should fallback
            expect(result.provider).to.equal('System');
        });

        it('should handle malformed API responses', async function() {
            sandbox.stub(topMediaiAPI.axiosInstance, 'post').resolves({
                data: 'invalid-audio-data' // Not a buffer
            });

            const params = {
                text: 'Test malformed response',
                voiceId: 'voice1'
            };

            const result = await topMediaiAPI.generateSpeech(params);

            expect(result.success).to.be.true; // Should handle gracefully
        });
    });
});
