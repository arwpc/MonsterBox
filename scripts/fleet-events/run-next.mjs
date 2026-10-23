#!/usr/bin/env node
/**
 * Fleet events — the half-hour show runner.
 *
 * Plays the NEXT conductor scene in the rotation (scripts/fleet-events/events.json: 101 → 102 → 103 → 101 …) on
 * this node, through the node's own scene API, and then makes sure the yard is back where it was: every node gets
 * a lurk `event-release` (the conductor sends one itself, but a crashed show must not leave a node holding), and
 * every Goblin whose reel the show stopped is resumed (after a short grace for the last cast) and read back.
 *
 * It refuses to start a show during quiet hours, and when any node reports a live guest conversation it waits and
 * looks again (a show that talks over a guest is worse than a show that is five minutes late).
 *
 * Usage:
 *   node scripts/fleet-events/run-next.mjs                 # play the next event in the rotation
 *   node scripts/fleet-events/run-next.mjs --event 102     # play a specific conductor scene
 *   node scripts/fleet-events/run-next.mjs --dry-run       # ?dryRun=1: every step resolves, nothing moves or sounds
 *   node scripts/fleet-events/run-next.mjs --force         # ignore quiet hours and busy nodes (rehearsal)
 *   node scripts/fleet-events/run-next.mjs --status        # print the rotation state and exit
 *   node scripts/fleet-events/run-next.mjs --release-only  # just send event-release to every node (ops)
 *   node scripts/fleet-events/run-next.mjs --moment scripts/yard-theater/moments/x.json   # a perform.mjs moment, same interrupt/hand-back
 *   node scripts/fleet-events/run-next.mjs --base http://localhost:3100   # another listener (default https://localhost:3000)
 *
 * This is a client of the running MonsterBox (no application code imported), like scripts/yard-theater/perform.mjs,
 * so it keeps working while the services underneath are refactored. Logs carry local timestamps because they are
 * read against a crontab written in local time.
 */
import { readFileSync, writeFileSync, existsSync, mkdirSync, unlinkSync, renameSync } from 'node:fs';
import { dirname, join, resolve, isAbsolute } from 'node:path';
import { fileURLToPath } from 'node:url';
import https from 'node:https';
import { spawn } from 'node:child_process';
import axiosMod from 'axios';

const HERE = dirname(fileURLToPath(import.meta.url));
const ROOT = resolve(HERE, '..', '..');
const axios = axiosMod.create({ httpsAgent: new https.Agent({ rejectUnauthorized: false }) });

const args = process.argv.slice(2);
const flag = (name) => args.includes(name);
const opt = (name, fallback) => { const i = args.indexOf(name); return i !== -1 && args[i + 1] ? args[i + 1] : fallback; };

const BASE = opt('--base', 'https://localhost:3000');
const DRY = flag('--dry-run');
const FORCE = flag('--force');
const CONFIG_PATH = opt('--config', join(HERE, 'events.json'));
const cfg = JSON.parse(readFileSync(CONFIG_PATH, 'utf8'));
const abs = (p) => (isAbsolute(p) ? p : join(ROOT, p));
const STATE_FILE = abs(cfg.stateFile || 'data/fleet-events-state.json');
const LOCK_FILE = abs(cfg.lockFile || 'data/fleet-events.lock');
const PLAY_TIMEOUT = Number(cfg.playTimeoutMs) || 720000;
const GOBLIN_RESUME_GRACE_MS = Number(cfg.goblinResumeGraceMs) || 20000;

const stamp = () => new Date().toLocaleString('sv-SE').slice(0, 19);
const log = (...m) => console.log(`[${stamp()}]`, ...m);
const warn = (...m) => console.warn(`[${stamp()}]`, ...m);
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

// ---------------------------------------------------------------- state file
function readState() {
  try { return JSON.parse(readFileSync(STATE_FILE, 'utf8')); } catch { return { lastSceneId: null, lastRunAt: null, lastStatus: null, history: [] }; }
}
function writeState(state) {
  mkdirSync(dirname(STATE_FILE), { recursive: true });
  const tmp = `${STATE_FILE}.${process.pid}.tmp`;
  writeFileSync(tmp, JSON.stringify(state, null, 2) + '\n');
  renameSync(tmp, STATE_FILE);
}
function record(state, entry) {
  state.history = [...(state.history || []), entry].slice(-40);
  state.lastRunAt = entry.at;
  state.lastStatus = entry.status;
  if (entry.status === 'played' || entry.status === 'played-with-warnings' || entry.status === 'failed') state.lastSceneId = entry.sceneId;
  writeState(state);
}

