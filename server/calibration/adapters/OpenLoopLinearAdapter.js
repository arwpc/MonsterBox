import hardwareService from '../../../services/hardwareService/index.js';

const NUDGE_SCALES = { fine: 0.01, med: 0.05, coarse: 0.15 };

// When moving to a position within this threshold of 0 or 1,
// treat it as an endpoint and add overdrive to guarantee
// the actuator physically contacts the mechanical stop.
const ENDPOINT_THRESHOLD = 0.02;
// Extra drive time at endpoints as a fraction of full-range travel time.
// Ensures physical contact with endstop to reset drift.
// Set high (50%) to overcome friction, weight, and load on arms/actuators.
const ENDPOINT_OVERDRIVE_FACTOR = 0.50;

export class OpenLoopLinearAdapter {
  constructor(partId, motion, invert = false, initialP = 0.5) {
    this.partId = partId;
    this.invert = invert;
    this.currentP = initialP;
    this.lastDir = undefined;
    this.motion = motion || { type: 'time-at-speed', bins: [{ pwmPct: 50, unitsPerSec: 0.2 }], settleMs: 150 };
    this.reversalCompensationBeta = 0;
  }

  getCapabilities() { return { kind: 'openloop-linear', invert: this.invert }; }

  selectBin(requestedPwmPct) {
    // Ignore corrupt bins outright: a null/NaN/zero unitsPerSec divides into
    // Infinity downstream, i.e. a motor commanded with no stop time. Bad bins
    // reached disk through the old learn-openloop endpoint (fixed), but stored
    // profiles may still carry them.
    const usable = (this.motion.bins || []).filter(b => Number.isFinite(b.unitsPerSec) && b.unitsPerSec > 0);
    const candidates = usable.filter(b => b.pwmPct <= requestedPwmPct).sort((a, b) => b.pwmPct - a.pwmPct);
    return candidates[0] || usable[0] || { pwmPct: 50, unitsPerSec: 0.2 };
  }

  /**
   * Calculate motor drive time for a given movement distance.
   * Returns ONLY the motor-on time — settle time is handled separately
   * by the caller (gotoNormalized waits after the motor stops).
   */
  calculateDriveTime(deltaP, pwmPct) {
    const bin = this.selectBin(pwmPct);
    const driveMs = (Math.abs(deltaP) / bin.unitsPerSec) * 1000;
    return Math.max(100, Math.round(driveMs));
  }

  /** Settle time (post-movement delay for mechanical damping) */
  get settleMs() { return this.motion.settleMs || 150; }

  /**
   * @deprecated Use calculateDriveTime instead — settleMs is now applied separately.
   * Kept for backward compatibility with any external callers.
   */
  calculateMoveTime(deltaP, pwmPct) {
    return this.calculateDriveTime(deltaP, pwmPct) + this.settleMs;
  }

  async nudge(dir, scale, opts) {
    const delta = NUDGE_SCALES[scale] || NUDGE_SCALES.med;
    const newP = dir === 'max' ? Math.min(1, this.currentP + delta) : Math.max(0, this.currentP - delta);
    await this.gotoNormalized(newP, Object.assign({ speedPct: 50 }, opts || {}));
  }

  async stop() {
    try { await hardwareService.controlPart(String(this.partId), 'stop', {}); } catch (err) { console.error('OpenLoopLinearAdapter stop failed', err); }
  }

  /**
   * Drive to a physical endstop (fully retracted p=0 or fully extended p=1).
   * Uses generous overdrive to guarantee the actuator physically contacts
   * the mechanical stop, then resets the position tracker.
   * This corrects any accumulated open-loop drift.
   *
   * @param {'retract'|'extend'} direction - Which endstop to seek
   * @param {number} speedPct - Motor speed percentage (default 50)
   */
  async home(direction = 'retract', speedPct = 50, opts) {
    const targetP = direction === 'retract' ? 0 : 1;
    const hwDir = direction === 'retract' ? 'retract' : 'extend';
    // Full-range drive time plus generous overdrive
    const bin = this.selectBin(speedPct);
    const fullRangeMs = (1.0 / bin.unitsPerSec) * 1000;
    const duration = Math.round(fullRangeMs * (1 + ENDPOINT_OVERDRIVE_FACTOR));
    console.log(`🏠 OpenLoopLinearAdapter: homing partId=${this.partId}, dir=${hwDir}, speed=${speedPct}%, duration=${duration}ms`);
    try {
      const hwOptions = {};
      if (opts && opts.characterId != null) hwOptions.characterId = opts.characterId;
      if (opts && opts.calibrationOverride === true) hwOptions.calibrationOverride = true;
      const result = await hardwareService.controlPart(String(this.partId), 'jog',
        { direction: hwDir, speed: speedPct, duration },
        Object.keys(hwOptions).length ? hwOptions : undefined);
      // A refused or failed drive must NOT reset the tracker: "homed" used to
      // be recorded even when the safety layer blocked the jog or the wrapper
      // errored — the system then believed a part was at its endstop when it
      // had not moved at all, which is why homing "did nothing" and every
      // position after it was fiction.
      if (result && result.success === false) {
        const err = new Error(result.error || 'Homing drive was refused');
        err.blockedBySafetyLimit = !!result.blockedBySafetyLimit;
        throw err;
      }
      // Wait for mechanical settling
      await new Promise(r => setTimeout(r, this.settleMs));
      // Reset tracker — physical stop guarantees known position
      this.currentP = targetP;
      this.lastDir = direction === 'retract' ? 'min' : 'max';
    } catch (err) {
      console.error('OpenLoopLinearAdapter home failed', err);
      throw err;
    }
  }

