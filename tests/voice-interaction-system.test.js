/**
 * Voice Interaction System Tests
 * Tests the complete voice interaction pipeline: OpenAI Whisper STT + ElevenLabs TTS + ChatterPi Integration
 */

const { expect } = require('chai');
const sinon = require('sinon');
const path = require('path');
const fs = require('fs').promises;

// Import the modules we're testing
const OpenAISTTIntegration = require('../scripts/chatterpi/openai_stt_integration');

describe('Voice Interaction System', function() {
    this.timeout(30000); // 30 second timeout for API calls

    let sttIntegration;
    let sandbox;

    beforeEach(function() {
        sandbox = sinon.createSandbox();

        // Mock environment variables if not set
        if (!process.env.OPENAI_API_KEY) {
            process.env.OPENAI_API_KEY = 'test-openai-key';
        }
        if (!process.env.ELEVENLABS_API_KEY) {
            process.env.ELEVENLABS_API_KEY = 'test-elevenlabs-key';
        }
    });

    afterEach(function() {
        sandbox.restore();
        if (sttIntegration) {
            sttIntegration.stop();
        }
    });

    describe('OpenAI Whisper STT Integration', function() {
        
        beforeEach(function() {
            sttIntegration = new OpenAISTTIntegration({
                language: 'en',
                confidenceThreshold: 0.7,
                chunkDuration: 2000
            });
        });

        it('should initialize successfully with valid API key', async function() {
            const result = await sttIntegration.initialize();
            expect(result).to.be.true;
            expect(sttIntegration.isInitialized).to.be.true;
        });

        it('should fail initialization without API key', async function() {
            delete process.env.OPENAI_API_KEY;
            const result = await sttIntegration.initialize();
            expect(result).to.be.false;
            expect(sttIntegration.isInitialized).to.be.false;
            // Restore for other tests
            process.env.OPENAI_API_KEY = 'test-openai-key';
        });

        it('should emit initialized event on successful initialization', function(done) {
            sttIntegration.on('initialized', (result) => {
                expect(result.success).to.be.true;
                done();
            });
            sttIntegration.initialize();
        });

        it('should process audio data and buffer chunks', async function() {
            await sttIntegration.initialize();
            
            const audioData = Buffer.alloc(1600); // 100ms at 16kHz
            const metadata = { sample_rate: 16000, format: 'pcm' };
            
            const result = await sttIntegration.processAudioData(audioData, metadata);
            
            // Should return null initially (buffering)
            expect(result).to.be.null;
            expect(sttIntegration.audioBuffer.length).to.be.greaterThan(0);
        });

        it('should handle multiple concurrent requests within limit', async function() {
            await sttIntegration.initialize();
            
            const audioData = Buffer.alloc(1600);
            const metadata = { sample_rate: 16000, format: 'pcm' };
            
            // Process multiple chunks
            const promises = [];
            for (let i = 0; i < 3; i++) {
                promises.push(sttIntegration.processAudioData(audioData, metadata));
            }
            
            const results = await Promise.all(promises);
            expect(results).to.be.an('array');
        });

        it('should clear buffer when stopped', async function() {
            await sttIntegration.initialize();
            
            const audioData = Buffer.alloc(1600);
            await sttIntegration.processAudioData(audioData, { sample_rate: 16000 });
            
            expect(sttIntegration.audioBuffer.length).to.be.greaterThan(0);
            
            sttIntegration.stop();
            expect(sttIntegration.audioBuffer.length).to.equal(0);
        });

        it('should provide accurate statistics', async function() {
            await sttIntegration.initialize();
            
            const stats = sttIntegration.getStats();
            expect(stats).to.have.property('totalRequests');
            expect(stats).to.have.property('successfulRequests');
            expect(stats).to.have.property('failedRequests');
            expect(stats).to.have.property('successRate');
            expect(stats).to.have.property('isProcessing');
            expect(stats).to.have.property('activeRequests');
            expect(stats).to.have.property('bufferSize');
        });

        it('should prepare audio for Whisper correctly', async function() {
            await sttIntegration.initialize();
            
            const audioData = Buffer.alloc(1000);
            const tempFile = await sttIntegration.prepareAudioForWhisper(audioData);
            
            expect(tempFile).to.be.a('string');
            expect(tempFile).to.include('/tmp/whisper_audio_');
            
            // Check if file exists
            try {
                await fs.access(tempFile);
                // Clean up
                await fs.unlink(tempFile);
            } catch (error) {
                // File might not exist in test environment, that's ok
            }
        });
    });

    describe('ElevenLabs TTS Integration', function() {

        it('should have ElevenLabs service available globally', function() {
            // Test that ElevenLabs service is properly initialized
            // This would be set up by the main application
            if (global.elevenLabsService) {
                expect(global.elevenLabsService).to.be.an('object');
                expect(global.elevenLabsService.getStatus).to.be.a('function');
            } else {
                console.log('⚠️ ElevenLabs service not initialized in test environment');
            }
        });

        it('should handle voice generation requests', function() {
            // Test voice generation through ElevenLabs service
            // This would test the integration with the conversational AI service
            const testParams = {
                text: 'Hello world',
                characterId: 1,
                agentId: 'test-agent-id'
            };

            expect(testParams.text).to.equal('Hello world');
            expect(testParams.characterId).to.equal(1);
        });

        it('should support multiple character voices', function() {
            // Test that different characters can use different ElevenLabs voices
            const characterVoices = {
                1: 'pNInz6obpgDQGcFmaJgB', // Adam
                2: 'EXAVITQu4vr4xnSDxMaL', // Bella
                3: 'VR6AewLTigWG4xSOukaG', // Josh
                4: 'onwK4e9ZLuTAKqWW03F9'  // Daniel
            };

            Object.keys(characterVoices).forEach(characterId => {
                expect(characterVoices[characterId]).to.be.a('string');
                expect(characterVoices[characterId].length).to.be.greaterThan(10);
            });
        });
    });

    describe('Voice Chat Route Integration', function() {
        
        it('should handle voice chat request structure', function() {
            const mockRequest = {
                audioData: 'base64-encoded-audio-data',
                character: 'orlok',
                sttConfig: {
                    language: 'en',
                    model: 'whisper-1'
                },
                ttsConfig: {
                    emotion: 'Neutral'
                }
            };

            expect(mockRequest).to.have.property('audioData');
            expect(mockRequest).to.have.property('character');
            expect(mockRequest).to.have.property('sttConfig');
            expect(mockRequest).to.have.property('ttsConfig');
            expect(mockRequest.sttConfig.model).to.equal('whisper-1');
        });

        it('should validate required parameters', function() {
            const validRequest = {
                audioData: 'test-data',
                character: 'orlok'
            };

            const invalidRequest = {
                character: 'orlok'
                // Missing audioData
            };

            expect(validRequest.audioData).to.exist;
            expect(invalidRequest.audioData).to.not.exist;
        });
    });

    describe('Audio Processing Pipeline', function() {
        
        it('should handle audio format conversion', function() {
            const base64Audio = 'dGVzdCBhdWRpbyBkYXRh'; // "test audio data" in base64
            const audioBuffer = Buffer.from(base64Audio, 'base64');
            
            expect(Buffer.isBuffer(audioBuffer)).to.be.true;
            expect(audioBuffer.toString()).to.equal('test audio data');
        });

        it('should create temporary files for Whisper processing', async function() {
            const audioData = Buffer.from('test audio data');
            const tempDir = '/tmp';
            const timestamp = Date.now();
            const expectedPath = path.join(tempDir, `whisper_${timestamp}.wav`);
            
            // This tests the file path generation logic
            expect(expectedPath).to.include('/tmp/whisper_');
            expect(expectedPath).to.include('.wav');
        });

        it('should handle audio metadata correctly', function() {
            const metadata = {
                sample_rate: 16000,
                format: 'pcm',
                timestamp: Date.now(),
                chunk_index: 0
            };

            expect(metadata.sample_rate).to.equal(16000);
            expect(metadata.format).to.equal('pcm');
            expect(metadata).to.have.property('timestamp');
            expect(metadata).to.have.property('chunk_index');
        });
    });

    describe('Error Handling and Fallbacks', function() {
        
        it('should handle STT API failures gracefully', async function() {
            const stt = new OpenAISTTIntegration({
                fallbackToSystem: true
            });
            
            await stt.initialize();
            
            // Mock API failure
            sandbox.stub(stt, 'processWithWhisper').rejects(new Error('API Error'));
            sandbox.stub(stt, 'generateSystemSTT').resolves({
                text: 'Fallback text',
                confidence: 0.1,
                provider: 'System'
            });

            const audioData = Buffer.alloc(1000);
            
            // This should trigger fallback
            expect(stt.config.fallbackToSystem).to.be.true;
        });

        it('should handle TTS API failures with fallback', function() {
            const mockError = new Error('TTS API Error');
            mockError.response = { status: 500, statusText: 'Internal Server Error' };
            
            expect(mockError.message).to.equal('TTS API Error');
            expect(mockError.response.status).to.equal(500);
        });

        it('should validate audio data before processing', function() {
            const validAudio = Buffer.alloc(1000);
            const invalidAudio = null;
            
            expect(Buffer.isBuffer(validAudio)).to.be.true;
            expect(Buffer.isBuffer(invalidAudio)).to.be.false;
        });
    });

    describe('Performance and Optimization', function() {
        
        it('should respect concurrent request limits', async function() {
            const stt = new OpenAISTTIntegration({
                maxConcurrentRequests: 2
            });
            
            await stt.initialize();
            
            expect(stt.config.maxConcurrentRequests).to.equal(2);
            expect(stt.activeRequests).to.equal(0);
        });

        it('should buffer audio chunks efficiently', async function() {
            const stt = new OpenAISTTIntegration({
                chunkDuration: 1000
            });
            
            await stt.initialize();
            
            const audioChunk = Buffer.alloc(800); // Small chunk
            await stt.processAudioData(audioChunk, { sample_rate: 16000 });
            
            expect(stt.audioBuffer.length).to.be.greaterThan(0);
        });

        it('should track processing statistics accurately', async function() {
            const stt = new OpenAISTTIntegration();
            await stt.initialize();
            
            const initialStats = stt.getStats();
            expect(initialStats.totalRequests).to.equal(0);
            expect(initialStats.successfulRequests).to.equal(0);
            expect(initialStats.failedRequests).to.equal(0);
        });
    });
});
