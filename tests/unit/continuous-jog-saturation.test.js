/**
 * v11 audit F8 — continuous-jog-saturates-success.
 *
 * A continuous servo has no position feedback; the page tracks an ESTIMATE.
 * When that estimate reached the end of its range, every further CW/CCW jog
 * clamped to the same value, the adapter answered "Already at target" without
 * commanding hardware, and the route reported success — so the operator saw
 * "cw complete" five times while the servo never moved. That reads exactly
 * like a dead servo, and the physical part may be nowhere near its real end.
 *
 * New contract, pinned here: a jog whose whole delta is swallowed by the rail
 * returns 409 { saturated: true } with an error that says the TRACKER (not
 * the hardware) is pinned and names the ways out (raw jog / home); a jog that
 * still moves but hits the rail reports { clamped: true }; and jogging AWAY
 * from the rail keeps working.
 *
 * Runs the real router in-process with a synthetic continuous part. Under
 * MB_TEST_MODE + CI with no hardware present, the exec layer simulates
 * success, so the estimate moves without any device. Parts, calibration
 * profiles, and the position store are snapshotted and restored byte-exact.
 */

import { expect } from 'chai';
import request from 'supertest';
import express from 'express';
import fs from 'fs/promises';
import path from 'path';
import { fileURLToPath } from 'url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const APP_ROOT = path.resolve(__dirname, '..', '..');

const SYNTH_PART_ID = 987654;

describe('Continuous jog saturation (F8)', function () {
  this.timeout(20000);

  let app;
  let partsPath;
  const savedFiles = new Map();
  const savedEnv = {};

  before(async function () {
    // Simulated hardware exec needs both flags (services/hardwareService/exec.js).
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

    // Synthetic continuous servo: high id far from any real part, phantom
    // channel 15 is never energized because the exec layer is simulated here.
    const parts = JSON.parse(savedFiles.get(partsPath) || '[]');
    parts.push({
      id: String(SYNTH_PART_ID),
      name: 'F8 Saturation Test Servo (synthetic)',
      type: 'servo',
      enabled: true,
      config: { servoType: 'continuous', controllerType: 'pca9685', channel: 15, address: 64 }
    });
    await fs.writeFile(partsPath, JSON.stringify(parts, null, 2), 'utf8');

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

  it('drives the estimate to the rail, then REFUSES the next jog with saturated:true', async function () {
    // Fresh profile starts the estimate at 0.5. Move up hard: 0.5 → 1.0
    // (clamped from 1.1, but still a real move — must succeed and say so).
    const clampedMove = await request(app)
      .post(`/api/calibration/${SYNTH_PART_ID}/nudge`)
      .send({ delta: 0.6 })
      .expect(200);
    expect(clampedMove.body.success).to.equal(true);
    expect(clampedMove.body.clamped, 'a move that hits the rail must be marked clamped').to.equal(true);
    expect(clampedMove.body.currentP).to.equal(1);

    // The estimate is now pinned at 1.0. The next CW jog used to report
    // "success" while commanding nothing.
    const saturated = await request(app)
      .post(`/api/calibration/${SYNTH_PART_ID}/nudge`)
      .send({ delta: 0.1 })
      .expect(409);
    expect(saturated.body.success).to.equal(false);
    expect(saturated.body.saturated).to.equal(true);
    expect(saturated.body.error).to.match(/tracker|estimated position/i);
    expect(saturated.body.error, 'the refusal must name a way out').to.match(/raw jog|home/i);
  });

  it('still jogs AWAY from the rail — the refusal is direction-aware', async function () {
    const down = await request(app)
      .post(`/api/calibration/${SYNTH_PART_ID}/nudge`)
      .send({ delta: -0.2 })
      .expect(200);
    expect(down.body.success).to.equal(true);
    expect(down.body.clamped).to.not.equal(true);
    expect(down.body.currentP).to.be.closeTo(0.8, 1e-9);
  });
});
