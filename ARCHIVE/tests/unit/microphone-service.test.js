const { expect } = require('chai');
const sinon = require('sinon');
const MicrophoneService = require('../../services/microphoneService');

describe('🎤 MicrophoneService Unit Tests', function() {
    let microphoneService;
    let sandbox;

    beforeEach(function() {
        sandbox = sinon.createSandbox();
        microphoneService = new MicrophoneService();
    });

    afterEach(function() {
        sandbox.restore();
    });

    describe('Device Discovery', function() {
        it('should discover available microphone devices', async function() {
            const devices = await microphoneService.getAvailableDevices();
            
            expect(devices).to.be.an('array');
            expect(devices.length).to.be.greaterThan(0);
            
            // Check device structure
            devices.forEach(device => {
                expect(device).to.have.property('id');
                expect(device).to.have.property('name');
                expect(device).to.have.property('type', 'microphone');
            });
        });

        it('should handle device discovery errors gracefully', async function() {
            // Mock system error
            sandbox.stub(microphoneService, '_enumerateDevices').rejects(new Error('System error'));
            
            const devices = await microphoneService.getAvailableDevices();
            expect(devices).to.be.an('array');
            expect(devices.length).to.equal(1); // Should return default device
            expect(devices[0].id).to.equal('default');
        });

        it('should filter out invalid devices', async function() {
            // Mock devices with some invalid entries
            sandbox.stub(microphoneService, '_enumerateDevices').resolves([
                { id: 'valid1', name: 'Valid Mic 1', channels: 1 },
                { id: null, name: 'Invalid Mic' }, // Invalid - no ID
                { id: 'valid2', name: 'Valid Mic 2', channels: 2 },
                { name: 'No ID Mic' }, // Invalid - no ID
            ]);
            
            const devices = await microphoneService.getAvailableDevices();
            expect(devices.length).to.equal(2);
            expect(devices.every(d => d.id)).to.be.true;
        });
    });

    describe('Configuration Management', function() {
        it('should validate microphone configuration', function() {
            const validConfig = {
                deviceId: 'test-device',
                sampleRate: 16000,
                channels: 1,
                sensitivity: 1.0
            };
            
            const result = microphoneService.validateConfiguration(validConfig);
            expect(result.valid).to.be.true;
            expect(result.errors).to.be.empty;
        });

        it('should reject invalid sample rates', function() {
            const invalidConfig = {
                deviceId: 'test-device',
                sampleRate: 999, // Invalid
                channels: 1,
                sensitivity: 1.0
            };
            
            const result = microphoneService.validateConfiguration(invalidConfig);
            expect(result.valid).to.be.false;
            expect(result.errors).to.include('Invalid sample rate');
        });

        it('should reject invalid sensitivity values', function() {
            const invalidConfig = {
                deviceId: 'test-device',
                sampleRate: 16000,
                channels: 1,
                sensitivity: 5.0 // Too high
            };
            
            const result = microphoneService.validateConfiguration(invalidConfig);
            expect(result.valid).to.be.false;
            expect(result.errors).to.include('Sensitivity must be between 0.1 and 3.0');
        });

        it('should apply default values for missing configuration', function() {
            const partialConfig = {
                deviceId: 'test-device'
            };
            
            const fullConfig = microphoneService.applyDefaults(partialConfig);
            expect(fullConfig.sampleRate).to.equal(16000);
            expect(fullConfig.channels).to.equal(1);
            expect(fullConfig.sensitivity).to.equal(1.0);
            expect(fullConfig.echoCancellation).to.be.true;
        });
    });

    describe('Audio Testing', function() {
        it('should test microphone audio levels', async function() {
            const config = {
                deviceId: 'test-device',
                duration: 2
            };
            
            const result = await microphoneService.testAudioLevels(config);
            
            expect(result).to.have.property('success', true);
            expect(result).to.have.property('levels');
            expect(result.levels).to.have.property('average');
            expect(result.levels).to.have.property('peak');
            expect(result.levels.average).to.be.a('number');
            expect(result.levels.peak).to.be.a('number');
        });

        it('should handle audio testing errors', async function() {
            sandbox.stub(microphoneService, '_captureAudio').rejects(new Error('Audio capture failed'));
            
            const config = { deviceId: 'invalid-device', duration: 1 };
            const result = await microphoneService.testAudioLevels(config);
            
            expect(result.success).to.be.false;
            expect(result.error).to.include('Audio capture failed');
        });

        it('should respect duration limits', async function() {
            const config = { deviceId: 'test-device', duration: 100 }; // Too long
            
            const result = await microphoneService.testAudioLevels(config);
            expect(result.success).to.be.false;
            expect(result.error).to.include('Duration must be between');
        });
    });

    describe('Voice Activation Detection (VAD)', function() {
        it('should detect voice activation correctly', async function() {
            const config = {
                deviceId: 'test-device',
                vadThreshold: 0.5,
                duration: 3
            };
            
            // Mock audio data with voice activity
            sandbox.stub(microphoneService, '_captureAudio').resolves({
                audioData: Buffer.alloc(1000),
                levels: [0.1, 0.2, 0.8, 0.9, 0.7, 0.3, 0.1] // Voice activity in middle
            });
            
            const result = await microphoneService.testVAD(config);
            
            expect(result.success).to.be.true;
            expect(result.vadEvents).to.be.an('array');
            expect(result.vadEvents.length).to.be.greaterThan(0);
            
            const voiceEvent = result.vadEvents.find(e => e.type === 'voice_detected');
            expect(voiceEvent).to.exist;
        });

        it('should adjust VAD sensitivity based on threshold', async function() {
            const lowThreshold = { deviceId: 'test', vadThreshold: 0.3, duration: 2 };
            const highThreshold = { deviceId: 'test', vadThreshold: 0.8, duration: 2 };
            
            // Mock consistent audio levels
            const mockAudio = {
                audioData: Buffer.alloc(500),
                levels: [0.5, 0.5, 0.5, 0.5] // Consistent medium level
            };
            
            sandbox.stub(microphoneService, '_captureAudio').resolves(mockAudio);
            
            const lowResult = await microphoneService.testVAD(lowThreshold);
            const highResult = await microphoneService.testVAD(highThreshold);
            
            // Low threshold should detect voice, high threshold should not
            expect(lowResult.vadEvents.some(e => e.type === 'voice_detected')).to.be.true;
            expect(highResult.vadEvents.some(e => e.type === 'voice_detected')).to.be.false;
        });
    });

    describe('Error Handling', function() {
        it('should handle device not found errors', async function() {
            const result = await microphoneService.testAudioLevels({
                deviceId: 'non-existent-device',
                duration: 1
            });
            
            expect(result.success).to.be.false;
            expect(result.error).to.include('Device not found');
        });

        it('should handle permission denied errors', async function() {
            sandbox.stub(microphoneService, '_requestPermissions').rejects(new Error('Permission denied'));
            
            const result = await microphoneService.testAudioLevels({
                deviceId: 'test-device',
                duration: 1
            });
            
            expect(result.success).to.be.false;
            expect(result.error).to.include('Permission denied');
        });

        it('should timeout long-running operations', async function() {
            this.timeout(6000); // Extend timeout for this test
            
            // Mock a long-running operation
            sandbox.stub(microphoneService, '_captureAudio').returns(
                new Promise(resolve => setTimeout(resolve, 10000))
            );
            
            const start = Date.now();
            const result = await microphoneService.testAudioLevels({
                deviceId: 'test-device',
                duration: 1,
                timeout: 2000
            });
            const elapsed = Date.now() - start;
            
            expect(elapsed).to.be.lessThan(3000);
            expect(result.success).to.be.false;
            expect(result.error).to.include('timeout');
        });
    });

    describe('Performance', function() {
        it('should handle multiple concurrent requests', async function() {
            const requests = Array(5).fill().map((_, i) => 
                microphoneService.testAudioLevels({
                    deviceId: `device-${i}`,
                    duration: 1
                })
            );
            
            const results = await Promise.all(requests);
            
            // All requests should complete (success or failure)
            expect(results).to.have.length(5);
            results.forEach(result => {
                expect(result).to.have.property('success');
            });
        });

        it('should complete audio tests within reasonable time', async function() {
            const start = Date.now();
            
            await microphoneService.testAudioLevels({
                deviceId: 'test-device',
                duration: 1
            });
            
            const elapsed = Date.now() - start;
            expect(elapsed).to.be.lessThan(3000); // Should complete within 3 seconds
        });
    });
});