function nextEvent(state) {
  const events = cfg.events || [];
  if (!events.length) throw new Error('events.json has no events');
  const wanted = opt('--event', null);
  if (wanted) {
    // `scheduled` events have their own cron line (the hourly story) and stay out of the rotation
    const e = [...events, ...(cfg.scheduled || [])].find((x) => String(x.sceneId) === String(wanted));
    return e || { sceneId: Number(wanted), name: `scene ${wanted}` };
  }
  const idx = events.findIndex((e) => e.sceneId === state.lastSceneId);
  return events[(idx + 1) % events.length];
}

// ------------------------------------------------------------- quiet hours
function minutesOf(hhmm) { const [h, m] = String(hhmm).split(':').map(Number); return h * 60 + (m || 0); }
function inQuietHours(now = new Date()) {
  const q = cfg.quietHours;
  if (!q || !q.start || !q.end) return false;
  const cur = now.getHours() * 60 + now.getMinutes();
  const start = minutesOf(q.start), end = minutesOf(q.end);
  return start <= end ? (cur >= start && cur < end) : (cur >= start || cur < end);
}

// ---------------------------------------------------------------- the lock
function acquireLock() {
  if (existsSync(LOCK_FILE)) {
    try {
      const held = JSON.parse(readFileSync(LOCK_FILE, 'utf8'));
      let alive = false;
      try { process.kill(held.pid, 0); alive = true; } catch { alive = false; }
      const ageMs = Date.now() - new Date(held.startedAt).getTime();
      if (alive && ageMs < PLAY_TIMEOUT + 60000) return { ok: false, reason: `another run (pid ${held.pid}, started ${held.startedAt}) is still playing` };
      warn(`stale lock from pid ${held.pid} (${alive ? 'alive but overdue' : 'dead'}) — taking over`);
    } catch { /* unreadable lock: take over */ }
  }
  mkdirSync(dirname(LOCK_FILE), { recursive: true });
  writeFileSync(LOCK_FILE, JSON.stringify({ pid: process.pid, startedAt: new Date().toISOString() }));
  return { ok: true };
}
function releaseLock() { try { unlinkSync(LOCK_FILE); } catch { /* already gone */ } }

// ------------------------------------------------------------ the fleet
/** Every node the orchestration registry knows, with the live (discovered) IP first. */
async function fleetNodes() {
  try {
    const r = await axios.get(`${BASE}/api/orchestration/nodes`, { timeout: 15000 });
    const nodes = (r.data?.nodes || []).map((n) => ({
      id: n.id, name: n.name, characterId: n.characterId ?? n.id,
      ip: n.ip, port: n.port || 3000, online: n.status === 'online'
    }));
    // A runner without mDNS (no avahi on the host, or multicast blocked) sees every node as 'unknown',
    // which used to skip the busy check and the release for the whole fleet. Ask those nodes directly.
    await Promise.all(nodes.filter((n) => !n.online && n.ip).map(async (n) => {
      try {
        const h = await axios.get(`https://${n.ip}:${n.port}/health`, { timeout: 4000 });
        n.online = h.status === 200;
      } catch { /* unreachable: stays absent */ }
    }));
    return nodes;
  } catch (err) {
    warn(`could not read the node registry (${err.code || err.message}); falling back to config/animatronics.json`);
    try {
      const raw = JSON.parse(readFileSync(join(ROOT, 'config', 'animatronics.json'), 'utf8'));
      const list = Array.isArray(raw) ? raw : (raw.animatronics || []);
      return list.map((n) => ({ id: n.id, name: n.name, characterId: n.characterId ?? n.id, ip: n.host || n.ip, port: n.port || 3000, online: true }));
    } catch { return []; }
  }
}
const nodeUrl = (n, path) => `https://${n.ip}:${n.port}${path}${path.includes('?') ? '&' : '?'}characterId=${n.characterId}`;

/** A node is busy when its own AI status says a guest conversation is live. Tolerant of either field spelling. */
async function nodeBusy(n) {
  try {
    const r = await axios.get(nodeUrl(n, '/conversation/api/ai-status'), { timeout: 4000 });
    const s = r.data || {};
    if (s.conversing === true || s.inConversation === true || s.guestActive === true || s.conversationActive === true) return 'in a live conversation';
    if (s.state === 'awake' && s.sessionActive === true && s.lastActivityAt) {
      const age = Date.now() - new Date(s.lastActivityAt).getTime();
      if (age < 90000) return `awake with activity ${Math.round(age / 1000)} s ago`;
    }
    return null;
  } catch {
    return null; // unreachable is not busy; the conductor skips it with a warning
  }
}

