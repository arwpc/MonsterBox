/**
 * Canonical sink volume restore (v11 — "suite resets the fleet to 65%").
 *
 * config/animatronics.json carries each node's ear-verified speaker level
 * (sinkVolume — a linear wpctl value that can exceed 1.0; one live node's is
 * 1.3, which the 0-100% volume API cannot even express). It used to be
 * applied only at service startup, so anything that changed the level between
 * starts — the fleet master-volume fan-out, a test suite, a stray slider —
 * stuck until the next restart. systemService.applyCanonicalSinkVolume() is
 * the on-demand single attempt behind POST /api/system/volume/canonical, and
 * the orchestration restore fans it out fleet-wide.
 *
 * These tests inject the registry path, hostname, and exec so they can prove
 * the decision logic without touching a real mixer (the unit suite also runs
 * ON the animatronics — a test that ran real wpctl would itself be the
 * defect class it guards against).
 */

import { expect } from 'chai';
import fs from 'fs/promises';
import os from 'os';
import path from 'path';
import systemService from '../../services/systemService.js';

describe('Canonical sink volume restore', function () {
  this.timeout(10000);

  let sandbox;
  let registryPath;
  let calls;
  const fakeExec = async (cmd, args) => { calls.push({ cmd, args }); return { stdout: '' }; };
  const failingExec = async () => { const e = new Error('wpctl: command not found'); throw e; };

  async function writeRegistry(animatronics) {
    await fs.writeFile(registryPath, JSON.stringify({ animatronics }, null, 2), 'utf8');
  }

  beforeEach(async function () {
    sandbox = await fs.mkdtemp(path.join(os.tmpdir(), 'mb-canon-'));
    registryPath = path.join(sandbox, 'animatronics.json');
    calls = [];
  });

  afterEach(async function () {
    await fs.rm(sandbox, { recursive: true, force: true });
  });

  it('applies this node\'s recorded canon, including values above 1.0', async function () {
    await writeRegistry([{ id: 42, name: 'Synthetic Node', hostname: 'test-node', sinkVolume: 1.3 }]);

    const result = await systemService.applyCanonicalSinkVolume({
      registryPath, hostname: 'test-node', execImpl: fakeExec
    });

    expect(result.success).to.equal(true);
    expect(result.sinkVolume).to.equal(1.3);
    expect(calls).to.have.length(1);
    expect(calls[0].cmd).to.equal('wpctl');
    expect(calls[0].args).to.deep.equal(['set-volume', '@DEFAULT_AUDIO_SINK@', '1.3']);
  });

  it('skips a node with no recorded canon — a guessed level is worse than none', async function () {
    await writeRegistry([{ id: 1, name: 'PumpkinHead', hostname: 'test-node', sinkVolume: null }]);

    const result = await systemService.applyCanonicalSinkVolume({
      registryPath, hostname: 'test-node', execImpl: fakeExec
    });

    expect(result.success).to.equal(true);
    expect(result.skipped).to.equal(true);
    expect(calls, 'no mixer command may run without a recorded canon').to.have.length(0);
  });

  it('skips a hostname that is not in the registry', async function () {
    await writeRegistry([{ id: 2, name: 'Mina', hostname: 'somebody-else', sinkVolume: 1.0 }]);

    const result = await systemService.applyCanonicalSinkVolume({
      registryPath, hostname: 'test-node', execImpl: fakeExec
    });

    expect(result.skipped).to.equal(true);
    expect(calls).to.have.length(0);
  });

  it('reports failure honestly when the mixer command fails', async function () {
    await writeRegistry([{ id: 2, name: 'Mina', hostname: 'test-node', sinkVolume: 1.0 }]);

    const result = await systemService.applyCanonicalSinkVolume({
      registryPath, hostname: 'test-node', execImpl: failingExec
    });

    expect(result.success).to.equal(false);
    expect(result.sinkVolume).to.equal(1.0);
    expect(result.error).to.match(/wpctl/);
  });

  it('the real fleet registry still carries the ear-verified canons this restores', async function () {
    // Guards the data contract the whole feature depends on: if sinkVolume is
    // renamed or the live nodes lose their recorded canon, the restore hooks
    // silently become no-ops — fail here instead.
    const APP_ROOT = path.resolve(path.dirname(new URL(import.meta.url).pathname), '..', '..');
    const registry = JSON.parse(await fs.readFile(path.join(APP_ROOT, 'config', 'animatronics.json'), 'utf8'));
    const withCanon = (registry.animatronics || []).filter(a => typeof a.sinkVolume === 'number');
    expect(withCanon.length, 'at least the live nodes must carry a canonical sinkVolume').to.be.at.least(3);
  });
});
