/**
 * Head-tracking drive-window reconciliation.
 *
 * The knight's head was calibrated in real degrees (323–491°) while its saved
 * head-tracking config still said centerDeg 90 / rangeDeg 120 — a window from
 * a pre-calibration era. Clamping every command into that disjoint window
 * pinned the head at the 323° endstop: it "moved the servo" exactly once and
 * looked dead thereafter. effectiveDriveWindow() snaps a disjoint configured
 * window to the measured one instead of pinning.
 */

import { expect } from 'chai';
import { effectiveDriveWindow } from '../../controllers/motionTrackingController.js';

describe('effectiveDriveWindow', function () {
    const knightWindow = { minAngle: 323, maxAngle: 491 };

    it('keeps a configured window that fits inside the calibrated one', function () {
        const win = effectiveDriveWindow(390, 100, knightWindow);
        expect(win.snapped).to.equal(false);
        expect(win.center).to.equal(390);
        expect(win.min).to.equal(340);
        expect(win.max).to.equal(440);
        expect(win.range).to.equal(100);
    });

    it('intersects a configured window that partially overlaps', function () {
        const win = effectiveDriveWindow(330, 100, knightWindow);
        expect(win.snapped).to.equal(false);
        expect(win.min).to.equal(323);   // clipped by calibration floor
        expect(win.max).to.equal(380);
    });

    it('snaps a stale disjoint window (the pinned-head bug) to the calibrated one', function () {
        // centerDeg 90 / rangeDeg 120 → [30..150], entirely below 323–491
        const win = effectiveDriveWindow(90, 120, knightWindow);
        expect(win.snapped).to.equal(true);
        expect(win.center).to.equal(407);              // window midpoint
        expect(win.min).to.equal(323);
        expect(win.max).to.equal(491);
        expect(win.range).to.equal((491 - 323) / 2);   // half-span drive range
    });

    it('snaps a window entirely above the calibrated one too', function () {
        const win = effectiveDriveWindow(700, 60, knightWindow);
        expect(win.snapped).to.equal(true);
        expect(win.min).to.equal(323);
        expect(win.max).to.equal(491);
    });

    it('defaults center/range when the config carries junk', function () {
        const win = effectiveDriveWindow(undefined, -5, { minAngle: 0, maxAngle: 180 });
        // defaults: center 0, range 60 → [-30..30] ∩ [0..180] = [0..30]
        expect(win.snapped).to.equal(false);
        expect(win.min).to.equal(0);
        expect(win.max).to.equal(30);
    });

    it('a standard 0–180 servo with the default config never snaps', function () {
        const win = effectiveDriveWindow(90, 60, { minAngle: 10, maxAngle: 170 });
        expect(win.snapped).to.equal(false);
        expect(win.min).to.equal(60);
        expect(win.max).to.equal(120);
    });
});
