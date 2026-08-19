// Motion planner (JS runtime)

import { readFileSync } from 'fs';
import fsp from 'fs/promises';
import path from 'path';
import { fileURLToPath } from 'url';

const __plannerDir = path.dirname(fileURLToPath(import.meta.url));
const SPEED_CAP_PATH = path.resolve(__plannerDir, '..', '..', 'data', 'motion-state.json');

// The floor is deliberately NOT zero. setGlobalSpeedCap used to clamp to [0,1],
// and the cap is applied as `msPerNorm / globalSpeedCap` — so a cap of 0 makes
// every planned move Infinity milliseconds long. An operator dragging a "speed
// cap" slider to 0 expects "don't move", not a move with an infinite timeout.
const MIN_SPEED_CAP = 0.05;

/**
 * The global motion speed governor.
 *
 * This is a SAFETY control: it exists so an operator who has just watched a part
 * slam can slow everything down immediately. It used to live only in this
 * module-level binding, so any restart — a crash, a deploy, `systemctl restart` —
 * silently returned it to 1.0, fully permissive, with no log line and nothing in
 * the UI to say the protection had lapsed. That is the same shape as the speaker
 * mute that survived only in RAM; a safety limit is the worst place for it.
 *
 * Persisted to node-local state (gitignored) and restored at module load, before
 * any motion can be planned.
 */
function loadSpeedCap() {
  try {
    const parsed = JSON.parse(readFileSync(SPEED_CAP_PATH, 'utf8') || '{}');
    const v = Number(parsed.globalSpeedCap);
    if (!Number.isFinite(v)) return 1.0;
    const clamped = Math.max(MIN_SPEED_CAP, Math.min(1, v));
    if (clamped < 1) console.log(`🐢 Global speed cap restored from disk: ${Math.round(clamped * 100)}%`);
    return clamped;
  } catch (_) {
    return 1.0;
  }
}

let globalSpeedCap = loadSpeedCap();

export function setGlobalSpeedCap(pct) {
  globalSpeedCap = Math.max(MIN_SPEED_CAP, Math.min(1, Number(pct)));
  // Fire-and-forget: the in-memory value governs this process; the file only has
  // to be right by the time the next one boots. Never let a failed write throw
  // inside a motion path.
  fsp.mkdir(path.dirname(SPEED_CAP_PATH), { recursive: true })
    .then(() => fsp.writeFile(SPEED_CAP_PATH, JSON.stringify({ globalSpeedCap, updatedAt: new Date().toISOString() }, null, 2)))
    .catch((e) => console.error('Failed to persist global speed cap:', e));
  return globalSpeedCap;
}

export function getGlobalSpeedCap() { return globalSpeedCap; }

export function clampP(p, bounds) {
  let v = Math.max(0, Math.min(1, p));
  if (bounds && typeof bounds.minP === 'number' && typeof bounds.maxP === 'number') {
    v = Math.max(bounds.minP, Math.min(bounds.maxP, v));
  }
  return v;
}

/**
 * Clamp an absolute-servo angle to its calibrated window.
 *
 * The angle paths used to clamp only to 0-180, so a calibrated part could be
 * driven well past the limits calibration had established for it — which for a
 * high-torque servo means holding against a mechanical stop and drawing stall
 * current. Bounds are honoured independently, so a profile that defines only one
 * side still constrains that side.
 */
export function clampAngle(angle, bounds) {
  let v = Math.max(0, Math.min(180, angle));
  if (bounds && typeof bounds.minAngle === 'number') v = Math.max(bounds.minAngle, v);
  if (bounds && typeof bounds.maxAngle === 'number') v = Math.min(bounds.maxAngle, v);
  return v;
}

export function planDirectMap(motionModel, fromP, toP) {
  const clampedToP = clampP(toP);
  const usMin = motionModel.usMin || 1000;
  const usMax = motionModel.usMax || 2000;
  const targetUs = usMin + (clampedToP * (usMax - usMin));
  return { targetUs, durationMs: 0 };
}

export function planTimeAtSpeed(motionModel, fromP, toP) {
  const clampedFromP = clampP(fromP);
  const clampedToP = clampP(toP);
  const deltaP = clampedToP - clampedFromP;

  if (Math.abs(deltaP) < 0.001) {
    return { durationMs: 0 };
  }

  const bins = motionModel.bins || [];
  const settleMs = motionModel.settleMs || 100;
  const beta = motionModel.reversalCompensationBeta || 0;
  const isReversal = (fromP > toP); // Moving backwards

  let totalMs = 0;
  let currentP = clampedFromP;
  const targetP = clampedToP;

  for (const bin of bins) {
    const binEnd = bin.pEnd || 1.0;
    const rate = bin.msPerNorm || 1000;

    if (targetP > currentP && currentP < binEnd) {
      // Moving forward through this bin
      const segmentEnd = Math.min(targetP, binEnd);
      const distance = segmentEnd - currentP;
      let effectiveRate = rate;
      if (isReversal) {
        effectiveRate = rate * (1 + beta);
      }
      effectiveRate = effectiveRate / globalSpeedCap;
      totalMs += distance * effectiveRate;
      currentP = segmentEnd;
    } else if (targetP < currentP && targetP < binEnd) {
      // Moving backward through this bin
      const distance = currentP - Math.max(targetP, 0);
      let effectiveRate = rate;
      effectiveRate = rate * (1 + beta); // Always apply reversal comp for backward
      effectiveRate = effectiveRate / globalSpeedCap;
      totalMs += distance * effectiveRate;
      currentP = Math.max(targetP, 0);
      break;
    }

    if (Math.abs(currentP - targetP) < 0.001) break;
  }

  // Return drive time and settle time separately.
  // driveMs = motor-on time, settleMs = post-movement mechanical damping delay.
  // durationMs kept for backward compat but now excludes settle (caller should wait).
  const driveMs = Math.round(totalMs);
  return { durationMs: driveMs, driveMs, settleMs };
}

export function planMotion(motionModel, fromP, toP) {
  if (!motionModel || !motionModel.type) {
    throw new Error('Unknown motion model type');
  }
  if (motionModel.type === 'direct-map') {
    return planDirectMap(motionModel, fromP, toP);
  }
  if (motionModel.type === 'time-at-speed') {
    return planTimeAtSpeed(motionModel, fromP, toP);
  }
  throw new Error('Unknown motion model type: ' + motionModel.type);
}

export function calculateTimeout(durationMs, margin = 2.0) {
  return Math.max(100, Math.round(durationMs * margin));
}

export default { setGlobalSpeedCap, getGlobalSpeedCap, clampP, planDirectMap, planTimeAtSpeed, planMotion, calculateTimeout };
