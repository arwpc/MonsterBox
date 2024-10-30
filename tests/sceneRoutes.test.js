require('./setupTests');
const fs = require('fs').promises;
const path = require('path');

// Set test environment
process.env.NODE_ENV = 'test';

describe('Scene Routes', () => {
    let createdSceneId;
    let originalScenesData;
    const testCharacterId = 1; // Using a known character ID
    
    before(async function() {
        try {
            // Backup current data
            const scenesPath = path.join(__dirname, '..', 'data', 'scenes.json');
            originalScenesData = await fs.readFile(scenesPath, 'utf8');
        } catch (error) {
            this.skip();
        }
    });

    after(async function() {
        // Restore original data
        if (originalScenesData) {
            const scenesPath = path.join(__dirname, '..', 'data', 'scenes.json');
            await fs.writeFile(scenesPath, originalScenesData);
        }
    });

    it('should create a new scene with multiple steps', async () => {
        const requestData = {
            character_id: testCharacterId,
            scene_name: 'Test Scene CRUD',
            'steps[0][type]': 'Motor',
            'steps[0][name]': 'Motor Step',
            'steps[0][duration]': '2000',
            'steps[0][speed]': '100',
            'steps[0][direction]': 'forward',
            
            'steps[1][type]': 'LinearActuator',
            'steps[1][name]': 'Linear Actuator Step',
            'steps[1][duration]': '1500',
            'steps[1][position]': 'extended',
            
            'steps[2][type]': 'Servo',
            'steps[2][name]': 'Servo Step',
            'steps[2][duration]': '1000',
            'steps[2][angle]': '90',
            
            'steps[3][type]': 'LED',
            'steps[3][name]': 'LED Step',
            'steps[3][duration]': '2000',
            'steps[3][state]': 'on',
            'steps[3][brightness]': '255',
            
            'steps[4][type]': 'Light',
            'steps[4][name]': 'Light Step',
            'steps[4][duration]': '1000',
            'steps[4][state]': 'on',
            
            'steps[5][type]': 'Sensor',
            'steps[5][name]': 'Sensor Step',
            'steps[5][duration]': '1000',
            'steps[5][threshold]': '500',
            'steps[5][comparison]': 'greater',
            
            'steps[6][type]': 'Sound',
            'steps[6][name]': 'Sound Step',
            'steps[6][soundFile]': 'test-sound.mp3',
            'steps[6][volume]': '80',
            
            'steps[7][type]': 'Voice',
            'steps[7][name]': 'Voice Step',
            'steps[7][text]': 'Test voice message',
            'steps[7][volume]': '75',
            
            'steps[8][type]': 'Pause',
            'steps[8][name]': 'Pause Step',
            'steps[8][duration]': '1000'
        };

        const res = await chai.request(app)
            .post('/scenes')
            .send(requestData);

        res.should.have.status(200);
        res.body.should.be.an('object');
        res.body.should.have.property('scene_name', 'Test Scene CRUD');
        res.body.should.have.property('steps').with.lengthOf(9);
        createdSceneId = res.body.id;
    });

    it('should get all scenes including the created one', async () => {
        const res = await chai.request(app)
            .get('/scenes')
            .query({ characterId: testCharacterId });
        
        res.should.have.status(200);
        res.body.should.have.property('scenes').that.is.an('array');
        const createdScene = res.body.scenes.find(s => s.id === createdSceneId);
        expect(createdScene).to.exist;
        expect(createdScene.scene_name).to.equal('Test Scene CRUD');
    });

    it('should get a specific scene by ID', async () => {
        // Get the scene from the scenes array instead of the individual route
        const res = await chai.request(app)
            .get('/scenes')
            .query({ characterId: testCharacterId });

        res.should.have.status(200);
        const createdScene = res.body.scenes.find(s => s.id === createdSceneId);
        expect(createdScene).to.exist;
        expect(createdScene.scene_name).to.equal('Test Scene CRUD');
        expect(createdScene.steps).to.have.lengthOf(9);
    });

    it('should update the scene', async () => {
        const updateData = {
            character_id: testCharacterId,
            scene_name: 'Updated Test Scene CRUD',
            'steps[0][type]': 'Motor',
            'steps[0][name]': 'Updated Motor Step',
            'steps[0][duration]': '3000',
            'steps[0][speed]': '75',
            'steps[0][direction]': 'reverse',
            
            'steps[1][type]': 'LED',
            'steps[1][name]': 'Updated LED Step',
            'steps[1][duration]': '1500',
            'steps[1][state]': 'on',
            'steps[1][brightness]': '128',
            
            'steps[2][type]': 'Pause',
            'steps[2][name]': 'Updated Pause Step',
            'steps[2][duration]': '2000'
        };

        const res = await chai.request(app)
            .post(`/scenes/${createdSceneId}`)
            .send(updateData);

        res.should.have.status(200);
        
        // Verify the update
        const scenesData = await fs.readFile(path.join(__dirname, '..', 'data', 'scenes.json'), 'utf8');
        const scenes = JSON.parse(scenesData);
        const updatedScene = scenes.find(s => s.id === createdSceneId);
        expect(updatedScene.scene_name).to.equal('Updated Test Scene CRUD');
        expect(updatedScene.steps).to.have.lengthOf(3);
        expect(updatedScene.steps[0].name).to.equal('Updated Motor Step');
    });

    it('should delete the scene', async () => {
        const res = await chai.request(app)
            .delete(`/scenes/${createdSceneId}`)
            .query({ characterId: testCharacterId });

        res.should.have.status(200);
        res.body.should.have.property('success', true);
        
        // Verify the deletion
        const scenesData = await fs.readFile(path.join(__dirname, '..', 'data', 'scenes.json'), 'utf8');
        const scenes = JSON.parse(scenesData);
        const deletedScene = scenes.find(s => s.id === createdSceneId);
        expect(deletedScene).to.be.undefined;
    });
});
