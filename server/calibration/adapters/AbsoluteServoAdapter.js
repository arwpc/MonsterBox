import hardwareService from '../../../services/hardwareService/index.js';

// Nudge scales in degrees (not normalized)
const NUDGE_SCALES = { fine: 2, med: 5, coarse: 15 };

function positionUnknownError() {
  const err = new Error('Servo position is unknown — move to an absolute angle (goto) first, then nudge');
  err.positionUnknown = true;
  return err;
}

export class AbsoluteServoAdapter {
  constructor(partId, usMin = 500, usMax = 2500, invert = false, initialAngle = null, bounds = null, maxAngleDeg = 180) {
    this.partId = partId;
    this.usMin = usMin;
    this.usMax = usMax;
    this.invert = invert;
    // The servo's REAL rotation range in degrees. 180 for a standard servo; a
    // multi-turn gearbox (the knight's 900° Stingray-2) spans its whole travel
    // over the same pulse range, so every angle in this adapter is a real
    // output degree of THIS part, not a fraction of a fixed 0-180 scale.
    // Treating the Stingray as 0-180 made one UI degree five real degrees and
    // let a single goto command hundreds of degrees of travel into the head
    // cabling.
    this.maxAngleDeg = (Number.isFinite(maxAngleDeg) && maxAngleDeg > 0) ? maxAngleDeg : 180;
    // The calibrated window, needed ONLY to mirror an inverted servo the same way
    // the runtime does. See angleToUs(). Null means "no measured window", which
    // reproduces the historical full-span mirror exactly.
    this.boundsMin = (bounds && typeof bounds.minAngle === 'number') ? bounds.minAngle : null;
    this.boundsMax = (bounds && typeof bounds.maxAngle === 'number') ? bounds.maxAngle : null;
    // These servos give no feedback, so position is only ever what the caller
    // last recorded. It used to default to 90°, and a relative nudge from that
    // invented number is an arbitrary jump: a jaw physically at 131.5° took a
    // "fine" nudge and drove to 88°, past its calibrated minimum of 97°,
    // because nudge is deliberately bounds-free. null means UNKNOWN, and
    // relative moves refuse rather than guess.
    this.currentAngle = Number.isFinite(initialAngle)
      ? Math.max(0, Math.min(this.maxAngleDeg, initialAngle))
      : null;
    // Angle actually written to the controller (differs from the request on
    // inverted servos); null until a move succeeds.
    this.lastDrivenAngle = null;
  }

  get positionKnown() { return this.currentAngle !== null; }

  // Backward compat: currentP as computed property. null when position is unknown —
  // 0.5 or 0 would be another invented position. Normalized over the REAL range.
  get currentP() { return this.currentAngle === null ? null : this.currentAngle / this.maxAngleDeg; }
  set currentP(p) { this.currentAngle = Math.round(p * this.maxAngleDeg * 10) / 10; }

  getCapabilities() { return { kind: 'absolute-servo', usMin: this.usMin, usMax: this.usMax, invert: this.invert, maxAngleDeg: this.maxAngleDeg }; }

  /**
   * Convert angle (0-180) to PWM microseconds.
   *
   * INVERT MUST MATCH THE RUNTIME. This used to mirror across the full 0-180 span
   * (`1 - angle/180`) while hardwareService.controlPart mirrors within the
   * calibrated window (`minAngle + maxAngle - angle`). Two different formulas for
   * one physical fact, so the same commanded angle landed in two different places:
   * on a live fleet jaw with invert=true and a measured window of 97-151, asking
   * for 97 produced 1422 us here and 2178 us at show time — 756 us apart. Worse,
   * 1422 us is 83 degrees, BELOW that servo's own calibrated minimum, so the
   * calibration page drove an inverted servo outside the window it was calibrating.
   *
   * With no measured window this falls back to (0 + 180 - angle), which is
   * arithmetically identical to the old `1 - angle/180`, so uncalibrated parts
   * behave exactly as before.
   */
  angleToUs(angle) {
    let effAngle = angle;
    if (this.invert) {
      const minA = this.boundsMin != null ? this.boundsMin : 0;
      const maxA = this.boundsMax != null ? this.boundsMax : this.maxAngleDeg;
      effAngle = minA + maxA - angle;
    }
    const p = Math.max(0, Math.min(1, effAngle / this.maxAngleDeg));
    return this.usMin + p * (this.usMax - this.usMin);
  }

  // Legacy alias
  pToUs(p) { return this.angleToUs(p * this.maxAngleDeg); }

  /** Nudge by old-style dir/scale (uses degree-based scales) */
  async nudge(dir, scale, opts) {
    // A relative move needs a real starting angle. Nudge is bounds-free by
    // design, so guessing the start makes the destination unbounded too.
    if (!this.positionKnown) throw positionUnknownError();
    // Scales are tuned for a 180° servo. A multi-turn gearbox spans its whole
    // travel over the same pulse range, so the same degrees are proportionally
    // less pulse: a 2° "fine" on the 900° head is ~4 µs — inside the servo's
    // deadband, and every nudge read as a dead part at the bench. Scale by
    // span so each step keeps its pulse-step feel (900°: fine 10°, med 25°,
    // coarse 75° REAL); the response message reports the real degrees moved.
    const spanFactor = this.maxAngleDeg / 180;
    const delta = (NUDGE_SCALES[scale] || NUDGE_SCALES.med) * spanFactor;
    const newAngle = dir === 'max'
      ? Math.min(this.maxAngleDeg, this.currentAngle + delta)
      : Math.max(0, this.currentAngle - delta);
    await this.gotoAngle(newAngle, opts);
  }

  async stop() {
    // Stop re-commands the held angle; with an unknown position that would
    // drive the servo to 0° instead of holding it still.
    if (!this.positionKnown) return;
    await this.gotoAngle(this.currentAngle);
  }

  /** Move to an angle in real degrees (0..maxAngleDeg). Primary method for absolute servos. */
  async gotoAngle(angleDeg, opts) {
    const clamped = Math.max(0, Math.min(this.maxAngleDeg, angleDeg));
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
    const angleDeg = Math.max(0, Math.min(1, p)) * this.maxAngleDeg;
    return await this.gotoAngle(angleDeg, opts);
  }
}

export default AbsoluteServoAdapter;
