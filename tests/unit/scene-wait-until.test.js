/**
 * wait.untilMs waits until a point on the scene clock instead of for a span, so a
 * long beat-timed scene does not drift by the sum of its steps' own overheads.
 */
import { expect } from 'chai';
import { executeScene } from '../../services/scenes/sceneExecutor.js';

describe('scene wait.untilMs (scene clock)', () => {
    it('lands on the clock: spans before it are absorbed, not added', async function () {
        this.timeout(5000);
        const started = Date.now();
        const r = await executeScene({ id: 'clock-test', steps: [
            { type: 'wait', duration: 60 },
            { type: 'wait', untilMs: 150 },
            { type: 'wait', duration: 40 },
            { type: 'wait', untilMs: 220 }
        ] }, null, null, {});
        const took = Date.now() - started;
        expect(r.success).to.equal(true);
        expect(took).to.be.within(215, 300);
    });

    it('a point already passed does not wait at all', async function () {
        const started = Date.now();
        await executeScene({ id: 'clock-past', steps: [
            { type: 'wait', duration: 80 },
            { type: 'wait', untilMs: 10 }
        ] }, null, null, {});
        expect(Date.now() - started).to.be.below(160);
    });
});
