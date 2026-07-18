/**
 * Orchestration API System Tests — Fleet Command Center (v8.5.0)
 * Covers the fleet-control REST surface: status/health, node registry + discovery,
 * broadcast fan-out with success counts, per-node control, superpowers, transport,
 * emergency stop, master volume, and Auto-AI.
 *
 * Runs under MB_TEST_MODE=1 against the always-on :3100 listener. Command endpoints
 * that would drive real nodes have test-mode short-circuits so their happy paths are
 * deterministic offline.
 */
import { expect } from 'chai';
import request from 'supertest';

const BASE_URL = process.env.BASE_URL || 'http://localhost:3100';

describe('Orchestration API (Fleet Command Center)', () => {

  // ── Status & Health ──────────────────────────────────────────────
  describe('GET /api/orchestration/status', () => {
    it('returns status + online/total counts for all configured animatronics', async () => {
      const res = await request(BASE_URL).get('/api/orchestration/status').expect(200);
      expect(res.body).to.have.property('success', true);
      expect(res.body).to.have.property('total').that.is.a('number');
      expect(res.body).to.have.property('online').that.is.a('number');
      expect(res.body).to.have.property('offline').that.is.a('number');
      expect(res.body).to.have.property('animatronics').that.is.an('array');
      expect(res.body.animatronics.length).to.be.greaterThan(0);
      for (const anim of res.body.animatronics) {
        expect(anim).to.have.property('id');
        expect(anim).to.have.property('name').that.is.a('string');
        expect(anim).to.have.property('ip').that.is.a('string');
        expect(anim).to.have.property('port').that.is.a('number');
        expect(anim).to.have.property('online').that.is.a('boolean');
      }
    });
  });

  describe('POST /api/orchestration/health-check', () => {
    it('returns health check results (backward-compatible alias)', async () => {
      const res = await request(BASE_URL).post('/api/orchestration/health-check').expect(200);
      expect(res.body).to.have.property('success', true);
      expect(res.body).to.have.property('animatronics').that.is.an('array');
      expect(res.body).to.have.property('total').that.is.a('number');
    });
  });

  // ── Node registry + discovery ────────────────────────────────────
  describe('GET /api/orchestration/nodes', () => {
    it('returns the live registry with source/status/avahi provenance', async () => {
      const res = await request(BASE_URL).get('/api/orchestration/nodes').expect(200);
      expect(res.body).to.have.property('success', true);
      expect(res.body).to.have.property('avahiAvailable');
      expect(res.body).to.have.property('count').that.is.a('number');
      expect(res.body).to.have.property('nodes').that.is.an('array');
      for (const n of res.body.nodes) {
        expect(n).to.have.property('id');
        expect(n).to.have.property('source').that.is.a('string');
      }
    });
  });

  describe('POST/DELETE /api/orchestration/nodes/manual', () => {
    it('rejects a pin without id and ip (400)', async () => {
      const res = await request(BASE_URL).post('/api/orchestration/nodes/manual').send({ name: 'x' }).expect(400);
      expect(res.body).to.have.property('success', false);
    });
    it('pins and forgets a node', async () => {
      const add = await request(BASE_URL).post('/api/orchestration/nodes/manual')
        .send({ id: 'test-pin', ip: '192.168.8.222', name: 'Test Pin' }).expect(200);
      expect(add.body).to.have.property('success', true);
      const del = await request(BASE_URL).delete('/api/orchestration/nodes/manual/test-pin').expect(200);
      expect(del.body).to.have.property('success', true);
    });
    it('returns 404 forgetting an unknown pin', async () => {
      await request(BASE_URL).delete('/api/orchestration/nodes/manual/does-not-exist').expect(404);
    });
  });

  // ── Fleet health ─────────────────────────────────────────────────
  describe('GET /api/orchestration/fleet-health', () => {
    it('returns aggregated per-node health cards', async () => {
      const res = await request(BASE_URL).get('/api/orchestration/fleet-health').expect(200);
      expect(res.body).to.have.property('success', true);
      expect(res.body).to.have.property('total').that.is.a('number');
      expect(res.body).to.have.property('online').that.is.a('number');
      expect(res.body).to.have.property('nodes').that.is.an('array');
      for (const n of res.body.nodes) {
        expect(n).to.have.property('id');
        expect(n).to.have.property('name');
        expect(n).to.have.property('online').that.is.a('boolean');
      }
    });
  });

  describe('GET /api/orchestration/animatronic/:id/status', () => {
    it('returns status for a known node', async () => {
      const res = await request(BASE_URL).get('/api/orchestration/animatronic/1/status').expect(200);
      expect(res.body).to.have.property('success', true);
      expect(res.body).to.have.property('online').that.is.a('boolean');
    });
    it('returns 404 for an unknown node', async () => {
      await request(BASE_URL).get('/api/orchestration/animatronic/999/status').expect(404);
    });
  });

  // ── Broadcast fan-out (success counts) ───────────────────────────
  describe('POST /api/orchestration/broadcast/animatronics', () => {
    it('requires command field', async () => {
      const res = await request(BASE_URL).post('/api/orchestration/broadcast/animatronics').send({}).expect(400);
      expect(res.body).to.have.property('success', false);
      expect(res.body.error).to.include('command');
    });
    it('returns a structured fan-out summary', async () => {
      const res = await request(BASE_URL).post('/api/orchestration/broadcast/animatronics')
        .send({ command: 'health-check' }).expect(200);
      expect(res.body).to.have.property('success').that.is.a('boolean');
      expect(res.body).to.have.property('command', 'health-check');
      expect(res.body).to.have.property('total').that.is.a('number');
      expect(res.body).to.have.property('successful').that.is.a('number');
      expect(res.body).to.have.property('failed').that.is.a('number');
      expect(res.body).to.have.property('results').that.is.an('array');
    });
  });

  describe('POST /api/orchestration/broadcast/goblins', () => {
    it('requires command field', async () => {
      const res = await request(BASE_URL).post('/api/orchestration/broadcast/goblins').send({}).expect(400);
      expect(res.body).to.have.property('success', false);
    });
    it('returns a structured summary', async () => {
      const res = await request(BASE_URL).post('/api/orchestration/broadcast/goblins')
        .send({ command: 'health-check' }).expect(200);
      expect(res.body).to.have.property('results').that.is.an('array');
      expect(res.body).to.have.property('total').that.is.a('number');
    });
  });

  describe('POST /api/orchestration/broadcast/all', () => {
    it('broadcasts to both animatronics and goblins', async () => {
      const res = await request(BASE_URL).post('/api/orchestration/broadcast/all')
        .send({ command: 'health-check' }).expect(200);
      expect(res.body).to.have.property('animatronics');
      expect(res.body).to.have.property('goblins');
    });
  });

  // ── Say All (test mode) ──────────────────────────────────────────
  describe('POST /api/orchestration/say-all', () => {
    it('requires text field', async () => {
      const res = await request(BASE_URL).post('/api/orchestration/say-all').send({}).expect(400);
      expect(res.body.error).to.include('text');
    });
    it('returns test-mode results for each animatronic', async () => {
      const res = await request(BASE_URL).post('/api/orchestration/say-all').send({ text: 'Hello' }).expect(200);
      expect(res.body).to.have.property('success', true);
      expect(res.body.results).to.be.an('array').with.length.greaterThan(0);
    });
  });

  // ── Fleet superpowers ────────────────────────────────────────────
  describe('POST /api/orchestration/superpower/:feature', () => {
    ['lurk', 'jaw', 'head', 'motion', 'mute', 'idle'].forEach((feature) => {
      it(`toggles ${feature} across the fleet (test mode)`, async () => {
        const res = await request(BASE_URL).post(`/api/orchestration/superpower/${feature}`)
          .send({ enabled: true }).expect(200);
        expect(res.body).to.have.property('success', true);
        expect(res.body).to.have.property('feature', feature);
        expect(res.body).to.have.property('enabled', true);
        expect(res.body).to.have.property('results').that.is.an('array');
      });
    });
    it('rejects an unknown superpower (400)', async () => {
      const res = await request(BASE_URL).post('/api/orchestration/superpower/bogus').send({ enabled: true }).expect(400);
      expect(res.body).to.have.property('success', false);
    });
  });

  // ── Transport + panic ────────────────────────────────────────────
  describe('Fleet transport', () => {
    it('POST /start-all-queue-loops returns total/successful/results', async () => {
      const res = await request(BASE_URL).post('/api/orchestration/start-all-queue-loops').expect(200);
      expect(res.body).to.have.property('total').that.is.a('number');
      expect(res.body).to.have.property('successful').that.is.a('number');
      expect(res.body).to.have.property('results').that.is.an('array');
    });
    it('POST /stop-all-queue-loops returns a summary (test mode)', async () => {
      const res = await request(BASE_URL).post('/api/orchestration/stop-all-queue-loops').expect(200);
      expect(res.body).to.have.property('success', true);
      expect(res.body).to.have.property('results').that.is.an('array');
    });
    it('POST /emergency-stop halts the fleet (test mode)', async () => {
      const res = await request(BASE_URL).post('/api/orchestration/emergency-stop').expect(200);
      expect(res.body).to.have.property('success', true);
      expect(res.body).to.have.property('results').that.is.an('array');
    });
  });

  // ── Master volume ────────────────────────────────────────────────
  describe('PUT /api/orchestration/volume', () => {
    it('requires a volume value (400)', async () => {
      const res = await request(BASE_URL).put('/api/orchestration/volume').send({}).expect(400);
      expect(res.body).to.have.property('success', false);
    });
    it('sets master volume across the fleet (test mode)', async () => {
      const res = await request(BASE_URL).put('/api/orchestration/volume').send({ volume: 65 }).expect(200);
      expect(res.body).to.have.property('success', true);
      expect(res.body).to.have.property('volume', 65);
    });
  });

  // ── Random Poses ─────────────────────────────────────────────────
  describe('Random poses', () => {
    it('POST /enable-random-poses accepts a broadcast', async () => {
      const res = await request(BASE_URL).post('/api/orchestration/enable-random-poses').send({ cooldownMs: 5000 }).expect(200);
      expect(res.body).to.have.property('results').that.is.an('array');
    });
    it('POST /disable-random-poses accepts a broadcast', async () => {
      const res = await request(BASE_URL).post('/api/orchestration/disable-random-poses').expect(200);
      expect(res.body).to.have.property('command', 'disable-random-poses');
    });
  });

  // ── Auto AI ──────────────────────────────────────────────────────
  describe('Auto AI', () => {
    it('GET /auto-ai/status returns all statuses', async () => {
      const res = await request(BASE_URL).get('/api/orchestration/auto-ai/status').expect(200);
      expect(res.body).to.have.property('success', true);
      expect(res.body.summary).to.have.property('total').that.is.a('number');
      expect(res.body.summary).to.have.property('active').that.is.a('number');
    });
    it('starts, reads, and stops auto-ai for a node', async () => {
      const start = await request(BASE_URL).post('/api/orchestration/animatronic/1/auto-ai/start').send({ interval: 60 }).expect(200);
      expect(start.body).to.have.property('success', true);
      const status = await request(BASE_URL).get('/api/orchestration/animatronic/1/auto-ai/status').expect(200);
      expect(status.body).to.have.property('active').that.is.a('boolean');
      const stop = await request(BASE_URL).post('/api/orchestration/animatronic/1/auto-ai/stop').expect(200);
      expect(stop.body).to.have.property('success', true);
    });
    it('returns 404 starting auto-ai for a non-existent node', async () => {
      await request(BASE_URL).post('/api/orchestration/animatronic/999/auto-ai/start').send({ interval: 30 }).expect(404);
    });
  });

  // ── Per-Animatronic validation ───────────────────────────────────
  describe('Per-animatronic validation', () => {
    it('POST /:id/say requires text', async () => {
      const res = await request(BASE_URL).post('/api/orchestration/animatronic/1/say').send({}).expect(400);
      expect(res.body.error).to.include('text');
    });
    it('POST /:id/say returns 404 for invalid id', async () => {
      await request(BASE_URL).post('/api/orchestration/animatronic/999/say').send({ text: 'test' }).expect(404);
    });
    it('POST /:id/ask-ai requires text', async () => {
      await request(BASE_URL).post('/api/orchestration/animatronic/1/ask-ai').send({}).expect(400);
    });
    it('POST /:id/play-audio requires audioId', async () => {
      const res = await request(BASE_URL).post('/api/orchestration/animatronic/1/play-audio').send({}).expect(400);
      expect(res.body.error).to.include('audioId');
    });
    it('GET /:id/webcam-url returns 404 for invalid id', async () => {
      await request(BASE_URL).get('/api/orchestration/animatronic/999/webcam-url').expect(404);
    });
    it('GET /:id/audio-files returns 404 for invalid id', async () => {
      await request(BASE_URL).get('/api/orchestration/animatronic/999/audio-files').expect(404);
    });
    it('GET /:id/webcam-stream returns 404 for invalid id', async () => {
      await request(BASE_URL).get('/api/orchestration/animatronic/999/webcam-stream').expect(404);
    });
  });

  // ── Page ─────────────────────────────────────────────────────────
  describe('GET /orchestration', () => {
    it('renders the Fleet Command Center page', async () => {
      const res = await request(BASE_URL).get('/orchestration').expect(200);
      expect(res.text).to.include('Fleet Command Center');
    });
  });
});
