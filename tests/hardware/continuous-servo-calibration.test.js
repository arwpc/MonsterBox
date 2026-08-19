/**
 * Servo calibration — unified API contract + calibration-store semantics.
 *
 * Rewritten against the API that actually exists. The previous suite drove a
 * per-servo-type endpoint family (POST /setup/calibration/api/continuous_servo/:id/
 * save-pulse | save-position | jog, GET .../status) that was removed with the legacy
 * calibration services, created a REAL part in the node's live parts.json, and
 * asserted 200 on a calibration page that is being retired. Every one of those
 * assertions was against something that no longer exists.
 *
 * The surviving surface is the unified calibration API — server/calibration/router.js
 * mounted at /api/calibration, backed by server/calibration/store.js — which is what
 * views/setup/calibration.ejs actually calls.
 *
 * SAFETY. This file runs unattended on a live animatronic, so it commands no motion
 * at all:
 *   - the calibration store singleton is bound to a throwaway file BEFORE the router
 *     imports it, so nothing here can rewrite the node's real calibration;
 *   - every request either fails validation before an adapter is driven, or only
 *     reads/writes calibration JSON;
 *   - because the store is redirected, a driver reached from here would be running
 *     WITHOUT the part's real profile — which is precisely why this suite must never
 *     command a move. Measuring real travel stays an operator-supervised job on the
 *     calibration page.
 * A bare `npm run test:hardware` therefore cannot move a part.
 *
 * Character independence: the character comes from resolveCharacter(), and the two
 * scoping tests take their ids from data/characters.json.
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
    isDegenerateWindow,
    isPlaceholderProfile
} from '../../server/calibration/store.js';
import { loadParts } from '../../controllers/partsController.js';
import { resolveCharacter } from '../../services/characterContext.js';

// No character defines part ids this high, so nothing behind these ids can be
// energized. Profiles are keyed by id alone, so a synthetic id still exercises the
// whole profile read/write contract — with no hardware attached to it.
const SYNTHETIC_ABSOLUTE_SERVO = 990101;
const SYNTHETIC_CONTINUOUS_SERVO = 990102;
const SYNTHETIC_UNKNOWN_PART = 990199;

const ABSOLUTE_PROFILE = {
    capability: { kind: 'absolute-servo', usMin: 500, usMax: 2500 },
    bounds: { minAngle: 60, maxAngle: 120 },
    presets: [],
    motion: {}
};

const CONTINUOUS_PROFILE = {
    capability: { kind: 'continuous-servo', channel: 15, address: 64 },
    bounds: null,
    presets: [],
    motion: { type: 'time-at-speed', bins: [{ pwmPct: 50, unitsPerSec: 0.3 }], settleMs: 100 }
};

describe('Servo calibration — unified API contract', function () {
    this.timeout(15000);

    let app;
    let routerStore;
    let characterId;
    let tmpCalPath;

    before(async function () {
        tmpCalPath = path.join(os.tmpdir(), `mb-hw-servo-cal-${process.pid}-${Date.now()}.json`);

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
        // Remove the synthetic profiles explicitly: if the singleton redirect above
        // lost a race and we are on the node's real calibration file, this is what
        // keeps the animatronic's data clean.
        for (const partId of [SYNTHETIC_ABSOLUTE_SERVO, SYNTHETIC_CONTINUOUS_SERVO]) {
            try { await routerStore.delete(partId, characterId); } catch (_) { /* best effort */ }
        }
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

        it('stores an absolute-servo profile and reads it back', async function () {
            const saved = await request(app)
                .post(`/api/calibration/${SYNTHETIC_ABSOLUTE_SERVO}/profile`)
                .send(ABSOLUTE_PROFILE);

            expect(saved.status).to.equal(200);
            expect(saved.body).to.have.property('success', true);
            expect(saved.body.profile).to.have.property('partId', SYNTHETIC_ABSOLUTE_SERVO);

            const read = await request(app).get(`/api/calibration/${SYNTHETIC_ABSOLUTE_SERVO}/profile`);
            expect(read.status).to.equal(200);
            expect(read.body).to.have.property('success', true);
            expect(read.body.profile.capability).to.have.property('kind', 'absolute-servo');
            expect(read.body.profile.bounds).to.deep.include({ minAngle: 60, maxAngle: 120 });
        });

        it('stores a continuous-servo profile with its channel and address', async function () {
            const saved = await request(app)
                .post(`/api/calibration/${SYNTHETIC_CONTINUOUS_SERVO}/profile`)
                .send(CONTINUOUS_PROFILE);

            expect(saved.status).to.equal(200);

            const read = await request(app).get(`/api/calibration/${SYNTHETIC_CONTINUOUS_SERVO}/profile`);
            expect(read.status).to.equal(200);
            expect(read.body.profile.capability).to.deep.include({
                kind: 'continuous-servo',
                channel: 15,
                address: 64
            });
        });

        it('keys the stored profile by character, not by bare part id', async function () {
            const res = await request(app).get('/api/calibration/profiles');
            expect(res.status).to.equal(200);
            expect(res.body).to.have.property(`${characterId}:${SYNTHETIC_ABSOLUTE_SERVO}`);
            expect(res.body).to.not.have.property(String(SYNTHETIC_ABSOLUTE_SERVO));
        });

        it('rejects a profile whose capability kind no adapter understands', async function () {
            const res = await request(app)
                .post(`/api/calibration/${SYNTHETIC_ABSOLUTE_SERVO}/profile`)
                .send({ capability: { kind: 'telekinesis' }, bounds: { minAngle: 0, maxAngle: 90 } });

            expect(res.status).to.equal(400);
            expect(res.body).to.have.property('success', false);
            expect(res.body.error).to.match(/capability\.kind/i);
        });

        it('rejects bounds that are not finite numbers', async function () {
            const res = await request(app)
                .post(`/api/calibration/${SYNTHETIC_ABSOLUTE_SERVO}/profile`)
                .send({ capability: { kind: 'absolute-servo' }, bounds: { minAngle: 'sixty', maxAngle: 120 } });

            expect(res.status).to.equal(400);
            expect(res.body.error).to.match(/finite number/i);
        });

        it('rejects a zero-span angle window (the frozen-servo case)', async function () {
            // min === max clamps every later command to one angle, so the part can
            // never move again and looks exactly like the dead servo the operator was
            // diagnosing. The writer must refuse it, not persist it.
            const res = await request(app)
                .post(`/api/calibration/${SYNTHETIC_ABSOLUTE_SERVO}/profile`)
                .send({ capability: { kind: 'absolute-servo' }, bounds: { minAngle: 108, maxAngle: 108 } });

            expect(res.status).to.equal(409);
            expect(res.body).to.have.property('success', false);

            // The refusal must leave the previously stored window intact.
            const read = await request(app).get(`/api/calibration/${SYNTHETIC_ABSOLUTE_SERVO}/profile`);
            expect(read.body.profile.bounds).to.deep.include({ minAngle: 60, maxAngle: 120 });
        });

        it('clears a profile on request', async function () {
            const del = await request(app).delete(`/api/calibration/${SYNTHETIC_CONTINUOUS_SERVO}/profile`);
            expect(del.status).to.equal(200);
            expect(del.body).to.have.property('success', true);

            const read = await request(app).get(`/api/calibration/${SYNTHETIC_CONTINUOUS_SERVO}/profile`);
            expect(read.status).to.equal(404);
        });
    });

    describe('validation — refusals that never reach a driver', function () {
        it('rejects an out-of-range goto angle', async function () {
            const res = await request(app)
                .post(`/api/calibration/${SYNTHETIC_ABSOLUTE_SERVO}/goto`)
                .send({ angle: 200 });

            expect(res.status).to.equal(400);
            expect(res.body.error).to.match(/angle/i);
        });

        it('rejects a non-numeric goto angle', async function () {
            const res = await request(app)
                .post(`/api/calibration/${SYNTHETIC_ABSOLUTE_SERVO}/goto`)
                .send({ angle: '90' });

            expect(res.status).to.equal(400);
        });

        it('rejects a nudge with neither (dir, scale) nor delta', async function () {
            const res = await request(app)
                .post(`/api/calibration/${SYNTHETIC_ABSOLUTE_SERVO}/nudge`)
                .send({});

            expect(res.status).to.equal(400);
            expect(res.body.error).to.match(/dir, scale|delta/i);
        });

        it('rejects a nudge with an unknown direction or scale', async function () {
            const res = await request(app)
                .post(`/api/calibration/${SYNTHETIC_ABSOLUTE_SERVO}/nudge`)
                .send({ dir: 'sideways', scale: 'fine' });

            expect(res.status).to.equal(400);
        });

        it('refuses homing on a part type that cannot home', async function () {
            const res = await request(app)
                .post(`/api/calibration/${SYNTHETIC_ABSOLUTE_SERVO}/home`)
                .send({ direction: 'retract' });

            expect(res.status).to.equal(400);
            expect(res.body.error).to.match(/homing/i);
        });

        it('refuses clear-all without an explicit part list', async function () {
            const res = await request(app).post('/api/calibration/clear-all').send({});
            expect(res.status).to.equal(400);
        });
    });

    describe('position reporting', function () {
        it('reports an unknown position for an absolute servo it has never driven', async function () {
            const res = await request(app).get(`/api/calibration/${SYNTHETIC_ABSOLUTE_SERVO}/position`);
            expect(res.status).to.equal(200);
            expect(res.body).to.have.property('success', true);
            expect(res.body).to.have.property('kind', 'absolute-servo');
            expect(res.body.currentAngle).to.equal(null);
        });
    });

    describe('auto-created profiles are placeholders, not measurements', function () {
        let servoPartId;

        before(async function () {
            const parts = await loadParts();
            const servo = parts.find(p => p.type === 'servo');
            if (!servo) this.skip(); // character has no servo — nothing to assert
            servoPartId = servo.id;
        });

        it('marks an auto-created servo profile autoGenerated and withholds its span from movers', async function () {
            const res = await request(app).get(`/api/calibration/${servoPartId}/profile`);
            expect(res.status).to.equal(200);

            // The endpoint answers from getRaw() because it is the writer's view — the
            // operator has to see the span they are about to replace.
            const raw = res.body.profile;
            if (raw.autoGenerated) {
                expect(raw.bounds, 'placeholder span is visible to the writer').to.not.equal(null);

                // ...but the read path used by anything that MOVES the part must not
                // hand a guess back as a measurement.
                const forUse = await routerStore.get(servoPartId, characterId);
                expect(forUse.bounds, 'placeholder withheld from movers').to.equal(null);
                expect(forUse.placeholderBounds).to.not.equal(null);
                expect(calibratedBounds(forUse), 'no calibrated window exists yet').to.equal(null);
            } else {
                // Already calibrated by an operator: then it must be a real window.
                expect(calibratedBounds(raw), 'a calibrated profile reports its window').to.not.equal(null);
            }
        });
    });
});

