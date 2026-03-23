/**
 * Unit tests for the movement system (services/movement/).
 *
 * Covers: transitionEngine, servoCommandBuffer, priorityManager,
 *         movementTelemetry, and poseLibrary.
 *
 * Run with: npx mocha tests/unit/movement.test.js --exit
 */

import { expect } from 'chai';
import {
    EASING,
    STEP_INTERVAL_MS,
    transitionServo,
    transitionServos,
    computeTransitionAngles,
    precomputeAngles
} from '../../services/movement/transitionEngine.js';

import {
    queueCommand,
    flush,
    clear,
    getPending,
    startFlushLoop,
    stopFlushLoop,
    isFlushLoopRunning,
    queueTransitionSequence,
    getTransitionQueues
} from '../../services/movement/servoCommandBuffer.js';

import {
    PRIORITY,
    claimServo,
    releaseServo,
    releaseAll,
    getOwner,
    isAvailable,
    getActiveClaims
} from '../../services/movement/priorityManager.js';

import {
    record,
    getMetricSummary,
    getServoHealth,
    startAutoFlush,
    stopAutoFlush
} from '../../services/movement/movementTelemetry.js';


// ─── Transition Engine ───────────────────────────────────────────────────────

describe('transitionEngine', function () {
    this.timeout(10000);

    describe('EASING functions', function () {
        const names = ['linear', 'ease_in', 'ease_out', 'ease_in_out', 'overshoot', 'bounce'];

        for (const name of names) {
            it(`${name}(0) should return 0`, function () {
                expect(EASING[name](0)).to.equal(0);
            });

            it(`${name}(1) should return 1`, function () {
                expect(EASING[name](1)).to.equal(1);
            });
        }

        it('ease_in_out uses cosine for smooth velocity profile', function () {
            // ease_in_out(t) = 0.5 * (1 - cos(PI * t))
            const t = 0.5;
            const expected = 0.5 * (1 - Math.cos(Math.PI * t));
            expect(EASING.ease_in_out(t)).to.be.closeTo(expected, 1e-10);

            const t2 = 0.25;
            const expected2 = 0.5 * (1 - Math.cos(Math.PI * t2));
            expect(EASING.ease_in_out(t2)).to.be.closeTo(expected2, 1e-10);
        });

        it('overshoot goes above 1.0 mid-transition then settles to 1.0', function () {
            // Sample the curve at various points — some should exceed 1.0
            let foundAbove = false;
            for (let i = 1; i < 100; i++) {
                const t = i / 100;
                const val = EASING.overshoot(t);
                if (val > 1.0) {
                    foundAbove = true;
                }
            }
            expect(foundAbove).to.be.true;
            // Settles back at t=1
            expect(EASING.overshoot(1)).to.equal(1);
        });

        it('bounce(1) returns 1 and values stay in [0, 1]', function () {
            for (let i = 0; i <= 100; i++) {
                const t = i / 100;
                const val = EASING.bounce(t);
                expect(val).to.be.at.least(0);
                expect(val).to.be.at.most(1.001); // small float tolerance
            }
        });
    });

    describe('STEP_INTERVAL_MS', function () {
        it('should be 20 (50Hz)', function () {
            expect(STEP_INTERVAL_MS).to.equal(20);
        });
    });

    describe('precomputeAngles', function () {
        it('returns correct number of angles', function () {
            const angles = precomputeAngles(0, 180, 10, EASING.linear);
            expect(angles).to.have.length(10);
        });

        it('final angle always matches target (no off-by-one)', function () {
            const angles = precomputeAngles(10, 170, 25, EASING.ease_in_out);
            expect(angles[angles.length - 1]).to.equal(170);
        });

        it('final angle matches target for all easing functions', function () {
            for (const name of Object.keys(EASING)) {
                const angles = precomputeAngles(0, 90, 50, EASING[name]);
                expect(angles[angles.length - 1]).to.equal(90,
                    `${name}: final angle should be 90`);
            }
        });

        it('array length matches expected step count', function () {
            const totalSteps = 42;
            const angles = precomputeAngles(0, 180, totalSteps, EASING.linear);
            expect(angles).to.have.length(totalSteps);
        });

        it('position delta between consecutive steps is never > 2% of total range for ease_in_out', function () {
            const from = 0;
            const to = 180;
            const totalRange = to - from;
            const maxDelta = totalRange * 0.02;
            // Use at least 100 steps so the 2% constraint is meaningful
            const totalSteps = 100;
            const angles = precomputeAngles(from, to, totalSteps, EASING.ease_in_out);

            for (let i = 1; i < angles.length; i++) {
                const delta = Math.abs(angles[i] - angles[i - 1]);
                expect(delta).to.be.at.most(maxDelta + 1,
                    `Step ${i}: delta ${delta} exceeds 2% of range (${maxDelta}), allowing +1 for rounding`);
            }
        });
    });

    describe('computeTransitionAngles', function () {
        it('returns correct structure with angles, intervalMs, totalSteps', function () {
            const result = computeTransitionAngles(0, 90, 500);
            expect(result).to.have.property('angles').that.is.an('array');
            expect(result).to.have.property('intervalMs', STEP_INTERVAL_MS);
            expect(result).to.have.property('totalSteps').that.is.a('number');
            expect(result.angles).to.have.length(result.totalSteps);
        });

        it('zero-distance transition returns 1 step', function () {
            const result = computeTransitionAngles(90, 90, 500);
            expect(result.totalSteps).to.equal(1);
            expect(result.angles).to.deep.equal([90]);
        });

        it('angles array length matches totalSteps', function () {
            const result = computeTransitionAngles(10, 170, 1000, 'linear');
            expect(result.angles).to.have.length(result.totalSteps);
        });
    });

    describe('transitionServo', function () {
        it('returns correct structure with partId, angles array, and step count', async function () {
            const result = await transitionServo('servo1', 0, 90, 200, 'linear');
            expect(result).to.have.property('partId', 'servo1');
            expect(result).to.have.property('fromAngle', 0);
            expect(result).to.have.property('toAngle', 90);
            expect(result).to.have.property('actualDurationMs').that.is.a('number');
            expect(result).to.have.property('steps').that.is.a('number');
            expect(result).to.have.property('angles').that.is.an('array');
            expect(result.angles[result.angles.length - 1]).to.equal(90);
        });

        it('zero-distance transition returns immediately with 1 step', async function () {
            const result = await transitionServo('servo1', 45, 45, 500);
            expect(result.steps).to.equal(1);
            expect(result.actualDurationMs).to.equal(0);
            expect(result.angles).to.deep.equal([45]);
        });

        it('calls onStep callback with intermediate angles', async function () {
            const steps = [];
            await transitionServo('servo1', 0, 90, 100, 'linear', (angle) => {
                steps.push(angle);
            });
            // Should have starting angle + computed steps
            expect(steps.length).to.be.at.least(2);
            // First callback is the starting position (0)
            expect(steps[0]).to.equal(0);
            // Last callback should be 90
            expect(steps[steps.length - 1]).to.equal(90);
        });

        it('maxSpeedDegPerSec clamps duration upward', async function () {
            // 90 degrees at max 45 deg/sec = min 2000ms
            const result = await transitionServo('servo1', 0, 90, 100, 'linear', null, {
                maxSpeedDegPerSec: 45
            });
            expect(result.actualDurationMs).to.be.at.least(2000);
        });

        it('AbortSignal cancellation rejects with AbortError', async function () {
            const controller = new AbortController();
            // Abort immediately
            controller.abort();

            try {
                await transitionServo('servo1', 0, 90, 2000, 'linear', null, {
                    signal: controller.signal
                });
                expect.fail('Should have thrown');
            } catch (err) {
                expect(err.name).to.equal('AbortError');
            }
        });

        it('AbortSignal cancellation mid-transition rejects', async function () {
            const controller = new AbortController();
            // Abort after 50ms
            setTimeout(() => controller.abort(), 50);

            try {
                await transitionServo('servo1', 0, 180, 5000, 'linear', null, {
                    signal: controller.signal
                });
                expect.fail('Should have thrown');
            } catch (err) {
                expect(err.name).to.equal('AbortError');
            }
        });
    });

    describe('transitionServos (plural)', function () {
        it('runs multiple servos concurrently', async function () {
            const parts = [
                { partId: 'servo1', value: 90, currentValue: 0 },
                { partId: 'servo2', value: 45, currentValue: 0 }
            ];

            const results = await transitionServos('char1', parts, {
                durationMs: 100,
                easing: 'linear'
            });

            expect(results).to.have.length(2);
            expect(results[0]).to.have.property('partId', 'servo1');
            expect(results[0].toAngle).to.equal(90);
            expect(results[1]).to.have.property('partId', 'servo2');
            expect(results[1].toAngle).to.equal(45);
        });

        it('returns empty array for empty parts', async function () {
            const results = await transitionServos('char1', []);
            expect(results).to.deep.equal([]);
        });

        it('returns empty array for null parts', async function () {
            const results = await transitionServos('char1', null);
            expect(results).to.deep.equal([]);
        });

        it('AbortSignal cancels all concurrent transitions', async function () {
            const controller = new AbortController();
            controller.abort();

            const parts = [
                { partId: 'servo1', value: 90, currentValue: 0 },
                { partId: 'servo2', value: 45, currentValue: 0 }
            ];

            try {
                await transitionServos('char1', parts, {
                    durationMs: 5000,
                    signal: controller.signal
                });
                expect.fail('Should have thrown');
            } catch (err) {
                expect(err.name).to.equal('AbortError');
            }
        });
    });
});


