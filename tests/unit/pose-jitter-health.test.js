/**
 * Unit tests for per-pose jitter, pose health, and distance-weighted selection.
 *
 * The load-bearing property here is the first describe block: jitter exists to make
 * a pose land differently every time, and the only way that feature hurts anything
 * is if a random offset walks a servo past a limit somebody measured. It is fuzzed
 * rather than spot-checked for that reason.
 *
 * Nothing here hardcodes a character. Where a test needs a quarantined part it
 * discovers one from config/hardware-safety.json and skips if the fleet has none.
 */

import { expect } from 'chai';
import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';

import {
    MAX_JITTER_DEG,
    clampIntoWindow,
    jitterWithinWindow,
    applyPoseJitter,
    readPartAngle,
    JITTER_APPLIED
} from '../../services/poses/poseBounds.js';

import {
    HEALTH,
    evaluatePoseHealth,
    isPerformable
} from '../../services/poses/poseHealth.js';

import {
    poseAngles,
    poseDistance,
    distanceFactor
} from '../../services/movement/poseLibrary.js';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const REPO_ROOT = path.resolve(__dirname, '../..');

function readSafetyConfig() {
    try {
        return JSON.parse(fs.readFileSync(path.join(REPO_ROOT, 'config', 'hardware-safety.json'), 'utf8'));
    } catch (_) {
        return {};
    }
}

/** First (characterId, partId) in the fleet with blockAllMotion set, or null. */
function findQuarantinedPart() {
    const cfg = readSafetyConfig();
    for (const [charId, charCfg] of Object.entries(cfg.characters || {})) {
        for (const [partId, partCfg] of Object.entries((charCfg && charCfg.parts) || {})) {
            if (partCfg && partCfg.blockAllMotion) {
                return { charId, partId, blockReason: partCfg.blockReason || null };
            }
        }
    }
    return null;
}

/** First (characterId, partId) with a configured angle window, or null. */
function findBoundedServo() {
    const cfg = readSafetyConfig();
    for (const [charId, charCfg] of Object.entries(cfg.characters || {})) {
        for (const [partId, partCfg] of Object.entries((charCfg && charCfg.parts) || {})) {
            if (partCfg && !partCfg.blockAllMotion &&
                partCfg.minAngle != null && partCfg.maxAngle != null) {
                return { charId, partId, minAngle: partCfg.minAngle, maxAngle: partCfg.maxAngle };
            }
        }
    }
    return null;
}


