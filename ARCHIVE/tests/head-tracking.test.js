const { expect } = require('chai');
const WebSocket = require('ws');
const fs = require('fs').promises;
const path = require('path');
const { spawn } = require('child_process');

describe('Head Tracking System', function () {
    this.timeout(30000); // 30 second timeout for hardware tests

    let headTrackingService;
    let testWebSocket;
    const HEAD_TRACKING_PORT = 8778;
    const TEST_CHARACTER_ID = '1';

    before(async function () {
        console.log('🎯 Starting Head Tracking Service for testing...');

        // Start the head tracking service
        headTrackingService = spawn('python3', [
            path.join(__dirname, '..', 'scripts', 'hardware', 'head_tracking_websocket_service.py')
        ], {
            cwd: path.join(__dirname, '..', 'scripts', 'hardware'),
            stdio: ['pipe', 'pipe', 'pipe']
        });

        // Wait for service to start
        await new Promise((resolve, reject) => {
            const timeout = setTimeout(() => {
                reject(new Error('Head tracking service failed to start within timeout'));
            }, 10000);

            headTrackingService.stdout.on('data', (data) => {
                const output = data.toString();
                console.log('Service output:', output);
                if (output.includes('head_tracking_service WebSocket Server running') || output.includes('8778')) {
                    clearTimeout(timeout);
                    resolve();
                }
            });

            headTrackingService.stderr.on('data', (data) => {
                const output = data.toString();
                console.log('Service stderr:', output);
                if (output.includes('head_tracking_service WebSocket Server running') || output.includes('8778')) {
                    clearTimeout(timeout);
                    resolve();
                }
            });


            headTrackingService.on('error', (error) => {
                clearTimeout(timeout);
                reject(error);
            });
        });

        // Give service additional time to fully initialize
        await new Promise(resolve => setTimeout(resolve, 2000));
    });

    after(async function () {
        console.log('🛑 Stopping Head Tracking Service...');

        if (testWebSocket) {
            testWebSocket.close();
        }

        if (headTrackingService) {
            headTrackingService.kill('SIGTERM');

            // Wait for graceful shutdown
            await new Promise((resolve) => {
                headTrackingService.on('exit', resolve);
                setTimeout(() => {
                    headTrackingService.kill('SIGKILL');
                    resolve();
                }, 5000);
            });
        }
    });

    beforeEach(async function () {
        // Create fresh WebSocket connection for each test
        testWebSocket = new WebSocket(`ws://localhost:${HEAD_TRACKING_PORT}`);

        await new Promise((resolve, reject) => {
            const timeout = setTimeout(() => {
                reject(new Error('WebSocket connection timeout'));
            }, 5000);

            testWebSocket.on('open', () => {
                clearTimeout(timeout);
                resolve();
            });

            testWebSocket.on('error', (error) => {
                clearTimeout(timeout);
                reject(error);
            });
        });
    });

    afterEach(function () {
        if (testWebSocket && testWebSocket.readyState === WebSocket.OPEN) {
            testWebSocket.close();
        }
    });

    describe('Service Connectivity', function () {
        it('should connect to head tracking WebSocket service', function () {
            expect(testWebSocket.readyState).to.equal(WebSocket.OPEN);
        });

        it('should respond to ping messages', async function () {
            const pingMessage = {
                type: 'ping',
                timestamp: Date.now()
            };

            const response = await sendMessageAndWaitForResponse(testWebSocket, pingMessage, 'pong');
            expect(response.type).to.equal('pong');
        });
    });

    describe('Configuration Management', function () {
        it('should accept tracking configuration', async function () {
            const configMessage = {
                type: 'configure_tracking',
                character_id: TEST_CHARACTER_ID,
                config: {
                    webcam_device: '/dev/video0',
                    webcam_width: 640,
                    webcam_height: 480,
                    webcam_fps: 15,
                    motion_threshold: 25,
                    tracking_sensitivity: 1.0,
                    servo_id: 'test_servo'
                }
            };

            const response = await sendMessageAndWaitForResponse(testWebSocket, configMessage, 'tracking_configured');
            expect(response.status).to.equal('success');
            expect(response.character_id).to.equal(TEST_CHARACTER_ID);
        });

        it('should return current configuration', async function () {
            const getConfigMessage = {
                type: 'get_tracking_config',
                character_id: TEST_CHARACTER_ID
            };

            const response = await sendMessageAndWaitForResponse(testWebSocket, getConfigMessage, 'tracking_config');
            expect(response.character_id).to.equal(TEST_CHARACTER_ID);
            expect(response.config).to.be.an('object');
        });
    });

    describe('Tracking Control', function () {
        beforeEach(async function () {
            // Configure tracking before each test
            const configMessage = {
                type: 'configure_tracking',
                character_id: TEST_CHARACTER_ID,
                config: {
                    webcam_device: '/dev/video0',
                    webcam_width: 640,
                    webcam_height: 480,
                    webcam_fps: 15,
                    motion_threshold: 25,
                    tracking_sensitivity: 1.0,
                    servo_id: 'test_servo'
                }
            };

            await sendMessageAndWaitForResponse(testWebSocket, configMessage, 'tracking_configured');
        });

        it('should start head tracking', async function () {
            const startMessage = {
                type: 'start_tracking',
                character_id: TEST_CHARACTER_ID
            };

            // Accept either success or error (camera may not be available in test environment)
            const response = await sendMessageAndWaitForResponse(testWebSocket, startMessage, ['tracking_started', 'error']);
            expect(response.type).to.be.oneOf(['tracking_started', 'error']);
            if (response.type === 'tracking_started') {
                expect(response.status).to.equal('success');
                expect(response.character_id).to.equal(TEST_CHARACTER_ID);
            } else {
                // Camera not available is acceptable in test environment
                expect(response.message).to.include('Failed to start tracking');
            }
        });

        it('should stop head tracking', async function () {
            // First try to start tracking (may fail due to no camera)
            const startMessage = {
                type: 'start_tracking',
                character_id: TEST_CHARACTER_ID
            };
            await sendMessageAndWaitForResponse(testWebSocket, startMessage, ['tracking_started', 'error']);

            // Then stop tracking (should always work)
            const stopMessage = {
                type: 'stop_tracking',
                character_id: TEST_CHARACTER_ID
            };

            const response = await sendMessageAndWaitForResponse(testWebSocket, stopMessage, 'tracking_stopped');
            expect(response.status).to.equal('success');
            expect(response.character_id).to.equal(TEST_CHARACTER_ID);
        });

        it('should provide tracking status updates', async function () {
            // Start tracking (may fail due to no camera)
            const startMessage = {
                type: 'start_tracking',
                character_id: TEST_CHARACTER_ID
            };
            const startResponse = await sendMessageAndWaitForResponse(testWebSocket, startMessage, ['tracking_started', 'error']);

            if (startResponse.type === 'tracking_started') {
                // Wait for status updates if tracking started successfully
                const statusUpdate = await waitForMessage(testWebSocket, 'tracking_status_update', 10000);
                expect(statusUpdate.character_id).to.equal(TEST_CHARACTER_ID);
                expect(statusUpdate.status).to.be.an('object');
                expect(statusUpdate.status).to.have.property('active');
                expect(statusUpdate.status).to.have.property('frame_count');
            } else {
                // If tracking failed to start, just verify we can get status
                const getStatusMessage = {
                    type: 'get_tracking_status',
                    character_id: TEST_CHARACTER_ID
                };
                const statusResponse = await sendMessageAndWaitForResponse(testWebSocket, getStatusMessage, 'tracking_status');
                expect(statusResponse.character_id).to.equal(TEST_CHARACTER_ID);
                expect(statusResponse.status).to.be.an('object');
            }
        });
    });

    describe('Servo Control', function () {
        it('should test servo movement', async function () {
            const testServoMessage = {
                type: 'test_servo',
                character_id: TEST_CHARACTER_ID,
                servo_id: 'test_servo',
                angle: 90
            };

            const response = await sendMessageAndWaitForResponse(testWebSocket, testServoMessage, 'servo_test_result');
            expect(response.character_id).to.equal(TEST_CHARACTER_ID);
            expect(response.servo_id).to.equal('test_servo');
            expect(response.angle).to.equal(90);
            // Note: success may be false if no actual servo hardware is connected
        });

        it('should calibrate tracking system', async function () {
            const calibrateMessage = {
                type: 'calibrate_tracking',
                character_id: TEST_CHARACTER_ID
            };

            const response = await sendMessageAndWaitForResponse(testWebSocket, calibrateMessage, 'calibration_complete');
            expect(response.status).to.equal('success');
            expect(response.character_id).to.equal(TEST_CHARACTER_ID);
        });
    });

    describe('Error Handling', function () {
        it('should handle invalid message types', async function () {
            const invalidMessage = {
                type: 'invalid_message_type',
                character_id: TEST_CHARACTER_ID
            };

            const response = await sendMessageAndWaitForResponse(testWebSocket, invalidMessage, 'error');
            expect(response.type).to.equal('error');
            expect(response.message).to.include('Unknown message type');
        });

        it('should handle missing character_id', async function () {
            const invalidMessage = {
                type: 'start_tracking'
                // Missing character_id
            };

            const response = await sendMessageAndWaitForResponse(testWebSocket, invalidMessage, 'error');
            expect(response.type).to.equal('error');
            expect(response.message).to.include('character_id is required');
        });
    });

    describe('Hardware Integration', function () {
        it('should handle missing webcam gracefully', async function () {
            const configMessage = {
                type: 'configure_tracking',
                character_id: TEST_CHARACTER_ID,
                config: {
                    webcam_device: '/dev/video99', // Non-existent device
                    webcam_width: 640,
                    webcam_height: 480,
                    webcam_fps: 15
                }
            };

            await sendMessageAndWaitForResponse(testWebSocket, configMessage, 'tracking_configured');

            const startMessage = {
                type: 'start_tracking',
                character_id: TEST_CHARACTER_ID
            };

            // Should handle gracefully even if webcam doesn't exist
            const response = await sendMessageAndWaitForResponse(testWebSocket, startMessage, ['tracking_started', 'error']);
            expect(response.type).to.be.oneOf(['tracking_started', 'error']);
        });
    });
});

