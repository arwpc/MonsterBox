/**
 * ContinuousServoAdapter.js
 * Adapter for continuous rotation servos (like GoBilda Stingray)
 * 
 * Continuous servos don't have absolute position feedback - they rotate
 * at a speed/direction until stopped. This adapter provides time-based
 * movement estimation with safety limits.
 */

import { runWrapper } from '../../../services/hardwareService/exec.js';

export default class ContinuousServoAdapter {
  /**
   * @param {number} partId - Part ID
   * @param {Object} motion - Motion config { defaultSpeedPct, defaultDurationMs }
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
    this.isRunning = false;
  }

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
   * Nudge the servo in a direction
   * @param {number} delta - Normalized delta (-1 to +1), positive = CW
   * @param {Object} opts - { speedPct, durationMs }
   */
  async nudge(delta, opts = {}) {
    const speedPct = opts.speedPct ?? this.motion.defaultSpeedPct ?? 30;
    const durationMs = opts.durationMs ?? this.motion.defaultDurationMs ?? 500;
    
    // Determine direction from delta sign
    let direction = delta > 0 ? 'cw' : 'ccw';
    direction = this.effectiveDirection(direction);
    
    // Scale duration by delta magnitude (optional, for fine control)
    const actualDuration = Math.round(Math.abs(delta) * durationMs);
    
    console.log(`ContinuousServoAdapter: nudge partId=${this.partId}, dir=${direction}, speed=${speedPct}%, duration=${actualDuration}ms`);
    
    try {
      this.isRunning = true;
      const args = ['rotate_continuous_pca', String(this.channel), direction, String(speedPct), String(actualDuration)];
      if (this.address !== 64) {
        args.push(String(this.address));
      }
      
      await runWrapper('servo_cli.py', args, { timeoutMs: actualDuration + 5000 });
      
      // Update estimated position (rough tracking)
      const positionDelta = (direction === 'cw' ? 1 : -1) * (actualDuration / 1000) * (speedPct / 100);
      this.estimatedPosition = Math.max(-1, Math.min(1, this.estimatedPosition + positionDelta * 0.1));
      
      this.isRunning = false;
      return { success: true, direction, speedPct, durationMs: actualDuration };
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
    const durationMs = Math.min(maxDuration, Math.round(Math.abs(delta) * 4000)); // ~4 seconds for full range
    
    return this.nudge(delta > 0 ? 1 : -1, { speedPct, durationMs });
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