describe('poseBounds — jitter is bounded by the calibrated window', function () {
    // Fuzzing plus real calibration-store reads; the 2s default is not enough.
    this.timeout(15000);

    describe('clampIntoWindow', function () {
        it('clamps to both bounds', function () {
            expect(clampIntoWindow(10, 60, 120)).to.equal(60);
            expect(clampIntoWindow(200, 60, 120)).to.equal(120);
            expect(clampIntoWindow(90, 60, 120)).to.equal(90);
        });

        it('treats a null bound as unknown, not as zero', function () {
            expect(clampIntoWindow(500, null, null)).to.equal(500);
            expect(clampIntoWindow(-40, null, 120)).to.equal(-40);
            expect(clampIntoWindow(500, 60, null)).to.equal(500);
        });
    });

    describe('jitterWithinWindow', function () {
        it('never leaves the window, anywhere in it, over many samples', function () {
            const lo = 60, hi = 120;
            const violations = [];
            // Asserted once at the end rather than per sample: 20k chai assertions
            // cost more than the fuzzing does and push the unit suite over its timeout.
            for (const base of [60, 60.5, 61, 75, 90, 105, 119, 119.5, 120]) {
                for (let i = 0; i < 2000; i++) {
                    const value = jitterWithinWindow(base, 5, lo, hi);
                    if (!(value >= lo && value <= hi)) violations.push({ base, value });
                }
            }
            expect(violations, `jitter left the window: ${JSON.stringify(violations.slice(0, 5))}`)
                .to.have.length(0);
        });

        it('only moves inward when the base sits on a bound', function () {
            // At the ceiling every draw must be <= the ceiling, and the extreme
            // draw must go DOWN — the amplitude is spent on the side with room.
            expect(jitterWithinWindow(120, 5, 60, 120, () => 0)).to.equal(115);
            expect(jitterWithinWindow(120, 5, 60, 120, () => 0.999)).to.equal(120);
            expect(jitterWithinWindow(60, 5, 60, 120, () => 0)).to.equal(60);
            expect(jitterWithinWindow(60, 5, 60, 120, () => 0.999)).to.equal(65);
        });

        it('shrinks the amplitude to the headroom available near a bound', function () {
            // 2 degrees from the ceiling: the upward half of a 5 degree jitter is
            // cut to 2, and the downward half stays at 5.
            expect(jitterWithinWindow(118, 5, 60, 120, () => 0.999)).to.be.at.most(120);
            expect(jitterWithinWindow(118, 5, 60, 120, () => 0)).to.equal(113);
        });

        it('applies no jitter at all when neither bound is known', function () {
            // An unmeasured part has no number proving an offset is safe.
            expect(jitterWithinWindow(90, 5, null, null, () => 0)).to.equal(90);
            expect(jitterWithinWindow(90, 5, null, null, () => 0.999)).to.equal(90);
        });

        it('applies one-sided jitter when only one bound is known', function () {
            expect(jitterWithinWindow(90, 5, null, 120, () => 0)).to.equal(90);
            expect(jitterWithinWindow(90, 5, null, 120, () => 0.999)).to.equal(95);
            expect(jitterWithinWindow(90, 5, 60, null, () => 0)).to.equal(85);
            expect(jitterWithinWindow(90, 5, 60, null, () => 0.999)).to.equal(90);
        });

        it('clamps a base that is already outside the window before jittering', function () {
            expect(jitterWithinWindow(200, 5, 60, 120, () => 0.999)).to.equal(120);
            expect(jitterWithinWindow(0, 5, 60, 120, () => 0)).to.equal(60);
        });

        it('caps the requested amplitude at MAX_JITTER_DEG', function () {
            const low = jitterWithinWindow(90, 999, 0, 180, () => 0);
            const high = jitterWithinWindow(90, 999, 0, 180, () => 0.999);
            expect(90 - low).to.equal(MAX_JITTER_DEG);
            expect(high - 90).to.be.at.most(MAX_JITTER_DEG);
        });

        it('is a no-op for zero, negative, or non-numeric jitter', function () {
            expect(jitterWithinWindow(90, 0, 60, 120)).to.equal(90);
            expect(jitterWithinWindow(90, -5, 60, 120)).to.equal(90);
            expect(jitterWithinWindow(90, undefined, 60, 120)).to.equal(90);
            expect(jitterWithinWindow(90, 'abc', 60, 120)).to.equal(90);
        });
    });

    describe('readPartAngle', function () {
        it('reads all three spellings in use across the codebase', function () {
            expect(readPartAngle({ target: { angleDeg: 90 } })).to.equal(90);
            expect(readPartAngle({ value: 45 })).to.equal(45);
            expect(readPartAngle({ angleDeg: 30 })).to.equal(30);
            expect(readPartAngle({ target: { state: 'on' } })).to.be.null;
            expect(readPartAngle(null)).to.be.null;
        });
    });

    describe('applyPoseJitter', function () {
        const bounded = findBoundedServo();

        it('leaves non-angular parts untouched', async function () {
            const pose = {
                id: 1, name: 'lamp', jitterDeg: 3,
                parts: [{ partId: 999999, type: 'light', target: { state: 'on', brightness: 100 } }]
            };
            const result = await applyPoseJitter(pose, 999999);
            expect(result.applied).to.have.length(0);
            expect(result.pose.parts[0].target.state).to.equal('on');
        });

        it('does not jitter a part with no known window', async function () {
            const pose = {
                id: 1, name: 'unknown part', jitterDeg: 3,
                parts: [{ partId: 987654, type: 'servo', target: { angleDeg: 90 } }]
            };
            const result = await applyPoseJitter(pose, 999999);
            expect(result.applied).to.have.length(0);
            expect(result.pose.parts[0].target.angleDeg).to.equal(90);
        });

        it('is a no-op when the pose declares no jitter', async function () {
            if (!bounded) return this.skip();
            const mid = Math.round((bounded.minAngle + bounded.maxAngle) / 2);
            const pose = {
                id: 1, name: 'no jitter',
                parts: [{ partId: Number(bounded.partId), type: 'servo', target: { angleDeg: mid } }]
            };
            const result = await applyPoseJitter(pose, bounded.charId);
            expect(result.applied).to.have.length(0);
            expect(result.pose.parts[0].target.angleDeg).to.equal(mid);
        });

        it('jitters inside the configured window and never outside it', async function () {
            if (!bounded) return this.skip();
            const mid = Math.round((bounded.minAngle + bounded.maxAngle) / 2);
            for (let i = 0; i < 200; i++) {
                const pose = {
                    id: 1, name: 'jitter', jitterDeg: 4,
                    parts: [{ partId: Number(bounded.partId), type: 'servo', target: { angleDeg: mid } }]
                };
                const result = await applyPoseJitter(pose, bounded.charId);
                const angle = result.pose.parts[0].target.angleDeg;
                expect(angle).to.be.at.least(bounded.minAngle);
                expect(angle).to.be.at.most(bounded.maxAngle);
                expect(Math.abs(angle - mid)).to.be.at.most(4);
            }
        });

        it('does not mutate the pose it was given', async function () {
            if (!bounded) return this.skip();
            const mid = Math.round((bounded.minAngle + bounded.maxAngle) / 2);
            const pose = {
                id: 1, name: 'jitter', jitterDeg: 4,
                parts: [{ partId: Number(bounded.partId), type: 'servo', target: { angleDeg: mid } }]
            };
            await applyPoseJitter(pose, bounded.charId);
            expect(pose.parts[0].target.angleDeg).to.equal(mid);
        });

        it('refuses to apply jitter twice to the same runtime pose', async function () {
            if (!bounded) return this.skip();
            const mid = Math.round((bounded.minAngle + bounded.maxAngle) / 2);
            const pose = {
                id: 1, name: 'jitter', jitterDeg: 4,
                parts: [{ partId: Number(bounded.partId), type: 'servo', target: { angleDeg: mid } }]
            };
            const once = await applyPoseJitter(pose, bounded.charId);
            expect(once.pose[JITTER_APPLIED]).to.be.true;
            const twice = await applyPoseJitter(once.pose, bounded.charId);
            expect(twice.applied).to.have.length(0);
            expect(twice.pose.parts[0].target.angleDeg)
                .to.equal(once.pose.parts[0].target.angleDeg);
        });

        it('honours a per-part jitterDeg over the pose-level value', async function () {
            if (!bounded) return this.skip();
            const mid = Math.round((bounded.minAngle + bounded.maxAngle) / 2);
            const pose = {
                id: 1, name: 'jitter', jitterDeg: 10,
                parts: [{ partId: Number(bounded.partId), type: 'servo', jitterDeg: 0, target: { angleDeg: mid } }]
            };
            const result = await applyPoseJitter(pose, bounded.charId);
            expect(result.applied).to.have.length(0);
            expect(result.pose.parts[0].target.angleDeg).to.equal(mid);
        });
    });
});


