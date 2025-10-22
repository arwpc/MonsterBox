import hardwareService from '../../../services/hardwareService/index.js';

const NUDGE_SCALES = { fine: 0.01, med: 0.05, coarse: 0.15 };

export class OpenLoopLinearAdapter {
  constructor(partId, motion, invert = false, initialP = 0.5) {
    this.partId = partId;
    this.invert = invert;
    this.currentP = initialP;
    this.lastDir = undefined;
    this.motion = motion || { type: 'time-at-speed', bins: [{ pwmPct: 50, unitsPerSec: 0.2 }], settleMs: 120 };
    this.reversalCompensationBeta = 0;
  }

  getCapabilities() { return { kind: 'openloop-linear', invert: this.invert }; }

  selectBin(requestedPwmPct) {
    const candidates = (this.motion.bins || []).filter(b => b.pwmPct <= requestedPwmPct).sort((a,b)=>b.pwmPct-a.pwmPct);
    return candidates[0] || (this.motion.bins && this.motion.bins[0]) || { pwmPct: 50, unitsPerSec: 0.2 };
  }

  calculateMoveTime(deltaP, pwmPct) { const bin = this.selectBin(pwmPct); const timeMs = (Math.abs(deltaP) / bin.unitsPerSec) * 1000 + (this.motion.settleMs || 120); return Math.max(100, timeMs); }

  async nudge(dir, scale) { const delta = NUDGE_SCALES[scale] || NUDGE_SCALES.med; const newP = dir === 'max' ? Math.min(1, this.currentP + delta) : Math.max(0, this.currentP - delta); await this.gotoNormalized(newP, { speedPct: 50 }); }

  async stop() { try { await hardwareService.controlPart(String(this.partId), 'stop', {}); } catch (err) { console.error('OpenLoopLinearAdapter stop failed', err); } }

  async gotoNormalized(p, opts) {
    const clampedP = Math.max(0, Math.min(1, p));
    const deltaP = clampedP - this.currentP;
    if (Math.abs(deltaP) < 0.001) return;
    const direction = deltaP > 0 ? 'extend' : 'retract';
    const currentDir = deltaP > 0 ? 'max' : 'min';
    let compensatedDelta = Math.abs(deltaP);
    if (this.lastDir && this.lastDir !== currentDir && this.reversalCompensationBeta > 0) compensatedDelta += this.reversalCompensationBeta;
    const speedPct = (opts && opts.speedPct) || 50;
    const duration = (opts && opts.timeoutMs) || this.calculateMoveTime(compensatedDelta, speedPct);
    try {
      await hardwareService.controlPart(String(this.partId), 'jog', { direction, speed: speedPct, duration });
      this.currentP = clampedP;
      this.lastDir = currentDir;
    } catch (err) { console.error('OpenLoopLinearAdapter goto failed', err); throw err; }
  }

  updateMotion(motion) { this.motion = motion; }
  setReversalCompensation(beta) { this.reversalCompensationBeta = Math.max(0, beta); }
}

export default OpenLoopLinearAdapter;