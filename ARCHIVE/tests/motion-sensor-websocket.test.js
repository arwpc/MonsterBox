const WebSocket = require('ws');
const { expect } = require('chai');
const { spawn } = require('child_process');
const path = require('path');

describe('Motion Sensor WebSocket Service', function () {
    this.timeout(30000); // 30 second timeout for WebSocket tests

    let motionSensorService;
    let ws;
    const MOTION_SENSOR_PORT = 8777;
    const MOTION_SENSOR_URL = `ws://localhost:${MOTION_SENSOR_PORT}`;

    before(async function () {
        // Start the motion sensor WebSocket service
        console.log('🔍 Starting Motion Sensor WebSocket Service...');

        const servicePath = path.join(__dirname, '..', 'scripts', 'hardware', 'motion_sensor_websocket_service.py');
        motionSensorService = spawn('python3', [servicePath], {
            stdio: ['pipe', 'pipe', 'pipe']
        });

        motionSensorService.stdout.on('data', (data) => {
            console.log(`Motion Sensor Service: ${data.toString().trim()}`);
        });

        motionSensorService.stderr.on('data', (data) => {
            console.error(`Motion Sensor Service Error: ${data.toString().trim()}`);
        });

        // Wait for service to start
        await new Promise(resolve => setTimeout(resolve, 3000));
    });

    after(async function () {
        console.log('🧹 Cleaning up Motion Sensor WebSocket test...');

        // Clean up WebSocket connection
        if (ws) {
            if (ws.readyState === WebSocket.OPEN) {
                ws.close();
            }
            ws = null;
        }

        // Stop the motion sensor service with proper cleanup
        if (motionSensorService && !motionSensorService.killed) {
            console.log('🛑 Stopping motion sensor service...');
            motionSensorService.kill('SIGTERM');

            // Wait for process to exit gracefully
            await new Promise((resolve) => {
                const timeout = setTimeout(() => {
                    if (!motionSensorService.killed) {
                        console.log('⚠️ Force killing motion sensor service...');
                        motionSensorService.kill('SIGKILL');
                    }
                    resolve();
                }, 3000);

                motionSensorService.on('exit', () => {
                    clearTimeout(timeout);
                    console.log('✅ Motion sensor service stopped');
                    resolve();
                });
            });
        }

        console.log('✅ Motion Sensor WebSocket test cleanup complete');
    });

    beforeEach(async function () {
        // Skip connection if service is not running
        if (!motionSensorService || motionSensorService.killed) {
            this.skip();
            return;
        }

        // Create fresh WebSocket connection for each test
        ws = new WebSocket(MOTION_SENSOR_URL);

        return new Promise((resolve, reject) => {
            const timeout = setTimeout(() => {
                if (ws) {
                    ws.close();
                    ws = null;
                }
                reject(new Error('WebSocket connection timeout'));
            }, 5000);

            ws.on('open', () => {
                clearTimeout(timeout);
                resolve();
            });

            ws.on('error', (error) => {
                clearTimeout(timeout);
                if (ws) {
                    ws.close();
                    ws = null;
                }
                reject(error);
            });
        });
    });

    afterEach(function () {
        // Clean up WebSocket connection after each test
        if (ws) {
            if (ws.readyState === WebSocket.OPEN) {
                ws.close();
            }
            ws = null;
        }
    });

    describe('Connection and Basic Communication', function () {
        it('should connect to motion sensor WebSocket service', function (done) {
            expect(ws.readyState).to.equal(WebSocket.OPEN);
            done();
        });

        it('should receive welcome message', function (done) {
            const timeout = setTimeout(() => {
                done(new Error('Welcome message timeout'));
            }, 5000);

            ws.on('message', (data) => {
                try {
                    clearTimeout(timeout);
                    const message = JSON.parse(data.toString());
                    expect(message).to.have.property('type');
                    expect(message).to.have.property('service');
                    expect(message.service).to.include('motion_sensor');
                    done();
                } catch (error) {
                    clearTimeout(timeout);
                    done(error);
                }
            });
        });

        it('should handle invalid message gracefully', function (done) {
            ws.send('invalid json');

            ws.on('message', (data) => {
                try {
                    const message = JSON.parse(data.toString());
                    if (message.type === 'error') {
                        expect(message).to.have.property('message');
                        done();
                    }
                } catch (error) {
                    done(error);
                }
            });
        });
    });

    describe('Motion Sensor Commands', function () {
        it('should handle motion sensor test command', function (done) {
            const testCommand = {
                type: 'motion_sensor_test',
                sensor_id: 'test_sensor_1',
                pin: 26,
                duration: 1
            };

            ws.send(JSON.stringify(testCommand));

            ws.on('message', (data) => {
                try {
                    const message = JSON.parse(data.toString());
                    if (message.type === 'motion_sensor_test_response') {
                        expect(message).to.have.property('sensor_id', 'test_sensor_1');
                        expect(message).to.have.property('status');
                        expect(message).to.have.property('message');
                        done();
                    }
                } catch (error) {
                    done(error);
                }
            });
        });

        it('should handle motion sensor start monitoring command', function (done) {
            const startCommand = {
                type: 'motion_sensor_start',
                sensor_id: 'test_sensor_2',
                pin: 26,
                sensitivity: 0.1,
                duration: 2
            };

            ws.send(JSON.stringify(startCommand));

            ws.on('message', (data) => {
                try {
                    const message = JSON.parse(data.toString());
                    if (message.type === 'motion_sensor_start_response') {
                        expect(message).to.have.property('sensor_id', 'test_sensor_2');
                        expect(message).to.have.property('status');
                        expect(message).to.have.property('parameters');
                        expect(message.parameters).to.have.property('pin', 26);
                        expect(message.parameters).to.have.property('sensitivity', 0.1);
                        done();
                    }
                } catch (error) {
                    done(error);
                }
            });
        });

        it('should handle motion sensor stop monitoring command', function (done) {
            const stopCommand = {
                type: 'motion_sensor_stop',
                sensor_id: 'test_sensor_3'
            };

            ws.send(JSON.stringify(stopCommand));

            ws.on('message', (data) => {
                try {
                    const message = JSON.parse(data.toString());
                    if (message.type === 'motion_sensor_stop_response') {
                        expect(message).to.have.property('sensor_id', 'test_sensor_3');
                        expect(message).to.have.property('status');
                        done();
                    }
                } catch (error) {
                    done(error);
                }
            });
        });

        it('should handle motion sensor status request', function (done) {
            const statusCommand = {
                type: 'motion_sensor_status',
                sensor_id: 'test_sensor_4'
            };

            ws.send(JSON.stringify(statusCommand));

            ws.on('message', (data) => {
                try {
                    const message = JSON.parse(data.toString());
                    if (message.type === 'motion_sensor_status_response') {
                        expect(message).to.have.property('sensor_id', 'test_sensor_4');
                        done();
                    }
                } catch (error) {
                    done(error);
                }
            });
        });

        it('should handle motion sensor configuration', function (done) {
            const configCommand = {
                type: 'configure_motion_sensor',
                sensor_id: 'test_sensor_5',
                config: {
                    pin: 26,
                    sensitivity: 0.2,
                    detectionRange: 10,
                    triggerDelay: 1000
                }
            };

            ws.send(JSON.stringify(configCommand));

            ws.on('message', (data) => {
                try {
                    const message = JSON.parse(data.toString());
                    if (message.type === 'configure_motion_sensor_response') {
                        expect(message).to.have.property('sensor_id', 'test_sensor_5');
                        expect(message).to.have.property('status', 'success');
                        expect(message).to.have.property('config');
                        done();
                    }
                } catch (error) {
                    done(error);
                }
            });
        });

        it('should get motion sensor configurations', function (done) {
            const getConfigsCommand = {
                type: 'get_motion_sensor_configs'
            };

            ws.send(JSON.stringify(getConfigsCommand));

            ws.on('message', (data) => {
                try {
                    const message = JSON.parse(data.toString());
                    if (message.type === 'motion_sensor_configs_response') {
                        expect(message).to.have.property('configs');
                        expect(message.configs).to.be.an('object');
                        done();
                    }
                } catch (error) {
                    done(error);
                }
            });
        });
    });

    describe('Error Handling', function () {
        it('should handle unknown command type', function (done) {
            const unknownCommand = {
                type: 'unknown_motion_sensor_command',
                sensor_id: 'test_sensor'
            };

            ws.send(JSON.stringify(unknownCommand));

            ws.on('message', (data) => {
                try {
                    const message = JSON.parse(data.toString());
                    if (message.type === 'error') {
                        expect(message).to.have.property('message');
                        expect(message.message).to.include('Unknown message type');
                        done();
                    }
                } catch (error) {
                    done(error);
                }
            });
        });

        it('should validate GPIO pin range', function (done) {
            const invalidPinCommand = {
                type: 'motion_sensor_start',
                sensor_id: 'test_sensor_invalid',
                pin: 50, // Invalid pin
                sensitivity: 0.1
            };

            ws.send(JSON.stringify(invalidPinCommand));

            ws.on('message', (data) => {
                try {
                    const message = JSON.parse(data.toString());
                    if (message.type === 'motion_sensor_start_response') {
                        expect(message).to.have.property('status', 'error');
                        expect(message.message).to.include('Pin must be between 0 and 27');
                        done();
                    }
                } catch (error) {
                    done(error);
                }
            });
        });

        it('should validate sensitivity range', function (done) {
            const invalidSensitivityCommand = {
                type: 'motion_sensor_start',
                sensor_id: 'test_sensor_invalid_sens',
                pin: 26,
                sensitivity: 0.01 // Too low
            };

            ws.send(JSON.stringify(invalidSensitivityCommand));

            ws.on('message', (data) => {
                try {
                    const message = JSON.parse(data.toString());
                    if (message.type === 'motion_sensor_start_response') {
                        expect(message).to.have.property('status', 'error');
                        expect(message.message).to.include('Sensitivity must be at least 0.05');
                        done();
                    }
                } catch (error) {
                    done(error);
                }
            });
        });
    });

    describe('Service Capabilities', function () {
        it('should provide service capabilities', function (done) {
            // This would require implementing a capabilities endpoint
            // For now, we'll test that the service responds to basic commands
            const statusCommand = {
                type: 'motion_sensor_status'
            };

            ws.send(JSON.stringify(statusCommand));

            ws.on('message', (data) => {
                try {
                    const message = JSON.parse(data.toString());
                    if (message.type === 'motion_sensor_status_response') {
                        expect(message).to.have.property('all_sensors');
                        expect(message).to.have.property('sensor_count');
                        done();
                    }
                } catch (error) {
                    done(error);
                }
            });
        });
    });
});
