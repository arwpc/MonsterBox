/**
 * Linear actuator calibration — unified API contract + open-loop store semantics.
 *
 * Rewritten against the API that actually exists. The previous suite created a REAL
 * linear actuator in the node's live parts.json, then drove a legacy endpoint family
 * (POST /setup/calibration/api/linear_actuator/:id/save-position, GET .../status with
 * a `fullyCalibrated` flag) whose response shape no longer exists, and asserted 200 on
 * a calibration page that is being retired.
 *
 * The surviving surface is the unified calibration API — server/calibration/router.js
 * mounted at /api/calibration, backed by server/calibration/store.js — which is what
 * views/setup/calibration.ejs actually calls.
 *
 * SAFETY. This file runs unattended on a live animatronic, so it commands no motion
 * at all:
 *   - the calibration store singleton is bound to a throwaway file BEFORE the router
 *     imports it, so nothing here can rewrite the node's real calibration;
 *   - every request either fails validation before the motor is energized, or only
 *     reads/writes calibration JSON;
 *   - jog-raw and home are the two endpoints that deliberately bypass position
 *     limits, so they are exercised ONLY through their refusal paths.
 * A bare `npm run test:hardware` therefore cannot move a part.
 *
 * Character independence: the character comes from resolveCharacter(), the real-part
 * test discovers an actuator by type (and skips when the character has none), and the
 * scoping test takes its ids from data/characters.json.
 */

import { expect } from 'chai';
import express from 'express';
import request from 'supertest';
import fs from 'fs/promises';
import os from 'os';
import path from 'path';
import {
    JsonCalibrationStore,
    getCalibrationStore,
    calibratedBounds,
    isDegenerateWindow
} from '../../server/calibration/store.js';
import { loadParts } from '../../controllers/partsController.js';
import { resolveCharacter } from '../../services/characterContext.js';

// No character defines part ids this high, so nothing behind these ids can be
// energized. Profiles are keyed by id alone, so a synthetic id still exercises the
// whole profile read/write contract — with no hardware attached to it.
const SYNTHETIC_ACTUATOR = 990201;
const SYNTHETIC_UNKNOWN_PART = 990299;

const OPENLOOP_PROFILE = {
    capability: { kind: 'openloop-linear' },
    bounds: { minP: 0, maxP: 1 },
    presets: [],
    motion: {
        type: 'time-at-speed',
        bins: [{ pwmPct: 50, unitsPerSec: 0.2 }, { pwmPct: 90, unitsPerSec: 0.4 }],
        settleMs: 150
    }
};

