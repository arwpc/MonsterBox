/**
 * v11 audit F7 — mic-sliders-dead-route.
 *
 * The calibration page's microphone Gain slider and the STT auto-tune panel
 * persist their values through GET /setup/calibration/api/parts/:id followed
 * by a PUT of the same URL. The GET route did not exist: the 404 came back as
 * an HTML error page, r.json() threw, and the trailing empty .catch()
 * swallowed it — so a gain the operator dialed in "for the show" silently
 * never persisted, and reverted at the next reboot.
 *
 * These tests pin the route itself: it must exist, be character-aware like
 * its siblings, return JSON in the { success, part } shape the view consumes,
 * and 404 as JSON (not HTML) so a future regression is visible instead of
 * swallowed. The PUT round-trip proves the slider's save path lands and that
 * the deep-merge keeps unrelated config keys.
 */

import { expect } from 'chai';
import request from 'supertest';
import fs from 'fs/promises';
import path from 'path';
import { fileURLToPath } from 'url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const APP_ROOT = path.resolve(__dirname, '..', '..');
const BASE_URL = process.env.BASE_URL || 'http://localhost:3000';

describe('Calibration single-part API (F7 mic-sliders-dead-route)', function () {
  this.timeout(15000);

  let selectedCharacterId = null;
  let partsPath = null;
  let originalParts = null;
  let anyPartId = null;

  before(async function () {
    // The route resolves the selected character; capture that character's
    // parts.json so the PUT round-trip below leaves the node untouched.
    try {
      const cfg = JSON.parse(await fs.readFile(path.join(APP_ROOT, 'config', 'app-config.json'), 'utf8'));
      selectedCharacterId = cfg.selectedCharacter;
    } catch (_) { /* fall through to skip */ }
    if (selectedCharacterId == null) this.skip();

    partsPath = path.join(APP_ROOT, 'data', `character-${selectedCharacterId}`, 'parts.json');
    try {
      originalParts = await fs.readFile(partsPath, 'utf8');
    } catch (_) {
      originalParts = null;
    }

    const res = await request(BASE_URL).get('/setup/calibration/api/parts');
    if (res.status !== 200 || !res.body || !Array.isArray(res.body.parts) || !res.body.parts.length) {
      this.skip();
    }
    anyPartId = res.body.parts[0].id;
  });

  after(async function () {
    // Byte-exact restore: this suite runs against real per-node operator data.
    try {
      if (originalParts !== null && partsPath) await fs.writeFile(partsPath, originalParts, 'utf8');
    } catch (_) { /* best effort */ }
  });

  it('GET /setup/calibration/api/parts/:id returns { success, part } as JSON', async function () {
    const res = await request(BASE_URL)
      .get(`/setup/calibration/api/parts/${encodeURIComponent(anyPartId)}`)
      .expect('Content-Type', /json/)
      .expect(200);

    expect(res.body).to.have.property('success', true);
    expect(res.body).to.have.property('part').that.is.an('object');
    expect(String(res.body.part.id)).to.equal(String(anyPartId));
    expect(res.body.part).to.have.property('config');
  });

  it('404s as JSON for an unknown part, so the view can surface it instead of choking on HTML', async function () {
    const res = await request(BASE_URL)
      .get('/setup/calibration/api/parts/999999')
      .expect('Content-Type', /json/)
      .expect(404);

    expect(res.body).to.have.property('success', false);
  });

  it('the gain-slider save path lands: PUT config merges and GET reads it back', async function () {
    // Exactly what the Gain slider does after applying gain live: persist the
    // one changed key. The PUT deep-merges, so unrelated config must survive.
    const before = await request(BASE_URL)
      .get(`/setup/calibration/api/parts/${encodeURIComponent(anyPartId)}`)
      .expect(200);
    const configBefore = before.body.part.config || {};

    await request(BASE_URL)
      .put(`/setup/calibration/api/parts/${encodeURIComponent(anyPartId)}`)
      .send({ config: { inputGainPercent: 137 } })
      .expect(200)
      .expect(res => {
        if (!res.body.success) throw new Error('PUT must report success');
      });

    const after = await request(BASE_URL)
      .get(`/setup/calibration/api/parts/${encodeURIComponent(anyPartId)}`)
      .expect(200);

    expect(after.body.part.config.inputGainPercent, 'the saved gain must read back').to.equal(137);
    for (const key of Object.keys(configBefore)) {
      expect(after.body.part.config, `pre-existing config key "${key}" must survive the save`)
        .to.have.property(key);
    }
  });
});
