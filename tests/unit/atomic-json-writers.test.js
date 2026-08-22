/**
 * UP-6 / UP-4 — power-loss-safe JSON persistence and SD-write reduction.
 *
 * Mina has already taken hard power cuts. A plain fs.writeFile interrupted
 * mid-write leaves torn JSON, and most read paths here fall back to "empty"
 * silently — so a power cut could erase the fleet registry, a character's
 * voice, or the goblin registry without a single error in the log. Every
 * operator-facing JSON writer must go through services/atomicStore.js
 * (temp file + rename), which the rest of the critical files already use.
 *
 * UP-4 is the write-VOLUME half: performance-history.json was rewritten in
 * full (~1.5 MB, non-atomic) every 5 minutes — ~427 MB/day, the single
 * largest source of SD wear on the node. It now lives in RAM and flushes
 * atomically once per PERF_FLUSH_EVERY samples and on graceful shutdown.
 */

import { expect } from 'chai';
import fs from 'fs/promises';
import path from 'path';
import { fileURLToPath } from 'url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const APP_ROOT = path.resolve(__dirname, '..', '..');

describe('Atomic JSON writers (UP-6)', function () {
  this.timeout(20000);

  describe('source contract — the raw-write defect must not return', function () {
    // Files fixed under UP-6/UP-4. The single-line `fs.writeFile(...JSON.stringify...)`
    // shape is exactly what the audit flagged; this trips if it reappears.
    const FIXED_WRITERS = [
      'services/scenes/sceneAnalyticsService.js',
      'services/characterService.js',
      'services/aiConfigStore.js',
      'services/goblinManagerService.js',
      'services/goblinPlaylistService.js',
      'services/nodeDiscoveryService.js',
      'services/systemService.js'
    ];

    for (const rel of FIXED_WRITERS) {
      it(`${rel} writes JSON only through the atomic store`, async function () {
        const src = await fs.readFile(path.join(APP_ROOT, rel), 'utf8');
        expect(src, `${rel} must import the atomic store`).to.include('writeJsonAtomic');
        expect(src, `${rel} has a raw fs.writeFile(...JSON.stringify...) again`)
          .to.not.match(/writeFile\s*\([^)\n]*JSON\.stringify/);
      });
    }

    it('sceneExecutor makes ONE combined analytics write per execution, not two', async function () {
      const src = await fs.readFile(
        path.join(APP_ROOT, 'services/scenes/sceneExecutor.js'), 'utf8');
      expect(src).to.include('recordSceneExecution');
      // The old shape was logSceneExecution followed by updateSceneUsageStats —
      // two full read-modify-writes of the same file on every scene execution.
      expect(src, 'the second per-execution write crept back in')
        .to.not.include('updateSceneUsageStats');
    });
  });

  describe('scene analytics — combined per-execution record', function () {
    const analyticsPath = path.join(APP_ROOT, 'data', 'scene-analytics.json');
    let original = null;

    before(async function () {
      try { original = await fs.readFile(analyticsPath, 'utf8'); } catch (_) { original = null; }
    });

    after(async function () {
      try {
        if (original !== null) await fs.writeFile(analyticsPath, original, 'utf8');
        else await fs.rm(analyticsPath, { force: true });
      } catch (_) { /* best effort */ }
    });

    it('recordSceneExecution lands the execution log AND usage stats in one call', async function () {
      const { recordSceneExecution } = await import('../../services/scenes/sceneAnalyticsService.js');

      // Synthetic ids well clear of any real character/scene.
      const log = await recordSceneExecution(999999, 42, {
        startTime: new Date().toISOString(),
        endTime: new Date().toISOString(),
        duration: 123,
        stepsExecuted: 2,
        totalSteps: 2,
        success: true,
        errors: []
      });

      expect(log).to.be.an('object');
      expect(log.sceneId).to.equal(999999);
      expect(log.characterId).to.equal(42);

      const onDisk = JSON.parse(await fs.readFile(analyticsPath, 'utf8'));
      const found = onDisk.executions.filter(e => e.sceneId === 999999 && e.characterId === 42);
      expect(found, 'execution log must be persisted').to.have.length(1);
      expect(onDisk.usage['42_999999'], 'usage stats must be persisted by the same call').to.exist;
      expect(onDisk.usage['42_999999'].executionCount).to.equal(1);
    });

    it('leaves no temp-file residue next to the analytics file', async function () {
      const files = await fs.readdir(path.dirname(analyticsPath));
      const residue = files.filter(f => f.includes('scene-analytics.json') && f.endsWith('.tmp'));
      expect(residue, `stale temp files: ${residue.join(', ')}`).to.have.length(0);
    });
  });

  describe('characters.json — the fleet registry', function () {
    const registryPath = path.join(APP_ROOT, 'data', 'characters.json');
    let original = null;

    before(async function () {
      try { original = await fs.readFile(registryPath, 'utf8'); } catch (_) { original = null; }
    });

    after(async function () {
      try {
        if (original !== null) await fs.writeFile(registryPath, original, 'utf8');
        else await fs.rm(registryPath, { force: true });
      } catch (_) { /* best effort */ }
    });

    it('saveCharacters round-trips the registry through the atomic path', async function () {
      if (original === null) this.skip();
      const { saveCharacters } = await import('../../services/characterService.js');
      const parsed = JSON.parse(original);

      await saveCharacters(parsed);

      const after = JSON.parse(await fs.readFile(registryPath, 'utf8'));
      expect(after).to.deep.equal(parsed);

      const files = await fs.readdir(path.dirname(registryPath));
      const residue = files.filter(f => f.includes('characters.json') && f.endsWith('.tmp'));
      expect(residue, `stale temp files: ${residue.join(', ')}`).to.have.length(0);
    });
  });
});

