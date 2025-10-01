/**
 * Continuous Servo Calibration Tests
 * Tests for the continuous servo calibration functionality
 */

import { expect } from 'chai';
import request from 'supertest';

const BASE_URL = 'http://127.0.0.1:3100';

describe('Continuous Servo Calibration', function() {
    this.timeout(10000);

    let testPartId;

    before(async function() {
        // Create a test continuous servo part
        const response = await request(BASE_URL)
            .post('/setup/parts/api/parts')
            .send({
                name: 'Test Continuous Servo',
                type: 'servo',
                description: 'Test servo for calibration',
                config: {
                    servoType: 'continuous',
                    controllerType: 'pca9685',
                    channel: 15,
                    address: 64,
                    pca9685Frequency: 50
                }
            })
            .expect(201);

        testPartId = response.body.part.id;
        console.log(`Created test continuous servo with ID: ${testPartId}`);
    });

    after(async function() {
        // Clean up test part
        if (testPartId) {
            await request(BASE_URL)
                .delete(`/setup/parts/api/parts/${testPartId}`)
                .expect(200);
        }
    });

    it('should render calibration page for continuous servo', async function() {
        const response = await request(BASE_URL)
            .get(`/setup/calibration/continuous_servo/${testPartId}`)
            .expect(200);

        expect(response.text).to.include('Calibrate Continuous Servo');
        expect(response.text).to.include('Test Continuous Servo');
        expect(response.text).to.include('Phase 1: Pulse Calibration');
        expect(response.text).to.include('Phase 2: Position Calibration');
        expect(response.text).to.include('Jog Controls');
    });

    it('should get calibration status (initially empty)', async function() {
        const response = await request(BASE_URL)
            .get(`/setup/calibration/api/continuous_servo/${testPartId}/status`)
            .expect(200);

        expect(response.body).to.have.property('success', true);
        expect(response.body).to.have.property('status');
        expect(response.body.status).to.have.property('pulseCalibrated').that.is.a('boolean');
        expect(response.body.status).to.have.property('positionsCalibrated').that.is.a('boolean');
    });

    it('should save stop pulse calibration', async function() {
        const response = await request(BASE_URL)
            .post(`/setup/calibration/api/continuous_servo/${testPartId}/save-pulse`)
            .send({
                pulseType: 'stop',
                pulseUs: 1460
            })
            .expect(200);

        expect(response.body).to.have.property('success', true);
        expect(response.body).to.have.property('message').that.includes('STOP pulse saved');
        expect(response.body.calibrationData).to.have.property('stop_pulse_us', 1460);
        expect(response.body.calibrationData).to.have.property('servo_type', 'continuous');
    });

    it('should save CW pulse calibration', async function() {
        const response = await request(BASE_URL)
            .post(`/setup/calibration/api/continuous_servo/${testPartId}/save-pulse`)
            .send({
                pulseType: 'cw',
                pulseUs: 1200
            })
            .expect(200);

        expect(response.body).to.have.property('success', true);
        expect(response.body).to.have.property('message').that.includes('CW pulse saved');
        expect(response.body.calibrationData).to.have.property('cw_pulse_us', 1200);
    });

    it('should save CCW pulse calibration', async function() {
        const response = await request(BASE_URL)
            .post(`/setup/calibration/api/continuous_servo/${testPartId}/save-pulse`)
            .send({
                pulseType: 'ccw',
                pulseUs: 1800
            })
            .expect(200);

        expect(response.body).to.have.property('success', true);
        expect(response.body).to.have.property('message').that.includes('CCW pulse saved');
        expect(response.body.calibrationData).to.have.property('ccw_pulse_us', 1800);
    });

    it('should show pulse calibrated status', async function() {
        const response = await request(BASE_URL)
            .get(`/setup/calibration/api/continuous_servo/${testPartId}/status`)
            .expect(200);

        expect(response.body.status).to.have.property('exists', true);
        expect(response.body.status).to.have.property('pulseCalibrated', true);
        expect(response.body.status).to.have.property('stopPulseCalibrated', true);
        expect(response.body.status).to.have.property('cwPulseCalibrated', true);
        expect(response.body.status).to.have.property('ccwPulseCalibrated', true);
    });

    it('should save named position', async function() {
        const response = await request(BASE_URL)
            .post(`/setup/calibration/api/continuous_servo/${testPartId}/save-position`)
            .send({
                positionName: 'forward',
                description: '0° - Facing directly forward'
            })
            .expect(200);

        expect(response.body).to.have.property('success', true);
        expect(response.body).to.have.property('message').that.includes('Position "forward" saved');
        expect(response.body.calibrationData.positions.forward).to.have.property('calibrated', true);
        expect(response.body.calibrationData.positions.forward).to.have.property('description', '0° - Facing directly forward');
    });

    it('should save multiple positions', async function() {
        // Save left position
        await request(BASE_URL)
            .post(`/setup/calibration/api/continuous_servo/${testPartId}/save-position`)
            .send({
                positionName: 'left_90',
                description: '90° - Facing left'
            })
            .expect(200);

        // Save right position
        await request(BASE_URL)
            .post(`/setup/calibration/api/continuous_servo/${testPartId}/save-position`)
            .send({
                positionName: 'right_90',
                description: '90° - Facing right'
            })
            .expect(200);

        // Check status
        const statusResponse = await request(BASE_URL)
            .get(`/setup/calibration/api/continuous_servo/${testPartId}/status`)
            .expect(200);

        expect(statusResponse.body.status).to.have.property('positionsCalibrated', true);
        expect(statusResponse.body.status.calibratedPositions).to.include('forward');
        expect(statusResponse.body.status.calibratedPositions).to.include('left_90');
        expect(statusResponse.body.status.calibratedPositions).to.include('right_90');
    });

    it('should jog servo CW', async function() {
        const response = await request(BASE_URL)
            .post(`/setup/calibration/api/continuous_servo/${testPartId}/jog`)
            .send({
                direction: 'cw',
                speed: 50,
                duration: 500
            })
            .expect(200);

        expect(response.body).to.have.property('success', true);
        expect(response.body).to.have.property('message').that.includes('rotating cw');
    });

    it('should jog servo CCW', async function() {
        const response = await request(BASE_URL)
            .post(`/setup/calibration/api/continuous_servo/${testPartId}/jog`)
            .send({
                direction: 'ccw',
                speed: 75,
                duration: 1000
            })
            .expect(200);

        expect(response.body).to.have.property('success', true);
        expect(response.body).to.have.property('message').that.includes('rotating ccw');
    });

    it('should stop servo', async function() {
        const response = await request(BASE_URL)
            .post(`/setup/calibration/api/continuous_servo/${testPartId}/jog`)
            .send({
                direction: 'stop',
                speed: 0,
                duration: 100
            })
            .expect(200);

        expect(response.body).to.have.property('success', true);
        expect(response.body).to.have.property('message').that.includes('stopped');
    });

    it('should reset calibration', async function() {
        const response = await request(BASE_URL)
            .post(`/setup/calibration/api/continuous_servo/${testPartId}/reset`)
            .send({})
            .expect(200);

        expect(response.body).to.have.property('success', true);
        expect(response.body).to.have.property('message').that.includes('reset successfully');

        // Verify calibration is reset
        const statusResponse = await request(BASE_URL)
            .get(`/setup/calibration/api/continuous_servo/${testPartId}/status`)
            .expect(200);

        expect(statusResponse.body.status).to.have.property('exists', false);
        expect(statusResponse.body.status).to.have.property('pulseCalibrated', false);
        expect(statusResponse.body.status).to.have.property('positionsCalibrated', false);
    });

    it('should reject invalid pulse types', async function() {
        await request(BASE_URL)
            .post(`/setup/calibration/api/continuous_servo/${testPartId}/save-pulse`)
            .send({
                pulseType: 'invalid',
                pulseUs: 1500
            })
            .expect(400);
    });

    it('should reject invalid pulse widths', async function() {
        await request(BASE_URL)
            .post(`/setup/calibration/api/continuous_servo/${testPartId}/save-pulse`)
            .send({
                pulseType: 'stop',
                pulseUs: 3000  // Too high
            })
            .expect(400);

        await request(BASE_URL)
            .post(`/setup/calibration/api/continuous_servo/${testPartId}/save-pulse`)
            .send({
                pulseType: 'stop',
                pulseUs: 300   // Too low
            })
            .expect(400);
    });

    it('should reject invalid jog directions', async function() {
        await request(BASE_URL)
            .post(`/setup/calibration/api/continuous_servo/${testPartId}/jog`)
            .send({
                direction: 'invalid',
                speed: 50,
                duration: 500
            })
            .expect(400);
    });

    it('should reject calibration for non-existent part', async function() {
        await request(BASE_URL)
            .get('/setup/calibration/continuous_servo/99999')
            .expect(404);
    });

    it('should reject calibration for non-continuous servo', async function() {
        // This would need a standard servo part to test against
        // For now, we'll test with an invalid part type
        await request(BASE_URL)
            .get('/setup/calibration/continuous_servo/1') // Assuming part 1 is not a continuous servo
            .expect(400);
    });
});
