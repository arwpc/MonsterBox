/**
 * Head tracking "always on" — opt-in via super-powers.json headTracking.alwaysOn.
 *
 * The default (flag absent/false) must keep the historical behaviour: lurk sleep
 * and disable turn head tracking off, and nothing starts it at boot. Only an
 * explicit boolean true opts a character in; the operator's toggle OFF wins for
 * the session, and a panic (force) always stops it.
 */
import { expect } from 'chai';
import fs from 'fs/promises';
import path from 'path';
import os from 'os';
import {
  isHeadTrackingAlwaysOn,
  noteOperatorHeadTrackingToggle,
  isOperatorHeadTrackingOff,
  shouldKeepHeadTrackingOnLurkStop,
  shouldStartHeadTrackingAtBoot,
  _resetForTests
} from '../../services/headTrackingAlwaysOn.js';

const LIVE_ENV = { MB_TEST_MODE: '' };

describe('headTracking.alwaysOn decision helper', () => {
  beforeEach(() => _resetForTests());
  after(() => _resetForTests());

  it('is off unless alwaysOn is exactly boolean true', () => {
    expect(isHeadTrackingAlwaysOn(undefined)).to.equal(false);
    expect(isHeadTrackingAlwaysOn(null)).to.equal(false);
    expect(isHeadTrackingAlwaysOn({})).to.equal(false);
    expect(isHeadTrackingAlwaysOn({ alwaysOn: false })).to.equal(false);
    expect(isHeadTrackingAlwaysOn({ alwaysOn: 'true' })).to.equal(false);
    expect(isHeadTrackingAlwaysOn({ alwaysOn: 1 })).to.equal(false);
    expect(isHeadTrackingAlwaysOn({ alwaysOn: true })).to.equal(true);
  });

  it('default characters: lurk stop turns head tracking off (unchanged behaviour)', () => {
    for (const id of [1, 2, 3, 4, 5, 6]) {
      expect(shouldKeepHeadTrackingOnLurkStop({ enabled: true }, id)).to.equal(false);
      expect(shouldStartHeadTrackingAtBoot({ enabled: true }, id, LIVE_ENV)).to.equal(false);
    }
  });

  it('opted-in character keeps head tracking through lurk sleep/disable', () => {
    expect(shouldKeepHeadTrackingOnLurkStop({ alwaysOn: true }, 4)).to.equal(true);
    expect(shouldKeepHeadTrackingOnLurkStop({ alwaysOn: true }, '4')).to.equal(true);
  });

  it('panic (force) always stops it', () => {
    expect(shouldKeepHeadTrackingOnLurkStop({ alwaysOn: true }, 4, { force: true })).to.equal(false);
  });

  it('operator toggle OFF wins for the session, per character; ON clears it', () => {
    noteOperatorHeadTrackingToggle(4, false);
    expect(isOperatorHeadTrackingOff('4')).to.equal(true);
    expect(shouldKeepHeadTrackingOnLurkStop({ alwaysOn: true }, 4)).to.equal(false);
    expect(shouldStartHeadTrackingAtBoot({ alwaysOn: true }, 4, LIVE_ENV)).to.equal(false);
    // Another character is unaffected.
    expect(shouldKeepHeadTrackingOnLurkStop({ alwaysOn: true }, 2)).to.equal(true);

    noteOperatorHeadTrackingToggle('4', true);
    expect(isOperatorHeadTrackingOff(4)).to.equal(false);
    expect(shouldKeepHeadTrackingOnLurkStop({ alwaysOn: true }, 4)).to.equal(true);
  });

  it('boot start: only opted-in, never in test mode, never without a character', () => {
    expect(shouldStartHeadTrackingAtBoot({ alwaysOn: true }, 4, LIVE_ENV)).to.equal(true);
    expect(shouldStartHeadTrackingAtBoot({ alwaysOn: true }, 4, { MB_TEST_MODE: '1' })).to.equal(false);
    expect(shouldStartHeadTrackingAtBoot({ alwaysOn: true }, 4, { MB_TEST_MODE: 'true' })).to.equal(false);
    expect(shouldStartHeadTrackingAtBoot({ alwaysOn: true }, null, LIVE_ENV)).to.equal(false);
    expect(shouldStartHeadTrackingAtBoot({ alwaysOn: true }, '', LIVE_ENV)).to.equal(false);
  });
});

describe('writeHeadTrackingConfig preserves headTracking.alwaysOn', () => {
  const originalCwd = process.cwd();
  let tmp;

  beforeEach(async () => {
    tmp = await fs.mkdtemp(path.join(os.tmpdir(), 'ht-alwayson-'));
    await fs.mkdir(path.join(tmp, 'data', 'character-987'), { recursive: true });
    process.chdir(tmp);
  });

  afterEach(async () => {
    process.chdir(originalCwd);
    await fs.rm(tmp, { recursive: true, force: true });
  });

  async function readStored() {
    const raw = await fs.readFile(path.join(tmp, 'data', 'character-987', 'super-powers.json'), 'utf8');
    return JSON.parse(raw).headTracking;
  }

  it('a setup-page save without the flag keeps the stored opt-in; readers see it', async () => {
    const svc = await import('../../services/headAnimationSuperPowerService.js');
    await fs.writeFile(path.join(tmp, 'data', 'character-987', 'super-powers.json'),
      JSON.stringify({ headTracking: { alwaysOn: true, rangeDeg: 40 }, other: { x: 1 } }));

    await svc.writeHeadTrackingConfig(987, { enabled: true, panServoId: 7, rangeDeg: 50 });
    const stored = await readStored();
    expect(stored.alwaysOn).to.equal(true);
    expect(stored.rangeDeg).to.equal(50);

    const read = await svc.readHeadTrackingConfig(987);
    expect(isHeadTrackingAlwaysOn(read)).to.equal(true);
  });

  it('an explicit alwaysOn:false in the save turns it off', async () => {
    const svc = await import('../../services/headAnimationSuperPowerService.js');
    await fs.writeFile(path.join(tmp, 'data', 'character-987', 'super-powers.json'),
      JSON.stringify({ headTracking: { alwaysOn: true } }));
    await svc.writeHeadTrackingConfig(987, { alwaysOn: false });
    expect((await readStored()).alwaysOn).to.equal(false);
  });

  it('a character that never opted in gets no alwaysOn key', async () => {
    const svc = await import('../../services/headAnimationSuperPowerService.js');
    await svc.writeHeadTrackingConfig(987, { enabled: false });
    expect(await readStored()).to.not.have.property('alwaysOn');
  });
});
