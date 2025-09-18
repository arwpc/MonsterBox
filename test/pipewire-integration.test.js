/**
 * PipeWire Integration Test
 * Comprehensive test of the entire PipeWire audio system integration
 */

import { expect } from 'chai';
import axios from 'axios';

const BASE_URL = 'http://localhost:3000';

describe('PipeWire System Integration', () => {
    let testSpeaker = null;
    let testMicrophone = null;

    before(async () => {
        console.log('🚀 Starting PipeWire integration tests...');
    });

    after(async () => {
        // Cleanup any remaining test parts
        if (testSpeaker) {
            try {
                await axios.delete(`${BASE_URL}/setup/parts/api/parts/${testSpeaker.id}`, { validateStatus: () => true });
            } catch (e) { /* ignore */ }
        }
        if (testMicrophone) {
            try {
                await axios.delete(`${BASE_URL}/setup/parts/api/parts/${testMicrophone.id}`, { validateStatus: () => true });
            } catch (e) { /* ignore */ }
        }
        console.log('🧹 PipeWire integration tests cleanup complete');
    });

    describe('PipeWire Service Availability', () => {
        it('should check PipeWire tools availability', async () => {
            const res = await axios.get(`${BASE_URL}/setup/audio/api/check-pipewire`, { validateStatus: () => true });
            expect(res.status).to.equal(200);
            expect(res.data).to.have.property('success', true);
            expect(res.data).to.have.property('tools');
            
            const tools = res.data.tools;
            console.log('🔧 PipeWire tools status:');
            Object.keys(tools).forEach(tool => {
                console.log(`  ${tool}: ${tools[tool] ? '✅' : '❌'}`);
            });
        });

        it('should enumerate PipeWire sinks', async () => {
            const res = await axios.get(`${BASE_URL}/setup/audio/api/sinks`, { validateStatus: () => true });
            expect(res.status).to.equal(200);
            expect(res.data).to.have.property('success', true);
            expect(res.data).to.have.property('sinks');
            expect(res.data.sinks).to.be.an('array');
            console.log(`🔊 Found ${res.data.sinks.length} PipeWire sinks`);
        });

        it('should enumerate PipeWire sources', async () => {
            const res = await axios.get(`${BASE_URL}/setup/audio/api/sources`, { validateStatus: () => true });
            expect(res.status).to.equal(200);
            expect(res.data).to.have.property('success', true);
            expect(res.data).to.have.property('sources');
            expect(res.data.sources).to.be.an('array');
            console.log(`🎤 Found ${res.data.sources.length} PipeWire sources`);
        });
    });

    describe('Speaker Integration', () => {
        it('should create a PipeWire speaker part', async () => {
            const res = await axios.post(`${BASE_URL}/setup/parts/api/parts`, {
                name: 'Integration Test Speaker',
                type: 'speaker',
                description: 'PipeWire integration test speaker',
                config: {
                    audioDeviceId: 'default',
                    volume: 25,
                    bass: 0,
                    treble: 0
                }
            }, { validateStatus: () => true });

            expect(res.status).to.be.oneOf([200, 201]);
            expect(res.data).to.have.property('success', true);
            expect(res.data).to.have.property('part');
            
            testSpeaker = res.data.part;
            console.log(`✅ Created PipeWire speaker: ${testSpeaker.name} (ID: ${testSpeaker.id})`);
        });

        it('should test speaker playback with stream tracking', async () => {
            expect(testSpeaker).to.not.be.null;
            
            const playRes = await axios.post(`${BASE_URL}/setup/parts/api/parts/${testSpeaker.id}/test`, {
                action: 'play',
                params: { 
                    filename: 'public/sounds/monster-howl-85304.mp3', 
                    volume: 15,
                    partId: testSpeaker.id
                }
            }, { validateStatus: () => true });

            expect(playRes.status).to.equal(200);
            expect(playRes.data).to.have.property('testResult');
            console.log(`🎵 Speaker playback test: ${playRes.data.testResult.success ? 'SUCCESS' : 'EXPECTED_FAIL'}`);

            // Check if stream was registered
            const streamsRes = await axios.get(`${BASE_URL}/setup/parts/api/speaker/streams?partId=${testSpeaker.id}`, { validateStatus: () => true });
            expect(streamsRes.status).to.equal(200);
            console.log(`📊 Active streams for speaker: ${streamsRes.data.streams ? streamsRes.data.streams.length : 0}`);
        });

        it('should test volume control', async () => {
            expect(testSpeaker).to.not.be.null;
            
            const volRes = await axios.post(`${BASE_URL}/setup/parts/api/parts/${testSpeaker.id}/test`, {
                action: 'setVolume',
                params: { volume: 40 }
            }, { validateStatus: () => true });

            expect(volRes.status).to.equal(200);
            expect(volRes.data).to.have.property('testResult');
            console.log(`🔊 Volume control test: ${volRes.data.testResult.success ? 'SUCCESS' : 'EXPECTED_FAIL'}`);
        });

        it('should test stop functionality', async () => {
            expect(testSpeaker).to.not.be.null;
            
            const stopRes = await axios.post(`${BASE_URL}/setup/parts/api/parts/${testSpeaker.id}/test`, {
                action: 'stop',
                params: { partId: testSpeaker.id }
            }, { validateStatus: () => true });

            expect(stopRes.status).to.equal(200);
            expect(stopRes.data).to.have.property('testResult');
            console.log(`🛑 Stop functionality test: ${stopRes.data.testResult.success ? 'SUCCESS' : 'EXPECTED_FAIL'}`);
        });
    });

    describe('Microphone Integration', () => {
        it('should create a PipeWire microphone part', async () => {
            const res = await axios.post(`${BASE_URL}/setup/parts/api/parts`, {
                name: 'Integration Test Microphone',
                type: 'microphone',
                description: 'PipeWire integration test microphone',
                config: {
                    deviceId: 'default',
                    sensitivity: 1.0,
                    sampleRate: 16000,
                    channels: 1,
                    windowMs: 150
                }
            }, { validateStatus: () => true });

            expect(res.status).to.be.oneOf([200, 201]);
            expect(res.data).to.have.property('success', true);
            expect(res.data).to.have.property('part');
            
            testMicrophone = res.data.part;
            console.log(`✅ Created PipeWire microphone: ${testMicrophone.name} (ID: ${testMicrophone.id})`);
        });

        it('should test microphone level detection', async () => {
            expect(testMicrophone).to.not.be.null;
            
            const levelRes = await axios.post(`${BASE_URL}/setup/parts/api/parts/${testMicrophone.id}/test`, {
                action: 'getLevel',
                params: { 
                    deviceId: 'default',
                    duration: 0.15
                }
            }, { validateStatus: () => true });

            expect(levelRes.status).to.equal(200);
            expect(levelRes.data).to.have.property('testResult');
            console.log(`🎤 Microphone level test: ${levelRes.data.testResult.success ? 'SUCCESS' : 'EXPECTED_FAIL'}`);
            
            if (levelRes.data.testResult.success && levelRes.data.testResult.level !== undefined) {
                console.log(`📊 Detected audio level: ${levelRes.data.testResult.level}`);
            }
        });
    });

    describe('Stream Management', () => {
        it('should get stream statistics', async () => {
            const statsRes = await axios.get(`${BASE_URL}/setup/parts/api/speaker/stats`, { validateStatus: () => true });
            expect(statsRes.status).to.equal(200);
            expect(statsRes.data).to.have.property('success', true);
            expect(statsRes.data).to.have.property('stats');
            
            const stats = statsRes.data.stats;
            console.log(`📊 Stream statistics:`);
            console.log(`  Total streams: ${stats.total || 0}`);
            console.log(`  Playing: ${stats.playing || 0}`);
            console.log(`  Stopped: ${stats.stopped || 0}`);
        });

        it('should handle concurrent operations gracefully', async () => {
            if (!testSpeaker) {
                console.log('⚠️ Skipping concurrent test - no test speaker available');
                return;
            }

            // Try multiple operations simultaneously
            const operations = [
                axios.get(`${BASE_URL}/setup/audio/api/sinks`, { validateStatus: () => true }),
                axios.get(`${BASE_URL}/setup/audio/api/sources`, { validateStatus: () => true }),
                axios.get(`${BASE_URL}/setup/parts/api/speaker/stats`, { validateStatus: () => true })
            ];

            const results = await Promise.all(operations);
            results.forEach((res, index) => {
                expect(res.status).to.equal(200);
            });
            
            console.log('✅ Concurrent operations completed successfully');
        });
    });
});
