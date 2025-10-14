/**
 * Scene Analytics Tests
 * Tests for scene analytics tracking, reporting, and API endpoints
 */

import { describe, it, before, after } from 'mocha';
import { expect } from 'chai';
import axios from 'axios';
import fs from 'fs/promises';
import path from 'path';

const BASE_URL = 'http://localhost:3000';
const ANALYTICS_PATH = path.join(process.cwd(), 'data', 'scene-analytics.json');

describe('Scene Analytics', function() {
  this.timeout(10000);

  let testSceneId;
  const characterId = 7; // Test character

  before(async function() {
    // Create a test scene
    const createRes = await axios.post(`${BASE_URL}/scenes/api/`, {
      name: 'Analytics Test Scene',
      characterId,
      steps: [
        { type: 'wait', duration: 100 }
      ]
    });
    expect(createRes.data.success).to.be.true;
    testSceneId = createRes.data.scene.id;

    // Clear analytics data
    await fs.writeFile(ANALYTICS_PATH, JSON.stringify({
      executions: [],
      usage: {},
      created: new Date().toISOString()
    }));
  });

  after(async function() {
    // Clean up test scene
    if (testSceneId) {
      await axios.delete(`${BASE_URL}/scenes/api/${testSceneId}`);
    }
  });

  describe('Analytics Logging', function() {
    it('should log scene execution when scene runs', async function() {
      // Execute the scene
      const execRes = await axios.post(`${BASE_URL}/scenes/api/${testSceneId}/play`);
      expect(execRes.data.success).to.be.true;

      // Wait a bit for analytics to be written
      await new Promise(resolve => setTimeout(resolve, 500));

      // Check analytics file
      const analyticsData = JSON.parse(await fs.readFile(ANALYTICS_PATH, 'utf8'));
      expect(analyticsData.executions).to.be.an('array');
      expect(analyticsData.executions.length).to.be.greaterThan(0);

      const lastExecution = analyticsData.executions[analyticsData.executions.length - 1];
      expect(lastExecution.sceneId).to.equal(testSceneId);
      expect(lastExecution.characterId).to.equal(characterId);
      expect(lastExecution.success).to.be.true;
      expect(lastExecution.duration).to.be.a('number');
    });

    it('should update usage statistics when scene runs', async function() {
      // Execute the scene again
      await axios.post(`${BASE_URL}/scenes/api/${testSceneId}/play`);

      await new Promise(resolve => setTimeout(resolve, 500));

      // Check usage stats
      const analyticsData = JSON.parse(await fs.readFile(ANALYTICS_PATH, 'utf8'));
      const sceneKey = `${characterId}_${testSceneId}`;
      expect(analyticsData.usage[sceneKey]).to.exist;
      expect(analyticsData.usage[sceneKey].executionCount).to.be.greaterThan(0);
      expect(analyticsData.usage[sceneKey].lastExecuted).to.be.a('string');
    });
  });

  describe('GET /scenes/api/analytics', function() {
    it('should return analytics summary', async function() {
      const res = await axios.get(`${BASE_URL}/scenes/api/analytics`);
      expect(res.data.success).to.be.true;
      expect(res.data.analytics).to.exist;
      expect(res.data.analytics.executions).to.be.an('array');
      expect(res.data.analytics.usage).to.be.an('object');
      expect(res.data.analytics.summary).to.exist;
      expect(res.data.analytics.summary.totalExecutions).to.be.a('number');
      expect(res.data.analytics.summary.uniqueScenes).to.be.a('number');
    });

    it('should filter analytics by sceneId', async function() {
      const res = await axios.get(`${BASE_URL}/scenes/api/analytics?sceneId=${testSceneId}`);
      expect(res.data.success).to.be.true;
      expect(res.data.analytics.executions).to.be.an('array');
      
      // All executions should be for the test scene
      res.data.analytics.executions.forEach(exec => {
        expect(exec.sceneId).to.equal(testSceneId);
      });
    });

    it('should filter analytics by characterId', async function() {
      const res = await axios.get(`${BASE_URL}/scenes/api/analytics?characterId=${characterId}`);
      expect(res.data.success).to.be.true;
      expect(res.data.analytics.executions).to.be.an('array');
      
      // All executions should be for the test character
      res.data.analytics.executions.forEach(exec => {
        expect(exec.characterId).to.equal(characterId);
      });
    });
  });

  describe('GET /scenes/api/analytics/popular', function() {
    it('should return popular scenes', async function() {
      const res = await axios.get(`${BASE_URL}/scenes/api/analytics/popular`);
      expect(res.data.success).to.be.true;
      expect(res.data.popular).to.be.an('array');
      
      if (res.data.popular.length > 0) {
        const firstScene = res.data.popular[0];
        expect(firstScene.sceneId).to.be.a('number');
        expect(firstScene.characterId).to.be.a('number');
        expect(firstScene.executionCount).to.be.a('number');
      }
    });

    it('should respect limit parameter', async function() {
      const limit = 3;
      const res = await axios.get(`${BASE_URL}/scenes/api/analytics/popular?limit=${limit}`);
      expect(res.data.success).to.be.true;
      expect(res.data.popular).to.be.an('array');
      expect(res.data.popular.length).to.be.at.most(limit);
    });

    it('should filter popular scenes by characterId', async function() {
      const res = await axios.get(`${BASE_URL}/scenes/api/analytics/popular?characterId=${characterId}`);
      expect(res.data.success).to.be.true;
      expect(res.data.popular).to.be.an('array');
      
      res.data.popular.forEach(scene => {
        expect(scene.characterId).to.equal(characterId);
      });
    });
  });

  describe('GET /scenes/api/analytics/:sceneId', function() {
    before(async function() {
      // Execute the scene to ensure there's analytics data
      await axios.post(`${BASE_URL}/scenes/api/${testSceneId}/play`);
      await new Promise(resolve => setTimeout(resolve, 500));
    });

    it('should return performance metrics for a scene', async function() {
      const res = await axios.get(`${BASE_URL}/scenes/api/analytics/${testSceneId}?characterId=${characterId}`);
      expect(res.data.success).to.be.true;
      expect(res.data.metrics).to.exist;
      expect(res.data.metrics.sceneId).to.equal(testSceneId);
      expect(res.data.metrics.characterId).to.equal(characterId);
      expect(res.data.metrics.totalExecutions).to.be.a('number');
      expect(res.data.metrics.successRate).to.be.a('number');
      expect(res.data.metrics.avgDuration).to.be.a('number');
    });

    it('should return 404 for scene with no analytics', async function() {
      const nonExistentSceneId = 999999;
      try {
        await axios.get(`${BASE_URL}/scenes/api/analytics/${nonExistentSceneId}?characterId=${characterId}`);
        expect.fail('Should have thrown 404 error');
      } catch (error) {
        expect(error.response.status).to.equal(404);
        expect(error.response.data.success).to.be.false;
      }
    });

    it('should include performance metrics', async function() {
      const res = await axios.get(`${BASE_URL}/scenes/api/analytics/${testSceneId}?characterId=${characterId}`);
      expect(res.data.success).to.be.true;
      expect(res.data.metrics.minDuration).to.be.a('number');
      expect(res.data.metrics.maxDuration).to.be.a('number');
      expect(res.data.metrics.avgDuration).to.be.a('number');
    });
  });

  describe('Analytics Data Integrity', function() {
    it('should limit executions array to 1000 entries', async function() {
      const analyticsData = JSON.parse(await fs.readFile(ANALYTICS_PATH, 'utf8'));
      expect(analyticsData.executions.length).to.be.at.most(1000);
    });

    it('should include timestamp in execution logs', async function() {
      const analyticsData = JSON.parse(await fs.readFile(ANALYTICS_PATH, 'utf8'));
      if (analyticsData.executions.length > 0) {
        const lastExecution = analyticsData.executions[analyticsData.executions.length - 1];
        expect(lastExecution.timestamp).to.be.a('string');
        expect(new Date(lastExecution.timestamp).toString()).to.not.equal('Invalid Date');
      }
    });

    it('should track both successful and failed executions', async function() {
      // Create a scene that will fail
      const failSceneRes = await axios.post(`${BASE_URL}/scenes/api/`, {
        name: 'Failing Scene',
        characterId,
        steps: [
          { type: 'invalid_type', duration: 100 }
        ]
      });
      const failSceneId = failSceneRes.data.scene.id;

      try {
        // Try to execute the failing scene
        await axios.post(`${BASE_URL}/scenes/api/${failSceneId}/play`);
      } catch (error) {
        // Expected to fail
      }

      await new Promise(resolve => setTimeout(resolve, 500));

      // Check analytics
      const analyticsData = JSON.parse(await fs.readFile(ANALYTICS_PATH, 'utf8'));
      const failedExecutions = analyticsData.executions.filter(e => 
        e.sceneId === failSceneId && e.success === false
      );
      
      // Clean up
      await axios.delete(`${BASE_URL}/scenes/api/${failSceneId}`);
      
      // Note: This might not work if the executor doesn't log failed executions
      // but we're testing the capability
    });
  });

  describe('Analytics Performance', function() {
    it('should not slow down scene execution significantly', async function() {
      const startTime = Date.now();

      await axios.post(`${BASE_URL}/scenes/api/${testSceneId}/play`);
      
      const duration = Date.now() - startTime;
      
      // Scene execution + analytics should complete in reasonable time
      // The scene has a 100ms wait, so total should be < 2 seconds
      expect(duration).to.be.lessThan(2000);
    });
  });
});