// ─── Servo Command Buffer ────────────────────────────────────────────────────

describe('servoCommandBuffer', function () {
    this.timeout(5000);

    afterEach(function () {
        stopFlushLoop();
        clear();
    });

    describe('queueCommand and getPending', function () {
        it('stores a command and getPending returns it', function () {
            queueCommand('servo1', 90, 50);
            const pending = getPending();
            expect(pending.has('servo1')).to.be.true;
            expect(pending.get('servo1').angle).to.equal(90);
            expect(pending.get('servo1').priority).to.equal(50);
        });

        it('higher priority preempts lower', function () {
            queueCommand('servo1', 45, 10);
            queueCommand('servo1', 90, 50);
            const pending = getPending();
            expect(pending.get('servo1').angle).to.equal(90);
            expect(pending.get('servo1').priority).to.equal(50);
        });

        it('lower priority is rejected when higher exists', function () {
            queueCommand('servo1', 90, 50);
            queueCommand('servo1', 45, 10);
            const pending = getPending();
            // Should still be the original higher-priority command
            expect(pending.get('servo1').angle).to.equal(90);
            expect(pending.get('servo1').priority).to.equal(50);
        });

        it('equal priority replaces existing', function () {
            queueCommand('servo1', 45, 50);
            queueCommand('servo1', 90, 50);
            const pending = getPending();
            expect(pending.get('servo1').angle).to.equal(90);
        });
    });

    describe('flush', function () {
        it('sends commands to mock servoService', async function () {
            const moved = [];
            const mockServoService = {
                async moveToAngle(partId, angle) {
                    moved.push({ partId, angle });
                }
            };

            queueCommand('servo1', 90, 50);
            queueCommand('servo2', 45, 30);

            const result = await flush(mockServoService, 'test');
            expect(result.sent).to.equal(2);
            expect(result.errors).to.equal(0);
            expect(moved).to.have.length(2);

            // Verify commands were cleared
            const pending = getPending();
            expect(pending.size).to.equal(0);
        });

        it('handles servoService errors gracefully', async function () {
            const mockServoService = {
                async moveToAngle() {
                    throw new Error('Hardware fault');
                }
            };

            queueCommand('servo1', 90, 50);
            const result = await flush(mockServoService, 'test');
            expect(result.errors).to.equal(1);
            expect(result.sent).to.equal(0);
        });
    });

    describe('clear', function () {
        it('empties pending queue and transition queues', function () {
            queueCommand('servo1', 90, 50);
            queueTransitionSequence('servo2', [10, 20, 30], 30);

            clear();

            expect(getPending().size).to.equal(0);
            expect(getTransitionQueues().size).to.equal(0);
        });
    });

    describe('queueTransitionSequence', function () {
        it('stores multi-step sequence', function () {
            const angles = [10, 20, 30, 40, 50];
            queueTransitionSequence('servo1', angles, 30);

            const tq = getTransitionQueues();
            expect(tq.has('servo1')).to.be.true;
            expect(tq.get('servo1').angles).to.deep.equal(angles);
            expect(tq.get('servo1').index).to.equal(0);
        });

        it('immediately queues first angle as pending command', function () {
            queueTransitionSequence('servo1', [15, 30, 45], 30);
            const pending = getPending();
            expect(pending.has('servo1')).to.be.true;
            expect(pending.get('servo1').angle).to.equal(15);
        });

        it('rejects empty or non-array angles', function () {
            queueTransitionSequence('servo1', [], 30);
            expect(getTransitionQueues().has('servo1')).to.be.false;

            queueTransitionSequence('servo2', null, 30);
            expect(getTransitionQueues().has('servo2')).to.be.false;
        });

        it('transition sequences deliver one angle per flush advance', async function () {
            const moved = [];
            const mockServoService = {
                async moveToAngle(partId, angle) {
                    moved.push({ partId, angle });
                }
            };

            const angles = [10, 20, 30];
            queueTransitionSequence('servo1', angles, 30);

            // First flush sends the first angle (already queued by queueTransitionSequence)
            await flush(mockServoService, 'test');
            expect(moved.length).to.equal(1);
            expect(moved[0].angle).to.equal(10);
        });
    });

    describe('flush loop', function () {
        it('startFlushLoop / stopFlushLoop / isFlushLoopRunning', function () {
            const mockServoService = { async moveToAngle() {} };

            expect(isFlushLoopRunning()).to.be.false;
            startFlushLoop(mockServoService, 'test');
            expect(isFlushLoopRunning()).to.be.true;
            stopFlushLoop();
            expect(isFlushLoopRunning()).to.be.false;
        });
    });
});


