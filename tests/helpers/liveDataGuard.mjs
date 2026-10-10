/**
 * Live-data guard — a test run must leave the node's operator state byte-identical.
 *
 * Why this exists (2026-10-10): the gate's timeout killed mocha in the middle of
 * the multi-turn servo test. That test injects synthetic parts into the SELECTED
 * character's live parts.json and only takes them out in after(), so the kill left
 * parts 987655/987657 in the node character's real parts.json. The next run then failed on a
 * shifted channel, and the running service had been serving the phantom parts.
 *
 * Per-test snapshot/restore only holds when after() runs. This guard does not
 * depend on that:
 *
 *   1. BEFORE the run it copies every guarded operator file into a durable
 *      directory OUTSIDE the repo and outside /tmp (a reboot wipes /tmp; the deploy
 *      rsyncs the repo), together with a manifest naming this pid.
 *   2. AFTER the run (mocha root afterAll hook) it compares every file byte for
 *      byte. Anything different is restored from the snapshot (the content found is
 *      kept next to the snapshot so nothing is ever lost) and the run FAILS LOUDLY,
 *      naming each file.
 *   3. On SIGINT/SIGTERM/SIGHUP (Ctrl-C, the gate's spawnSync timeout) it restores
 *      synchronously before the process dies.
 *   4. On the NEXT run, if a previous run's manifest is still there and its pid is
 *      dead (SIGKILL, OOM, power loss), it restores every file that differs and was
 *      last written inside that run's window, before any test starts. A file written
 *      after the window is left alone (an operator edit) and reported.
 *
 * Guarded: config/*.json that tests could write, the registry, the audio library
 * index, the calibration and actuator stores, and every character's configuration
 * JSON (parts, poses, scenes, super-powers, gestures, movement, calibrations,
 * ai-config/*). NOT guarded: runtime state the live service writes on its own
 * (`*-state.json`, `ai_agent_state.json`, layouts, telemetry, logs, caches).
 *
 * Overrides: MB_TEST_GUARD_DIR (where snapshots live), MB_TEST_GUARD=off (disable;
 * prints a warning — never use it on a live node).
 */
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import crypto from 'node:crypto';
import { syncBuiltinESMExports } from 'node:module';
import { fileURLToPath } from 'node:url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
export const REPO_ROOT = path.resolve(__dirname, '..', '..');

// A dead run's writes are recognised by mtime inside [startedAt, startedAt + this].
// The full unit suite takes ~70 s on an RPi4B; system ~2 min. 30 min is generous.
const MAX_RUN_WINDOW_MS = 30 * 60 * 1000;

const CONFIG_FILES = [
  'config/app-config.json',
  'config/animatronics.json',
  'config/character-locks.json',
  'config/hardware-safety.json',
  'config/physical-faults.json',
  'config/scene-hazards.json',
];
const DATA_FILES = [
  'data/characters.json',
  'data/parts.json',
  'data/scene-templates.json',
  'data/goblin-playlists.json',
  'data/audio-library/library.json',
  'data/calibration_profiles.json',
  'data/actuator-positions.json',
];
// Keys the LIVE SERVICE restamps on its own while a suite runs (not operator
// state): a difference confined to these keys is not a mutation. The service
// re-stamps a sensor's calibration profile `updatedAt` when POST /api/parts/:id/test
// exercises it (seen 2026-10-10, tests/system/parts-api.test.js).
const IGNORE_KEYS = { 'data/calibration_profiles.json': ['updatedAt'] };

function stripKeys(value, keys) {
  if (Array.isArray(value)) return value.map(v => stripKeys(v, keys));
  if (value && typeof value === 'object') {
    const out = {};
    for (const [k, v] of Object.entries(value)) if (!keys.includes(k)) out[k] = stripKeys(v, keys);
    return out;
  }
  return value;
}

/** True when two versions differ only in keys the service restamps itself. */
function equivalent(rel, snapshotBuf, currentBuf) {
  const keys = IGNORE_KEYS[rel.split(path.sep).join('/')];
  if (!keys || !snapshotBuf || !currentBuf) return false;
  try {
    return JSON.stringify(stripKeys(JSON.parse(snapshotBuf.toString('utf8')), keys)) ===
      JSON.stringify(stripKeys(JSON.parse(currentBuf.toString('utf8')), keys));
  } catch { return false; }
}