describe('Servo calibration — store read/write semantics', function () {
    this.timeout(10000);

    let store;
    let tmpFile;
    let counter = 0;

    beforeEach(function () {
        tmpFile = path.join(os.tmpdir(), `mb-hw-servo-store-${process.pid}-${Date.now()}-${counter++}.json`);
        store = new JsonCalibrationStore(tmpFile);
    });

    afterEach(async function () {
        await fs.unlink(tmpFile).catch(() => {});
    });

    it('withholds an autoGenerated span from readers but keeps it for writers', async function () {
        await store.upsert({
            partId: 42,
            capability: { kind: 'absolute-servo' },
            bounds: { minAngle: 0, maxAngle: 180 },
            autoGenerated: true
        }, 1);

        const forUse = await store.get(42, 1);
        expect(isPlaceholderProfile(forUse)).to.equal(true);
        expect(forUse.bounds).to.equal(null);
        expect(forUse.placeholderBounds).to.deep.include({ minAngle: 0, maxAngle: 180 });
        expect(calibratedBounds(forUse)).to.equal(null);

        const forWrite = await store.getRaw(42, 1);
        expect(forWrite.bounds, 'writers must not lose the span on read-modify-write')
            .to.deep.include({ minAngle: 0, maxAngle: 180 });
    });

    it('returns a measured window unchanged', async function () {
        await store.upsert({
            partId: 42,
            capability: { kind: 'absolute-servo' },
            bounds: { minAngle: 63, maxAngle: 131 },
            autoGenerated: false
        }, 1);

        const forUse = await store.get(42, 1);
        expect(forUse.bounds).to.deep.include({ minAngle: 63, maxAngle: 131 });
        expect(calibratedBounds(forUse)).to.deep.include({ minAngle: 63, maxAngle: 131 });
    });

    it('withholds a zero-span window and names it degenerate', async function () {
        expect(isDegenerateWindow({ minAngle: 108, maxAngle: 108 })).to.equal(true);

        await store.upsert({
            partId: 42,
            capability: { kind: 'absolute-servo' },
            bounds: { minAngle: 108, maxAngle: 108 },
            autoGenerated: false
        }, 1);

        const forUse = await store.get(42, 1);
        expect(forUse.bounds, 'a pinned window is not a measurement').to.equal(null);
        expect(forUse.degenerateBounds, 'surfaced so the page can tell the operator to redo the run')
            .to.deep.include({ minAngle: 108, maxAngle: 108 });
        expect(calibratedBounds(forUse)).to.equal(null);
    });
});

