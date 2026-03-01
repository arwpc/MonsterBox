import { expect } from 'chai';
import request from 'supertest';
import fs from 'fs/promises';
import path from 'path';

const BASE_URL = process.env.BASE_URL || 'http://localhost:3100';

// Resolve selected character dynamically from the config API
let CHARACTER_ID;

describe('Head Animation API', () => {
  before(async () => {
    const res = await request(BASE_URL).get('/api/config').expect(200);
    CHARACTER_ID = res.body.selectedCharacter || 3;
  });
  // ─── Page serving ──────────────────────────────────────────────────
  describe('Page', () => {
    it('should serve the head-animation page', async () => {
      const res = await request(BASE_URL).get('/setup/head-animation').expect(200);
      expect(res.text).to.include('Head Animation');
    });

    it('should include head animation UI elements', async () => {
      const res = await request(BASE_URL).get('/setup/head-animation').expect(200);
      expect(res.text).to.include('htEnabled');
      expect(res.text).to.include('ocvEnabled');
      expect(res.text).to.include('panServoSelect');
      expect(res.text).to.include('webcamSelect');
      expect(res.text).to.include('smoothingRange');
      expect(res.text).to.include('deadzoneRange');
      expect(res.text).to.include('motionThresholdRange');
      expect(res.text).to.include('emergencyStopBtn');
    });

    it('should include OpenCV parameter controls', async () => {
      const res = await request(BASE_URL).get('/setup/head-animation').expect(200);
      expect(res.text).to.include('minContourArea');
      expect(res.text).to.include('maxContourArea');
      expect(res.text).to.include('bgLearningRateRange');
      expect(res.text).to.include('noiseKernelRange');
    });

    it('should load the head-animation.js client script', async () => {
      const res = await request(BASE_URL).get('/setup/head-animation').expect(200);
      expect(res.text).to.include('head-animation.js');
    });

    it('should serve the head-animation.js static file', async () => {
      const res = await request(BASE_URL).get('/js/head-animation.js').expect(200);
      expect(res.text).to.include('pollStatus');
    });
  });

  // ─── Config read ──────────────────────────────────────────────────
  describe('GET /api/head-tracking/:charId', () => {
    it('should return head tracking config for a character', async () => {
      const res = await request(BASE_URL)
        .get(`/setup/head-animation/api/head-tracking/${CHARACTER_ID}`)
        .expect(200);
      expect(res.body).to.have.property('success', true);
      expect(res.body).to.have.property('config');
      expect(res.body.config).to.have.property('smoothing');
      expect(res.body.config).to.have.property('deadzone');
      expect(res.body.config).to.have.property('motionThreshold');
      expect(res.body.config).to.have.property('centerDeg');
      expect(res.body.config).to.have.property('rangeDeg');
    });

    it('should return available servos', async () => {
      const res = await request(BASE_URL)
        .get(`/setup/head-animation/api/head-tracking/${CHARACTER_ID}`)
        .expect(200);
      expect(res.body.availableServos).to.be.an('array');
    });

    it('should return available webcams', async () => {
      const res = await request(BASE_URL)
        .get(`/setup/head-animation/api/head-tracking/${CHARACTER_ID}`)
        .expect(200);
      expect(res.body.availableWebcams).to.be.an('array');
    });

    it('should return tracking status fields', async () => {
      const res = await request(BASE_URL)
        .get(`/setup/head-animation/api/head-tracking/${CHARACTER_ID}`)
        .expect(200);
      expect(res.body).to.have.property('trackingActive');
    });

    it('should return default config for character with no existing config', async () => {
      const res = await request(BASE_URL)
        .get('/setup/head-animation/api/head-tracking/999')
        .expect(200);
      expect(res.body).to.have.property('success', true);
      expect(res.body.config).to.have.property('enabled');
      // Note: panServoId may not be null if config dataPath routes to current character's data
      expect(res.body.config).to.have.property('smoothing');
      expect(res.body.config).to.have.property('deadzone');
      expect(res.body.config).to.have.property('motionThreshold');
    });
  });

  // ─── Config save / load roundtrip ─────────────────────────────────
  describe('POST /api/head-tracking/:charId', () => {
    let originalConfig = null;

    before(async () => {
      // Read existing config to restore later
      const res = await request(BASE_URL)
        .get(`/setup/head-animation/api/head-tracking/${CHARACTER_ID}`)
        .expect(200);
      originalConfig = res.body.config;
    });

    it('should save a valid head tracking configuration', async () => {
      const config = {
        opencvEnabled: false,
        enabled: false,
        panServoId: null,
        webcamPartId: null,
        smoothing: 0.5,
        deadzone: 8,
        centerDeg: 10,
        rangeDeg: 45,
        invertPan: true,
        motionThreshold: 40,
        minContourArea: 500,
        maxContourArea: 20000,
        backgroundLearningRate: 0.05,
        noiseReductionKernelSize: 5
      };
      const res = await request(BASE_URL)
        .post(`/setup/head-animation/api/head-tracking/${CHARACTER_ID}`)
        .send(config)
        .expect(200);
      expect(res.body).to.have.property('success', true);
    });

    it('should persist saved configuration', async () => {
      const res = await request(BASE_URL)
        .get(`/setup/head-animation/api/head-tracking/${CHARACTER_ID}`)
        .expect(200);
      expect(res.body.config.smoothing).to.equal(0.5);
      expect(res.body.config.deadzone).to.equal(8);
      expect(res.body.config.centerDeg).to.equal(10);
      expect(res.body.config.rangeDeg).to.equal(45);
      expect(res.body.config.invertPan).to.equal(true);
      expect(res.body.config.motionThreshold).to.equal(40);
    });

    it('should reject enabled config without servo', async () => {
      const res = await request(BASE_URL)
        .post(`/setup/head-animation/api/head-tracking/${CHARACTER_ID}`)
        .send({ enabled: true, panServoId: null, webcamPartId: '5' })
        .expect(400);
      expect(res.body).to.have.property('success', false);
    });

    it('should reject enabled config without webcam', async () => {
      const res = await request(BASE_URL)
        .post(`/setup/head-animation/api/head-tracking/${CHARACTER_ID}`)
        .send({ enabled: true, panServoId: '4', webcamPartId: null })
        .expect(400);
      expect(res.body).to.have.property('success', false);
    });

    it('should not corrupt jawAnimation config in super-powers.json', async () => {
      // Read super-powers.json directly
      const spPath = path.resolve(`data/character-${CHARACTER_ID}/super-powers.json`);
      const data = JSON.parse(await fs.readFile(spPath, 'utf8'));

      // jawAnimation should still be present and intact
      expect(data).to.have.property('jawAnimation');
      expect(data.jawAnimation).to.have.property('enabled');
      expect(data.jawAnimation).to.have.property('configs').that.is.an('array');

      // headTracking should be present
      expect(data).to.have.property('headTracking');
      expect(data.headTracking).to.have.property('smoothing');
    });

    after(async () => {
      // Restore original config
      if (originalConfig) {
        await request(BASE_URL)
          .post(`/setup/head-animation/api/head-tracking/${CHARACTER_ID}`)
          .send(originalConfig);
      }
    });
  });

  // ─── Status endpoint ──────────────────────────────────────────────
  describe('GET /api/head-tracking/:charId/status', () => {
    it('should return status when not tracking', async () => {
      const res = await request(BASE_URL)
        .get(`/setup/head-animation/api/head-tracking/${CHARACTER_ID}/status`)
        .expect(200);
      expect(res.body).to.have.property('success', true);
      expect(res.body).to.have.property('active');
      expect(res.body).to.have.property('targetDetected');
      expect(res.body).to.have.property('targetPosition');
    });
  });

  // ─── Requirements endpoint ────────────────────────────────────────
  describe('GET /api/head-tracking/:charId/requirements', () => {
    it('should return requirements check', async () => {
      const res = await request(BASE_URL)
        .get(`/setup/head-animation/api/head-tracking/${CHARACTER_ID}/requirements`)
        .expect(200);
      expect(res.body).to.have.property('success', true);
      expect(res.body).to.have.property('requirements');
      expect(res.body.requirements).to.have.property('servos');
      expect(res.body.requirements).to.have.property('webcams');
      expect(res.body.requirements).to.have.property('mjpgStreamer');
    });
  });

  // ─── Stop endpoint (safe to call even when not tracking) ──────────
  describe('POST /api/head-tracking/:charId/stop', () => {
    it('should succeed even when not tracking', async () => {
      const res = await request(BASE_URL)
        .post(`/setup/head-animation/api/head-tracking/${CHARACTER_ID}/stop`)
        .expect(200);
      expect(res.body).to.have.property('success', true);
    });
  });

  // ─── Test sweep uses calibrated min/max ──────────────────────────
  describe('POST /api/head-tracking/:charId/test-sweep', () => {
    let sweepOriginalConfig = null;

    before(async () => {
      const res = await request(BASE_URL)
        .get(`/setup/head-animation/api/head-tracking/${CHARACTER_ID}`)
        .expect(200);
      sweepOriginalConfig = res.body.config;
    });

    it('should return calibrated min/max in sweep response', async function() {
      this.timeout(15000); // Servo sweep takes ~4s with movement delays
      // First save config with a known servo
      const servosRes = await request(BASE_URL)
        .get(`/setup/head-animation/api/head-tracking/${CHARACTER_ID}`)
        .expect(200);

      const servos = servosRes.body.availableServos || [];
      if (servos.length === 0) {
        // Skip if no servos available (test environment without hardware)
        return;
      }

      // Pick a calibrated servo if available
      const calibratedServo = servos.find(s => s.calibrated) || servos[0];

      // Save config with this servo
      await request(BASE_URL)
        .post(`/setup/head-animation/api/head-tracking/${CHARACTER_ID}`)
        .send({
          opencvEnabled: false,
          enabled: false,
          panServoId: calibratedServo.id,
          webcamPartId: null,
          smoothing: 0.3,
          deadzone: 5,
          centerDeg: 0,
          rangeDeg: 60
        })
        .expect(200);

      // Test sweep should use calibrated bounds
      const sweepRes = await request(BASE_URL)
        .post(`/setup/head-animation/api/head-tracking/${CHARACTER_ID}/test-sweep`)
        .expect(200);

      expect(sweepRes.body).to.have.property('success', true);
      expect(sweepRes.body).to.have.property('minAngle');
      expect(sweepRes.body).to.have.property('maxAngle');
      expect(sweepRes.body).to.have.property('steps').that.is.an('array');

      // If the servo is calibrated, min and max should match calibrated values
      if (calibratedServo.calibrated) {
        expect(sweepRes.body.minAngle).to.equal(calibratedServo.minAngle);
        expect(sweepRes.body.maxAngle).to.equal(calibratedServo.maxAngle);
      }
    });

    after(async () => {
      // Restore original config
      if (sweepOriginalConfig) {
        await request(BASE_URL)
          .post(`/setup/head-animation/api/head-tracking/${CHARACTER_ID}`)
          .send(sweepOriginalConfig);
      }
    });
  });

  // ─── Servo calibration data in available servos ──────────────────
  describe('Calibration integration', () => {
    it('should include calibration status and bounds in available servos', async () => {
      const res = await request(BASE_URL)
        .get(`/setup/head-animation/api/head-tracking/${CHARACTER_ID}`)
        .expect(200);

      expect(res.body).to.have.property('availableServos').that.is.an('array');

      res.body.availableServos.forEach(servo => {
        expect(servo).to.have.property('id');
        expect(servo).to.have.property('name');
        expect(servo).to.have.property('calibrated');

        if (servo.calibrated) {
          expect(servo.minAngle).to.be.a('number');
          expect(servo.maxAngle).to.be.a('number');
          expect(servo.maxAngle).to.be.greaterThan(servo.minAngle);
        }
      });
    });

    it('should report servo type correctly based on calibration profile', async () => {
      const res = await request(BASE_URL)
        .get(`/setup/head-animation/api/head-tracking/${CHARACTER_ID}`)
        .expect(200);

      // All servos for Orlok should have config info
      const servos = res.body.availableServos || [];
      servos.forEach(servo => {
        expect(servo).to.have.property('config');
        // servoType should be present in config
        if (servo.config && servo.config.servoType) {
          expect(['standard', 'continuous', 'feedback']).to.include(servo.config.servoType);
        }
      });
    });
  });
});
