const { test, expect } = require('@playwright/test');
const { spawn } = require('child_process');
const WebSocket = require('ws');
const path = require('path');

/**
 * Comprehensive ChatterPi Jaw Animation Test Suite
 * Tests servo stillness, audio sync, full range movement, and service lifecycle
 */

describe('ChatterPi Jaw Animation System', () => {
    let jawService;
    let servicePort = 8765;
    let serviceUrl = `ws://127.0.0.1:${servicePort}`;

    before(async function() {
        this.timeout(10000);
        console.log('🚀 Starting unified jaw animation service for testing...');
        
        // Start the unified jaw animation service
        jawService = spawn('python3', [
            path.join(__dirname, '../scripts/chatterpi/unified_jaw_animation_service.py'),
            '--port', servicePort.toString(),
            '--host', '0.0.0.0'
        ], {
            stdio: 'pipe'
        });

        // Wait for service to start
        await new Promise((resolve, reject) => {
            const timeout = setTimeout(() => {
                reject(new Error('Service startup timeout'));
            }, 8000);

            const checkService = async () => {
                try {
                    const ws = new WebSocket(serviceUrl);
                    ws.on('open', () => {
                        ws.close();
                        clearTimeout(timeout);
                        resolve();
                    });
                    ws.on('error', () => {
                        setTimeout(checkService, 500);
                    });
                } catch (error) {
                    setTimeout(checkService, 500);
                }
            };

            checkService();
        });

        console.log('✅ Unified jaw animation service started');
    });

    after(async function() {
        if (jawService) {
            jawService.kill();
            console.log('🛑 Unified jaw animation service stopped');
        }
    });

    describe('Service Lifecycle', () => {
        it('should start and be accessible on port 8765', async () => {
            const ws = new WebSocket(serviceUrl);
            
            await new Promise((resolve, reject) => {
                ws.on('open', resolve);
                ws.on('error', reject);
                setTimeout(() => reject(new Error('Connection timeout')), 5000);
            });

            expect(ws.readyState).toBe(WebSocket.OPEN);
            ws.close();
        });

        it('should handle multiple client connections', async () => {
            const clients = [];
            
            for (let i = 0; i < 3; i++) {
                const ws = new WebSocket(serviceUrl);
                await new Promise((resolve, reject) => {
                    ws.on('open', resolve);
                    ws.on('error', reject);
                    setTimeout(() => reject(new Error('Connection timeout')), 5000);
                });
                clients.push(ws);
            }

            expect(clients.length).toBe(3);
            clients.forEach(client => {
                expect(client.readyState).toBe(WebSocket.OPEN);
                client.close();
            });
        });
    });

    describe('Servo Control', () => {
        let ws;

        beforeEach(async () => {
            ws = new WebSocket(serviceUrl);
            await new Promise((resolve, reject) => {
                ws.on('open', resolve);
                ws.on('error', reject);
                setTimeout(() => reject(new Error('Connection timeout')), 5000);
            });
        });

        afterEach(() => {
            if (ws) ws.close();
        });

        it('should move servo to specific angles', async () => {
            const testAngles = [50.0, 30.0, 40.0];
            const responses = [];

            ws.on('message', (data) => {
                const message = JSON.parse(data.toString());
                if (message.type === 'jaw_move_response') {
                    responses.push(message);
                }
            });

            for (const angle of testAngles) {
                ws.send(JSON.stringify({
                    type: 'jaw_move',
                    angle: angle
                }));
                
                // Wait for response
                await new Promise(resolve => setTimeout(resolve, 1000));
            }

            expect(responses.length).toBe(testAngles.length);
            responses.forEach((response, index) => {
                expect(response.angle).toBe(testAngles[index]);
                expect(response.success).toBe(true);
            });
        });

        it('should use full range (30°-50°)', async () => {
            const responses = [];

            ws.on('message', (data) => {
                const message = JSON.parse(data.toString());
                if (message.type === 'jaw_move_response') {
                    responses.push(message.angle);
                }
            });

            // Test extreme positions
            ws.send(JSON.stringify({ type: 'jaw_move', angle: 50.0 })); // Closed
            await new Promise(resolve => setTimeout(resolve, 500));

            ws.send(JSON.stringify({ type: 'jaw_move', angle: 30.0 })); // Open
            await new Promise(resolve => setTimeout(resolve, 500));

            const minAngle = Math.min(...responses);
            const maxAngle = Math.max(...responses);
            const range = maxAngle - minAngle;

            expect(minAngle).toBeLessThanOrEqual(30.5);
            expect(maxAngle).toBeGreaterThanOrEqual(49.5);
            expect(range).toBeGreaterThanOrEqual(19); // Nearly full 20° range
        });
    });

    describe('Audio Processing', () => {
        let ws;

        beforeEach(async () => {
            ws = new WebSocket(serviceUrl);
            await new Promise((resolve, reject) => {
                ws.on('open', resolve);
                ws.on('error', reject);
                setTimeout(() => reject(new Error('Connection timeout')), 5000);
            });
        });

        afterEach(() => {
            if (ws) ws.close();
        });

        it('should detect silence correctly', async () => {
            const audioResponses = [];

            ws.on('message', (data) => {
                const message = JSON.parse(data.toString());
                if (message.type === 'audio_processed') {
                    audioResponses.push(message);
                }
            });

            // Start animation
            ws.send(JSON.stringify({ type: 'start_animation' }));
            await new Promise(resolve => setTimeout(resolve, 100));

            // Send silence
            for (let i = 0; i < 5; i++) {
                const silenceBuffer = Buffer.alloc(1024, 0);
                ws.send(JSON.stringify({
                    type: 'audio_data',
                    data: silenceBuffer.toString('base64')
                }));
                await new Promise(resolve => setTimeout(resolve, 100));
            }

            // Wait for processing
            await new Promise(resolve => setTimeout(resolve, 1000));

            const silenceResponses = audioResponses.filter(r => r.raw_amplitude === 0);
            expect(silenceResponses.length).toBeGreaterThan(0);
            
            // After silence timeout, voice should be inactive
            const recentResponses = audioResponses.slice(-3);
            const inactiveResponses = recentResponses.filter(r => !r.voice_active);
            expect(inactiveResponses.length).toBeGreaterThan(0);
        });

        it('should respond to audio amplitude', async () => {
            const audioResponses = [];

            ws.on('message', (data) => {
                const message = JSON.parse(data.toString());
                if (message.type === 'audio_processed') {
                    audioResponses.push(message);
                }
            });

            // Start animation
            ws.send(JSON.stringify({ type: 'start_animation' }));
            await new Promise(resolve => setTimeout(resolve, 100));

            // Send medium amplitude audio
            for (let i = 0; i < 5; i++) {
                const audioBuffer = Buffer.alloc(1024);
                for (let j = 0; j < audioBuffer.length; j += 2) {
                    const sample = Math.sin(j * 0.01) * 15000; // Medium amplitude
                    audioBuffer.writeInt16LE(sample, j);
                }
                
                ws.send(JSON.stringify({
                    type: 'audio_data',
                    data: audioBuffer.toString('base64')
                }));
                await new Promise(resolve => setTimeout(resolve, 100));
            }

            // Wait for processing
            await new Promise(resolve => setTimeout(resolve, 500));

            const audioActiveResponses = audioResponses.filter(r => r.voice_active);
            expect(audioActiveResponses.length).toBeGreaterThan(0);
            
            // Should target jaw opening (angle < 50)
            const openingResponses = audioActiveResponses.filter(r => r.target_angle < 45);
            expect(openingResponses.length).toBeGreaterThan(0);
        });
    });

    describe('Servo Stillness', () => {
        let ws;

        beforeEach(async () => {
            ws = new WebSocket(serviceUrl);
            await new Promise((resolve, reject) => {
                ws.on('open', resolve);
                ws.on('error', reject);
                setTimeout(() => reject(new Error('Connection timeout')), 5000);
            });
        });

        afterEach(() => {
            if (ws) ws.close();
        });

        it('should remain still during extended silence', async () => {
            const servoMovements = [];
            let lastAngle = null;

            ws.on('message', (data) => {
                const message = JSON.parse(data.toString());
                if (message.type === 'jaw_move_response') {
                    if (lastAngle !== null && Math.abs(message.angle - lastAngle) > 0.1) {
                        servoMovements.push({
                            from: lastAngle,
                            to: message.angle,
                            timestamp: Date.now()
                        });
                    }
                    lastAngle = message.angle;
                }
            });

            // Set initial position
            ws.send(JSON.stringify({ type: 'jaw_move', angle: 50.0 }));
            await new Promise(resolve => setTimeout(resolve, 1000));

            // Start animation and send extended silence
            ws.send(JSON.stringify({ type: 'start_animation' }));
            
            const silenceStartTime = Date.now();
            for (let i = 0; i < 50; i++) { // 5 seconds of silence
                const silenceBuffer = Buffer.alloc(1024, 0);
                ws.send(JSON.stringify({
                    type: 'audio_data',
                    data: silenceBuffer.toString('base64')
                }));
                await new Promise(resolve => setTimeout(resolve, 100));
            }

            const silenceDuration = (Date.now() - silenceStartTime) / 1000;
            
            // Should have minimal or no servo movements during silence
            expect(servoMovements.length).toBeLessThanOrEqual(2); // Allow for settling
            expect(silenceDuration).toBeGreaterThan(4); // Verify test duration
        });
    });
});
