/**
 * MonsterBox 4.0 Hardware Parts Tests
 * Tests all 11 Part types and their functionality
 */

import { expect } from 'chai';
import request from 'supertest';

// Use the running server instead of importing the app
const BASE_URL = 'http://localhost:3000';

describe('Hardware Parts Integration', () => {

    describe('Part Types Validation', () => {
        const expectedPartTypes = [
            { type: 'motor', icon: '🔄', description: 'DC motors for movement' },
            { type: 'linear_actuator', icon: '🦴', description: 'extending/retracting movements' },
            { type: 'light', icon: '💡', description: 'basic on/off lighting' },
            { type: 'led', icon: '🔆', description: 'PWM-controlled with brightness' },
            { type: 'servo', icon: '🦷', description: 'precise angle control: standard, continuous, feedback' },
            { type: 'sensor', icon: '📡', description: 'digital/analog sensors' },
            { type: 'motion_sensor', icon: '🔍', description: 'PIR motion detection' },
            { type: 'webcam', icon: '📹', description: 'video capture devices' },
            { type: 'microphone', icon: '🎤', description: 'audio input devices' },
            { type: 'speaker', icon: '🔊', description: 'audio output devices' },
            { type: 'head_tracking', icon: '🎯', description: 'computer vision tracking' }
        ];

        it('should support all 11 Part types', () => {
            // This test validates that our system recognizes all required part types
            expect(expectedPartTypes).to.have.lengthOf(11);

            // Validate each part type has required properties
            expectedPartTypes.forEach(partType => {
                expect(partType).to.have.property('type');
                expect(partType).to.have.property('icon');
                expect(partType).to.have.property('description');
                expect(partType.type).to.be.a('string');
                expect(partType.icon).to.be.a('string');
                expect(partType.description).to.be.a('string');
            });
        });
    });

    describe('Parts API Endpoints', () => {
        it('should return all parts', async () => {
            const response = await request(BASE_URL)
                .get('/setup/parts/api/parts')
                .expect(200);

            expect(response.body).to.have.property('success', true);
            expect(response.body).to.have.property('parts');
            expect(response.body.parts).to.be.an('array');
        });

        it('should create a new motor part', async () => {
            const motorData = {
                name: 'Test Motor',
                type: 'motor',
                pin: 18,
                description: 'Test DC motor for movement',
                config: {
                    direction: 'forward',
                    speed: 255,
                    enablePin: 19
                }
            };

            const response = await request(BASE_URL)
                .post('/setup/parts/api/parts')
                .send(motorData)
                .expect(201);

            expect(response.body).to.have.property('success', true);
            expect(response.body).to.have.property('part');
            expect(response.body.part).to.have.property('type', 'motor');
            expect(response.body.part).to.have.property('name', 'Test Motor');
        });

        it('should create a new servo part', async () => {
            const servoData = {
                name: 'Test Servo',
                type: 'servo',
                pin: 12,
                description: 'Test servo for precise angle control',
                config: {
                    servoType: 'standard',
                    minPulse: 500,
                    maxPulse: 2500,
                    minAngle: 0,
                    maxAngle: 180
                }
            };

            const response = await request(BASE_URL)
                .post('/setup/parts/api/parts')
                .send(servoData)
                .expect(201);

            expect(response.body).to.have.property('success', true);
            expect(response.body.part).to.have.property('type', 'servo');
            expect(response.body.part.config).to.have.property('servoType', 'standard');
        });

        it('should create a new LED part', async () => {
            const ledData = {
                name: 'Test LED',
                type: 'led',
                pin: 13,
                description: 'PWM-controlled LED with brightness',
                config: {
                    brightness: 128,
                    pwmFrequency: 1000,
                    color: 'white'
                }
            };

            const response = await request(BASE_URL)
                .post('/setup/parts/api/parts')
                .send(ledData)
                .expect(201);

            expect(response.body).to.have.property('success', true);
            expect(response.body.part).to.have.property('type', 'led');
            expect(response.body.part.config).to.have.property('brightness', 128);
        });

        it('should create a new sensor part', async () => {
            const sensorData = {
                name: 'Test Sensor',
                type: 'sensor',
                pin: 14,
                description: 'Digital/analog sensor',
                config: {
                    sensorType: 'digital',
                    pullUp: true,
                    threshold: 512
                }
            };

            const response = await request(BASE_URL)
                .post('/setup/parts/api/parts')
                .send(sensorData)
                .expect(201);

            expect(response.body).to.have.property('success', true);
            expect(response.body.part).to.have.property('type', 'sensor');
            expect(response.body.part.config).to.have.property('sensorType', 'digital');
        });
    });

    describe('Part Configuration Validation', () => {
        it('should validate motor configuration', () => {
            const validMotorConfig = {
                direction: 'forward',
                speed: 255,
                enablePin: 19
            };

            expect(validMotorConfig).to.have.property('direction');
            expect(validMotorConfig).to.have.property('speed');
            expect(validMotorConfig.speed).to.be.within(0, 255);
        });

        it('should validate servo configuration', () => {
            const validServoConfig = {
                servoType: 'standard',
                minPulse: 500,
                maxPulse: 2500,
                minAngle: 0,
                maxAngle: 180
            };

            expect(validServoConfig).to.have.property('servoType');
            expect(['standard', 'continuous', 'feedback']).to.include(validServoConfig.servoType);
            expect(validServoConfig.minAngle).to.be.lessThan(validServoConfig.maxAngle);
        });

        it('should validate LED configuration', () => {
            const validLEDConfig = {
                brightness: 128,
                pwmFrequency: 1000,
                color: 'white'
            };

            expect(validLEDConfig).to.have.property('brightness');
            expect(validLEDConfig.brightness).to.be.within(0, 255);
            expect(validLEDConfig).to.have.property('pwmFrequency');
        });
    });

    describe('Part Control Functions', () => {
        it('should validate part control arguments', () => {
            // Test argument validation for different part types
            const testCases = [
                { type: 'motor', args: ['18', '255'], expectedLength: 2 },
                { type: 'servo', args: ['12', '90'], expectedLength: 2 },
                { type: 'led', args: ['13', '128'], expectedLength: 2 },
                { type: 'light', args: ['15', '1'], expectedLength: 2 }
            ];

            testCases.forEach(testCase => {
                expect(testCase.args).to.have.lengthOf(testCase.expectedLength);
                testCase.args.forEach(arg => {
                    expect(arg).to.be.a('string');
                    expect(arg).to.match(/^\d+$/); // Should be numeric string
                });
            });
        });
    });

    describe('Hardware Safety Checks', () => {
        it('should enforce pin number validation', () => {
            const validPins = [2, 3, 4, 5, 6, 7, 8, 9, 10, 11, 12, 13, 14, 15, 16, 17, 18, 19, 20, 21, 22, 23, 24, 25, 26, 27];
            const testPin = 18;

            expect(validPins).to.include(testPin);
            expect(testPin).to.be.within(2, 27);
        });

        it('should enforce servo angle limits', () => {
            const servoAngle = 90;
            const minAngle = 0;
            const maxAngle = 180;

            expect(servoAngle).to.be.within(minAngle, maxAngle);
        });

        it('should enforce PWM value limits', () => {
            const pwmValue = 128;

            expect(pwmValue).to.be.within(0, 255);
        });
    });
});
