/**
 * The live-data guard (tests/helpers/liveDataGuard.mjs) is what stands between a
 * killed test run and the node's real parts/poses/scenes. Prove its three paths
 * against a throwaway repo root: in-run restore, dead-run recovery, and the
 * operator-edit exemption.
 */
import { expect } from 'chai';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { execFileSync } from 'node:child_process';
import { listGuardedFiles, startGuard, recoverDeadRuns } from '../helpers/liveDataGuard.mjs';

function mkRoot() {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), 'mb-guard-root-'));
  fs.mkdirSync(path.join(root, 'config'));
  fs.mkdirSync(path.join(root, 'data', 'character-7', 'ai-config'), { recursive: true });
  fs.writeFileSync(path.join(root, 'config', 'app-config.json'), '{"selectedCharacter":7}');
  fs.writeFileSync(path.join(root, 'data', 'characters.json'), '[{"id":7}]');
  fs.writeFileSync(path.join(root, 'data', 'character-7', 'parts.json'), '[{"id":"1"}]');
  fs.writeFileSync(path.join(root, 'data', 'character-7', 'lurk-state.json'), '{"state":"lurking"}');
  fs.writeFileSync(path.join(root, 'data', 'character-7', 'ai-config', 'tts-config.json'), '{"voice":"x"}');
  return root;
}

describe('live-data guard', function () {
  let root;
  let dir;
  const quiet = { warn() {}, error() {} };

  beforeEach(function () {
    root = mkRoot();
    dir = fs.mkdtempSync(path.join(os.tmpdir(), 'mb-guard-dir-'));
  });
  afterEach(function () {
    fs.rmSync(root, { recursive: true, force: true });
    fs.rmSync(dir, { recursive: true, force: true });
  });

  it('guards character configuration and skips runtime state', function () {
    const files = listGuardedFiles(root);
    expect(files).to.include(path.join('data', 'character-7', 'parts.json'));
    expect(files).to.include(path.join('data', 'character-7', 'ai-config', 'tts-config.json'));
    expect(files).to.include('config/app-config.json');
    expect(files).to.not.include(path.join('data', 'character-7', 'lurk-state.json'));
  });

  it('restores a mutated file, removes a created one, and reports both', function () {
    const g = startGuard({ root, dir });
    const parts = path.join(root, 'data', 'character-7', 'parts.json');
    fs.writeFileSync(parts, '[{"id":"1"},{"id":"987655","name":"synthetic"}]');
    const created = path.join(root, 'data', 'character-7', 'poses.json');
    fs.writeFileSync(created, '{}');

    const diff = g.diff();
    expect(diff.map(r => r.rel).sort()).to.deep.equal(
      [path.join('data', 'character-7', 'parts.json'), path.join('data', 'character-7', 'poses.json')]);

    const report = g.restoreNow();
    expect(report.find(r => r.rel.endsWith('parts.json')).action).to.equal('restored');
    expect(report.find(r => r.rel.endsWith('poses.json')).action).to.equal('removed');
    expect(fs.readFileSync(parts, 'utf8')).to.equal('[{"id":"1"}]');
    expect(fs.existsSync(created)).to.equal(false);
    // The content found is kept as evidence, never thrown away.
    expect(fs.readdirSync(g.runDir).some(f => f.includes('parts.json.found-'))).to.equal(true);
    g.finish(report);
  });

  it('never overwrites a change it cannot attribute to this process (a concurrent writer)', function () {
    const g = startGuard({ root, dir });
    const locks = path.join(root, 'config', 'app-config.json');
    // Another process (an operator tool, the live service) writes during the run.
    execFileSync(process.execPath, ['-e', `require('fs').writeFileSync(${JSON.stringify(locks)}, '{"selectedCharacter":8}')`]);
    const report = g.restoreNow();
    expect(report).to.have.length(1);
    expect(report[0].rel).to.equal('config/app-config.json');
    expect(report[0].action).to.equal('left');
    expect(fs.readFileSync(locks, 'utf8')).to.equal('{"selectedCharacter":8}');
    g.finish(report);
  });

  it('an untouched run leaves no snapshot behind', function () {
    const g = startGuard({ root, dir });
    const report = g.restoreNow();
    expect(report).to.deep.equal([]);
    g.finish(report);
    expect(fs.existsSync(g.runDir)).to.equal(false);
  });

  it('heals what a KILLED run left (written inside its window) before the next run', function () {
    const g = startGuard({ root, dir });
    // Pretend the run that owns this snapshot started before this boot and was SIGKILLed.
    const manifestPath = path.join(g.runDir, 'manifest.json');
    const manifest = JSON.parse(fs.readFileSync(manifestPath, 'utf8'));
    manifest.pid = 2147483646;
    manifest.startedAt = Date.now() - os.uptime() * 1000 - 60_000;
    fs.writeFileSync(manifestPath, JSON.stringify(manifest));
    const parts = path.join(root, 'data', 'character-7', 'parts.json');
    fs.writeFileSync(parts, '[{"id":"1"},{"id":"987657"}]');
    const inWindow = new Date(manifest.startedAt + 5_000);
    fs.utimesSync(parts, inWindow, inWindow);

    const [run] = recoverDeadRuns({ root, dir, log: quiet });
    expect(run.report).to.deep.equal([
      { rel: path.join('data', 'character-7', 'parts.json'), action: 'restored', reason: 'changed' }]);
    expect(fs.readFileSync(parts, 'utf8')).to.equal('[{"id":"1"}]');
  });

  it('a killed run\'s recovery leaves files it never wrote alone', function () {
    const g = startGuard({ root, dir, track: false });
    const manifestPath = path.join(g.runDir, 'manifest.json');
    const manifest = JSON.parse(fs.readFileSync(manifestPath, 'utf8'));
    manifest.pid = 2147483646;
    manifest.startedAt = Date.now() - os.uptime() * 1000 - 60_000;
    fs.writeFileSync(manifestPath, JSON.stringify(manifest));
    const parts = path.join(root, 'data', 'character-7', 'parts.json');
    fs.writeFileSync(parts, '[{"id":"1"},{"id":"9"}]');
    const inWindow = new Date(manifest.startedAt + 5_000);
    fs.utimesSync(parts, inWindow, inWindow);
    const [run] = recoverDeadRuns({ root, dir, log: quiet });
    expect(run.report[0].action).to.equal('left');
    expect(fs.readFileSync(parts, 'utf8')).to.equal('[{"id":"1"},{"id":"9"}]');
  });

  it('never clobbers an operator edit made after the dead run\'s window', function () {
    const g = startGuard({ root, dir });
    const manifestPath = path.join(g.runDir, 'manifest.json');
    const manifest = JSON.parse(fs.readFileSync(manifestPath, 'utf8'));
    manifest.pid = 2147483646;
    manifest.startedAt = Date.now() - os.uptime() * 1000 - 3 * 3600_000;
    fs.writeFileSync(manifestPath, JSON.stringify(manifest));
    const parts = path.join(root, 'data', 'character-7', 'parts.json');
    fs.writeFileSync(parts, '[{"id":"1"},{"id":"2","name":"operator added"}]'); // mtime = now

    const [run] = recoverDeadRuns({ root, dir, log: quiet });
    expect(run.report[0].action).to.equal('left');
    expect(fs.readFileSync(parts, 'utf8')).to.include('operator added');
  });
});
