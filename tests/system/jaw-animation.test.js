import { expect } from 'chai';
import request from 'supertest';

const BASE_URL = process.env.BASE_URL || 'http://localhost:3000';
const CHARACTER_ID = 3; // Orlok — current host

describe('Jaw Animation Super Power API', () => {
  // ─── Page serving ──────────────────────────────────────────────────
  describe('Page', () => {
    it('should serve the jaw-animation page', async () => {
      const res = await request(BASE_URL).get('/setup/jaw-animation').expect(200);
      expect(res.text).to.include('Jaw Animation');
      expect(res.text).to.include('Jaw Animation');
    });

    it('should include jaw animation UI elements', async () => {
      const res = await request(BASE_URL).get('/setup/jaw-animation').expect(200);
      expect(res.text).to.include('jawEnabled');
      expect(res.text).to.include('jawServoSelect');
      expect(res.text).to.include('sensitivityRange');
      expect(res.text).to.include('smoothingRange');
      expect(res.text).to.include('testJawBtn');
      expect(res.text).to.include('playTtsBtn');
      expect(res.text).to.include('emergencyStopBtn');
    });

    it('should load the jaw-animation.js client script', async () => {
      const res = await request(BASE_URL).get('/setup/jaw-animation').expect(200);
      expect(res.text).to.include('jaw-animation.js');
    });

    it('should serve the jaw-animation.js static file', async () => {
      const res = await request(BASE_URL).get('/js/jaw-animation.js').expect(200);
      expect(res.text).to.include('pollAudioLevels');
    });
  });

  // ─── Jaw Animation list endpoint ────────────────────────────────────
  describe('GET /api/list', () => {
    it('should list available jaw animation features', async () => {
      const res = await request(BASE_URL)
        .get('/setup/jaw-animation/api/list')
        .expect(200);
      expect(res.body).to.have.property('success', true);
      expect(res.body.superpowers).to.be.an('array').with.length.greaterThan(0);
      const jawPower = res.body.superpowers.find(sp => sp.id === 'jaw-animation');
      expect(jawPower).to.exist;
      expect(jawPower).to.have.property('name', 'Jaw Animation');
      expect(jawPower).to.have.property('configurable', true);
    });
  });

  // ─── Jaw config read ──────────────────────────────────────────────
  describe('GET /api/jaw-animation/:characterId', () => {
    it('should return jaw animation config for a character', async () => {
      const res = await request(BASE_URL)
        .get(`/setup/jaw-animation/api/jaw-animation/${CHARACTER_ID}`)
        .expect(200);
      expect(res.body).to.have.property('success', true);
      expect(res.body).to.have.property('config');
      expect(res.body.config).to.have.property('sensitivity');
      expect(res.body.config).to.have.property('smoothing');
      expect(res.body.config).to.have.property('volumeThreshold');
      expect(res.body.config).to.have.property('attackTime');
      expect(res.body.config).to.have.property('releaseTime');
    });

    it('should return available servos for the character', async () => {
      const res = await request(BASE_URL)
        .get(`/setup/jaw-animation/api/jaw-animation/${CHARACTER_ID}`)
        .expect(200);
      expect(res.body.availableServos).to.be.an('array').with.length.greaterThan(0);
    });

    it('should identify jaw candidates by name', async () => {
      const res = await request(BASE_URL)
        .get(`/setup/jaw-animation/api/jaw-animation/${CHARACTER_ID}`)
        .expect(200);
      const jawCandidate = res.body.availableServos.find(s => s.isJawCandidate);
      expect(jawCandidate).to.exist;
      expect(jawCandidate.name.toLowerCase()).to.include('jaw');
    });

    it('should include calibration data for calibrated servos', async () => {
      const res = await request(BASE_URL)
        .get(`/setup/jaw-animation/api/jaw-animation/${CHARACTER_ID}`)
        .expect(200);
      const calibrated = res.body.availableServos.filter(s => s.calibrated);
      expect(calibrated.length).to.be.greaterThan(0);
      calibrated.forEach(s => {
        expect(s.minAngle).to.be.a('number');
        expect(s.maxAngle).to.be.a('number');
        expect(s.maxAngle).to.be.greaterThan(s.minAngle);
      });
    });

    it('should return monitoring state', async () => {
      const res = await request(BASE_URL)
        .get(`/setup/jaw-animation/api/jaw-animation/${CHARACTER_ID}`)
        .expect(200);
      expect(res.body.monitoringState).to.have.property('isMonitoring');
      expect(res.body.monitoringState).to.have.property('lastAmplitude');
      expect(res.body.monitoringState).to.have.property('smoothedAmplitude');
    });
  });

  // ─── Jaw config save ──────────────────────────────────────────────
  describe('POST /api/jaw-animation/:characterId', () => {
    let jawServoId = null;

    before(async () => {
      // Get the jaw servo ID for configuration
      const res = await request(BASE_URL)
        .get(`/setup/jaw-animation/api/jaw-animation/${CHARACTER_ID}`);
      const jawCandidate = res.body.availableServos.find(s => s.isJawCandidate && s.calibrated);
      if (jawCandidate) jawServoId = jawCandidate.id;
    });

    it('should save a valid jaw animation configuration', async function() {
      if (!jawServoId) this.skip();
      const config = {
        enabled: true,
        servoPartId: jawServoId,
        sensitivity: 1.5,
        smoothing: 0.7,
        volumeThreshold: 0.03,
        attackTime: 40,
        releaseTime: 200
      };
      const res = await request(BASE_URL)
        .post(`/setup/jaw-animation/api/jaw-animation/${CHARACTER_ID}`)
        .send(config)
        .expect(200);
      expect(res.body).to.have.property('success', true);
    });

    it('should persist saved configuration', async function() {
      if (!jawServoId) this.skip();
      const res = await request(BASE_URL)
        .get(`/setup/jaw-animation/api/jaw-animation/${CHARACTER_ID}`)
        .expect(200);
      expect(res.body.config.sensitivity).to.equal(1.5);
      expect(res.body.config.smoothing).to.equal(0.7);
      expect(res.body.config.volumeThreshold).to.equal(0.03);
    });

    it('should reject enabled config without servo', async () => {
      const res = await request(BASE_URL)
        .post(`/setup/jaw-animation/api/jaw-animation/${CHARACTER_ID}`)
        .send({ enabled: true, servoPartId: null })
        .expect(400);
      expect(res.body).to.have.property('success', false);
    });

    it('should reject uncalibrated servo', async () => {
      // Try to use a potentially uncalibrated servo ID
      const res = await request(BASE_URL)
        .get(`/setup/jaw-animation/api/jaw-animation/${CHARACTER_ID}`);
      const uncalibrated = res.body.availableServos.find(s => !s.calibrated);
      if (!uncalibrated) return; // All servos calibrated — skip
      
      const saveRes = await request(BASE_URL)
        .post(`/setup/jaw-animation/api/jaw-animation/${CHARACTER_ID}`)
        .send({ enabled: true, servoPartId: uncalibrated.id })
        .expect(400);
      expect(saveRes.body).to.have.property('success', false);
    });

    after(async () => {
      // Restore default config
      if (jawServoId) {
        await request(BASE_URL)
          .post(`/setup/jaw-animation/api/jaw-animation/${CHARACTER_ID}`)
          .send({
            enabled: true,
            servoPartId: jawServoId,
            sensitivity: 1.0,
            smoothing: 0.6,
            volumeThreshold: 0.02,
            attackTime: 50,
            releaseTime: 150
          });
      }
    });
  });

  // ─── Available servos endpoint ─────────────────────────────────────
  describe('GET /api/jaw-animation/:characterId/servos', () => {
    it('should return servos list', async () => {
      const res = await request(BASE_URL)
        .get(`/setup/jaw-animation/api/jaw-animation/${CHARACTER_ID}/servos`)
        .expect(200);
      expect(res.body).to.have.property('success', true);
      expect(res.body.servos).to.be.an('array');
    });

    it('should sort jaw candidates first', async () => {
      const res = await request(BASE_URL)
        .get(`/setup/jaw-animation/api/jaw-animation/${CHARACTER_ID}/servos`)
        .expect(200);
      const servos = res.body.servos;
      if (servos.length >= 2) {
        const jawIdx = servos.findIndex(s => s.isJawCandidate);
        const nonJawIdx = servos.findIndex(s => !s.isJawCandidate);
        if (jawIdx >= 0 && nonJawIdx >= 0) {
          expect(jawIdx).to.be.lessThan(nonJawIdx);
        }
      }
    });
  });

  // ─── Drive endpoint ────────────────────────────────────────────────
  describe('POST /api/jaw-animation/:characterId/drive', () => {
    it('should accept valid amplitude', async () => {
      const res = await request(BASE_URL)
        .post(`/setup/jaw-animation/api/jaw-animation/${CHARACTER_ID}/drive`)
        .send({ amplitude: 0.5 })
        .expect(200);
      expect(res.body).to.have.property('success', true);
      expect(res.body).to.have.property('targetAngle');
      expect(res.body).to.have.property('guardrails');
    });

    it('should reject amplitude out of range', async () => {
      const res = await request(BASE_URL)
        .post(`/setup/jaw-animation/api/jaw-animation/${CHARACTER_ID}/drive`)
        .send({ amplitude: 2.0 })
        .expect(400);
      expect(res.body).to.have.property('success', false);
    });

    it('should reject negative amplitude', async () => {
      const res = await request(BASE_URL)
        .post(`/setup/jaw-animation/api/jaw-animation/${CHARACTER_ID}/drive`)
        .send({ amplitude: -0.5 })
        .expect(400);
      expect(res.body).to.have.property('success', false);
    });

    it('should reject non-numeric amplitude', async () => {
      const res = await request(BASE_URL)
        .post(`/setup/jaw-animation/api/jaw-animation/${CHARACTER_ID}/drive`)
        .send({ amplitude: 'loud' })
        .expect(400);
      expect(res.body).to.have.property('success', false);
    });

    it('should return guardrails with calibration data', async () => {
      const res = await request(BASE_URL)
        .post(`/setup/jaw-animation/api/jaw-animation/${CHARACTER_ID}/drive`)
        .send({ amplitude: 0.5 })
        .expect(200);
      expect(res.body.guardrails).to.have.property('calibrated', true);
      expect(res.body.guardrails.minAngle).to.be.a('number');
      expect(res.body.guardrails.maxAngle).to.be.a('number');
    });

    it('should clamp target angle within calibrated range', async () => {
      const res = await request(BASE_URL)
        .post(`/setup/jaw-animation/api/jaw-animation/${CHARACTER_ID}/drive`)
        .send({ amplitude: 1.0 })
        .expect(200);
      const { minAngle, maxAngle } = res.body.guardrails;
      expect(res.body.targetAngle).to.be.at.least(minAngle);
      expect(res.body.targetAngle).to.be.at.most(maxAngle);
    });
  });

  // ─── Audio monitoring ──────────────────────────────────────────────
  describe('Audio monitoring', () => {
    it('should start audio monitoring', async () => {
      const res = await request(BASE_URL)
        .post(`/setup/jaw-animation/api/jaw-animation/${CHARACTER_ID}/start-monitoring`)
        .expect(200);
      expect(res.body).to.have.property('success', true);
    });

    it('should report monitoring state via audio-levels', async () => {
      const res = await request(BASE_URL)
        .get(`/setup/jaw-animation/api/jaw-animation/${CHARACTER_ID}/audio-levels`)
        .expect(200);
      expect(res.body).to.have.property('success', true);
      expect(res.body).to.have.property('isMonitoring', true);
    });

    it('should stop audio monitoring', async () => {
      const res = await request(BASE_URL)
        .post(`/setup/jaw-animation/api/jaw-animation/${CHARACTER_ID}/stop-monitoring`)
        .expect(200);
      expect(res.body).to.have.property('success', true);
    });

    it('should report stopped state after stopping', async () => {
      const res = await request(BASE_URL)
        .get(`/setup/jaw-animation/api/jaw-animation/${CHARACTER_ID}/audio-levels`)
        .expect(200);
      expect(res.body).to.have.property('isMonitoring', false);
    });
  });

  // ─── Test jaw movement ─────────────────────────────────────────────
  describe('POST /api/jaw-animation/:characterId/test', () => {
    it('should execute jaw test sequence', async () => {
      const res = await request(BASE_URL)
        .post(`/setup/jaw-animation/api/jaw-animation/${CHARACTER_ID}/test`)
        .expect(200);
      expect(res.body).to.have.property('success', true);
      expect(res.body).to.have.property('message').that.includes('completed');
    }).timeout(10000); // Jaw test takes ~2s for the movement sequence
  });

  // ─── Removed endpoints should not exist ────────────────────────────
  describe('Removed endpoints', () => {
    it('should NOT have apply-settings-to-part endpoint', async () => {
      await request(BASE_URL)
        .post(`/setup/jaw-animation/api/apply-settings-to-part/${CHARACTER_ID}`)
        .send({ servoPartId: '10', settings: {} })
        .expect(404);
    });

    it('should NOT have test-advanced-servo endpoint', async () => {
      await request(BASE_URL)
        .post(`/setup/jaw-animation/api/test-advanced-servo/${CHARACTER_ID}`)
        .send({ servoId: '10', position: 90 })
        .expect(404);
    });

    it('should NOT have ai-chat-status endpoint', async () => {
      await request(BASE_URL)
        .get(`/setup/jaw-animation/api/ai-chat-status/${CHARACTER_ID}`)
        .expect(404);
    });

    it('should NOT have ai-chat-connect endpoint', async () => {
      await request(BASE_URL)
        .post(`/setup/jaw-animation/api/ai-chat-connect/${CHARACTER_ID}`)
        .expect(404);
    });
  });
});