describe('Performance history SD writes (UP-4)', function () {
  this.timeout(20000);

  const historyPath = path.join(APP_ROOT, 'data', 'performance-history.json');
  let systemService;
  let original = null;

  before(async function () {
    systemService = (await import('../../services/systemService.js')).default;
    try { original = await fs.readFile(historyPath, 'utf8'); } catch (_) { original = null; }
  });

  after(async function () {
    try {
      if (original !== null) await fs.writeFile(historyPath, original, 'utf8');
      else await fs.rm(historyPath, { force: true });
    } catch (_) { /* best effort */ }
    // Never leave test samples in the RAM cache for later suites.
    systemService._resetPerfHistoryCacheForTests();
  });

  it('records to RAM without an SD write, serves reads from RAM, and flushes atomically', async function () {
    const seed = [{ timestamp: Date.now() - 60000, cpu: 1, memory: 1 }];
    await fs.writeFile(historyPath, JSON.stringify(seed), 'utf8');
    systemService._resetPerfHistoryCacheForTests();

    const snapshot = await systemService.recordPerformanceSnapshot();
    expect(snapshot, 'snapshot must still be produced').to.be.an('object');
    expect(snapshot.timestamp).to.be.a('number');

    // The defect was one whole-file write per snapshot. Recording must NOT
    // have touched the file.
    const onDiskAfterRecord = JSON.parse(await fs.readFile(historyPath, 'utf8'));
    expect(onDiskAfterRecord, 'recording a snapshot must not write the SD card').to.have.length(1);

    // But reads see the new sample immediately — history is served from RAM.
    const served = await systemService.getPerformanceHistory('24h');
    expect(served.length, 'RAM cache must serve the un-flushed sample').to.equal(2);

    // An explicit flush persists everything, still parseable (i.e. not torn).
    await systemService.flushPerformanceHistory();
    const flushed = JSON.parse(await fs.readFile(historyPath, 'utf8'));
    expect(flushed).to.have.length(2);

    // A second flush with nothing new must be a no-op (no gratuitous writes).
    const statBefore = await fs.stat(historyPath);
    await systemService.flushPerformanceHistory();
    const statAfter = await fs.stat(historyPath);
    expect(statAfter.mtimeMs, 'flush with no new samples must not rewrite the file')
      .to.equal(statBefore.mtimeMs);

    const files = await fs.readdir(path.dirname(historyPath));
    const residue = files.filter(f => f.includes('performance-history.json') && f.endsWith('.tmp'));
    expect(residue, `stale temp files: ${residue.join(', ')}`).to.have.length(0);
  });

  it('prunes samples older than the 30-day retention window on record', async function () {
    const stale = { timestamp: Date.now() - 31 * 24 * 60 * 60 * 1000, cpu: 9, memory: 9 };
    const fresh = { timestamp: Date.now() - 60000, cpu: 2, memory: 2 };
    await fs.writeFile(historyPath, JSON.stringify([stale, fresh]), 'utf8');
    systemService._resetPerfHistoryCacheForTests();

    await systemService.recordPerformanceSnapshot();
    await systemService.flushPerformanceHistory();

    const flushed = JSON.parse(await fs.readFile(historyPath, 'utf8'));
    expect(flushed.some(e => e.cpu === 9), 'the 31-day-old sample must be pruned').to.equal(false);
    expect(flushed.some(e => e.cpu === 2), 'the fresh sample must survive').to.equal(true);
  });
});