// ─── Priority Manager ────────────────────────────────────────────────────────

describe('priorityManager', function () {

    afterEach(function () {
        // Clean up all claims
        const claims = getActiveClaims();
        for (const partId of Object.keys(claims)) {
            releaseServo(partId, claims[partId].owner);
        }
    });

    describe('PRIORITY constants', function () {
        it('defines all expected priority levels', function () {
            expect(PRIORITY).to.have.property('MICRO_MOVEMENT', 10);
            expect(PRIORITY).to.have.property('IDLE', 30);
            expect(PRIORITY).to.have.property('JAW', 70);
            expect(PRIORITY).to.have.property('HEAD_TRACKING', 80);
            expect(PRIORITY).to.have.property('SCENE', 100);
        });

        it('has correct hierarchy (SCENE > HEAD_TRACKING > JAW > IDLE > MICRO_MOVEMENT)', function () {
            expect(PRIORITY.SCENE).to.be.greaterThan(PRIORITY.HEAD_TRACKING);
            expect(PRIORITY.HEAD_TRACKING).to.be.greaterThan(PRIORITY.JAW);
            expect(PRIORITY.JAW).to.be.greaterThan(PRIORITY.IDLE);
            expect(PRIORITY.IDLE).to.be.greaterThan(PRIORITY.MICRO_MOVEMENT);
        });

        it('is frozen (immutable)', function () {
            expect(Object.isFrozen(PRIORITY)).to.be.true;
        });
    });

    describe('claimServo', function () {
        it('grants unclaimed servo', function () {
            const result = claimServo('servo1', 'idle', PRIORITY.IDLE);
            expect(result.granted).to.be.true;
            expect(result.previousOwner).to.be.null;
        });

        it('rejects lower priority claim', function () {
            claimServo('servo1', 'scene', PRIORITY.SCENE);
            const result = claimServo('servo1', 'idle', PRIORITY.IDLE);
            expect(result.granted).to.be.false;
            expect(result.previousOwner).to.equal('scene');
        });

        it('preempts with equal priority', function () {
            claimServo('servo1', 'jaw', PRIORITY.JAW);
            const result = claimServo('servo1', 'jaw2', PRIORITY.JAW);
            expect(result.granted).to.be.true;
            expect(result.previousOwner).to.equal('jaw');
        });

        it('preempts with higher priority', function () {
            claimServo('servo1', 'idle', PRIORITY.IDLE);
            const result = claimServo('servo1', 'scene', PRIORITY.SCENE);
            expect(result.granted).to.be.true;
            expect(result.previousOwner).to.equal('idle');
        });

        it('coerces partId to string', function () {
            claimServo(42, 'idle', PRIORITY.IDLE);
            const owner = getOwner('42');
            expect(owner).to.not.be.null;
            expect(owner.owner).to.equal('idle');
        });
    });

    describe('releaseServo', function () {
        it('releases when caller is current owner', function () {
            claimServo('servo1', 'idle', PRIORITY.IDLE);
            const released = releaseServo('servo1', 'idle');
            expect(released).to.be.true;
            expect(getOwner('servo1')).to.be.null;
        });

        it('denies release when caller is not current owner', function () {
            claimServo('servo1', 'scene', PRIORITY.SCENE);
            const released = releaseServo('servo1', 'idle');
            expect(released).to.be.false;
            // Original claim should still exist
            expect(getOwner('servo1').owner).to.equal('scene');
        });

        it('returns false for unclaimed servo', function () {
            const released = releaseServo('unclaimed', 'idle');
            expect(released).to.be.false;
        });
    });

    describe('releaseAll', function () {
        it('frees all claims for a specific owner', function () {
            claimServo('servo1', 'idle', PRIORITY.IDLE);
            claimServo('servo2', 'idle', PRIORITY.IDLE);
            claimServo('servo3', 'scene', PRIORITY.SCENE);

            const count = releaseAll('idle');
            expect(count).to.equal(2);
            expect(getOwner('servo1')).to.be.null;
            expect(getOwner('servo2')).to.be.null;
            // servo3 should still be claimed by scene
            expect(getOwner('servo3').owner).to.equal('scene');
        });

        it('returns 0 when owner has no claims', function () {
            const count = releaseAll('nonexistent');
            expect(count).to.equal(0);
        });
    });

    describe('getOwner', function () {
        it('returns null for unclaimed servo', function () {
            expect(getOwner('unclaimed')).to.be.null;
        });

        it('returns a copy (not the internal object)', function () {
            claimServo('servo1', 'idle', PRIORITY.IDLE);
            const owner1 = getOwner('servo1');
            const owner2 = getOwner('servo1');
            expect(owner1).to.deep.equal(owner2);
            expect(owner1).to.not.equal(owner2); // different objects
        });
    });

    describe('isAvailable', function () {
        it('returns true for unclaimed servo at any priority', function () {
            expect(isAvailable('unclaimed', PRIORITY.MICRO_MOVEMENT)).to.be.true;
        });

        it('returns true when priority >= current claim', function () {
            claimServo('servo1', 'idle', PRIORITY.IDLE);
            expect(isAvailable('servo1', PRIORITY.SCENE)).to.be.true;
            expect(isAvailable('servo1', PRIORITY.IDLE)).to.be.true;
        });

        it('returns false when priority < current claim', function () {
            claimServo('servo1', 'scene', PRIORITY.SCENE);
            expect(isAvailable('servo1', PRIORITY.IDLE)).to.be.false;
        });
    });

    describe('getActiveClaims', function () {
        it('returns snapshot of all claims', function () {
            claimServo('servo1', 'idle', PRIORITY.IDLE);
            claimServo('servo2', 'scene', PRIORITY.SCENE);

            const claims = getActiveClaims();
            expect(claims).to.have.property('servo1');
            expect(claims.servo1.owner).to.equal('idle');
            expect(claims).to.have.property('servo2');
            expect(claims.servo2.owner).to.equal('scene');
        });

        it('returns empty object when no claims exist', function () {
            const claims = getActiveClaims();
            expect(Object.keys(claims)).to.have.length(0);
        });
    });
});


