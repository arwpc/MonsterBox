const fs = require('fs').promises;
const path = require('path');
const { chai, app, expect } = require('./setupTests');

describe('Part Routes', () => {
    let originalPartsData;
    const partsPath = path.join(__dirname, '..', 'data', 'parts.json');

    before(async function () {
        // Backup current parts data
        originalPartsData = await fs.readFile(partsPath, 'utf8');
    });

    after(async function () {
        // Restore original parts data
        await fs.writeFile(partsPath, originalPartsData);
    });

    describe('Motor Tests', () => {
        let createdMotorId;

        it('should create a new motor', async () => {
            const motorData = {
                name: 'Test Motor',
                type: 'motor',
                characterId: 1,
                directionPin: '24',
                pwmPin: '18'
            };

            const res = await chai.request(app)
                .post('/parts/motor')
                .send(motorData);

            res.should.have.status(200);
            res.should.redirectTo(/\/parts\?characterId=1$/);

            // Get the created motor ID from parts.json
            const partsData = await fs.readFile(partsPath, 'utf8');
            const parts = JSON.parse(partsData);
            const createdMotor = parts.find(p => p.name === 'Test Motor');
            expect(createdMotor).to.exist;
            createdMotorId = createdMotor.id;
            expect(createdMotorId).to.be.a('number');
        });

        it('should get the created motor', async () => {
            expect(createdMotorId).to.be.a('number');
            const res = await chai.request(app)
                .get(`/parts/${createdMotorId}/edit`);

            res.should.have.status(200);
            res.text.should.include('Test Motor');
        });

        it('should update the motor', async () => {
            expect(createdMotorId).to.be.a('number');
            const updateData = {
                name: 'Updated Test Motor',
                directionPin: '25',
                pwmPin: '19'
            };

            const res = await chai.request(app)
                .post(`/parts/${createdMotorId}/update`)
                .send(updateData);

            res.should.have.status(200);
            res.should.redirectTo(/\/parts\?characterId=1$/);

            // Verify the update
            const partsData = await fs.readFile(partsPath, 'utf8');
            const parts = JSON.parse(partsData);
            const updatedMotor = parts.find(p => p.id === createdMotorId);
            expect(updatedMotor.name).to.equal('Updated Test Motor');
        });

        it('should delete the motor', async () => {
            expect(createdMotorId).to.be.a('number');
            const res = await chai.request(app)
                .post(`/parts/${createdMotorId}/delete`);

            res.should.have.status(200);
            res.body.should.have.property('message').equal('Part deleted successfully');

            // Verify deletion
            const partsData = await fs.readFile(partsPath, 'utf8');
            const parts = JSON.parse(partsData);
            const deletedMotor = parts.find(p => p.id === createdMotorId);
            expect(deletedMotor).to.be.undefined;
        });
    });

    describe('Linear Actuator Tests', () => {
        let createdActuatorId;

        it('should create a new linear actuator', async () => {
            const actuatorData = {
                name: 'Test Actuator',
                type: 'linear-actuator',
                characterId: 1,
                directionPin: 20,
                pwmPin: 21,
                maxExtension: 12000,
                maxRetraction: 12000
            };

            const res = await chai.request(app)
                .post('/parts/linear-actuator')
                .send(actuatorData);

            res.should.have.status(200);
            res.should.redirectTo(/\/parts\?characterId=1$/);

            // Get the created actuator ID
            const partsData = await fs.readFile(partsPath, 'utf8');
            const parts = JSON.parse(partsData);
            const createdActuator = parts.find(p => p.name === 'Test Actuator');
            expect(createdActuator).to.exist;
            createdActuatorId = createdActuator.id;
            expect(createdActuatorId).to.be.a('number');
        });

        it('should get the created actuator', async () => {
            expect(createdActuatorId).to.be.a('number');
            const res = await chai.request(app)
                .get(`/parts/${createdActuatorId}/edit`);

            res.should.have.status(200);
            res.text.should.include('Test Actuator');
        });

        it('should update the actuator', async () => {
            expect(createdActuatorId).to.be.a('number');
            const updateData = {
                name: 'Updated Test Actuator',
                maxExtension: 13000,
                maxRetraction: 13000
            };

            const res = await chai.request(app)
                .post(`/parts/${createdActuatorId}/update`)
                .send(updateData);

            res.should.have.status(200);
            res.should.redirectTo(/\/parts\?characterId=1$/);

            // Verify the update
            const partsData = await fs.readFile(partsPath, 'utf8');
            const parts = JSON.parse(partsData);
            const updatedActuator = parts.find(p => p.id === createdActuatorId);
            expect(updatedActuator.name).to.equal('Updated Test Actuator');
        });

        it('should delete the actuator', async () => {
            expect(createdActuatorId).to.be.a('number');
            const res = await chai.request(app)
                .post(`/parts/${createdActuatorId}/delete`);

            res.should.have.status(200);
            res.body.should.have.property('message').equal('Part deleted successfully');

            // Verify deletion
            const partsData = await fs.readFile(partsPath, 'utf8');
            const parts = JSON.parse(partsData);
            const deletedActuator = parts.find(p => p.id === createdActuatorId);
            expect(deletedActuator).to.be.undefined;
        });
    });

    describe('Light Tests', () => {
        let createdLightId;

        it('should create a new light', async () => {
            const lightData = {
                name: 'Test Light',
                type: 'light',
                characterId: 1,
                gpioPin: 27
            };

            const res = await chai.request(app)
                .post('/parts/light')
                .send(lightData);

            res.should.have.status(200);
            res.should.redirectTo(/\/parts\?characterId=1$/);

            // Get the created light ID
            const partsData = await fs.readFile(partsPath, 'utf8');
            const parts = JSON.parse(partsData);
            const createdLight = parts.find(p => p.name === 'Test Light' && p.type === 'light');
            expect(createdLight).to.exist;
            createdLightId = createdLight.id;
            expect(createdLightId).to.be.a('number');
        });

        it('should get the created light', async () => {
            expect(createdLightId).to.be.a('number');
            const res = await chai.request(app)
                .get(`/parts/${createdLightId}/edit`);

            res.should.have.status(200);
            res.text.should.include('Test Light');
        });

        it('should update the light', async () => {
            expect(createdLightId).to.be.a('number');
            const updateData = {
                name: 'Updated Test Light',
                gpioPin: 28
            };

            const res = await chai.request(app)
                .post(`/parts/${createdLightId}/update`)
                .send(updateData);

            res.should.have.status(200);
            res.should.redirectTo(/\/parts\?characterId=1$/);

            // Verify the update
            const partsData = await fs.readFile(partsPath, 'utf8');
            const parts = JSON.parse(partsData);
            const updatedLight = parts.find(p => p.id === createdLightId);
            expect(updatedLight.name).to.equal('Updated Test Light');
        });

        it('should delete the light', async () => {
            expect(createdLightId).to.be.a('number');
            const res = await chai.request(app)
                .post(`/parts/${createdLightId}/delete`);

            res.should.have.status(200);
            res.body.should.have.property('message').equal('Part deleted successfully');

            // Verify deletion
            const partsData = await fs.readFile(partsPath, 'utf8');
            const parts = JSON.parse(partsData);
            const deletedLight = parts.find(p => p.id === createdLightId);
            expect(deletedLight).to.be.undefined;
        });
    });

    describe('LED Tests', () => {
        let createdLedId;

        it('should create a new LED', async () => {
            const ledData = {
                name: 'Test LED',
                type: 'led',
                characterId: 1,
                gpioPin: 29
            };

            const res = await chai.request(app)
                .post('/parts/led')
                .send(ledData);

            res.should.have.status(200);
            res.should.redirectTo(/\/parts\?characterId=1$/);

            // Get the created LED ID
            const partsData = await fs.readFile(partsPath, 'utf8');
            const parts = JSON.parse(partsData);
            const createdLed = parts.find(p => p.name === 'Test LED');
            expect(createdLed).to.exist;
            createdLedId = createdLed.id;
            expect(createdLedId).to.be.a('number');
        });

        it('should get the created LED', async () => {
            expect(createdLedId).to.be.a('number');
            const res = await chai.request(app)
                .get(`/parts/${createdLedId}/edit`);

            res.should.have.status(200);
            res.text.should.include('Test LED');
        });

        it('should update the LED', async () => {
            expect(createdLedId).to.be.a('number');
            const updateData = {
                name: 'Updated Test LED',
                gpioPin: 30
            };

            const res = await chai.request(app)
                .post(`/parts/${createdLedId}/update`)
                .send(updateData);

            res.should.have.status(200);
            res.should.redirectTo(/\/parts\?characterId=1$/);

            // Verify the update
            const partsData = await fs.readFile(partsPath, 'utf8');
            const parts = JSON.parse(partsData);
            const updatedLed = parts.find(p => p.id === createdLedId);
            expect(updatedLed.name).to.equal('Updated Test LED');
        });

        it('should delete the LED', async () => {
            expect(createdLedId).to.be.a('number');
            const res = await chai.request(app)
                .post(`/parts/${createdLedId}/delete`);

            res.should.have.status(200);
            res.body.should.have.property('message').equal('Part deleted successfully');

            // Verify deletion
            const partsData = await fs.readFile(partsPath, 'utf8');
            const parts = JSON.parse(partsData);
            const deletedLed = parts.find(p => p.id === createdLedId);
            expect(deletedLed).to.be.undefined;
        });
    });

    describe('Servo Tests', () => {
        let createdServoId;

        it('should create a new servo', async () => {
            const servoData = {
                name: 'Test Servo',
                type: 'servo',
                characterId: 1,
                pin: 3,
                usePCA9685: true,
                channel: 3,
                minPulse: 500,
                maxPulse: 2500,
                defaultAngle: 90,
                servoType: 'Test Servo Type',
                mode: ['Standard'],
                feedback: false,
                controlType: ['PWM'],
                pca9685Settings: {
                    frequency: 50,
                    address: '0x40'
                }
            };

            const res = await chai.request(app)
                .post('/parts/servo')
                .send(servoData);

            res.should.have.status(200);
            res.should.redirectTo(/\/parts\?characterId=1$/);

            // Get the created servo ID
            const partsData = await fs.readFile(partsPath, 'utf8');
            const parts = JSON.parse(partsData);
            const createdServo = parts.find(p => p.name === 'Test Servo');
            expect(createdServo).to.exist;
            createdServoId = createdServo.id;
            expect(createdServoId).to.be.a('number');
        });

        it('should get the created servo', async () => {
            expect(createdServoId).to.be.a('number');
            const res = await chai.request(app)
                .get(`/parts/${createdServoId}/edit`);

            res.should.have.status(200);
            res.text.should.include('Test Servo');
        });

        it('should update the servo', async () => {
            expect(createdServoId).to.be.a('number');
            const updateData = {
                name: 'Updated Test Servo',
                defaultAngle: 180,
                mode: ['Standard', 'Continuous']
            };

            const res = await chai.request(app)
                .post(`/parts/${createdServoId}/update`)
                .send(updateData);

            res.should.have.status(200);
            res.should.redirectTo(/\/parts\?characterId=1$/);

            // Verify the update
            const partsData = await fs.readFile(partsPath, 'utf8');
            const parts = JSON.parse(partsData);
            const updatedServo = parts.find(p => p.id === createdServoId);
            expect(updatedServo.name).to.equal('Updated Test Servo');
        });

        it('should delete the servo', async () => {
            expect(createdServoId).to.be.a('number');
            const res = await chai.request(app)
                .post(`/parts/${createdServoId}/delete`);

            res.should.have.status(200);
            res.body.should.have.property('message').equal('Part deleted successfully');

            // Verify deletion
            const partsData = await fs.readFile(partsPath, 'utf8');
            const parts = JSON.parse(partsData);
            const deletedServo = parts.find(p => p.id === createdServoId);
            expect(deletedServo).to.be.undefined;
        });
    });

    describe('Sensor Tests', () => {
        let createdSensorId;

        it('should create a new sensor', async () => {
            const sensorData = {
                name: 'Test Sensor',
                type: 'sensor',
                characterId: 1,
                gpioPin: 31,
                active: true,
                sensorType: 'motion'
            };

            const res = await chai.request(app)
                .post('/parts/sensor')
                .send(sensorData);

            res.should.have.status(200);
            res.should.redirectTo(/\/parts\?characterId=1$/);

            // Get the created sensor ID
            const partsData = await fs.readFile(partsPath, 'utf8');
            const parts = JSON.parse(partsData);
            const createdSensor = parts.find(p => p.name === 'Test Sensor');
            expect(createdSensor).to.exist;
            createdSensorId = createdSensor.id;
            expect(createdSensorId).to.be.a('number');
        });

        it('should get the created sensor', async () => {
            expect(createdSensorId).to.be.a('number');
            const res = await chai.request(app)
                .get(`/parts/${createdSensorId}/edit`);

            res.should.have.status(200);
            res.text.should.include('Test Sensor');
        });

        it('should update the sensor', async () => {
            expect(createdSensorId).to.be.a('number');
            const updateData = {
                name: 'Updated Test Sensor',
                active: false,
                sensorType: 'proximity'
            };

            const res = await chai.request(app)
                .post(`/parts/${createdSensorId}/update`)
                .send(updateData);

            res.should.have.status(200);
            res.should.redirectTo(/\/parts\?characterId=1$/);

            // Verify the update
            const partsData = await fs.readFile(partsPath, 'utf8');
            const parts = JSON.parse(partsData);
            const updatedSensor = parts.find(p => p.id === createdSensorId);
            expect(updatedSensor.name).to.equal('Updated Test Sensor');
        });

        it('should delete the sensor', async () => {
            expect(createdSensorId).to.be.a('number');
            const res = await chai.request(app)
                .post(`/parts/${createdSensorId}/delete`);

            res.should.have.status(200);
            res.body.should.have.property('message').equal('Part deleted successfully');

            // Verify deletion
            const partsData = await fs.readFile(partsPath, 'utf8');
            const parts = JSON.parse(partsData);
            const deletedSensor = parts.find(p => p.id === createdSensorId);
            expect(deletedSensor).to.be.undefined;
        });
    });

    describe('Motion Sensor Tests', () => {
        let createdMotionSensorId;

        it('should create a new motion sensor', async () => {
            const motionSensorData = {
                name: 'Test Motion Sensor',
                type: 'motion-sensor',
                characterId: 1,
                gpioPin: 26,
                sensitivity: 0.1,
                detectionRange: 7,
                triggerDelay: 500,
                active: true,
                invertSignal: false,
                enableLogging: true
            };

            const res = await chai.request(app)
                .post('/parts/motion-sensor')
                .send(motionSensorData);

            res.should.have.status(200);
            res.should.redirectTo(/\/parts\?characterId=1$/);

            // Get the created motion sensor ID
            const partsData = await fs.readFile(partsPath, 'utf8');
            const parts = JSON.parse(partsData);
            const createdMotionSensor = parts.find(p => p.name === 'Test Motion Sensor');
            expect(createdMotionSensor).to.exist;
            createdMotionSensorId = createdMotionSensor.id;
            expect(createdMotionSensorId).to.be.a('number');

            // Verify motion sensor specific properties
            expect(createdMotionSensor.type).to.equal('motion-sensor');
            expect(createdMotionSensor.gpioPin).to.equal(26);
            expect(createdMotionSensor.sensitivity).to.equal(0.1);
            expect(createdMotionSensor.detectionRange).to.equal(7);
            expect(createdMotionSensor.triggerDelay).to.equal(500);
            expect(createdMotionSensor.active).to.equal(true);
            expect(createdMotionSensor.invertSignal).to.equal(false);
            expect(createdMotionSensor.enableLogging).to.equal(true);
        });

        it('should get the created motion sensor', async () => {
            expect(createdMotionSensorId).to.be.a('number');
            const res = await chai.request(app)
                .get(`/parts/motion-sensor/${createdMotionSensorId}/edit`);

            res.should.have.status(200);
            res.text.should.include('Test Motion Sensor');
            res.text.should.include('motion-sensor');
        });

        it('should update the motion sensor', async () => {
            expect(createdMotionSensorId).to.be.a('number');
            const updateData = {
                name: 'Updated Test Motion Sensor',
                gpioPin: 27,
                sensitivity: 0.2,
                detectionRange: 10,
                triggerDelay: 1000,
                active: false,
                invertSignal: true,
                enableLogging: false
            };

            const res = await chai.request(app)
                .post(`/parts/motion-sensor/${createdMotionSensorId}/update`)
                .send(updateData);

            res.should.have.status(200);
            res.should.redirectTo(/\/parts\?characterId=1$/);

            // Verify the update
            const partsData = await fs.readFile(partsPath, 'utf8');
            const parts = JSON.parse(partsData);
            const updatedMotionSensor = parts.find(p => p.id === createdMotionSensorId);
            expect(updatedMotionSensor.name).to.equal('Updated Test Motion Sensor');
            expect(updatedMotionSensor.gpioPin).to.equal(27);
            expect(updatedMotionSensor.sensitivity).to.equal(0.2);
            expect(updatedMotionSensor.detectionRange).to.equal(10);
            expect(updatedMotionSensor.triggerDelay).to.equal(1000);
            expect(updatedMotionSensor.active).to.equal(false);
            expect(updatedMotionSensor.invertSignal).to.equal(true);
            expect(updatedMotionSensor.enableLogging).to.equal(false);
        });

        it('should validate motion sensor form data', async () => {
            // Test invalid GPIO pin
            const invalidGpioPinData = {
                name: 'Invalid GPIO Motion Sensor',
                type: 'motion-sensor',
                characterId: 1,
                gpioPin: 50, // Invalid - should be 0-27
                sensitivity: 0.1
            };

            const res1 = await chai.request(app)
                .post('/parts/motion-sensor')
                .send(invalidGpioPinData);

            // Should still create but with validation warnings in logs
            res1.should.have.status(200);

            // Test invalid sensitivity
            const invalidSensitivityData = {
                name: 'Invalid Sensitivity Motion Sensor',
                type: 'motion-sensor',
                characterId: 1,
                gpioPin: 26,
                sensitivity: 10 // Invalid - should be 0.05-5.0
            };

            const res2 = await chai.request(app)
                .post('/parts/motion-sensor')
                .send(invalidSensitivityData);

            // Should still create but with validation warnings in logs
            res2.should.have.status(200);
        });

        it('should test motion sensor control endpoints', async () => {
            expect(createdMotionSensorId).to.be.a('number');

            // Test stop control endpoint
            const stopRes = await chai.request(app)
                .post('/parts/motion-sensor/control')
                .send({
                    id: createdMotionSensorId,
                    gpioPin: 26,
                    action: 'stop'
                });

            stopRes.should.have.status(200);
            stopRes.body.should.have.property('success').equal(true);
            stopRes.body.should.have.property('message').that.includes('Stop request received');
        });

        it('should delete the motion sensor', async () => {
            expect(createdMotionSensorId).to.be.a('number');
            const res = await chai.request(app)
                .post(`/parts/${createdMotionSensorId}/delete`);

            res.should.have.status(200);
            res.body.should.have.property('message').equal('Part deleted successfully');

            // Verify deletion
            const partsData = await fs.readFile(partsPath, 'utf8');
            const parts = JSON.parse(partsData);
            const deletedMotionSensor = parts.find(p => p.id === createdMotionSensorId);
            expect(deletedMotionSensor).to.be.undefined;
        });
    });
});
