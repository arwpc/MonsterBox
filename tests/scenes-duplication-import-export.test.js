/**
 * Scene Duplication and Import/Export Tests
 */
import { expect } from 'chai';
import axios from 'axios';

const BASE_URL = 'http://localhost:3000';
const API_URL = `${BASE_URL}/scenes/api`;

describe('Scene Duplication and Import/Export', function() {
  this.timeout(10000);
  let testSceneId;

  before(async () => {
    // Create a test scene
    const res = await axios.post(API_URL, {
      name: 'Original Test Scene',
      steps: [
        { type: 'wait', duration: 1000 },
        { type: 'wait', duration: 2000 }
      ]
    });
    testSceneId = res.data.scene.id;
  });

  after(async () => {
    // Cleanup: delete all test scenes
    try {
      const scenes = await axios.get(API_URL);
      for (const scene of scenes.data.scenes) {
        if (scene.name && (scene.name.includes('Test Scene') || scene.name.includes('Copy') || scene.name.includes('Imported'))) {
          await axios.delete(`${API_URL}/${scene.id}`);
        }
      }
    } catch (e) {
      // Ignore cleanup errors
    }
  });

  describe('POST /scenes/api/:id/duplicate', () => {
    it('should duplicate a scene with default name', async () => {
      const res = await axios.post(`${API_URL}/${testSceneId}/duplicate`);
      
      expect(res.status).to.equal(200);
      expect(res.data).to.have.property('success', true);
      expect(res.data).to.have.property('scene');
      expect(res.data.scene).to.have.property('id');
      expect(res.data.scene.id).to.not.equal(testSceneId);
      expect(res.data.scene).to.have.property('name', 'Original Test Scene (Copy)');
      expect(res.data.scene).to.have.property('duplicatedFrom', testSceneId);
      expect(res.data.scene.steps).to.be.an('array');
      expect(res.data.scene.steps.length).to.equal(2);
    });

    it('should duplicate a scene with custom name', async () => {
      const res = await axios.post(`${API_URL}/${testSceneId}/duplicate`, {
        name: 'Custom Duplicate Name'
      });
      
      expect(res.status).to.equal(200);
      expect(res.data.scene).to.have.property('name', 'Custom Duplicate Name');
      expect(res.data.scene).to.have.property('duplicatedFrom', testSceneId);
    });

    it('should deep copy steps (not reference)', async () => {
      const res = await axios.post(`${API_URL}/${testSceneId}/duplicate`);
      const duplicate = res.data.scene;
      
      // Modify the duplicate's steps
      duplicate.steps[0].duration = 9999;
      await axios.put(`${API_URL}/${duplicate.id}`, duplicate);
      
      // Verify original is unchanged
      const originalRes = await axios.get(API_URL);
      const original = originalRes.data.scenes.find(s => s.id === testSceneId);
      expect(original.steps[0].duration).to.equal(1000);
    });

    it('should return 404 if scene not found', async () => {
      try {
        await axios.post(`${API_URL}/99999/duplicate`);
        expect.fail('Should have thrown error');
      } catch (e) {
        expect(e.response.status).to.equal(404);
        expect(e.response.data).to.have.property('success', false);
        expect(e.response.data.error).to.include('not found');
      }
    });
  });

  describe('GET /scenes/api/export', () => {
    it('should export all scenes', async () => {
      const res = await axios.get(`${API_URL}/export`);
      
      expect(res.status).to.equal(200);
      expect(res.data).to.have.property('version');
      expect(res.data).to.have.property('exported');
      expect(res.data).to.have.property('scenes');
      expect(res.data.scenes).to.be.an('array');
      expect(res.data.scenes.length).to.be.greaterThan(0);
    });

    it('should include Content-Disposition header', async () => {
      const res = await axios.get(`${API_URL}/export`);
      
      expect(res.headers['content-disposition']).to.exist;
      expect(res.headers['content-disposition']).to.include('attachment');
      expect(res.headers['content-disposition']).to.include('scenes_export_');
      expect(res.headers['content-disposition']).to.include('.json');
    });

    it('should export scenes with all required fields', async () => {
      const res = await axios.get(`${API_URL}/export`);
      const scenes = res.data.scenes;
      
      scenes.forEach(scene => {
        expect(scene).to.have.property('id');
        expect(scene).to.have.property('name');
        expect(scene).to.have.property('steps');
        expect(scene.steps).to.be.an('array');
      });
    });
  });

  describe('POST /scenes/api/import', () => {
    it('should import new scenes', async () => {
      const importData = {
        version: '5.0',
        scenes: [
          {
            id: 9001,
            name: 'Imported Test Scene 1',
            steps: [{ type: 'wait', duration: 500 }]
          },
          {
            id: 9002,
            name: 'Imported Test Scene 2',
            steps: [{ type: 'wait', duration: 1000 }]
          }
        ]
      };
      
      const res = await axios.post(`${API_URL}/import`, importData);
      
      expect(res.status).to.equal(200);
      expect(res.data).to.have.property('success', true);
      expect(res.data).to.have.property('imported', 2);
      expect(res.data).to.have.property('updated', 0);
      expect(res.data).to.have.property('skipped', 0);
      expect(res.data).to.have.property('total', 2);
    });

    it('should skip existing scenes when overwrite=false', async () => {
      const importData = {
        version: '5.0',
        scenes: [
          {
            id: testSceneId,
            name: 'Should Be Skipped',
            steps: []
          }
        ],
        overwrite: false
      };
      
      const res = await axios.post(`${API_URL}/import`, importData);
      
      expect(res.data).to.have.property('imported', 0);
      expect(res.data).to.have.property('updated', 0);
      expect(res.data).to.have.property('skipped', 1);
      
      // Verify original scene unchanged
      const scenesRes = await axios.get(API_URL);
      const original = scenesRes.data.scenes.find(s => s.id === testSceneId);
      expect(original.name).to.equal('Original Test Scene');
    });

    it('should update existing scenes when overwrite=true', async () => {
      const importData = {
        version: '5.0',
        scenes: [
          {
            id: testSceneId,
            name: 'Updated via Import',
            steps: [{ type: 'wait', duration: 3000 }]
          }
        ],
        overwrite: true
      };
      
      const res = await axios.post(`${API_URL}/import`, importData);
      
      expect(res.data).to.have.property('imported', 0);
      expect(res.data).to.have.property('updated', 1);
      expect(res.data).to.have.property('skipped', 0);
      
      // Verify scene was updated
      const scenesRes = await axios.get(API_URL);
      const updated = scenesRes.data.scenes.find(s => s.id === testSceneId);
      expect(updated.name).to.equal('Updated via Import');
      expect(updated.steps[0].duration).to.equal(3000);
      
      // Restore original for other tests
      await axios.put(`${API_URL}/${testSceneId}`, {
        name: 'Original Test Scene',
        steps: [
          { type: 'wait', duration: 1000 },
          { type: 'wait', duration: 2000 }
        ]
      });
    });

    it('should return 400 if scenes array missing', async () => {
      try {
        await axios.post(`${API_URL}/import`, { version: '5.0' });
        expect.fail('Should have thrown error');
      } catch (e) {
        expect(e.response.status).to.equal(400);
        expect(e.response.data).to.have.property('success', false);
        expect(e.response.data.error).to.include('scenes array required');
      }
    });

    it('should handle mixed import (new + existing)', async () => {
      const importData = {
        version: '5.0',
        scenes: [
          {
            id: 9003,
            name: 'New Scene',
            steps: []
          },
          {
            id: testSceneId,
            name: 'Existing Scene',
            steps: []
          }
        ],
        overwrite: false
      };
      
      const res = await axios.post(`${API_URL}/import`, importData);
      
      expect(res.data).to.have.property('imported', 1);
      expect(res.data).to.have.property('skipped', 1);
      expect(res.data).to.have.property('total', 2);
    });
  });
});

