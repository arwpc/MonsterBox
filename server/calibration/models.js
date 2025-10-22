// Runtime-friendly minimal models file (JS)
// This file contains helper constructors/comments; the authoritative types remain in models.ts

export function clampP(p, bounds) {
  return Math.max(bounds.minP, Math.min(bounds.maxP, p));
}

export default { clampP };