// Helper functions
async function sendMessageAndWaitForResponse(ws, message, expectedType, timeout = 5000) {
    return new Promise((resolve, reject) => {
        const timeoutId = setTimeout(() => {
            reject(new Error(`Timeout waiting for response type: ${expectedType}`));
        }, timeout);

        const messageHandler = (data) => {
            try {
                const response = JSON.parse(data);
                const expectedTypes = Array.isArray(expectedType) ? expectedType : [expectedType];

                if (expectedTypes.includes(response.type)) {
                    clearTimeout(timeoutId);
                    ws.removeListener('message', messageHandler);
                    resolve(response);
                }
            } catch (error) {
                // Ignore parsing errors for other messages
            }
        };

        ws.on('message', messageHandler);
        ws.send(JSON.stringify(message));
    });
}

async function waitForMessage(ws, expectedType, timeout = 5000) {
    return new Promise((resolve, reject) => {
        const timeoutId = setTimeout(() => {
            reject(new Error(`Timeout waiting for message type: ${expectedType}`));
        }, timeout);

        const messageHandler = (data) => {
            try {
                const message = JSON.parse(data);
                if (message.type === expectedType) {
                    clearTimeout(timeoutId);
                    ws.removeListener('message', messageHandler);
                    resolve(message);
                }
            } catch (error) {
                // Ignore parsing errors for other messages
            }
        };

        ws.on('message', messageHandler);
    });
}