  async gotoNormalized(p, opts) {
    const clampedP = Math.max(0, Math.min(1, p));
    const deltaP = clampedP - this.currentP;
    if (Math.abs(deltaP) < 0.001) return;
    const direction = deltaP > 0 ? 'extend' : 'retract';
    const currentDir = deltaP > 0 ? 'max' : 'min';
    let compensatedDelta = Math.abs(deltaP);
    if (this.lastDir && this.lastDir !== currentDir && this.reversalCompensationBeta > 0) compensatedDelta += this.reversalCompensationBeta;
    const speedPct = (opts && opts.speedPct) || 50;

    // Calculate pure motor-on time (without settle)
    let driveMs = (opts && opts.timeoutMs) || this.calculateDriveTime(compensatedDelta, speedPct);

    // Endpoint overdrive: when moving to a physical stop (near 0 or 1),
    // add extra time to guarantee contact with the mechanical endstop.
    // This resets accumulated positional drift from open-loop estimation.
    const isEndpoint = clampedP <= ENDPOINT_THRESHOLD || clampedP >= (1 - ENDPOINT_THRESHOLD);
    if (isEndpoint && !(opts && opts.timeoutMs)) {
      const bin = this.selectBin(speedPct);
      const fullRangeMs = (1.0 / bin.unitsPerSec) * 1000;
      driveMs += Math.round(fullRangeMs * ENDPOINT_OVERDRIVE_FACTOR);
    }

    console.log(`🔧 OpenLoopLinearAdapter: partId=${this.partId}, direction=${direction}, speed=${speedPct}%, driveMs=${driveMs}ms, settleMs=${this.settleMs}ms, deltaP=${deltaP.toFixed(3)}${isEndpoint ? ' (ENDPOINT OVERDRIVE)' : ''}`);
    try {
      const hwOptions = {};
      if (opts && opts.characterId != null) hwOptions.characterId = opts.characterId;
      if (opts && opts.calibrationOverride === true) hwOptions.calibrationOverride = true;
      const result = await hardwareService.controlPart(String(this.partId), 'jog',
        { direction, speed: speedPct, duration: driveMs },
        Object.keys(hwOptions).length ? hwOptions : undefined);
      // controlPart RETURNS a refusal rather than throwing, so ignoring the result
      // meant a blocked move still advanced the position estimate: the system then
      // believed a quarantined actuator sitting on its endstop was at mid-travel —
      // exactly the state that makes noRetractBelowMin reasoning unsafe.
      if (result && result.success === false) {
        const err = new Error(result.error || 'Hardware refused the move');
        err.blockedBySafetyLimit = !!result.blockedBySafetyLimit;
        throw err;
      }
      // Wait for mechanical settling after motor stops
      await new Promise(r => setTimeout(r, this.settleMs));
      this.currentP = clampedP;
      this.lastDir = currentDir;
      // At endpoints, the physical stop guarantees actual position matches.
      // Reset tracker to exact endpoint to eliminate accumulated drift.
      if (isEndpoint) {
        this.currentP = clampedP <= ENDPOINT_THRESHOLD ? 0 : 1;
      }
    } catch (err) { console.error('OpenLoopLinearAdapter goto failed', err); throw err; }
  }

  updateMotion(motion) { this.motion = motion; }
  setReversalCompensation(beta) { this.reversalCompensationBeta = Math.max(0, beta); }
}

export default OpenLoopLinearAdapter;
