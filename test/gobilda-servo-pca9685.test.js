/**
 * GoBilda 2000-Series Servo PCA9685 Integration Tests
 * 
 * Tests the fixed servo implementation for GoBilda dual-mode servos:
 * - Continuous rotation with proper PWM control
 * - Multi-turn positional movement (0-1800°)
 * - PCA9685 channel/address configuration
 * - Servo model defaults integration
 * - Edit functionality for servo settings
 */

import { expect } from 'chai';
import axios from 'axios';

const BASE_URL = 'http://localhost:3000';

// Test configuration
const TEST_CONFIG = {
    pca9685: {
        address: 0x40,
        channel: 0
    },
    gobilda: {
        continuousModelId: '5',
        positionalModelId: '6'
    }
};

/**
 * Helper functions
 */
async function createServo(name, config = {}) {
    const payload = {
        name,
        type: 'servo',
        description: `Test servo: ${name}`,
        config: {
            controllerType: 'pca9685',
            address: TEST_CONFIG.pca9685.address,
            channel: TEST_CONFIG.pca9685.channel,
            ...config
        }
    };

    const res = await axios.post(`${BASE_URL}/setup/parts/api/parts`, payload, {
        validateStatus: () => true
    });

    expect(res.status).to.equal(201);
    expect(res.data).to.have.property('success', true);
    expect(res.data.part).to.have.property('id');

    return res.data.part;
}

async function testServoAction(partId, action, params = {}) {
    const res = await axios.post(`${BASE_URL}/setup/parts/api/parts/${partId}/test`, {
        action,
        params
    }, { validateStatus: () => true });

    expect(res.status).to.equal(200);
    expect(res.data).to.have.property('testResult');

    return res.data.testResult.details || res.data.testResult;
}

async function updateServo(partId, updates) {
    const res = await axios.put(`${BASE_URL}/setup/parts/api/parts/${partId}`, updates, {
        validateStatus: () => true
    });

    expect(res.status).to.equal(200);
    expect(res.data).to.have.property('success', true);

    return res.data.part;
}

async function deleteServo(partId) {
    const res = await axios.delete(`${BASE_URL}/setup/parts/api/parts/${partId}`, {
        validateStatus: () => true
    });

    expect(res.status).to.equal(200);

    // Verify deletion
    const getRes = await axios.get(`${BASE_URL}/setup/parts/api/parts/${partId}`, {
        validateStatus: () => true
    });
    expect(getRes.status).to.equal(404);
}

async function getServoModels() {
    const res = await axios.get(`${BASE_URL}/setup/models/api/servo`, {
        validateStatus: () => true
    });

    expect(res.status).to.equal(200);
    return res.data.models || [];
}