describe('Linear actuator calibration — unified API contract', function () {
    this.timeout(15000);

    let app;
    let routerStore;
    let characterId;
    let tmpCalPath;

    before(async function () {
        tmpCalPath = path.join(os.tmpdir(), `mb-hw-actuator-cal-${process.pid}-${Date.now()}.json`);

        // Bind the process-wide store singleton to the throwaway file first, then
        // import the router — it grabs the singleton at module load. If another suite
        // in this process already bound it, we inherit that instance; the cleanup
        // below therefore works off routerStore.filePath rather than assuming ours.
        routerStore = getCalibrationStore(tmpCalPath);
        const { default: calibrationRouter } = await import('../../server/calibration/router.js');

        app = express();
        app.use('/api/calibration', calibrationRouter);

        const character = await resolveCharacter(null);
        characterId = character ? character.id : null;
    });

    after(async function () {
        // Remove the synthetic profile explicitly: if the singleton redirect above
        // lost a race and we are on the node's real calibration file, this is what
        // keeps the animatronic's data clean.
        try { await routerStore.delete(SYNTHETIC_ACTUATOR, characterId); } catch (_) { /* best effort */ }
        // Only ever unlink a file we know is a scratch file.
        if (routerStore && routerStore.filePath && routerStore.filePath.startsWith(os.tmpdir())) {
            await fs.unlink(routerStore.filePath).catch(() => {});
        }
    });

    describe('profile read/write', function () {
        it('refuses to auto-create a profile for an id that is not a part', async function () {
            const res = await request(app).get(`/api/calibration/${SYNTHETIC_UNKNOWN_PART}/profile`);
            expect(res.status).to.equal(404);
            expect(res.body).to.have.property('success', false);
        });

        it('stores an open-loop profile and reads it back', async function () {
            const saved = await request(app)
                .post(`/api/calibration/${SYNTHETIC_ACTUATOR}/profile`)
                .send(OPENLOOP_PROFILE);

            expect(saved.status).to.equal(200);
            expect(saved.body).to.have.property('success', true);

            const read = await request(app).get(`/api/calibration/${SYNTHETIC_ACTUATOR}/profile`);
            expect(read.status).to.equal(200);
            expect(read.body.profile.capability).to.have.property('kind', 'openloop-linear');
            expect(read.body.profile.motion).to.have.property('type', 'time-at-speed');
            expect(read.body.profile.bounds).to.deep.include({ minP: 0, maxP: 1 });
        });

        it('keys the stored profile by character, not by bare part id', async function () {
            const res = await request(app).get('/api/calibration/profiles');
            expect(res.status).to.equal(200);
            expect(res.body).to.have.property(`${characterId}:${SYNTHETIC_ACTUATOR}`);
            expect(res.body).to.not.have.property(String(SYNTHETIC_ACTUATOR));
        });

        it('rejects a zero-span normalized window', async function () {
            // minP === maxP collapses every later command to a zero-length pulse: the
            // actuator stops moving and the failure looks like dead wiring.
            const res = await request(app)
                .post(`/api/calibration/${SYNTHETIC_ACTUATOR}/profile`)
                .send(Object.assign({}, OPENLOOP_PROFILE, { bounds: { minP: 0.5, maxP: 0.5 } }));

            expect(res.status).to.equal(409);
            expect(res.body).to.have.property('success', false);

            const read = await request(app).get(`/api/calibration/${SYNTHETIC_ACTUATOR}/profile`);
            expect(read.body.profile.bounds, 'the refusal leaves the stored window intact')
                .to.deep.include({ minP: 0, maxP: 1 });
        });

        it('records the invert flag without disturbing the measured window', async function () {
            const res = await request(app)
                .post(`/api/calibration/${SYNTHETIC_ACTUATOR}/set-invert`)
                .send({ invert: true });

            expect(res.status).to.equal(200);
            expect(res.body).to.have.property('invert', true);

            const read = await request(app).get(`/api/calibration/${SYNTHETIC_ACTUATOR}/profile`);
            expect(read.body.profile.capability).to.have.property('invert', true);
            expect(read.body.profile.bounds).to.deep.include({ minP: 0, maxP: 1 });
        });
    });

    describe('validation — refusals that never energize the motor', function () {
        it('rejects a raw jog in an unknown direction', async function () {
            const res = await request(app)
                .post(`/api/calibration/${SYNTHETIC_ACTUATOR}/jog-raw`)
                .send({ direction: 'sideways', speedPct: 50, durationMs: 500 });

            expect(res.status).to.equal(400);
            expect(res.body.error).to.match(/extend.*retract/i);
        });

        it('rejects a raw jog with no direction at all', async function () {
            const res = await request(app)
                .post(`/api/calibration/${SYNTHETIC_ACTUATOR}/jog-raw`)
                .send({});

            expect(res.status).to.equal(400);
        });

        it('rejects a goto outside the normalized range', async function () {
            const res = await request(app)
                .post(`/api/calibration/${SYNTHETIC_ACTUATOR}/goto`)
                .send({ p: 5 });

            expect(res.status).to.equal(400);
            expect(res.body.error).to.match(/\bp\b/i);
        });

        it('rejects a non-numeric goto target', async function () {
            const res = await request(app)
                .post(`/api/calibration/${SYNTHETIC_ACTUATOR}/goto`)
                .send({ p: '0.5' });

            expect(res.status).to.equal(400);
        });
    });

    describe('open-loop motion model (learn-openloop)', function () {
        it('needs at least two probes', async function () {
            const res = await request(app)
                .post(`/api/calibration/${SYNTHETIC_ACTUATOR}/learn-openloop`)
                .send({ probes: [{ pwmPct: 50, msRun: 1000, measuredDeltaP: 0.2 }] });

            expect(res.status).to.equal(400);
            expect(res.body.error).to.match(/2 probes/i);
        });

        it('refuses probes that measured no movement', async function () {
            // A zero delta divides into a rate of 0/NaN, which JSON persisted as null —
            // and every consumer dividing by that rate then commanded a duration of
            // Infinity, i.e. a motor with no stop time.
            const res = await request(app)
                .post(`/api/calibration/${SYNTHETIC_ACTUATOR}/learn-openloop`)
                .send({
                    probes: [
                        { pwmPct: 50, msRun: 1000, measuredDeltaP: 0 },
                        { pwmPct: 90, msRun: 1000, measuredDeltaP: 0 }
                    ]
                });

            expect(res.status).to.equal(400);
            expect(res.body.error).to.match(/did not measure any movement/i);

            const read = await request(app).get(`/api/calibration/${SYNTHETIC_ACTUATOR}/profile`);
            expect(read.body.profile.motion.bins, 'the refusal leaves the previous model intact')
                .to.deep.equal(OPENLOOP_PROFILE.motion.bins);
        });

        it('derives unitsPerSec from measured deltas', async function () {
            const res = await request(app)
                .post(`/api/calibration/${SYNTHETIC_ACTUATOR}/learn-openloop`)
                .send({
                    probes: [
                        { pwmPct: 50, msRun: 1000, measuredDeltaP: 0.2 },
                        { pwmPct: 90, msRun: 500, measuredDeltaP: 0.2 }
                    ]
                });

            expect(res.status).to.equal(200);
            expect(res.body).to.have.property('success', true);
            expect(res.body.motion.bins).to.have.lengthOf(2);
            expect(res.body.motion.bins[0].unitsPerSec).to.be.closeTo(0.2, 1e-9);
            expect(res.body.motion.bins[1].unitsPerSec).to.be.closeTo(0.4, 1e-9);
        });

        it('accepts the documented fromP/toP probe shape', async function () {
            const res = await request(app)
                .post(`/api/calibration/${SYNTHETIC_ACTUATOR}/learn-openloop`)
                .send({
                    probes: [
                        { pwmPct: 50, msRun: 1000, fromP: 0.1, toP: 0.3 },
                        { pwmPct: 90, msRun: 1000, fromP: 0.1, toP: 0.5 }
                    ]
                });

            expect(res.status).to.equal(200);
            expect(res.body.motion.bins[0].unitsPerSec).to.be.closeTo(0.2, 1e-9);
            expect(res.body.motion.bins[1].unitsPerSec).to.be.closeTo(0.4, 1e-9);
        });
    });

    describe('position reporting', function () {
        it('reports an unknown position for an actuator it has never driven', async function () {
            const res = await request(app).get(`/api/calibration/${SYNTHETIC_ACTUATOR}/position`);

            expect(res.status).to.equal(200);
            expect(res.body).to.have.property('success', true);
            expect(res.body).to.have.property('currentP', null);
            expect(res.body).to.have.property('positionKnown', false);
            expect(res.body).to.have.property('confidence', 'unknown');
        });
    });

    describe('auto-created profiles for a real actuator', function () {
        let actuatorPartId;

        before(async function () {
            const parts = await loadParts();
            const actuator = parts.find(p => p.type === 'linear_actuator');
            if (!actuator) this.skip(); // character has no actuator — nothing to assert
            actuatorPartId = actuator.id;
        });

        it('classifies a linear actuator as open-loop with no measured window', async function () {
            const res = await request(app).get(`/api/calibration/${actuatorPartId}/profile`);
            expect(res.status).to.equal(200);

            const profile = res.body.profile;
            expect(profile.capability).to.have.property('kind', 'openloop-linear');
            expect(profile.motion).to.have.property('type', 'time-at-speed');

            if (profile.autoGenerated) {
                // An auto-created actuator profile has never been measured, so it must
                // not hand a window to anything that drives the motor.
                expect(calibratedBounds(await routerStore.get(actuatorPartId, characterId))).to.equal(null);
            }
        });
    });
});

