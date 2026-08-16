#!/usr/bin/env node
/**
 * Yard Theater — scripted cross-animatronic moments over the existing
 * orchestration endpoints. No application code involved: this is a client.
 *
 * A "moment" is a JSON file of steps executed in order:
 *   { "say":  { "node": <id>|"all", "text": "..." } }
 *   { "audio":{ "node": <id>|"all", "filename": "x.mp3", "volume": 0-100, "loop": bool } }
 *   { "stopAudio": { "node": <id>|"all" } }
 *   { "wait": <ms> }
 *
 * Nodes that are missing from config/animatronics.json (e.g. Renfield, whose
 * hardware does not exist yet) or that are simply not powered on are detected in
 * a single preflight and their steps are skipped instantly with a warning — the
 * show goes on, and it does not stall for 20 s per dead node.
 *
 * Audio steps name a FILE; the orchestration play-audio endpoint requires the
 * library's audioId. We resolve filename -> audioId per node from that node's
 * own audio library (audio is deployed per node, so ids can differ). A file that
 * is not in a node's library is skipped with a warning rather than failing the
 * moment — this is what makes "drop a track at dusk-theme.mp3" work the day it
 * appears and be a no-op before then.
 *
 * Usage:
 *   node scripts/yard-theater/perform.mjs moments/thomas.json
 *   node scripts/yard-theater/perform.mjs moments/dusk-ceremony.json --base https://<node-host>:3000
 *   node scripts/yard-theater/perform.mjs moments/dusk-ceremony.json --dry-run
 */
import { readFileSync } from 'node:fs';
import { dirname, join, isAbsolute } from 'node:path';
import { fileURLToPath } from 'node:url';
import https from 'node:https';
import axiosMod from 'axios';

const HERE = dirname(fileURLToPath(import.meta.url));
const axios = axiosMod.create({ httpsAgent: new https.Agent({ rejectUnauthorized: false }) });

const args = process.argv.slice(2);
const baseIdx = args.indexOf('--base');
const BASE = baseIdx !== -1 ? args[baseIdx + 1] : 'https://localhost:3000';
const DRY = args.includes('--dry-run');
// Positional = the moment file; skip flags and the value that follows --base.
const momentFile = args.find((a, i) => !a.startsWith('--') && !(baseIdx !== -1 && i === baseIdx + 1));
if (!momentFile) {
  console.error('Usage: perform.mjs <moment.json> [--base https://host:port] [--dry-run]');
  process.exit(1);
}
const API = `${BASE}/api/orchestration`;

const path = isAbsolute(momentFile) ? momentFile : join(HERE, momentFile);
const moment = JSON.parse(readFileSync(path, 'utf8'));

// Local time, not UTC: these logs are read against a cron schedule written in
// America/Chicago, and a UTC stamp makes "did the 6:30pm ceremony fire?" hard.
const stamp = () => new Date().toLocaleString('sv-SE').slice(0, 19);
const log = (...m) => console.log(`[${stamp()}]`, ...m);
const warn = (...m) => console.warn(`[${stamp()}]`, ...m);

const tally = { ok: 0, skipped: 0 };

async function post(url, body) {
  if (DRY) { log(`  (dry-run) POST ${url} ${JSON.stringify(body ?? {})}`); tally.ok++; return true; }
  try {
    const r = await axios.post(url, body ?? {}, { timeout: 30000 });
    const ok = r.data?.success !== false;
    ok ? tally.ok++ : tally.skipped++;
    if (!ok) warn(`  ! step reported failure: ${JSON.stringify(r.data).slice(0, 160)}`);
    return ok;
  } catch (err) {
    const detail = err.response?.data?.message || err.response?.data?.error || err.code || err.message;
    warn(`  ! skipped (${err.response?.status || err.code}): ${detail}`);
    tally.skipped++;
    return false;
  }
}

// ------------------------------------------------------------------ preflight
// One call tells us which node ids exist in config and which answered just now.
const live = new Map(); // id -> { name, online }
async function preflight() {
  try {
    const r = await axios.get(`${API}/status`, { timeout: 30000 });
    for (const a of r.data?.animatronics || []) live.set(a.id, { name: a.name, online: a.online === true });
  } catch (err) {
    warn(`preflight failed (${err.code || err.message}) — attempting every node blind`);
  }
}

/** null = play it; string = reason to skip. */
function unavailable(nodeId) {
  if (!live.size) return null;
  const n = live.get(nodeId);
  if (!n) return 'not in config/animatronics.json (no such node yet)';
  if (!n.online) return `${n.name} is offline`;
  return null;
}