// Character-dir JSON that is runtime state (written by the live service on its own).
const RUNTIME_STATE = /(-state\.json$|^ai_agent_state\.json$|^manual-controls-layout\.json$)/;

function guardRoot() {
  if (process.env.MB_TEST_GUARD_DIR) return path.resolve(process.env.MB_TEST_GUARD_DIR);
  const repoKey = crypto.createHash('sha1').update(REPO_ROOT).digest('hex').slice(0, 10);
  return path.join(os.homedir(), '.cache', 'monsterbox-test-guard', repoKey);
}

/** Is this repo-relative path one the guard protects? */
export function isGuardedRel(rel) {
  const posix = rel.split(path.sep).join('/');
  if (CONFIG_FILES.includes(posix) || DATA_FILES.includes(posix)) return true;
  const m = posix.match(/^data\/character-\d+\/(ai-config\/)?([^/]+\.json)$/);
  return !!m && (m[1] ? true : !RUNTIME_STATE.test(m[2]));
}

/*
 * Attribution. The guard restores ONLY files this test process itself wrote. A
 * difference it cannot attribute (a server-side write caused by an HTTP test, or a
 * concurrent operator/agent refreshing a lock or pushing a show while the suite
 * runs) is reported and fails the run, but is never overwritten: on 2026-10-10 an
 * unattributed restore rolled back a lock-fingerprint refresh made by the mission
 * lead during a system-suite run. Writes are seen by wrapping the fs entry points
 * every test and service in this process uses (atomic writers end in a rename, so
 * the rename destination counts).
 */
let fsTracker = null;
function installFsTracker() {
  if (fsTracker) return fsTracker;
  const listeners = new Set();
  const note = (target) => {
    if (target == null || typeof target === 'number') return;
    let abs;
    try { abs = path.resolve(String(target instanceof URL ? fileURLToPath(target) : target)); } catch { return; }
    for (const fn of listeners) fn(abs);
  };
  const wrap = (obj, name, argIndex) => {
    const orig = obj[name];
    if (typeof orig !== 'function' || orig.__mbGuardWrapped) return;
    const wrapped = function (...args) { note(args[argIndex]); return orig.apply(this, args); };
    wrapped.__mbGuardWrapped = true;
    obj[name] = wrapped;
  };
  for (const [name, idx] of [['writeFileSync', 0], ['writeFile', 0], ['appendFileSync', 0], ['appendFile', 0],
    ['renameSync', 1], ['rename', 1], ['copyFileSync', 1], ['copyFile', 1], ['unlinkSync', 0], ['unlink', 0],
    ['rmSync', 0], ['rm', 0], ['createWriteStream', 0]]) wrap(fs, name, idx);
  for (const [name, idx] of [['writeFile', 0], ['appendFile', 0], ['rename', 1], ['copyFile', 1], ['unlink', 0], ['rm', 0]]) {
    wrap(fs.promises, name, idx);
  }
  syncBuiltinESMExports();
  fsTracker = { listeners };
  return fsTracker;
}

/** Every guarded file that exists right now, as repo-relative paths. */
export function listGuardedFiles(root = REPO_ROOT) {
  const out = [];
  for (const rel of [...CONFIG_FILES, ...DATA_FILES]) {
    if (fs.existsSync(path.join(root, rel))) out.push(rel);
  }
  const dataDir = path.join(root, 'data');
  let entries = [];
  try { entries = fs.readdirSync(dataDir, { withFileTypes: true }); } catch { /* no data dir */ }
  for (const ent of entries) {
    if (!ent.isDirectory() || !/^character-\d+$/.test(ent.name)) continue;
    const charDir = path.join(dataDir, ent.name);
    for (const f of fs.readdirSync(charDir, { withFileTypes: true })) {
      if (f.isFile() && f.name.endsWith('.json') && !RUNTIME_STATE.test(f.name)) {
        out.push(path.join('data', ent.name, f.name));
      }
    }
    const aiDir = path.join(charDir, 'ai-config');
    if (fs.existsSync(aiDir)) {
      for (const f of fs.readdirSync(aiDir, { withFileTypes: true })) {
        if (f.isFile() && f.name.endsWith('.json')) out.push(path.join('data', ent.name, 'ai-config', f.name));
      }
    }
  }
  return out.sort();
}

