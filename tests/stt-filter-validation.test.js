/**
 * STT Filter Validation Test
 * Tests all new filter controls and configuration persistence
 */

const { expect } = require('chai');
const fetch = require('node-fetch');

const BASE_URL = process.env.BASE_URL || 'http://localhost:3000';

describe('STT Filter Controls', function () {
    this.timeout(30000);

    let originalConfig = null;

    before(async function () {
        // Save original configuration
        const response = await fetch(`${BASE_URL}/api/elevenlabs/stt/config`);
        const data = await response.json();
        if (data.success) {
            originalConfig = data.config;
        }
    });

    after(async function () {
        // Restore original configuration
        if (originalConfig) {
            await fetch(`${BASE_URL}/api/elevenlabs/stt/config`, {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify(originalConfig)
            });
        }
    });

    describe('Configuration API', function () {
        it('should get current STT configuration', async function () {
            const response = await fetch(`${BASE_URL}/api/elevenlabs/stt/config`);
            const data = await response.json();

            expect(data).to.have.property('success', true);
            expect(data).to.have.property('config');
            expect(data.config).to.be.an('object');
        });

        it('should save STT configuration with all filter settings', async function () {
            const testConfig = {
                model: 'scribe_english_v1',
                language: 'en',
                sampleRate: 16000,
                vadEnabled: true,
                vadThreshold: 0.45,
                vadSilenceDuration: 600,
                audioFilterEnabled: true,
                highpassFreq: 250,
                lowpassFreq: 4000,
                denoiseLevel: -30,
                filterSfx: true,
                validateEnglish: true,
                minLetterRatio: 60,
                requireVowels: true
            };

            const response = await fetch(`${BASE_URL}/api/elevenlabs/stt/config`, {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify(testConfig)
            });

            const data = await response.json();
            expect(data).to.have.property('success', true);
            expect(data.config).to.deep.include(testConfig);
        });

        it('should persist configuration across requests', async function () {
            const testConfig = {
                highpassFreq: 300,
                lowpassFreq: 3500,
                denoiseLevel: -20,
                minLetterRatio: 65
            };

            // Save config
            await fetch(`${BASE_URL}/api/elevenlabs/stt/config`, {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify(testConfig)
            });

            // Retrieve config
            const response = await fetch(`${BASE_URL}/api/elevenlabs/stt/config`);
            const data = await response.json();

            expect(data.success).to.be.true;
            expect(data.config.highpassFreq).to.equal(300);
            expect(data.config.lowpassFreq).to.equal(3500);
            expect(data.config.denoiseLevel).to.equal(-20);
            expect(data.config.minLetterRatio).to.equal(65);
        });
    });

    describe('Audio Filter Settings', function () {
        it('should accept valid highpass frequency range', async function () {
            for (const freq of [50, 200, 350, 500]) {
                const response = await fetch(`${BASE_URL}/api/elevenlabs/stt/config`, {
                    method: 'POST',
                    headers: { 'Content-Type': 'application/json' },
                    body: JSON.stringify({ highpassFreq: freq })
                });

                const data = await response.json();
                expect(data.success).to.be.true;
                expect(data.config.highpassFreq).to.equal(freq);
            }
        });

        it('should accept valid lowpass frequency range', async function () {
            for (const freq of [2000, 3800, 6000, 8000]) {
                const response = await fetch(`${BASE_URL}/api/elevenlabs/stt/config`, {
                    method: 'POST',
                    headers: { 'Content-Type': 'application/json' },
                    body: JSON.stringify({ lowpassFreq: freq })
                });

                const data = await response.json();
                expect(data.success).to.be.true;
                expect(data.config.lowpassFreq).to.equal(freq);
            }
        });

        it('should accept valid denoise level range', async function () {
            for (const level of [-50, -35, -25, -15, -10]) {
                const response = await fetch(`${BASE_URL}/api/elevenlabs/stt/config`, {
                    method: 'POST',
                    headers: { 'Content-Type': 'application/json' },
                    body: JSON.stringify({ denoiseLevel: level })
                });

                const data = await response.json();
                expect(data.success).to.be.true;
                expect(data.config.denoiseLevel).to.equal(level);
            }
        });

        it('should toggle audio filter enable/disable', async function () {
            // Disable
            let response = await fetch(`${BASE_URL}/api/elevenlabs/stt/config`, {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ audioFilterEnabled: false })
            });

            let data = await response.json();
            expect(data.success).to.be.true;
            expect(data.config.audioFilterEnabled).to.be.false;

            // Enable
            response = await fetch(`${BASE_URL}/api/elevenlabs/stt/config`, {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ audioFilterEnabled: true })
            });

            data = await response.json();
            expect(data.success).to.be.true;
            expect(data.config.audioFilterEnabled).to.be.true;
        });
    });

    describe('Text Filter Settings', function () {
        it('should toggle SFX filtering', async function () {
            // Disable
            let response = await fetch(`${BASE_URL}/api/elevenlabs/stt/config`, {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ filterSfx: false })
            });

            let data = await response.json();
            expect(data.success).to.be.true;
            expect(data.config.filterSfx).to.be.false;

            // Enable
            response = await fetch(`${BASE_URL}/api/elevenlabs/stt/config`, {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ filterSfx: true })
            });

            data = await response.json();
            expect(data.success).to.be.true;
            expect(data.config.filterSfx).to.be.true;
        });

        it('should toggle English validation', async function () {
            // Disable
            let response = await fetch(`${BASE_URL}/api/elevenlabs/stt/config`, {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ validateEnglish: false })
            });

            let data = await response.json();
            expect(data.success).to.be.true;
            expect(data.config.validateEnglish).to.be.false;

            // Enable
            response = await fetch(`${BASE_URL}/api/elevenlabs/stt/config`, {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ validateEnglish: true })
            });

            data = await response.json();
            expect(data.success).to.be.true;
            expect(data.config.validateEnglish).to.be.true;
        });

        it('should accept valid min letter ratio range', async function () {
            for (const ratio of [30, 45, 55, 70, 90]) {
                const response = await fetch(`${BASE_URL}/api/elevenlabs/stt/config`, {
                    method: 'POST',
                    headers: { 'Content-Type': 'application/json' },
                    body: JSON.stringify({ minLetterRatio: ratio })
                });

                const data = await response.json();
                expect(data.success).to.be.true;
                expect(data.config.minLetterRatio).to.equal(ratio);
            }
        });

        it('should toggle vowel requirement', async function () {
            // Disable
            let response = await fetch(`${BASE_URL}/api/elevenlabs/stt/config`, {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ requireVowels: false })
            });

            let data = await response.json();
            expect(data.success).to.be.true;
            expect(data.config.requireVowels).to.be.false;

            // Enable
            response = await fetch(`${BASE_URL}/api/elevenlabs/stt/config`, {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ requireVowels: true })
            });

            data = await response.json();
            expect(data.success).to.be.true;
            expect(data.config.requireVowels).to.be.true;
        });
    });

    describe('VAD Settings', function () {
        it('should accept valid VAD threshold range', async function () {
            for (const threshold of [0.05, 0.25, 0.50, 0.75, 0.95]) {
                const response = await fetch(`${BASE_URL}/api/elevenlabs/stt/config`, {
                    method: 'POST',
                    headers: { 'Content-Type': 'application/json' },
                    body: JSON.stringify({ vadThreshold: threshold })
                });

                const data = await response.json();
                expect(data.success).to.be.true;
                expect(data.config.vadThreshold).to.equal(threshold);
            }
        });

        it('should accept valid silence duration range', async function () {
            for (const duration of [100, 500, 1000, 1500, 2000]) {
                const response = await fetch(`${BASE_URL}/api/elevenlabs/stt/config`, {
                    method: 'POST',
                    headers: { 'Content-Type': 'application/json' },
                    body: JSON.stringify({ vadSilenceDuration: duration })
                });

                const data = await response.json();
                expect(data.success).to.be.true;
                expect(data.config.vadSilenceDuration).to.equal(duration);
            }
        });
    });
});