describe('Linear actuator calibration — open-loop store semantics', function () {
    this.timeout(10000);

    let store;
    let tmpFile;
    let counter = 0;

    beforeEach(function () {
        tmpFile = path.join(os.tmpdir(), `mb-hw-actuator-store-${process.pid}-${Date.now()}-${counter++}.json`);
        store = new JsonCalibrationStore(tmpFile);
    });

    afterEach(async function () {
        await fs.unlink(tmpFile).catch(() => {});
    });

    it('flags a zero-span normalized window as degenerate', function () {
        expect(isDegenerateWindow({ minP: 0.4, maxP: 0.4 })).to.equal(true);
        expect(isDegenerateWindow({ minP: 0.6, maxP: 0.4 })).to.equal(true);
        expect(isDegenerateWindow({ minP: 0, maxP: 1 })).to.equal(false);
    });

    it('withholds a degenerate normalized window from readers', async function () {
        await store.upsert({
            partId: 77,
            capability: { kind: 'openloop-linear' },
            bounds: { minP: 0.5, maxP: 0.5 },
            autoGenerated: false
        }, 1);

        const forUse = await store.get(77, 1);
        expect(forUse.bounds).to.equal(null);
        expect(forUse.degenerateBounds).to.deep.include({ minP: 0.5, maxP: 0.5 });
        expect(calibratedBounds(forUse)).to.equal(null);
    });

    it('withholds an autoGenerated profile span but keeps it for writers', async function () {
        await store.upsert({
            partId: 77,
            capability: { kind: 'openloop-linear' },
            bounds: { minP: 0, maxP: 1 },
            autoGenerated: true
        }, 1);

        const forUse = await store.get(77, 1);
        expect(forUse.bounds).to.equal(null);
        expect(forUse.placeholderBounds).to.deep.include({ minP: 0, maxP: 1 });
        expect(calibratedBounds(forUse)).to.equal(null);

        const forWrite = await store.getRaw(77, 1);
        expect(forWrite.bounds, 'writers must not lose the span on read-modify-write')
            .to.deep.include({ minP: 0, maxP: 1 });
    });

    it('returns a measured normalized window unchanged', async function () {
        await store.upsert({
            partId: 77,
            capability: { kind: 'openloop-linear' },
            bounds: { minP: 0.1, maxP: 0.9 },
            autoGenerated: false
        }, 1);

        expect(calibratedBounds(await store.get(77, 1))).to.deep.include({ minP: 0.1, maxP: 0.9 });
    });
});

