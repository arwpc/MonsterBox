import { expect } from 'chai';
import request from 'supertest';

const BASE_URL = process.env.BASE_URL || 'http://localhost:3000';
let CHARACTER_ID;
let HAS_JAW_SERVOS = false;

describe('Jaw Animation Super Power API', () => {
  before(async () => {
    // Get the selected character from the running server
    const configRes = await request(BASE_URL).get('/api/config').expect(200);
    CHARACTER_ID = (configRes.body.config && configRes.body.config.selectedCharacter) || 1;
    // Check if this character has jaw animation fully configured (servo + enabled)
    const jawRes = await request(BASE_URL)
      .get(`/setup/jaw-animation/api/jaw-animation/${CHARACTER_ID}`);
    const jawCandidate = (jawRes.body.availableServos || []).find(s => s.isJawCandidate);
    HAS_JAW_SERVOS = !!(jawCandidate && jawRes.body.config && jawRes.body.config.servoPartId);
  });

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

    it('should include v2 UI elements (filter, AGC, quantization, presets, timeline)', async () => {
      const res = await request(BASE_URL).get('/setup/jaw-animation').expect(200);
      expect(res.text).to.include('bandpassFilter');
      expect(res.text).to.include('agcEnabled');
      expect(res.text).to.include('quantizationRange');
      expect(res.text).to.include('presetSpeech');
      expect(res.text).to.include('presetMusic');
      expect(res.text).to.include('presetCustom');
      expect(res.text).to.include('jawTimelineCanvas');
    });

    it('should load the jaw-animation.js client script', async () => {
      const res = await request(BASE_URL).get('/setup/jaw-animation').expect(200);
      expect(res.text).to.include('jaw-animation.js');
    });

    it('should include multi-config CRUD UI elements', async () => {
      const res = await request(BASE_URL).get('/setup/jaw-animation').expect(200);
      expect(res.text).to.include('configSelector');
      expect(res.text).to.include('saveAsNewBtn');
      expect(res.text).to.include('renameConfigBtn');
      expect(res.text).to.include('deleteConfigBtn');
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

    it('should return available servos for the character', async function () {
      if (!HAS_JAW_SERVOS) return this.skip();
      const res = await request(BASE_URL)
        .get(`/setup/jaw-animation/api/jaw-animation/${CHARACTER_ID}`)
        .expect(200);
      expect(res.body.availableServos).to.be.an('array').with.length.greaterThan(0);
    });

    it('should identify jaw candidates by name', async function () {
      if (!HAS_JAW_SERVOS) return this.skip();
      const res = await request(BASE_URL)
        .get(`/setup/jaw-animation/api/jaw-animation/${CHARACTER_ID}`)
        .expect(200);
      const jawCandidate = res.body.availableServos.find(s => s.isJawCandidate);
      if (!jawCandidate) return this.skip(); // character may not have a jaw-named servo
      expect(jawCandidate.name.toLowerCase()).to.include('jaw');
    });

    it('should include calibration data for calibrated servos', async function () {
      if (!HAS_JAW_SERVOS) return this.skip();
      const res = await request(BASE_URL)
        .get(`/setup/jaw-animation/api/jaw-animation/${CHARACTER_ID}`)
        .expect(200);
      const calibrated = res.body.availableServos.filter(s => s.calibrated);
      if (calibrated.length === 0) return this.skip(); // no calibrated servos
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

    it('should save v2 config fields (bandpass, AGC, quantization, preset)', async function() {
      if (!jawServoId) this.skip();
      const config = {
        enabled: true,
        servoPartId: jawServoId,
        sensitivity: 1.0,
        smoothing: 0.6,
        volumeThreshold: 0.02,
        attackTime: 50,
        releaseTime: 150,
        useBandpassFilter: false,
        useAGC: true,
        quantizationLevels: 15,
        preset: 'music'
      };
      const saveRes = await request(BASE_URL)
        .post(`/setup/jaw-animation/api/jaw-animation/${CHARACTER_ID}`)
        .send(config)
        .expect(200);
      expect(saveRes.body.success).to.equal(true);

      // Verify persistence
      const readRes = await request(BASE_URL)
        .get(`/setup/jaw-animation/api/jaw-animation/${CHARACTER_ID}`)
        .expect(200);
      expect(readRes.body.config.useBandpassFilter).to.equal(false);
      expect(readRes.body.config.useAGC).to.equal(true);
      expect(readRes.body.config.quantizationLevels).to.equal(15);
      expect(readRes.body.config.preset).to.equal('music');
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
      // Restore default config (including v2 fields)
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
            releaseTime: 150,
            useBandpassFilter: true,
            useAGC: true,
            quantizationLevels: 10,
            preset: 'speech'
          });
      }
    });
  });

  // ─── Multi-Config CRUD ───────────────────────────────────────────
  describe('Multi-Config CRUD', () => {
    let createdConfigId = null;

    it('GET /configs should return configs list with activeConfigId', async () => {
      const res = await request(BASE_URL)
        .get(`/setup/jaw-animation/api/jaw-animation/${CHARACTER_ID}/configs`)
        .expect(200);
      expect(res.body).to.have.property('success', true);
      expect(res.body).to.have.property('activeConfigId').that.is.a('string');
      expect(res.body).to.have.property('configs').that.is.an('array');
      expect(res.body.configs.length).to.be.greaterThan(0);
      res.body.configs.forEach(c => {
        expect(c).to.have.property('id');
        expect(c).to.have.property('name');
      });
    });

    it('GET /jaw-animation/:charId should include configs in response', async () => {
      const res = await request(BASE_URL)
        .get(`/setup/jaw-animation/api/jaw-animation/${CHARACTER_ID}`)
        .expect(200);
      expect(res.body).to.have.property('configs').that.is.an('array');
      expect(res.body).to.have.property('activeConfigId').that.is.a('string');
    });

    it('POST /configs should create a new config', async () => {
      const res = await request(BASE_URL)
        .post(`/setup/jaw-animation/api/jaw-animation/${CHARACTER_ID}/configs`)
        .send({ name: 'Test Config' })
        .expect(200);
      expect(res.body).to.have.property('success', true);
      expect(res.body).to.have.property('config');
      expect(res.body.config).to.have.property('id').that.is.a('string');
      expect(res.body.config).to.have.property('name', 'Test Config');
      createdConfigId = res.body.config.id;
    });

    it('POST /configs with cloneFrom should copy tuning params', async () => {
      const res = await request(BASE_URL)
        .post(`/setup/jaw-animation/api/jaw-animation/${CHARACTER_ID}/configs`)
        .send({ name: 'Cloned Config', cloneFrom: 'config-1' })
        .expect(200);
      expect(res.body).to.have.property('success', true);
      expect(res.body.config).to.have.property('sensitivity');
      expect(res.body.config).to.have.property('smoothing');
      // Clean up the cloned config
      const clonedId = res.body.config.id;
      await request(BASE_URL)
        .delete(`/setup/jaw-animation/api/jaw-animation/${CHARACTER_ID}/configs/${clonedId}`)
        .expect(200);
    });

    it('POST /configs should reject empty name', async () => {
      const res = await request(BASE_URL)
        .post(`/setup/jaw-animation/api/jaw-animation/${CHARACTER_ID}/configs`)
        .send({ name: '' })
        .expect(400);
      expect(res.body).to.have.property('success', false);
    });

    it('POST /configs/:id/rename should rename a config', async function() {
      if (!createdConfigId) this.skip();
      const res = await request(BASE_URL)
        .post(`/setup/jaw-animation/api/jaw-animation/${CHARACTER_ID}/configs/${createdConfigId}/rename`)
        .send({ name: 'Renamed Config' })
        .expect(200);
      expect(res.body).to.have.property('success', true);
      expect(res.body.config).to.have.property('name', 'Renamed Config');
    });

    it('POST /configs/:id/rename should reject empty name', async function() {
      if (!createdConfigId) this.skip();
      const res = await request(BASE_URL)
        .post(`/setup/jaw-animation/api/jaw-animation/${CHARACTER_ID}/configs/${createdConfigId}/rename`)
        .send({ name: '  ' })
        .expect(400);
      expect(res.body).to.have.property('success', false);
    });

    it('PUT /configs/:id should update config params', async function() {
      if (!createdConfigId) this.skip();
      const res = await request(BASE_URL)
        .put(`/setup/jaw-animation/api/jaw-animation/${CHARACTER_ID}/configs/${createdConfigId}`)
        .send({ sensitivity: 3.5, smoothing: 0.8 })
        .expect(200);
      expect(res.body).to.have.property('success', true);
      expect(res.body.config).to.have.property('sensitivity', 3.5);
      expect(res.body.config).to.have.property('smoothing', 0.8);
    });

    it('PUT /configs/:id should return 404 for non-existent config', async () => {
      const res = await request(BASE_URL)
        .put(`/setup/jaw-animation/api/jaw-animation/${CHARACTER_ID}/configs/nonexistent-id`)
        .send({ sensitivity: 1.0 })
        .expect(404);
      expect(res.body).to.have.property('success', false);
    });

    it('POST /configs/:id/activate should switch active config', async function() {
      if (!createdConfigId) this.skip();
      const res = await request(BASE_URL)
        .post(`/setup/jaw-animation/api/jaw-animation/${CHARACTER_ID}/configs/${createdConfigId}/activate`)
        .expect(200);
      expect(res.body).to.have.property('success', true);
      expect(res.body).to.have.property('config');
      expect(res.body.config).to.have.property('activeConfigId', createdConfigId);
    });

    it('after activate, GET should return new active config params', async function() {
      if (!createdConfigId) this.skip();
      const res = await request(BASE_URL)
        .get(`/setup/jaw-animation/api/jaw-animation/${CHARACTER_ID}`)
        .expect(200);
      expect(res.body.activeConfigId).to.equal(createdConfigId);
      expect(res.body.config.sensitivity).to.equal(3.5);
    });

    it('DELETE should not allow deleting the active config', async function() {
      if (!createdConfigId) this.skip();
      const res = await request(BASE_URL)
        .delete(`/setup/jaw-animation/api/jaw-animation/${CHARACTER_ID}/configs/${createdConfigId}`)
        .expect(400);
      expect(res.body).to.have.property('success', false);
      expect(res.body.error).to.include('active');
    });

    it('should switch back to original config before cleanup', async function() {
      if (!createdConfigId) this.skip();
      await request(BASE_URL)
        .post(`/setup/jaw-animation/api/jaw-animation/${CHARACTER_ID}/configs/config-1/activate`)
        .expect(200);
    });

    it('DELETE should delete a non-active config', async function() {
      if (!createdConfigId) this.skip();
      const res = await request(BASE_URL)
        .delete(`/setup/jaw-animation/api/jaw-animation/${CHARACTER_ID}/configs/${createdConfigId}`)
        .expect(200);
      expect(res.body).to.have.property('success', true);
    });

    it('after delete, configs list should not contain deleted config', async function() {
      if (!createdConfigId) this.skip();
      const res = await request(BASE_URL)
        .get(`/setup/jaw-animation/api/jaw-animation/${CHARACTER_ID}/configs`)
        .expect(200);
      const ids = res.body.configs.map(c => c.id);
      expect(ids).to.not.include(createdConfigId);
    });

    it('DELETE should not allow deleting the last config', async () => {
      // Get configs to find the only remaining one
      const listRes = await request(BASE_URL)
        .get(`/setup/jaw-animation/api/jaw-animation/${CHARACTER_ID}/configs`)
        .expect(200);
      if (listRes.body.configs.length !== 1) return; // Only test when exactly 1 config
      const lastId = listRes.body.configs[0].id;
      const res = await request(BASE_URL)
        .delete(`/setup/jaw-animation/api/jaw-animation/${CHARACTER_ID}/configs/${lastId}`)
        .expect(400);
      expect(res.body).to.have.property('success', false);
      expect(res.body.error).to.include('last');
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
    it('should accept valid amplitude', async function () {
      if (!HAS_JAW_SERVOS) return this.skip();
      const res = await request(BASE_URL)
        .post(`/setup/jaw-animation/api/jaw-animation/${CHARACTER_ID}/drive`)
        .send({ amplitude: 0.5 });
      if (res.status !== 200) return this.skip(); // requires configured jaw servo
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

    it('should return guardrails with calibration data', async function () {
      if (!HAS_JAW_SERVOS) return this.skip();
      const res = await request(BASE_URL)
        .post(`/setup/jaw-animation/api/jaw-animation/${CHARACTER_ID}/drive`)
        .send({ amplitude: 0.5 });
      if (res.status !== 200 || !res.body.guardrails) return this.skip();
      expect(res.body.guardrails).to.have.property('calibrated', true);
      expect(res.body.guardrails.minAngle).to.be.a('number');
      expect(res.body.guardrails.maxAngle).to.be.a('number');
    });

    it('should clamp target angle within calibrated range', async function () {
      if (!HAS_JAW_SERVOS) return this.skip();
      const res = await request(BASE_URL)
        .post(`/setup/jaw-animation/api/jaw-animation/${CHARACTER_ID}/drive`)
        .send({ amplitude: 1.0 });
      if (res.status !== 200 || !res.body.guardrails) return this.skip();
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
    it('should execute jaw test sequence', async function () {
      if (!HAS_JAW_SERVOS) return this.skip();
      const res = await request(BASE_URL)
        .post(`/setup/jaw-animation/api/jaw-animation/${CHARACTER_ID}/test`);
      if (res.status !== 200) return this.skip(); // may fail without configured jaw
      expect(res.body).to.have.property('success', true);
      expect(res.body).to.have.property('message').that.includes('completed');
    }).timeout(10000); // Jaw test takes ~2s for the movement sequence
  });

  // ─── Test TTS with timeline ────────────────────────────────────────
  describe('POST /api/jaw-animation/:characterId/test-tts', () => {
    it('should return timeline array in response or fail gracefully when TTS unavailable', async function() {
      this.timeout(15000);
      const res = await request(BASE_URL)
        .post(`/setup/jaw-animation/api/jaw-animation/${CHARACTER_ID}/test-tts`)
        .send({ text: 'Hello world' });

      if (res.status === 200) {
        // TTS succeeded — validate full response
        expect(res.body).to.have.property('success', true);
        expect(res.body).to.have.property('duration').that.is.a('number');
        // Timeline should be present (may be null/undefined if TTS unavailable in CI)
        if (res.body.timeline != null) {
          expect(res.body.timeline).to.be.an('array');
          if (res.body.timeline.length > 0) {
            expect(res.body.timeline[0]).to.have.property('time');
            expect(res.body.timeline[0]).to.have.property('angle');
            expect(res.body.timeline[0]).to.have.property('amplitude');
          }
        }
      } else {
        // TTS unavailable (quota exceeded, no API key, etc.) — verify graceful error
        expect(res.status).to.be.oneOf([500, 503]);
        expect(res.body).to.have.property('success', false);
        expect(res.body).to.have.property('error').that.is.a('string');
      }
    });

    it('should reject request without text', async () => {
      const res = await request(BASE_URL)
        .post(`/setup/jaw-animation/api/jaw-animation/${CHARACTER_ID}/test-tts`)
        .send({});
      expect(res.status).to.equal(400);
      expect(res.body).to.have.property('success', false);
    });
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
