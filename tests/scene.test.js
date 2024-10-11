const chai = require('chai');
const chaiHttp = require('chai-http');
const { expect } = chai;
const fs = require('fs').promises;
const path = require('path');
const express = require('express');
const sceneRoutes = require('../routes/sceneRoutes');

chai.use(chaiHttp);

describe('Scene Management', () => {
  const testDataPath = path.join(__dirname, '../data/scenes.json');
  let originalData;
  let createdSceneId;
  let app;

  before(async () => {
    process.env.NODE_ENV = 'test';

    // Create a new Express app instance for testing
    app = express();
    app.use(express.json());
    app.use(express.urlencoded({ extended: true }));
    app.use('/scenes', sceneRoutes);

    // Save original data
    try {
      originalData = await fs.readFile(testDataPath, 'utf8');
    } catch (error) {
      console.log('No existing scenes.json file found. This is okay for a fresh test.');
    }
  });

  after(async () => {
    // Clean up: Delete the created scene
    if (createdSceneId) {
      try {
        let data = await fs.readFile(testDataPath, 'utf8');
        let scenes = JSON.parse(data);
        scenes = scenes.filter(scene => scene.id !== createdSceneId);
        await fs.writeFile(testDataPath, JSON.stringify(scenes, null, 2));
      } catch (error) {
        console.error('Error cleaning up test scene:', error);
      }
    }

    // Restore original data
    if (originalData) {
      await fs.writeFile(testDataPath, originalData);
    } else {
      // If there was no original file, delete the test file
      try {
        await fs.unlink(testDataPath);
      } catch (error) {
        console.log('Error deleting test scenes.json file:', error);
      }
    }

    delete process.env.NODE_ENV;
  });

  it('should create and save a new scene with two Sound steps and a Pause step', (done) => {
    const testScene = {
      character_id: 1,
      scene_name: 'Test Scene',
      'steps[0][type]': 'sound',
      'steps[0][name]': 'Test Sound 1',
      'steps[0][sound_id]': '1',
      'steps[1][type]': 'sound',
      'steps[1][name]': 'Test Sound 2',
      'steps[1][sound_id]': '2',
      'steps[2][type]': 'pause',
      'steps[2][name]': 'Test Pause',
      'steps[2][duration]': '1000'
    };

    chai.request(app)
      .post('/scenes')
      .send(testScene)
      .end((err, res) => {
        if (err) {
          console.error('Test error:', err);
          return done(err);
        }
        try {
          expect(res).to.have.status(200);
          expect(res.body).to.be.an('object');
          expect(res.body.scene_name).to.equal('Test Scene');
          expect(res.body.character_id).to.equal(1);
          expect(res.body.steps).to.be.an('array').with.lengthOf(3);
          expect(res.body.steps[0]).to.deep.include({ type: 'sound', name: 'Test Sound 1', sound_id: '1' });
          expect(res.body.steps[1]).to.deep.include({ type: 'sound', name: 'Test Sound 2', sound_id: '2' });
          expect(res.body.steps[2]).to.deep.include({ type: 'pause', name: 'Test Pause', duration: '1000' });

          createdSceneId = res.body.id; // Save the ID for cleanup and next test

          // Verify the scene was actually saved to the file
          fs.readFile(testDataPath, 'utf8')
            .then(data => {
              const scenes = JSON.parse(data);
              const savedScene = scenes.find(scene => scene.id === createdSceneId);
              expect(savedScene).to.exist;
              expect(savedScene.steps).to.be.an('array').with.lengthOf(3);
              expect(savedScene.steps[0]).to.deep.include({ type: 'sound', name: 'Test Sound 1', sound_id: '1' });
              expect(savedScene.steps[1]).to.deep.include({ type: 'sound', name: 'Test Sound 2', sound_id: '2' });
              expect(savedScene.steps[2]).to.deep.include({ type: 'pause', name: 'Test Pause', duration: '1000' });
              done();
            })
            .catch(error => {
              console.error('Error reading scenes file:', error);
              done(error);
            });
        } catch (assertionError) {
          console.error('Assertion error:', assertionError);
          done(assertionError);
        }
      });
  });

  it('should display saved scenes in the Scenes form', (done) => {
    chai.request(app)
      .get('/scenes')
      .query({ characterId: 1 })
      .end((err, res) => {
        if (err) {
          console.error('Test error:', err);
          return done(err);
        }
        try {
          expect(res).to.have.status(200);
          expect(res.body).to.be.an('object');
          expect(res.body.scenes).to.be.an('array');
          
          const createdScene = res.body.scenes.find(scene => scene.id === createdSceneId);
          expect(createdScene).to.exist;
          expect(createdScene.scene_name).to.equal('Test Scene');
          expect(createdScene.character_id).to.equal(1);
          expect(createdScene.steps).to.be.an('array').with.lengthOf(3);
          expect(createdScene.steps[0]).to.deep.include({ type: 'sound', name: 'Test Sound 1', sound_id: '1' });
          expect(createdScene.steps[1]).to.deep.include({ type: 'sound', name: 'Test Sound 2', sound_id: '2' });
          expect(createdScene.steps[2]).to.deep.include({ type: 'pause', name: 'Test Pause', duration: '1000' });

          done();
        } catch (assertionError) {
          console.error('Assertion error:', assertionError);
          done(assertionError);
        }
      });
  });
});