async function anyNodeBusy(nodes) {
  const checks = await Promise.all(nodes.filter((n) => n.online).map(async (n) => ({ n, why: await nodeBusy(n) })));
  return checks.filter((c) => c.why).map((c) => `${c.n.name}: ${c.why}`);
}

// ------------------------------------------------ interrupt, and hand back to lurk
// Operator 2026-10-23: a scheduled event interrupts whatever each animatronic is doing (a guest
// conversation included), plays in full, and then hands every animatronic back to lurk mode, armed and
// ready to interact. events.json `interrupt: true` turns this on for every event this runner plays.
const INTERRUPT = cfg.interrupt === true;
// The console node (hardware "none") conducts and plays nothing; it is never interrupted or put in lurk.
const CONSOLE_IDS = (() => {
  try {
    const raw = JSON.parse(readFileSync(join(ROOT, 'config', 'animatronics.json'), 'utf8'));
    return new Set((raw.animatronics || []).filter((a) => a.hardware === 'none').map((a) => String(a.characterId ?? a.id)));
  } catch { return new Set(); }
})();
const performers = (nodes) => nodes.filter((n) => n.online && !CONSOLE_IDS.has(String(n.characterId)));

/** End any live agent session, stop any scene queue loop, and hold each node's lurk services for the show. */
async function interruptAll(nodes, reason) {
  const results = await Promise.all(performers(nodes).map(async (n) => {
    const did = [];
    for (const [label, path, body] of [
      ['conversation ended', '/conversation/api/sleep', {}],
      ['queue stopped', '/scenes/api/queue/stop', {}],
      ['held', '/conversation/api/lurk/event-hold', { characterId: n.characterId, reason, maxMs: PLAY_TIMEOUT + 120000 }]]) {
      try {
        await axios.post(nodeUrl(n, path), body, { timeout: 10000 });
        did.push(label);
      } catch (err) {
        did.push(`${label} FAILED (${err.response?.status || err.code})`);
      }
    }
    return `${n.name}: ${did.join(', ')}`;
  }));
  for (const line of results) log('  interrupt →', line);
}

/** After the release, put every animatronic back in lurk mode (armed, lurking, ready for the next guest). */
async function lurkAll(nodes) {
  const results = await Promise.all(performers(nodes).map(async (n) => {
    try {
      const r = await axios.post(nodeUrl(n, '/conversation/api/lurk-mode'), { enabled: true }, { timeout: 15000 });
      return `${n.name}: lurk on${r.data?.state ? ` (${r.data.state})` : ''}`;
    } catch (err) {
      return `${n.name}: lurk on FAILED (${err.response?.status || err.code})`;
    }
  }));
  for (const line of results) log('  lurk →', line);
}

/** A yard-theater moment (scripts/yard-theater/perform.mjs) as a child of this runner, so it shares the lock. */
function performMoment(file) {
  return new Promise((done) => {
    const child = spawn(process.execPath, [join(ROOT, 'scripts', 'yard-theater', 'perform.mjs'), abs(file), '--base', BASE, ...(DRY ? ['--dry-run'] : [])],
      { cwd: ROOT, stdio: ['ignore', 'inherit', 'inherit'] });
    child.on('exit', (code) => done(code));
    child.on('error', (err) => { warn('perform.mjs failed to start:', err.message); done(-1); });
  });
}

/** Belt and braces after a show: every node is told the event is over, whether or not the conductor got there. */
async function releaseAll(nodes, reason) {
  const results = await Promise.all(nodes.filter((n) => n.online).map(async (n) => {
    try {
      const r = await axios.post(nodeUrl(n, '/conversation/api/lurk/event-release'), { characterId: n.characterId, reason }, { timeout: 8000 });
      return `${n.name}: released (${r.status})`;
    } catch (err) {
      const code = err.response?.status || err.code;
      return `${n.name}: release ${code === 404 ? 'unsupported (404)' : `failed (${code})`}`;
    }
  }));
  for (const line of results) log('  release →', line);
}

/**
 * Read every Goblin's playback back, and put each reel the show interrupted back on screen.
 *
 * A cast is play-once: it stops the Goblin's queue, and the keep-alive treats a stopped queue like an operator's
 * Stop and holds the screen dark for stopHoldMs (10 min) before resuming it. With a show every half hour that left
 * the cast Goblins dark a third of the evening (Goblins 2 and 3, 2026-10-12: stopped 600 s and 722 s after the
 * 20:00 show). So after the show the runner resumes every Goblin whose queue is stopped and non-empty, through the
 * conducting node's resume call (serialized, proven by two reads, ends any keep-alive hold), after a short grace for
 * the last cast clip. A Goblin that is playing, unreachable or empty is left alone.
 */
