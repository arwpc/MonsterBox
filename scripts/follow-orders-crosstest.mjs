#!/usr/bin/env node
/**
 * Follow Orders cross-animatronic test harness.
 *
 * One animatronic SPEAKS an order through its physical speaker; another HEARS
 * it through its own microphone and obeys. This script arms the listener,
 * makes the speaker talk, collects the listener's transcript/match/execution
 * evidence, photographs the listener from the SPEAKER's camera before and
 * after (they face each other), runs deterministic assertions, and writes an
 * evidence bundle per trial for an AI judge to score.
 *
 * Manual, hardware-tier tool — never part of the automated gate. Run it from
 * the node that holds fleet trust:
 *
 *   node scripts/follow-orders-crosstest.mjs --speaker <animatronicId> --listener <animatronicId> [--trials <file.json>] [--both]
 *
 * Roles come from the command line and phrases from the trials file, so the
 * harness itself is character-independent. --both runs the matrix in both
 * directions. Safety: the harness only ever speaks phrases from the trials
 * file, enables Follow Orders on the LISTENER only, and restores both nodes'
 * original enabled state afterwards.
 */
import fs from 'fs/promises';
import path from 'path';
import https from 'https';
import axios from 'axios';

const insecureAgent = new https.Agent({ rejectUnauthorized: false });

function arg(name, fallback = null) {
  const idx = process.argv.indexOf(`--${name}`);
  if (idx >= 0 && process.argv[idx + 1] && !process.argv[idx + 1].startsWith('--')) return process.argv[idx + 1];
  return process.argv.includes(`--${name}`) ? true : fallback;
}

const DEFAULT_TRIALS = [
  // Positive orders — generic enough to exercise pose/alias/part matching on
  // any character that has the vocabulary. A listener without the vocabulary
  // refuses, which the trial records honestly (expect 'any').
  { say: 'raise your arm', expect: 'any' },
  { say: 'lower your arm', expect: 'any' },
  { say: 'open the box', expect: 'any' },
  { say: 'close the box', expect: 'any' },
  { say: 'open your jaw', expect: 'match' },
  { say: 'stop', expect: 'stop' },
  // Negatives — must refuse with a reason, never move hardware.
  { say: 'flumph the quantum zorble', expect: 'refuse' },
  { say: 'close your coffin door', expect: 'any', note: 'refusal expected on characters without a coffin' }
];

async function loadNodes() {
  const raw = JSON.parse(await fs.readFile(path.resolve('config/animatronics.json'), 'utf8'));
  return raw.animatronics || [];
}

function nodeUrl(node) {
  return `https://${node.ip}:${node.port || 3000}`;
}

async function call(node, method, urlPath, body = null, timeout = 10000) {
  const res = await axios({
    method,
    url: nodeUrl(node) + urlPath,
    data: body || undefined,
    timeout,
    httpsAgent: insecureAgent,
    validateStatus: () => true
  });
  return res.data;
}

async function nodeCharacterId(node) {
  const cfg = await call(node, 'get', '/api/config');
  return cfg && cfg.config && cfg.config.selectedCharacter;
}

/** Best-effort JPEG of what a node's camera sees right now. Never fatal. */
async function grabFrame(node) {
  // mjpg-streamer snapshot first (port 8090), then one frame off the MJPEG proxy.
  try {
    const res = await axios.get(`http://${node.ip}:8090/?action=snapshot`, {
      responseType: 'arraybuffer', timeout: 5000
    });
    if (res.status === 200 && res.data && res.data.byteLength > 1000) return Buffer.from(res.data);
  } catch (_) { /* fall through */ }
  try {
    const res = await axios.get(`${nodeUrl(node)}/api/orchestration/animatronic/${node.id}/webcam-stream`, {
      responseType: 'stream', timeout: 8000, httpsAgent: insecureAgent
    });
    return await new Promise((resolve) => {
      const chunks = [];
      let total = 0;
      const timer = setTimeout(() => { res.data.destroy(); resolve(null); }, 6000);
      res.data.on('data', (chunk) => {
        chunks.push(chunk); total += chunk.length;
        const buf = Buffer.concat(chunks);
        const start = buf.indexOf(Buffer.from([0xFF, 0xD8]));
        const end = buf.indexOf(Buffer.from([0xFF, 0xD9]), start + 2);
        if (start >= 0 && end > start) {
          clearTimeout(timer); res.data.destroy();
          resolve(buf.subarray(start, end + 2));
        } else if (total > 3_000_000) { clearTimeout(timer); res.data.destroy(); resolve(null); }
      });
      res.data.on('error', () => { clearTimeout(timer); resolve(null); });
    });
  } catch (_) { return null; }
}