describe('Servo calibration — character scoping', function () {
    this.timeout(10000);

    let store;
    let tmpFile;
    let charA;
    let charB;
    const sharedPartId = 5; // ids are only unique WITHIN a character

    before(async function () {
        const registry = JSON.parse(await fs.readFile(path.resolve('data/characters.json'), 'utf8'));
        if (!Array.isArray(registry) || registry.length < 2) this.skip();
        charA = registry[0].id;
        charB = registry[1].id;
    });

    beforeEach(function () {
        tmpFile = path.join(os.tmpdir(), `mb-hw-servo-scope-${process.pid}-${Date.now()}.json`);
        store = new JsonCalibrationStore(tmpFile);
    });

    afterEach(async function () {
        await fs.unlink(tmpFile).catch(() => {});
    });

    it('keeps two characters that share a part id isolated', async function () {
        await store.upsert({ partId: sharedPartId, bounds: { minAngle: 10, maxAngle: 40 } }, charA);
        await store.upsert({ partId: sharedPartId, bounds: { minAngle: 100, maxAngle: 140 } }, charB);

        expect((await store.get(sharedPartId, charA)).bounds.maxAngle).to.equal(40);
        expect((await store.get(sharedPartId, charB)).bounds.maxAngle).to.equal(140);
    });

    it('deletes only the targeted character calibration', async function () {
        await store.upsert({ partId: sharedPartId, bounds: { minAngle: 10, maxAngle: 40 } }, charA);
        await store.upsert({ partId: sharedPartId, bounds: { minAngle: 100, maxAngle: 140 } }, charB);

        expect(await store.delete(sharedPartId, charA)).to.equal(true);

        expect(await store.get(sharedPartId, charA)).to.equal(null);
        expect((await store.get(sharedPartId, charB)).bounds.maxAngle).to.equal(140);
    });
});
