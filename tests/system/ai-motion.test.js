/**
 * AI Motion system suite.
 *
 * Runs against the always-on test listener (BASE_URL, port 3100). AI Motion is
 * the single answer to "may this character move right now, and with what", so
 * every test here writes to real operator state: the aiMotion section of
 * super-powers.json and the character's motion vocabulary in gestures.json.
 *
 * State-restoration discipline, same as the Follow Orders and orchestration
 * suites: the prior config is captured in before() and put back in after(), and
 * any capability this suite authors is deleted in after() as well as in the test
 * that created it — a failed run must not leave test debris in gestures.json.
 * The suite that skipped this permanently muted three live animatronics.
 *
 * Nothing here performs a capability. Authoring and validation are exercised;
 * hardware is not commanded.
 */
import { expect } from 'chai';
import request from 'supertest';
import fs from 'fs/promises';
import path from 'path';

const BASE_URL = process.env.BASE_URL || 'http://localhost:3100';

// Everything this suite creates carries this prefix so cleanup can be blunt.
const TEST_CAPABILITY_ID = '__mb_test_ai_motion_capability';

let CHARACTER_ID;
let priorConfig = null;
let priorSiblings = null;      // non-aiMotion sections of super-powers.json, when readable locally
let superPowersFile = null;    // only set when the listener is on this box
let capabilityFixture = null;  // a recipe this character can actually hold
let servoPartId = null;

/**
 * super-powers.json is node-local: reading it only means something when the
 * listener under test is this box. When BASE_URL points elsewhere the sibling
 * check falls back to comparing the sibling super powers' own endpoints.
 */
function isLocalListener() {
  return /^https?:\/\/(localhost|127\.0\.0\.1)(:|\/|$)/.test(BASE_URL);
}

async function readSuperPowersFile() {
  if (!superPowersFile) return null;
  try {
    return JSON.parse(await fs.readFile(superPowersFile, 'utf8'));
  } catch (_) {
    return null;
  }
}

async function deleteTestCapability() {
  if (CHARACTER_ID == null) return;
  await request(BASE_URL)
    .delete(`/setup/ai-motion/api/ai-motion/${CHARACTER_ID}/capabilities/${TEST_CAPABILITY_ID}`)
    .catch(() => {});
}

