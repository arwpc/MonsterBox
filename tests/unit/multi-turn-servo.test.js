/**
 * Multi-turn servo — real-degree calibration path.
 *
 * The knight's head is a goBILDA Stingray-2: 900° of REAL travel spanning the
 * same 500-2500 µs pulse range a standard servo spreads over 180°. Before this
 * fix the calibration surface spoke a 0-180 scale and the python wrapper
 * (move_to_pca_multi) a fixed 0-1800 scale, so one commanded degree was five
 * real degrees, a goto from an unknown position could command hundreds of real
 * degrees into the head cabling in one hop, and the part was impossible to
 * calibrate honestly.
 *
 * New contract, pinned here:
 *  - a part declaring config.rotationRangeDeg gets capability.maxAngleDeg and a
 *    placeholder span of its REAL travel; an existing stale 0-180 profile is
 *    reconciled the next time the calibration surface touches it (this is
 *    exactly the state the knight's node is in);
 *  - goto/nudge angles are REAL degrees, valid to maxAngleDeg, not 180;
 *  - hardwareService converts real degrees to the wrapper's 0-1800 scale at
 *    the single seam (900° part: real 450 → wrapper arg 900);
 *  - a standard servo (no declared range) behaves exactly as before.
 *
 * Runs the real calibration router in-process with synthetic parts. Under
 * MB_TEST_MODE + CI with no hardware present the exec layer simulates and
 * echoes the wrapper args, so the conversion is observable without a PCA9685.
 * Parts and calibration files are snapshotted and restored byte-exact.
 */

import { expect } from 'chai';
import request from 'supertest';
import express from 'express';
import fs from 'fs/promises';
import path from 'path';
import { fileURLToPath } from 'url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const APP_ROOT = path.resolve(__dirname, '..', '..');

const MULTI_PART_ID = 987655;   // synthetic 900° multi-turn
const STD_PART_ID = 987656;     // synthetic standard 180° servo

