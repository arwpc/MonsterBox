#!/usr/bin/env node
/**
 * Comprehensive Webcam System Test for MonsterBox
 * Tests all webcam functionality on RPI4b systems
 */

const { spawn } = require('child_process');
const path = require('path');
const fs = require('fs');

// Test configuration
const TEST_CONFIG = {
    rpiHost: '192.168.8.120',
    rpiUser: 'remote',
    testDuration: 10000, // 10 seconds
    timeout: 30000 // 30 seconds
};

class WebcamSystemTester {
    constructor() {
        this.testResults = [];
        this.currentTest = 0;
        this.totalTests = 0;
    }

    /**
     * Log test results
     */
    log(message, level = 'info') {
        const timestamp = new Date().toISOString();
        const logMessage = `[${timestamp}] ${level.toUpperCase()}: ${message}`;
        console.log(logMessage);
    }

    /**
     * Run SSH command on RPI
     */
    async runSSHCommand(command) {
        return new Promise((resolve) => {
            const sshCommand = `ssh -o ConnectTimeout=10 -o StrictHostKeyChecking=no ${TEST_CONFIG.rpiUser}@${TEST_CONFIG.rpiHost}`;
            const fullCommand = `${sshCommand} "${command}"`;

            const process = spawn('cmd', ['/c', fullCommand], { shell: true });

            let output = '';
            let error = '';

            process.stdout.on('data', (data) => {
                output += data.toString();
            });

            process.stderr.on('data', (data) => {
                error += data.toString();
            });

            process.on('close', (code) => {
                resolve({
                    success: code === 0,
                    output: output.trim(),
                    error: error.trim(),
                    code: code
                });
            });

            setTimeout(() => {
                process.kill();
                resolve({
                    success: false,
                    output: '',
                    error: 'Command timeout',
                    code: -1
                });
            }, TEST_CONFIG.timeout);
        });
    }

    /**
     * Test 1: Basic camera detection
     */
    async testCameraDetection() {
        this.log('🔍 Testing camera detection...');

        const result = await this.runSSHCommand('cd /home/remote/MonsterBox && python3 scripts/webcam_detect.py');

        if (result.success && result.output.includes('"success": true')) {
            try {
                const jsonMatch = result.output.match(/\{[\s\S]*\}/);
                if (jsonMatch) {
                    const detectionResult = JSON.parse(jsonMatch[0]);
                    if (detectionResult.cameras && detectionResult.cameras.length > 0) {
                        this.log(`✅ Camera detection successful: Found ${detectionResult.cameras.length} camera(s)`);
                        return { success: true, cameras: detectionResult.cameras };
                    }
                }
            } catch (parseError) {
                this.log(`❌ Failed to parse detection result: ${parseError.message}`);
            }
        }

        this.log(`❌ Camera detection failed: ${result.error || 'No cameras found'}`);
        return { success: false, error: result.error };
    }

    /**
     * Test 2: Basic camera functionality
     */
    async testCameraFunctionality() {
        this.log('📷 Testing basic camera functionality...');

        const testScript = `
import cv2
import sys
try:
    cap = cv2.VideoCapture(0, cv2.CAP_V4L2)
    if cap.isOpened():
        ret, frame = cap.read()
        cap.release()
        if ret and frame is not None:
            print("CAMERA_OK")
        else:
            print("CAMERA_FAIL_READ")
    else:
        print("CAMERA_FAIL_OPEN")
except Exception as e:
    print(f"CAMERA_ERROR: {e}")
`;

        const result = await this.runSSHCommand(`cd /home/remote/MonsterBox && echo '${testScript}' > test_camera_basic.py && python3 test_camera_basic.py`);

        if (result.success && result.output.includes('CAMERA_OK')) {
            this.log('✅ Basic camera functionality test passed');
            return { success: true };
        }

        this.log(`❌ Basic camera functionality test failed: ${result.output || result.error}`);
        return { success: false, error: result.output || result.error };
    }

    /**
     * Test 3: Webcam streaming script
     */
    async testWebcamStreaming() {
        this.log('🎥 Testing webcam streaming script...');

        const result = await this.runSSHCommand('cd /home/remote/MonsterBox && timeout 5 python3 scripts/webcam_test_stream.py --device-id 0 --width 640 --height 480 --fps 15 --duration 3');

        if (result.success || result.output.includes('Starting test stream')) {
            this.log('✅ Webcam streaming script test passed');
            return { success: true };
        }

        this.log(`❌ Webcam streaming script test failed: ${result.error || 'Stream failed to start'}`);
        return { success: false, error: result.error };
    }

