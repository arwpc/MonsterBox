import hardwareService from '../../../services/hardwareService/index.js';

const NUDGE_SCALES = { fine: 0.01, med: 0.05, coarse: 0.15 };

export class AbsoluteServoAdapter {
  constructor(partId, usMin = 500, usMax = 2500, invert = false) {
    this.partId = partId;
    this.usMin = usMin;
    this.usMax = usMax;
    this.invert = invert;
    this.currentP = 0.5;
  }

  getCapabilities() { return { kind: 'absolute-servo', usMin: this.usMin, usMax: this.usMax, invert: this.invert }; }

  pToUs(p) { const effP = this.invert ? (1 - p) : p; return this.usMin + effP * (this.usMax - this.usMin); }

  async nudge(dir, scale) {
    const delta = NUDGE_SCALES[scale] || NUDGE_SCALES.med;
    const newP = dir === 'max' ? Math.min(1, this.currentP + delta) : Math.max(0, this.currentP - delta);
    await this.gotoNormalized(newP);
  }

  async stop() { await this.gotoNormalized(this.currentP); }

  async gotoNormalized(p, opts) {
    const clampedP = Math.max(0, Math.min(1, p));
    const angleDeg = clampedP * 180;
    try {
      await hardwareService.controlPart(String(this.partId), 'moveToAngle', { angleDeg, duration: (opts && opts.timeoutMs) || 1000 });
      this.currentP = clampedP;
    } catch (err) {
      console.error('AbsoluteServoAdapter move failed', err);
      throw err;
    }
  }
}

export default AbsoluteServoAdapter;