/** Node ids a "all" step should fan out to: configured AND answering. */
function allNodes() {
  if (live.size) return [...live.entries()].filter(([, n]) => n.online).map(([id]) => id);
  return moment.nodes || [];
}

// -------------------------------------------------------------- audio lookup
// filename -> audioId, per node. Cached; a node is asked at most once.
const libCache = new Map();
async function audioIdFor(nodeId, filename) {
  if (!libCache.has(nodeId)) {
    let files = [];
    try {
      const r = await axios.get(`${API}/animatronic/${nodeId}/audio-files`, { timeout: 20000 });
      files = r.data?.audio || r.data?.files || [];
    } catch (err) {
      warn(`  ! could not read audio library on node ${nodeId} (${err.response?.status || err.code})`);
    }
    libCache.set(nodeId, files);
  }
  const want = String(filename).trim().toLowerCase();
  const hit = libCache.get(nodeId).find(f =>
    [f.filename, f.originalFilename, f.title, f.id]
      .some(v => v && String(v).trim().toLowerCase() === want));
  return hit ? { id: hit.id, title: hit.title } : null;
}

async function playAudio(nodeId, { filename, volume, loop }) {
  const why = unavailable(nodeId);
  if (why) { warn(`  ! audio skipped on node ${nodeId}: ${why}`); tally.skipped++; return false; }
  if (DRY) return post(`${API}/animatronic/${nodeId}/play-audio`, { filename, volume, loop });
  const entry = await audioIdFor(nodeId, filename);
  if (!entry) {
    warn(`  ! audio skipped on node ${nodeId}: "${filename}" is not in that node's audio library`);
    tally.skipped++;
    return false;
  }
  return post(`${API}/animatronic/${nodeId}/play-audio`, {
    audioId: entry.id, audioTitle: entry.title, filename, volume, loop
  });
}

// ------------------------------------------------------------------- the show
async function runStep(step) {
  if (step.wait) { await new Promise(r => setTimeout(r, DRY ? 0 : step.wait)); return; }

  if (step.say) {
    const { node, text } = step.say;
    log(`  say [${node}]: ${text.slice(0, 70)}...`);
    if (node === 'all') {
      // say-all's own defaults (5 s per node) are shorter than TTS takes; ask for
      // the endpoint's maximum so a slow-but-successful voice is not misreported.
      return post(`${API}/say-all`, { text, timeoutMs: 15000, globalTimeoutMs: 20000 });
    }
    const why = unavailable(node);
    if (why) { warn(`  ! say skipped on node ${node}: ${why}`); tally.skipped++; return false; }
    return post(`${API}/animatronic/${node}/say`, { text });
  }

  if (step.audio) {
    const { node, filename, volume = 80, loop = false } = step.audio;
    log(`  audio [${node}]: ${filename} vol=${volume} loop=${loop}`);
    if (node === 'all') {
      await Promise.all(allNodes().map(id => playAudio(id, { filename, volume, loop })));
      return;
    }
    return playAudio(node, { filename, volume, loop });
  }

  if (step.stopAudio) {
    const { node } = step.stopAudio;
    log(`  stopAudio [${node}]`);
    if (node === 'all') {
      await Promise.all(allNodes().map(id => post(`${API}/animatronic/${id}/stop-audio`)));
      return;
    }
    const why = unavailable(node);
    if (why) { warn(`  ! stopAudio skipped on node ${node}: ${why}`); tally.skipped++; return false; }
    return post(`${API}/animatronic/${node}/stop-audio`);
  }

  warn('  ? unknown step', JSON.stringify(step).slice(0, 80));
  tally.skipped++;
}

log(`Performing: ${moment.name} (${moment.steps.length} steps)${DRY ? ' [DRY RUN]' : ''} via ${BASE}`);
if (!DRY) {
  await preflight();
  if (live.size) {
    const on = [...live.entries()].filter(([, n]) => n.online).map(([id, n]) => `${n.name}#${id}`);
    const off = [...live.entries()].filter(([, n]) => !n.online).map(([id, n]) => `${n.name}#${id}`);
    log(`Cast present: ${on.join(', ') || '(none)'}${off.length ? ` | absent: ${off.join(', ')}` : ''}`);
  }
}
for (const step of moment.steps) await runStep(step);
log(`Done. ${tally.ok} action(s) performed, ${tally.skipped} skipped.`);
process.exitCode = tally.ok === 0 && tally.skipped > 0 ? 1 : 0;
