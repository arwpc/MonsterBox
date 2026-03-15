import hardwareService from '../../../services/hardwareService/index.js';

// Nudge scales in degrees (not normalized)
const NUDGE_SCALES = { fine: 2, med: 5, coarse: 15 };

export class AbsoluteServoAdapter {
  constructor(partId, usMin = 500, usMax = 2500, invert = false) {
    this.partId = partId;
    this.usMin = usMin;
    this.usMax = usMax;
    this.invert = invert;
    this.currentAngle = 90; // degrees (0-180)
  }

  // Backward compat: currentP as computed property
  get currentP() { return this.currentAngle / 180; }
  set currentP(p) { this.currentAngle = Math.round(p * 180 * 10) / 10; }

  getCapabilities() { return { kind: 'absolute-servo', usMin: this.usMin, usMax: this.usMax, invert: this.invert }; }

  /** Convert angle (0-180) to PWM microseconds */
  angleToUs(angle) {
    const p = Math.max(0, Math.min(1, angle / 180));
    const effP = this.invert ? (1 - p) : p;
    return this.usMin + effP * (this.usMax - this.usMin);
  }

  // Legacy alias
  pToUs(p) { return this.angleToUs(p * 180); }

  /** Nudge by old-style dir/scale (uses degree-based scales) */
  async nudge(dir, scale) {
    const delta = NUDGE_SCALES[scale] || NUDGE_SCALES.med;
    const newAngle = dir === 'max'
      ? Math.min(180, this.currentAngle + delta)
      : Math.max(0, this.currentAngle - delta);
    await this.gotoAngle(newAngle);
  }

  async stop() { await this.gotoAngle(this.currentAngle); }

  /** Move to an angle in degrees (0-180). Primary method for absolute servos. */
  async gotoAngle(angleDeg, opts) {
    const clamped = Math.max(0, Math.min(180, angleDeg));
    try {
      // Invert is applied system-wide in controlPart() via calibration profile
      await hardwareService.controlPart(String(this.partId), 'moveToAngle', {
        angleDeg: clamped,
        duration: (opts && opts.timeoutMs) || 1000
      });
      this.currentAngle = clamped;
    } catch (err) {
      console.error('AbsoluteServoAdapter move failed', err);
      throw err;
    }
  }

  /** Backward compat: accept normalized 0-1, convert to angle internally */
  async gotoNormalized(p, opts) {
    const angleDeg = Math.max(0, Math.min(1, p)) * 180;
    await this.gotoAngle(angleDeg, opts);
  }
}

export default AbsoluteServoAdapter;
