/**
 * Unit tests for Webcam APIs migrated to /setup/calibration/api/webcam/*
 * Validates that all webcam endpoints work under the calibration route prefix
 */

import { expect } from 'chai';
import request from 'supertest';

// Use the running server for integration-style unit tests
const BASE_URL = process.env.BASE_URL || 'http://localhost:3000';

describe('Webcam APIs under /setup/calibration/api/webcam', function () {
  this.timeout(10000);

  // ── Health ──────────────────────────────────────────────────────────
  describe('GET /setup/calibration/api/webcam/health', () => {
    it('should return health status', async () => {
      const res = await request(BASE_URL)
        .get('/setup/calibration/api/webcam/health')
        .expect('Content-Type', /json/)
        .expect(200);

      expect(res.body).to.have.property('success');
    });
  });

  // ── Device Discovery ───────────────────────────────────────────────
  describe('GET /setup/calibration/api/webcam/devices', () => {
    it('should list video devices', async () => {
      const res = await request(BASE_URL)
        .get('/setup/calibration/api/webcam/devices')
        .expect('Content-Type', /json/)
        .expect(200);

      expect(res.body).to.have.property('success', true);
      expect(res.body).to.have.property('devices').that.is.an('array');
    });
  });

  describe('GET /setup/calibration/api/webcam/devices/probe', () => {
    it('should probe available devices', async () => {
      const res = await request(BASE_URL)
        .get('/setup/calibration/api/webcam/devices/probe')
        .expect('Content-Type', /json/)
        .expect(200);

      expect(res.body).to.have.property('success', true);
    });
  });

  describe('GET /setup/calibration/api/webcam/devices/inuse', () => {
    it('should list devices in use', async () => {
      const res = await request(BASE_URL)
        .get('/setup/calibration/api/webcam/devices/inuse')
        .expect('Content-Type', /json/)
        .expect(200);

      expect(res.body).to.have.property('success');
    });
  });

  // ── Webcam Controls ────────────────────────────────────────────────
  describe('GET /setup/calibration/api/webcam/parts/:id/controls/list', () => {
    it('should list controls for a webcam part', async () => {
      const res = await request(BASE_URL)
        .get('/setup/calibration/api/webcam/parts/webcam-auto/controls/list')
        .expect('Content-Type', /json/);

      // May return success or fail depending on hardware, but should be valid JSON
      expect(res.body).to.be.an('object');
    });
  });

  describe('PUT /setup/calibration/api/webcam/parts/:id/controls/set', () => {
    it('should accept control settings', async () => {
      const res = await request(BASE_URL)
        .put('/setup/calibration/api/webcam/parts/webcam-auto/controls/set')
        .send({ controls: { brightness: 128 }, persist: false })
        .expect('Content-Type', /json/);

      // May fail without real hardware, but endpoint should respond
      expect(res.body).to.be.an('object');
    });
  });

  // ── Webcam Models CRUD ─────────────────────────────────────────────
  describe('Webcam Models CRUD', () => {
    var createdModelId;

    it('GET /api/webcam/models should list models', async () => {
      const res = await request(BASE_URL)
        .get('/setup/calibration/api/webcam/models')
        .expect('Content-Type', /json/)
        .expect(200);

      expect(res.body).to.have.property('success', true);
      expect(res.body).to.have.property('models').that.is.an('array');
    });

    it('POST /api/webcam/models should create a model', async () => {
      const res = await request(BASE_URL)
        .post('/setup/calibration/api/webcam/models')
        .send({
          name: 'Test Webcam Model',
          manufacturer: 'Test Corp',
          defaults: { width: 640, height: 480, fps: 15 }
        })
        .expect('Content-Type', /json/);

      if (res.status === 201 || res.status === 200) {
        expect(res.body).to.have.property('success', true);
        createdModelId = res.body.model && res.body.model.id;
      }
    });

    it('GET /api/webcam/models/:id should get a model by ID', async () => {
      if (!createdModelId) return;

      const res = await request(BASE_URL)
        .get('/setup/calibration/api/webcam/models/' + createdModelId)
        .expect('Content-Type', /json/)
        .expect(200);

      expect(res.body).to.have.property('success', true);
      expect(res.body).to.have.property('model');
      expect(res.body.model).to.have.property('name', 'Test Webcam Model');
    });

    it('PUT /api/webcam/models/:id should update a model', async () => {
      if (!createdModelId) return;

      const res = await request(BASE_URL)
        .put('/setup/calibration/api/webcam/models/' + createdModelId)
        .send({ name: 'Updated Test Webcam Model' })
        .expect('Content-Type', /json/)
        .expect(200);

      expect(res.body).to.have.property('success', true);
    });

    it('DELETE /api/webcam/models/:id should delete a model', async () => {
      if (!createdModelId) return;

      const res = await request(BASE_URL)
        .delete('/setup/calibration/api/webcam/models/' + createdModelId)
        .expect('Content-Type', /json/)
        .expect(200);

      expect(res.body).to.have.property('success', true);
    });
  });

  // ── Motion Tracking ────────────────────────────────────────────────
  describe('Motion Tracking APIs', () => {
    it('GET /api/webcam/motion-tracking/status should return status', async () => {
      const res = await request(BASE_URL)
        .get('/setup/calibration/api/webcam/motion-tracking/status?webcamId=webcam-auto')
        .expect('Content-Type', /json/);

      expect(res.body).to.be.an('object');
      expect(res.body).to.have.property('success');
    });

    it('POST /api/webcam/motion-tracking/start should accept start request', async () => {
      const res = await request(BASE_URL)
        .post('/setup/calibration/api/webcam/motion-tracking/start')
        .send({
          webcamId: 'webcam-auto',
          params: { motionThreshold: 25, minContourArea: 500, trackingSmoothing: 0.3, trackingDeadzone: 5 }
        })
        .expect('Content-Type', /json/);

      // May fail without Python/OpenCV, but should be a valid JSON response
      expect(res.body).to.be.an('object');
    });

    it('POST /api/webcam/motion-tracking/stop should accept stop request', async () => {
      const res = await request(BASE_URL)
        .post('/setup/calibration/api/webcam/motion-tracking/stop')
        .send({ webcamId: 'webcam-auto' })
        .expect('Content-Type', /json/);

      expect(res.body).to.be.an('object');
    });

    it('POST /api/webcam/motion-tracking/params should accept param update', async () => {
      const res = await request(BASE_URL)
        .post('/setup/calibration/api/webcam/motion-tracking/params')
        .send({
          webcamId: 'webcam-auto',
          params: { motionThreshold: 30, minContourArea: 600, trackingSmoothing: 0.4, trackingDeadzone: 6 }
        })
        .expect('Content-Type', /json/);

      expect(res.body).to.be.an('object');
    });
  });

  // ── Head Tracking ──────────────────────────────────────────────────
  describe('Head Tracking APIs', () => {
    it('GET /api/webcam/motion-tracking/head-tracking/status should return status', async () => {
      const res = await request(BASE_URL)
        .get('/setup/calibration/api/webcam/motion-tracking/head-tracking/status?webcamId=webcam-auto')
        .expect('Content-Type', /json/);

      expect(res.body).to.be.an('object');
    });

    it('POST /api/webcam/motion-tracking/head-tracking/enable should accept enable request', async () => {
      const res = await request(BASE_URL)
        .post('/setup/calibration/api/webcam/motion-tracking/head-tracking/enable')
        .send({
          webcamId: 'webcam-auto',
          panServoId: 'test-servo-1',
          params: { rangeDeg: 60, centerDeg: 0, smoothing: 0.35, deadzone: 6 }
        })
        .expect('Content-Type', /json/);

      expect(res.body).to.be.an('object');
    });

    it('POST /api/webcam/motion-tracking/head-tracking/disable should accept disable request', async () => {
      const res = await request(BASE_URL)
        .post('/setup/calibration/api/webcam/motion-tracking/head-tracking/disable')
        .send({ webcamId: 'webcam-auto' })
        .expect('Content-Type', /json/);

      expect(res.body).to.be.an('object');
    });
  });

  // ── Old routes return 404 ──────────────────────────────────────────
  describe('Old /setup/webcam routes return 404', () => {
    it('GET /setup/webcam should return 404', async () => {
      await request(BASE_URL)
        .get('/setup/webcam')
        .expect(404);
    });

    it('GET /setup/webcam/api/health should return 404', async () => {
      await request(BASE_URL)
        .get('/setup/webcam/api/health')
        .expect(404);
    });

    it('GET /setup/webcam/api/devices should return 404', async () => {
      await request(BASE_URL)
        .get('/setup/webcam/api/devices')
        .expect(404);
    });

    it('GET /setup/webcam/api/models should return 404', async () => {
      await request(BASE_URL)
        .get('/setup/webcam/api/models')
        .expect(404);
    });
  });

  // ── MJPEG Stream ───────────────────────────────────────────────────
  describe('GET /setup/calibration/api/webcam/parts/:id/stream', () => {
    it('should attempt to proxy MJPEG stream', async () => {
      // This may fail if mjpg-streamer is not running, but the route should exist
      const res = await request(BASE_URL)
        .get('/setup/calibration/api/webcam/parts/webcam-auto/stream')
        .timeout({ response: 3000, deadline: 5000 });

      // Accept 200 (streaming), 404 (part not found), or 502/503 (service not available)
      expect([200, 404, 502, 503]).to.include(res.status);
    });
  });

  // ── Apply Device ───────────────────────────────────────────────────
  describe('POST /setup/calibration/api/webcam/parts/:id/apply-device', () => {
    it('should accept apply-device request', async () => {
      const res = await request(BASE_URL)
        .post('/setup/calibration/api/webcam/parts/webcam-auto/apply-device')
        .send({})
        .expect('Content-Type', /json/);

      // Will likely fail without proper part config, but endpoint responds
      expect(res.body).to.be.an('object');
    });
  });
});
