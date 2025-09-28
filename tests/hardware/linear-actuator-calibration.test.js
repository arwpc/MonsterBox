/**
 * Linear Actuator Calibration Tests
 * Tests for the linear actuator calibration functionality
 */

import { expect } from 'chai';
import request from 'supertest';

const BASE_URL = 'http://127.0.0.1:3100';

describe('Linear Actuator Calibration', function() {
    this.timeout(10000);

    let testPartId;

    before(async function() {
        // Create a test linear actuator part
        const response = await request(BASE_URL)
            .post('/setup/parts/api/parts')
            .send({
                name: 'Test Calibration Actuator',
                type: 'linear_actuator',
                description: 'Test actuator for calibration',
                directionPin: 23,
                pwmPin: 12,
                maxExtension: 15000,
                maxRetraction: 15000
            })
            .expect(201);

        testPartId = response.body.part.id;
        console.log(`Created test part with ID: ${testPartId}`);
    });

    after(async function() {
        // Clean up test part
        if (testPartId) {
            await request(BASE_URL)
                .delete(`/setup/parts/api/parts/${testPartId}`)
                .expect(200);
        }
    });

    it('should render calibration page for linear actuator', async function() {
        const response = await request(BASE_URL)
            .get(`/setup/calibration/linear_actuator/${testPartId}`)
            .expect(200);

        expect(response.text).to.include('Calibrate Linear Actuator');
        expect(response.text).to.include('Test Calibration Actuator');
        expect(response.text).to.include('Jog Controls');
        expect(response.text).to.include('Save Positions');
    });

    it('should get calibration status (initially empty)', async function() {
        const response = await request(BASE_URL)
            .get(`/setup/calibration/api/linear_actuator/${testPartId}/status`)
            .expect(200);

        expect(response.body).to.have.property('success', true);
        expect(response.body.status).to.have.property('exists', false);
        expect(response.body.status).to.have.property('fullyCalibrated', false);
    });

    it('should save min position', async function() {
        const response = await request(BASE_URL)
            .post(`/setup/calibration/api/linear_actuator/${testPartId}/save-position`)
            .send({
                position: 'min',
                description: 'Fully retracted test position'
            })
            .expect(200);

        expect(response.body).to.have.property('success', true);
        expect(response.body).to.have.property('message').that.includes('Min position saved');
        expect(response.body.calibrationData).to.have.property('positions');
        expect(response.body.calibrationData.positions.min).to.have.property('calibrated', true);
    });

    it('should save max position', async function() {
        const response = await request(BASE_URL)
            .post(`/setup/calibration/api/linear_actuator/${testPartId}/save-position`)
            .send({
                position: 'max',
                description: 'Fully extended test position'
            })
            .expect(200);

        expect(response.body).to.have.property('success', true);
        expect(response.body).to.have.property('message').that.includes('Max position saved');
        expect(response.body.calibrationData.positions.max).to.have.property('calibrated', true);
    });

    it('should show fully calibrated status', async function() {
        const response = await request(BASE_URL)
            .get(`/setup/calibration/api/linear_actuator/${testPartId}/status`)
            .expect(200);

        expect(response.body.status).to.have.property('exists', true);
        expect(response.body.status).to.have.property('fullyCalibrated', true);
        expect(response.body.status).to.have.property('minCalibrated', true);
        expect(response.body.status).to.have.property('maxCalibrated', true);
    });

    it('should reset calibration', async function() {
        const response = await request(BASE_URL)
            .post(`/setup/calibration/api/linear_actuator/${testPartId}/reset`)
            .send({})
            .expect(200);

        expect(response.body).to.have.property('success', true);
        expect(response.body).to.have.property('message').that.includes('reset successfully');

        // Verify calibration is reset
        const statusResponse = await request(BASE_URL)
            .get(`/setup/calibration/api/linear_actuator/${testPartId}/status`)
            .expect(200);

        expect(statusResponse.body.status).to.have.property('exists', false);
        expect(statusResponse.body.status).to.have.property('fullyCalibrated', false);
    });

    it('should reject invalid position names', async function() {
        await request(BASE_URL)
            .post(`/setup/calibration/api/linear_actuator/${testPartId}/save-position`)
            .send({
                position: 'invalid',
                description: 'Invalid position'
            })
            .expect(400);
    });

    it('should reject calibration for non-existent part', async function() {
        await request(BASE_URL)
            .get('/setup/calibration/linear_actuator/99999')
            .expect(404);
    });
});
