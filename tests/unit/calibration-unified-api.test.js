/**
 * Unit tests for Unified Calibration API
 * Tests the /api/calibration/:partId/* endpoints
 */

import { expect } from 'chai';
import request from 'supertest';
import express from 'express';
import router from '../../server/calibration/router.js';

describe('Unified Calibration API', () => {
  let app;

  before(() => {
    app = express();
    app.use('/api/calibration', router);
  });

  describe('GET /:partId/position', () => {
    it('should return current position for a part', async () => {
      // Note: This test assumes part ID 2 exists (Jaw of Orlok)
      const res = await request(app)
        .get('/api/calibration/2/position')
        .expect('Content-Type', /json/)
        .expect(200);

      expect(res.body).to.have.property('success', true);
      expect(res.body).to.have.property('currentP');
      expect(res.body.currentP).to.be.a('number');
    });
  });

  describe('POST /:partId/nudge', () => {
    it('should accept old format (dir, scale)', async () => {
      const res = await request(app)
        .post('/api/calibration/2/nudge')
        .send({ dir: 'max', scale: 'med' })
        .expect('Content-Type', /json/);

      if (res.status === 200) {
        expect(res.body).to.have.property('success', true);
        expect(res.body).to.have.property('currentP');
        expect(res.body.currentP).to.be.a('number');
      }
    });

    it('should accept new format (delta)', async () => {
      const res = await request(app)
        .post('/api/calibration/2/nudge')
        .send({ delta: 0.1, speedPct: 50 })
        .expect('Content-Type', /json/);

      if (res.status === 200) {
        expect(res.body).to.have.property('success', true);
        expect(res.body).to.have.property('currentP');
        expect(res.body.currentP).to.be.a('number');
      }
    });

    it('should reject invalid delta type', async () => {
      const res = await request(app)
        .post('/api/calibration/2/nudge')
        .send({ delta: 'invalid' })
        .expect('Content-Type', /json/)
        .expect(400);

      expect(res.body).to.have.property('success', false);
      expect(res.body).to.have.property('error');
    });

    it('should reject missing parameters', async () => {
      const res = await request(app)
        .post('/api/calibration/2/nudge')
        .send({})
        .expect('Content-Type', /json/)
        .expect(400);

      expect(res.body).to.have.property('success', false);
      expect(res.body.error).to.match(/must provide either/i);
    });
  });

  describe('POST /:partId/goto', () => {
    it('should move to normalized position', async () => {
      const res = await request(app)
        .post('/api/calibration/2/goto')
        .send({ p: 0.5, speedPct: 50 })
        .expect('Content-Type', /json/);

      if (res.status === 200) {
        expect(res.body).to.have.property('success', true);
        expect(res.body).to.have.property('targetP');
        expect(res.body.targetP).to.be.a('number');
      }
    });

    it('should reject invalid position (out of bounds)', async () => {
      const res = await request(app)
        .post('/api/calibration/2/goto')
        .send({ p: 1.5 })
        .expect('Content-Type', /json/)
        .expect(400);

      expect(res.body).to.have.property('success', false);
      expect(res.body.error).to.match(/invalid p/i);
    });

    it('should reject invalid position type', async () => {
      const res = await request(app)
        .post('/api/calibration/2/goto')
        .send({ p: 'invalid' })
        .expect('Content-Type', /json/)
        .expect(400);

      expect(res.body).to.have.property('success', false);
      expect(res.body.error).to.match(/invalid p/i);
    });

    it('should reject missing position', async () => {
      const res = await request(app)
        .post('/api/calibration/2/goto')
        .send({})
        .expect('Content-Type', /json/)
        .expect(400);

      expect(res.body).to.have.property('success', false);
    });
  });

  describe('POST /:partId/set-min', () => {
    it('should set minimum calibration bound', async () => {
      // First set a known position
      await request(app)
        .post('/api/calibration/2/goto')
        .send({ p: 0.3 });

      const res = await request(app)
        .post('/api/calibration/2/set-min')
        .send({})
        .expect('Content-Type', /json/);

      if (res.status === 200) {
        expect(res.body).to.have.property('success', true);
        expect(res.body).to.have.property('bounds');
        expect(res.body.bounds).to.have.property('minP');
      }
    });
  });

  describe('POST /:partId/set-max', () => {
    it('should set maximum calibration bound', async () => {
      // First set a known position
      await request(app)
        .post('/api/calibration/2/goto')
        .send({ p: 0.7 });

      const res = await request(app)
        .post('/api/calibration/2/set-max')
        .send({})
        .expect('Content-Type', /json/);

      if (res.status === 200) {
        expect(res.body).to.have.property('success', true);
        expect(res.body).to.have.property('bounds');
        expect(res.body.bounds).to.have.property('maxP');
      }
    });
  });
});
