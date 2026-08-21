/**
 * An inverted servo must be mirrored by exactly ONE formula.
 *
 * The defect this pins. `capability.invert` was honoured by BOTH the calibration
 * path and the runtime path — with different arithmetic:
 *
 *   calibration (AbsoluteServoAdapter.angleToUs):  effP    = 1 - angle/180
 *   runtime     (hardwareService.controlPart):     effAngle = minAngle + maxAngle - angle
 *
 * So the same commanded angle landed in two different physical places. On a live
 * fleet jaw carrying invert=true with a measured window of 97-151, commanding 97
 * produced 1422 us through the calibration page and 2178 us at show time: 756 us
 * apart. And 1422 us is 83 degrees — BELOW that part's own calibrated minimum — so
 * the calibration page drove an inverted servo outside the window being calibrated.
 * An operator could invert a backwards-wired servo, verify it by eye on the
 * calibration page, save poses against it, and have the show play them mirrored.
 *
 * These tests assert the two formulas now agree, and that the no-bounds case still
 * reproduces the historical behaviour so uncalibrated parts are unaffected.
 */

import { expect } from 'chai';
import { AbsoluteServoAdapter } from '../../server/calibration/adapters/AbsoluteServoAdapter.js';

const US_MIN = 500;
const US_MAX = 2500;

/** The runtime's mirror, transcribed from hardwareService/index.js controlPart. */
function runtimeMirror(angle, bounds) {
  const minA = bounds && bounds.minAngle != null ? bounds.minAngle : 0;
  const maxA = bounds && bounds.maxAngle != null ? bounds.maxAngle : 180;
  return minA + maxA - angle;
}

/** Angle -> us, with no invert. Both paths share this once the mirror agrees. */
function angleToUsPlain(angle) {
  const p = Math.max(0, Math.min(1, angle / 180));
  return US_MIN + p * (US_MAX - US_MIN);
}

describe('Inverted servos use a single mirror formula', function () {
  describe('with a real measured window (the live fleet case: 97-151)', function () {
    const bounds = { minAngle: 97, maxAngle: 151 };

    it('the calibration adapter matches the runtime mirror at the window minimum', function () {
      const adapter = new AbsoluteServoAdapter(1, US_MIN, US_MAX, true, null, bounds);
      const expected = angleToUsPlain(runtimeMirror(97, bounds));
      expect(adapter.angleToUs(97)).to.be.closeTo(expected, 0.001);
    });

    it('matches at the window maximum', function () {
      const adapter = new AbsoluteServoAdapter(1, US_MIN, US_MAX, true, null, bounds);
      const expected = angleToUsPlain(runtimeMirror(151, bounds));
      expect(adapter.angleToUs(151)).to.be.closeTo(expected, 0.001);
    });

    it('matches across the whole window, not just the endpoints', function () {
      const adapter = new AbsoluteServoAdapter(1, US_MIN, US_MAX, true, null, bounds);
      for (let angle = 97; angle <= 151; angle += 3) {
        const expected = angleToUsPlain(runtimeMirror(angle, bounds));
        expect(adapter.angleToUs(angle), `angle ${angle}`).to.be.closeTo(expected, 0.001);
      }
    });

    it('no longer drives an inverted servo BELOW its calibrated minimum', function () {
      const adapter = new AbsoluteServoAdapter(1, US_MIN, US_MAX, true, null, bounds);
      // The old full-span mirror sent 97 -> 1422us, which is 83 degrees.
      const minUs = angleToUsPlain(bounds.minAngle);
      const maxUs = angleToUsPlain(bounds.maxAngle);
      for (let angle = 97; angle <= 151; angle += 3) {
        const us = adapter.angleToUs(angle);
        expect(us, `angle ${angle} must stay inside the calibrated window`)
          .to.be.within(Math.min(minUs, maxUs) - 0.001, Math.max(minUs, maxUs) + 0.001);
      }
    });

    it('regression guard: 97 must NOT produce the old 1422us full-span value', function () {
      const adapter = new AbsoluteServoAdapter(1, US_MIN, US_MAX, true, null, bounds);
      expect(adapter.angleToUs(97)).to.not.be.closeTo(1422.2, 1.0);
    });
  });

  describe('backward compatibility', function () {
    it('with NO bounds, invert reproduces the historical 180-angle mirror exactly', function () {
      const adapter = new AbsoluteServoAdapter(1, US_MIN, US_MAX, true, null, null);
      for (const angle of [0, 30, 45, 90, 135, 180]) {
        const legacy = US_MIN + (1 - angle / 180) * (US_MAX - US_MIN);
        expect(adapter.angleToUs(angle), `angle ${angle}`).to.be.closeTo(legacy, 0.001);
      }
    });

    it('a NON-inverted servo is untouched by this change', function () {
      const adapter = new AbsoluteServoAdapter(1, US_MIN, US_MAX, false, null, { minAngle: 97, maxAngle: 151 });
      for (const angle of [0, 97, 120, 151, 180]) {
        expect(adapter.angleToUs(angle), `angle ${angle}`).to.be.closeTo(angleToUsPlain(angle), 0.001);
      }
    });

    it('reports invert through getCapabilities so the UI still reflects it', function () {
      const adapter = new AbsoluteServoAdapter(1, US_MIN, US_MAX, true, null, { minAngle: 97, maxAngle: 151 });
      expect(adapter.getCapabilities().invert).to.equal(true);
    });
  });
});
