/**
 * Scene queues and templates live in data/character-N/, not in the nested
 * data/character-N/character-N/ that joining character-N onto the
 * character-scoped cfg.dataPath used to produce.
 *
 * Uses a synthetic character id and removes only the directory it created.
 */

import { expect } from 'chai';
import fs from 'fs/promises';
import fsSync from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';
import { loadQueues, saveQueues } from '../../services/scenes/queueLibrary.js';
import { loadTemplates, saveTemplates } from '../../services/scenes/queueTemplates.js';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const CHAR_ID = 99017;
const charDir = path.resolve(__dirname, '..', '..', 'data', `character-${CHAR_ID}`);
const legacyDir = path.join(charDir, `character-${CHAR_ID}`);

describe('Scene queue library — character data directory', function () {
  before(function () {
    // Never touch a directory this test did not create.
    if (fsSync.existsSync(charDir)) this.skip();
  });

  after(async function () {
    if (this.currentTest && this.currentTest.pending) return;
    await fs.rm(charDir, { recursive: true, force: true });
  });

  it('reads a library saved at the legacy nested path', async function () {
    await fs.mkdir(legacyDir, { recursive: true });
    await fs.writeFile(path.join(legacyDir, 'scene-queues.json'), JSON.stringify([{ queue_id: 'legacy' }]));
    await fs.writeFile(path.join(legacyDir, 'scene-queue-templates.json'), JSON.stringify([{ id: 7 }]));

    expect(await loadQueues(CHAR_ID)).to.deep.equal([{ queue_id: 'legacy' }]);
    expect(await loadTemplates(CHAR_ID)).to.deep.equal([{ id: 7 }]);
  });

  it('saves to data/character-N and leaves the legacy copy untouched', async function () {
    await saveQueues(CHAR_ID, [{ queue_id: 'new' }]);
    await saveTemplates(CHAR_ID, [{ id: 8 }]);

    expect(JSON.parse(await fs.readFile(path.join(charDir, 'scene-queues.json'), 'utf8'))).to.deep.equal([{ queue_id: 'new' }]);
    expect(JSON.parse(await fs.readFile(path.join(charDir, 'scene-queue-templates.json'), 'utf8'))).to.deep.equal([{ id: 8 }]);
    expect(await loadQueues(CHAR_ID), 'the real path wins once it exists').to.deep.equal([{ queue_id: 'new' }]);
    expect(JSON.parse(await fs.readFile(path.join(legacyDir, 'scene-queues.json'), 'utf8'))).to.deep.equal([{ queue_id: 'legacy' }]);
  });
});
