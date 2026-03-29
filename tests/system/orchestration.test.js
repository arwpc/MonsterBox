/**
 * Orchestration API System Tests
 * Tests the orchestration endpoints for multi-animatronic coordination
 */
import { expect } from 'chai';
import request from 'supertest';

const BASE_URL = process.env.BASE_URL || 'http://localhost:3100';

describe('Orchestration API', () => {

  // ── Status & Health ──────────────────────────────────────────────
  describe('GET /api/orchestration/status', () => {
    it('should return status for all configured animatronics', async () => {
      const res = await request(BASE_URL)
        .get('/api/orchestration/status')
        .expect(200);
      expect(res.body).to.have.property('success', true);
      expect(res.body).to.have.property('animatronics').that.is.an('array');
      expect(res.body.animatronics.length).to.be.greaterThan(0);

      // Each animatronic should have identifying fields
      for (const anim of res.body.animatronics) {
        expect(anim).to.have.property('id');
        expect(anim).to.have.property('name').that.is.a('string');
        expect(anim).to.have.property('ip').that.is.a('string');
        expect(anim).to.have.property('port').that.is.a('number');
        // online status depends on network, just check the field exists
        expect(anim).to.have.property('online').that.is.a('boolean');
      }
    });
  });

  describe('POST /api/orchestration/health-check', () => {
    it('should return health check results (backward-compatible alias)', async () => {
      const res = await request(BASE_URL)
        .post('/api/orchestration/health-check')
        .expect(200);
      expect(res.body).to.have.property('success', true);
      expect(res.body).to.have.property('animatronics').that.is.an('array');
      expect(res.body).to.have.property('total').that.is.a('number');
    });
  });

  // ── Broadcast Commands ──────────────────────────────────────────
  describe('POST /api/orchestration/broadcast/animatronics', () => {
    it('should require command field', async () => {
      const res = await request(BASE_URL)
        .post('/api/orchestration/broadcast/animatronics')
        .send({})
        .expect(400);
      expect(res.body).to.have.property('success', false);
      expect(res.body).to.have.property('error').that.includes('command');
    });

    it('should broadcast health-check to all animatronics', async () => {
      const res = await request(BASE_URL)
        .post('/api/orchestration/broadcast/animatronics')
        .send({ command: 'health-check' })
        .expect(200);
      expect(res.body).to.have.property('success', true);
      expect(res.body).to.have.property('command', 'health-check');
      expect(res.body).to.have.property('results').that.is.an('array');
    });
  });

  describe('POST /api/orchestration/broadcast/goblins', () => {
    it('should require command field', async () => {
      const res = await request(BASE_URL)
        .post('/api/orchestration/broadcast/goblins')
        .send({})
        .expect(400);
      expect(res.body).to.have.property('success', false);
    });

    it('should broadcast health-check to all goblins', async () => {
      const res = await request(BASE_URL)
        .post('/api/orchestration/broadcast/goblins')
        .send({ command: 'health-check' })
        .expect(200);
      expect(res.body).to.have.property('success', true);
      expect(res.body).to.have.property('results').that.is.an('array');
    });
  });

  describe('POST /api/orchestration/broadcast/all', () => {
    it('should require command field', async () => {
      const res = await request(BASE_URL)
        .post('/api/orchestration/broadcast/all')
        .send({})
        .expect(400);
      expect(res.body).to.have.property('success', false);
    });

    it('should broadcast to both animatronics and goblins', async () => {
      const res = await request(BASE_URL)
        .post('/api/orchestration/broadcast/all')
        .send({ command: 'health-check' })
        .expect(200);
      expect(res.body).to.have.property('success', true);
      expect(res.body).to.have.property('animatronics');
      expect(res.body).to.have.property('goblins');
    });
  });

  // ── Say All (test mode) ─────────────────────────────────────────
  describe('POST /api/orchestration/say-all', () => {
    it('should require text field', async () => {
      const res = await request(BASE_URL)
        .post('/api/orchestration/say-all')
        .send({})
        .expect(400);
      expect(res.body).to.have.property('success', false);
      expect(res.body).to.have.property('error').that.includes('text');
    });

    it('should return test-mode response with results for each animatronic', async () => {
      const res = await request(BASE_URL)
        .post('/api/orchestration/say-all')
        .send({ text: 'Hello from tests' })
        .expect(200);
      expect(res.body).to.have.property('success', true);
      expect(res.body).to.have.property('results').that.is.an('array');
      expect(res.body.results.length).to.be.greaterThan(0);

      // In test mode, all should succeed
      if (res.body.testMode) {
        expect(res.body).to.have.property('text', 'Hello from tests');
        for (const r of res.body.results) {
          expect(r).to.have.property('animatronic').that.is.a('string');
          expect(r).to.have.property('success', true);
        }
      }
    });
  });

  // ── Random Poses ────────────────────────────────────────────────
  describe('POST /api/orchestration/enable-random-poses', () => {
    it('should accept enable-random-poses broadcast', async () => {
      const res = await request(BASE_URL)
        .post('/api/orchestration/enable-random-poses')
        .send({ cooldownMs: 5000 })
        .expect(200);
      expect(res.body).to.have.property('success', true);
      expect(res.body).to.have.property('results').that.is.an('array');
    });
  });

  describe('POST /api/orchestration/disable-random-poses', () => {
    it('should accept disable-random-poses broadcast', async () => {
      const res = await request(BASE_URL)
        .post('/api/orchestration/disable-random-poses')
        .expect(200);
      expect(res.body).to.have.property('success', true);
    });
  });

  // ── Queue Loops (test mode) ─────────────────────────────────────
  describe('POST /api/orchestration/start-all-queue-loops', () => {
    it('should return structured response with total, successful, and results', async () => {
      const res = await request(BASE_URL)
        .post('/api/orchestration/start-all-queue-loops')
        .expect(200);
      // success may be false if devices are unreachable (non-test-mode server)
      expect(res.body).to.have.property('success').that.is.a('boolean');
      expect(res.body).to.have.property('total').that.is.a('number');
      expect(res.body).to.have.property('successful').that.is.a('number');
      expect(res.body).to.have.property('results').that.is.an('array');
      expect(res.body.results.length).to.equal(res.body.total);
    });
  });

  // ── Auto AI ─────────────────────────────────────────────────────
  describe('Auto AI endpoints', () => {
    it('GET /api/orchestration/auto-ai/status should return all statuses', async () => {
      const res = await request(BASE_URL)
        .get('/api/orchestration/auto-ai/status')
        .expect(200);
      expect(res.body).to.have.property('success', true);
      expect(res.body).to.have.property('summary').that.is.an('object');
      expect(res.body.summary).to.have.property('total').that.is.a('number');
      expect(res.body.summary).to.have.property('active').that.is.a('number');
    });

    it('POST /api/orchestration/animatronic/:id/auto-ai/start should start auto-ai', async () => {
      const res = await request(BASE_URL)
        .post('/api/orchestration/animatronic/1/auto-ai/start')
        .send({ interval: 60 })
        .expect(200);
      expect(res.body).to.have.property('success', true);
      expect(res.body).to.have.property('active', true);
    });

    it('GET /api/orchestration/animatronic/:id/auto-ai/status should return status', async () => {
      const res = await request(BASE_URL)
        .get('/api/orchestration/animatronic/1/auto-ai/status')
        .expect(200);
      expect(res.body).to.have.property('id');
      expect(res.body).to.have.property('active').that.is.a('boolean');
    });

    it('POST /api/orchestration/animatronic/:id/auto-ai/stop should stop auto-ai', async () => {
      const res = await request(BASE_URL)
        .post('/api/orchestration/animatronic/1/auto-ai/stop')
        .expect(200);
      expect(res.body).to.have.property('success', true);
    });

    it('POST /api/orchestration/auto-ai/stop-all should stop all', async () => {
      const res = await request(BASE_URL)
        .post('/api/orchestration/auto-ai/stop-all')
        .expect(200);
      expect(res.body).to.have.property('success', true);
    });

    it('should return 404 for non-existent animatronic', async () => {
      const res = await request(BASE_URL)
        .post('/api/orchestration/animatronic/999/auto-ai/start')
        .send({ interval: 30 })
        .expect(404);
      expect(res.body).to.have.property('success', false);
    });
  });

  // ── Per-Animatronic Endpoints ───────────────────────────────────
  describe('Per-animatronic endpoints', () => {
    it('POST /api/orchestration/animatronic/:id/say should require text', async () => {
      const res = await request(BASE_URL)
        .post('/api/orchestration/animatronic/1/say')
        .send({})
        .expect(400);
      expect(res.body).to.have.property('success', false);
      expect(res.body).to.have.property('error').that.includes('text');
    });

    it('POST /api/orchestration/animatronic/:id/say should return 404 for invalid id', async () => {
      const res = await request(BASE_URL)
        .post('/api/orchestration/animatronic/999/say')
        .send({ text: 'test' })
        .expect(404);
      expect(res.body).to.have.property('success', false);
    });

    it('POST /api/orchestration/animatronic/:id/ask-ai should require text', async () => {
      const res = await request(BASE_URL)
        .post('/api/orchestration/animatronic/1/ask-ai')
        .send({})
        .expect(400);
      expect(res.body).to.have.property('success', false);
    });

    it('POST /api/orchestration/animatronic/:id/play-audio should require audioId', async () => {
      const res = await request(BASE_URL)
        .post('/api/orchestration/animatronic/1/play-audio')
        .send({})
        .expect(400);
      expect(res.body).to.have.property('success', false);
      expect(res.body).to.have.property('error').that.includes('audioId');
    });

    it('GET /api/orchestration/animatronic/:id/webcam-url should return 404 for invalid id', async () => {
      const res = await request(BASE_URL)
        .get('/api/orchestration/animatronic/999/webcam-url')
        .expect(404);
      expect(res.body).to.have.property('success', false);
    });

    it('GET /api/orchestration/animatronic/:id/audio-files should return 404 for invalid id', async () => {
      const res = await request(BASE_URL)
        .get('/api/orchestration/animatronic/999/audio-files')
        .expect(404);
      expect(res.body).to.have.property('success', false);
    });
  });

  // ── Orchestration Page ──────────────────────────────────────────
  describe('GET /orchestration', () => {
    it('should render the orchestration page', async () => {
      const res = await request(BASE_URL)
        .get('/orchestration')
        .expect(200);
      expect(res.text).to.include('Orchestration');
    });
  });
});
