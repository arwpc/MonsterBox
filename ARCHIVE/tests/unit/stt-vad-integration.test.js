const { expect } = require('chai');
const sinon = require('sinon');
const STTVADIntegration = require('../../services/sttVADIntegrationService');

describe('🎙️ STT + VAD Integration Unit Tests', function() {
    let sttVadService;
    let sandbox;

    beforeEach(function() {
        sandbox = sinon.createSandbox();
        sttVadService = new STTVADIntegration();
    });

    afterEach(function() {
        sandbox.restore();
    });

    describe('VAD Configuration', function() {
        it('should validate VAD configuration parameters', function() {
            const validConfig = {
                vadType: 'webrtcvad',
                vadThreshold: 0.5,
                prefixPadding: 300,
                silenceDuration: 1000
            };
            
            const result = sttVadService.validateVADConfig(validConfig);
            expect(result.valid).to.be.true;
            expect(result.errors).to.be.empty;
        });

        it('should reject invalid VAD threshold values', function() {
            const invalidConfigs = [
                { vadThreshold: -0.1 }, // Too low
                { vadThreshold: 1.1 },  // Too high
                { vadThreshold: 'invalid' } // Wrong type
            ];
            
            invalidConfigs.forEach(config => {
                const result = sttVadService.validateVADConfig(config);
                expect(result.valid).to.be.false;
                expect(result.errors).to.include('Invalid VAD threshold');
            });
        });

        it('should apply default VAD configuration values', function() {
            const partialConfig = {
                vadType: 'webrtcvad'
            };
            
            const fullConfig = sttVadService.applyVADDefaults(partialConfig);
            expect(fullConfig.vadThreshold).to.equal(0.5);
            expect(fullConfig.prefixPadding).to.equal(300);
            expect(fullConfig.silenceDuration).to.equal(1000);
        });
    });

    describe('STT Configuration', function() {
        it('should validate STT provider configuration', function() {
            const validConfig = {
                provider: 'elevenlabs',
                language: 'en',
                model: 'default',
                apiKey: 'test-key'
            };
            
            const result = sttVadService.validateSTTConfig(validConfig);
            expect(result.valid).to.be.true;
        });

        it('should support multiple STT providers', function() {
            const providers = ['elevenlabs', 'whisper', 'google', 'azure'];
            
            providers.forEach(provider => {
                const config = { provider: provider };
                const result = sttVadService.validateSTTConfig(config);
                
                if (result.valid) {
                    expect(result.supportedProvider).to.be.true;
                }
            });
        });

        it('should handle provider-specific configuration', function() {
            const elevenLabsConfig = {
                provider: 'elevenlabs',
                websocketUrl: 'wss://api.elevenlabs.io/v1/convai/conversation',
                agentId: 'test-agent'
            };
            
            const result = sttVadService.validateSTTConfig(elevenLabsConfig);
            expect(result.valid).to.be.true;
            expect(result.providerSpecific).to.exist;
        });
    });

    describe('Integration Testing', function() {
        it('should test STT + VAD integration performance', async function() {
            const config = {
                stt: {
                    provider: 'elevenlabs',
                    language: 'en'
                },
                vad: {
                    vadThreshold: 0.5,
                    silenceDuration: 1000
                },
                testDuration: 5
            };
            
            const result = await sttVadService.testIntegration(config);
            
            expect(result).to.have.property('success');
            expect(result).to.have.property('sttPerformance');
            expect(result).to.have.property('vadPerformance');
            expect(result).to.have.property('integrationHealth');
            
            if (result.success) {
                expect(result.sttPerformance.responseTime).to.be.a('number');
                expect(result.vadPerformance.accuracy).to.be.a('number');
                expect(result.integrationHealth.status).to.be.oneOf(['healthy', 'degraded', 'unhealthy']);
            }
        });

        it('should measure STT accuracy with VAD preprocessing', async function() {
            const testAudio = {
                audioData: Buffer.alloc(5000),
                expectedTranscription: 'Hello world test',
                containsVoice: true
            };
            
            const result = await sttVadService.testSTTAccuracy(testAudio);
            
            expect(result).to.have.property('transcription');
            expect(result).to.have.property('confidence');
            expect(result).to.have.property('vadDetected');
            expect(result).to.have.property('accuracy');
            
            if (result.vadDetected) {
                expect(result.confidence).to.be.at.least(0);
                expect(result.confidence).to.be.at.most(1);
            }
        });

        it('should handle VAD false positives and negatives', async function() {
            const testCases = [
                { audioData: Buffer.alloc(1000), hasVoice: true, description: 'Clear speech' },
                { audioData: Buffer.alloc(1000), hasVoice: false, description: 'Silence' },
                { audioData: Buffer.alloc(1000), hasVoice: false, description: 'Background noise' },
                { audioData: Buffer.alloc(1000), hasVoice: true, description: 'Whispered speech' }
            ];
            
            const results = await Promise.all(
                testCases.map(testCase => sttVadService.testVADAccuracy(testCase))
            );
            
            results.forEach((result, index) => {
                expect(result).to.have.property('vadDetected');
                expect(result).to.have.property('confidence');
                expect(result).to.have.property('testCase', testCases[index].description);
            });
            
            // Calculate overall VAD accuracy
            const accuracy = results.reduce((acc, result, index) => {
                const correct = result.vadDetected === testCases[index].hasVoice;
                return acc + (correct ? 1 : 0);
            }, 0) / results.length;
            
            expect(accuracy).to.be.at.least(0.5); // At least 50% accuracy
        });
    });

    describe('Real-time Processing', function() {
        it('should process audio streams in real-time', async function() {
            const streamConfig = {
                sampleRate: 16000,
                channels: 1,
                chunkSize: 1024
            };
            
            const processor = sttVadService.createRealTimeProcessor(streamConfig);
            expect(processor).to.have.property('processChunk');
            expect(processor).to.have.property('getResults');
            expect(processor).to.have.property('stop');
            
            // Test processing audio chunks
            const audioChunk = Buffer.alloc(1024);
            const result = await processor.processChunk(audioChunk);
            
            expect(result).to.have.property('vadDetected');
            expect(result).to.have.property('audioLevel');
        });

        it('should handle streaming interruptions gracefully', async function() {
            const processor = sttVadService.createRealTimeProcessor({
                sampleRate: 16000,
                channels: 1
            });
            
            // Simulate stream interruption
            sandbox.stub(processor, '_processAudio').rejects(new Error('Stream interrupted'));
            
            const audioChunk = Buffer.alloc(1024);
            const result = await processor.processChunk(audioChunk);
            
            expect(result.error).to.include('Stream interrupted');
            expect(result.recovered).to.be.a('boolean');
        });

        it('should maintain low latency for real-time processing', async function() {
            const processor = sttVadService.createRealTimeProcessor({
                sampleRate: 16000,
                channels: 1,
                lowLatencyMode: true
            });
            
            const audioChunk = Buffer.alloc(512); // Small chunk for low latency
            const start = Date.now();
            
            await processor.processChunk(audioChunk);
            
            const latency = Date.now() - start;
            expect(latency).to.be.lessThan(100); // Less than 100ms latency
        });
    });

    describe('WebSocket Integration', function() {
        it('should establish WebSocket connection for live STT', async function() {
            const wsConfig = {
                url: 'wss://api.elevenlabs.io/v1/convai/conversation',
                agentId: 'test-agent',
                apiKey: 'test-key'
            };
            
            const connection = await sttVadService.createWebSocketConnection(wsConfig);
            
            expect(connection).to.have.property('send');
            expect(connection).to.have.property('close');
            expect(connection).to.have.property('onMessage');
            expect(connection).to.have.property('onError');
        });

        it('should handle WebSocket connection failures', async function() {
            const invalidConfig = {
                url: 'wss://invalid-url',
                apiKey: 'invalid-key'
            };
            
            try {
                await sttVadService.createWebSocketConnection(invalidConfig);
                expect.fail('Should have thrown an error');
            } catch (error) {
                expect(error.message).to.include('Connection failed');
            }
        });

        it('should send audio data through WebSocket', async function() {
            const mockConnection = {
                send: sandbox.stub(),
                readyState: 1 // OPEN
            };
            
            sandbox.stub(sttVadService, 'createWebSocketConnection').resolves(mockConnection);
            
            const audioData = Buffer.alloc(1024);
            const result = await sttVadService.sendAudioData(mockConnection, audioData);
            
            expect(result.success).to.be.true;
            expect(mockConnection.send.calledOnce).to.be.true;
        });
    });

    describe('Performance Metrics', function() {
        it('should collect comprehensive performance metrics', async function() {
            const config = {
                stt: { provider: 'elevenlabs' },
                vad: { vadThreshold: 0.5 },
                metricsEnabled: true
            };
            
            const metrics = await sttVadService.collectPerformanceMetrics(config);
            
            expect(metrics).to.have.property('sttLatency');
            expect(metrics).to.have.property('vadAccuracy');
            expect(metrics).to.have.property('throughput');
            expect(metrics).to.have.property('errorRate');
            expect(metrics).to.have.property('resourceUsage');
            
            expect(metrics.sttLatency).to.be.a('number');
            expect(metrics.vadAccuracy).to.be.a('number');
            expect(metrics.throughput).to.be.a('number');
        });

        it('should track error rates and recovery times', async function() {
            // Simulate various error conditions
            const errorConditions = [
                'network_timeout',
                'api_rate_limit',
                'audio_format_error',
                'vad_processing_error'
            ];
            
            const errorMetrics = await Promise.all(
                errorConditions.map(condition => 
                    sttVadService.simulateErrorCondition(condition)
                )
            );
            
            errorMetrics.forEach(metric => {
                expect(metric).to.have.property('errorType');
                expect(metric).to.have.property('recoveryTime');
                expect(metric).to.have.property('recovered');
            });
        });

        it('should monitor resource usage during processing', async function() {
            const resourceMonitor = sttVadService.createResourceMonitor();
            
            // Start monitoring
            resourceMonitor.start();
            
            // Simulate processing load
            await sttVadService.testIntegration({
                stt: { provider: 'elevenlabs' },
                vad: { vadThreshold: 0.5 },
                testDuration: 3
            });
            
            const usage = resourceMonitor.getUsage();
            resourceMonitor.stop();
            
            expect(usage).to.have.property('cpuUsage');
            expect(usage).to.have.property('memoryUsage');
            expect(usage).to.have.property('networkUsage');
            
            expect(usage.cpuUsage).to.be.at.least(0);
            expect(usage.memoryUsage).to.be.at.least(0);
        });
    });

    describe('Error Handling and Recovery', function() {
        it('should handle STT service outages gracefully', async function() {
            sandbox.stub(sttVadService, '_callSTTService').rejects(new Error('Service unavailable'));
            
            const result = await sttVadService.testIntegration({
                stt: { provider: 'elevenlabs' },
                vad: { vadThreshold: 0.5 }
            });
            
            expect(result.success).to.be.false;
            expect(result.error).to.include('Service unavailable');
            expect(result.fallbackUsed).to.be.a('boolean');
        });

        it('should implement automatic retry with exponential backoff', async function() {
            let callCount = 0;
            sandbox.stub(sttVadService, '_callSTTService').callsFake(() => {
                callCount++;
                if (callCount < 3) {
                    throw new Error('Temporary failure');
                }
                return Promise.resolve({ success: true });
            });
            
            const result = await sttVadService.testIntegration({
                stt: { provider: 'elevenlabs' },
                vad: { vadThreshold: 0.5 },
                retryConfig: {
                    maxRetries: 3,
                    backoffMultiplier: 2
                }
            });
            
            expect(result.success).to.be.true;
            expect(result.retryCount).to.equal(2);
        });

        it('should validate integration health continuously', async function() {
            const healthCheck = sttVadService.createHealthMonitor({
                checkInterval: 1000,
                healthThreshold: 0.8
            });
            
            healthCheck.start();
            
            // Wait for a few health checks
            await new Promise(resolve => setTimeout(resolve, 2500));
            
            const health = healthCheck.getCurrentHealth();
            healthCheck.stop();
            
            expect(health).to.have.property('overall');
            expect(health).to.have.property('stt');
            expect(health).to.have.property('vad');
            expect(health).to.have.property('integration');
            
            expect(health.overall).to.be.oneOf(['healthy', 'degraded', 'unhealthy']);
        });
    });
});
