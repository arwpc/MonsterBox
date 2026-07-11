/**
 * Unit tests for character-scoped calibration storage (stability audit #5).
 *
 * Part IDs are not globally unique across characters, so calibration profiles are
 * keyed by `${characterId}:${partId}`. These tests prove:
 *  - two characters with the same partId get isolated profiles (the corruption fix),
 *  - existing legacy bare-partId data is still readable (backward compatibility),
 *  - a character-scoped entry takes precedence over a legacy bare key,
 *  - delete only removes the targeted character's entry.
 */

import { expect } from 'chai';
import fs from 'fs/promises';
import os from 'os';
import path from 'path';
import { JsonCalibrationStore } from '../../server/calibration/store.js';

describe('Calibration store — character scoping (#5)', function () {
  let store;
  let tmpFile;
  let counter = 0;

  beforeEach(function () {
    tmpFile = path.join(os.tmpdir(), `mb-cal-${process.pid}-${Date.now()}-${counter++}.json`);
    store = new JsonCalibrationStore(tmpFile);
  });

  afterEach(async function () {
    await fs.unlink(tmpFile).catch(() => {});
  });

  it('isolates the same partId across two characters', async function () {
    await store.upsert({ partId: 5, bounds: { minAngle: 10, maxAngle: 20 } }, 1);
    await store.upsert({ partId: 5, bounds: { minAngle: 100, maxAngle: 140 } }, 3);

    const forChar1 = await store.get(5, 1);
    const forChar3 = await store.get(5, 3);

    expect(forChar1.bounds.maxAngle, 'char 1 bounds preserved').to.equal(20);
    expect(forChar3.bounds.maxAngle, 'char 3 bounds preserved').to.equal(140);
  });

  it('does not let one character clobber another (regression for the corruption bug)', async function () {
    await store.upsert({ partId: 5, bounds: { maxAngle: 20 } }, 1);
    // Before the fix this bare-partId write overwrote character 1's profile.
    await store.upsert({ partId: 5, bounds: { maxAngle: 140 } }, 3);

    expect((await store.get(5, 1)).bounds.maxAngle).to.equal(20);
  });

  it('falls back to a legacy bare-partId entry for backward compatibility', async function () {
    // Simulate data written before namespacing existed.
    await fs.writeFile(tmpFile, JSON.stringify({ '5': { partId: 5, bounds: { maxAngle: 90 }, legacy: true } }));

    const got = await store.get(5, 7); // character 7 has no scoped entry yet
    expect(got, 'legacy entry is still readable').to.not.equal(null);
    expect(got.legacy).to.equal(true);
  });

  it('prefers a character-scoped entry over a legacy bare key', async function () {
    await fs.writeFile(tmpFile, JSON.stringify({ '5': { partId: 5, maxAngle: 90 } }));
    await store.upsert({ partId: 5, bounds: { maxAngle: 140 } }, 3);

    expect((await store.get(5, 3)).bounds.maxAngle, 'char 3 sees its scoped entry').to.equal(140);
    expect((await store.get(5, 1)).maxAngle, 'char 1 still sees the legacy entry').to.equal(90);
  });

  it('delete removes only the targeted character-scoped entry', async function () {
    await store.upsert({ partId: 5 }, 1);
    await store.upsert({ partId: 5 }, 3);

    expect(await store.delete(5, 1)).to.equal(true);
    expect(await store.get(5, 1), 'char 1 entry gone (no legacy fallback)').to.equal(null);
    expect(await store.get(5, 3), 'char 3 entry intact').to.not.equal(null);
  });

  it('stamps the resolved characterId on the stored profile', async function () {
    await store.upsert({ partId: 9, bounds: {} }, 4);
    const raw = JSON.parse(await fs.readFile(tmpFile, 'utf8'));
    expect(raw['4:9'], 'stored under composite key').to.be.an('object');
    expect(raw['4:9'].characterId).to.equal(4);
  });
});