// ─── Movement Telemetry ──────────────────────────────────────────────────────

describe('movementTelemetry', function () {

    // The ring buffer is module-level state. We record fresh data each test
    // and use a unique characterId per test to avoid cross-contamination.

    afterEach(function () {
        stopAutoFlush();
    });

    describe('record', function () {
        it('adds entries to the buffer', function () {
            const charId = 'telemetry-record-test';
            record(charId, 'servo1', 'servo_latency_ms', 5);
            record(charId, 'servo1', 'servo_latency_ms', 10);

            const summary = getMetricSummary(charId, 'servo_latency_ms', 60000);
            expect(summary.count).to.be.at.least(2);
        });
    });

    describe('getMetricSummary', function () {
        it('computes avg/min/max/p95/count', function () {
            const charId = 'telemetry-summary-test';
            const values = [10, 20, 30, 40, 50, 60, 70, 80, 90, 100];
            for (const v of values) {
                record(charId, 'servo1', 'servo_latency_ms', v);
            }

            const summary = getMetricSummary(charId, 'servo_latency_ms', 60000);
            expect(summary.count).to.equal(10);
            expect(summary.min).to.equal(10);
            expect(summary.max).to.equal(100);
            expect(summary.avg).to.be.closeTo(55, 0.01);
            // p95 should be near the high end
            expect(summary.p95).to.be.at.least(90);
        });

        it('returns zeros when no matching entries', function () {
            const summary = getMetricSummary('nonexistent-char', 'servo_latency_ms', 60000);
            expect(summary).to.deep.equal({ avg: 0, min: 0, max: 0, p95: 0, count: 0 });
        });

        it('filters by characterId', function () {
            const charA = 'telemetry-filter-A';
            const charB = 'telemetry-filter-B';
            record(charA, 'servo1', 'servo_latency_ms', 10);
            record(charB, 'servo1', 'servo_latency_ms', 99);

            const summaryA = getMetricSummary(charA, 'servo_latency_ms', 60000);
            const summaryB = getMetricSummary(charB, 'servo_latency_ms', 60000);
            expect(summaryA.count).to.be.at.least(1);
            expect(summaryB.count).to.be.at.least(1);
            // charA should not include charB's values
            expect(summaryA.max).to.be.at.most(10);
        });
    });

    describe('getServoHealth', function () {
        it('returns green status for low latency', function () {
            const charId = 'telemetry-health-green';
            for (let i = 0; i < 5; i++) {
                record(charId, 'servoA', 'servo_latency_ms', 10);
            }

            const health = getServoHealth(charId);
            const servoA = health.find(h => h.partId === 'servoA');
            expect(servoA).to.exist;
            expect(servoA.status).to.equal('green');
            expect(servoA.avgLatency).to.be.below(50);
        });

        it('returns yellow status for medium latency (50-150ms)', function () {
            const charId = 'telemetry-health-yellow';
            for (let i = 0; i < 5; i++) {
                record(charId, 'servoB', 'servo_latency_ms', 100);
            }

            const health = getServoHealth(charId);
            const servoB = health.find(h => h.partId === 'servoB');
            expect(servoB).to.exist;
            expect(servoB.status).to.equal('yellow');
        });

        it('returns red status for high latency (>150ms)', function () {
            const charId = 'telemetry-health-red';
            for (let i = 0; i < 5; i++) {
                record(charId, 'servoC', 'servo_latency_ms', 200);
            }

            const health = getServoHealth(charId);
            const servoC = health.find(h => h.partId === 'servoC');
            expect(servoC).to.exist;
            expect(servoC.status).to.equal('red');
        });

        it('returns empty array for unknown character', function () {
            const health = getServoHealth('unknown-char-xyz');
            expect(health).to.be.an('array').with.length(0);
        });
    });

    describe('autoFlush', function () {
        it('startAutoFlush / stopAutoFlush do not throw', function () {
            startAutoFlush(60000);
            stopAutoFlush();
        });
    });
});


