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
      const result = await hardwareService.controlPart(String(this.partId), 'moveToAngle', {
        angleDeg: clamped,
        // Accept both spellings: the nudge route sends durationMs, older callers
        // sent timeoutMs; reading only one silently discarded the operator's value.
        duration: (opts && (opts.durationMs || opts.timeoutMs)) || 1000
      }, opts && opts.characterId != null ? { characterId: opts.characterId } : undefined);

      // controlPart NEVER throws — refusals and wrapper failures come back as
      // {success:false}. Swallowing that here advanced currentAngle for a servo
      // that never received a valid command, so the calibration page showed a
      // confident phantom position — and set-min/set-max then persisted bounds
      // built from angles the servo never reached. The open-loop sibling
      // (OpenLoopLinearAdapter) already guards this; mirror it.
      if (result && result.success === false) {
        const err = new Error(result.error || 'Hardware refused the move');
        err.blockedBySafetyLimit = !!result.blockedBySafetyLimit;
        throw err;
      }
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
