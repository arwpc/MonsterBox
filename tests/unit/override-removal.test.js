/**
 * v11 audit F9 — overrides-cannot-be-removed.
 *
 * The overrides endpoint only ever MERGED, so no override could ever be
 * deleted through the page: blanked fields were skipped by the client, and
 * "Revert to Model" posted {} — a merge of nothing, a server-side no-op that
 * still toasted success. A mistaken override (channel: 5 on the wrong part —
 * the exact key behind past wrong-channel incidents) was permanent, while the
 * Effective panel showed it gone.
 *
 * New contract, pinned here: a key posted with value null is REMOVED from the
 * part's config; non-null keys are set; keys not mentioned are untouched
 * (other tabs' work — tracking tuning, device assignments — must survive a
 * revert).
 *
 * All tests run on a synthetic part created and deleted through the same API,
 * with a byte-exact parts.json restore afterwards — this suite runs against
 * real per-node operator data.
 */

import { expect } from 'chai';
import request from 'supertest';
import fs from 'fs/promises';
import path from 'path';
import { fileURLToPath } from 'url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const APP_ROOT = path.resolve(__dirname, '..', '..');
const BASE_URL = process.env.BASE_URL || 'http://localhost:3000';

describe('Override removal (F9 overrides-cannot-be-removed)', function () {
  this.timeout(15000);

  let partsPath = null;
  let originalParts = null;
  let partId = null;

  before(async function () {
    let selectedCharacterId = null;
    try {
      const cfg = JSON.parse(await fs.readFile(path.join(APP_ROOT, 'config', 'app-config.json'), 'utf8'));
      selectedCharacterId = cfg.selectedCharacter;
    } catch (_) { /* skip below */ }
    if (selectedCharacterId == null) this.skip();

    partsPath = path.join(APP_ROOT, 'data', `character-${selectedCharacterId}`, 'parts.json');
    try {
      originalParts = await fs.readFile(partsPath, 'utf8');
    } catch (_) {
      originalParts = null;
    }

    // Synthetic servo part so no real part's config is ever touched.
    const created = await request(BASE_URL)
      .post('/setup/calibration/api/parts')
      .send({
        name: 'F9 Override Test Servo (synthetic)',
        type: 'servo',
        config: { servoType: 'standard', controllerType: 'pca9685', keepMe: 'other-tab-data' }
      });
    if (created.status !== 200 || !created.body.success) this.skip();
    partId = created.body.part.id;
  });

  after(async function () {
    try {
      if (partId) {
        await request(BASE_URL).delete(`/setup/calibration/api/parts/${encodeURIComponent(partId)}`);
      }
    } catch (_) { /* restore below covers it */ }
    try {
      if (originalParts !== null && partsPath) await fs.writeFile(partsPath, originalParts, 'utf8');
    } catch (_) { /* best effort */ }
  });

  async function getConfig() {
    const res = await request(BASE_URL)
      .get(`/setup/calibration/api/parts/${encodeURIComponent(partId)}`)
      .expect(200);
    return res.body.part.config || {};
  }

  it('sets an override', async function () {
    const res = await request(BASE_URL)
      .post(`/setup/calibration/api/parts/${encodeURIComponent(partId)}/overrides`)
      .send({ overrides: { channel: 15, pca9685Frequency: 50 } })
      .expect(200);
    expect(res.body.success).to.equal(true);
    expect(res.body.config.channel).to.equal(15);

    const cfg = await getConfig();
    expect(cfg.channel).to.equal(15);
    expect(cfg.pca9685Frequency).to.equal(50);
  });

  it('REMOVES an override posted as null (a blanked field)', async function () {
    const res = await request(BASE_URL)
      .post(`/setup/calibration/api/parts/${encodeURIComponent(partId)}/overrides`)
      .send({ overrides: { channel: null } })
      .expect(200);
    expect(res.body.success).to.equal(true);
    expect(res.body.config, 'the response must show the key gone').to.not.have.property('channel');

    const cfg = await getConfig();
    expect(cfg, 'the persisted config must not carry the removed key').to.not.have.property('channel');
    expect(cfg.pca9685Frequency, 'unmentioned overrides must be untouched').to.equal(50);
  });

  it('Revert to Model (all schema keys null) clears overrides but preserves other tabs\' config', async function () {
    // What the page's Revert button now posts for a servo.
    const res = await request(BASE_URL)
      .post(`/setup/calibration/api/parts/${encodeURIComponent(partId)}/overrides`)
      .send({
        overrides: {
          servoType: null, controllerType: null, channel: null,
          address: null, pca9685Frequency: null
        }
      })
      .expect(200);
    expect(res.body.success).to.equal(true);

    const cfg = await getConfig();
    expect(cfg).to.not.have.property('servoType');
    expect(cfg).to.not.have.property('controllerType');
    expect(cfg).to.not.have.property('pca9685Frequency');
    expect(cfg.keepMe, 'non-schema config written by other tabs must survive a revert').to.equal('other-tab-data');
  });
});
