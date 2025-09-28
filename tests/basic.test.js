/**
 * Basic MonsterBox 4.0 Tests
 * Verify core functionality works
 */

import { expect } from 'chai';
import request from 'supertest';

// Use the running server instead of importing the app
const BASE_URL = 'http://127.0.0.1:3100';

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

    it('should serve the setup parts page', async () => {
        const response = await request(BASE_URL)
            .get('/setup/parts')
            .expect(200);
        expect(response.text).to.include('Setup Parts');
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

    describe('Characters', () => {
        it('should serve the characters setup page', async () => {
            const res = await request(BASE_URL).get('/setup/characters').expect(200);
            expect(res.text).to.include('Setup Characters');
        });

        it('should list characters and current selection', async () => {
            const list = await request(BASE_URL).get('/setup/characters/api/characters').expect(200);
            expect(list.body).to.have.property('success', true);
            expect(list.body.characters).to.be.an('array');

            const cur = await request(BASE_URL).get('/setup/characters/api/current').expect(200);
            expect(cur.body).to.have.property('success', true);
            expect(cur.body).to.have.property('selectedCharacter');
        });

        it('should set selected character', async () => {
            const list = await request(BASE_URL).get('/setup/characters/api/characters').expect(200);
            const id = list.body.characters && list.body.characters.length ? list.body.characters[0].id : 1;
            const sel = await request(BASE_URL).post('/setup/characters/api/select').send({ id }).expect(200);
            expect(sel.body).to.have.property('success', true);
            expect(sel.body).to.have.property('selectedCharacter', id);
        });

        it('should reject creating character without name', async () => {
            await request(BASE_URL)
                .post('/setup/characters/api/characters')
                .send({})
                .expect(400);
        });

        it('should reject updating character name to empty', async () => {
            // create a temp character
            const created = await request(BASE_URL)
                .post('/setup/characters/api/characters')
                .set('Connection', 'close')
                .send({ name: 'Temp' })
                .expect(201);
            const tempId = created.body && created.body.character ? created.body.character.id : null;
            expect(tempId).to.be.a('number');

            // attempt to update to empty name
            await request(BASE_URL)
                .put('/setup/characters/api/characters/' + tempId)
                .set('Connection', 'close')
                .send({ name: '' })
                .expect(400);

            // cleanup
            await request(BASE_URL)
                .delete('/setup/characters/api/characters/' + tempId)
                .set('Connection', 'close')
                .expect(200);
        });

        it('should prevent deleting the currently selected character', async () => {
            const cur = await request(BASE_URL)
                .get('/setup/characters/api/current')
                .set('Connection', 'close')
                .expect(200);
            const selectedId = cur.body.selectedCharacter;
            await request(BASE_URL)
                .delete('/setup/characters/api/characters/' + selectedId)
                .set('Connection', 'close')
                .expect(function (res) {
                    if (res.status !== 400 && res.status !== 404) {
                        throw new Error('Expected 400 (protected delete) or 404 (not found), got ' + res.status);
                    }
                });
        });
    });

    describe('Setup Placeholder Pages', () => {
        it('should serve the system setup page', async () => {
            const res = await request(BASE_URL).get('/setup/system').expect(200);
            expect(res.text).to.include('Setup System');
        });

        it('should serve the audio setup page', async () => {
            const res = await request(BASE_URL).get('/setup/audio').expect(200);
            expect(res.text).to.include('Setup Audio');
        });

        it('should serve the webcam setup page', async () => {
            const res = await request(BASE_URL).get('/setup/webcam').expect(200);
            expect(res.text).to.include('Setup Webcam');
        });

        it('should serve the super powers setup page', async () => {
            const res = await request(BASE_URL).get('/setup/super-powers').expect(200);
            expect(res.text).to.include('Setup Super Powers');
        });

        it('should serve the calibration setup page', async () => {
            const res = await request(BASE_URL).get('/setup/calibration').expect(200);
            expect(res.text).to.include('Setup Calibration');
        });

    });

});
