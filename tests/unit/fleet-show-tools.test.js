/**
 * The show tools the castle rollout depends on, tested without touching a node:
 *   - scripts/push-show.sh: argument checks, and --dry-run with ssh/scp/rsync
 *     replaced by PATH shims that record their arguments (a dry run must never
 *     copy, restart or write on the node);
 *   - scripts/fleet-events/conductors/*.json: parse, match events.json, and use
 *     only step types the executor dispatches.
 * The live validate-only install against :3100 is tests/system/fleet-conductors.test.js.
 */
import { expect } from 'chai';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { execFile } from 'node:child_process';
import { fileURLToPath } from 'node:url';
import { DISPATCHABLE_STEP_TYPES } from '../../services/scenes/sceneValidator.js';

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..', '..');
const PUSH = path.join(ROOT, 'scripts', 'push-show.sh');
const CONDUCTORS = path.join(ROOT, 'scripts', 'fleet-events', 'conductors');

function run(args, env = {}) {
  return new Promise(resolve => {
    execFile('bash', [PUSH, ...args], { cwd: ROOT, timeout: 20000, env: { ...process.env, MONSTERBOX_SSH_PASSWORD: '', ...env } },
      (err, stdout, stderr) => resolve({ code: err ? (err.code ?? 1) : 0, out: stdout + stderr }));
  });
}

describe('push-show.sh', function () {
  this.timeout(30000);
  let shimDir;
  let callLog;

  before(function () {
    shimDir = fs.mkdtempSync(path.join(os.tmpdir(), 'mb-push-shim-'));
    callLog = path.join(shimDir, 'calls.log');
    for (const tool of ['ssh', 'scp', 'rsync', 'sshpass']) {
      fs.writeFileSync(path.join(shimDir, tool),
        `#!/bin/bash\necho "${tool} $*" >> "${callLog}"\n` +
        (tool === 'ssh' ? 'case "$*" in *health*) echo \'{"status":"OK"}\';; esac\n' : '') +
        (tool === 'rsync' ? 'echo ">fcst...... scenes.json"\n' : '') + 'exit 0\n');
      fs.chmodSync(path.join(shimDir, tool), 0o755);
    }
  });
  after(function () { fs.rmSync(shimDir, { recursive: true, force: true }); });

  it('prints usage and exits 2 without a character and ip', async function () {
    const r = await run([]);
    expect(r.code).to.equal(2);
    expect(r.out).to.match(/usage:/);
  });

  it('refuses a character with no show files', async function () {
    const r = await run(['987001', '192.0.2.1', '--dry-run'], { PATH: `${shimDir}:${process.env.PATH}` });
    expect(r.code).to.equal(1);
    expect(r.out).to.match(/no poses\.json\/scenes\.json/);
  });

  it('--dry-run only compares (rsync -n): no copy, no restart, no write on the node', async function () {
    const registry = JSON.parse(fs.readFileSync(path.join(ROOT, 'data', 'characters.json'), 'utf8'));
    const list = Array.isArray(registry) ? registry : (registry.characters || []);
    const ch = list.find(c => ['poses.json', 'scenes.json'].every(f => fs.existsSync(path.join(ROOT, 'data', `character-${c.id}`, f))));
    if (!ch) this.skip();
    fs.writeFileSync(callLog, '');
    const r = await run([String(ch.id), '192.0.2.1', '--dry-run'], { PATH: `${shimDir}:${process.env.PATH}` });
    expect(r.code, r.out).to.equal(0);
    expect(r.out).to.match(/dry-run: would/);
    const calls = fs.readFileSync(callLog, 'utf8').trim().split('\n').filter(Boolean);
    const rsyncs = calls.filter(c => c.startsWith('rsync '));
    expect(rsyncs, 'one comparison').to.have.length(1);
    expect(rsyncs[0]).to.match(/ -rnc /);
    expect(calls.some(c => c.startsWith('scp ')), 'scp must not run').to.equal(false);
    expect(calls.filter(c => c.startsWith('ssh ')).every(c => /health/.test(c)), 'ssh only for /health').to.equal(true);
  });
});

describe('fleet-event conductor files', function () {
  const events = JSON.parse(fs.readFileSync(path.join(ROOT, 'scripts', 'fleet-events', 'events.json'), 'utf8')).events;
  const files = fs.readdirSync(CONDUCTORS).filter(f => f.endsWith('.json')).sort();

  it('one conductor per event in events.json, ids unique', function () {
    const ids = files.map(f => JSON.parse(fs.readFileSync(path.join(CONDUCTORS, f), 'utf8')).id);
    expect(new Set(ids).size).to.equal(ids.length);
    expect(ids.map(Number).sort()).to.deep.equal(events.map(e => Number(e.sceneId)).sort());
  });

  for (const f of files) {
    it(`${f} parses and uses only dispatchable step types`, function () {
      const scene = JSON.parse(fs.readFileSync(path.join(CONDUCTORS, f), 'utf8'));
      expect(scene.name).to.be.a('string').and.not.empty;
      expect(scene.steps).to.be.an('array').that.is.not.empty;
      const bad = scene.steps.filter(s => !DISPATCHABLE_STEP_TYPES.has(s.type)).map(s => s.type);
      expect(bad).to.deep.equal([]);
    });
  }
});
