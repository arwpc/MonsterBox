/**
 * Thumbnails of what is on a Goblin's disk.
 *
 * The per-Goblin video lists (Video Library "On the Goblins", Goblin Management's
 * queue modal) showed a film icon for every file because the device serves no
 * pictures. goblinManagerService.getGoblinThumbnail() now answers from a local
 * cache keyed by filename, then from the library's own frame of a same-named
 * video, and only then grabs a frame with ffmpeg on the device. These tests pin
 * the parts that need no device: the filename gate and the cache hit.
 */
import { expect } from 'chai';
import { promises as fs } from 'fs';
import os from 'os';
import path from 'path';
import { createHash } from 'crypto';
import goblinManagerService from '../../services/goblinManagerService.js';

describe('Goblin thumbnails', function () {
  this.timeout(10000);
  let tmpDir;
  let originalDir;

  before(async () => {
    tmpDir = await fs.mkdtemp(path.join(os.tmpdir(), 'goblin-thumbs-'));
    originalDir = goblinManagerService.thumbnailDir;
    goblinManagerService.thumbnailDir = tmpDir;
  });
  after(async () => {
    goblinManagerService.thumbnailDir = originalDir;
    await fs.rm(tmpDir, { recursive: true, force: true });
  });

  it('refuses a name the Goblin player would not list, before touching disk or device', async () => {
    for (const bad of ['', '../etc/passwd', 'notes.txt', '.hidden.mp4']) {
      const r = await goblinManagerService.getGoblinThumbnail('goblin-none', bad);
      expect(r.success, JSON.stringify(bad)).to.equal(false);
      expect(r.error).to.match(/filename/);
    }
  });

  it('serves a cached frame without needing the Goblin at all', async () => {
    const name = 'Cached Clip.mp4';
    const key = createHash('sha1').update(name).digest('hex');
    const jpeg = Buffer.from([0xff, 0xd8, 0xff, 0xd9]);
    await fs.writeFile(path.join(tmpDir, `${key}.jpg`), jpeg);
    const r = await goblinManagerService.getGoblinThumbnail('goblin-that-does-not-exist', name);
    expect(r.success).to.equal(true);
    expect(r.source).to.equal('cache');
    expect(await fs.readFile(r.path)).to.deep.equal(jpeg);
  });

  it('an unknown Goblin with nothing cached is a clean refusal, not a throw', async () => {
    const r = await goblinManagerService.getGoblinThumbnail('goblin-that-does-not-exist', 'Never Seen.mp4');
    expect(r.success).to.equal(false);
    expect(r.error).to.match(/not found|host/i);
  });
});