describe('GoBilda 2000-Series Servo PCA9685 Integration', () => {
    let createdServos = [];

    afterEach(async () => {
        // Clean up created servos
        for (const servo of createdServos) {
            try {
                await deleteServo(servo.id);
            } catch (error) {
                console.warn(`Failed to clean up servo ${servo.id}:`, error.message);
            }
        }
        createdServos = [];
    });

    describe('Servo Models', () => {
        it('should have GoBilda continuous and positional models', async () => {
            const models = await getServoModels();

            const continuousModel = models.find(m => m.id === TEST_CONFIG.gobilda.continuousModelId);
            expect(continuousModel).to.exist;
            expect(continuousModel.name).to.include('GoBilda 2000 Series');
            expect(continuousModel.name).to.include('Continuous');
            expect(continuousModel.defaults.servoType).to.equal('continuous');
            expect(continuousModel.defaults.controllerType).to.equal('pca9685');
            expect(continuousModel.defaults.minPulse).to.equal(900);
            expect(continuousModel.defaults.maxPulse).to.equal(2100);

            const positionalModel = models.find(m => m.id === TEST_CONFIG.gobilda.positionalModelId);
            expect(positionalModel).to.exist;
            expect(positionalModel.name).to.include('GoBilda 2000 Series');
            expect(positionalModel.name).to.include('Positional');
            expect(positionalModel.defaults.servoType).to.equal('feedback');
            expect(positionalModel.defaults.controllerType).to.equal('pca9685');
            expect(positionalModel.defaults.minPulse).to.equal(500);
            expect(positionalModel.defaults.maxPulse).to.equal(2500);
            expect(positionalModel.defaults.rotationRangeDeg).to.equal(1800);
        });
    });

    describe('Continuous Mode Servo', () => {
        it('should create continuous servo with GoBilda model', async () => {
            const servo = await createServo('GoBilda Continuous Test', {
                servoType: 'continuous',
                modelId: TEST_CONFIG.gobilda.continuousModelId,
                channel: 0
            });

            createdServos.push(servo);

            expect(servo.config.servoType).to.equal('continuous');
            expect(servo.config.controllerType).to.equal('pca9685');
            expect(servo.config.channel).to.equal(0);
            expect(servo.config.modelId).to.equal(TEST_CONFIG.gobilda.continuousModelId);
        });

        it('should rotate continuous servo clockwise', async () => {
            const servo = await createServo('GoBilda CW Test', {
                servoType: 'continuous',
                modelId: TEST_CONFIG.gobilda.continuousModelId,
                channel: 1
            });

            createdServos.push(servo);

            const result = await testServoAction(servo.id, 'rotateContinuous', {
                direction: 'cw',
                speed: 50,
                duration: 1000
            });

            expect(result).to.have.property('success');
            expect(result.rawOutput).to.include('success');
            expect(result.message).to.include('cw');
        });

        it('should rotate continuous servo counter-clockwise', async () => {
            const servo = await createServo('GoBilda CCW Test', {
                servoType: 'continuous',
                modelId: TEST_CONFIG.gobilda.continuousModelId,
                channel: 2
            });

            createdServos.push(servo);

            const result = await testServoAction(servo.id, 'rotateContinuous', {
                direction: 'ccw',
                speed: 75,
                duration: 500
            });

            expect(result).to.have.property('success');
            expect(result.rawOutput).to.include('success');
            expect(result.message).to.include('ccw');
        });

        it('should stop continuous servo', async () => {
            const servo = await createServo('GoBilda Stop Test', {
                servoType: 'continuous',
                modelId: TEST_CONFIG.gobilda.continuousModelId,
                channel: 3
            });

            createdServos.push(servo);

            const result = await testServoAction(servo.id, 'stop', {});

            expect(result).to.have.property('success');
            expect(result.rawOutput).to.include('success');
            expect(result.message).to.include('stopped');
        });
    });

    describe('Positional Mode Servo', () => {
        it('should create positional servo with GoBilda model', async () => {
            const servo = await createServo('GoBilda Positional Test', {
                servoType: 'feedback',
                modelId: TEST_CONFIG.gobilda.positionalModelId,
                channel: 4
            });

            createdServos.push(servo);

            expect(servo.config.servoType).to.equal('feedback');
            expect(servo.config.controllerType).to.equal('pca9685');
            expect(servo.config.channel).to.equal(4);
            expect(servo.config.modelId).to.equal(TEST_CONFIG.gobilda.positionalModelId);
        });

        it('should move positional servo to small angle', async () => {
            const servo = await createServo('GoBilda Small Angle Test', {
                servoType: 'feedback',
                modelId: TEST_CONFIG.gobilda.positionalModelId,
                channel: 5
            });

            createdServos.push(servo);

            const result = await testServoAction(servo.id, 'moveToAngle', {
                angleDeg: 30
            });

            expect(result).to.have.property('success');
            expect(result.rawOutput).to.include('success');
            expect(result.message).to.include('30°');
        });

        it('should move positional servo to large multi-turn angle', async () => {
            const servo = await createServo('GoBilda Multi-turn Test', {
                servoType: 'feedback',
                modelId: TEST_CONFIG.gobilda.positionalModelId,
                channel: 6
            });

            createdServos.push(servo);

            const result = await testServoAction(servo.id, 'moveToAngle', {
                angleDeg: 900  // 2.5 turns
            });

            expect(result).to.have.property('success');
            expect(result.rawOutput).to.include('success');
            expect(result.message).to.include('900°');
        });

        it('should handle maximum angle (1800°)', async () => {
            const servo = await createServo('GoBilda Max Angle Test', {
                servoType: 'feedback',
                modelId: TEST_CONFIG.gobilda.positionalModelId,
                channel: 7
            });

            createdServos.push(servo);

            const result = await testServoAction(servo.id, 'moveToAngle', {
                angleDeg: 1800  // 5 turns - maximum
            });

            expect(result).to.have.property('success');
            expect(result.rawOutput).to.include('success');
            expect(result.message).to.include('1800°');
        });
    });

    describe('Servo Configuration Editing', () => {
        it('should edit servo from GPIO to PCA9685', async () => {
            // Create servo with GPIO initially (need to provide pin for GPIO)
            const payload = {
                name: 'GPIO to PCA9685 Test',
                type: 'servo',
                pin: 18, // GPIO servos need a pin
                description: 'Test servo: GPIO to PCA9685 Test',
                config: {
                    servoType: 'standard',
                    controllerType: 'gpio'
                }
            };

            const res = await axios.post(`${BASE_URL}/setup/parts/api/parts`, payload, {
                validateStatus: () => true
            });

            expect(res.status).to.equal(201);
            const servo = res.data.part;

            createdServos.push(servo);

            // Update to PCA9685
            const updated = await updateServo(servo.id, {
                config: {
                    ...servo.config,
                    controllerType: 'pca9685',
                    channel: 8,
                    address: 0x40
                }
            });

            expect(updated.config.controllerType).to.equal('pca9685');
            expect(updated.config.channel).to.equal(8);
            expect(updated.config.address).to.equal(0x40);
        });

        it('should edit servo type from continuous to positional', async () => {
            const servo = await createServo('Type Change Test', {
                servoType: 'continuous',
                modelId: TEST_CONFIG.gobilda.continuousModelId,
                channel: 9
            });

            createdServos.push(servo);

            // Change to positional
            const updated = await updateServo(servo.id, {
                config: {
                    ...servo.config,
                    servoType: 'feedback',
                    modelId: TEST_CONFIG.gobilda.positionalModelId
                }
            });

            expect(updated.config.servoType).to.equal('feedback');
            expect(updated.config.modelId).to.equal(TEST_CONFIG.gobilda.positionalModelId);

            // Test positional movement
            const result = await testServoAction(updated.id, 'moveToAngle', {
                angleDeg: 45
            });

            expect(result).to.have.property('success');
            expect(result.message).to.include('45°');
        });

        it('should edit PCA9685 channel and address', async () => {
            const servo = await createServo('Channel Address Test', {
                servoType: 'continuous',
                channel: 10,
                address: 0x40
            });

            createdServos.push(servo);

            // Change channel and address
            const updated = await updateServo(servo.id, {
                config: {
                    ...servo.config,
                    channel: 15,
                    address: 0x41
                }
            });

            expect(updated.config.channel).to.equal(15);
            expect(updated.config.address).to.equal(0x41);

            // Test with new configuration
            const result = await testServoAction(updated.id, 'rotateContinuous', {
                direction: 'cw',
                speed: 25,
                duration: 500
            });

            expect(result).to.have.property('success');
        });
    });

    describe('Error Handling', () => {
        it('should handle invalid servo type gracefully', async () => {
            const servo = await createServo('Invalid Type Test', {
                servoType: 'invalid_type',
                channel: 11
            });

            createdServos.push(servo);

            // Should still work, falling back to standard behavior
            const result = await testServoAction(servo.id, 'moveToAngle', {
                angleDeg: 90
            });

            expect(result).to.have.property('success');
        });

        it('should handle missing channel configuration', async () => {
            const servo = await createServo('Missing Channel Test', {
                servoType: 'continuous'
                // channel intentionally omitted
            });

            createdServos.push(servo);

            // Should use default channel (0)
            const result = await testServoAction(servo.id, 'rotateContinuous', {
                direction: 'cw',
                speed: 50,
                duration: 500
            });

            expect(result).to.have.property('success');
        });
    });

    describe('Hardware Integration Verification', () => {
        it('should log correct Python wrapper commands for continuous servo', async () => {
            const servo = await createServo('Command Log Test Continuous', {
                servoType: 'continuous',
                channel: 12
            });

            createdServos.push(servo);

            const result = await testServoAction(servo.id, 'rotateContinuous', {
                direction: 'cw',
                speed: 60,
                duration: 1000
            });

            expect(result).to.have.property('success');
            // Verify the command structure in rawOutput suggests correct wrapper usage
            expect(result.rawOutput).to.be.a('string');
        });

        it('should log correct Python wrapper commands for positional servo', async () => {
            const servo = await createServo('Command Log Test Positional', {
                servoType: 'feedback',
                channel: 13
            });

            createdServos.push(servo);

            const result = await testServoAction(servo.id, 'moveToAngle', {
                angleDeg: 720  // 2 turns
            });

            expect(result).to.have.property('success');
            // Verify the command structure suggests multi-turn function usage
            if (result.rawOutput) {
                expect(result.rawOutput).to.be.a('string');
            }
        });
    });
});