describe('Linear actuator calibration — character scoping', function () {
    this.timeout(10000);

    let store;
    let tmpFile;
    let charA;
    let charB;
    const sharedPartId = 4; // ids are only unique WITHIN a character

    before(async function () {
        const registry = JSON.parse(await fs.readFile(path.resolve('data/characters.json'), 'utf8'));
        if (!Array.isArray(registry) || registry.length < 2) this.skip();
        charA = registry[0].id;
        charB = registry[1].id;
    });

    beforeEach(function () {
        tmpFile = path.join(os.tmpdir(), `mb-hw-actuator-scope-${process.pid}-${Date.now()}.json`);
        store = new JsonCalibrationStore(tmpFile);
    });

    afterEach(async function () {
        await fs.unlink(tmpFile).catch(() => {});
    });

    it('keeps two characters that share a part id isolated', async function () {
        await store.upsert({ partId: sharedPartId, bounds: { minP: 0, maxP: 0.6 } }, charA);
        await store.upsert({ partId: sharedPartId, bounds: { minP: 0, maxP: 1 } }, charB);

        expect((await store.get(sharedPartId, charA)).bounds.maxP).to.equal(0.6);
        expect((await store.get(sharedPartId, charB)).bounds.maxP).to.equal(1);
    });

    it('reads a legacy bare-part-id profile when a character has none of its own', async function () {
        // Pre-namespacing data must stay readable, or a deployed node loses its
        // calibration the moment the scoped keys are introduced.
        await fs.writeFile(tmpFile, JSON.stringify({
            [String(sharedPartId)]: {
                partId: sharedPartId,
                capability: { kind: 'openloop-linear' },
                bounds: { minP: 0, maxP: 0.75 }
            }
        }));

        expect((await store.get(sharedPartId, charA)).bounds.maxP).to.equal(0.75);
    });
});
