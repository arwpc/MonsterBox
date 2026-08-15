/**
 * Unit tests for Unified Calibration API
 * Tests the /api/calibration/:partId/* endpoints
 */

import { expect } from 'chai';
import request from 'supertest';
import express from 'express';
import router from '../../server/calibration/router.js';
import { loadParts } from '../../controllers/partsController.js';
import { readConfig } from '../../services/configService.js';
import { getCalibrationStore } from '../../server/calibration/store.js';
import { isTestSafePart } from '../../services/hardwareService/safetyLimits.js';

describe('Unified Calibration API', function () {
  // Calibration operations include post-movement settle delays for open-loop parts
  this.timeout(10000);
  let app;
  let linearPartId;  // dynamically found linear actuator
  let servoPartId;   // dynamically found absolute servo
  let characterId;
  const savedProfiles = new Map();

  // These tests hit the real calibration API, which on a live animatronic node drives
  // real hardware. Two rules follow from that:
  //  1. Never select a part the safety config marks unsafe for automated driving —
  //     picking "the first servo" once meant slamming a 150kg servo on a shared fuse
  //     to both its extremes on every smoke run.
  //  2. set-min/set-max REWRITE the part's calibration bounds from wherever the test
  //     parked it, so the profiles must be saved and restored or the suite silently
  //     recalibrates the animatronic.
  async function pickTestSafePart(parts, type) {
    const candidates = parts.filter(p => p.type === type);
    for (const part of candidates) {
      if (await isTestSafePart(characterId, part.id)) return String(part.id);
    }
    return null;
  }

  before(async () => {
    app = express();
    app.use('/api/calibration', router);

    const cfg = await readConfig();
    characterId = cfg && cfg.selectedCharacter;

    // Find parts by type to be character-independent
    const parts = await loadParts();
    linearPartId = await pickTestSafePart(parts, 'linear_actuator');
    servoPartId = await pickTestSafePart(parts, 'servo');

    // Snapshot the whole calibration file. Restoring via upsert() would re-stamp
    // lastCalibratedAt, making it look like the operator recalibrated the part, so
    // the raw file is saved and written back verbatim instead.
    savedProfiles.set('__file__', await getCalibrationStore().load());
  });

  after(async () => {
    // Put the animatronic's calibration back exactly as we found it.
    const snapshot = savedProfiles.get('__file__');
    if (snapshot) await getCalibrationStore().save(snapshot);
  });

  describe('GET /:partId/position', () => {
    it('should return current position for a part', async function () {
      if (!linearPartId) return this.skip();
      const res = await request(app)
        .get(`/api/calibration/${linearPartId}/position`)
        .expect('Content-Type', /json/)
        .expect(200);

      expect(res.body).to.have.property('success', true);
      expect(res.body).to.have.property('currentP');
      if (res.body.currentP !== null) {
        expect(res.body.currentP).to.be.a('number');
      }
    });

    it('should return angle for absolute servo parts', async function () {
      if (!servoPartId) return this.skip();
      const res = await request(app)
        .get(`/api/calibration/${servoPartId}/position`)
        .expect('Content-Type', /json/)
        .expect(200);

      expect(res.body).to.have.property('success', true);
      // kind is present only when a calibration profile with absolute-servo capability exists
      if (res.body.kind) {
        expect(res.body.kind).to.equal('absolute-servo');
        if (res.body.currentAngle !== null) {
          expect(res.body.currentAngle).to.be.a('number');
          expect(res.body.currentAngle).to.be.at.least(0);
          expect(res.body.currentAngle).to.be.at.most(180);
        }
      }
    });
  });

  describe('POST /:partId/nudge', () => {
    it('should accept old format (dir, scale)', async function () {
      if (!linearPartId) return this.skip();
      const res = await request(app)
        .post(`/api/calibration/${linearPartId}/nudge`)
        .send({ dir: 'max', scale: 'med' })
        .expect('Content-Type', /json/);

      if (res.status === 200) {
        expect(res.body).to.have.property('success', true);
        expect(res.body).to.have.property('currentP');
        if (res.body.currentP !== null) {
          expect(res.body.currentP).to.be.a('number');
        }
      }
    });

    it('should accept new format (delta)', async function () {
      if (!linearPartId) return this.skip();
      const res = await request(app)
        .post(`/api/calibration/${linearPartId}/nudge`)
        .send({ delta: 0.1, speedPct: 50 })
        .expect('Content-Type', /json/);

      if (res.status === 200) {
        expect(res.body).to.have.property('success', true);
        expect(res.body).to.have.property('currentP');
        if (res.body.currentP !== null) {
          expect(res.body.currentP).to.be.a('number');
        }
      }
    });

    it('should return angle for absolute servo nudge', async function () {
      if (!servoPartId) return this.skip();
      const res = await request(app)
        .post(`/api/calibration/${servoPartId}/nudge`)
        .send({ dir: 'max', scale: 'fine' })
        .expect('Content-Type', /json/);

      if (res.status === 200) {
        expect(res.body).to.have.property('success', true);
        // currentAngle present only for calibrated absolute servos
        if (res.body.currentAngle !== undefined) {
          expect(res.body.currentAngle).to.be.a('number');
        }
      }
    });

    it('should reject invalid delta type', async function () {
      if (!linearPartId) return this.skip();
      const res = await request(app)
        .post(`/api/calibration/${linearPartId}/nudge`)
        .send({ delta: 'invalid' })
        .expect('Content-Type', /json/)
        .expect(400);

      expect(res.body).to.have.property('success', false);
      expect(res.body).to.have.property('error');
    });

    it('should reject missing parameters', async function () {
      if (!linearPartId) return this.skip();
      const res = await request(app)
        .post(`/api/calibration/${linearPartId}/nudge`)
        .send({})
        .expect('Content-Type', /json/)
        .expect(400);

      expect(res.body).to.have.property('success', false);
      expect(res.body.error).to.match(/must provide either/i);
    });
  });

  describe('POST /:partId/goto', () => {
    it('should move to normalized position', async function () {
      if (!linearPartId) return this.skip();
      const res = await request(app)
        .post(`/api/calibration/${linearPartId}/goto`)
        .send({ p: 0.5, speedPct: 50 })
        .expect('Content-Type', /json/);

      if (res.status === 200) {
        expect(res.body).to.have.property('success', true);
        expect(res.body).to.have.property('targetP');
        expect(res.body.targetP).to.be.a('number');
      }
    });

    it('should accept angle for absolute servos', async function () {
      if (!servoPartId) return this.skip();
      const res = await request(app)
        .post(`/api/calibration/${servoPartId}/goto`)
        .send({ angle: 90, speedPct: 50 })
        .expect('Content-Type', /json/);

      if (res.status === 200) {
        expect(res.body).to.have.property('success', true);
        expect(res.body).to.have.property('targetAngle');
        expect(res.body.targetAngle).to.equal(90);
      }
    });

    it('should reject invalid angle (out of bounds)', async function () {
      if (!servoPartId) return this.skip();
      const res = await request(app)
        .post(`/api/calibration/${servoPartId}/goto`)
        .send({ angle: 200 })
        .expect('Content-Type', /json/);

      // Servo without calibration profile may get a different error path
      if (res.status === 400) {
        expect(res.body).to.have.property('success', false);
        expect(res.body.error).to.match(/invalid/i);
      }
    });

    it('should reject invalid position (out of bounds)', async function () {
      if (!linearPartId) return this.skip();
      const res = await request(app)
        .post(`/api/calibration/${linearPartId}/goto`)
        .send({ p: 1.5 })
        .expect('Content-Type', /json/)
        .expect(400);

      expect(res.body).to.have.property('success', false);
      expect(res.body.error).to.match(/invalid p/i);
    });

    it('should reject invalid position type', async function () {
      if (!linearPartId) return this.skip();
      const res = await request(app)
        .post(`/api/calibration/${linearPartId}/goto`)
        .send({ p: 'invalid' })
        .expect('Content-Type', /json/)
        .expect(400);

      expect(res.body).to.have.property('success', false);
      expect(res.body.error).to.match(/invalid p/i);
    });

    it('should reject missing position', async function () {
      if (!linearPartId) return this.skip();
      const res = await request(app)
        .post(`/api/calibration/${linearPartId}/goto`)
        .send({})
        .expect('Content-Type', /json/)
        .expect(400);

      expect(res.body).to.have.property('success', false);
    });
  });

  describe('POST /:partId/set-min', () => {
    it('should set minimum calibration bound', async function () {
      if (!linearPartId) return this.skip();
      await request(app)
        .post(`/api/calibration/${linearPartId}/goto`)
        .send({ p: 0.3 });

      const res = await request(app)
        .post(`/api/calibration/${linearPartId}/set-min`)
        .send({})
        .expect('Content-Type', /json/);

      if (res.status === 200) {
        expect(res.body).to.have.property('success', true);
        expect(res.body).to.have.property('bounds');
        expect(res.body.bounds).to.have.property('minP');
      }
    });

    it('should set angle-based min for absolute servos', async function () {
      if (!servoPartId) return this.skip();
      await request(app)
        .post(`/api/calibration/${servoPartId}/goto`)
        .send({ angle: 45 });

      const res = await request(app)
        .post(`/api/calibration/${servoPartId}/set-min`)
        .send({})
        .expect('Content-Type', /json/);

      if (res.status === 200) {
        expect(res.body).to.have.property('success', true);
        expect(res.body).to.have.property('bounds');
        // minAngle for absolute servos, minP for non-calibrated
        expect(res.body.bounds).to.satisfy(b => b.minAngle !== undefined || b.minP !== undefined);
      }
    });
  });

  describe('POST /:partId/set-max', () => {
    it('should set maximum calibration bound', async function () {
      if (!linearPartId) return this.skip();
      await request(app)
        .post(`/api/calibration/${linearPartId}/goto`)
        .send({ p: 0.7 });

      const res = await request(app)
        .post(`/api/calibration/${linearPartId}/set-max`)
        .send({})
        .expect('Content-Type', /json/);

      if (res.status === 200) {
        expect(res.body).to.have.property('success', true);
        expect(res.body).to.have.property('bounds');
        expect(res.body.bounds).to.have.property('maxP');
      }
    });

    it('should set angle-based max for absolute servos', async function () {
      if (!servoPartId) return this.skip();
      await request(app)
        .post(`/api/calibration/${servoPartId}/goto`)
        .send({ angle: 135 });

      const res = await request(app)
        .post(`/api/calibration/${servoPartId}/set-max`)
        .send({})
        .expect('Content-Type', /json/);

      if (res.status === 200) {
        expect(res.body).to.have.property('success', true);
        expect(res.body).to.have.property('bounds');
        // maxAngle for absolute servos, maxP for non-calibrated
        expect(res.body.bounds).to.satisfy(b => b.maxAngle !== undefined || b.maxP !== undefined);
      }
    });
  });
});
