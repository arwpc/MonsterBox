/**
 * Servo-type identity validation — 'multi-turn' must survive every writer.
 *
 * The knight's 900° head servo is driven correctly ONLY while
 * config.servoType === 'multi-turn' (plus rotationRangeDeg 900). Losing the
 * key retypes the part as a standard 180° servo, so a commanded 450 real
 * degrees lands at 900 — cable-tearing. Two failure modes are pinned here:
 *
 *   1. UI: no servo-type select could REPRESENT 'multi-turn', so the select
 *      rendered blank and collectOverrideFields turned blank into null — the
 *      explicit DELETE signal — silently stripping the key on any Overrides
 *      save. The OVERRIDE_SCHEMAS options on the main calibration page must
 *      list 'multi-turn'.
 *   2. Server: no writer VALIDATED servoType/rotationRangeDeg/channel, so a
 *      typo'd value was persisted verbatim. The shared validator
 *      (services/hardwareService/partConfigValidation.js) must 400 bad values
 *      at the overrides POST while keeping null as the deliberate delete
 *      signal and letting valid values land.
 */

import { expect } from 'chai';
import request from 'supertest';
import express from 'express';
import fs from 'fs/promises';
import path from 'path';
import { fileURLToPath } from 'url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const APP_ROOT = path.resolve(__dirname, '..', '..');
const BASE_URL = process.env.BASE_URL || 'http://localhost:3000';

const SYNTH_PART_ID = 987656;

describe('Servo type identity — multi-turn survives UI and writers', function () {
  this.timeout(20000);

  it('the main calibration page override schema can represent multi-turn', async function () {
    const res = await request(BASE_URL).get('/setup/calibration').expect(200);
    // Isolate the OVERRIDE_SCHEMAS literal so the assertion cannot be
    // satisfied by an unrelated mention of multi-turn elsewhere on the page.
    const start = res.text.indexOf('OVERRIDE_SCHEMAS = {');
    expect(start, 'OVERRIDE_SCHEMAS must exist on the page').to.be.greaterThan(-1);
    const end = res.text.indexOf('};', start);
    expect(end, 'OVERRIDE_SCHEMAS literal must close').to.be.greaterThan(start);
    const schemaSource = res.text.slice(start, end);

    const servoTypeLine = schemaSource
      .split('\n')
      .find(line => line.includes("key: 'servoType'"));
    expect(servoTypeLine, 'servo override schema must carry a servoType select').to.not.equal(undefined);
    expect(servoTypeLine, "servoType options must include 'multi-turn' — a select that cannot represent the value deletes it on save")
      .to.include("'multi-turn'");
  });

  describe('overrides writer validation (in-process router)', function () {
    let app;
    let partsPath;
    const savedFiles = new Map();

    before(async function () {
      const { readConfig } = await import('../../services/configService.js');
      const cfg = await readConfig();
      const characterId = cfg && cfg.selectedCharacter;
      if (characterId == null) this.skip();

      partsPath = path.join(APP_ROOT, 'data', `character-${characterId}`, 'parts.json');
      try { savedFiles.set(partsPath, await fs.readFile(partsPath, 'utf8')); } catch (_) { savedFiles.set(partsPath, null); }

      const parts = JSON.parse(savedFiles.get(partsPath) || '[]');
      parts.push({
        id: String(SYNTH_PART_ID),
        name: 'Servo Type Validation Test Servo (synthetic)',
        type: 'servo',
        enabled: true,
        config: { servoType: 'standard', controllerType: 'pca9685', channel: 14, address: 64 }
      });
      await fs.writeFile(partsPath, JSON.stringify(parts, null, 2), 'utf8');

      // Same mount shape as server.js: app.use('/setup/calibration', ...).
      const { default: router } = await import('../../routes/setup/calibration.js');
      app = express();
      app.use('/setup/calibration', router);
    });

    after(async function () {
      for (const [f, content] of savedFiles) {
        try {
          if (content !== null) await fs.writeFile(f, content, 'utf8');
          else await fs.rm(f, { force: true });
        } catch (_) { /* best effort */ }
      }
    });

    function postOverrides(overrides) {
      return request(app)
        .post(`/setup/calibration/api/parts/${SYNTH_PART_ID}/overrides`)
        .send({ overrides });
    }

    async function readSynthConfig() {
      const parts = JSON.parse(await fs.readFile(partsPath, 'utf8'));
      const part = parts.find(p => String(p.id) === String(SYNTH_PART_ID));
      expect(part, 'synthetic part must still exist in parts.json').to.not.equal(undefined);
      return part.config || {};
    }

    it('rejects a bogus servoType with 400 naming the key and the accepted set', async function () {
      const res = await postOverrides({ servoType: 'bogus' }).expect(400);
      expect(res.body.success).to.equal(false);
      expect(res.body.error).to.include('servoType');
      expect(res.body.error).to.include('bogus');
      expect(res.body.error, 'the accepted set must be named').to.include('multi-turn');

      const config = await readSynthConfig();
      expect(config.servoType, 'the rejected value must not have been written').to.equal('standard');
    });

    it("accepts servoType 'multi-turn' and it lands in parts.json", async function () {
      await postOverrides({ servoType: 'multi-turn' }).expect(200);
      const config = await readSynthConfig();
      expect(config.servoType).to.equal('multi-turn');
    });

    it('servoType null still deletes the key (deliberate-delete contract intact)', async function () {
      await postOverrides({ servoType: null }).expect(200);
      const config = await readSynthConfig();
      expect(Object.prototype.hasOwnProperty.call(config, 'servoType'),
        'null is the delete signal and must remove the key, not store null').to.equal(false);
    });

    it('rejects non-numeric and out-of-range rotationRangeDeg with 400', async function () {
      for (const bad of ['x', -5]) {
        const res = await postOverrides({ rotationRangeDeg: bad }).expect(400);
        expect(res.body.success).to.equal(false);
        expect(res.body.error).to.include('rotationRangeDeg');
      }
      const config = await readSynthConfig();
      expect(Object.prototype.hasOwnProperty.call(config, 'rotationRangeDeg'),
        'no rejected rotationRangeDeg may land').to.equal(false);
    });

    it('rejects channel 99 with 400, accepts channel 11', async function () {
      const res = await postOverrides({ channel: 99 }).expect(400);
      expect(res.body.success).to.equal(false);
      expect(res.body.error).to.include('channel');
      expect(res.body.error).to.include('99');

      await postOverrides({ channel: 11 }).expect(200);
      const config = await readSynthConfig();
      expect(config.channel).to.equal(11);
    });
  });
});
