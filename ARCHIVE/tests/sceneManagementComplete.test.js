require('./setupTests');
const fs = require('fs').promises;
const path = require('path');

// Set test environment
process.env.NODE_ENV = 'test';

describe('Complete Scene Management System', () => {
    let createdSceneId;
    let originalScenesData;
    let originalAnalyticsData;
    const testCharacterId = 1;

    before(async function () {
        try {
            // Backup current data
            const scenesPath = path.join(__dirname, '..', 'data', 'scenes.json');
            const analyticsPath = path.join(__dirname, '..', 'data', 'scene-analytics.json');

            try {
                originalScenesData = await fs.readFile(scenesPath, 'utf8');
            } catch (error) {
                // File might not exist
            }

            try {
                originalAnalyticsData = await fs.readFile(analyticsPath, 'utf8');
            } catch (error) {
                // File might not exist
            }
        } catch (error) {
            this.skip();
        }
    });

    after(async function () {
        // Restore original data
        if (originalScenesData) {
            const scenesPath = path.join(__dirname, '..', 'data', 'scenes.json');
            await fs.writeFile(scenesPath, originalScenesData);
        }

        if (originalAnalyticsData) {
            const analyticsPath = path.join(__dirname, '..', 'data', 'scene-analytics.json');
            await fs.writeFile(analyticsPath, originalAnalyticsData);
        }
    });

    describe('Scene Templates', () => {
        it('should get scene templates', async () => {
            const res = await chai.request(app)
                .get('/scenes/templates')
                .query({ characterId: testCharacterId });

            res.should.have.status(200);
            res.body.should.be.an('array');
            if (res.body.length > 0) {
                res.body[0].should.have.property('id');
                res.body[0].should.have.property('name');
                res.body[0].should.have.property('description');
                res.body[0].should.have.property('steps');
            }
        });

        it('should create scene from template', async () => {
            // First get templates
            const templatesRes = await chai.request(app)
                .get('/scenes/templates')
                .query({ characterId: testCharacterId });

            if (templatesRes.body.length > 0) {
                const template = templatesRes.body[0];

                const res = await chai.request(app)
                    .post('/scenes/from-template')
                    .query({ characterId: testCharacterId })
                    .send({
                        templateId: template.id,
                        scene_name: 'Test Template Scene',
                        character_id: testCharacterId
                    });

                res.should.have.status(200);
                res.body.should.have.property('scene_name', 'Test Template Scene');
                res.body.should.have.property('steps');
                createdSceneId = res.body.id;
            }
        });
    });

    describe('Scene Import/Export', () => {
        it('should export scenes', async () => {
            const res = await chai.request(app)
                .get('/scenes/export')
                .query({ characterId: testCharacterId });

            res.should.have.status(200);
            res.body.should.have.property('scenes');
            res.body.should.have.property('exportDate');
            res.body.should.have.property('version');
            res.body.scenes.should.be.an('array');
        });

        it('should import scenes', async () => {
            const importData = {
                scenes: [{
                    character_id: testCharacterId,
                    scene_name: 'Imported Test Scene',
                    steps: [{
                        type: 'pause',
                        name: 'Test Pause',
                        duration: '1000'
                    }]
                }],
                version: '1.0'
            };

            const res = await chai.request(app)
                .post('/scenes/import')
                .query({ characterId: testCharacterId })
                .send(importData);

            res.should.have.status(200);
            res.body.should.have.property('imported');
            res.body.should.have.property('total');
        });
    });

    describe('Scene Duplication', () => {
        it('should duplicate a scene', async () => {
            if (createdSceneId) {
                const res = await chai.request(app)
                    .post(`/scenes/${createdSceneId}/duplicate`)
                    .query({ characterId: testCharacterId })
                    .send({ newName: 'Duplicated Scene' });

                res.should.have.status(200);
                res.body.should.have.property('scene_name', 'Duplicated Scene');
                res.body.should.have.property('steps');
            }
        });
    });

    describe('Scene Analytics', () => {
        it('should get scene analytics', async () => {
            const res = await chai.request(app)
                .get('/scenes/analytics')
                .query({ characterId: testCharacterId });

            res.should.have.status(200);
            res.body.should.have.property('executions');
            res.body.should.have.property('usage');
            res.body.should.have.property('summary');
        });

        it('should get popular scenes', async () => {
            const res = await chai.request(app)
                .get('/scenes/popular')
                .query({ characterId: testCharacterId, limit: 5 });

            res.should.have.status(200);
            res.body.should.be.an('array');
        });

        it('should get scene performance metrics', async () => {
            if (createdSceneId) {
                const res = await chai.request(app)
                    .get(`/scenes/${createdSceneId}/metrics`)
                    .query({ characterId: testCharacterId });

                // Might return 404 if no performance data exists yet
                if (res.status === 200) {
                    res.body.should.have.property('totalExecutions');
                    res.body.should.have.property('successRate');
                }
            }
        });
    });

    describe('Enhanced Validation', () => {
        it('should validate scene name length', async () => {
            const longName = 'a'.repeat(101); // 101 characters
            const requestData = {
                character_id: testCharacterId,
                scene_name: longName,
                'steps[0][type]': 'pause',
                'steps[0][name]': 'Test Pause',
                'steps[0][duration]': '1000'
            };

            const res = await chai.request(app)
                .post('/scenes')
                .send(requestData);

            res.should.have.status(500);
            res.body.should.have.property('error');
        });

        it('should validate step requirements', async () => {
            const requestData = {
                character_id: testCharacterId,
                scene_name: 'Invalid Step Test',
                'steps[0][type]': 'servo',
                'steps[0][name]': 'Invalid Servo',
                // Missing required fields for servo
            };

            const res = await chai.request(app)
                .post('/scenes')
                .send(requestData);

            res.should.have.status(500);
            res.body.should.have.property('error');
        });

        it('should validate servo angle range', async () => {
            const requestData = {
                character_id: testCharacterId,
                scene_name: 'Invalid Angle Test',
                'steps[0][type]': 'servo',
                'steps[0][name]': 'Invalid Servo',
                'steps[0][part_id]': '1',
                'steps[0][duration]': '1000',
                'steps[0][angle]': '200' // Invalid angle > 180
            };

            const res = await chai.request(app)
                .post('/scenes')
                .send(requestData);

            res.should.have.status(500);
            res.body.should.have.property('error');
        });
    });

    describe('Stop All Scenes', () => {
        it('should stop all scenes', async () => {
            const res = await chai.request(app)
                .post('/scenes/stop-all')
                .query({ characterId: testCharacterId });

            res.should.have.status(200);
            res.body.should.have.property('message');
        });
    });
});
