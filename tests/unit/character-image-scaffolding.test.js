/**
 * Regression tests for unauthenticated directory creation via the image service.
 *
 * Real incident: ensureImagesDir() called fs.mkdir unconditionally, and the
 * image routes validate only that :id parses as an integer — never that the
 * character is registered. So an unauthenticated
 * GET /api/characters/<any-integer>/images scaffolded a character directory on
 * disk. A phantom data/character-999999/ (999999 being the sentinel id used by
 * the movement tests) existed on this node and was invisible to git status
 * because it contained nothing but empty directories.
 *
 * Contract: nothing is created on disk for an id that data/characters.json does
 * not know about, and real characters keep working exactly as before.
 */

import { expect } from 'chai';
import fs from 'fs/promises';
import path from 'path';
import { fileURLToPath } from 'url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const APP_ROOT = path.resolve(__dirname, '..', '..');
const DATA_ROOT = path.join(APP_ROOT, 'data');

// The sentinel that actually leaked, plus a couple of other unregistered ids.
const UNREGISTERED_IDS = [999999, 424242, 31337];

async function exists(p) {
  try { await fs.stat(p); return true; } catch (_) { return false; }
}

async function registeredIds() {
  const raw = await fs.readFile(path.join(DATA_ROOT, 'characters.json'), 'utf8');
  const parsed = JSON.parse(raw);
  const list = Array.isArray(parsed) ? parsed : (parsed.characters || []);
  return list.map(c => c.id);
}

describe('character image service — must not scaffold directories for unregistered ids', function () {
  this.timeout(15000);

  let svc;

  before(async function () {
    svc = await import('../../services/characterImageService.js');
    // Make sure a previous leak does not mask the test.
    for (const id of UNREGISTERED_IDS) {
      await fs.rm(path.join(DATA_ROOT, `character-${id}`), { recursive: true, force: true }).catch(() => {});
    }
  });

  after(async function () {
    // Never leave one behind ourselves.
    for (const id of UNREGISTERED_IDS) {
      const dir = path.join(DATA_ROOT, `character-${id}`);
      if (dir.startsWith(DATA_ROOT + path.sep)) {
        await fs.rm(dir, { recursive: true, force: true }).catch(() => {});
      }
    }
  });

  it('ensureImagesDir creates nothing for an unregistered character', async function () {
    for (const id of UNREGISTERED_IDS) {
      const dir = await svc.ensureImagesDir(id);
      expect(dir, 'the path is still reported').to.be.a('string');
      expect(await exists(dir), `images dir for unregistered ${id} must not be created`).to.equal(false);
      expect(
        await exists(path.join(DATA_ROOT, `character-${id}`)),
        `data/character-${id}/ must not be created`
      ).to.equal(false);
    }
  });

  it('listImages returns an empty result for an unregistered character and still creates nothing', async function () {
    for (const id of UNREGISTERED_IDS) {
      const result = await svc.listImages(id);
      expect(result.images).to.deep.equal([]);
      expect(result.active === null || result.active === undefined).to.equal(true);
      expect(await exists(path.join(DATA_ROOT, `character-${id}`))).to.equal(false);
    }
  });

  it('refuses to write an image for an unregistered character', async function () {
    for (const id of UNREGISTERED_IDS) {
      let threw = null;
      try {
        await svc.saveImage(id, 'probe.png', Buffer.from('not-really-a-png'));
      } catch (err) {
        threw = err;
      }
      expect(threw, `saveImage(${id}) must be refused`).to.be.an('error');
      expect(threw.code).to.equal('CHARACTER_NOT_FOUND');
      expect(await exists(path.join(DATA_ROOT, `character-${id}`))).to.equal(false);
    }
  });

  it('refuses to set an active image for an unregistered character', async function () {
    let threw = null;
    try {
      await svc.setActiveImage(999999, 'probe.png');
    } catch (err) {
      threw = err;
    }
    expect(threw).to.be.an('error');
    expect(threw.code).to.equal('CHARACTER_NOT_FOUND');
  });

  it('rejects non-integer and traversal ids outright', async function () {
    for (const id of ['../..', '3/../../..', 'abc', null, undefined, '', 0, -1, 1.5]) {
      let threw = null;
      try { await svc.ensureImagesDir(id); } catch (err) { threw = err; }
      expect(threw, `id ${JSON.stringify(id)} must be rejected`).to.be.an('error');
    }
  });

  it('never resolves an images directory outside data/', async function () {
    for (const id of [1, 7, 999999]) {
      const dir = await svc.ensureImagesDir(id);
      expect(dir.startsWith(DATA_ROOT + path.sep), `${dir} must be inside data/`).to.equal(true);
      expect(path.basename(dir)).to.equal('images');
    }
  });
});

describe('character image service — registered characters keep working', function () {
  this.timeout(15000);

  let svc;
  let ids = [];

  before(async function () {
    svc = await import('../../services/characterImageService.js');
    ids = await registeredIds();
  });

  it('creates and returns the images directory for every registered character', async function () {
    expect(ids.length, 'there should be characters to test').to.be.greaterThan(0);
    for (const id of ids) {
      const dir = await svc.ensureImagesDir(id);
      expect(await exists(dir), `images dir for registered character ${id} must exist`).to.equal(true);
      expect(dir).to.equal(path.join(DATA_ROOT, `character-${id}`, 'images'));
    }
  });

  it('listImages still enumerates images for registered characters', async function () {
    for (const id of ids) {
      const result = await svc.listImages(id);
      expect(result.images, `character ${id}`).to.be.an('array');
      for (const item of result.images) {
        expect(item).to.have.property('filename');
        expect(item.url).to.equal(`/data/character-${id}/images/${item.filename}`);
      }
    }
  });

  it('round-trips an upload for a registered character', async function () {
    const id = ids[0];
    const name = '__probe_upload__.png';
    const dir = path.join(DATA_ROOT, `character-${id}`, 'images');
    const file = path.join(dir, name);
    try {
      const saved = await svc.saveImage(id, name, Buffer.from('probe'));
      expect(saved.filename).to.equal(name);
      expect(await exists(file), 'the uploaded file should be on disk').to.equal(true);

      const listed = await svc.listImages(id);
      expect(listed.images.map(i => i.filename)).to.include(name);
    } finally {
      await fs.rm(file, { force: true }).catch(() => {});
    }
  });
});
