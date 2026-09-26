/**
 * Unit tests for the name a library video carries on a Goblin's disk.
 *
 * The Goblin player lists its media folder by extension, so a file that lands
 * under any other name is on disk but never playable; and the UUID storage name
 * MonsterBox uses locally is meaningless to the device. sanitizeGoblinFilename is
 * the single gate every deploy goes through.
 */

import { expect } from 'chai';
import { sanitizeGoblinFilename } from '../../services/goblinManagerService.js';

describe('Goblin video deploy — filename gate', function () {
  it('keeps a plain video basename, spaces included', function () {
    expect(sanitizeGoblinFilename('307 Jb Hd.mp4')).to.equal('307 Jb Hd.mp4');
    expect(sanitizeGoblinFilename('  fire.MOV ')).to.equal('fire.MOV');
  });

  it('strips any directory component so a name cannot escape the media folder', function () {
    expect(sanitizeGoblinFilename('../../etc/cron.d/evil.mp4')).to.equal('evil.mp4');
    expect(sanitizeGoblinFilename('/home/remote/media/video/x.mkv')).to.equal('x.mkv');
  });

  it('refuses anything the player would not list', function () {
    expect(sanitizeGoblinFilename('c1efa5eb-4ff4-4112-9c84-15d99f6ec955')).to.equal(null);
    expect(sanitizeGoblinFilename('notes.txt')).to.equal(null);
    expect(sanitizeGoblinFilename('Left Forearm.gcode')).to.equal(null);
    expect(sanitizeGoblinFilename('')).to.equal(null);
    expect(sanitizeGoblinFilename(undefined)).to.equal(null);
    expect(sanitizeGoblinFilename('.mp4')).to.equal(null);
  });

  it('drops control characters that would break the remote path', function () {
    expect(sanitizeGoblinFilename('bad\nname.mp4')).to.equal('badname.mp4');
  });
});
