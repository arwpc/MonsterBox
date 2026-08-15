/**
 * Unit tests for the hardware safety-limit layer.
 *
 * This layer is the only thing standing between a bad command and bent metal, so
 * it is tested against the two failure modes that have actually damaged hardware:
 *  - a linear actuator retracted below its mechanical minimum,
 *  - two servos on a shared fuse energized simultaneously.
 *
 * Parts with no configured limits must behave exactly as before (pass-through),
 * which is what makes the layer safe to add to an existing fleet.
 */

import { expect } from 'chai';
import {
  applySafetyLimits,
  getPartSafety,
  runInPowerGroup,
  resetPowerGroups
} from '../../services/hardwareService/safetyLimits.js';

describe('Hardware safety limits', function () {
  beforeEach(function () {
    resetPowerGroups();
  });

  describe('angle clamping', function () {
    it('clamps an out-of-range angle down to the calibrated ceiling', function () {
      const result = applySafetyLimits({
        type: 'servo',
        action: 'moveToAngle',
        params: { angleDeg: 200 },
        profile: { bounds: { minAngle: 45, maxAngle: 135 } },
        safety: {},
        partId: 4
      });
      expect(result.blocked).to.equal(null);
      expect(result.params.angleDeg).to.equal(135);
      expect(result.adjustments).to.have.lengthOf(1);
    });

    it('clamps up to the calibrated floor', function () {
      const result = applySafetyLimits({
        type: 'servo',
        action: 'moveToAngle',
        params: { angleDeg: 0 },
        profile: { bounds: { minAngle: 45, maxAngle: 135 } },
        safety: {},
        partId: 4
      });
      expect(result.params.angleDeg).to.equal(45);
    });

    it('leaves an in-range angle untouched and reports no adjustment', function () {
      const result = applySafetyLimits({
        type: 'servo',
        action: 'moveToAngle',
        params: { angleDeg: 90 },
        profile: { bounds: { minAngle: 45, maxAngle: 135 } },
        safety: {},
        partId: 4
      });
      expect(result.params.angleDeg).to.equal(90);
      expect(result.adjustments).to.be.empty;
    });

    it('intersects configured limits with calibrated bounds, keeping the tighter window', function () {
      const result = applySafetyLimits({
        type: 'servo',
        action: 'moveToAngle',
        params: { angleDeg: 130 },
        profile: { bounds: { minAngle: 45, maxAngle: 135 } },
        safety: { minAngle: 60, maxAngle: 120 },
        partId: 4
      });
      expect(result.params.angleDeg).to.equal(120);
    });
  });

  describe('full quarantine', function () {
    it('blocks every direction when a part is quarantined', function () {
      // A direction-string guard cannot protect a part whose wiring is ambiguous,
      // because the string and the physical effect disagree.
      for (const direction of ['extend', 'retract', 'forward', 'reverse']) {
        const result = applySafetyLimits({
          type: 'linear_actuator',
          action: 'controlActuator',
          params: { direction, speed: 50 },
          profile: null,
          safety: { blockAllMotion: true, blockReason: 'wiring unverified' },
          partId: 3
        });
        expect(result.blocked, `direction ${direction}`).to.be.a('string');
        expect(result.blocked).to.contain('wiring unverified');
      }
    });

    it('blocks angle moves on a quarantined part too', function () {
      const result = applySafetyLimits({
        type: 'servo',
        action: 'moveToAngle',
        params: { angleDeg: 90 },
        profile: null,
        safety: { blockAllMotion: true },
        partId: 3
      });
      expect(result.blocked).to.be.a('string');
    });
  });

  describe('retraction block', function () {
    it('blocks retraction of a part pinned at its mechanical minimum', function () {
      const result = applySafetyLimits({
        type: 'linear_actuator',
        action: 'controlActuator',
        params: { direction: 'retract', speed: 100 },
        profile: null,
        safety: { noRetractBelowMin: true },
        partId: 3
      });
      expect(result.blocked).to.be.a('string');
      expect(result.blocked).to.match(/retraction is disabled/i);
    });

    it('blocks the BTS7960 "reverse" spelling of retract too', function () {
      const result = applySafetyLimits({
        type: 'linear_actuator',
        action: 'controlActuator',
        params: { direction: 'reverse' },
        profile: null,
        safety: { noRetractBelowMin: true },
        partId: 3
      });
      expect(result.blocked).to.be.a('string');
    });

    it('still permits extension', function () {
      const result = applySafetyLimits({
        type: 'linear_actuator',
        action: 'controlActuator',
        params: { direction: 'extend', speed: 50 },
        profile: null,
        safety: { noRetractBelowMin: true },
        partId: 3
      });
      expect(result.blocked).to.equal(null);
      expect(result.params.direction).to.equal('extend');
    });
  });

  describe('speed and duration caps', function () {
    it('caps speed above the configured maximum', function () {
      const result = applySafetyLimits({
        type: 'linear_actuator',
        action: 'controlActuator',
        params: { direction: 'extend', speed: 100 },
        profile: null,
        safety: { maxSpeedPct: 40 },
        partId: 4
      });
      expect(result.params.speed).to.equal(40);
    });

    it('applies the cap as a default when the caller omits speed', function () {
      // Without this the controller default (75-100%) would silently escape the cap.
      const result = applySafetyLimits({
        type: 'linear_actuator',
        action: 'controlActuator',
        params: { direction: 'extend' },
        profile: null,
        safety: { maxSpeedPct: 40 },
        partId: 4
      });
      expect(result.params.speed).to.equal(40);
    });

    it('does not raise a speed that is already below the cap', function () {
      const result = applySafetyLimits({
        type: 'linear_actuator',
        action: 'controlActuator',
        params: { direction: 'extend', speed: 10 },
        profile: null,
        safety: { maxSpeedPct: 40 },
        partId: 4
      });
      expect(result.params.speed).to.equal(10);
    });

    it('caps how long a part may stay energized', function () {
      const result = applySafetyLimits({
        type: 'linear_actuator',
        action: 'controlActuator',
        params: { direction: 'extend', duration: 9000 },
        profile: null,
        safety: { maxDurationMs: 3000 },
        partId: 4
      });
      expect(result.params.duration).to.equal(3000);
    });
  });

  describe('pass-through for unconfigured parts', function () {
    it('changes nothing when a part has no limits and no profile', function () {
      const params = { angleDeg: 170, speed: 100, duration: 8000, direction: 'retract' };
      const result = applySafetyLimits({
        type: 'servo',
        action: 'moveToAngle',
        params,
        profile: null,
        safety: {},
        partId: 10
      });
      expect(result.blocked).to.equal(null);
      expect(result.adjustments).to.be.empty;
      expect(result.params).to.deep.equal(params);
    });
  });

  describe('power-group serialization', function () {
    it('never runs two commands on a shared rail concurrently', async function () {
      this.timeout(5000);
      const safety = { powerGroup: 'rail', powerGroupConfig: { serialize: true, cooldownMs: 0 } };
      let active = 0;
      let maxActive = 0;

      const job = () => runInPowerGroup(3, safety, async () => {
        active++;
        maxActive = Math.max(maxActive, active);
        await new Promise(resolve => setTimeout(resolve, 40));
        active--;
      });

      await Promise.all([job(), job(), job()]);
      expect(maxActive).to.equal(1);
    });

    it('enforces the cooldown between commands on the same rail', async function () {
      this.timeout(5000);
      const safety = { powerGroup: 'rail', powerGroupConfig: { serialize: true, cooldownMs: 150 } };
      const starts = [];
      const t0 = Date.now();

      const job = () => runInPowerGroup(3, safety, async () => {
        starts.push(Date.now() - t0);
        await new Promise(resolve => setTimeout(resolve, 10));
      });

      await Promise.all([job(), job()]);
      expect(starts[1] - starts[0]).to.be.at.least(150);
    });

    it('releases the rail when a command throws, so one failure cannot deadlock it', async function () {
      this.timeout(5000);
      const safety = { powerGroup: 'rail', powerGroupConfig: { serialize: true, cooldownMs: 0 } };

      const failing = runInPowerGroup(3, safety, async () => { throw new Error('boom'); });
      await failing.then(
        () => { throw new Error('expected rejection'); },
        (err) => expect(err.message).to.equal('boom')
      );

      let ran = false;
      await runInPowerGroup(3, safety, async () => { ran = true; });
      expect(ran).to.equal(true);
    });

    it('runs parts with no power group immediately, without serializing', async function () {
      this.timeout(5000);
      let active = 0;
      let maxActive = 0;
      const job = () => runInPowerGroup(3, { powerGroup: null }, async () => {
        active++;
        maxActive = Math.max(maxActive, active);
        await new Promise(resolve => setTimeout(resolve, 30));
        active--;
      });
      await Promise.all([job(), job()]);
      expect(maxActive).to.equal(2);
    });

    it('keeps separate rails independent of each other', async function () {
      this.timeout(5000);
      let active = 0;
      let maxActive = 0;
      const mk = (group) => runInPowerGroup(3, {
        powerGroup: group, powerGroupConfig: { serialize: true, cooldownMs: 0 }
      }, async () => {
        active++;
        maxActive = Math.max(maxActive, active);
        await new Promise(resolve => setTimeout(resolve, 30));
        active--;
      });
      await Promise.all([mk('rail-a'), mk('rail-b')]);
      expect(maxActive).to.equal(2);
    });
  });

  describe('configured limits for the shipped fleet', function () {
    it('loads the fused-rail group for both of its member parts', async function () {
      const elbow = await getPartSafety(3, 4, null);
      const forearm = await getPartSafety(3, 5, null);
      expect(elbow.powerGroup).to.be.a('string');
      expect(forearm.powerGroup).to.equal(elbow.powerGroup);
      expect(elbow.powerGroupConfig.serialize).to.equal(true);
      expect(elbow.maxSpeedPct).to.be.a('number');
    });

    it('returns empty limits for a part with no configuration', async function () {
      const unlisted = await getPartSafety(3, 9999, null);
      expect(unlisted.maxSpeedPct).to.equal(undefined);
      expect(unlisted.powerGroup).to.equal(null);
      expect(unlisted.noRetractBelowMin).to.equal(false);
    });
  });
});