describe('Multi-turn servo real-degree path', function () {
  this.timeout(20000);

  let app;
  let partsPath;
  const savedFiles = new Map();
  const savedEnv = {};

  async function writeParts(mutate) {
    const parts = JSON.parse(await fs.readFile(partsPath, 'utf8'));
    mutate(parts);
    await fs.writeFile(partsPath, JSON.stringify(parts, null, 2), 'utf8');
  }

  before(async function () {
    for (const [k, v] of Object.entries({ MB_TEST_MODE: '1', CI: 'true' })) {
      savedEnv[k] = process.env[k];
      process.env[k] = v;
    }

    const { readConfig } = await import('../../services/configService.js');
    const cfg = await readConfig();
    const characterId = cfg && cfg.selectedCharacter;
    if (characterId == null) this.skip();

    partsPath = path.join(APP_ROOT, 'data', `character-${characterId}`, 'parts.json');
    for (const f of [partsPath,
      path.join(APP_ROOT, 'data', 'calibration_profiles.json'),
      path.join(APP_ROOT, 'data', 'actuator-positions.json')]) {
      try { savedFiles.set(f, await fs.readFile(f, 'utf8')); } catch (_) { savedFiles.set(f, null); }
    }

    // The multi-turn part starts WITHOUT rotationRangeDeg, so its profile
    // auto-creates on the legacy 0-180 span — the knight's exact stale state.
    // The range is declared later and the reconciliation test proves the
    // profile follows. Phantom channels are never energized (exec simulated).
    await writeParts(parts => {
      parts.push({
        id: String(MULTI_PART_ID),
        name: 'Multi-Turn Test Servo (synthetic)',
        type: 'servo',
        enabled: true,
        config: { servoType: 'multi-turn', controllerType: 'pca9685', channel: 14, address: 64 }
      });
      parts.push({
        id: String(STD_PART_ID),
        name: 'Standard Test Servo (synthetic)',
        type: 'servo',
        enabled: true,
        config: { servoType: 'standard', controllerType: 'pca9685', channel: 13, address: 64 }
      });
    });

    const { default: router } = await import('../../server/calibration/router.js');
    app = express();
    app.use('/api/calibration', router);
  });

  after(async function () {
    for (const [f, content] of savedFiles) {
      try {
        if (content !== null) await fs.writeFile(f, content, 'utf8');
        else await fs.rm(f, { force: true });
      } catch (_) { /* best effort */ }
    }
    for (const [k, v] of Object.entries(savedEnv)) {
      if (v === undefined) delete process.env[k];
      else process.env[k] = v;
    }
  });

  it('auto-creates on the legacy 0-180 span when no range is declared', async function () {
    const res = await request(app)
      .get(`/api/calibration/${MULTI_PART_ID}/profile`)
      .expect(200);
    const profile = res.body.profile || res.body;
    expect(profile.capability.kind).to.equal('absolute-servo');
    expect(profile.capability.maxAngleDeg, 'no declared range must mean no maxAngleDeg').to.equal(undefined);
    expect(profile.bounds).to.deep.include({ minAngle: 0, maxAngle: 180 });
  });

  it('reconciles a stale 0-180 profile once the part declares rotationRangeDeg (the knight-node state)', async function () {
    await writeParts(parts => {
      const p = parts.find(x => String(x.id) === String(MULTI_PART_ID));
      p.config.rotationRangeDeg = 900;
    });
    const res = await request(app)
      .get(`/api/calibration/${MULTI_PART_ID}/profile`)
      .expect(200);
    const profile = res.body.profile || res.body;
    expect(profile.capability.maxAngleDeg).to.equal(900);
    expect(profile.bounds, 'a PLACEHOLDER span follows the real range').to.deep.include({ minAngle: 0, maxAngle: 900 });
  });

  it('goto takes REAL degrees: 450 is valid, lands at 450, and converts to wrapper arg 900', async function () {
    const res = await request(app)
      .post(`/api/calibration/${MULTI_PART_ID}/goto`)
      .send({ angle: 450 })
      .expect(200);
    expect(res.body.success).to.equal(true);
    expect(res.body.targetAngle).to.equal(450);
    expect(res.body.targetP).to.be.closeTo(0.5, 1e-9);
  });

  it('goto rejects past the REAL range with a range-aware message', async function () {
    const res = await request(app)
      .post(`/api/calibration/${MULTI_PART_ID}/goto`)
      .send({ angle: 950 })
      .expect(400);
    expect(res.body.success).to.equal(false);
    expect(res.body.error).to.match(/0 and 900/);
  });

  it('delta nudge moves in REAL degrees past the old 180 ceiling', async function () {
    const res = await request(app)
      .post(`/api/calibration/${MULTI_PART_ID}/nudge`)
      .send({ delta: 5 })
      .expect(200);
    expect(res.body.success).to.equal(true);
    expect(res.body.currentAngle).to.equal(455);
  });

  it('a standard servo still rejects past 180 — the ceiling did not widen for everyone', async function () {
    const res = await request(app)
      .post(`/api/calibration/${STD_PART_ID}/goto`)
      .send({ angle: 181 })
      .expect(400);
    expect(res.body.success).to.equal(false);
    expect(res.body.error).to.match(/0 and 180/);
  });

  it('hardwareService converts real degrees to the wrapper 0-1800 scale at the seam', async function () {
    const { HARDWARE_CONTROLLERS } = (await import('../../services/hardwareService/index.js')).default;
    const result = await HARDWARE_CONTROLLERS.servo.moveToAngle({
      partId: MULTI_PART_ID, channel: 14, angleDeg: 450,
      controllerType: 'pca9685', servoType: 'multi-turn', rotationRangeDeg: 900
    });
    expect(result.success).to.equal(true);
    // The simulated exec echoes the wrapper args verbatim.
    const echoed = JSON.parse(result.rawOutput);
    expect(echoed.simulated).to.equal(true);
    expect(echoed.args[0]).to.equal('move_to_pca_multi');
    expect(echoed.args[1]).to.equal('14');
    expect(Number(echoed.args[2]), 'real 450° on a 900° part is wrapper arg 900').to.equal(900);
  });

  it('hardwareService passes raw angles through when no range is declared (legacy contract)', async function () {
    const { HARDWARE_CONTROLLERS } = (await import('../../services/hardwareService/index.js')).default;
    const result = await HARDWARE_CONTROLLERS.servo.moveToAngle({
      partId: MULTI_PART_ID, channel: 14, angleDeg: 450,
      controllerType: 'pca9685', servoType: 'multi-turn'
    });
    const echoed = JSON.parse(result.rawOutput);
    expect(Number(echoed.args[2]), 'no declared range: legacy 0-1800 passthrough').to.equal(450);
  });

  it('batchMoveServos routes a multi-turn part around the standard 0-180 batch path', async function () {
    // The pose/idle/transition seam. Before this guard, a multi-turn part rode
    // the daemon/batch_pca path, whose standard 0-180 mapping clamps a real
    // 450° command to 180 and writes full-scale pulse — maximum travel into
    // the head cabling, reported as success.
    const { readConfig } = await import('../../services/configService.js');
    const characterId = (await readConfig()).selectedCharacter;
    const { batchMoveServos } = (await import('../../services/hardwareService/index.js')).default;
    const out = await batchMoveServos([
      { partId: String(MULTI_PART_ID), angleDeg: 450 }
    ], { characterId });
    const r = out.results.find(x => String(x.partId) === String(MULTI_PART_ID));
    expect(r, 'the multi-turn part must produce a result').to.exist;
    expect(r.success).to.equal(true);
    const echoed = JSON.parse(r.rawOutput);
    expect(echoed.args[0], 'must go through the converting per-part seam, not batch_pca').to.equal('move_to_pca_multi');
    expect(Number(echoed.args[2]), 'real 450° on a 900° part is wrapper arg 900').to.equal(900);
  });

  it('reconciliation never re-scopes a MEASURED profile', async function () {
    // Measure the part (set-min clears autoGenerated), then change the
    // declared range: the stored capability and bounds must NOT follow — a
    // measured window's units belong to the measurement, and re-uniting them
    // would license motion past the operator's recorded stop.
    await request(app).post(`/api/calibration/${MULTI_PART_ID}/set-min`).send({}).expect(200);
    await writeParts(parts => {
      const p = parts.find(x => String(x.id) === String(MULTI_PART_ID));
      p.config.rotationRangeDeg = 1800;
    });
    const res = await request(app)
      .get(`/api/calibration/${MULTI_PART_ID}/profile`)
      .expect(200);
    const profile = res.body.profile || res.body;
    expect(profile.autoGenerated, 'set-min must have made it a measured profile').to.not.equal(true);
    expect(profile.capability.maxAngleDeg, 'a measured profile keeps its measurement-time range').to.equal(900);
    // put the declaration back so later runs start clean
    await writeParts(parts => {
      const p = parts.find(x => String(x.id) === String(MULTI_PART_ID));
      p.config.rotationRangeDeg = 900;
    });
  });
});