const sha = buf => crypto.createHash('sha256').update(buf).digest('hex');
const snapName = rel => rel.replace(/[\\/]/g, '__');

function pidAlive(pid) {
  if (!pid || pid === process.pid) return pid === process.pid;
  try { process.kill(pid, 0); return true; } catch (err) { return err.code === 'EPERM'; }
}

function readFileOrNull(abs) {
  try { return fs.readFileSync(abs); } catch (err) { if (err.code === 'ENOENT') return null; throw err; }
}

function writeAtomicSync(abs, buf) {
  const tmp = `${abs}.guard-restore-${process.pid}.tmp`;
  fs.writeFileSync(tmp, buf);
  fs.renameSync(tmp, abs);
}

/**
 * Compare a manifest's snapshot with disk. `restore` puts the snapshot back
 * (a file the run CREATED in a guarded location is removed). `onlyIf(rel, stat)`
 * can veto a restore. Returns [{rel, action, reason}] for every differing file.
 */
function reconcile(runDir, manifest, root, { restore, onlyIf } = {}) {
  const report = [];
  const stamp = new Date().toISOString().replace(/[:.]/g, '-');
  // Files that exist now but were not in the snapshot (e.g. a new character-N/x.json).
  const now = new Set(listGuardedFiles(root));
  const all = new Set([...Object.keys(manifest.files), ...now]);
  for (const rel of all) {
    const abs = path.join(root, rel);
    const expected = manifest.files[rel]; // sha or undefined (did not exist)
    const current = readFileOrNull(abs);
    const currentSha = current ? sha(current) : undefined;
    if (currentSha === expected) continue;
    if (expected && current && equivalent(rel, readFileOrNull(path.join(runDir, snapName(rel))), current)) continue;
    let stat = null;
    try { stat = fs.statSync(abs); } catch { /* deleted */ }
    if (!restore || (onlyIf && !onlyIf(rel, stat))) {
      report.push({ rel, action: 'left', reason: (expected ? (current ? 'changed' : 'deleted') : 'created') +
        (restore ? ' (not written by this test process: NOT restored, check it by hand against the snapshot)' : '') });
      continue;
    }
    if (current) fs.writeFileSync(path.join(runDir, `${snapName(rel)}.found-${stamp}`), current);
    if (expected) {
      writeAtomicSync(abs, fs.readFileSync(path.join(runDir, snapName(rel))));
      report.push({ rel, action: 'restored', reason: current ? 'changed' : 'deleted' });
    } else {
      fs.rmSync(abs, { force: true });
      report.push({ rel, action: 'removed', reason: 'created by the run' });
    }
  }
  return report;
}

function readJournal(runDir) {
  try {
    return fs.readFileSync(path.join(runDir, 'written.log'), 'utf8').split('\n').filter(Boolean);
  } catch { return []; }
}

function loadManifest(runDir) {
  try { return JSON.parse(fs.readFileSync(path.join(runDir, 'manifest.json'), 'utf8')); } catch { return null; }
}

