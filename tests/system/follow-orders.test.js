/**
 * Follow Orders system suite.
 *
 * Runs against the always-on test listener (BASE_URL, port 3100) with
 * MB_TEST_MODE=1 semantics on the routes that stub hardware. Config writes
 * capture the prior state in before() and restore it in after() — the same
 * discipline the orchestration suite adopted after a run permanently muted
 * three live animatronics.
 */
import { expect } from 'chai';
import request from 'supertest';

const BASE_URL = process.env.BASE_URL || 'http://localhost:3100';

let CHARACTER_ID;
let priorConfig = null;

describe('Follow Orders API', () => {
  before(async () => {
    const res = await request(BASE_URL).get('/api/config').expect(200);
    CHARACTER_ID = (res.body.config && res.body.config.selectedCharacter) || 1;
    const cfg = await request(BASE_URL).get(`/setup/follow-orders/api/follow-orders/${CHARACTER_ID}`);
    if (cfg.status === 200 && cfg.body && cfg.body.success) priorConfig = cfg.body.config;
  });

  after(async () => {
    // Restore whatever was configured before this run touched anything.
    if (priorConfig) {
      await request(BASE_URL)
        .post(`/setup/follow-orders/api/follow-orders/${CHARACTER_ID}`)
        .send(priorConfig);
    }
  });

  // ─── Page serving ──────────────────────────────────────────────────
  describe('Page', () => {
    it('should serve the follow-orders setup page', async () => {
      const res = await request(BASE_URL).get('/setup/follow-orders').expect(200);
      expect(res.text).to.include('Follow Orders');
    });

    it('should include the core UI elements', async () => {
      const res = await request(BASE_URL).get('/setup/follow-orders').expect(200);
      expect(res.text).to.include('foEnabled');
      expect(res.text).to.include('foRequireName');
      expect(res.text).to.include('foAckSpeak');
      expect(res.text).to.include('foCommandsList');
      expect(res.text).to.include('foAliasList');
      expect(res.text).to.include('foTryText');
      expect(res.text).to.include('foHistoryList');
    });

    it('should load the follow-orders.js client script', async () => {
      const res = await request(BASE_URL).get('/setup/follow-orders').expect(200);
      expect(res.text).to.include('follow-orders.js');
    });
  });

  // ─── Super-power catalog ───────────────────────────────────────────
  describe('Catalog', () => {
    it('GET /api/list reports the follow-orders super power', async () => {
      const res = await request(BASE_URL).get('/setup/follow-orders/api/list').expect(200);
      expect(res.body.success).to.equal(true);
      expect(res.body.superpowers).to.be.an('array').with.lengthOf(1);
      const sp = res.body.superpowers[0];
      expect(sp.id).to.equal('follow-orders');
      expect(sp).to.have.property('enabled');
      expect(sp).to.have.property('available');
      expect(sp.stats).to.have.property('listening');
    });
  });

  // ─── Config round-trip ─────────────────────────────────────────────
  describe('Config', () => {
    it('GET returns a defaults-merged config with canPerform', async () => {
      const res = await request(BASE_URL)
        .get(`/setup/follow-orders/api/follow-orders/${CHARACTER_ID}`).expect(200);
      expect(res.body.success).to.equal(true);
      expect(res.body.config).to.include.keys(
        'enabled', 'requireAddressByName', 'ackMode', 'minConfidence',
        'commands', 'partAliases');
      expect(res.body.canPerform).to.have.property('ok');
      expect(res.body.listener).to.have.property('listening');
    });

    it('POST round-trips a config change', async () => {
      const res = await request(BASE_URL)
        .post(`/setup/follow-orders/api/follow-orders/${CHARACTER_ID}`)
        .send({ minConfidence: 0.7, cooldownMs: 1500 })
        .expect(200);
      expect(res.body.success).to.equal(true);
      expect(res.body.config.minConfidence).to.equal(0.7);
      expect(res.body.config.cooldownMs).to.equal(1500);

      const readBack = await request(BASE_URL)
        .get(`/setup/follow-orders/api/follow-orders/${CHARACTER_ID}`).expect(200);
      expect(readBack.body.config.minConfidence).to.equal(0.7);
    });

    it('POST preserves the other super-power sections (finding #47 regression)', async () => {
      // Writing followOrders must not clobber jawAnimation in the same file.
      const jawBefore = await request(BASE_URL)
        .get(`/setup/jaw-animation/api/jaw-animation/${CHARACTER_ID}`);
      await request(BASE_URL)
        .post(`/setup/follow-orders/api/follow-orders/${CHARACTER_ID}`)
        .send({ cooldownMs: 1750 })
        .expect(200);
      const jawAfter = await request(BASE_URL)
        .get(`/setup/jaw-animation/api/jaw-animation/${CHARACTER_ID}`);
      if (jawBefore.status === 200 && jawAfter.status === 200) {
        expect(jawAfter.body.config && jawAfter.body.config.servoPartId)
          .to.deep.equal(jawBefore.body.config && jawBefore.body.config.servoPartId);
      }
    });

    it('rejects a command with no phrases', async () => {
      await request(BASE_URL)
        .post(`/setup/follow-orders/api/follow-orders/${CHARACTER_ID}`)
        .send({ commands: [{ phrases: [], action: { kind: 'stop' } }] })
        .expect(400);
    });

    it('rejects a command with an unknown action kind', async () => {
      await request(BASE_URL)
        .post(`/setup/follow-orders/api/follow-orders/${CHARACTER_ID}`)
        .send({ commands: [{ phrases: ['do the thing'], action: { kind: 'explode' } }] })
        .expect(400);
    });

    it('rejects an invalid ackMode', async () => {
      await request(BASE_URL)
        .post(`/setup/follow-orders/api/follow-orders/${CHARACTER_ID}`)
        .send({ ackMode: 'shout' })
        .expect(400);
    });
  });

  // ─── Candidates ────────────────────────────────────────────────────
  describe('Candidates', () => {
    it('returns poses, gestures, and parts for the builder', async () => {
      const res = await request(BASE_URL)
        .get(`/setup/follow-orders/api/candidates/${CHARACTER_ID}`).expect(200);
      expect(res.body.success).to.equal(true);
      expect(res.body.poses).to.be.an('array');
      expect(res.body.gestures).to.be.an('array');
      expect(res.body.parts).to.be.an('array');
      expect(res.body.characterName).to.be.a('string');
    });
  });

  // ─── Matching (dry run — never hardware) ───────────────────────────
  describe('Test-match', () => {
    it('requires text', async () => {
      await request(BASE_URL)
        .post(`/setup/follow-orders/api/test-match/${CHARACTER_ID}`)
        .send({})
        .expect(400);
    });

    it('returns a match result shape for any phrase', async () => {
      const res = await request(BASE_URL)
        .post(`/setup/follow-orders/api/test-match/${CHARACTER_ID}`)
        .send({ text: 'raise your arm' })
        .expect(200);
      expect(res.body.success).to.equal(true);
      expect(res.body.match).to.have.property('matched');
    });

    it('"stop" always matches as a stop order', async () => {
      const res = await request(BASE_URL)
        .post(`/setup/follow-orders/api/test-match/${CHARACTER_ID}`)
        .send({ text: 'stop' })
        .expect(200);
      expect(res.body.match.matched).to.equal(true);
      expect(res.body.match.kind).to.equal('stop');
    });

    it('gibberish refuses with a reason', async () => {
      const res = await request(BASE_URL)
        .post(`/setup/follow-orders/api/test-match/${CHARACTER_ID}`)
        .send({ text: 'flumph the quantum zorble' })
        .expect(200);
      expect(res.body.match.matched).to.equal(false);
      expect(res.body.match.reason).to.be.a('string');
    });
  });

  // ─── Execution path ────────────────────────────────────────────────
  describe('Test-execute', () => {
    it('handles a stop order safely in any environment', async () => {
      // "stop" is the only phrase this suite may execute: it stops parts and
      // never starts motion. On a server with MB_TEST_MODE set it returns the
      // stub; on the Pi's production listener it actually runs stopEverything
      // (safe by definition) and reports the per-part results.
      const res = await request(BASE_URL)
        .post(`/setup/follow-orders/api/test-execute/${CHARACTER_ID}`)
        .send({ text: 'stop' })
        .expect(200);
      expect(res.body.success).to.equal(true);
      expect(res.body.match.kind).to.equal('stop');
      if (res.body.testMode) {
        expect(res.body).to.not.have.property('execution');
      } else {
        expect(res.body.execution).to.have.property('kind', 'stop');
      }
    });
  });

  // ─── History ───────────────────────────────────────────────────────
  describe('History', () => {
    it('returns the history ring buffer', async () => {
      const res = await request(BASE_URL)
        .get(`/setup/follow-orders/api/history/${CHARACTER_ID}`).expect(200);
      expect(res.body.success).to.equal(true);
      expect(res.body.history).to.be.an('array');
    });

    it('clears on DELETE', async () => {
      await request(BASE_URL)
        .delete(`/setup/follow-orders/api/history/${CHARACTER_ID}`).expect(200);
      const res = await request(BASE_URL)
        .get(`/setup/follow-orders/api/history/${CHARACTER_ID}`).expect(200);
      expect(res.body.history).to.deep.equal([]);
    });
  });

  // ─── Node-local toggle (fleet contract) ────────────────────────────
  describe('Conversation toggle', () => {
    it('GET /conversation/api/follow-orders reports state', async () => {
      const res = await request(BASE_URL).get('/conversation/api/follow-orders').expect(200);
      expect(res.body.success).to.equal(true);
      expect(res.body).to.have.property('enabled');
      expect(res.body.listener).to.have.property('listening');
    });

    it('POST toggles enabled and reports honestly', async () => {
      const res = await request(BASE_URL)
        .post('/conversation/api/follow-orders')
        .send({ enabled: true })
        .expect(200);
      // On a node whose character lacks a mic or controllable parts the route
      // must refuse with { success:false, error } — both outcomes are valid.
      if (res.body.success) {
        expect(res.body.enabled).to.equal(true);
      } else {
        expect(res.body.error).to.be.a('string');
      }

      const off = await request(BASE_URL)
        .post('/conversation/api/follow-orders')
        .send({ enabled: false })
        .expect(200);
      expect(off.body.success).to.equal(true);
      expect(off.body.enabled).to.equal(false);
    });
  });

  // ─── Dashboard integration ─────────────────────────────────────────
  describe('Dashboard', () => {
    it('the dashboard carries the Orders toggle and badge', async () => {
      const res = await request(BASE_URL).get('/').expect(200);
      expect(res.text).to.include('followOrdersToggle');
      expect(res.text).to.include('followOrdersBadge');
    });
  });
});
