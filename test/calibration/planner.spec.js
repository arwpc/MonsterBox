/**
 * Unit tests for calibration planner
 * Tests motion planning, clamping, timeout calculation
 */

import { expect } from 'chai';
import * as planner from '../../server/calibration/planner.js';

describe('Calibration Planner', () => {
  beforeEach(() => {
    // Reset global speed cap before each test
    planner.setGlobalSpeedCap(1.0);
  });

  describe('clampP', () => {
    it('should clamp values to [0, 1]', () => {
      expect(planner.clampP(-0.5)).to.equal(0);
      expect(planner.clampP(0)).to.equal(0);
      expect(planner.clampP(0.5)).to.equal(0.5);
      expect(planner.clampP(1)).to.equal(1);
      expect(planner.clampP(1.5)).to.equal(1);
    });
  });

  describe('Global Speed Cap', () => {
    it('should set and get global speed cap', () => {
      planner.setGlobalSpeedCap(0.5);
      expect(planner.getGlobalSpeedCap()).to.equal(0.5);
    });

    it('should clamp speed cap to [0, 1]', () => {
      planner.setGlobalSpeedCap(-0.1);
      expect(planner.getGlobalSpeedCap()).to.equal(0);
      
      planner.setGlobalSpeedCap(1.5);
      expect(planner.getGlobalSpeedCap()).to.equal(1);
    });
  });

  describe('planDirectMap', () => {
    const motionModel = {
      type: 'direct-map',
      usMin: 1000,
      usMax: 2000,
      usPerNorm: 1000
    };

    it('should map normalized position to microseconds', () => {
      const result = planner.planDirectMap(motionModel, 0, 0.5);
      expect(result.targetUs).to.equal(1500);
      expect(result.durationMs).to.equal(0);
    });

    it('should respect global speed cap', () => {
      planner.setGlobalSpeedCap(0.5);
      const result = planner.planDirectMap(motionModel, 0, 1);
      // Speed cap doesn't affect direct-map (instant positioning)
      expect(result.targetUs).to.equal(2000);
    });

    it('should clamp to min/max bounds', () => {
      const resultMin = planner.planDirectMap(motionModel, 0, -0.5);
      expect(resultMin.targetUs).to.equal(1000);

      const resultMax = planner.planDirectMap(motionModel, 0, 1.5);
      expect(resultMax.targetUs).to.equal(2000);
    });
  });

  describe('planTimeAtSpeed', () => {
    const motionModel = {
      type: 'time-at-speed',
      bins: [
        { pEnd: 0.5, msPerNorm: 1000 },
        { pEnd: 1.0, msPerNorm: 2000 }
      ],
      settleMs: 100,
      reversalCompensationBeta: 0.1
    };

    it('should calculate duration for single bin movement', () => {
      const result = planner.planTimeAtSpeed(motionModel, 0, 0.25);
      // Distance: 0.25, rate: 1000ms per 1.0 norm → 250ms + 100ms settle
      expect(result.durationMs).to.be.closeTo(350, 1);
    });

    it('should calculate duration across multiple bins', () => {
      const result = planner.planTimeAtSpeed(motionModel, 0, 0.75);
      // Bin 1: 0→0.5 = 0.5 distance × 1000 = 500ms
      // Bin 2: 0.5→0.75 = 0.25 distance × 2000 = 500ms
      // Total: 1000ms + 100ms settle = 1100ms
      expect(result.durationMs).to.be.closeTo(1100, 1);
    });

    it('should apply reversal compensation for direction changes', () => {
      const result = planner.planTimeAtSpeed(motionModel, 0.5, 0.25);
      // Moving backwards (reversal)
      // Distance: 0.25, rate: 1000ms × (1 + 0.1) = 1100ms per norm
      // 0.25 × 1100 = 275ms + 100ms settle = 375ms
      expect(result.durationMs).to.be.closeTo(375, 1);
    });

    it('should respect global speed cap', () => {
      planner.setGlobalSpeedCap(0.5);
      const result = planner.planTimeAtSpeed(motionModel, 0, 0.25);
      // Speed cap doubles duration: 250ms → 500ms, + 100ms settle = 600ms
      expect(result.durationMs).to.be.closeTo(600, 1);
    });

    it('should handle zero movement', () => {
      const result = planner.planTimeAtSpeed(motionModel, 0.5, 0.5);
      expect(result.durationMs).to.equal(0);
    });
  });

  describe('planMotion', () => {
    const directMapModel = {
      type: 'direct-map',
      usMin: 1000,
      usMax: 2000,
      usPerNorm: 1000
    };

    const timeAtSpeedModel = {
      type: 'time-at-speed',
      bins: [{ pEnd: 1.0, msPerNorm: 1000 }],
      settleMs: 50
    };

    it('should delegate to planDirectMap for direct-map model', () => {
      const result = planner.planMotion(directMapModel, 0, 0.5);
      expect(result.targetUs).to.equal(1500);
      expect(result.durationMs).to.equal(0);
    });

    it('should delegate to planTimeAtSpeed for time-at-speed model', () => {
      const result = planner.planMotion(timeAtSpeedModel, 0, 0.5);
      expect(result.durationMs).to.be.closeTo(550, 1);
    });

    it('should throw for unknown motion model type', () => {
      const invalidModel = { type: 'unknown' };
      expect(() => planner.planMotion(invalidModel, 0, 0.5))
        .to.throw('Unknown motion model type');
    });
  });

  describe('calculateTimeout', () => {
    it('should add safety margin to duration', () => {
      const timeout = planner.calculateTimeout(1000, 1.5);
      expect(timeout).to.equal(1500);
    });

    it('should use default margin of 2.0', () => {
      const timeout = planner.calculateTimeout(1000);
      expect(timeout).to.equal(2000);
    });

    it('should enforce minimum timeout of 100ms', () => {
      const timeout = planner.calculateTimeout(0);
      expect(timeout).to.equal(100);
    });
  });
});
