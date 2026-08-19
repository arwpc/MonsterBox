import hardwareService from '../../../services/hardwareService/index.js';

// Nudge scales in degrees (not normalized)
const NUDGE_SCALES = { fine: 2, med: 5, coarse: 15 };

function positionUnknownError() {
  const err = new Error('Servo position is unknown — move to an absolute angle (goto) first, then nudge');
  err.positionUnknown = true;
  return err;
}

export class AbsoluteServoAdapter {
  constructor(partId, usMin = 500, usMax = 2500, invert = false, initialAngle = null) {
    this.partId = partId;
    this.usMin = usMin;
    this.usMax = usMax;
    this.invert = invert;
    // These servos give no feedback, so position is only ever what the caller
    // last recorded. It used to default to 90°, and a relative nudge from that
    // invented number is an arbitrary jump: a jaw physically at 131.5° took a
    // "fine" nudge and drove to 88°, past its calibrated minimum of 97°,
    // because nudge is deliberately bounds-free. null means UNKNOWN, and
    // relative moves refuse rather than guess.
    this.currentAngle = Number.isFinite(initialAngle)
      ? Math.max(0, Math.min(180, initialAngle))
      : null;
    // Angle actually written to the controller (differs from the request on
    // inverted servos); null until a move succeeds.
    this.lastDrivenAngle = null;
  }

  get positionKnown() { return this.currentAngle !== null; }

  // Backward compat: currentP as computed property. null when position is unknown —
  // 0.5 or 0 would be another invented position.
  get currentP() { return this.currentAngle === null ? null : this.currentAngle / 180; }
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
  async nudge(dir, scale, opts) {
    // A relative move needs a real starting angle. Nudge is bounds-free by
    // design, so guessing the start makes the destination unbounded too.
    if (!this.positionKnown) throw positionUnknownError();
    const delta = NUDGE_SCALES[scale] || NUDGE_SCALES.med;
    const newAngle = dir === 'max'
      ? Math.min(180, this.currentAngle + delta)
      : Math.max(0, this.currentAngle - delta);
    await this.gotoAngle(newAngle, opts);
  }

  async stop() {
    // Stop re-commands the held angle; with an unknown position that would
    // drive the servo to 0° instead of holding it still.
    if (!this.positionKnown) return;
    await this.gotoAngle(this.currentAngle);
  }

  /** Move to an angle in degrees (0-180). Primary method for absolute servos. */
  async gotoAngle(angleDeg, opts) {
    const clamped = Math.max(0, Math.min(180, angleDeg));
    try {
      // Invert is applied system-wide in controlPart() via calibration profile
      const hwOptions = {};
      if (opts && opts.characterId != null) hwOptions.characterId = opts.characterId;
      if (opts && opts.calibrationOverride === true) hwOptions.calibrationOverride = true;
      const result = await hardwareService.controlPart(String(this.partId), 'moveToAngle', {
        angleDeg: clamped,
        // Accept both spellings: the nudge route sends durationMs, older callers
        // sent timeoutMs; reading only one silently discarded the operator's value.
        duration: (opts && (opts.durationMs || opts.timeoutMs)) || 1000
      }, Object.keys(hwOptions).length ? hwOptions : undefined);

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
      // controlPart mirrors the angle for inverted servos, so the value that
      // reached the PCA9685 is not the value asked for. Keep it: callers that
      // echoed the request back told the operator "moved to 60°" while the
      // register went to 119.6°.
      const applied = result && result.appliedParams && result.appliedParams.angleDeg;
      this.lastDrivenAngle = Number.isFinite(applied)
        ? applied
        : (result && Number.isFinite(result.angleDeg) ? result.angleDeg : clamped);
      this.currentAngle = clamped;
      return this.lastDrivenAngle;
    } catch (err) {
      console.error('AbsoluteServoAdapter move failed', err);
      throw err;
    }
  }

  /** Backward compat: accept normalized 0-1, convert to angle internally */
  async gotoNormalized(p, opts) {
    const angleDeg = Math.max(0, Math.min(1, p)) * 180;
    return await this.gotoAngle(angleDeg, opts);
  }
}

export default AbsoluteServoAdapter;
