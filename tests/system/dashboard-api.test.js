/**
 * Dashboard API System Tests
 * Deep functional testing of all dashboard panel APIs
 */
import { expect } from 'chai';
import request from 'supertest';

const BASE_URL = process.env.BASE_URL || 'http://localhost:3100';

describe('Dashboard API — Deep Functional Tests', () => {

  // ── Monster Features: Jaw Animation ──────────────────────────────
  describe('Jaw Animation Toggle', () => {
    let originalState;

    before(async () => {
      const res = await request(BASE_URL).get('/conversation/api/jaw-settings');
      originalState = res.body.enabled;
    });

    after(async () => {
      // Restore original state
      await request(BASE_URL)
        .post('/conversation/api/jaw-settings')
        .send({ enabled: originalState });
    });

    it('GET /conversation/api/jaw-settings should return current state', async () => {
      const res = await request(BASE_URL).get('/conversation/api/jaw-settings').expect(200);
      expect(res.body).to.have.property('success', true);
      expect(res.body).to.have.property('enabled').that.is.a('boolean');
    });

    it('POST should enable jaw animation', async () => {
      const res = await request(BASE_URL)
        .post('/conversation/api/jaw-settings')
        .send({ enabled: true })
        .expect(200);
      expect(res.body).to.have.property('success', true);
      expect(res.body).to.have.property('enabled', true);
    });

    it('GET should confirm jaw animation is enabled', async () => {
      const res = await request(BASE_URL).get('/conversation/api/jaw-settings').expect(200);
      expect(res.body.enabled).to.equal(true);
    });

    it('POST should disable jaw animation', async () => {
      const res = await request(BASE_URL)
        .post('/conversation/api/jaw-settings')
        .send({ enabled: false })
        .expect(200);
      expect(res.body).to.have.property('enabled', false);
    });

    it('state should persist across reads', async () => {
      await request(BASE_URL)
        .post('/conversation/api/jaw-settings')
        .send({ enabled: true });
      const res = await request(BASE_URL).get('/conversation/api/jaw-settings');
      expect(res.body.enabled).to.equal(true);
    });
  });

  // ── Monster Features: Head Tracking ──────────────────────────────
  describe('Head Tracking Toggle', () => {
    it('GET /conversation/api/head-tracking-status should return tracking state', async () => {
      const res = await request(BASE_URL).get('/conversation/api/head-tracking-status').expect(200);
      expect(res.body).to.have.property('success', true);
      expect(res.body).to.have.property('headTracking').that.is.an('object');
      expect(res.body.headTracking).to.have.property('enabled').that.is.a('boolean');
      expect(res.body.headTracking).to.have.property('tracking').that.is.an('object');
      expect(res.body.headTracking.tracking).to.have.property('active').that.is.a('boolean');
      expect(res.body.headTracking.tracking).to.have.property('hasTarget');
    });

    it('POST should enable head tracking (or 400 without hardware)', async () => {
      const res = await request(BASE_URL)
        .post('/conversation/api/head-tracking')
        .send({ enabled: true });
      // 200 with hardware, 400 without webcam/servo, or 200 in test-mode bypass
      if (res.status === 200) {
        expect(res.body).to.have.property('success', true);
      } else {
        expect(res.status).to.equal(400);
        expect(res.body).to.have.property('success', false);
      }
    });

    it('POST should disable head tracking', async () => {
      const res = await request(BASE_URL)
        .post('/conversation/api/head-tracking')
        .send({ enabled: false });
      // 200 with hardware or test-mode bypass, 400 without webcam
      if (res.status === 200) {
        expect(res.body).to.have.property('success');
      } else {
        expect(res.status).to.equal(400);
      }
    });

    it('should accept click-to-track target', async () => {
      // Try to enable tracking first
      const enableRes = await request(BASE_URL)
        .post('/conversation/api/head-tracking')
        .send({ enabled: true });

      // If enable failed (no hardware), the target endpoint will also fail
      if (enableRes.status !== 200) {
        // Skip target test gracefully when no hardware
        return;
      }

      const res = await request(BASE_URL)
        .post('/conversation/api/head-tracking/target')
        .send({ x: 50, y: 50, durationSec: 5 });
      expect([200, 400, 500]).to.include(res.status);
      if (res.status === 200) {
        expect(res.body).to.have.property('success', true);
      }

      // Disable tracking after test
      await request(BASE_URL)
        .post('/conversation/api/head-tracking')
        .send({ enabled: false });
    });

    it('should return servo config in status', async () => {
      const res = await request(BASE_URL).get('/conversation/api/head-tracking-status');
      expect(res.body.headTracking).to.have.property('panServoId');
      expect(res.body.headTracking).to.have.property('smoothing').that.is.a('number');
      expect(res.body.headTracking).to.have.property('deadzone').that.is.a('number');
    });
  });

  // ── Monster Features: Speaker Mute ───────────────────────────────
  describe('Speaker Mute Toggle', () => {
    after(async () => {
      // Ensure unmuted after tests
      await request(BASE_URL)
        .post('/conversation/api/speaker-mute')
        .send({ muted: false });
    });

    it('GET /conversation/api/speaker-mute should return mute state', async () => {
      const res = await request(BASE_URL).get('/conversation/api/speaker-mute').expect(200);
      expect(res.body).to.have.property('success', true);
      expect(res.body).to.have.property('muted').that.is.a('boolean');
    });

    it('POST should mute speaker', async () => {
      const res = await request(BASE_URL)
        .post('/conversation/api/speaker-mute')
        .send({ muted: true })
        .expect(200);
      expect(res.body).to.have.property('muted', true);
    });

    it('GET should confirm muted state', async () => {
      const res = await request(BASE_URL).get('/conversation/api/speaker-mute');
      expect(res.body.muted).to.equal(true);
    });

    it('POST should unmute speaker', async () => {
      const res = await request(BASE_URL)
        .post('/conversation/api/speaker-mute')
        .send({ muted: false })
        .expect(200);
      expect(res.body).to.have.property('muted', false);
    });
  });

  // ── Monster Features: Speakers List ──────────────────────────────
  describe('Speakers API', () => {
    it('GET /conversation/api/speakers should return speaker list', async () => {
      const res = await request(BASE_URL).get('/conversation/api/speakers').expect(200);
      expect(res.body).to.have.property('success', true);
      expect(res.body).to.have.property('speakers').that.is.an('array');
      // Orlok should have at least one speaker
      if (res.body.speakers.length > 0) {
        expect(res.body.speakers[0]).to.have.property('id');
        expect(res.body.speakers[0]).to.have.property('name');
        expect(res.body.speakers[0]).to.have.property('type', 'speaker');
      }
    });
  });

  // ── Say Panel / TTS ──────────────────────────────────────────────
  describe('Say Panel (TTS)', () => {
    it('POST /conversation/api/say should accept text and speak', async () => {
      const res = await request(BASE_URL)
        .post('/conversation/api/say')
        .send({ text: 'Test from system test' })
        .expect(200);
      expect(res.body).to.have.property('success', true);
    });

    it('should reject empty text', async () => {
      const res = await request(BASE_URL)
        .post('/conversation/api/say')
        .send({ text: '' })
        .expect(400);
      expect(res.body).to.have.property('success', false);
      expect(res.body).to.have.property('error').that.includes('text is required');
    });

    it('should reject missing text', async () => {
      const res = await request(BASE_URL)
        .post('/conversation/api/say')
        .send({})
        .expect(400);
      expect(res.body).to.have.property('success', false);
    });
  });


  // ── Scenes Panel ─────────────────────────────────────────────────
  describe('Scenes Panel', () => {
    it('GET /scenes/api/ should return scenes list', async () => {
      const res = await request(BASE_URL).get('/scenes/api/').expect(200);
      expect(res.body).to.have.property('success', true);
      expect(res.body).to.have.property('scenes').that.is.an('array');
    });

    it('scenes should have required fields', async () => {
      const res = await request(BASE_URL).get('/scenes/api/');
      if (res.body.scenes.length > 0) {
        const scene = res.body.scenes[0];
        expect(scene).to.have.property('id');
        expect(scene).to.have.property('name');
        expect(scene).to.have.property('steps').that.is.an('array');
      }
    });

    it('POST /scenes/api/reorder should accept ordered IDs', async () => {
      const listRes = await request(BASE_URL).get('/scenes/api/');
      if (listRes.body.scenes.length > 1) {
        const ids = listRes.body.scenes.map(s => s.id);
        const res = await request(BASE_URL)
          .post('/scenes/api/reorder')
          .send({ orderedIds: ids })
          .expect(200);
        expect(res.body).to.have.property('success', true);
      }
    });

    it('POST /scenes/api/queue/stop should succeed even when not playing', async () => {
      const res = await request(BASE_URL)
        .post('/scenes/api/queue/stop')
        .expect(200);
      expect(res.body).to.have.property('success', true);
    });

    it('POST /scenes/api/queue/clear should succeed', async () => {
      const res = await request(BASE_URL)
        .post('/scenes/api/queue/clear')
        .expect(200);
      expect(res.body).to.have.property('success', true);
    });
  });

  // ── Poses Panel ──────────────────────────────────────────────────
  describe('Poses Panel', () => {
    it('GET /poses/api/poses should return poses list', async () => {
      const res = await request(BASE_URL).get('/poses/api/poses').expect(200);
      expect(res.body).to.have.property('success', true);
      expect(res.body).to.have.property('poses').that.is.an('array');
    });
  });

  // ── Console Panel ────────────────────────────────────────────────
  describe('Console Panel', () => {
    it('GET /api/system/console should return log output', async () => {
      const res = await request(BASE_URL)
        .get('/api/system/console?lines=10&source=stdout')
        .expect(200);
      expect(res.body).to.have.property('success', true);
      expect(res.body).to.have.property('output').that.is.a('string');
    });

    it('should accept lines parameter', async () => {
      const res = await request(BASE_URL)
        .get('/api/system/console?lines=5&source=stdout')
        .expect(200);
      expect(res.body).to.have.property('success', true);
      expect(res.body).to.have.property('output');
    });

    it('should accept stderr source', async () => {
      const res = await request(BASE_URL)
        .get('/api/system/console?lines=5&source=stderr')
        .expect(200);
      expect(res.body).to.have.property('success', true);
    });
  });

  // ── Webcam ───────────────────────────────────────────────────────
  describe('Webcam', () => {
    it('GET /conversation/api/webcam-stream-url should return URL', async () => {
      const res = await request(BASE_URL)
        .get('/conversation/api/webcam-stream-url')
        .expect(200);
      expect(res.body).to.have.property('success', true);
      expect(res.body).to.have.property('url').that.is.a('string');
    });
  });

  // ── AI Agent Status ──────────────────────────────────────────────
  describe('AI Agent Status', () => {
    it('GET /conversation/api/agent-status should return config status', async () => {
      const res = await request(BASE_URL)
        .get('/conversation/api/agent-status')
        .expect(200);
      expect(res.body).to.have.property('success', true);
      expect(res.body).to.have.property('configured').that.is.a('boolean');
      expect(res.body).to.have.property('characterId');
    });
  });

  // ── Dashboard Page ───────────────────────────────────────────────
  describe('Dashboard Page', () => {
    it('GET / should return 200 with dashboard HTML', async () => {
      const res = await request(BASE_URL).get('/').expect(200);
      expect(res.text).to.include('MonsterBox Dashboard');
      expect(res.text).to.include('dashboard');
    });

    it('should include all panel sections', async () => {
      const res = await request(BASE_URL).get('/');
      expect(res.text).to.include('Webcam');
      expect(res.text).to.include('Live Console');
      expect(res.text).to.include('Scenes');
      expect(res.text).to.include('Poses');
      expect(res.text).to.include('Manual Controls');
      expect(res.text).to.include('Monster Features');
      expect(res.text).to.include('Chat');
      expect(res.text).to.include('Browser Audio Bridge');
    });

    it('should include monster feature toggles', async () => {
      const res = await request(BASE_URL).get('/');
      expect(res.text).to.include('jawToggle');
      expect(res.text).to.include('parrotToggle');
      expect(res.text).to.include('headTrackToggle');
      expect(res.text).to.include('speakerMuteToggle');
    });

    it('should include character-specific content', async () => {
      const res = await request(BASE_URL).get('/');
      // Should have character ID embedded
      expect(res.text).to.include('__MB_CHAR_ID');
    });
  });

  // ── Manual Controls Layout ───────────────────────────────────────
  describe('Manual Controls Layout', () => {
    it('GET /conversation/api/manual-controls-layout should return layout', async () => {
      const res = await request(BASE_URL)
        .get('/conversation/api/manual-controls-layout?name=Default')
        .expect(200);
      expect(res.body).to.have.property('success', true);
    });
  });

  // ── Audio Bridge ─────────────────────────────────────────────────
  describe('Audio Bridge APIs', () => {
    it('GET /setup/audio/api/inputs should return input devices', async () => {
      const res = await request(BASE_URL)
        .get('/setup/audio/api/inputs')
        .expect(200);
      expect(res.body).to.have.property('success', true);
    });

    it('GET /setup/audio/api/outputs should return output devices', async () => {
      const res = await request(BASE_URL)
        .get('/setup/audio/api/outputs')
        .expect(200);
      expect(res.body).to.have.property('success', true);
    });
  });
});