/** Heal whatever a dead run left behind. Exported for the unit test. */
export function recoverDeadRuns({ root = REPO_ROOT, dir = guardRoot(), log = console } = {}) {
  const results = [];
  let runs = [];
  try { runs = fs.readdirSync(dir, { withFileTypes: true }).filter(d => d.isDirectory()); } catch { return results; }
  for (const d of runs) {
    const runDir = path.join(dir, d.name);
    const manifest = loadManifest(runDir);
    if (!manifest) {
      // A finished run that kept evidence (manifest.done.json) or a recovered run: keep it.
      if (fs.existsSync(path.join(runDir, 'manifest.done.json')) || /-recovered-/.test(d.name)) continue;
      fs.rmSync(runDir, { recursive: true, force: true });
      continue;
    }
    if (manifest.root !== root) continue;
    // A run that started before this boot is dead whatever its pid now names (pids are reused).
    const bootedAt = Date.now() - os.uptime() * 1000;
    const concurrent = manifest.pid !== process.pid && manifest.startedAt > bootedAt && pidAlive(manifest.pid);
    if (concurrent) continue; // a concurrent run owns it
    const windowEnd = manifest.startedAt + MAX_RUN_WINDOW_MS;
    const journal = new Set(readJournal(runDir));
    const report = reconcile(runDir, manifest, root, {
      restore: true,
      // Only what the dead run itself wrote (its journal), and only if nothing has
      // written the file since its window: a later write is an operator edit.
      onlyIf: (rel, stat) => journal.has(rel) &&
        (!stat || (stat.mtimeMs >= manifest.startedAt - 1000 && stat.mtimeMs <= windowEnd)),
    });
    for (const r of report) {
      const msg = `[live-data-guard] previous test run (pid ${manifest.pid}, ${new Date(manifest.startedAt).toISOString()}) died; ${r.rel}: ${r.reason} -> ${r.action}`;
      (r.action === 'left' ? log.warn : log.error).call(log, msg);
    }
    results.push({ pid: manifest.pid, report, runDir });
    // Keep the run dir only if it holds evidence (found copies); otherwise drop it.
    if (!report.some(r => r.action !== 'left')) fs.rmSync(runDir, { recursive: true, force: true });
    else fs.renameSync(runDir, `${runDir}-recovered-${Date.now()}`);
  }
  return results;
}

/** Snapshot every guarded file; returns a handle with check()/restoreNow(). */
export function startGuard({ root = REPO_ROOT, dir = guardRoot(), track = true } = {}) {
  const runDir = path.join(dir, `run-${process.pid}-${Date.now()}`);
  fs.mkdirSync(runDir, { recursive: true });
  const files = {};
  for (const rel of listGuardedFiles(root)) {
    const buf = fs.readFileSync(path.join(root, rel));
    fs.writeFileSync(path.join(runDir, snapName(rel)), buf);
    files[rel] = sha(buf);
  }
  const manifest = { pid: process.pid, root, startedAt: Date.now(), files };
  // Manifest last: a manifest on disk always has a complete snapshot beside it.
  writeAtomicSync(path.join(runDir, 'manifest.json'), Buffer.from(JSON.stringify(manifest, null, 2)));
  const written = new Set();
  const journalPath = path.join(runDir, 'written.log');
  let listener = null;
  if (track) {
    const tracker = installFsTracker();
    listener = (abs) => {
      const rel = path.relative(root, abs);
      if (rel.startsWith('..') || path.isAbsolute(rel) || !isGuardedRel(rel) || written.has(rel)) return;
      written.add(rel);
      // The journal lives outside the root, so this append is never noted itself.
      try { fs.appendFileSync(journalPath, rel + '\n'); } catch { /* journal is best effort */ }
    };
    tracker.listeners.add(listener);
  }
  return {
    runDir,
    count: Object.keys(files).length,
    written,
    /** Restore what THIS process wrote; report every other difference. */
    restoreNow() { return reconcile(runDir, manifest, root, { restore: true, onlyIf: rel => written.has(rel) }); },
    /** Report differences without touching disk. */
    diff() { return reconcile(runDir, manifest, root, { restore: false }); },
    /** Drop the snapshot when everything matched; keep it as evidence otherwise. */
    finish(report) {
      if (listener && fsTracker) fsTracker.listeners.delete(listener);
      if (!report.length) fs.rmSync(runDir, { recursive: true, force: true });
      else fs.renameSync(path.join(runDir, 'manifest.json'), path.join(runDir, 'manifest.done.json'));
    },
  };
}

// ── Broken-part rule ────────────────────────────────────────────────────────
// No test may command a part listed broken in config/physical-faults.json (or a
// scene-hazards part). The servo daemon's veto holds, but a veto is the last line,
// not the test plan. Commands are seen in the node's own logs: the parts test
// endpoint logs "🧪 Testing part <id> (...)" to monsterbox.log and the daemon logs
// "REFUSED ch<N> ... part <id>" to monsterbox.err. Scan what was appended during
// the run.
const NODE_LOGS = ['/var/log/monsterbox.log', '/var/log/monsterbox.err'];

