const { expect } = require('chai');
const WebSocket = require('ws');
const fs = require('fs').promises;
const path = require('path');

describe('Head Tracking Hardware Integration', function() {
    this.timeout(60000); // 60 second timeout for hardware tests
    
    let testWebSocket;
    const HEAD_TRACKING_PORT = 8778;
    const TEST_CHARACTER_ID = '4'; // Skulltalker character
    
    before(async function() {
        console.log('🎯 Testing Head Tracking Hardware Integration...');
        console.log('⚠️  This test requires actual hardware (webcam, servo) to be connected');
        
        // Check if head tracking service is running
        try {
            testWebSocket = new WebSocket(`ws://localhost:${HEAD_TRACKING_PORT}`);
            
            await new Promise((resolve, reject) => {
                const timeout = setTimeout(() => {
                    reject(new Error('Head tracking service not available. Please start hardware services first.'));
                }, 5000);
                
                testWebSocket.on('open', () => {
                    clearTimeout(timeout);
                    resolve();
                });
                
                testWebSocket.on('error', (error) => {
                    clearTimeout(timeout);
                    reject(new Error('Head tracking service not available. Please start hardware services first.'));
                });
            });
        } catch (error) {
            throw new Error('Head tracking service not available. Please run: npm start');
        }
    });
    
    after(function() {
        if (testWebSocket && testWebSocket.readyState === WebSocket.OPEN) {
            testWebSocket.close();
        }
    });
    
    describe('Hardware Detection', function() {
        it('should detect available webcam devices', async function() {
            // Test different webcam devices
            const webcamDevices = ['/dev/video0', '/dev/video1', '/dev/video2'];
            let workingDevice = null;
            
            for (const device of webcamDevices) {
                try {
                    const configMessage = {
                        type: 'configure_tracking',
                        character_id: TEST_CHARACTER_ID,
                        config: {
                            webcam_device: device,
                            webcam_width: 640,
                            webcam_height: 480,
                            webcam_fps: 15
                        }
                    };
                    
                    const response = await sendMessageAndWaitForResponse(testWebSocket, configMessage, 'tracking_configured', 3000);
                    if (response.status === 'success') {
                        workingDevice = device;
                        console.log(`✅ Found working webcam: ${device}`);
                        break;
                    }
                } catch (error) {
                    console.log(`❌ Webcam ${device} not available`);
                }
            }
            
            expect(workingDevice).to.not.be.null;
        });
        
        it('should test servo hardware connection', async function() {
            // Configure with a known servo
            const configMessage = {
                type: 'configure_tracking',
                character_id: TEST_CHARACTER_ID,
                config: {
                    servo_id: 'head_servo',
                    servo_min_angle: 0,
                    servo_max_angle: 180,
                    servo_center_angle: 90
                }
            };
            
            await sendMessageAndWaitForResponse(testWebSocket, configMessage, 'tracking_configured');
            
            // Test servo movement
            const testAngles = [45, 90, 135, 90]; // Test sequence
            
            for (const angle of testAngles) {
                const testServoMessage = {
                    type: 'test_servo',
                    character_id: TEST_CHARACTER_ID,
                    servo_id: 'head_servo',
                    angle: angle
                };
                
                const response = await sendMessageAndWaitForResponse(testServoMessage, 'servo_test_result');
                console.log(`Servo test at ${angle}°: ${response.success ? 'Success' : 'Failed'}`);
                
                // Wait between movements
                await new Promise(resolve => setTimeout(resolve, 1000));
            }
        });
    });
    
    describe('Real-time Tracking', function() {
        beforeEach(async function() {
            // Configure tracking with optimal settings
            const configMessage = {
                type: 'configure_tracking',
                character_id: TEST_CHARACTER_ID,
                config: {
                    webcam_device: '/dev/video0',
                    webcam_width: 640,
                    webcam_height: 480,
                    webcam_fps: 15,
                    motion_threshold: 25,
                    min_contour_area: 500,
                    max_contour_area: 50000,
                    tracking_sensitivity: 1.0,
                    tracking_smoothing: 0.3,
                    tracking_deadzone: 5.0,
                    servo_id: 'head_servo'
                }
            };
            
            await sendMessageAndWaitForResponse(testWebSocket, configMessage, 'tracking_configured');
        });
        
        it('should start tracking and provide real-time updates', async function() {
            console.log('👋 Please move in front of the camera for this test...');
            
            // Start tracking
            const startMessage = {
                type: 'start_tracking',
                character_id: TEST_CHARACTER_ID
            };
            
            const startResponse = await sendMessageAndWaitForResponse(testWebSocket, startMessage, 'tracking_started');
            expect(startResponse.status).to.equal('success');
            
            // Collect status updates for 10 seconds
            const statusUpdates = [];
            const updatePromise = new Promise((resolve) => {
                const messageHandler = (data) => {
                    try {
                        const message = JSON.parse(data);
                        if (message.type === 'tracking_status_update') {
                            statusUpdates.push(message.status);
                            console.log(`Frame ${message.status.frame_count}: FPS=${message.status.fps?.toFixed(1)}, Target=${message.status.target_detected ? 'Yes' : 'No'}`);
                        }
                    } catch (error) {
                        // Ignore parsing errors
                    }
                };
                
                testWebSocket.on('message', messageHandler);
                
                setTimeout(() => {
                    testWebSocket.removeListener('message', messageHandler);
                    resolve();
                }, 10000);
            });
            
            await updatePromise;
            
            // Stop tracking
            const stopMessage = {
                type: 'stop_tracking',
                character_id: TEST_CHARACTER_ID
            };
            await sendMessageAndWaitForResponse(testWebSocket, stopMessage, 'tracking_stopped');
            
            // Verify we received status updates
            expect(statusUpdates.length).to.be.greaterThan(0);
            
            // Check if any frames detected motion
            const framesWithMotion = statusUpdates.filter(status => status.target_detected);
            console.log(`📊 Frames with motion detected: ${framesWithMotion.length}/${statusUpdates.length}`);
            
            // Verify tracking system is working
            expect(statusUpdates[0]).to.have.property('active');
            expect(statusUpdates[0]).to.have.property('frame_count');
            expect(statusUpdates[0]).to.have.property('fps');
        });
        
        it('should track movement and adjust servo accordingly', async function() {
            console.log('👋 Please move left and right in front of the camera...');
            
            // Start tracking
            const startMessage = {
                type: 'start_tracking',
                character_id: TEST_CHARACTER_ID
            };
            
            await sendMessageAndWaitForResponse(testWebSocket, startMessage, 'tracking_started');
            
            // Collect servo angle changes for 15 seconds
            const servoAngles = [];
            const trackingPromise = new Promise((resolve) => {
                const messageHandler = (data) => {
                    try {
                        const message = JSON.parse(data);
                        if (message.type === 'tracking_status_update' && message.status.target_detected) {
                            servoAngles.push({
                                angle: message.status.servo_angle,
                                position: message.status.target_position,
                                timestamp: Date.now()
                            });
                            
                            console.log(`Target at ${message.status.target_position[0].toFixed(1)}%, Servo: ${message.status.servo_angle.toFixed(1)}°`);
                        }
                    } catch (error) {
                        // Ignore parsing errors
                    }
                };
                
                testWebSocket.on('message', messageHandler);
                
                setTimeout(() => {
                    testWebSocket.removeListener('message', messageHandler);
                    resolve();
                }, 15000);
            });
            
            await trackingPromise;
            
            // Stop tracking
            const stopMessage = {
                type: 'stop_tracking',
                character_id: TEST_CHARACTER_ID
            };
            await sendMessageAndWaitForResponse(testWebSocket, stopMessage, 'tracking_stopped');
            
            // Analyze servo movement
            if (servoAngles.length > 0) {
                const minAngle = Math.min(...servoAngles.map(s => s.angle));
                const maxAngle = Math.max(...servoAngles.map(s => s.angle));
                const angleRange = maxAngle - minAngle;
                
                console.log(`📊 Servo angle range: ${minAngle.toFixed(1)}° to ${maxAngle.toFixed(1)}° (range: ${angleRange.toFixed(1)}°)`);
                
                // Verify servo is responding to movement
                expect(angleRange).to.be.greaterThan(5); // At least 5 degrees of movement
            } else {
                console.log('⚠️  No motion detected during test period');
            }
        });
    });
    
    describe('Performance Testing', function() {
        it('should maintain stable frame rate under load', async function() {
            // Configure for higher performance
            const configMessage = {
                type: 'configure_tracking',
                character_id: TEST_CHARACTER_ID,
                config: {
                    webcam_device: '/dev/video0',
                    webcam_width: 640,
                    webcam_height: 480,
                    webcam_fps: 30, // Higher FPS
                    motion_threshold: 20,
                    tracking_sensitivity: 1.5
                }
            };
            
            await sendMessageAndWaitForResponse(testWebSocket, configMessage, 'tracking_configured');
            
            // Start tracking
            const startMessage = {
                type: 'start_tracking',
                character_id: TEST_CHARACTER_ID
            };
            
            await sendMessageAndWaitForResponse(testWebSocket, startMessage, 'tracking_started');
            
            // Monitor performance for 30 seconds
            const performanceData = [];
            const monitorPromise = new Promise((resolve) => {
                const messageHandler = (data) => {
                    try {
                        const message = JSON.parse(data);
                        if (message.type === 'tracking_status_update') {
                            performanceData.push({
                                fps: message.status.fps,
                                frame_count: message.status.frame_count,
                                timestamp: Date.now()
                            });
                        }
                    } catch (error) {
                        // Ignore parsing errors
                    }
                };
                
                testWebSocket.on('message', messageHandler);
                
                setTimeout(() => {
                    testWebSocket.removeListener('message', messageHandler);
                    resolve();
                }, 30000);
            });
            
            await monitorPromise;
            
            // Stop tracking
            const stopMessage = {
                type: 'stop_tracking',
                character_id: TEST_CHARACTER_ID
            };
            await sendMessageAndWaitForResponse(testWebSocket, stopMessage, 'tracking_stopped');
            
            // Analyze performance
            if (performanceData.length > 0) {
                const avgFps = performanceData.reduce((sum, data) => sum + (data.fps || 0), 0) / performanceData.length;
                const minFps = Math.min(...performanceData.map(data => data.fps || 0));
                const maxFps = Math.max(...performanceData.map(data => data.fps || 0));
                
                console.log(`📊 Performance: Avg FPS: ${avgFps.toFixed(1)}, Min: ${minFps.toFixed(1)}, Max: ${maxFps.toFixed(1)}`);
                
                // Verify acceptable performance
                expect(avgFps).to.be.greaterThan(10); // At least 10 FPS average
                expect(minFps).to.be.greaterThan(5);  // Never below 5 FPS
            }
        });
    });
    
    describe('Calibration and Configuration', function() {
        it('should calibrate servo to center position', async function() {
            const calibrateMessage = {
                type: 'calibrate_tracking',
                character_id: TEST_CHARACTER_ID
            };
            
            const response = await sendMessageAndWaitForResponse(testWebSocket, calibrateMessage, 'calibration_complete');
            expect(response.status).to.equal('success');
            expect(response.center_angle).to.be.a('number');
            
            console.log(`✅ Calibration complete. Center angle: ${response.center_angle}°`);
        });
        
        it('should handle configuration changes during tracking', async function() {
            // Start tracking with initial config
            const startMessage = {
                type: 'start_tracking',
                character_id: TEST_CHARACTER_ID
            };
            
            await sendMessageAndWaitForResponse(testWebSocket, startMessage, 'tracking_started');
            
            // Wait a moment for tracking to stabilize
            await new Promise(resolve => setTimeout(resolve, 2000));
            
            // Change configuration while tracking
            const newConfigMessage = {
                type: 'configure_tracking',
                character_id: TEST_CHARACTER_ID,
                config: {
                    tracking_sensitivity: 2.0, // Increase sensitivity
                    tracking_smoothing: 0.1    // Reduce smoothing
                }
            };
            
            const configResponse = await sendMessageAndWaitForResponse(testWebSocket, newConfigMessage, 'tracking_configured');
            expect(configResponse.status).to.equal('success');
            
            // Verify tracking continues with new config
            await new Promise(resolve => setTimeout(resolve, 2000));
            
            // Stop tracking
            const stopMessage = {
                type: 'stop_tracking',
                character_id: TEST_CHARACTER_ID
            };
            await sendMessageAndWaitForResponse(testWebSocket, stopMessage, 'tracking_stopped');
        });
    });
});

// Helper function
async function sendMessageAndWaitForResponse(ws, message, expectedType, timeout = 5000) {
    return new Promise((resolve, reject) => {
        const timeoutId = setTimeout(() => {
            reject(new Error(`Timeout waiting for response type: ${expectedType}`));
        }, timeout);
        
        const messageHandler = (data) => {
            try {
                const response = JSON.parse(data);
                if (response.type === expectedType) {
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
