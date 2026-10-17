/**
 * Open-loop actuator default speed (motion.defaultSpeedPct).
 *
 * The calibration page's Home and Go send no speed. A door that only moves usefully
 * near full power was homed at a hardcoded 50%, where its stroke outlasted the
 * driver's per-drive cap and Home stopped halfway. A profile's defaultSpeedPct now
 * sets the speed for such calls; without it the old 50% stands.
 */
import { expect } from 'chai';
import hardwareService from '../../services/hardwareService/index.js';
import { OpenLoopLinearAdapter } from '../../server/calibration/adapters/OpenLoopLinearAdapter.js';

describe('open-loop actuator default speed', () => {
    let calls;
    let original;
    beforeEach(() => {
        calls = [];
        original = hardwareService.controlPart;
        hardwareService.controlPart = async (partId, action, params) => { calls.push({ action, ...params }); return { success: true }; };
    });
    afterEach(() => { hardwareService.controlPart = original; });

    const motion95 = { type: 'time-at-speed', bins: [{ pwmPct: 50, unitsPerSec: 1 / 30 }, { pwmPct: 95, unitsPerSec: 1 / 15 }], settleMs: 1, defaultSpeedPct: 95 };

    it('Home and Go with no speed use the profile default, timed by its own bin', async () => {
        const a = new OpenLoopLinearAdapter(4, motion95, false, 0.5);
        await a.home('retract');
        expect(calls[0].speed).to.equal(95);
        expect(calls[0].duration).to.equal(Math.round(15000 * 1.5));
        await a.gotoNormalized(1);
        expect(calls[1].speed).to.equal(95);
        expect(calls[1].duration).to.equal(15000);
    });

    it('an explicit speed still wins, and a profile without the key keeps 50%', async () => {
        const a = new OpenLoopLinearAdapter(4, motion95, false, 0);
        await a.gotoNormalized(0.5, { speedPct: 50 });
        expect(calls[0].speed).to.equal(50);
        const b = new OpenLoopLinearAdapter(5, { type: 'time-at-speed', bins: [{ pwmPct: 50, unitsPerSec: 0.2 }], settleMs: 1 }, false, 0);
        expect(b.defaultSpeedPct).to.equal(50);
        await b.home('retract');
        expect(calls[1].speed).to.equal(50);
    });
});