async function runDirection(speaker, listener, trials, runDir) {
  const listenerCharId = await nodeCharacterId(listener);
  const results = [];

  // Original states, restored at the end.
  const speakerState = await call(speaker, 'get', '/conversation/api/follow-orders');
  const listenerState = await call(listener, 'get', '/conversation/api/follow-orders');

  console.log(`\n═══ ${speaker.name} orders ${listener.name} (listener character ${listenerCharId}) ═══`);

  // Arm the LISTENER only; the speaker must never obey its own voice.
  await call(speaker, 'post', '/conversation/api/follow-orders', { enabled: false });
  const armed = await call(listener, 'post', '/conversation/api/follow-orders', { enabled: true });
  if (!armed || armed.success !== true) {
    console.error(`✗ Could not arm listener: ${(armed && armed.error) || 'no response'}`);
    return { direction: `${speaker.name}→${listener.name}`, fatal: 'listener would not arm', results };
  }

  try {
    for (let i = 0; i < trials.length; i++) {
      const trial = trials[i];
      const label = `${speaker.name}→${listener.name} #${i + 1} "${trial.say}"`;
      console.log(`\n▶ ${label}`);

      await call(listener, 'delete', `/setup/follow-orders/api/history/${listenerCharId}`);

      const before = await grabFrame(speaker);
      const spokenAt = Date.now();
      const say = await call(speaker, 'post', '/conversation/api/say', { text: trial.say }, 30000);

      // Wait for the listener to hear and act, then photograph the outcome.
      let entry = null;
      const deadline = Date.now() + 15000;
      while (Date.now() < deadline && !entry) {
        await new Promise(r => setTimeout(r, 1000));
        const hist = await call(listener, 'get', `/setup/follow-orders/api/history/${listenerCharId}`);
        entry = (hist && hist.history || []).find(h => h.at >= spokenAt - 2000);
      }
      const after = await grabFrame(speaker);

      // Deterministic assertions — the judge layers on top of these.
      const checks = {
        speakerSaid: !!(say && say.success),
        listenerHeard: !!entry,
        matched: !!(entry && entry.match && entry.match.matched),
        executed: !!(entry && entry.execution && entry.execution.success),
        refusalReason: entry && entry.match && !entry.match.matched ? entry.match.reason : null
      };
      let pass;
      if (trial.expect === 'refuse') pass = checks.listenerHeard && !checks.matched && !!checks.refusalReason;
      else if (trial.expect === 'stop') pass = checks.listenerHeard && checks.matched && entry.match.kind === 'stop';
      else if (trial.expect === 'match') pass = checks.listenerHeard && checks.matched && checks.executed;
      else pass = checks.listenerHeard; // 'any': hearing + an honest outcome is the bar

      const trialDir = path.join(runDir, `${speaker.id}-to-${listener.id}`);
      await fs.mkdir(trialDir, { recursive: true });
      if (before) await fs.writeFile(path.join(trialDir, `trial-${i + 1}-before.jpg`), before);
      if (after) await fs.writeFile(path.join(trialDir, `trial-${i + 1}-after.jpg`), after);
      const record = {
        label, intended: trial.say, expect: trial.expect, note: trial.note || null,
        spokenAt, speakerResponse: say, historyEntry: entry, checks, pass,
        frames: { before: !!before, after: !!after }
      };
      await fs.writeFile(path.join(trialDir, `trial-${i + 1}.json`), JSON.stringify(record, null, 2));
      results.push(record);

      console.log(`  heard=${checks.listenerHeard} transcript="${entry ? entry.transcript : '—'}" ` +
        `matched=${checks.matched}${checks.refusalReason ? ` (refused: ${checks.refusalReason})` : ''} ` +
        `executed=${checks.executed} → ${pass ? 'PASS' : 'FAIL'}`);

      // Let acks and motion settle before the next order.
      await new Promise(r => setTimeout(r, 4000));
    }
  } finally {
    // Put both nodes back exactly as found.
    await call(listener, 'post', '/conversation/api/follow-orders', { enabled: !!(listenerState && listenerState.enabled) });
    await call(speaker, 'post', '/conversation/api/follow-orders', { enabled: !!(speakerState && speakerState.enabled) });
  }

  return { direction: `${speaker.name}→${listener.name}`, results };
}

async function main() {
  const speakerId = parseInt(arg('speaker'), 10);
  const listenerId = parseInt(arg('listener'), 10);
  if (!Number.isFinite(speakerId) || !Number.isFinite(listenerId) || speakerId === listenerId) {
    console.error('Usage: node scripts/follow-orders-crosstest.mjs --speaker <animatronicId> --listener <animatronicId> [--trials file.json] [--both]');
    process.exit(2);
  }

  const nodes = await loadNodes();
  const speaker = nodes.find(n => n.id === speakerId);
  const listener = nodes.find(n => n.id === listenerId);
  if (!speaker || !speaker.ip || !listener || !listener.ip) {
    console.error('Both animatronics must exist in config/animatronics.json with an ip.');
    process.exit(2);
  }

  const trialsFile = arg('trials');
  const trials = trialsFile
    ? JSON.parse(await fs.readFile(path.resolve(trialsFile), 'utf8')).trials
    : DEFAULT_TRIALS;

  const runDir = path.resolve('reports', 'follow-orders-crosstest', new Date().toISOString().replace(/[:.]/g, '-'));
  await fs.mkdir(runDir, { recursive: true });

  const runs = [await runDirection(speaker, listener, trials, runDir)];
  if (arg('both')) runs.push(await runDirection(listener, speaker, trials, runDir));

  const flat = runs.flatMap(r => r.results);
  const passed = flat.filter(r => r.pass).length;
  const summary = {
    at: new Date().toISOString(),
    speaker: { id: speaker.id, name: speaker.name },
    listener: { id: listener.id, name: listener.name },
    bothDirections: !!arg('both'),
    trials: flat.length, passed, failed: flat.length - passed,
    runs
  };
  await fs.writeFile(path.join(runDir, 'summary.json'), JSON.stringify(summary, null, 2));

  console.log(`\n═══ ${passed}/${flat.length} trials passed. Evidence: ${runDir} ═══`);
  console.log('Hand the evidence directory to an AI judge for transcript-fidelity,');
  console.log('match-correctness, and before/after frame scoring.');
  process.exit(passed === flat.length ? 0 : 1);
}

main().catch(err => { console.error('Crosstest fatal:', err.message); process.exit(1); });
