/**
 * Regression (2026-08-22, knight's 900° multi-turn neck): both angle-authoring
 * UIs hardcoded 0–180 for every part.type === 'servo'.
 *
 *  - Pose Editor (public/js/poses-editor.js renderPartControls) clamped the
 *    slider to 0–180, and its safety-window merge only narrowed INSIDE 0–180
 *    (max lowered only when the window's hi was below the base 180) — so a
 *    calibrated multi-turn window above 180 (e.g. 300–600 real degrees)
 *    rendered an INVERTED slider (min=300, max=180).
 *  - Animation Studio (views/scenes/studio.ejs renderServoForm) emitted
 *    min="0" max="180" on the servo-step angle input, the last 180 cap in an
 *    otherwise real-degree-correct servo-step chain.
 *
 * Pinned here: both editors detect a multi-turn output from the part data the
 * page already has (config.servoType === 'multi-turn', or a declared
 * config.rotationRangeDeg other than 180) and base their range on the real
 * travel; the pose editor's safety merge can RAISE max to a window above 180
 * on multi-turn while still only narrowing for standard servos.
 */

import { expect } from 'chai';
import request from 'supertest';
import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';

const BASE_URL = process.env.BASE_URL || 'http://localhost:3000';
const __dirname = path.dirname(fileURLToPath(import.meta.url));

describe('Multi-turn servo range in the pose and scene editors', function () {
  this.timeout(20000);

  describe('Pose Editor part controls (/js/poses-editor.js)', function () {
    let servoBranch;

    before(async function () {
      // public/ is served at the site root, so the editor script is /js/...
      const res = await request(BASE_URL).get('/js/poses-editor.js').expect(200);
      // Isolate renderPartControls so assertions cannot be satisfied by
      // unrelated code elsewhere in the file.
      const start = res.text.indexOf('function renderPartControls');
      const end = res.text.indexOf('function bindPartEvents');
      expect(start, 'renderPartControls must exist in poses-editor.js').to.be.greaterThan(-1);
      expect(end, 'bindPartEvents must still follow renderPartControls').to.be.greaterThan(start);
      servoBranch = res.text.slice(start, end);
    });

    it('detects a multi-turn output from the part data already on the page', function () {
      // The detection must come from the raw parts.json entry served by
      // /api/parts — servoType, or a declared travel other than 180.
      expect(servoBranch).to.include("servoType === 'multi-turn'");
      expect(servoBranch).to.include('rotationRangeDeg) > 0');
      expect(servoBranch).to.include('!== 180');
    });

    it('bases the slider on the declared travel, not a hardcoded 0-180', function () {
      // The old code assigned the slider ceiling literally: `max = 180`.
      // The fixed code derives it (180 stays only as the standard-servo
      // fallback for the full-range variable, never assigned to max directly).
      expect(servoBranch.indexOf('max = 180'), 'slider max must not be hardcoded to 180')
        .to.equal(-1);
      expect(servoBranch).to.include('rotationRangeDeg');
    });

    it('lets the safety window RAISE max above 180 for multi-turn, while standard still only narrows', function () {
      // Multi-turn: the calibrated window is authoritative in real degrees —
      // max is assigned from it unconditionally (both raise and lower).
      expect(servoBranch, 'multi-turn branch must adopt the safety window max outright')
        .to.match(/isMultiTurn\s*\)\s*max\s*=\s*\w+\.maxAngle/);
      // Standard: the pre-existing narrowing comparison must survive so a
      // 0-180 servo behaves exactly as before.
      expect(servoBranch, 'standard servos must keep the narrow-only merge')
        .to.match(/\.maxAngle\s*<\s*max\s*\)\s*max\s*=\s*\w+\.maxAngle/);
    });
  });

  describe('Animation Studio servo step form (views/scenes/studio.ejs via GET /scenes)', function () {
    let servoForm;

    before(async function () {
      let pageText = null;
      try {
        const res = await request(BASE_URL).get('/scenes');
        if (res.status === 200) pageText = res.text;
      } catch (e) {
        pageText = null;
      }
      if (pageText === null) {
        // Fallback: /scenes needs a resolvable character context; if the test
        // server cannot provide one, read the raw view from disk. The sliced
        // region is a static inline <script> with no EJS interpolation, so the
        // disk text matches what the server would emit.
        pageText = fs.readFileSync(
          path.join(__dirname, '..', '..', 'views', 'scenes', 'studio.ejs'), 'utf8');
      }
      const start = pageText.indexOf('function renderServoForm');
      const end = pageText.indexOf('function renderMotorForm');
      expect(start, 'renderServoForm must exist on the studio page').to.be.greaterThan(-1);
      expect(end, 'renderMotorForm must still follow renderServoForm').to.be.greaterThan(start);
      servoForm = pageText.slice(start, end);
    });

    it('no longer hardcodes max="180" on the angle input', function () {
      expect(servoForm.indexOf('max="180"'), 'angle input max must not be a 180 literal')
        .to.equal(-1);
    });

    it('derives the angle cap from the selected part\'s declared travel with a 180 fallback', function () {
      // Looks up the selected part in the already-loaded parts list...
      expect(servoForm, 'must look up the selected part by step.partId').to.include('.find(');
      expect(servoForm).to.include('String(step.partId) === String(p.id)');
      // ...and takes rotationRangeDeg when declared and positive, else 180.
      expect(servoForm).to.include('rotationRangeDeg) > 0');
      expect(servoForm).to.match(/rotationRangeDeg\)\s*:\s*180/);
      // The max attribute itself is interpolated from that value.
      expect(servoForm).to.match(/max="'\s*\+\s*\w+/);
    });
  });
});
