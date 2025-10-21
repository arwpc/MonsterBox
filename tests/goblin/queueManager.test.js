import assert from 'node:assert';
import fs from 'node:fs';
import path from 'node:path';
import QueueManager from '../../goblin-gold/src/queueManager.js';

class MockMPV {
  constructor() { this.currentVideo = null; this.calls = []; this.onEnd = null; }
  async play(filename, { loop } = {}) { this.currentVideo = filename; this.calls.push({ type: 'play', filename, loop }); return { success: true, playing: filename }; }
  async stop() { this.calls.push({ type: 'stop' }); this.currentVideo = null; }
}

function rmrf(dir) {
  if (fs.existsSync(dir)) {
    for (const entry of fs.readdirSync(dir)) {
      const p = path.join(dir, entry);
      if (fs.lstatSync(p).isDirectory()) rmrf(p); else fs.unlinkSync(p);
    }
    fs.rmdirSync(dir);
  }
}

describe('Goblin QueueManager', function () {
  const baseDir = path.join(process.cwd(), 'tmp', 'goblin-gold-test');

  beforeEach(() => { rmrf(path.join(process.cwd(), 'tmp')); fs.mkdirSync(baseDir, { recursive: true }); });

  it('adds, starts, advances, and stops queue', async function () {
    const mpv = new MockMPV();
    const qm = new QueueManager(mpv, { baseDir });
    await qm.load();

    await qm.add('a.mp4');
    await qm.add('b.mp4');
    assert.strictEqual(qm.queue.videos.length, 2);

    await qm.start({ loopMode: 'none' });
    assert.strictEqual(qm.queue.playing, true);
    assert.ok(mpv.currentVideo);

    // Simulate end of first video
    await qm.onVideoEnd();
    assert.strictEqual(qm.queue.currentIndex, 1);

    // Simulate end of second video -> should stop (no loop)
    await qm.onVideoEnd();
    assert.strictEqual(qm.queue.playing, false);
  });
});