    /**
     * Test 4: WebSocket webcam service
     */
    async testWebSocketWebcamService() {
        this.log('🔄 Testing WebSocket webcam service...');

        // Test WebSocket connection to webcam service
        const result = await this.runSSHCommand('cd /home/remote/MonsterBox && timeout 5 node -e "const WebSocket = require(\'ws\'); const ws = new WebSocket(\'ws://localhost:8774\'); ws.on(\'open\', () => { console.log(\'WebSocket webcam service available\'); process.exit(0); }); ws.on(\'error\', () => process.exit(1));"');

        if (result.success || result.output.includes('WebSocket webcam service available')) {
            this.log('✅ WebSocket webcam service test passed');
            return { success: true };
        }

        this.log(`❌ WebSocket webcam service test failed: ${result.error || 'WebSocket service not available'}`);
        return { success: false, error: result.error };
    }

    /**
     * Test 5: MonsterBox server startup
     */
    async testServerStartup() {
        this.log('🚀 Testing MonsterBox server startup...');

        // Kill any existing server processes
        await this.runSSHCommand('pkill -f "node app.js"');

        // Start server in background
        const startResult = await this.runSSHCommand('cd /home/remote/MonsterBox && nohup node app.js > test_server.log 2>&1 & sleep 3 && echo "SERVER_STARTED"');

        if (startResult.success && startResult.output.includes('SERVER_STARTED')) {
            // Test if server is responding
            const testResult = await this.runSSHCommand('curl -s http://localhost:3000/health || echo "SERVER_NOT_RESPONDING"');

            if (testResult.success && !testResult.output.includes('SERVER_NOT_RESPONDING')) {
                this.log('✅ MonsterBox server startup test passed');
                return { success: true };
            }
        }

        this.log(`❌ MonsterBox server startup test failed`);
        return { success: false, error: 'Server failed to start or respond' };
    }

    /**
     * Run all tests
     */
    async runAllTests() {
        this.log('🎭 Starting comprehensive webcam system tests...');
        this.log(`Testing on RPI: ${TEST_CONFIG.rpiHost}`);

        const tests = [
            { name: 'Camera Detection', test: () => this.testCameraDetection() },
            { name: 'Camera Functionality', test: () => this.testCameraFunctionality() },
            { name: 'Webcam Streaming', test: () => this.testWebcamStreaming() },
            { name: 'WebSocket Webcam Service', test: () => this.testWebSocketWebcamService() },
            { name: 'Server Startup', test: () => this.testServerStartup() }
        ];

        this.totalTests = tests.length;
        let passedTests = 0;

        for (const testCase of tests) {
            this.currentTest++;
            this.log(`\n📋 Running test ${this.currentTest}/${this.totalTests}: ${testCase.name}`);

            try {
                const result = await testCase.test();
                this.testResults.push({
                    name: testCase.name,
                    success: result.success,
                    error: result.error || null
                });

                if (result.success) {
                    passedTests++;
                }
            } catch (error) {
                this.log(`❌ Test ${testCase.name} threw an exception: ${error.message}`);
                this.testResults.push({
                    name: testCase.name,
                    success: false,
                    error: error.message
                });
            }
        }

        // Print summary
        this.log('\n📊 TEST SUMMARY');
        this.log('='.repeat(50));
        this.log(`Total tests: ${this.totalTests}`);
        this.log(`Passed: ${passedTests}`);
        this.log(`Failed: ${this.totalTests - passedTests}`);
        this.log(`Success rate: ${Math.round((passedTests / this.totalTests) * 100)}%`);

        this.log('\n📋 DETAILED RESULTS:');
        this.testResults.forEach((result, index) => {
            const status = result.success ? '✅' : '❌';
            this.log(`${status} ${index + 1}. ${result.name}`);
            if (!result.success && result.error) {
                this.log(`   Error: ${result.error}`);
            }
        });

        // Cleanup
        await this.runSSHCommand('pkill -f "node app.js"');
        await this.runSSHCommand('cd /home/remote/MonsterBox && rm -f test_camera_basic.py test_server.log');

        return {
            totalTests: this.totalTests,
            passedTests: passedTests,
            failedTests: this.totalTests - passedTests,
            successRate: Math.round((passedTests / this.totalTests) * 100),
            results: this.testResults
        };
    }
}

// Run tests if this file is executed directly
if (require.main === module) {
    const tester = new WebcamSystemTester();
    tester.runAllTests()
        .then((summary) => {
            console.log('\n🎉 Testing completed!');
            process.exit(summary.failedTests === 0 ? 0 : 1);
        })
        .catch((error) => {
            console.error('❌ Testing failed with error:', error);
            process.exit(1);
        });
}

module.exports = WebcamSystemTester;
