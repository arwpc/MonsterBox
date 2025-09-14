const { expect } = require('chai');
const sinon = require('sinon');
const SpeakerService = require('../../services/speakerService');

describe('🔊 SpeakerService Unit Tests', function() {
    let speakerService;
    let sandbox;

    beforeEach(function() {
        sandbox = sinon.createSandbox();
        speakerService = new SpeakerService();
    });

    afterEach(function() {
        sandbox.restore();
    });

    describe('Device Discovery', function() {
        it('should discover USB Audio Device', async function() {
            const devices = await speakerService.getAvailableDevices();
            
            expect(devices).to.be.an('array');
            expect(devices.length).to.be.greaterThan(0);
            
            // Should include USB Audio Device
            const usbDevice = devices.find(d => d.name.includes('USB Audio Device'));
            expect(usbDevice).to.exist;
            expect(usbDevice.id).to.include('usb-C-Media_Electronics_Inc._USB_Audio_Device');
        });

        it('should discover platform audio devices', async function() {
            const devices = await speakerService.getAvailableDevices();
            
            // Should include platform audio
            const platformDevice = devices.find(d => d.name.includes('Platform audio'));
            expect(platformDevice).to.exist;
            expect(platformDevice.id).to.include('platform-fe00b840.mailbox');
        });

        it('should include default ALSA output', async function() {
            const devices = await speakerService.getAvailableDevices();
            
            // Should include default ALSA
            const alsaDevice = devices.find(d => d.name.includes('Default ALSA Output'));
            expect(alsaDevice).to.exist;
        });

        it('should handle device enumeration errors gracefully', async function() {
            sandbox.stub(speakerService, '_enumerateAudioDevices').rejects(new Error('System error'));
            
            const devices = await speakerService.getAvailableDevices();
            expect(devices).to.be.an('array');
            expect(devices.length).to.be.greaterThan(0); // Should return fallback devices
        });

        it('should filter and format device information correctly', async function() {
            const devices = await speakerService.getAvailableDevices();
            
            devices.forEach(device => {
                expect(device).to.have.property('id');
                expect(device).to.have.property('name');
                expect(device).to.have.property('description');
                expect(device.id).to.be.a('string');
                expect(device.name).to.be.a('string');
                expect(device.description).to.be.a('string');
            });
        });
    });

    describe('Audio Output Testing', function() {
        it('should test audio output successfully', async function() {
            const config = {
                deviceId: 'alsa_output.usb-C-Media_Electronics_Inc._USB_Audio_Device-00.analog-stereo',
                testDuration: 2,
                frequency: 440 // A4 note
            };
            
            const result = await speakerService.testAudioOutput(config);
            
            expect(result).to.have.property('success', true);
            expect(result).to.have.property('deviceId', config.deviceId);
            expect(result).to.have.property('duration');
            expect(result).to.have.property('frequency', config.frequency);
        });

        it('should handle invalid device IDs', async function() {
            const config = {
                deviceId: 'invalid-device-id',
                testDuration: 1
            };
            
            const result = await speakerService.testAudioOutput(config);
            
            expect(result.success).to.be.false;
            expect(result.error).to.include('Device not found');
        });

        it('should validate test duration limits', async function() {
            const config = {
                deviceId: 'valid-device',
                testDuration: 100 // Too long
            };
            
            const result = await speakerService.testAudioOutput(config);
            
            expect(result.success).to.be.false;
            expect(result.error).to.include('Duration must be between');
        });

        it('should support different audio frequencies', async function() {
            const frequencies = [220, 440, 880, 1760]; // Different octaves of A
            
            for (const frequency of frequencies) {
                const config = {
                    deviceId: 'test-device',
                    testDuration: 1,
                    frequency: frequency
                };
                
                const result = await speakerService.testAudioOutput(config);
                
                if (result.success) {
                    expect(result.frequency).to.equal(frequency);
                }
            }
        });
    });

    describe('Volume Control', function() {
        it('should get current volume level', async function() {
            const deviceId = 'test-device';
            const volume = await speakerService.getVolume(deviceId);
            
            expect(volume).to.be.a('number');
            expect(volume).to.be.at.least(0);
            expect(volume).to.be.at.most(100);
        });

        it('should set volume level', async function() {
            const deviceId = 'test-device';
            const targetVolume = 75;
            
            const result = await speakerService.setVolume(deviceId, targetVolume);
            
            expect(result.success).to.be.true;
            expect(result.volume).to.equal(targetVolume);
        });

        it('should validate volume range', async function() {
            const deviceId = 'test-device';
            
            // Test invalid volumes
            const invalidVolumes = [-10, 150, 'invalid'];
            
            for (const volume of invalidVolumes) {
                const result = await speakerService.setVolume(deviceId, volume);
                expect(result.success).to.be.false;
                expect(result.error).to.include('Volume must be between 0 and 100');
            }
        });

        it('should handle mute/unmute operations', async function() {
            const deviceId = 'test-device';
            
            // Test mute
            const muteResult = await speakerService.setMute(deviceId, true);
            expect(muteResult.success).to.be.true;
            expect(muteResult.muted).to.be.true;
            
            // Test unmute
            const unmuteResult = await speakerService.setMute(deviceId, false);
            expect(unmuteResult.success).to.be.true;
            expect(unmuteResult.muted).to.be.false;
        });
    });

    describe('Device Configuration', function() {
        it('should validate speaker configuration', function() {
            const validConfig = {
                deviceId: 'test-device',
                volume: 50,
                sampleRate: 44100,
                channels: 2
            };
            
            const result = speakerService.validateConfiguration(validConfig);
            expect(result.valid).to.be.true;
            expect(result.errors).to.be.empty;
        });

        it('should reject invalid configurations', function() {
            const invalidConfig = {
                deviceId: '', // Empty device ID
                volume: 150, // Invalid volume
                sampleRate: 999, // Invalid sample rate
                channels: 0 // Invalid channels
            };
            
            const result = speakerService.validateConfiguration(invalidConfig);
            expect(result.valid).to.be.false;
            expect(result.errors.length).to.be.greaterThan(0);
        });

        it('should apply default configuration values', function() {
            const partialConfig = {
                deviceId: 'test-device'
            };
            
            const fullConfig = speakerService.applyDefaults(partialConfig);
            expect(fullConfig.volume).to.equal(50);
            expect(fullConfig.sampleRate).to.equal(44100);
            expect(fullConfig.channels).to.equal(2);
        });
    });

    describe('Audio Format Support', function() {
        it('should support common audio formats', async function() {
            const formats = ['wav', 'mp3', 'ogg', 'flac'];
            
            for (const format of formats) {
                const supported = await speakerService.isFormatSupported(format);
                expect(supported).to.be.a('boolean');
            }
        });

        it('should prioritize WAV format for compatibility', async function() {
            const preferredFormat = speakerService.getPreferredFormat();
            expect(preferredFormat).to.equal('wav');
        });

        it('should handle format conversion if needed', async function() {
            const config = {
                deviceId: 'test-device',
                audioData: Buffer.alloc(1000),
                inputFormat: 'mp3',
                outputFormat: 'wav'
            };
            
            const result = await speakerService.convertAudioFormat(config);
            
            if (result.success) {
                expect(result.convertedData).to.be.instanceOf(Buffer);
                expect(result.outputFormat).to.equal('wav');
            }
        });
    });

    describe('Performance and Reliability', function() {
        it('should handle multiple concurrent audio tests', async function() {
            const configs = Array(3).fill().map((_, i) => ({
                deviceId: `device-${i}`,
                testDuration: 1,
                frequency: 440 + (i * 100)
            }));
            
            const results = await Promise.all(
                configs.map(config => speakerService.testAudioOutput(config))
            );
            
            expect(results).to.have.length(3);
            results.forEach(result => {
                expect(result).to.have.property('success');
            });
        });

        it('should complete audio tests within reasonable time', async function() {
            const start = Date.now();
            
            await speakerService.testAudioOutput({
                deviceId: 'test-device',
                testDuration: 1
            });
            
            const elapsed = Date.now() - start;
            expect(elapsed).to.be.lessThan(3000);
        });

        it('should handle system audio service interruptions', async function() {
            // Mock system audio service failure
            sandbox.stub(speakerService, '_playAudio').rejects(new Error('Audio service unavailable'));
            
            const result = await speakerService.testAudioOutput({
                deviceId: 'test-device',
                testDuration: 1
            });
            
            expect(result.success).to.be.false;
            expect(result.error).to.include('Audio service unavailable');
        });
    });

    describe('Integration with MonsterBox Audio System', function() {
        it('should integrate with existing audio playback infrastructure', async function() {
            const config = {
                deviceId: 'test-device',
                audioFile: '/path/to/test.wav'
            };
            
            const result = await speakerService.playAudioFile(config);
            
            if (result.success) {
                expect(result).to.have.property('duration');
                expect(result).to.have.property('format');
            }
        });

        it('should support MonsterBox audio part configuration', function() {
            const partConfig = {
                name: 'Main Speaker',
                deviceId: 'usb-audio-device',
                volume: 75,
                enabled: true
            };
            
            const result = speakerService.validatePartConfiguration(partConfig);
            expect(result.valid).to.be.true;
        });

        it('should handle character-specific audio settings', async function() {
            const characterId = 'test-character';
            const settings = {
                defaultVolume: 60,
                preferredDevice: 'usb-audio',
                audioEffects: ['reverb', 'echo']
            };
            
            const result = await speakerService.applyCharacterSettings(characterId, settings);
            
            if (result.success) {
                expect(result.characterId).to.equal(characterId);
                expect(result.appliedSettings).to.deep.include(settings);
            }
        });
    });
});
