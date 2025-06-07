#!/usr/bin/env node
/**
 * Test script to verify webcam management fixes
 * Tests the webcam detection and management functionality
 */

const http = require('http');
const { spawn } = require('child_process');
const path = require('path');

class WebcamFixTester {
    constructor() {
        this.results = {
            total: 0,
            passed: 0,
            failed: 0,
            tests: []
        };
    }

    log(message) {
        console.log(`[${new Date().toISOString()}] ${message}`);
    }

    async runTest(testName, testFunction) {
        this.results.total++;
        this.log(`🧪 Running test: ${testName}`);
        
        try {
            const result = await testFunction();
            if (result.success) {
                this.results.passed++;
                this.log(`✅ ${testName}: PASSED - ${result.message}`);
            } else {
                this.results.failed++;
                this.log(`❌ ${testName}: FAILED - ${result.message}`);
            }
            this.results.tests.push({ name: testName, ...result });
        } catch (error) {
            this.results.failed++;
            this.log(`❌ ${testName}: ERROR - ${error.message}`);
            this.results.tests.push({ 
                name: testName, 
                success: false, 
                message: error.message 
            });
        }
    }

    /**
     * Test 1: Direct camera detection on Orlok RPI
     */
    async testOrlokCameraDetection() {
        return new Promise((resolve) => {
            const process = spawn('ssh', [
                '-o', 'ConnectTimeout=10',
                '-o', 'StrictHostKeyChecking=no',
                'remote@192.168.8.120',
                'python3 /home/remote/MonsterBox/scripts/webcam_detect.py'
            ]);

            let output = '';
            let error = '';

            process.stdout.on('data', (data) => {
                output += data.toString();
            });

            process.stderr.on('data', (data) => {
                error += data.toString();
            });

            process.on('close', (code) => {
                if (code === 0) {
                    try {
                        const jsonMatch = output.match(/\{[\s\S]*\}/);
                        if (jsonMatch) {
                            const result = JSON.parse(jsonMatch[0]);
                            if (result.success && result.cameras && result.cameras.length > 0) {
                                resolve({
                                    success: true,
                                    message: `Found ${result.cameras.length} camera(s) on Orlok RPI`,
                                    data: result
                                });
                            } else {
                                resolve({
                                    success: false,
                                    message: 'No cameras detected on Orlok RPI'
                                });
                            }
                        } else {
                            resolve({
                                success: false,
                                message: 'Invalid JSON response from camera detection'
                            });
                        }
                    } catch (parseError) {
                        resolve({
                            success: false,
                            message: `Failed to parse camera detection result: ${parseError.message}`
                        });
                    }
                } else {
                    resolve({
                        success: false,
                        message: `Camera detection failed with code ${code}: ${error}`
                    });
                }
            });

            setTimeout(() => {
                process.kill();
                resolve({
                    success: false,
                    message: 'Camera detection timed out'
                });
            }, 15000);
        });
    }

    /**
     * Test 2: Test camera device validation
     */
    async testCameraDeviceValidation() {
        return new Promise((resolve) => {
            const process = spawn('ssh', [
                '-o', 'ConnectTimeout=10',
                '-o', 'StrictHostKeyChecking=no',
                'remote@192.168.8.120',
                'test -c /dev/video0 && echo "exists" || echo "missing"'
            ]);

            let output = '';

            process.stdout.on('data', (data) => {
                output += data.toString();
            });

            process.on('close', (code) => {
                const result = output.trim();
                if (code === 0 && result === 'exists') {
                    resolve({
                        success: true,
                        message: 'Camera device /dev/video0 exists and is accessible'
                    });
                } else {
                    resolve({
                        success: false,
                        message: `Camera device validation failed: ${result}`
                    });
                }
            });

            setTimeout(() => {
                process.kill();
                resolve({
                    success: false,
                    message: 'Device validation timed out'
                });
            }, 10000);
        });
    }

    /**
     * Test 3: Test webcam test stream script
     */
    async testWebcamTestStream() {
        return new Promise((resolve) => {
            // Test if the webcam test stream script exists and can be executed
            const process = spawn('ssh', [
                '-o', 'ConnectTimeout=10',
                '-o', 'StrictHostKeyChecking=no',
                'remote@192.168.8.120',
                'test -f /home/remote/MonsterBox/scripts/webcam_test_stream.py && echo "exists" || echo "missing"'
            ]);

            let output = '';

            process.stdout.on('data', (data) => {
                output += data.toString();
            });

            process.on('close', (code) => {
                const result = output.trim();
                if (code === 0 && result === 'exists') {
                    resolve({
                        success: true,
                        message: 'Webcam test stream script exists and is accessible'
                    });
                } else {
                    resolve({
                        success: false,
                        message: `Webcam test stream script not found: ${result}`
                    });
                }
            });

            setTimeout(() => {
                process.kill();
                resolve({
                    success: false,
                    message: 'Test stream script check timed out'
                });
            }, 10000);
        });
    }

    /**
     * Test 4: Check if camera is currently in use
     */
    async testCameraUsageStatus() {
        return new Promise((resolve) => {
            const process = spawn('ssh', [
                '-o', 'ConnectTimeout=10',
                '-o', 'StrictHostKeyChecking=no',
                'remote@192.168.8.120',
                'lsof /dev/video0 | wc -l'
            ]);

            let output = '';

            process.stdout.on('data', (data) => {
                output += data.toString();
            });

            process.on('close', (code) => {
                if (code === 0) {
                    const processCount = parseInt(output.trim());
                    if (processCount > 0) {
                        resolve({
                            success: true,
                            message: `Camera is in use by ${processCount} process(es) - this is expected for persistent streaming`
                        });
                    } else {
                        resolve({
                            success: true,
                            message: 'Camera is not currently in use'
                        });
                    }
                } else {
                    resolve({
                        success: false,
                        message: 'Failed to check camera usage status'
                    });
                }
            });

            setTimeout(() => {
                process.kill();
                resolve({
                    success: false,
                    message: 'Camera usage check timed out'
                });
            }, 10000);
        });
    }

    /**
     * Run all tests
     */
    async runAllTests() {
        this.log('🎭 MonsterBox Webcam Management Fix Verification');
        this.log('============================================================');
        this.log('Testing webcam functionality on Orlok RPI4b system (192.168.8.120)');
        this.log('');

        await this.runTest('Orlok Camera Detection', () => this.testOrlokCameraDetection());
        await this.runTest('Camera Device Validation', () => this.testCameraDeviceValidation());
        await this.runTest('Webcam Test Stream Script', () => this.testWebcamTestStream());
        await this.runTest('Camera Usage Status', () => this.testCameraUsageStatus());

        this.log('');
        this.log('📊 Test Results Summary:');
        this.log(`Total Tests: ${this.results.total}`);
        this.log(`Passed: ${this.results.passed}`);
        this.log(`Failed: ${this.results.failed}`);
        this.log(`Success Rate: ${((this.results.passed / this.results.total) * 100).toFixed(1)}%`);

        if (this.results.failed === 0) {
            this.log('🎉 All tests passed! Webcam management fixes are working correctly.');
        } else {
            this.log('⚠️  Some tests failed. Review the issues above.');
        }

        return this.results;
    }
}

// Run the tests
async function main() {
    const tester = new WebcamFixTester();
    try {
        await tester.runAllTests();
        process.exit(tester.results.failed === 0 ? 0 : 1);
    } catch (error) {
        console.error('Fatal error:', error);
        process.exit(1);
    }
}

if (require.main === module) {
    main();
}

module.exports = WebcamFixTester;
