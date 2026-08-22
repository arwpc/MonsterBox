/**
 * UP-8 — crontab backups accumulated forever.
 *
 * Every crontab change wrote monsterbox-crontab-<ts>.bak to /tmp — which on
 * these nodes is the SD card — and nothing ever deleted them: 140 were found
 * in the v11 audit. backupCrontab() now prunes to the newest 10 after each
 * write, best-effort.
 */

import { expect } from 'chai';
import fs from 'fs/promises';
import os from 'os';
import path from 'path';
import { backupCrontab } from '../../services/scheduleService.js';

describe('Crontab backup pruning (UP-8)', function () {
  this.timeout(10000);

  const made = [];

  async function listBackups() {
    return (await fs.readdir(os.tmpdir()))
      .filter(name => /^monsterbox-crontab-\d+\.bak$/.test(name))
      .sort();
  }

  afterEach(async function () {
    // Remove every backup this test created (including ones the prune kept).
    for (const name of await listBackups()) {
      await fs.rm(path.join(os.tmpdir(), name), { force: true });
    }
    made.length = 0;
  });

  it('keeps only the newest 10 backups after a new one is written', async function () {
    // Seed 14 old backups with ascending timestamps well in the past.
    const base = Date.now() - 10_000_000;
    for (let i = 0; i < 14; i++) {
      const name = `monsterbox-crontab-${base + i}.bak`;
      await fs.writeFile(path.join(os.tmpdir(), name), `old ${i}`, 'utf8');
      made.push(name);
    }

    const target = await backupCrontab('current crontab');
    expect(target, 'the new backup itself must be written').to.be.a('string');

    const remaining = await listBackups();
    expect(remaining.length, 'must prune to the retention cap').to.equal(10);
    // The newest file (the one just written) survives; the oldest are gone.
    expect(remaining[remaining.length - 1]).to.equal(path.basename(target));
    expect(remaining).to.not.include(made[0]);
    expect(remaining).to.not.include(made[4]);
  });
});
