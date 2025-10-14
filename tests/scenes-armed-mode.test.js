/**
 * Armed/Active Mode Tests
 * Tests for automated scene execution system
 */

import { expect } from 'chai';
import axios from 'axios';

const BASE_URL = 'http://localhost:3000';
const ARMED_MODE_URL = `${BASE_URL}/scenes/api/armed-mode`;

describe('Armed/Active Mode', function() {
  this.timeout(30000);

  const testCharacterId = 7;
  let testSceneIds = [];

  before(async function() {
    // Create test scenes
    const scene1 = await axios.post(`${BASE_URL}/scenes/api`, {
      name: 'Armed Mode Test Scene 1',
      steps: [
        { type: 'wait', duration: 100 }
      ]
    });
    
    const scene2 = await axios.post(`${BASE_URL}/scenes/api`, {
      name: 'Armed Mode Test Scene 2',
      steps: [
        { type: 'wait', duration: 100 }
      ]
    });

    testSceneIds = [scene1.data.scene.id, scene2.data.scene.id];
  });

  after(async function() {
    // Ensure system is disarmed
    try {
      await axios.post(`${ARMED_MODE_URL}/disarm`);
    } catch (e) {
      // Ignore errors
    }

    // Clean up test scenes
    for (const sceneId of testSceneIds) {
      try {
        await axios.delete(`${BASE_URL}/scenes/api/${sceneId}`);
      } catch (e) {
        // Ignore errors
      }
    }
  });

  describe('Status', function() {
    it('should return status when system is disarmed', async function() {
      const response = await axios.get(`${ARMED_MODE_URL}/status`);
      
      expect(response.data.success).to.be.true;
      expect(response.data.status).to.exist;
      expect(response.data.status.isArmed).to.be.false;
    });
  });

  describe('Arming', function() {
    afterEach(async function() {
      // Disarm after each test
      try {
        await axios.post(`${ARMED_MODE_URL}/disarm`);
      } catch (e) {
        // Ignore errors
      }
    });

    it('should arm the system with a playlist', async function() {
      const response = await axios.post(`${ARMED_MODE_URL}/arm`, {
        characterId: testCharacterId,
        sceneIds: testSceneIds
      });

      expect(response.data.success).to.be.true;
      expect(response.data.status.isArmed).to.be.true;
      expect(response.data.status.characterId).to.equal(testCharacterId);
      expect(response.data.status.playlist).to.deep.equal(testSceneIds);
    });

    it('should require character ID', async function() {
      try {
        await axios.post(`${ARMED_MODE_URL}/arm`, {
          sceneIds: testSceneIds
        });
        expect.fail('Should have thrown error');
      } catch (error) {
        expect(error.response.status).to.equal(400);
        expect(error.response.data.error).to.include('Character ID');
      }
    });

    it('should require at least one scene', async function() {
      try {
        await axios.post(`${ARMED_MODE_URL}/arm`, {
          characterId: testCharacterId,
          sceneIds: []
        });
        expect.fail('Should have thrown error');
      } catch (error) {
        expect(error.response.status).to.equal(400);
        expect(error.response.data.error).to.include('scene');
      }
    });

    it('should accept custom configuration', async function() {
      const response = await axios.post(`${ARMED_MODE_URL}/arm`, {
        characterId: testCharacterId,
        sceneIds: testSceneIds,
        config: {
          sceneDelay: 2000,
          maxRetries: 5
        }
      });

      expect(response.data.success).to.be.true;
      expect(response.data.status.config.sceneDelay).to.equal(2000);
      expect(response.data.status.config.maxRetries).to.equal(5);
    });
  });

  describe('Disarming', function() {
    it('should disarm the system', async function() {
      // First arm the system
      await axios.post(`${ARMED_MODE_URL}/arm`, {
        characterId: testCharacterId,
        sceneIds: testSceneIds
      });

      // Then disarm
      const response = await axios.post(`${ARMED_MODE_URL}/disarm`);

      expect(response.data.success).to.be.true;
      expect(response.data.message).to.include('disarmed');
    });

    it('should handle disarming when not armed', async function() {
      const response = await axios.post(`${ARMED_MODE_URL}/disarm`);

      expect(response.data.success).to.be.true;
      expect(response.data.message).to.include('not armed');
    });
  });

  describe('Playlist Management', function() {
    beforeEach(async function() {
      // Arm the system before each test
      await axios.post(`${ARMED_MODE_URL}/arm`, {
        characterId: testCharacterId,
        sceneIds: testSceneIds
      });
    });

    afterEach(async function() {
      // Disarm after each test
      try {
        await axios.post(`${ARMED_MODE_URL}/disarm`);
      } catch (e) {
        // Ignore errors
      }
    });

    it('should get current playlist', async function() {
      const response = await axios.get(`${ARMED_MODE_URL}/playlist`);

      expect(response.data.success).to.be.true;
      expect(response.data.playlist).to.deep.equal(testSceneIds);
    });

    it('should update playlist', async function() {
      const newPlaylist = [testSceneIds[1]];
      const response = await axios.post(`${ARMED_MODE_URL}/playlist`, {
        sceneIds: newPlaylist
      });

      expect(response.data.success).to.be.true;
      expect(response.data.playlist).to.deep.equal(newPlaylist);
    });
  });

  describe('Configuration', function() {
    beforeEach(async function() {
      // Arm the system before each test
      await axios.post(`${ARMED_MODE_URL}/arm`, {
        characterId: testCharacterId,
        sceneIds: testSceneIds
      });
    });

    afterEach(async function() {
      // Disarm after each test
      try {
        await axios.post(`${ARMED_MODE_URL}/disarm`);
      } catch (e) {
        // Ignore errors
      }
    });

    it('should update configuration', async function() {
      const response = await axios.post(`${ARMED_MODE_URL}/config`, {
        sceneDelay: 3000,
        maxRetries: 4,
        sceneTimeout: 30000
      });

      expect(response.data.success).to.be.true;
      expect(response.data.config.sceneDelay).to.equal(3000);
      expect(response.data.config.maxRetries).to.equal(4);
      expect(response.data.config.sceneTimeout).to.equal(30000);
    });
  });

  describe('Execution', function() {
    it('should execute scenes in the playlist', async function() {
      // Arm with short delay
      await axios.post(`${ARMED_MODE_URL}/arm`, {
        characterId: testCharacterId,
        sceneIds: testSceneIds,
        config: {
          sceneDelay: 500
        }
      });

      // Wait for at least one scene to execute
      await new Promise(resolve => setTimeout(resolve, 1500));

      // Check status
      const response = await axios.get(`${ARMED_MODE_URL}/status`);

      expect(response.data.status.isArmed).to.be.true;
      expect(response.data.status.currentScene).to.exist;

      // Disarm
      await axios.post(`${ARMED_MODE_URL}/disarm`);
    });

    it('should loop through playlist', async function() {
      // Arm with very short delay
      await axios.post(`${ARMED_MODE_URL}/arm`, {
        characterId: testCharacterId,
        sceneIds: testSceneIds,
        config: {
          sceneDelay: 300
        }
      });

      // Wait for multiple loops
      await new Promise(resolve => setTimeout(resolve, 3000));

      // Check status
      const response = await axios.get(`${ARMED_MODE_URL}/status`);

      expect(response.data.status.isArmed).to.be.true;
      expect(response.data.status.loopCount).to.be.at.least(1);

      // Disarm
      await axios.post(`${ARMED_MODE_URL}/disarm`);
    });
  });
});

