/**
 * Open-Loop Linear Actuator/Motor Adapter
 * Uses time-at-speed motion model for position estimation
 */

import type { PositionableAdapter } from './index.js';
import type { CapabilityProfile, MotionModel, SensorReadings } from '../models.js';
import hardwareService from '../../../services/hardwareService/index.js';

const NUDGE_SCALES = {
  fine: 0.01, // 1% movement
  med: 0.05, // 5% movement
  coarse: 0.15 // 15% movement
};

export class OpenLoopLinearAdapter implements PositionableAdapter {
  private partId: number;
  private invert: boolean;
  private currentP: number = 0.5;
  private lastDir?: 'min' | 'max';
  private motion: Extract<MotionModel, { type: 'time-at-speed' }>;
  private reversalCompensationBeta: number = 0; // Reversal compensation factor

  constructor(
    partId: number,
    motion: Extract<MotionModel, { type: 'time-at-speed' }>,
    invert: boolean = false,
    initialP: number = 0.5
  ) {
    this.partId = partId;
    this.motion = motion;
    this.invert = invert;
    this.currentP = initialP;
  }

  getCapabilities(): CapabilityProfile {
    return {
      kind: 'openloop-linear',
      invert: this.invert
    };
  }

  private selectBin(requestedPwmPct: number): { pwmPct: number; unitsPerSec: number } {
    // Choose the highest bin that doesn't exceed the requested PWM
    const candidates = this.motion.bins
      .filter(b => b.pwmPct <= requestedPwmPct)
      .sort((a, b) => b.pwmPct - a.pwmPct);
    
    return candidates[0] || this.motion.bins[0] || { pwmPct: 50, unitsPerSec: 0.2 };
  }

  private calculateMoveTime(deltaP: number, pwmPct: number): number {
    const bin = this.selectBin(pwmPct);
    const timeMs = (Math.abs(deltaP) / bin.unitsPerSec) * 1000 + this.motion.settleMs;
    return Math.max(100, timeMs); // Minimum 100ms
  }

  async nudge(dir: 'min' | 'max', scale: 'fine' | 'med' | 'coarse'): Promise<void> {
    const delta = NUDGE_SCALES[scale] || NUDGE_SCALES.med;
    const newP = dir === 'max' 
      ? Math.min(1, this.currentP + delta)
      : Math.max(0, this.currentP - delta);
    await this.gotoNormalized(newP, { speedPct: 50 });
  }

  async stop(): Promise<void> {
    try {
      await hardwareService.controlPart(String(this.partId), 'stop', {});
    } catch (err) {
      console.error(`OpenLoopLinearAdapter: failed to stop part ${this.partId}:`, err);
    }
  }

  async gotoNormalized(p: number, opts?: { speedPct?: number; timeoutMs?: number }): Promise<void> {
    const clampedP = Math.max(0, Math.min(1, p));
    const deltaP = clampedP - this.currentP;
    
    if (Math.abs(deltaP) < 0.001) {
      return; // Already at target
    }

    const direction = deltaP > 0 ? 'extend' : 'retract';
    const currentDir: 'min' | 'max' = deltaP > 0 ? 'max' : 'min';
    
    // Apply reversal compensation if direction changed
    let compensatedDelta = Math.abs(deltaP);
    if (this.lastDir && this.lastDir !== currentDir && this.reversalCompensationBeta > 0) {
      compensatedDelta += this.reversalCompensationBeta;
    }

    const speedPct = opts?.speedPct || 50;
    const duration = opts?.timeoutMs || this.calculateMoveTime(compensatedDelta, speedPct);

    try {
      // Use linear actuator control for open-loop movement
      await hardwareService.controlPart(String(this.partId), 'jog', {
        direction,
        speed: speedPct,
        duration
      });

      // Update estimated position
      this.currentP = clampedP;
      this.lastDir = currentDir;
    } catch (err) {
      console.error(`OpenLoopLinearAdapter: failed to move part ${this.partId}:`, err);
      throw err;
    }
  }

  async readSensors(): Promise<SensorReadings> {
    // Could integrate limit switch readings if available
    return {};
  }

  // Public method to update motion model after learning
  updateMotion(motion: Extract<MotionModel, { type: 'time-at-speed' }>): void {
    this.motion = motion;
  }

  // Set reversal compensation factor
  setReversalCompensation(beta: number): void {
    this.reversalCompensationBeta = Math.max(0, beta);
  }
}

export default OpenLoopLinearAdapter;