export function logOffsets(logs = NODE_LOGS) {
  const out = {};
  for (const f of logs) { try { out[f] = fs.statSync(f).size; } catch { /* no log here */ } }
  return out;
}

export async function brokenPartCommands(offsets, { logs = NODE_LOGS } = {}) {
  const { untouchablePartIds } = await import('./testableParts.mjs');
  let charId = null;
  try { charId = JSON.parse(fs.readFileSync(path.join(REPO_ROOT, 'config', 'app-config.json'), 'utf8')).selectedCharacter; } catch { /* none */ }
  const bad = untouchablePartIds(charId);
  const hits = [];
  if (!bad.size) return hits;
  for (const f of logs) {
    if (offsets[f] == null) continue;
    let text = '';
    try {
      const fd = fs.openSync(f, 'r');
      const size = fs.fstatSync(fd).size;
      const start = size >= offsets[f] ? offsets[f] : 0; // rotated: read it all
      const len = Math.min(size - start, 8 * 1024 * 1024);
      const buf = Buffer.alloc(Math.max(0, len));
      fs.readSync(fd, buf, 0, buf.length, size - len);
      fs.closeSync(fd);
      text = buf.toString('utf8');
    } catch { continue; }
    for (const line of text.split('\n')) {
      const m = line.match(/Testing part (\S+) \(/) || line.match(/REFUSED ch\d+.*?part (\S+)/);
      if (m && bad.has(String(m[1]))) hits.push(line.trim().slice(0, 200));
    }
  }
  return hits;
}

// ── Mocha root hooks ──────────────────────────────────────────────────────────

let guard = null;
let offsetsAtStart = null;

function onSignal(signal) {
  try {
    if (guard) {
      const report = guard.restoreNow();
      for (const r of report) console.error(`[live-data-guard] ${signal}: ${r.rel} ${r.reason} -> ${r.action}`);
      guard.finish(report);
      guard = null;
    }
  } catch (err) {
    console.error(`[live-data-guard] restore on ${signal} failed: ${err.stack || err}`);
  }
  process.exit(signal === 'SIGINT' ? 130 : 143);
}

export const mochaHooks = {
  beforeAll() {
    if (guard) return;
    if (process.env.MB_TEST_GUARD === 'off') {
      console.warn('[live-data-guard] MB_TEST_GUARD=off — operator data is NOT protected for this run.');
      return;
    }
    recoverDeadRuns();
    guard = startGuard();
    offsetsAtStart = logOffsets();
    for (const sig of ['SIGINT', 'SIGTERM', 'SIGHUP']) process.once(sig, onSignal);
    console.log(`[live-data-guard] ${guard.count} operator files snapshotted -> ${guard.runDir}`);
  },
  async afterAll() {
    if (!guard) return;
    const hits = offsetsAtStart ? await brokenPartCommands(offsetsAtStart) : [];
    const report = guard.restoreNow();
    const guardRunDirForMessage = guard.runDir;
    guard.finish(report);
    guard = null;
    if (hits.length) {
      throw new Error(`[live-data-guard] the run COMMANDED a part listed broken (config/physical-faults.json) or a ` +
        `hazard part (config/scene-hazards.json). Select parts with tests/helpers/testableParts.mjs:\n  ` +
        hits.join('\n  ') + (report.length ? `\nAlso changed: ${report.map(r => r.rel).join(', ')}` : ''));
    }
    if (report.length) {
      const lines = report.map(r => `  ${r.rel}: ${r.reason} -> ${r.action}`).join('\n');
      throw new Error(
        `[live-data-guard] live operator data changed during the run. Files this process wrote were restored from ` +
        `the pre-run snapshot (the content found is kept beside it); other differences were left alone and must be ` +
        `checked by hand (snapshot: ${guardRunDirForMessage}). Find the test that writes them and give it an isolated ` +
        `fixture:\n${lines}`);
    }
  },
};