async function goblinStatus() {
  let goblins = [];
  try {
    const raw = JSON.parse(readFileSync(join(ROOT, 'data', 'goblins.json'), 'utf8'));
    goblins = Array.isArray(raw) ? raw : (raw.goblins || []);
    if (!Array.isArray(goblins)) goblins = Object.values(goblins);
  } catch { return; }
  const read = async (g) => {
    const endpoint = g.endpoint || (g.ipAddress ? `http://${g.ipAddress}:${g.port || 3001}` : null);
    if (!endpoint) return null;
    try {
      const r = await axios.get(`${endpoint}/playback-status`, { timeout: 3000 });
      return r.data || {};
    } catch (err) {
      return { error: err.code || err.message };
    }
  };
  const describe = (g, d) => (d.error
    ? `  goblin ${g.name}: no answer (${d.error})`
    : `  goblin ${g.name}: playing=${d.playing} mpv=${d.mpvRunning} video=${d.currentVideo || '-'} loop=${d.queue?.loopMode || '-'} queue=${d.queue?.videos?.length ?? '?'}`);

  const first = await Promise.all(goblins.map(async (g) => ({ g, d: await read(g) })));
  const stopped = first.filter(({ d }) => d && !d.error && d.queue && d.queue.playing === false && (d.queue.videos?.length || 0) > 0);
  if (DRY || stopped.length === 0) {
    for (const { g, d } of first) if (d) log(describe(g, d));
    return;
  }
  await sleep(GOBLIN_RESUME_GRACE_MS);
  for (const { g } of stopped) {
    try {
      const r = await axios.post(`${BASE}/video-library/api/goblins/${encodeURIComponent(g.id || g.name)}/resume`, {}, { timeout: 60000 });
      log(`  goblin ${g.name}: queue was stopped after the show; resume ${r.data?.verified ? 'proven' : (r.data?.success ? 'accepted' : 'refused')}`);
    } catch (err) {
      log(`  goblin ${g.name}: resume failed (${err.response?.status || err.code || err.message})`);
    }
  }
  for (const { g, d } of await Promise.all(goblins.map(async (g) => ({ g, d: await read(g) })))) if (d) log(describe(g, d));
}

/** Compact summary of a conductor run from the play endpoint's result. */
function summarize(result) {
  const steps = result?.results || result?.steps || [];
  const counts = { ok: 0, skipped: 0, failed: 0 };
  const failures = [];
  for (const s of steps) {
    if (s?.skipped) counts.skipped++;
    else if (s?.success === false) { counts.failed++; failures.push(`${s.stepType || s.type || '?'}#${s.index ?? '?'}: ${s.error || s.warning || 'failed'}`); }
    else counts.ok++;
  }
  return { counts, failures: failures.slice(0, 12), success: result?.success !== false && counts.failed === 0 };
}

