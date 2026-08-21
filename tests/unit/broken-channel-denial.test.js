/**
 * The Node and Python views of "which hardware is broken" must agree.
 *
 * Why this is a cross-language test. The Node layer refuses broken parts in scene
 * playback, poses, batch moves, transitions, head-tracking selection and automated
 * test target selection — and on 2026-08-21 a full `npm run test:system` run STILL
 * energized a damaged part's channel, with no matching command anywhere in the
 * Node-side log. The Node layer logs its intent, not what reaches the chip. A trace
 * at the servo daemon's write boundary proved the daemon really did receive that
 * channel twice.
 *
 * The fix put the final deny in `python_wrappers/servo_daemon.py::_write`, because
 * that daemon is the only persistent owner of /dev/i2c-1 — the stdin jaw protocol,
 * the unix socket and one-shot CLI invocations all funnel through it, so a channel
 * denied there cannot be energized by any caller, including one that bypasses every
 * Node guard.
 *
 * That makes `config/physical-faults.json` a contract between two languages. If the
 * Python resolver and the JS resolver ever disagree about a part, the deny silently
 * stops covering it — and the failure mode is a servo quietly stalling against its
 * stop until a fuse opens. These tests fail loudly instead.
 */

import { expect } from 'chai';
import { execFile } from 'child_process';
import { promisify } from 'util';
import { readFile } from 'fs/promises';
import { getPhysicalFault } from '../../services/hardwareService/safetyLimits.js';
import { readConfig } from '../../services/configService.js';

const execFileAsync = promisify(execFile);

/** Ask the Python side, exactly as the daemon does. */
async function pythonBrokenChannels() {
  const { stdout } = await execFileAsync('python3', ['-c', `
import sys, json
sys.path.insert(0, 'python_wrappers')
import mb_safety as m
cid = m.resolve_character_id()
print(json.dumps({
    "characterId": str(cid),
    "brokenPartIds": sorted(m.broken_part_ids(cid)),
    "brokenChannels": {str(k): v for k, v in m.broken_channels(cid).items()},
}))
`], { timeout: 20000 });
  return JSON.parse(stdout.trim().split('\n').pop());
}

describe('Broken-hardware denial is consistent across Node and Python', function () {
  this.timeout(30000);

  let py;
  let characterId;

  before(async function () {
    py = await pythonBrokenChannels();
    characterId = String((await readConfig()).selectedCharacter);
  });

  it('both languages resolve the same character', function () {
    expect(py.characterId).to.equal(characterId);
  });

  it('every part Python calls broken is also broken to Node', async function () {
    for (const partId of py.brokenPartIds) {
      const fault = await getPhysicalFault(characterId, partId);
      expect(fault.broken, `part ${partId} broken in Python but not in Node`).to.equal(true);
      expect(fault.reason, `part ${partId} must carry a reason`).to.be.a('string').and.not.be.empty;
    }
  });

  it('every part Node calls broken is also broken to Python', async function () {
    const raw = JSON.parse(await readFile('config/physical-faults.json', 'utf8'));
    const declared = Object.entries(((raw.characters || {})[characterId] || {}).parts || {})
      .filter(([, meta]) => meta && meta.status === 'broken')
      .map(([id]) => id);
    for (const partId of declared) {
      const fault = await getPhysicalFault(characterId, partId);
      expect(fault.broken).to.equal(true);
      expect(py.brokenPartIds, `part ${partId} broken in Node but not in Python`).to.include(partId);
    }
  });

  it('resolves a PCA9685 channel for every broken part that has one', async function () {
    const parts = JSON.parse(await readFile(`data/character-${characterId}/parts.json`, 'utf8'));
    for (const partId of py.brokenPartIds) {
      const part = parts.find(p => String(p.id) === String(partId));
      if (!part) continue;
      const channel = (part.config || {}).channel ?? part.channel;
      if (channel == null) continue; // actuators/lights with no PCA channel — correctly absent
      expect(Object.keys(py.brokenChannels), `channel ${channel} (part ${partId}) must be denied`)
        .to.include(String(channel));
    }
  });

  it('does not deny a channel belonging to a HEALTHY part', async function () {
    const parts = JSON.parse(await readFile(`data/character-${characterId}/parts.json`, 'utf8'));
    for (const part of parts) {
      const channel = (part.config || {}).channel ?? part.channel;
      if (channel == null) continue;
      const fault = await getPhysicalFault(characterId, part.id);
      if (fault.broken) continue;
      expect(Object.keys(py.brokenChannels),
        `part ${part.id} (${part.name}) is healthy — channel ${channel} must NOT be denied`)
        .to.not.include(String(channel));
    }
  });

  it('the daemon still enforces the deny at its write boundary', async function () {
    // A source assertion is weak on its own, but this is the single chokepoint the
    // whole design leans on: if the call disappears from _write, every Node-side
    // guard is still in place and the leak silently reopens with no test failing.
    const src = await readFile('python_wrappers/servo_daemon.py', 'utf8');
    expect(src, 'servo_daemon._write must consult the broken-channel list')
      .to.include('_broken_channels()');
    expect(src, 'a refusal must be logged, never silent').to.match(/REFUSED ch/);
    // Releasing a broken channel must stay possible — that is how a stall is cleared.
    expect(src, 'the deny must apply only when energizing (off truthy)').to.match(/if off:\s*\n\s*denied = _broken_channels\(\)/);
  });
});
