/**
 * ContinuousServoAdapter.js
 * Adapter for continuous rotation servos (like GoBilda Stingray)
 *
 * Continuous servos don't have absolute position feedback - they rotate
 * at a speed/direction until stopped. This adapter provides time-based
 * movement estimation with safety limits and endpoint anchoring to
 * correct accumulated open-loop drift.
 */

import { runWrapper } from '../../../services/hardwareService/exec.js';

// Endpoint anchoring thresholds (same as OpenLoopLinearAdapter)
const ENDPOINT_THRESHOLD = 0.02;
const ENDPOINT_OVERDRIVE_FACTOR = 0.30;

export default class ContinuousServoAdapter {
  /**
   * @param {number} partId - Part ID
   * @param {Object} motion - Motion config { defaultSpeedPct, defaultDurationMs, bins, settleMs }
   * @param {boolean} invert - Invert direction
   * @param {number} channel - PCA9685 channel (default: 0)
   * @param {number} address - I2C address (default: 0x40 = 64)
   */
  constructor(partId, motion, invert = false, channel = 0, address = 64) {
    this.partId = partId;
    this.motion = motion || { defaultSpeedPct: 30, defaultDurationMs: 500 };
    this.invert = invert;
    this.channel = channel;
    this.address = address;

    // Estimated position tracking (0 = neutral, -1 = max CCW, +1 = max CW)
    this.estimatedPosition = 0;
    this.currentP = 0.5;
    this.lastDir = undefined;
    this.isRunning = false;
  }

  /** Settle time (post-movement delay for mechanical damping) */
  get settleMs() { return this.motion.settleMs || 150; }

  /**
   * Convert direction based on invert setting
   */
  effectiveDirection(dir) {
    if (!this.invert) return dir;
    if (dir === 'cw') return 'ccw';
    if (dir === 'ccw') return 'cw';
    return dir;
  }

  /**
   * Nudge the servo in a direction (matches AbsoluteServoAdapter/OpenLoopLinearAdapter interface)
   * @param {string} dir - 'min' (CCW) or 'max' (CW)
   * @param {string} scale - 'fine', 'med', or 'coarse'
   */
  async nudge(dir, scale) {
    const NUDGE_DURATIONS = { fine: 200, med: 500, coarse: 1000 };
    const durationMs = NUDGE_DURATIONS[scale] || NUDGE_DURATIONS.med;
    const speedPct = this.motion.defaultSpeedPct ?? 30;

    let direction = dir === 'max' ? 'cw' : 'ccw';
    direction = this.effectiveDirection(direction);

    console.log(`ContinuousServoAdapter: nudge partId=${this.partId}, dir=${direction}, speed=${speedPct}%, duration=${durationMs}ms, ch=${this.channel}`);

    try {
      this.isRunning = true;
      const args = ['rotate_continuous_pca', String(this.channel), direction, String(speedPct), String(durationMs)];
      if (this.address !== 64) {
        args.push(String(this.address));
      }

      await runWrapper('servo_cli.py', args, { timeoutMs: durationMs + 5000 });

      // Wait for mechanical settling after motor stops
      await new Promise(r => setTimeout(r, this.settleMs));

      // Update estimated position (rough tracking)
      const positionDelta = (direction === 'cw' ? 1 : -1) * (durationMs / 1000) * (speedPct / 100);
      this.estimatedPosition = Math.max(-1, Math.min(1, this.estimatedPosition + positionDelta * 0.1));
      this.currentP = (this.estimatedPosition + 1) / 2;
      this.lastDir = dir === 'max' ? 'max' : 'min';

      this.isRunning = false;
      return { success: true, direction, speedPct, durationMs };
    } catch (err) {
      this.isRunning = false;
      throw err;
    }
  }

  /**
   * Stop the servo immediately
   */
  async stop() {
    console.log(`ContinuousServoAdapter: stop partId=${this.partId}`);
    try {
      const args = ['rotate_continuous_pca', String(this.channel), 'stop', '0', '100'];
      if (this.address !== 64) {
        args.push(String(this.address));
      }
      await runWrapper('servo_cli.py', args, { timeoutMs: 2000 });
      this.isRunning = false;
      return { success: true };
    } catch (err) {
      throw err;
    }
  }

