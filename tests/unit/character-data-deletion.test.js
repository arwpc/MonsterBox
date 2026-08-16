/**
 * Regression tests for character deletion.
 *
 * Real incident: deleteCharacter() only spliced the entry out of
 * data/characters.json and never touched the directory createCharacter() had
 * scaffolded. tests/basic.test.js creates a temp character and deletes it, so
 * every run leaked one directory. Once Renfield pushed maxId to 6 the leaked
 * directory was data/character-7/, which collided with an unrelated bogus
 * characterId: 7 and sent people hunting a "context fallback" bug for weeks. The
 * stray directory was even committed by accident.
 *
 * Two contracts are enforced here:
 *   1. Deleting a character removes its data directory.
 *   2. The removal can only ever target data/character-<digits>. This function
 *      recursively deletes user data, so a bad or hostile id must not be able to
 *      aim it anywhere else.
 */

import { expect } from 'chai';
import fs from 'fs/promises';
import path from 'path';
import { fileURLToPath } from 'url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const APP_ROOT = path.resolve(__dirname, '..', '..');
const DATA_ROOT = path.join(APP_ROOT, 'data');
const CHARACTERS_JSON = path.join(DATA_ROOT, 'characters.json');

async function exists(p) {
  try { await fs.stat(p); return true; } catch (_) { return false; }
}

describe('deleteCharacter — path safety of the directory removal', function () {
  this.timeout(15000);

  let resolveCharacterDataDir;

  before(async function () {
    ({ resolveCharacterDataDir } = await import('../../services/characterService.js'));
  });

  it('resolves a valid id to exactly data/character-<id>', function () {
    expect(resolveCharacterDataDir(7)).to.equal(path.join(DATA_ROOT, 'character-7'));
    expect(resolveCharacterDataDir(1)).to.equal(path.join(DATA_ROOT, 'character-1'));
  });

  it('always resolves to an immediate child of data/', function () {
    for (const id of [1, 2, 42, 999999]) {
      const dir = resolveCharacterDataDir(id);
      expect(path.dirname(dir), `character-${id} must live directly under data/`).to.equal(DATA_ROOT);
      expect(dir.startsWith(DATA_ROOT + path.sep), 'must be inside data/').to.equal(true);
    }
  });

  it('refuses a missing or non-integer id rather than guessing a path', function () {
    const bad = [undefined, null, '', NaN, 1.5, '3', 'three', {}, [], [3], Infinity, -0];
    for (const id of bad) {
      expect(() => resolveCharacterDataDir(id), `id ${JSON.stringify(id)} must be refused`).to.throw();
    }
  });

  it('refuses path traversal and injection attempts in the id', function () {
    // These are the shapes that would escape data/ if the id were interpolated
    // into a path without validation.
    const hostile = [
      '..', '../..', '../../etc', '/etc/passwd', './..',
      '3/../../..', 'character-3', '3; rm -rf /', '\0', '3\n../..',
    ];
    for (const id of hostile) {
      expect(() => resolveCharacterDataDir(id), `hostile id ${JSON.stringify(id)} must be refused`).to.throw();
    }
  });

  it('refuses zero and negative ids, which could name odd directories', function () {
    for (const id of [0, -1, -7]) {
      expect(() => resolveCharacterDataDir(id)).to.throw();
    }
  });

  it('can never resolve to data/ itself or the repo root', function () {
    const dangerous = [DATA_ROOT, APP_ROOT, path.dirname(APP_ROOT), '/'];
    for (const id of [1, 7, 999999]) {
      const dir = resolveCharacterDataDir(id);
      expect(dangerous, `character-${id} resolved to a protected path`).to.not.include(dir);
    }
  });
});

describe('deleteCharacter — removes the data directory it created', function () {
  this.timeout(30000);

  let characterService;
  let originalRegistry = null;
  let tempId = null;

  before(async function () {
    characterService = await import('../../services/characterService.js');
    // This suite mutates the real registry on a real animatronic. Snapshot the
    // exact bytes so the node goes back the way we found it no matter what.
    originalRegistry = await fs.readFile(CHARACTERS_JSON, 'utf8');
  });

  after(async function () {
    if (originalRegistry !== null) {
      await fs.writeFile(CHARACTERS_JSON, originalRegistry, 'utf8');
    }
    // Belt and braces: if an assertion failed mid-test, do not leave the very
    // directory this suite exists to prevent.
    if (tempId !== null) {
      const dir = path.join(DATA_ROOT, `character-${tempId}`);
      if (dir.startsWith(DATA_ROOT + path.sep)) {
        await fs.rm(dir, { recursive: true, force: true }).catch(() => {});
      }
    }
  });

  it('leaves no directory behind after a create/delete round trip', async function () {
    const created = await characterService.createCharacter({ name: 'TempDeletionProbe' });
    tempId = created.id;
    expect(tempId).to.be.a('number');

    const dir = path.join(DATA_ROOT, `character-${tempId}`);
    expect(await exists(dir), 'createCharacter should scaffold the data directory').to.equal(true);

    const ok = await characterService.deleteCharacter(tempId);
    expect(ok, 'deleteCharacter should report success').to.equal(true);

    // The actual regression: this used to still be true.
    expect(await exists(dir), `data/character-${tempId}/ must not survive the delete`).to.equal(false);

    // …and the registry entry is gone too.
    const registry = JSON.parse(await fs.readFile(CHARACTERS_JSON, 'utf8'));
    expect(registry.some(c => c.id === tempId), 'registry entry must be gone').to.equal(false);

    tempId = null; // nothing left for after() to clean up
  });

  it('does not touch any other character directory', async function () {
    const before = (await fs.readdir(DATA_ROOT)).filter(n => /^character-\d+$/.test(n)).sort();

    const created = await characterService.createCharacter({ name: 'TempIsolationProbe' });
    tempId = created.id;
    await characterService.deleteCharacter(tempId);
    tempId = null;

    const after = (await fs.readdir(DATA_ROOT)).filter(n => /^character-\d+$/.test(n)).sort();
    expect(after, 'the surrounding characters must be untouched').to.deep.equal(before);
  });

  it('returns false and changes nothing for an id that is not registered', async function () {
    const registryBefore = await fs.readFile(CHARACTERS_JSON, 'utf8');
    const dirsBefore = (await fs.readdir(DATA_ROOT)).sort();

    const ok = await characterService.deleteCharacter(424242);
    expect(ok).to.equal(false);

    expect(await fs.readFile(CHARACTERS_JSON, 'utf8')).to.equal(registryBefore);
    expect((await fs.readdir(DATA_ROOT)).sort()).to.deep.equal(dirsBefore);
  });

  it('returns false for a non-integer id without deleting anything', async function () {
    const dirsBefore = (await fs.readdir(DATA_ROOT)).sort();
    for (const id of [undefined, null, '3', '../..', {}]) {
      expect(await characterService.deleteCharacter(id), `id ${JSON.stringify(id)}`).to.equal(false);
    }
    expect((await fs.readdir(DATA_ROOT)).sort()).to.deep.equal(dirsBefore);
  });
});