// ─── Pose Library ────────────────────────────────────────────────────────────

import {
    getIdlePoses,
    getRandomIdlePose,
    getPoseById
} from '../../services/movement/poseLibrary.js';

describe('poseLibrary', function () {
    // poseLibrary reads from disk; tests use a character ID that may or may not exist.
    // These tests verify the API shape and graceful handling of missing data.

    describe('getIdlePoses', function () {
        it('returns an array (possibly empty for nonexistent character)', async function () {
            const poses = await getIdlePoses(999999);
            expect(poses).to.be.an('array');
        });

        it('applies defaults to pose objects', async function () {
            // Use character 3 (Orlok) which is most likely to have poses
            const poses = await getIdlePoses(3);
            if (poses.length > 0) {
                const pose = poses[0];
                expect(pose).to.have.property('holdVariance').that.is.a('number');
                expect(pose).to.have.property('transitionProfile').that.is.a('string');
                expect(pose).to.have.property('tags').that.is.an('array');
                expect(pose).to.have.property('weight').that.is.a('number');
                expect(pose.weight).to.be.greaterThan(0);
            }
        });
    });

    describe('getRandomIdlePose', function () {
        it('returns null for nonexistent character with no poses', async function () {
            const pose = await getRandomIdlePose(999999);
            expect(pose).to.be.null;
        });

        it('returns a pose object for character with poses', async function () {
            const poses = await getIdlePoses(3);
            if (poses.length > 0) {
                const pose = await getRandomIdlePose(3);
                expect(pose).to.not.be.null;
                expect(pose).to.have.property('id');
            }
        });
    });

    describe('getPoseById', function () {
        it('returns null for nonexistent pose', async function () {
            const pose = await getPoseById(3, 'nonexistent-id-xyz');
            expect(pose).to.be.null;
        });

        it('returns null for nonexistent character', async function () {
            const pose = await getPoseById(999999, 1);
            expect(pose).to.be.null;
        });

        it('returns pose with defaults when found', async function () {
            const poses = await getIdlePoses(3);
            if (poses.length > 0) {
                const target = poses[0];
                const found = await getPoseById(3, target.id);
                expect(found).to.not.be.null;
                expect(found).to.have.property('holdVariance');
                expect(found).to.have.property('transitionProfile');
                expect(found).to.have.property('weight');
            }
        });
    });
});