describe('poseHealth — classification at load', function () {
    const quarantined = findQuarantinedPart();

    it('reports a pose with no parts as blocked', async function () {
        const health = await evaluatePoseHealth(999999, { id: 1, name: 'empty', parts: [] });
        expect(health.status).to.equal(HEALTH.BLOCKED);
        expect(health.reasons[0].code).to.equal('no-parts');
    });

    it('blocks a pose referencing a part the character does not have', async function () {
        const health = await evaluatePoseHealth(999999, {
            id: 1, name: 'ghost',
            parts: [{ partId: 987654, type: 'servo', target: { angleDeg: 90 } }]
        });
        expect(health.status).to.equal(HEALTH.BLOCKED);
        expect(health.reasons.map(r => r.code)).to.include('missing-part');
    });

    it('blocks a pose that uses a quarantined part and carries blockReason verbatim', async function () {
        if (!quarantined) return this.skip();
        const health = await evaluatePoseHealth(quarantined.charId, {
            id: 1, name: 'uses quarantined part',
            parts: [{ partId: Number(quarantined.partId), type: 'servo', target: { angleDeg: 90 } }]
        });
        expect(health.status).to.equal(HEALTH.BLOCKED);
        const reason = health.reasons.find(r => r.code === 'quarantined');
        expect(reason, 'expected a quarantined reason').to.exist;
        // Verbatim: the text names the physical step needed to clear the block.
        expect(reason.blockReason).to.equal(quarantined.blockReason);
        expect(health.blockedParts.map(String)).to.include(String(quarantined.partId));
    });

    it('isPerformable is false only for blocked poses', function () {
        expect(isPerformable({ health: { status: HEALTH.OK } })).to.be.true;
        expect(isPerformable({ health: { status: HEALTH.DEGRADED } })).to.be.true;
        expect(isPerformable({ health: { status: HEALTH.BLOCKED } })).to.be.false;
        expect(isPerformable({})).to.be.true;
    });

    it('every real character library annotates without throwing', async function () {
        const registry = JSON.parse(fs.readFileSync(path.join(REPO_ROOT, 'data', 'characters.json'), 'utf8'));
        for (const character of registry) {
            const file = path.join(REPO_ROOT, 'data', `character-${character.id}`, 'poses.json');
            if (!fs.existsSync(file)) continue;
            const poses = JSON.parse(fs.readFileSync(file, 'utf8')).poses || [];
            for (const pose of poses) {
                const health = await evaluatePoseHealth(character.id, pose);
                expect(health.status, `character ${character.id} pose ${pose.id}`)
                    .to.be.oneOf([HEALTH.OK, HEALTH.DEGRADED, HEALTH.BLOCKED]);
            }
        }
    });
});


