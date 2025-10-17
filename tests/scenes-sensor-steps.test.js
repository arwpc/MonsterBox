/**
 * Sensor Step Type Tests
 * Tests for sensor step execution in scenes
 */

import { expect } from 'chai';
import axios from 'axios';

const BASE_URL = 'http://localhost:3000';
const SCENES_URL = `${BASE_URL}/scenes/api`;
const PARTS_URL = `${BASE_URL}/setup/parts/api/parts`;

describe('Sensor Step Type', function() {
  this.timeout(60000);

  const testCharacterId = 7;
  let testSensorId = null;
  let testSceneId = null;

  before(async function() {
    // Create a test motion sensor part
    const sensorResponse = await axios.post(PARTS_URL, {
      name: 'Test Motion Sensor',
      type: 'motion_sensor',
      characterId: testCharacterId,
      pin: 26,
      description: 'Test PIR sensor for scene testing',
      enabled: true
    });

    testSensorId = sensorResponse.data.part.id;
    console.log(`Created test sensor with ID: ${testSensorId}`);
  });

  after(async function() {
    // Clean up test sensor
    if (testSensorId) {
      try {
        await axios.delete(`${PARTS_URL}/${testSensorId}`);
      } catch (e) {
        // Ignore errors
      }
    }

    // Clean up test scene
    if (testSceneId) {
      try {
        await axios.delete(`${SCENES_URL}/${testSceneId}`);
      } catch (e) {
        // Ignore errors
      }
    }
  });

  describe('Sensor Step Execution', function() {
    it('should execute a sensor read step', async function() {
      // Create scene with sensor step
      const sceneResponse = await axios.post(SCENES_URL, {
        name: 'Sensor Read Test Scene',
        steps: [
          {
            type: 'sensor',
            sensorId: testSensorId,
            action: 'read'
          }
        ]
      });

      testSceneId = sceneResponse.data.scene.id;

      // Execute scene
      const execResponse = await axios.post(`${SCENES_URL}/${testSceneId}/play?dryRun=true`);

      expect(execResponse.data.success).to.be.true;
      expect(execResponse.data.steps).to.equal(1);
    });

    it('should handle sensor step with partId instead of sensorId', async function() {
      // Create scene with sensor step using partId
      const sceneResponse = await axios.post(SCENES_URL, {
        name: 'Sensor PartId Test Scene',
        steps: [
          {
            type: 'sensor',
            partId: testSensorId,
            action: 'read'
          }
        ]
      });

      const sceneId = sceneResponse.data.scene.id;

      // Execute scene
      const execResponse = await axios.post(`${SCENES_URL}/${sceneId}/play?dryRun=true`);

      expect(execResponse.data.success).to.be.true;
      expect(execResponse.data.steps).to.equal(1);

      // Clean up
      await axios.delete(`${SCENES_URL}/${sceneId}`);
    });

    it('should fail if sensor is not found', async function() {
      // Create scene with non-existent sensor
      const sceneResponse = await axios.post(SCENES_URL, {
        name: 'Invalid Sensor Test Scene',
        steps: [
          {
            type: 'sensor',
            sensorId: 99999,
            action: 'read'
          }
        ]
      });

      const sceneId = sceneResponse.data.scene.id;

      // Execute scene - should fail
      try {
        await axios.post(`${SCENES_URL}/${sceneId}/play?dryRun=false`);
        expect.fail('Should have thrown error');
      } catch (error) {
        expect(error.response.status).to.equal(500);
        expect(error.response.data.success).to.be.false;
        expect(error.response.data.error).to.include('Sensor not found');
      }

      // Clean up
      await axios.delete(`${SCENES_URL}/${sceneId}`);
    });

    it('should fail if sensorId is missing', async function() {
      // Create scene without sensorId
      const sceneResponse = await axios.post(SCENES_URL, {
        name: 'Missing SensorId Test Scene',
        steps: [
          {
            type: 'sensor',
            action: 'read'
          }
        ]
      });

      const sceneId = sceneResponse.data.scene.id;

      // Execute scene - should fail
      try {
        await axios.post(`${SCENES_URL}/${sceneId}/play?dryRun=false`);
        expect.fail('Should have thrown error');
      } catch (error) {
        expect(error.response.status).to.equal(500);
        expect(error.response.data.success).to.be.false;
        expect(error.response.data.error).to.include('requires sensorId or partId');
      }

      // Clean up
      await axios.delete(`${SCENES_URL}/${sceneId}`);
    });
  });

  describe('Wait For Motion', function() {
    it('should support waitForMotion parameter in dry run', async function() {
      // Create scene with waitForMotion
      const sceneResponse = await axios.post(SCENES_URL, {
        name: 'Wait For Motion Test Scene',
        steps: [
          {
            type: 'sensor',
            sensorId: testSensorId,
            waitForMotion: true,
            timeout: 5000
          }
        ]
      });

      const sceneId = sceneResponse.data.scene.id;

      // Execute scene in dry run mode
      const execResponse = await axios.post(`${SCENES_URL}/${sceneId}/play?dryRun=true`);

      expect(execResponse.data.success).to.be.true;
      expect(execResponse.data.steps).to.equal(1);

      // Clean up
      await axios.delete(`${SCENES_URL}/${sceneId}`);
    });
  });

  describe('Threshold Checking', function() {
    it('should support threshold parameter in dry run', async function() {
      // Create scene with threshold
      const sceneResponse = await axios.post(SCENES_URL, {
        name: 'Threshold Test Scene',
        steps: [
          {
            type: 'sensor',
            sensorId: testSensorId,
            threshold: true
          }
        ]
      });

      const sceneId = sceneResponse.data.scene.id;

      // Execute scene in dry run mode
      const execResponse = await axios.post(`${SCENES_URL}/${sceneId}/play?dryRun=true`);

      expect(execResponse.data.success).to.be.true;
      expect(execResponse.data.steps).to.equal(1);

      // Clean up
      await axios.delete(`${SCENES_URL}/${sceneId}`);
    });
  });

  describe('Integration with Other Steps', function() {
    it('should execute sensor step in a multi-step scene', async function() {
      // Create scene with multiple steps including sensor
      const sceneResponse = await axios.post(SCENES_URL, {
        name: 'Multi-Step Sensor Scene',
        steps: [
          {
            type: 'wait',
            duration: 100
          },
          {
            type: 'sensor',
            sensorId: testSensorId,
            action: 'read'
          },
          {
            type: 'wait',
            duration: 100
          }
        ]
      });

      const sceneId = sceneResponse.data.scene.id;

      // Execute scene
      const execResponse = await axios.post(`${SCENES_URL}/${sceneId}/play?dryRun=true`);

      expect(execResponse.data.success).to.be.true;
      expect(execResponse.data.steps).to.equal(3);

      // Clean up
      await axios.delete(`${SCENES_URL}/${sceneId}`);
    });
  });
});

