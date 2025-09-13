/**
 * Basic MonsterBox 4.0 Tests
 * Verify core functionality works
 */

import { expect } from 'chai';
import request from 'supertest';

// Use the running server instead of importing the app
const BASE_URL = 'http://localhost:3000';

describe('MonsterBox 4.0 Basic Tests', () => {

    describe('Server Routes', () => {
        it('should serve the main dashboard', async () => {
            const response = await request(BASE_URL)
                .get('/')
                .expect(200);

            expect(response.text).to.include('MonsterBox 4.0');
        });

        it('should serve the setup poses page', async () => {
            const response = await request(BASE_URL)
                .get('/setup/poses')
                .expect(200);

            expect(response.text).to.include('Setup Poses');
        });

        it('should serve the live dashboard', async () => {
            const response = await request(BASE_URL)
                .get('/live')
                .expect(200);

            expect(response.text).to.include('Live Dashboard');
        });
    });

    describe('Poses API', () => {
        it('should return poses data', async () => {
            const response = await request(BASE_URL)
                .get('/poses')
                .expect(200);

            expect(response.body).to.have.property('success', true);
            expect(response.body).to.have.property('poses');
            expect(response.body.poses).to.be.an('array');
        });

        it('should return pose templates', async () => {
            const response = await request(BASE_URL)
                .get('/poses/templates')
                .expect(200);

            expect(response.body).to.have.property('success', true);
            expect(response.body).to.have.property('templates');
        });

        it('should create pose from template', async () => {
            const poseData = {
                templateName: 'elbow',
                option: 'Half Bend',
                partId: '30'
            };

            const response = await request(BASE_URL)
                .post('/poses/from-template')
                .send(poseData)
                .expect(201);

            expect(response.body).to.have.property('success', true);
            expect(response.body).to.have.property('pose');
            expect(response.body.pose).to.have.property('name');
        });
    });

    describe('Hardware Services', () => {
        it('should validate servo arguments', async () => {
            const { validateArgs } = await import('../services/hardwareService/exec.js');

            expect(() => validateArgs(['18', '1500'], 2)).to.not.throw();
            expect(() => validateArgs(['18'], 2)).to.throw();
            expect(() => validateArgs(['18', '..'], 2)).to.throw();
        });
    });

    describe('Error Handling', () => {
        it('should return 404 for non-existent routes', async () => {
            await request(BASE_URL)
                .get('/non-existent-route')
                .expect(404);
        });

        it('should return 404 for non-existent pose', async () => {
            await request(BASE_URL)
                .get('/poses/99999')
                .expect(404);
        });
    });
});
