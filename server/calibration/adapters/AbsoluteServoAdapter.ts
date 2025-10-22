/**
 * Absolute Servo Adapter
 * Maps normalized position [0..1] to microsecond pulse widths
 */

import type { PositionableAdapter } from './index.js';
import type { CapabilityProfile, SensorReadings } from '../models.js';
import hardwareService from '../../../services/hardwareService/index.js';

const NUDGE_SCALES = {
  fine: 0.01, // 1% movement
  med: 0.05, // 5% movement
  coarse: 0.15 // 15% movement
};

export class AbsoluteServoAdapter implements PositionableAdapter {
  private partId: number;
  private usMin: number;
  private usMax: number;
  private invert: boolean;
  private currentP: number = 0.5;

  constructor(
    partId: number,
    usMin: number = 500,
    usMax: number = 2500,
    invert: boolean = false
  ) {
    this.partId = partId;
    this.usMin = usMin;
    this.usMax = usMax;
    this.invert = invert;
  }

  getCapabilities(): CapabilityProfile {
    return {
      kind: 'absolute-servo',
      usMin: this.usMin,
      usMax: this.usMax,
      invert: this.invert
    };
  }

  private pToUs(p: number): number {
    const effP = this.invert ? (1 - p) : p;
    return this.usMin + effP * (this.usMax - this.usMin);
  }

  async nudge(dir: 'min' | 'max', scale: 'fine' | 'med' | 'coarse'): Promise<void> {
    const delta = NUDGE_SCALES[scale] || NUDGE_SCALES.med;
    const newP = dir === 'max' 
      ? Math.min(1, this.currentP + delta)
      : Math.max(0, this.currentP - delta);
    await this.gotoNormalized(newP);
  }

  async stop(): Promise<void> {
    // Servos hold position, so stop is essentially a no-op
    // But we can send current position to ensure it's held
    await this.gotoNormalized(this.currentP);
  }

  async gotoNormalized(p: number, opts?: { speedPct?: number; timeoutMs?: number }): Promise<void> {
    const clampedP = Math.max(0, Math.min(1, p));
    const us = this.pToUs(clampedP);
    const angleDeg = clampedP * 180; // Convert to angle for existing API
    
    try {
      await hardwareService.controlPart(String(this.partId), 'moveToAngle', {
        angleDeg,
        duration: opts?.timeoutMs || 1000
      });
      this.currentP = clampedP;
    } catch (err) {
      console.error(`AbsoluteServoAdapter: failed to move part ${this.partId}:`, err);
      throw err;
    }
  }

  async readSensors(): Promise<SensorReadings> {
    // Standard servos typically don't have position feedback
    return {};
  }
}

export default AbsoluteServoAdapter;
