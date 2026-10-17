/**
 * Idle loop ↔ head tracking hand-off.
 *
 * With nobody in view, head tracking yields the pan servo to the idle loop when
 * the idle library has poses for that servo (wantsPart). The answer must be
 * scoped to the character the loop is running for, and false when it is stopped,
 * so a node with no authored head poses keeps its scan sweep.
 */
import { expect } from 'chai';
import { getIdlePoses, poseAngles } from '../../services/movement/poseLibrary.js';
import idleLoop, { wantsPart } from '../../services/movement/idleLoopService.js';

async function firstIdleServo(characterId) {
    const poses = await getIdlePoses(characterId);
    for (const pose of poses) {
        const ids = Object.keys(poseAngles(pose));
        if (ids.length > 0) return ids[0];
    }
    return null;
}

describe('idle loop wantsPart (head tracking hand-off)', () => {
    let characterId = null;
    let servoId = null;

    before(async () => {
        // Any repo character with an angular idle pose will do; none is assumed.
        for (const id of [1, 2, 3, 4, 5, 6, 7]) {
            try {
                servoId = await firstIdleServo(id);
            } catch (_) { servoId = null; }
            if (servoId) { characterId = id; break; }
        }
    });

    afterEach(() => idleLoop.stop());

    it('is false while the idle loop is stopped', async () => {
        idleLoop.stop();
        expect(await wantsPart(characterId ?? 1, servoId ?? '1')).to.equal(false);
    });

    it('is true for a servo in the running character\'s idle poses, and only for that character', async function () {
        if (!characterId) this.skip();
        await idleLoop.start(characterId);
        expect(await wantsPart(characterId, servoId)).to.equal(true);
        expect(await wantsPart(Number(characterId) + 100, servoId)).to.equal(false);
        expect(await wantsPart(characterId, 'no-such-part')).to.equal(false);
    });
});
