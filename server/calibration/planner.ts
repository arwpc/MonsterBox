/**
 * Motion Planner for Unified Calibration System
 * Handles direct-map and time-at-speed motion planning with safety constraints
 */

import type {
  CalibrationProfile,
  MotionModel,
  CalibrationBounds,
  MotionCommand
} from './models.js';

export interface PlanResult {
  valid: boolean;
  clampedP: number;
  estimatedTimeMs: number;
  speedPct: number;
  error?: string;
}

/**
 * Global speed cap (safety limit)
 */
let globalSpeedCap = 100; // Percentage

export function setGlobalSpeedCap(pct: number): void {
  globalSpeedCap = Math.max(0, Math.min(100, pct));
}

export function getGlobalSpeedCap(): number {
  return globalSpeedCap;
}

/**
 * Clamp position to calibration bounds
 */
export function clampP(p: number, bounds: CalibrationBounds): number {
  return Math.max(bounds.minP, Math.min(bounds.maxP, p));
}

/**
 * Plan direct-map motion (servos/steppers)
 * Position maps directly to hardware units
 */
export function planDirectMap(
  profile: CalibrationProfile,
  command: MotionCommand
): PlanResult {
  const { bounds, motion, safety } = profile;

  if (motion.type !== 'direct-map') {
    return { valid: false, clampedP: 0, estimatedTimeMs: 0, speedPct: 0, error: 'Not a direct-map motion model' };
  }

  // Clamp target position to bounds
  const clampedP = clampP(command.targetP, bounds);

  // Apply speed constraints
  let speedPct = command.speedPct || 100;
  speedPct = Math.min(speedPct, globalSpeedCap);
  if (safety?.maxDutyPct) {
    speedPct = Math.min(speedPct, safety.maxDutyPct);
  }

  // Estimate time based on movement distance
  // Servos typically take 60ms per 60° at full speed
  const distance = Math.abs(clampedP - 0.5); // Normalized distance from center
  const baseTimeMs = 200 + distance * 800; // 200ms base + up to 800ms for full range
  const estimatedTimeMs = baseTimeMs * (100 / speedPct);

  return {
    valid: true,
    clampedP,
    estimatedTimeMs: Math.round(estimatedTimeMs),
    speedPct
  };
}

/**
 * Plan time-at-speed motion (open-loop/DC motors)
 * Position estimated by running for calculated time
 */
export function planTimeAtSpeed(
  profile: CalibrationProfile,
  command: MotionCommand,
  currentP: number = 0.5,
  lastDir?: 'min' | 'max'
): PlanResult {
  const { bounds, motion, safety } = profile;

  if (motion.type !== 'time-at-speed') {
    return { valid: false, clampedP: 0, estimatedTimeMs: 0, speedPct: 0, error: 'Not a time-at-speed motion model' };
  }

  // Clamp target position
  const clampedP = clampP(command.targetP, bounds);
  const deltaP = clampedP - currentP;

  if (Math.abs(deltaP) < 0.001) {
    return { valid: true, clampedP, estimatedTimeMs: 0, speedPct: 0 }; // Already at target
  }

  // Determine direction
  const targetDir: 'min' | 'max' = deltaP > 0 ? 'max' : 'min';

  // Apply speed constraints
  let speedPct = command.speedPct || 50; // Default to 50% for open-loop
  speedPct = Math.min(speedPct, globalSpeedCap);
  if (safety?.maxDutyPct) {
    speedPct = Math.min(speedPct, safety.maxDutyPct);
  }

  // Select appropriate speed bin
  const bin = motion.bins
    .filter(b => b.pwmPct <= speedPct)
    .sort((a, b) => b.pwmPct - a.pwmPct)[0] || motion.bins[0];

  if (!bin) {
    return { valid: false, clampedP, estimatedTimeMs: 0, speedPct: 0, error: 'No valid speed bin' };
  }

  // Calculate time
  let compensatedDelta = Math.abs(deltaP);
  
  // Add reversal compensation if direction changed (default β = 0.02)
  const reversalBeta = 0.02;
  if (lastDir && lastDir !== targetDir) {
    compensatedDelta += reversalBeta;
  }

  const timeMs = (compensatedDelta / bin.unitsPerSec) * 1000 + motion.settleMs;
  const estimatedTimeMs = Math.max(100, Math.round(timeMs));

  return {
    valid: true,
    clampedP,
    estimatedTimeMs,
    speedPct: bin.pwmPct
  };
}

/**
 * Main motion planner entry point
 */
export function planMotion(
  profile: CalibrationProfile,
  command: MotionCommand,
  currentP?: number,
  lastDir?: 'min' | 'max'
): PlanResult {
  if (profile.motion.type === 'direct-map') {
    return planDirectMap(profile, command);
  } else if (profile.motion.type === 'time-at-speed') {
    return planTimeAtSpeed(profile, command, currentP, lastDir);
  } else {
    return {
      valid: false,
      clampedP: 0,
      estimatedTimeMs: 0,
      speedPct: 0,
      error: 'Unknown motion model type'
    };
  }
}

/**
 * Calculate timeout for a motion command
 * Returns predictedTime * 2 + 500ms
 */
export function calculateTimeout(estimatedTimeMs: number): number {
  return estimatedTimeMs * 2 + 500;
}

export default {
  setGlobalSpeedCap,
  getGlobalSpeedCap,
  clampP,
  planDirectMap,
  planTimeAtSpeed,
  planMotion,
  calculateTimeout
};
