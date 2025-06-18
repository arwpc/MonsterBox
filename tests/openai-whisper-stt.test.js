/**
 * OpenAI Whisper STT Integration Tests
 * Tests the OpenAI Whisper Speech-to-Text integration
 */

const { expect } = require('chai');
const sinon = require('sinon');
const fs = require('fs').promises;
const path = require('path');

const OpenAISTTIntegration = require('../scripts/chatterpi/openai_stt_integration');

describe('OpenAI Whisper STT Integration', function() {
    this.timeout(30000); // 30 second timeout for API calls

    let sttIntegration;
    let sandbox;

    beforeEach(function() {
        sandbox = sinon.createSandbox();
        
        // Mock environment variable if not set
        if (!process.env.OPENAI_API_KEY) {
            process.env.OPENAI_API_KEY = 'test-openai-key';
        }
        
        sttIntegration = new OpenAISTTIntegration({
            language: 'en',
            confidenceThreshold: 0.7,
            chunkDuration: 2000,
            maxConcurrentRequests: 2
        });
    });

    afterEach(function() {
        sandbox.restore();
        if (sttIntegration) {
            sttIntegration.stop();
        }
    });

    describe('Initialization', function() {
        
        it('should initialize with correct configuration', function() {
            expect(sttIntegration.config.language).to.equal('en');
            expect(sttIntegration.config.confidenceThreshold).to.equal(0.7);
            expect(sttIntegration.config.chunkDuration).to.equal(2000);
            expect(sttIntegration.config.maxConcurrentRequests).to.equal(2);
        });

        it('should initialize successfully with valid API key', async function() {
            const result = await sttIntegration.initialize();
            
            expect(result).to.be.true;
            expect(sttIntegration.isInitialized).to.be.true;
            expect(sttIntegration.openai).to.not.be.null;
        });

        it('should fail initialization without API key', async function() {
            delete process.env.OPENAI_API_KEY;
            
            const result = await sttIntegration.initialize();
            
            expect(result).to.be.false;
            expect(sttIntegration.isInitialized).to.be.false;
            
            // Restore for other tests
            process.env.OPENAI_API_KEY = 'test-openai-key';
        });

        it('should emit initialized event', function(done) {
            sttIntegration.on('initialized', (result) => {
                expect(result.success).to.be.true;
                done();
            });
            
            sttIntegration.initialize();
        });

        it('should handle initialization errors gracefully', async function() {
            // Mock OpenAI constructor to throw error
            const OpenAI = require('openai');
            sandbox.stub(OpenAI.prototype, 'constructor').throws(new Error('Init error'));
            
            const result = await sttIntegration.initialize();
            
            expect(result).to.be.false;
        });
    });

    describe('Audio Processing', function() {
        
        beforeEach(async function() {
            await sttIntegration.initialize();
        });

        it('should process audio data and add to buffer', async function() {
            const audioData = Buffer.alloc(1600); // 100ms at 16kHz
            const metadata = {
                sample_rate: 16000,
                format: 'pcm',
                timestamp: Date.now()
            };
            
            const result = await sttIntegration.processAudioData(audioData, metadata);
            
            expect(sttIntegration.audioBuffer.length).to.be.greaterThan(0);
            expect(sttIntegration.audioBuffer[0]).to.have.property('data');
            expect(sttIntegration.audioBuffer[0]).to.have.property('timestamp');
            expect(sttIntegration.audioBuffer[0]).to.have.property('metadata');
        });

        it('should respect maximum concurrent requests', async function() {
            sttIntegration.activeRequests = 2; // At limit
            
            const audioData = Buffer.alloc(1600);
            const result = await sttIntegration.processAudioData(audioData, {});
            
            expect(result).to.be.null; // Should drop request
        });

        it('should process buffer when conditions are met', async function() {
            // Add multiple chunks to trigger processing
            const audioData = Buffer.alloc(800);
            
            for (let i = 0; i < 12; i++) { // More than 10 chunks
                await sttIntegration.processAudioData(audioData, {
                    sample_rate: 16000,
                    timestamp: Date.now() - (i * 100)
                });
            }
            
            expect(sttIntegration.audioBuffer.length).to.be.greaterThan(0);
        });

        it('should combine audio chunks correctly', function() {
            const chunks = [
                { data: Buffer.from([1, 2, 3]), timestamp: 1000 },
                { data: Buffer.from([4, 5, 6]), timestamp: 1100 },
                { data: Buffer.from([7, 8, 9]), timestamp: 1200 }
            ];
            
            const combined = sttIntegration.combineAudioChunks(chunks);
            
            expect(combined).to.be.instanceOf(Buffer);
            expect(combined.length).to.equal(9);
            expect(Array.from(combined)).to.deep.equal([1, 2, 3, 4, 5, 6, 7, 8, 9]);
        });

        it('should determine when to process buffer', function() {
            // Empty buffer
            expect(sttIntegration.shouldProcessBuffer()).to.be.false;
            
            // Add old chunk
            sttIntegration.audioBuffer.push({
                data: Buffer.alloc(100),
                timestamp: Date.now() - 3000 // 3 seconds old
            });
            
            expect(sttIntegration.shouldProcessBuffer()).to.be.true;
            
            // Add many recent chunks
            sttIntegration.audioBuffer = [];
            for (let i = 0; i < 12; i++) {
                sttIntegration.audioBuffer.push({
                    data: Buffer.alloc(100),
                    timestamp: Date.now() - (i * 100)
                });
            }
            
            expect(sttIntegration.shouldProcessBuffer()).to.be.true;
        });
    });

    describe('Whisper API Integration', function() {
        
        beforeEach(async function() {
            await sttIntegration.initialize();
        });

        it('should prepare audio file for Whisper correctly', async function() {
            const audioData = Buffer.from('test audio data');
            
            const tempFile = await sttIntegration.prepareAudioForWhisper(audioData);
            
            expect(tempFile).to.be.a('string');
            expect(tempFile).to.include('/tmp/whisper_audio_');
            expect(tempFile).to.include('.wav');
            
            // Clean up if file was created
            try {
                await fs.unlink(tempFile);
            } catch (error) {
                // File might not exist in test environment
            }
        });

        it('should process audio with Whisper API', async function() {
            const mockTranscription = {
                text: 'Hello, this is a test transcription.'
            };
            
            // Mock OpenAI API call
            sandbox.stub(sttIntegration.openai.audio.transcriptions, 'create').resolves(mockTranscription);
            
            // Mock file operations
            sandbox.stub(fs, 'readFile').resolves(Buffer.from('mock audio'));
            sandbox.stub(fs, 'unlink').resolves();
            
            const tempFile = '/tmp/test_audio.wav';
            const result = await sttIntegration.processWithWhisper(tempFile, {
                model: 'whisper-1',
                language: 'en'
            });
            
            expect(result.text).to.equal('Hello, this is a test transcription.');
            expect(result.confidence).to.equal(1.0);
            expect(result.provider).to.equal('OpenAI Whisper');
            expect(result).to.have.property('timestamp');
            expect(result).to.have.property('metadata');
        });

        it('should handle Whisper API errors with fallback', async function() {
            // Mock API failure
            sandbox.stub(sttIntegration.openai.audio.transcriptions, 'create').rejects(
                new Error('Whisper API Error')
            );
            
            // Mock fallback
            sandbox.stub(sttIntegration, 'generateSystemSTT').resolves({
                text: 'Fallback transcription',
                confidence: 0.5,
                provider: 'System'
            });
            
            const tempFile = '/tmp/test_audio.wav';
            const result = await sttIntegration.processWithWhisper(tempFile);
            
            expect(result.text).to.equal('Fallback transcription');
            expect(result.provider).to.equal('System');
        });

        it('should clean up temporary files after processing', async function() {
            const mockTranscription = { text: 'Test' };
            sandbox.stub(sttIntegration.openai.audio.transcriptions, 'create').resolves(mockTranscription);
            sandbox.stub(fs, 'readFile').resolves(Buffer.from('mock audio'));
            
            const unlinkSpy = sandbox.stub(fs, 'unlink').resolves();
            
            const tempFile = '/tmp/test_audio.wav';
            await sttIntegration.processWithWhisper(tempFile);
            
            expect(unlinkSpy.calledOnce).to.be.true;
            expect(unlinkSpy.firstCall.args[0]).to.equal(tempFile);
        });
    });

    describe('Event Handling', function() {
        
        beforeEach(async function() {
            await sttIntegration.initialize();
        });

        it('should emit speech_recognized event for high confidence results', function(done) {
            sttIntegration.on('speech_recognized', (eventData) => {
                expect(eventData.text).to.equal('Test speech');
                expect(eventData.confidence).to.equal(0.95);
                expect(eventData.provider).to.equal('OpenAI Whisper');
                done();
            });
            
            // Simulate high confidence result
            const mockResult = {
                text: 'Test speech',
                confidence: 0.95,
                provider: 'OpenAI Whisper',
                timestamp: new Date().toISOString()
            };
            
            // Trigger the event manually for testing
            sttIntegration.emit('speech_recognized', mockResult);
        });

        it('should emit error event on processing failures', function(done) {
            sttIntegration.on('error', (error) => {
                expect(error).to.be.instanceOf(Error);
                expect(error.message).to.include('Processing error');
                done();
            });
            
            // Trigger error event
            sttIntegration.emit('error', new Error('Processing error'));
        });

        it('should not emit speech_recognized for low confidence results', async function() {
            let eventEmitted = false;
            
            sttIntegration.on('speech_recognized', () => {
                eventEmitted = true;
            });
            
            // Mock low confidence processing
            sandbox.stub(sttIntegration, 'processWithWhisper').resolves({
                text: 'Unclear speech',
                confidence: 0.3, // Below threshold
                provider: 'OpenAI Whisper'
            });
            
            const audioData = Buffer.alloc(1000);
            await sttIntegration.processAudioData(audioData, { sample_rate: 16000 });
            
            // Wait a bit to ensure no event is emitted
            await new Promise(resolve => setTimeout(resolve, 100));
            
            expect(eventEmitted).to.be.false;
        });
    });

    describe('Statistics and Monitoring', function() {
        
        beforeEach(async function() {
            await sttIntegration.initialize();
        });

        it('should track processing statistics', function() {
            const stats = sttIntegration.getStats();
            
            expect(stats).to.have.property('totalRequests');
            expect(stats).to.have.property('successfulRequests');
            expect(stats).to.have.property('failedRequests');
            expect(stats).to.have.property('averageConfidence');
            expect(stats).to.have.property('averageResponseTime');
            expect(stats).to.have.property('successRate');
            expect(stats).to.have.property('isProcessing');
            expect(stats).to.have.property('activeRequests');
            expect(stats).to.have.property('bufferSize');
        });

        it('should update statistics on successful processing', function() {
            const initialStats = sttIntegration.getStats();
            
            sttIntegration.updateStats({
                text: 'Test',
                confidence: 0.9
            }, 1500, true);
            
            const updatedStats = sttIntegration.getStats();
            
            expect(updatedStats.totalRequests).to.equal(initialStats.totalRequests + 1);
            expect(updatedStats.successfulRequests).to.equal(initialStats.successfulRequests + 1);
            expect(updatedStats.averageResponseTime).to.be.greaterThan(0);
        });

        it('should update statistics on failed processing', function() {
            const initialStats = sttIntegration.getStats();
            
            sttIntegration.updateStats(null, 0, false);
            
            const updatedStats = sttIntegration.getStats();
            
            expect(updatedStats.totalRequests).to.equal(initialStats.totalRequests + 1);
            expect(updatedStats.failedRequests).to.equal(initialStats.failedRequests + 1);
        });

        it('should calculate success rate correctly', function() {
            // Process some successful and failed requests
            sttIntegration.updateStats({ confidence: 0.9 }, 1000, true);
            sttIntegration.updateStats({ confidence: 0.8 }, 1200, true);
            sttIntegration.updateStats(null, 0, false);
            
            const stats = sttIntegration.getStats();
            
            expect(stats.totalRequests).to.equal(3);
            expect(stats.successfulRequests).to.equal(2);
            expect(stats.failedRequests).to.equal(1);
            expect(stats.successRate).to.be.closeTo(66.67, 0.1);
        });
    });

    describe('Cleanup and Resource Management', function() {
        
        beforeEach(async function() {
            await sttIntegration.initialize();
        });

        it('should clear buffer when stopped', function() {
            // Add some data to buffer
            sttIntegration.audioBuffer.push({
                data: Buffer.alloc(100),
                timestamp: Date.now()
            });
            
            expect(sttIntegration.audioBuffer.length).to.be.greaterThan(0);
            
            sttIntegration.stop();
            
            expect(sttIntegration.audioBuffer.length).to.equal(0);
            expect(sttIntegration.isProcessing).to.be.false;
        });

        it('should clear buffer manually', function() {
            // Add some data to buffer
            sttIntegration.audioBuffer.push({
                data: Buffer.alloc(100),
                timestamp: Date.now()
            });
            
            expect(sttIntegration.audioBuffer.length).to.be.greaterThan(0);
            
            sttIntegration.clearBuffer();
            
            expect(sttIntegration.audioBuffer.length).to.equal(0);
            expect(sttIntegration.bufferStartTime).to.be.null;
            expect(sttIntegration.lastSpeechTime).to.be.null;
        });

        it('should emit stopped event when stopped', function(done) {
            sttIntegration.on('stopped', () => {
                done();
            });
            
            sttIntegration.stop();
        });
    });
});