// --------------------------------------------------------------------- main
async function main() {
  const state = readState();
  if (flag('--status')) {
    const next = nextEvent(state);
    console.log(JSON.stringify({ ...state, history: (state.history || []).slice(-5), next, quietNow: inQuietHours() }, null, 2));
    return 0;
  }

  const nodes = await fleetNodes();
  const online = nodes.filter((n) => n.online);
  log(`fleet: ${online.map((n) => n.name).join(', ') || '(none online)'}${nodes.length > online.length ? ` | absent: ${nodes.filter((n) => !n.online).map((n) => n.name).join(', ')}` : ''}`);

  if (flag('--release-only')) { await releaseAll(nodes, 'fleet-events release-only'); return 0; }

  const momentFile = opt('--moment', null);
  const event = momentFile ? { sceneId: null, name: `moment ${momentFile}` } : nextEvent(state);
  if (inQuietHours() && !FORCE) {
    log(`refused: quiet hours (${cfg.quietHours.start}–${cfg.quietHours.end}); next would be ${event.sceneId} ${event.name}`);
    record(state, { at: new Date().toISOString(), sceneId: event.sceneId, status: 'refused-quiet' });
    return 0;
  }

  const lock = acquireLock();
  if (!lock.ok) { log(`refused: ${lock.reason}`); return 0; }

  try {
    const retry = cfg.busyRetry || { attempts: 3, delayMs: 300000 };
    for (let attempt = 1; ; attempt++) {
      const busy = FORCE ? [] : await anyNodeBusy(nodes);
      if (busy.length && INTERRUPT) { log(`interrupting (${busy.join('; ')})`); break; }
      if (!busy.length) break;
      log(`busy (${busy.join('; ')}) — ${attempt < retry.attempts ? `waiting ${Math.round(retry.delayMs / 1000)} s` : 'giving up until the next slot'}`);
      if (attempt >= retry.attempts) {
        record(state, { at: new Date().toISOString(), sceneId: event.sceneId, status: 'deferred-busy', busy });
        return 0;
      }
      await sleep(retry.delayMs);
    }

    // An event may live on another node's character ({"node": "Groundbreaker"} in events.json: the
    // Slipknot and Nosferatu conductors are Groundbreaker's scenes). Play it there, through that
    // node's own scene API; the release and Goblin clean-up below still run from here.
    if (INTERRUPT && !DRY) await interruptAll(nodes, event.name);
    if (momentFile) {
      log(`performing ${momentFile}${DRY ? ' [DRY RUN]' : ''}`);
      const started = Date.now();
      const code = await performMoment(momentFile);
      const outcome = { status: code === 0 ? 'played-moment' : 'failed-moment', elapsedMs: Date.now() - started };
      log(`${outcome.status} in ${Math.round(outcome.elapsedMs / 1000)} s`);
      if (!DRY) {
        await releaseAll(nodes, `fleet-events ${event.name} ${outcome.status}`);
        if (INTERRUPT) await lurkAll(nodes);
      }
      record(state, { at: new Date().toISOString(), sceneId: null, name: event.name, dryRun: DRY, ...outcome });
      return code === 0 ? 0 : 1;
    }
    const host = event.node ? nodes.find((n) => String(n.name).toLowerCase() === String(event.node).toLowerCase()) : null;
    if (event.node && !host) {
      log(`refused: ${event.sceneId} ${event.name} lives on ${event.node}, which is not in the fleet registry`);
      record(state, { at: new Date().toISOString(), sceneId: event.sceneId, name: event.name, status: 'failed', error: `node ${event.node} unknown` });
      return 0;
    }
    const playUrl = host
      ? nodeUrl(host, `/scenes/api/${event.sceneId}/play${DRY ? '?dryRun=1' : ''}`)
      : `${BASE}/scenes/api/${event.sceneId}/play${DRY ? '?dryRun=1' : ''}`;
    log(`playing ${event.sceneId} ${event.name}${DRY ? ' [DRY RUN]' : ''} via ${host ? `${host.name} (${host.ip})` : BASE}`);
    const started = Date.now();
    let outcome;
    try {
      const r = await axios.post(playUrl, {}, { timeout: PLAY_TIMEOUT });
      const sum = summarize(r.data?.result);
      // The conductor ran to its end (every fleet step is non-fatal, and a cast to an offline Goblin or a
      // skipped busy node is a warning, not a lost show). 'failed' is reserved for a play request that did not
      // run at all; step failures are counted and listed so the log still says what was missed.
      const ranToEnd = r.data?.success !== false;
      outcome = { status: ranToEnd ? (sum.counts.failed ? 'played-with-warnings' : 'played') : 'failed', elapsedMs: Date.now() - started, ...sum.counts, failures: sum.failures };
      log(`${outcome.status} in ${Math.round(outcome.elapsedMs / 1000)} s: ${sum.counts.ok} ok, ${sum.counts.skipped} skipped, ${sum.counts.failed} failed`);
      for (const f of sum.failures) warn('  step failed →', f);
    } catch (err) {
      const detail = err.response?.data?.error || err.response?.data?.message || err.code || err.message;
      outcome = { status: 'failed', elapsedMs: Date.now() - started, error: String(detail).slice(0, 200) };
      warn(`play failed after ${Math.round(outcome.elapsedMs / 1000)} s: ${detail}`);
    }

    if (!DRY) {
      await releaseAll(nodes, `fleet-events ${event.sceneId} ${outcome.status}`);
      if (INTERRUPT) await lurkAll(nodes);
      await goblinStatus();
    }
    record(state, { at: new Date().toISOString(), sceneId: event.sceneId, name: event.name, dryRun: DRY, ...outcome });
    return outcome.status === 'failed' ? 1 : 0;
  } finally {
    releaseLock();
  }
}

main().then((code) => { process.exitCode = code; }).catch((err) => { warn('runner crashed:', err.message); releaseLock(); process.exitCode = 1; });