describe('poseLibrary — distance-weighted selection', function () {

    describe('poseAngles', function () {
        it('collects angular parts only, keyed by string id', function () {
            const angles = poseAngles({
                parts: [
                    { partId: 15, type: 'servo', target: { angleDeg: 99 } },
                    { partId: 8, type: 'light', target: { state: 'on' } }
                ]
            });
            expect(angles).to.deep.equal({ 15: 99 });
        });

        it('returns an empty map for a pose with no parts', function () {
            expect(poseAngles({})).to.deep.equal({});
            expect(poseAngles(null)).to.deep.equal({});
        });
    });

    describe('poseDistance', function () {
        it('is the mean absolute travel over shared parts', function () {
            const distance = poseDistance({ 15: 60, 4: 90 }, {
                parts: [
                    { partId: 15, target: { angleDeg: 80 } },
                    { partId: 4, target: { angleDeg: 100 } }
                ]
            });
            expect(distance).to.equal(15); // (20 + 10) / 2
        });

        it('is null — not zero — when nothing is shared', function () {
            const distance = poseDistance({ 15: 60 }, {
                parts: [{ partId: 99, target: { angleDeg: 80 } }]
            });
            expect(distance).to.be.null;
        });

        it('is null when there is no current position yet', function () {
            expect(poseDistance(null, { parts: [{ partId: 15, target: { angleDeg: 80 } }] })).to.be.null;
        });
    });

    describe('distanceFactor', function () {
        it('is zero for no movement, so a hold is never spent going nowhere', function () {
            expect(distanceFactor(0)).to.equal(0);
        });

        it('decreases monotonically once past the minimum meaningful move', function () {
            const samples = [6, 12, 20, 30, 45, 60].map(d => distanceFactor(d));
            for (let i = 1; i < samples.length; i++) {
                expect(samples[i], `factor at index ${i}`).to.be.below(samples[i - 1]);
            }
        });

        it('penalises an extreme swing far more than a modest one', function () {
            // This is the windshield-wiper case: end-to-end travel must be rare.
            expect(distanceFactor(56)).to.be.below(distanceFactor(12) / 5);
        });

        it('does not bias selection when the distance is unknown', function () {
            expect(distanceFactor(null)).to.equal(1);
        });

        it('honours configured tuning', function () {
            expect(distanceFactor(10, { halfWeightDeg: 10, minMoveDeg: 0 })).to.be.closeTo(0.5, 1e-9);
        });
    });
});