describe('AI Motion API', function () {
  this.timeout(15000);

  before(async () => {
    const res = await request(BASE_URL).get('/api/config').expect(200);
    CHARACTER_ID = (res.body.config && res.body.config.selectedCharacter) || 1;

    const cfg = await request(BASE_URL).get(`/setup/ai-motion/api/ai-motion/${CHARACTER_ID}`);
    if (cfg.status === 200 && cfg.body && cfg.body.success) priorConfig = cfg.body.config;

    if (isLocalListener()) {
      superPowersFile = path.resolve(`data/character-${CHARACTER_ID}/super-powers.json`);
      const file = await readSuperPowersFile();
      if (file) {
        priorSiblings = { ...file };
        delete priorSiblings.aiMotion;
      }
    }

    // Build a capability fixture out of THIS character's own material rather
    // than hardcoding part or pose ids. Two distinct poses satisfy the
    // concurrency rule without needing calibrated raw targets; a pose plus this
    // character's light is the fallback.
    const poses = await request(BASE_URL).get(`/poses/api/poses?characterId=${CHARACTER_ID}`);
    const poseIds = (poses.status === 200 && Array.isArray(poses.body.poses))
      ? poses.body.poses.map(p => p.id) : [];
    const rolesRes = await request(BASE_URL).get(`/setup/ai-motion/api/ai-motion/${CHARACTER_ID}/roles`);
    const roles = (rolesRes.status === 200 && rolesRes.body.roles) || {};
    const lightPartId = (roles.light && roles.light[0] && roles.light[0].partId) || null;

    for (const group of Object.values(roles)) {
      const servo = (group || []).find(p => String(p.type).toLowerCase() === 'servo');
      if (servo) { servoPartId = servo.partId; break; }
    }

    if (poseIds.length >= 2) {
      capabilityFixture = {
        id: TEST_CAPABILITY_ID,
        label: 'Test capability',
        intent: 'suite fixture — never performed',
        steps: [
          { pose: poseIds[0], delayMs: 0, durationMs: 600 },
          { pose: poseIds[1], delayMs: 200, durationMs: 600 }
        ],
        kidSafe: true
      };
    } else if (poseIds.length === 1 && lightPartId != null) {
      capabilityFixture = {
        id: TEST_CAPABILITY_ID,
        label: 'Test capability',
        intent: 'suite fixture — never performed',
        steps: [
          { pose: poseIds[0], delayMs: 0, durationMs: 600 },
          { partId: lightPartId, type: 'light', level: 0, delayMs: 0 }
        ],
        kidSafe: true
      };
    }

    // A previous failed run could have left the fixture behind.
    await deleteTestCapability();
  });

  after(async () => {
    // Debris first, then the config — both unconditionally, whatever failed.
    await deleteTestCapability();
    if (priorConfig) {
      await request(BASE_URL)
        .post(`/setup/ai-motion/api/ai-motion/${CHARACTER_ID}`)
        .send(priorConfig);
    }
  });

  // ─── Page serving ──────────────────────────────────────────────────
  describe('Page', () => {
    it('serves the AI Motion setup page', async () => {
      const res = await request(BASE_URL).get('/setup/ai-motion').expect(200);
      expect(res.text).to.include('AI Motion');
    });
  });

  // ─── Super-power catalog ───────────────────────────────────────────
  describe('Catalog', () => {
    it('GET /api/list reports the ai-motion super power', async () => {
      const res = await request(BASE_URL).get('/setup/ai-motion/api/list').expect(200);
      expect(res.body.success).to.equal(true);
      expect(res.body).to.have.property('characterId');
      expect(res.body.superpowers).to.be.an('array').with.lengthOf(1);

      const sp = res.body.superpowers[0];
      expect(sp.id).to.equal('ai-motion');
      expect(sp).to.have.property('enabled').that.is.a('boolean');
      expect(sp).to.have.property('available').that.is.a('boolean');
      expect(sp.config).to.include.keys('enabled', 'triggers', 'permissions');
      expect(sp.stats).to.have.property('capabilities').that.is.a('number');
      expect(sp.stats).to.have.property('rejected').that.is.a('number');
    });

    it('the catalog entry agrees with the config endpoint', async () => {
      const list = await request(BASE_URL).get('/setup/ai-motion/api/list').expect(200);
      const cfg = await request(BASE_URL)
        .get(`/setup/ai-motion/api/ai-motion/${CHARACTER_ID}`).expect(200);
      expect(list.body.superpowers[0].enabled).to.equal(cfg.body.config.enabled);
    });
  });

  // ─── Config round-trip ─────────────────────────────────────────────
  describe('Config', () => {
    it('GET returns a defaults-merged config and the role vocabulary', async () => {
      const res = await request(BASE_URL)
        .get(`/setup/ai-motion/api/ai-motion/${CHARACTER_ID}`).expect(200);
      expect(res.body.success).to.equal(true);
      expect(res.body.config).to.include.keys('enabled', 'triggers', 'permissions');
      expect(res.body.config.triggers).to.include.keys(
        'agentGesture', 'guestCommand', 'ambientDuringSpeech');
      expect(res.body.config.permissions).to.include.keys(
        'allowedRoles', 'deniedPartIds', 'kidSafeOnly', 'cooldownMs',
        'maxPerConversation', 'minConfidence', 'requireAddressByName',
        'ambientMinAmplitude', 'ambientMaxAmplitude');
      expect(res.body.roles).to.be.an('array').that.includes('head');
    });

    it('POST round-trips a permissions change', async () => {
      const res = await request(BASE_URL)
        .post(`/setup/ai-motion/api/ai-motion/${CHARACTER_ID}`)
        .send({ permissions: { cooldownMs: 4321, minConfidence: 0.75 } })
        .expect(200);
      expect(res.body.success).to.equal(true);
      expect(res.body.config.permissions.cooldownMs).to.equal(4321);
      expect(res.body.config.permissions.minConfidence).to.equal(0.75);

      const readBack = await request(BASE_URL)
        .get(`/setup/ai-motion/api/ai-motion/${CHARACTER_ID}`).expect(200);
      expect(readBack.body.config.permissions.cooldownMs).to.equal(4321);
      expect(readBack.body.config.permissions.minConfidence).to.equal(0.75);
    });

    it('a partial POST does not wipe the sections it did not mention', async () => {
      const before = await request(BASE_URL)
        .get(`/setup/ai-motion/api/ai-motion/${CHARACTER_ID}`).expect(200);
      const priorRoles = before.body.config.permissions.allowedRoles;

      await request(BASE_URL)
        .post(`/setup/ai-motion/api/ai-motion/${CHARACTER_ID}`)
        .send({ permissions: { cooldownMs: 4322 } })
        .expect(200);

      const after = await request(BASE_URL)
        .get(`/setup/ai-motion/api/ai-motion/${CHARACTER_ID}`).expect(200);
      expect(after.body.config.permissions.allowedRoles).to.deep.equal(priorRoles);
      expect(after.body.config.triggers).to.deep.equal(before.body.config.triggers);
    });

    it('POST preserves the SIBLING super-power sections (finding #47 regression)', async () => {
      // super-powers.json holds jawAnimation, headTracking, followOrders and
      // aiMotion in ONE file. A plain read-modify-write silently drops whichever
      // section was written last — this is the single most important assertion
      // in this file, because the loss is invisible until the jaw stops moving.
      const jawBefore = await request(BASE_URL)
        .get(`/setup/jaw-animation/api/jaw-animation/${CHARACTER_ID}`);
      const foBefore = await request(BASE_URL)
        .get(`/setup/follow-orders/api/follow-orders/${CHARACTER_ID}`);
      const fileBefore = await readSuperPowersFile();

      await request(BASE_URL)
        .post(`/setup/ai-motion/api/ai-motion/${CHARACTER_ID}`)
        .send({ permissions: { cooldownMs: 4323 } })
        .expect(200);

      const fileAfter = await readSuperPowersFile();
      if (fileBefore && fileAfter) {
        // Every sibling section must still be present and byte-for-byte equal.
        for (const key of Object.keys(fileBefore)) {
          if (key === 'aiMotion') continue;
          expect(fileAfter, `super-powers.json lost "${key}"`).to.have.property(key);
          expect(fileAfter[key], `super-powers.json mutated "${key}"`)
            .to.deep.equal(fileBefore[key]);
        }
        for (const key of ['jawAnimation', 'headTracking', 'followOrders']) {
          if (key in fileBefore) expect(fileAfter).to.have.property(key);
        }
      }

      // Endpoint-level confirmation, so this still proves something when the
      // listener under test is not this box.
      const jawAfter = await request(BASE_URL)
        .get(`/setup/jaw-animation/api/jaw-animation/${CHARACTER_ID}`);
      if (jawBefore.status === 200 && jawAfter.status === 200) {
        expect(jawAfter.body.config).to.deep.equal(jawBefore.body.config);
      }
      const foAfter = await request(BASE_URL)
        .get(`/setup/follow-orders/api/follow-orders/${CHARACTER_ID}`);
      if (foBefore.status === 200 && foAfter.status === 200) {
        expect(foAfter.body.config).to.deep.equal(foBefore.body.config);
      }
    });
  });

  // ─── Validation ────────────────────────────────────────────────────
  describe('Config validation', () => {
    it('rejects an unknown role in allowedRoles, naming the role', async () => {
      const res = await request(BASE_URL)
        .post(`/setup/ai-motion/api/ai-motion/${CHARACTER_ID}`)
        .send({ permissions: { allowedRoles: ['head', 'tentacle'] } })
        .expect(400);
      expect(res.body.success).to.equal(false);
      expect(res.body.error).to.be.a('string').and.match(/tentacle/);
      expect(res.body.errors).to.be.an('array').that.is.not.empty;
      expect(res.body.errors.join(' ')).to.match(/tentacle/);
    });

    it('rejects minConfidence outside 0..1, naming the field', async () => {
      for (const bad of [1.7, -0.5]) {
        const res = await request(BASE_URL)
          .post(`/setup/ai-motion/api/ai-motion/${CHARACTER_ID}`)
          .send({ permissions: { minConfidence: bad } })
          .expect(400);
        expect(res.body.errors.join(' '), `minConfidence=${bad}`).to.match(/minConfidence/);
      }
    });

    it('rejects an inverted ambient window, naming both fields', async () => {
      const res = await request(BASE_URL)
        .post(`/setup/ai-motion/api/ai-motion/${CHARACTER_ID}`)
        .send({ permissions: { ambientMinAmplitude: 0.8, ambientMaxAmplitude: 0.3 } })
        .expect(400);
      expect(res.body.errors.join(' ')).to.match(/ambientMinAmplitude/);
      expect(res.body.errors.join(' ')).to.match(/ambientMaxAmplitude/);
    });

    it('a rejected POST changes nothing', async () => {
      const before = await request(BASE_URL)
        .get(`/setup/ai-motion/api/ai-motion/${CHARACTER_ID}`).expect(200);
      await request(BASE_URL)
        .post(`/setup/ai-motion/api/ai-motion/${CHARACTER_ID}`)
        .send({ permissions: { allowedRoles: ['tentacle'], cooldownMs: 12345 } })
        .expect(400);
      const after = await request(BASE_URL)
        .get(`/setup/ai-motion/api/ai-motion/${CHARACTER_ID}`).expect(200);
      expect(after.body.config).to.deep.equal(before.body.config);
    });
  });

  // ─── Roles (what this character actually has to move) ──────────────
  describe('Roles', () => {
    it('groups THIS character\'s own parts by body role', async () => {
      const res = await request(BASE_URL)
        .get(`/setup/ai-motion/api/ai-motion/${CHARACTER_ID}/roles`).expect(200);
      expect(res.body.success).to.equal(true);
      expect(String(res.body.characterId)).to.equal(String(CHARACTER_ID));
      expect(res.body.allRoles).to.be.an('array').that.includes('head');
      expect(res.body.roles).to.be.an('object');

      // Every group key must be a real motion role, and every entry must carry
      // the shape the page renders.
      for (const [role, entries] of Object.entries(res.body.roles)) {
        expect(res.body.allRoles, `role key "${role}"`).to.include(role);
        expect(entries).to.be.an('array').that.is.not.empty;
        for (const e of entries) {
          expect(e).to.include.keys('partId', 'name', 'type');
          expect(e).to.have.property('side');
        }
      }
    });

    it('every grouped part belongs to this character (no cross-character leakage)', async () => {
      const res = await request(BASE_URL)
        .get(`/setup/ai-motion/api/ai-motion/${CHARACTER_ID}/roles`).expect(200);
      const partsRes = await request(BASE_URL).get(`/api/parts?characterId=${CHARACTER_ID}`);
      const raw = partsRes.body;
      const parts = Array.isArray(raw) ? raw : (raw.parts || []);
      if (!parts.length) return; // nothing to compare against
      const ownIds = new Set(parts.map(p => String(p.id ?? p.partId)));

      for (const entries of Object.values(res.body.roles)) {
        for (const e of entries) {
          expect(ownIds, `part ${e.partId} ("${e.name}") is not this character's`)
            .to.include(String(e.partId));
        }
      }
    });
  });

  // ─── Capability CRUD (the motion vocabulary) ───────────────────────
  describe('Capabilities', () => {
    it('lists the authored vocabulary with a performable flag', async () => {
      const res = await request(BASE_URL)
        .get(`/setup/ai-motion/api/ai-motion/${CHARACTER_ID}/capabilities`).expect(200);
      expect(res.body.success).to.equal(true);
      expect(res.body).to.have.property('absent').that.is.a('boolean');
      expect(res.body.capabilities).to.be.an('array');
      expect(res.body.rejected).to.be.an('array');
      for (const c of res.body.capabilities) {
        expect(c).to.have.property('id').that.is.a('string');
        expect(c).to.have.property('performable').that.is.a('boolean');
      }
    });

    it('create → list → update → delete → delete again 404s', async function () {
      if (!capabilityFixture) {
        this.skip(); // character has too little material to author a valid recipe
        return;
      }

      // CREATE
      const created = await request(BASE_URL)
        .post(`/setup/ai-motion/api/ai-motion/${CHARACTER_ID}/capabilities`)
        .send(capabilityFixture);
      expect(created.status, JSON.stringify(created.body)).to.be.oneOf([200, 201]);
      expect(created.body.success).to.equal(true);
      expect(created.body.capability.id).to.equal(TEST_CAPABILITY_ID);
      expect(created.body.created).to.equal(true);

      // APPEARS IN THE LIST AS PERFORMABLE — a saved capability is a
      // performable capability; that is the whole point of the shared validator.
      const list = await request(BASE_URL)
        .get(`/setup/ai-motion/api/ai-motion/${CHARACTER_ID}/capabilities`).expect(200);
      const found = list.body.capabilities.find(c => c.id === TEST_CAPABILITY_ID);
      expect(found, 'created capability missing from the list').to.exist;
      expect(found.performable).to.equal(true);

      // UPDATE
      const updated = await request(BASE_URL)
        .put(`/setup/ai-motion/api/ai-motion/${CHARACTER_ID}/capabilities/${TEST_CAPABILITY_ID}`)
        .send({ ...capabilityFixture, label: 'Test capability (edited)' })
        .expect(200);
      expect(updated.body.success).to.equal(true);
      expect(updated.body.capability.label).to.equal('Test capability (edited)');

      const one = await request(BASE_URL)
        .get(`/setup/ai-motion/api/ai-motion/${CHARACTER_ID}/capabilities/${TEST_CAPABILITY_ID}`)
        .expect(200);
      expect(one.body.capability.label).to.equal('Test capability (edited)');

      // DELETE
      const deleted = await request(BASE_URL)
        .delete(`/setup/ai-motion/api/ai-motion/${CHARACTER_ID}/capabilities/${TEST_CAPABILITY_ID}`)
        .expect(200);
      expect(deleted.body.success).to.equal(true);
      expect(deleted.body.deleted).to.equal(TEST_CAPABILITY_ID);

      const gone = await request(BASE_URL)
        .get(`/setup/ai-motion/api/ai-motion/${CHARACTER_ID}/capabilities`).expect(200);
      expect(gone.body.capabilities.map(c => c.id)).to.not.include(TEST_CAPABILITY_ID);

      // DELETE AGAIN — honest 404, not a silent success.
      const again = await request(BASE_URL)
        .delete(`/setup/ai-motion/api/ai-motion/${CHARACTER_ID}/capabilities/${TEST_CAPABILITY_ID}`)
        .expect(404);
      expect(again.body.success).to.equal(false);
      expect(again.body.error).to.be.a('string');
    });

    it('GET of an unknown capability 404s', async () => {
      const res = await request(BASE_URL)
        .get(`/setup/ai-motion/api/ai-motion/${CHARACTER_ID}/capabilities/__mb_no_such_capability`)
        .expect(404);
      expect(res.body.success).to.equal(false);
    });

    it('refuses to save a capability with no id', async () => {
      const res = await request(BASE_URL)
        .post(`/setup/ai-motion/api/ai-motion/${CHARACTER_ID}/capabilities`)
        .send({ steps: [] })
        .expect(400);
      expect(res.body.errors.join(' ')).to.match(/id/);
    });
  });

  // ─── Capability validation (the dry run the editor shows) ──────────
  describe('Capability validation', () => {
    it('refuses a single-part recipe — the concurrency rule', async function () {
      if (!capabilityFixture) { this.skip(); return; }
      // One moving part alone reads as a machine, not a gesture.
      const res = await request(BASE_URL)
        .post(`/setup/ai-motion/api/ai-motion/${CHARACTER_ID}/capabilities/validate`)
        .send({ ...capabilityFixture, steps: [capabilityFixture.steps[0]] })
        .expect(200);
      expect(res.body.success).to.equal(true);
      expect(res.body.ok).to.equal(false);
      expect(res.body.errors.join(' ')).to.match(/two distinct parts/i);
    });

    it('the save path refuses the same single-part recipe', async function () {
      if (!capabilityFixture) { this.skip(); return; }
      // Save and validate must share one gate, or a recipe could be saved and
      // then silently vanish at load time.
      const res = await request(BASE_URL)
        .post(`/setup/ai-motion/api/ai-motion/${CHARACTER_ID}/capabilities`)
        .send({ ...capabilityFixture, steps: [capabilityFixture.steps[0]] })
        .expect(400);
      expect(res.body.errors.join(' ')).to.match(/two distinct parts/i);
    });

    it('refuses a servo target outside the calibrated window', async function () {
      if (!servoPartId) { this.skip(); return; }
      const res = await request(BASE_URL)
        .post(`/setup/ai-motion/api/ai-motion/${CHARACTER_ID}/capabilities/validate`)
        .send({
          id: '__mb_test_out_of_window',
          steps: [
            { partId: servoPartId, type: 'servo', target: 9999, delayMs: 0, durationMs: 500 },
            { partId: servoPartId, type: 'servo', target: -9999, delayMs: 900, durationMs: 500 }
          ]
        })
        .expect(200);
      expect(res.body.ok).to.equal(false);
      const text = res.body.errors.join(' ');
      // Either "outside part N's calibrated window a-b" or "has no calibrated
      // bounds" — both name calibration as the reason, and neither may pass.
      expect(text, text).to.match(/calibrated/i);
      expect(text).to.match(new RegExp(String(servoPartId)));
    });

    it('accepts the character\'s own valid fixture', async function () {
      if (!capabilityFixture) { this.skip(); return; }
      const res = await request(BASE_URL)
        .post(`/setup/ai-motion/api/ai-motion/${CHARACTER_ID}/capabilities/validate`)
        .send(capabilityFixture)
        .expect(200);
      expect(res.body.ok, JSON.stringify(res.body.errors)).to.equal(true);
      expect(res.body.errors).to.deep.equal([]);
    });
  });

  // ─── Node-local toggle (fleet contract) ────────────────────────────
  describe('Conversation toggle', () => {
    it('GET /conversation/api/ai-motion reports state', async () => {
      const res = await request(BASE_URL).get('/conversation/api/ai-motion').expect(200);
      expect(res.body.success).to.equal(true);
      expect(res.body).to.have.property('enabled').that.is.a('boolean');
      expect(res.body.triggers).to.include.keys(
        'agentGesture', 'guestCommand', 'ambientDuringSpeech');
      expect(res.body).to.have.property('capabilities').that.is.a('number');
    });

    it('POST toggles enabled and the state SURVIVES a re-read', async () => {
      // Unlike head tracking, whose armed bit lives only in a Map, this one is
      // persisted to super-powers.json — so the assertion that matters is the
      // re-read, not the POST response. Nothing is performed while it is armed:
      // ambientDuringSpeech stays off and no conversation is started.
      const on = await request(BASE_URL)
        .post('/conversation/api/ai-motion')
        .send({ enabled: true })
        .expect(200);

      if (on.body.success) {
        expect(on.body.enabled).to.equal(true);
        const readBack = await request(BASE_URL).get('/conversation/api/ai-motion').expect(200);
        expect(readBack.body.enabled, 'enabled did not persist').to.equal(true);
        const viaSetup = await request(BASE_URL)
          .get(`/setup/ai-motion/api/ai-motion/${CHARACTER_ID}`).expect(200);
        expect(viaSetup.body.config.enabled, 'setup page disagrees with the toggle').to.equal(true);
      } else {
        // A character with nothing it can move must refuse honestly rather than
        // latch "on" — the fleet toggle summarizes from this response.
        expect(on.body.error).to.be.a('string');
      }

      const off = await request(BASE_URL)
        .post('/conversation/api/ai-motion')
        .send({ enabled: false })
        .expect(200);
      expect(off.body.success).to.equal(true);
      expect(off.body.enabled).to.equal(false);

      const offRead = await request(BASE_URL).get('/conversation/api/ai-motion').expect(200);
      expect(offRead.body.enabled, 'disabled did not persist').to.equal(false);
    });

    it('a missing enabled field is treated as off, never as on', async () => {
      const res = await request(BASE_URL)
        .post('/conversation/api/ai-motion')
        .send({})
        .expect(200);
      expect(res.body.enabled).to.equal(false);
    });
  });

  // ─── Fleet contract ────────────────────────────────────────────────
  describe('Fleet', () => {
    it('aiMotion is a fleet super power pointing at the node-local toggle', async () => {
      const svc = (await import('../../services/orchestrationService.js')).default;
      const endpoints = svc.constructor.SUPERPOWER_ENDPOINTS;
      expect(endpoints).to.be.an('object');
      expect(Object.keys(endpoints)).to.include('aiMotion');

      const call = endpoints.aiMotion(true);
      expect(call.method).to.equal('post');
      expect(call.path).to.equal('/conversation/api/ai-motion');
      expect(call.body).to.deep.equal({ enabled: true });
      // NOT the `motion` key — that one is the PIR motion SENSOR.
      expect(endpoints.motion(true).path).to.not.equal(call.path);
    });

    it('emergency stop disarms aiMotion', async () => {
      // Panic must leave nothing armed. AI Motion is the broadest autonomous
      // trigger there is: it moves the character on its own initiative every
      // time it speaks, so a stop that left it armed would be no stop at all.
      const svc = (await import('../../services/orchestrationService.js')).default;
      const source = String(svc.emergencyStop);
      expect(source, 'emergencyStop does not disarm aiMotion').to.match(/aiMotion\s*\(\s*false\s*\)/);
    });
  });
});
