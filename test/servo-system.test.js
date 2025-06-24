/**
 * Comprehensive tests for the unified servo system
 * Tests WebSocket communication, jaw animation, and hardware control
 */

const { expect } = require('chai');
const WebSocket = require('ws');
const { ServoWebSocketClient } = require('../services/servoWebSocketClient');
const { ImprovedJawController, JawAnimationIntegration } = require('../scripts/jaw-animation/improvedJawController');

describe('Unified Servo System Tests', function() {
    this.timeout(30000); // 30 second timeout for hardware tests
    
    let servoClient;
    let jawController;
    let jawIntegration;
    
    const SERVO_SERVICE_PORT = 8772;
    const SERVO_SERVICE_URL = `ws://localhost:${SERVO_SERVICE_PORT}`;
    const SKULLTALKER_SERVO_ID = '23';
    
    before(async function() {
        console.log('🧪 Setting up servo system tests...');
        
        // Wait for servo service to be available
        await waitForService(SERVO_SERVICE_PORT, 10000);
        
        // Initialize servo client
        servoClient = new ServoWebSocketClient({
            host: 'localhost',
            port: SERVO_SERVICE_PORT
        });
        
        // Wait for connection
        await new Promise((resolve, reject) => {
            const timeout = setTimeout(() => {
                reject(new Error('Servo client connection timeout'));
            }, 5000);
            
            if (servoClient.isConnected) {
                clearTimeout(timeout);
                resolve();
            } else {
                servoClient.once('connected', () => {
                    clearTimeout(timeout);
                    resolve();
                });
            }
        });
        
        console.log('✅ Servo client connected');
    });
    
    after(async function() {
        console.log('🧹 Cleaning up servo system tests...');
        
        if (jawIntegration) {
            await jawIntegration.stop();
        }
        
        if (jawController) {
            await jawController.stop();
        }
        
        if (servoClient) {
            servoClient.disconnect();
        }
        
        console.log('✅ Cleanup completed');
    });
    
    describe('WebSocket Communication', function() {
        it('should connect to servo WebSocket service', function() {
            expect(servoClient.isConnected).to.be.true;
        });
        
        it('should get servo configurations', async function() {
            const response = await servoClient.getServoConfigs();
            
            expect(response).to.have.property('status', 'success');
            expect(response).to.have.property('configs');
            expect(response.configs).to.be.an('object');
            
            console.log(`📊 Found ${Object.keys(response.configs).length} servo configurations`);
        });
        
        it('should get servo status', async function() {
            const response = await servoClient.getServoStatus();
            
            expect(response).to.have.property('status', 'success');
            expect(response).to.have.property('servos');
            expect(response.servos).to.be.an('object');
            
            console.log(`📈 Retrieved status for ${Object.keys(response.servos).length} servos`);
        });
        
        it('should get specific servo status', async function() {
            const response = await servoClient.getServoStatus(SKULLTALKER_SERVO_ID);
            
            expect(response).to.have.property('status', 'success');
            expect(response).to.have.property('servo');
            expect(response.servo).to.have.property('config');
            expect(response.servo).to.have.property('state');
            
            console.log(`🎯 Retrieved status for servo ${SKULLTALKER_SERVO_ID}`);
        });
    });
    
    describe('Servo Control', function() {
        it('should move servo to specific angle', async function() {
            const testAngle = 45;
            const response = await servoClient.moveServo(SKULLTALKER_SERVO_ID, testAngle, 0.5);
            
            expect(response).to.have.property('status', 'success');
            
            // Wait for movement to complete
            await new Promise(resolve => setTimeout(resolve, 600));
            
            console.log(`🦴 Moved servo to ${testAngle}°`);
        });
        
        it('should test servo with multiple angles', async function() {
            const testAngles = [30, 40, 50]; // ChatterPi range
            const response = await servoClient.testServo(SKULLTALKER_SERVO_ID, testAngles, 0.5);
            
            expect(response).to.have.property('status', 'success');
            expect(response).to.have.property('results');
            expect(response.results).to.be.an('array');
            expect(response.results).to.have.length(testAngles.length);
            
            console.log(`🧪 Tested servo with ${testAngles.length} angles`);
        });
        
        it('should stop servo PWM', async function() {
            const response = await servoClient.stopServo(SKULLTALKER_SERVO_ID);
            
            expect(response).to.have.property('status', 'success');
            
            console.log('🛑 Stopped servo PWM');
        });
    });
    
    describe('Jaw Animation', function() {
        it('should start jaw animation', async function() {
            const response = await servoClient.startJawAnimation(SKULLTALKER_SERVO_ID, 4);
            
            expect(response).to.have.property('status', 'success');
            
            console.log('🎬 Started jaw animation');
        });
        
        it('should update jaw animation with volume data', async function() {
            const testVolumes = [0.0, 0.1, 0.3, 0.5, 0.2, 0.0];
            
            for (const volume of testVolumes) {
                const response = await servoClient.updateJawAnimation(SKULLTALKER_SERVO_ID, volume);
                expect(response).to.have.property('status', 'success');
                
                // Small delay between updates
                await new Promise(resolve => setTimeout(resolve, 50));
            }
            
            console.log(`🎵 Updated jaw animation with ${testVolumes.length} volume samples`);
        });
        
        it('should stop jaw animation', async function() {
            const response = await servoClient.stopJawAnimation(SKULLTALKER_SERVO_ID);
            
            expect(response).to.have.property('status', 'success');
            
            console.log('🛑 Stopped jaw animation');
        });
    });
    
    describe('Improved Jaw Controller', function() {
        it('should initialize improved jaw controller', async function() {
            jawController = new ImprovedJawController({
                servoId: SKULLTALKER_SERVO_ID,
                closedAngle: 50,
                openAngle: 30,
                sensitivity: 2.0,
                volumeThreshold: 0.01
            });
            
            jawController.setServoClient(servoClient);
            
            expect(jawController).to.be.an('object');
            expect(jawController.options.servoId).to.equal(SKULLTALKER_SERVO_ID);
            
            console.log('🦷 Initialized improved jaw controller');
        });
        
        it('should start improved jaw animation', async function() {
            await jawController.start();
            
            expect(jawController.isRunning).to.be.true;
            
            console.log('🎬 Started improved jaw animation');
        });
        
        it('should process volume updates', async function() {
            const testVolumes = [0.0, 0.05, 0.1, 0.2, 0.3, 0.4, 0.2, 0.1, 0.0];
            
            for (const volume of testVolumes) {
                jawController.updateVolume(volume);
                
                // Allow processing time
                await new Promise(resolve => setTimeout(resolve, 100));
            }
            
            const stats = jawController.getStats();
            expect(stats.totalUpdates).to.be.greaterThan(0);
            
            console.log(`📊 Processed ${stats.totalUpdates} volume updates`);
        });
        
        it('should handle idle timeout', async function() {
            // Wait for idle timeout
            await new Promise(resolve => setTimeout(resolve, 2000));
            
            const stats = jawController.getStats();
            expect(stats.isIdle).to.be.true;
            
            console.log('😴 Jaw controller entered idle state');
        });
        
        it('should stop improved jaw animation', async function() {
            await jawController.stop();
            
            expect(jawController.isRunning).to.be.false;
            
            console.log('🛑 Stopped improved jaw animation');
        });
    });
    
    describe('Integration Tests', function() {
        it('should initialize jaw animation integration', async function() {
            jawIntegration = new JawAnimationIntegration();
            
            await jawIntegration.initialize({
                servoId: SKULLTALKER_SERVO_ID,
                sensitivity: 1.5,
                volumeThreshold: 0.02
            });
            
            expect(jawIntegration.jawController).to.be.an('object');
            expect(jawIntegration.servoClient).to.be.an('object');
            
            console.log('🔗 Initialized jaw animation integration');
        });
        
        it('should start integrated jaw animation', async function() {
            await jawIntegration.start(4);
            
            const stats = jawIntegration.getStats();
            expect(stats.isRunning).to.be.true;
            
            console.log('🎬 Started integrated jaw animation');
        });
        
        it('should simulate speech with volume updates', async function() {
            // Simulate speech pattern
            const speechPattern = [
                0.0, 0.1, 0.3, 0.2, 0.4, 0.3, 0.1, 0.0,  // Word 1
                0.0, 0.2, 0.5, 0.4, 0.3, 0.2, 0.0,        // Word 2
                0.0, 0.1, 0.2, 0.4, 0.3, 0.1, 0.0         // Word 3
            ];
            
            for (const volume of speechPattern) {
                jawIntegration.updateVolume(volume);
                await new Promise(resolve => setTimeout(resolve, 80));
            }
            
            const stats = jawIntegration.getStats();
            expect(stats.totalUpdates).to.be.greaterThan(speechPattern.length);
            
            console.log(`🗣️ Simulated speech with ${speechPattern.length} volume samples`);
        });
        
        it('should stop integrated jaw animation', async function() {
            await jawIntegration.stop();
            
            const stats = jawIntegration.getStats();
            expect(stats.isRunning).to.be.false;
            
            console.log('🛑 Stopped integrated jaw animation');
        });
    });
    
    describe('Performance Tests', function() {
        it('should handle high-frequency updates', async function() {
            const jawController = new ImprovedJawController({
                servoId: SKULLTALKER_SERVO_ID,
                updateRate: 100 // 100 Hz
            });
            
            jawController.setServoClient(servoClient);
            await jawController.start();
            
            const startTime = Date.now();
            const updateCount = 500;
            
            for (let i = 0; i < updateCount; i++) {
                const volume = Math.sin(i * 0.1) * 0.3 + 0.3; // Sine wave
                jawController.updateVolume(volume);
                await new Promise(resolve => setTimeout(resolve, 5)); // 200 Hz
            }
            
            const endTime = Date.now();
            const duration = endTime - startTime;
            const updatesPerSecond = (updateCount / duration) * 1000;
            
            await jawController.stop();
            
            expect(updatesPerSecond).to.be.greaterThan(50); // Should handle at least 50 Hz
            
            console.log(`⚡ Processed ${updatesPerSecond.toFixed(1)} updates/second`);
        });
    });
});

// Helper function to wait for service availability
async function waitForService(port, timeout = 10000) {
    const startTime = Date.now();
    
    while (Date.now() - startTime < timeout) {
        try {
            const ws = new WebSocket(`ws://localhost:${port}`);
            
            await new Promise((resolve, reject) => {
                const timer = setTimeout(() => {
                    ws.close();
                    reject(new Error('Connection timeout'));
                }, 1000);

                ws.on('open', () => {
                    clearTimeout(timer);
                    ws.close();
                    resolve();
                });

                ws.on('error', () => {
                    clearTimeout(timer);
                    reject(new Error('Connection failed'));
                });
            });

            // Service is available
            return true;
        } catch (error) {
            // Service not ready yet, wait and retry
            await new Promise(resolve => setTimeout(resolve, 500));
        }
    }

    throw new Error(`Service on port ${port} did not start within ${timeout}ms`);
}