  /**
   * Drive to a physical endstop to correct accumulated drift.
   * Runs the servo in the specified direction with generous overdrive
   * to guarantee contact with the mechanical stop, then resets tracking.
   *
   * @param {'retract'|'extend'} direction - Which endstop to seek (retract=CCW/min, extend=CW/max)
   * @param {number} speedPct - Motor speed percentage (default 30)
   */
  async home(direction = 'retract', speedPct) {
    const speed = speedPct ?? this.motion.defaultSpeedPct ?? 30;
    const targetP = direction === 'retract' ? 0 : 1;
    // Full-range duration with overdrive
    const maxDuration = 4000; // 4s full range for continuous servo
    const duration = Math.round(maxDuration * (1 + ENDPOINT_OVERDRIVE_FACTOR));

    let servoDir = direction === 'retract' ? 'ccw' : 'cw';
    servoDir = this.effectiveDirection(servoDir);

    console.log(`🏠 ContinuousServoAdapter: homing partId=${this.partId}, dir=${servoDir}, speed=${speed}%, duration=${duration}ms`);

    try {
      this.isRunning = true;
      const args = ['rotate_continuous_pca', String(this.channel), servoDir, String(speed), String(duration)];
      if (this.address !== 64) {
        args.push(String(this.address));
      }
      await runWrapper('servo_cli.py', args, { timeoutMs: duration + 5000 });
      // Wait for mechanical settling
      await new Promise(r => setTimeout(r, this.settleMs));
      // Reset tracker — physical stop guarantees known position
      this.estimatedPosition = targetP === 0 ? -1 : 1;
      this.currentP = targetP;
      this.lastDir = direction === 'retract' ? 'min' : 'max';
      this.isRunning = false;
    } catch (err) {
      this.isRunning = false;
      console.error('ContinuousServoAdapter home failed', err);
      throw err;
    }
  }

  /**
   * Move to a normalized position (approximate for continuous servos)
   * Since continuous servos have no position feedback, this does time-based rotation
   * @param {number} targetP - Target position (0 to 1, 0.5 = center/neutral)
   * @param {Object} opts - { speedPct }
   */
  async gotoNormalized(targetP, opts = {}) {
    // For continuous servos, we can only estimate position
    // 0.5 = neutral, 0 = max CCW, 1 = max CW
    const currentP = (this.estimatedPosition + 1) / 2; // Convert -1..+1 to 0..1
    const delta = targetP - currentP;

    if (Math.abs(delta) < 0.01) {
      // Already at target (approximately)
      return { success: true, message: 'Already at target' };
    }

    // Calculate direction and duration based on delta
    const speedPct = opts.speedPct ?? this.motion.defaultSpeedPct ?? 30;
    const maxDuration = 2000; // Max 2 seconds for safety
    let durationMs = Math.min(maxDuration, Math.round(Math.abs(delta) * 4000)); // ~4 seconds for full range

    // Endpoint overdrive: add extra time when moving to endstops
    const isEndpoint = targetP <= ENDPOINT_THRESHOLD || targetP >= (1 - ENDPOINT_THRESHOLD);
    if (isEndpoint) {
      const fullRangeMs = 4000;
      durationMs += Math.round(fullRangeMs * ENDPOINT_OVERDRIVE_FACTOR);
    }

    const dir = delta > 0 ? 'max' : 'min';
    const scale = durationMs <= 300 ? 'fine' : (durationMs <= 700 ? 'med' : 'coarse');

    // Use nudge with the calculated duration
    const NUDGE_DURATIONS = { fine: durationMs, med: durationMs, coarse: durationMs };
    let direction = dir === 'max' ? 'cw' : 'ccw';
    direction = this.effectiveDirection(direction);

    console.log(`🔧 ContinuousServoAdapter: partId=${this.partId}, dir=${direction}, speed=${speedPct}%, duration=${durationMs}ms, delta=${delta.toFixed(3)}${isEndpoint ? ' (ENDPOINT OVERDRIVE)' : ''}`);

    try {
      this.isRunning = true;
      const args = ['rotate_continuous_pca', String(this.channel), direction, String(speedPct), String(durationMs)];
      if (this.address !== 64) {
        args.push(String(this.address));
      }
      await runWrapper('servo_cli.py', args, { timeoutMs: durationMs + 5000 });
      // Wait for mechanical settling after motor stops
      await new Promise(r => setTimeout(r, this.settleMs));
      // Update tracking
      this.currentP = targetP;
      this.estimatedPosition = targetP * 2 - 1; // Convert 0..1 to -1..+1
      this.lastDir = dir;
      // At endpoints, reset to exact value
      if (isEndpoint) {
        this.currentP = targetP <= ENDPOINT_THRESHOLD ? 0 : 1;
        this.estimatedPosition = this.currentP * 2 - 1;
      }
      this.isRunning = false;
      return { success: true, direction, speedPct, durationMs };
    } catch (err) {
      this.isRunning = false;
      throw err;
    }
  }

  /**
   * Read sensor values (not applicable for most continuous servos)
   */
  async readSensors() {
    return {
      estimatedPosition: this.estimatedPosition,
      isRunning: this.isRunning
    };
  }
}
