// Motion planner (JS runtime)

let globalSpeedCap = 1.0;
export function setGlobalSpeedCap(pct) { globalSpeedCap = Math.max(0, Math.min(1, pct)); }
export function getGlobalSpeedCap() { return globalSpeedCap; }

export function clampP(p, bounds) {
  let v = Math.max(0, Math.min(1, p));
  if (bounds && typeof bounds.minP === 'number' && typeof bounds.maxP === 'number') {
    v = Math.max(bounds.minP, Math.min(bounds.maxP, v));
  }
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
