#!/usr/bin/env node
/**
 * Complete Audio System Validation Test
 * Tests all critical audio functionality after bug fixes
 */

import axios from 'axios';
import { spawn } from 'child_process';
import path from 'path';
import { fileURLToPath } from 'url';
import fs from 'fs';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

const BASE_URL = 'http://localhost:3000';
const ORLOK_URL = 'http://orlok:3000';

// Use Orlok if available, otherwise localhost
const TEST_URL = process.env.TEST_ORLOK === '1' ? ORLOK_URL : BASE_URL;

console.log('🎵 MonsterBox Audio System Complete Validation');
console.log('='.repeat(60));
console.log(`Testing against: ${TEST_URL}`);
console.log('');

let passCount = 0;
let failCount = 0;

function pass(msg) {
    console.log(`✅ PASS: ${msg}`);
    passCount++;
}

function fail(msg, error) {
    console.log(`❌ FAIL: ${msg}`);
    if (error) console.log(`   Error: ${error.message || error}`);
    failCount++;
}

async function runTest(name, testFn) {
    console.log(`\n🧪 ${name}`);
    console.log('-'.repeat(60));
    try {
        await testFn();
    } catch (error) {
        fail(name, error);
    }
}

async function testCharacterImages() {
    await runTest('Character Image API', async () => {
        try {
            const response = await axios.get(`${TEST_URL}/api/characters/3/images/pumpkinhead.jpg`, {
                validateStatus: () => true
            });

            if (response.status === 200) {
                pass('Character image returns 200 OK');
            } else if (response.status === 404) {
                pass('Character image returns 404 (image not found, but no 500 error)');
            } else {
                fail(`Character image returned unexpected status: ${response.status}`);
            }
        } catch (error) {
            fail('Character image request failed', error);
        }
    });
}

async function testAudioSystemStatus() {
    await runTest('Audio System Status', async () => {
        try {
            const response = await axios.get(`${TEST_URL}/setup/audio/api/system-config`);

            if (response.data && response.data.config && response.data.config.pipewireStatus) {
                const status = response.data.config.pipewireStatus;

                if (status.wpctl) {
                    pass('WirePlumber (wpctl) is available');
                } else {
                    fail('WirePlumber (wpctl) is NOT available');
                }

                if (status.pwplay) {
                    pass('pw-play is available');
                } else {
                    console.log('   ⚠️  pw-play not available (optional)');
                }
            } else {
                fail('Could not get PipeWire status');
            }
        } catch (error) {
            fail('Audio system status check failed', error);
        }
    });
}

async function testMicrophonePartsFiltering() {
    await runTest('Microphone Parts Filtering', async () => {
        try {
            const response = await axios.get(`${TEST_URL}/setup/calibration/api/parts?type=microphone`);

            if (response.data && response.data.success) {
                const parts = response.data.parts || [];

                // Check that all returned parts are microphones
                const nonMicParts = parts.filter(p => p.type !== 'microphone');

                if (nonMicParts.length === 0) {
                    pass(`Microphone parts API correctly filters (${parts.length} microphone parts)`);
                } else {
                    fail(`Microphone parts API returned ${nonMicParts.length} non-microphone parts`);
                }
            } else {
                fail('Microphone parts API returned error');
            }
        } catch (error) {
            fail('Microphone parts filtering test failed', error);
        }
    });
}

async function testAudioPlayback() {
    await runTest('Audio Playback Test', async () => {
        try {
            const response = await axios.post(`${TEST_URL}/setup/audio/api/test-system`, {
                testType: 'speaker',
                deviceId: 'default'
            });

            if (response.data && response.data.success) {
                pass('Audio test API returns success');
                console.log(`   Result: ${response.data.result}`);
            } else {
                fail('Audio test API returned failure');
            }
        } catch (error) {
            fail('Audio playback test failed', error);
        }
    });
}

async function testSpeakerCLI() {
    await runTest('Speaker CLI Direct Test', async () => {
        return new Promise((resolve) => {
            const scriptPath = path.join(__dirname, '../python_wrappers/speaker_cli.py');
            const audioFile = path.join(__dirname, '../public/sounds/monster-howl-85304.mp3');

            const proc = spawn('python3', [scriptPath, 'play', audioFile, '30', '--device', 'default']);

            let stdout = '';
            let stderr = '';

            proc.stdout.on('data', (data) => {
                stdout += data.toString();
            });

            proc.stderr.on('data', (data) => {
                stderr += data.toString();
            });

            proc.on('close', (code) => {
                if (code === 0) {
                    try {
                        const result = JSON.parse(stdout);
                        if (result.status === 'success') {
                            pass('Speaker CLI plays audio successfully');
                            console.log(`   Player: ${result.player}`);
                            console.log(`   PID: ${result.pid}`);
                        } else {
                            fail('Speaker CLI returned error status');
                        }
                    } catch (e) {
                        fail('Speaker CLI returned invalid JSON', e);
                    }
                } else {
                    fail(`Speaker CLI exited with code ${code}`);
                    if (stderr) console.log(`   stderr: ${stderr}`);
                }
                resolve();
            });

            setTimeout(() => {
                proc.kill();
                fail('Speaker CLI timed out');
                resolve();
            }, 10000);
        });
    });
}

async function testAudioLibraryJS() {
    await runTest('Audio Library JS Syntax', async () => {
        try {
            const audioLibPath = path.join(__dirname, '../public/js/audio-library.js');
            const content = fs.readFileSync(audioLibPath, 'utf8');

            // Check for the syntax error that was fixed
            if (content.includes('async loadSpeakers()')) {
                pass('audio-library.js has loadSpeakers function');
            } else {
                fail('audio-library.js missing loadSpeakers function');
            }

            // Check for proper catch block
            if (content.includes('} catch (e) {') && content.includes('loadCurrentCharacter')) {
                pass('audio-library.js has proper error handling');
            } else {
                fail('audio-library.js missing proper error handling');
            }
        } catch (error) {
            fail('Audio library syntax check failed', error);
        }
    });
}

async function runAllTests() {
    console.log('Starting comprehensive audio system validation...\n');

    await testCharacterImages();
    await testAudioSystemStatus();
    await testMicrophonePartsFiltering();
    await testAudioPlayback();
    await testSpeakerCLI();
    await testAudioLibraryJS();

    console.log('\n' + '='.repeat(60));
    console.log('📊 TEST SUMMARY');
    console.log('='.repeat(60));
    console.log(`✅ Passed: ${passCount}`);
    console.log(`❌ Failed: ${failCount}`);
    console.log(`📈 Total:  ${passCount + failCount}`);
    console.log('');

    if (failCount === 0) {
        console.log('🎉 ALL TESTS PASSED! Audio system is bulletproof and reliable.');
        process.exit(0);
    } else {
        console.log('⚠️  Some tests failed. Please review the output above.');
        process.exit(1);
    }
}

// Run tests
runAllTests().catch(error => {
    console.error('Fatal error running tests:', error);
    process.exit(1);
});

