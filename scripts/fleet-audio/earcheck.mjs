#!/usr/bin/env node
/**
 * Fleet audio ear-check — the instrumented cast test.
 *
 * For every reachable node: record that node's OWN microphone while the node
 * speaks a known phrase in its own character voice (orchestration `say`, which
 * proxies to that node's /api/elevenlabs/generate-and-play), then measure the
 * captured level and transcribe it with ElevenLabs Scribe. A node is AUDIBLE
 * only if its speaker measurably rose above its own noise floor AND Scribe read
 * back the words we cast. Anything else is SILENT and gets a diagnosis.
 *
 * This exists because every claim in HALLOWEEN-TUNING-REPORT.md was
 * transcript/timing-verified but never listened to. This listens.
 *
 * Self-contained: Node 18+ global fetch, ssh/arecord on the nodes. No new deps.
 *
 * Usage:
 *   node scripts/fleet-audio/earcheck.mjs                 # all reachable nodes
 *   node scripts/fleet-audio/earcheck.mjs --nodes 2,3     # a subset
 *   node scripts/fleet-audio/earcheck.mjs --keep          # keep the WAVs
 *   node scripts/fleet-audio/earcheck.mjs --seconds 20    # longer capture
 */
import { readFileSync, writeFileSync, mkdirSync, readdirSync } from 'node:fs';
import { execFileSync, spawn } from 'node:child_process';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { hostname } from 'node:os';
import https from 'node:https';
import axiosMod from 'axios';

const HERE = dirname(fileURLToPath(import.meta.url));
const ROOT = join(HERE, '..', '..');
const OUTDIR = join(HERE, 'results');
const API = 'https://api.elevenlabs.io';

// Every node serves the orchestration API over HTTPS with a self-signed cert,
// so this client has to accept it — same posture as scripts/yard-theater.
const axios = axiosMod.create({ httpsAgent: new https.Agent({ rejectUnauthorized: false }) });

function arg(name, fallback) {
  const i = process.argv.indexOf(`--${name}`);
  return i !== -1 && process.argv[i + 1] && !process.argv[i + 1].startsWith('--')
    ? process.argv[i + 1]
    : fallback;
}
const flag = name => process.argv.includes(`--${name}`);

// 13s, not 9. The longest cast line on a slow-speaking character runs past 11s,
// and a window that clips the tail scores as GARBLED on word recall — a false
// failure on a node whose audio is perfect. Measured: the same node read back
// 53% of its line in a 9s window and 80% in a 15s one.
const SECONDS = parseInt(arg('seconds', '13'), 10);
const KEEP = flag('keep');
const nodeFilter = arg('nodes', 'all');

function apiKey() {
  if (process.env.ELEVENLABS_API_KEY) return process.env.ELEVENLABS_API_KEY.trim();
  try {
    return readFileSync('/etc/monsterbox/elevenlabs.key', 'utf8').trim();
  } catch {
    console.error('No ELEVENLABS_API_KEY and /etc/monsterbox/elevenlabs.key unreadable.');
    process.exit(1);
  }
}
const KEY = apiKey();

/**
 * Cast phrases are in-character on purpose: the point is to hear the voice the
 * guests will hear, not a test tone. Each is distinctive enough that a Scribe
 * transcript can be scored against it word by word.
 */
const PHRASES = {
  1: 'The garden is hungry tonight, and the soul quota is not yet filled.',
  2: 'I have waited in these walls since fourteen sixty two for Thomas to come home.',
  3: 'You stand at my door uninvited. Mind your place, little one.',
  4: 'Stai! The watch of the castle holds this road, and the road behind you is dark.',
  5: 'THIS ROOF IS MINE. COME DOWN FROM THE STREET AND SEE.',
  6: 'The works are still open! Sign nothing tonight, I beg you, sign nothing!'
};

const { animatronics } = JSON.parse(
  readFileSync(join(ROOT, 'config', 'animatronics.json'), 'utf8')
);

/**
 * The voice each character is SUPPOSED to speak in, read from the committed
 * ElevenLabs agent snapshots — the canonical persona state. Read from the
 * snapshots rather than restated here so this check can never drift from them,
 * which is precisely the failure it exists to catch.
 */
const CANONICAL_VOICES = (() => {
  const byCharacter = {};
  const agentToCharacter = new Map(
    animatronics.filter(a => a.agentId).map(a => [a.agentId, a.characterId])
  );
  let files = [];
  try { files = readdirSync(join(ROOT, 'config', 'elevenlabs', 'agents')); } catch (_) { return byCharacter; }
  for (const f of files) {
    if (!f.endsWith('.json')) continue;
    try {
      const snap = JSON.parse(readFileSync(join(ROOT, 'config', 'elevenlabs', 'agents', f), 'utf8'));
      const agent = snap.agent || snap;
      const voice = agent?.conversation_config?.tts?.voice_id;
      const charId = agentToCharacter.get(agent?.agent_id);
      if (voice && charId != null) byCharacter[charId] = voice;
    } catch (_) { /* a malformed snapshot just means no expectation for that character */ }
  }
  return byCharacter;
})();

const SELF = hostname();
let nodes = animatronics.map(a => ({ ...a, local: a.hostname === SELF }));
if (nodeFilter !== 'all') {
  const want = new Set(nodeFilter.split(',').map(s => s.trim()));
  nodes = nodes.filter(n => want.has(String(n.id)));
}

// ---------------------------------------------------------------- shell helpers

function sh(cmd, { node, timeout = 60000 } = {}) {
  // Runs a command either locally or on a node over ssh. Returns stdout.
  if (!node || node.local) {
    return execFileSync('bash', ['-lc', cmd], { timeout, encoding: 'utf8' });
  }
  return execFileSync(
    'ssh',
    ['-o', 'BatchMode=yes', '-o', 'StrictHostKeyChecking=no', '-o', 'ConnectTimeout=8',
     `remote@${node.ip}`, cmd],
    { timeout, encoding: 'utf8' }
  );
}

function reachable(node) {
  try {
    sh('echo ok', { node, timeout: 12000 });
    return true;
  } catch {
    return false;
  }
}

/**
 * Every ALSA capture device on the node. We deliberately do NOT guess which one
 * is "the" microphone: on some nodes the USB adapter's mic jack is empty and
 * reports a dead-flat electrical noise floor, while the webcam carries the real
 * acoustic signal. Recording all of them and scoring each is the only way to
 * tell an unplugged jack from a silent speaker.
 */
function listCaptureDevices(node) {
  const listing = sh('arecord -l 2>/dev/null || true', { node });
  return [...listing.matchAll(/^card (\d+): (\S+) \[([^\]]+)\]/gm)].map(m => ({
    dev: `plughw:${m[1]},0`,
    card: m[1],
    label: m[3]
  }));
}

/**
 * Start `arecord` on the node WITHOUT blocking this process — the whole point of
 * the test is to issue the `say` while the microphone is already open. Returns a
 * promise that resolves to the local path once the recording has been fetched.
 */
function startCapture(node, dev, secs, tag) {
  const remotePath = `/tmp/mb-earcheck-${tag}.wav`;
  const localPath = join(OUTDIR, `${node.hostname}-${tag}.wav`);
  const recCmd = `arecord -D ${dev} -f S16_LE -r 16000 -c 1 -d ${secs} ${remotePath} >/dev/null 2>&1 || true`;
  const child = node.local
    ? spawn('bash', ['-lc', recCmd])
    : spawn('ssh', ['-o', 'BatchMode=yes', '-o', 'StrictHostKeyChecking=no',
                    '-o', 'ConnectTimeout=8', `remote@${node.ip}`, recCmd]);

  return new Promise(resolve => {
    const timer = setTimeout(() => { child.kill(); }, (secs + 25) * 1000);
    child.on('close', () => {
      clearTimeout(timer);
      try {
        if (node.local) sh(`cp ${remotePath} ${localPath}`);
        else execFileSync('scp', ['-o', 'BatchMode=yes', '-o', 'StrictHostKeyChecking=no',
                                  `remote@${node.ip}:${remotePath}`, localPath], { timeout: 60000 });
        sh(`rm -f ${remotePath}`, { node });
        resolve(localPath);
      } catch (err) {
        resolve({ error: String(err).slice(0, 200) });
      }
    });
    child.on('error', err => {
      clearTimeout(timer);
      resolve({ error: String(err).slice(0, 200) });
    });
  });
}

// ---------------------------------------------------------------- measurement

/**
 * Frame-level envelope in dBFS. Whole-window RMS is useless here: a four-second
 * line inside a nine-second window barely moves the average, so a perfectly
 * audible speaker scores as silent. What actually distinguishes speech from
 * hiss is the SHAPE — loud frames well above the quiet ones.
 */
function measure(wavPath, frameMs = 250) {
  const buf = readFileSync(wavPath);
  // Walk the RIFF chunks rather than assuming a 44-byte header.
  let off = 12, dataOff = 44, dataLen = buf.length - 44, rate = 16000;
  while (off + 8 <= buf.length) {
    const id = buf.toString('ascii', off, off + 4);
    const size = buf.readUInt32LE(off + 4);
    if (id === 'fmt ') rate = buf.readUInt32LE(off + 12);
    if (id === 'data') { dataOff = off + 8; dataLen = Math.min(size, buf.length - dataOff); break; }
    off += 8 + size + (size % 2);
  }
  const n = Math.floor(dataLen / 2);
  const empty = { frames: [], medianDb: -Infinity, p90Db: -Infinity, peakDb: -Infinity, seconds: 0 };
  if (n <= 0) return empty;

  const db = v => (v > 0 ? 20 * Math.log10(v / 32768) : -99);
  const frameLen = Math.max(1, Math.floor((rate * frameMs) / 1000));
  const frames = [];
  let peak = 0;
  for (let i = 0; i + frameLen <= n; i += frameLen) {
    let sumSq = 0;
    for (let j = 0; j < frameLen; j++) {
      const s = buf.readInt16LE(dataOff + (i + j) * 2);
      sumSq += s * s;
      if (Math.abs(s) > peak) peak = Math.abs(s);
    }
    frames.push(db(Math.sqrt(sumSq / frameLen)));
  }
  if (!frames.length) return empty;
  const sorted = [...frames].sort((a, b) => a - b);
  const at = q => sorted[Math.min(sorted.length - 1, Math.floor(sorted.length * q))];
  return {
    frames,
    medianDb: at(0.5),
    p90Db: at(0.9),
    peakDb: db(peak),
    seconds: n / rate
  };
}

// ---------------------------------------------------------------- ElevenLabs

async function scribe(wavPath) {
  const form = new FormData();
  form.append('file', new Blob([readFileSync(wavPath)], { type: 'audio/wav' }), 'clip.wav');
  form.append('model_id', 'scribe_v2');
  const res = await fetch(`${API}/v1/speech-to-text`, {
    method: 'POST',
    headers: { 'xi-api-key': KEY },
    body: form
  });
  if (!res.ok) return { text: '', error: `HTTP ${res.status}: ${(await res.text()).slice(0, 200)}` };
  const json = await res.json();
  return { text: (json.text || '').trim() };
}

/** Fraction of the cast phrase's words that survived into the transcript. */
function wordRecall(expected, actual) {
  const norm = s => s.toLowerCase().replace(/[^a-z0-9\s]/g, ' ').split(/\s+/).filter(Boolean);
  const exp = norm(expected), got = new Set(norm(actual));
  if (!exp.length) return 0;
  return exp.filter(w => got.has(w)).length / exp.length;
}

// ---------------------------------------------------------------- the cast

async function say(node, text) {
  try {
    const r = await axios.post(
      `https://localhost:3000/api/orchestration/animatronic/${node.id}/say`,
      { text },
      { timeout: 45000 }
    );
    // `data` is the PARSED response, kept whole. `body` is only ever for error
    // display and is truncated — parsing the truncated copy silently lost the
    // voice check on any node whose ALSA device name pushed voiceId past the
    // cut, which is exactly the node the check most needed to cover.
    return {
      ok: r.data?.success !== false,
      status: r.status,
      data: r.data,
      body: JSON.stringify(r.data).slice(0, 300)
    };
  } catch (err) {
    return {
      ok: false,
      status: err.response?.status || 0,
      body: (JSON.stringify(err.response?.data) || err.code || String(err)).slice(0, 300)
    };
  }
}

async function checkNode(node) {
  const row = { id: node.id, name: node.name, hostname: node.hostname, ip: node.ip };
  process.stdout.write(`\n── ${node.name} (${node.ip}${node.local ? ', local' : ''})\n`);

  if (!reachable(node)) {
    row.verdict = 'OFFLINE';
    row.note = 'no ssh/shell reachability';
    console.log('   OFFLINE — skipped');
    return row;
  }

  const devices = listCaptureDevices(node);
  if (!devices.length) {
    row.verdict = 'NO-MIC';
    row.note = 'no ALSA capture device on this node';
    console.log('   NO MICROPHONE — cannot ear-check');
    return row;
  }
  console.log(`   mics: ${devices.map(d => `${d.label} (${d.dev})`).join(', ')}`);

  // Sink + volume state, for the diagnosis when something is silent.
  try {
    const st = sh('XDG_RUNTIME_DIR=/run/user/1000 wpctl status 2>/dev/null | sed -n "/Sinks:/,/Sink endpoints:/p"', { node });
    const def = st.split('\n').find(l => l.includes('*'));
    row.sink = def ? def.replace(/[│├*]/g, '').trim() : 'unknown';
    const m = row.sink.match(/vol: ([\d.]+)/);
    row.sinkVolume = m ? parseFloat(m[1]) : null;
  } catch { row.sink = 'unknown'; }
  console.log(`   sink: ${row.sink}`);

  // 1. Noise floor per device — same mics, same settings, yard saying nothing.
  const floors = {};
  for (const d of devices) {
    const p = await startCapture(node, d.dev, 3, `floor-c${d.card}`);
    floors[d.card] = p.error ? null : measure(p);
    if (!p.error && !KEEP) { try { sh(`rm -f ${p}`); } catch { /* best effort */ } }
  }

  // 2. Cast the phrase with every microphone already open. Recorders start
  //    first (NOT awaited) so we never clip the front of the line; the say
  //    fires ~1.2 s into the window, leaving room for TTS to arrive.
  const phrase = PHRASES[node.characterId] || 'Testing, one, two. Can you hear me in the yard?';
  row.phrase = phrase;
  const capPromises = devices.map(d => startCapture(node, d.dev, SECONDS, `cast-c${d.card}`));
  await new Promise(r => setTimeout(r, 1200));
  const sayRes = await say(node, phrase);
  row.sayOk = sayRes.ok;
  if (!sayRes.ok) {
    row.sayError = `${sayRes.status} ${sayRes.body}`;
    console.log(`   say FAILED: ${row.sayError}`);
  }

  // Audible is not the same as RIGHT. Four of six characters once spoke, clearly
  // and intelligibly, in somebody else's voice — a check that only measures level
  // and word recall passes that with full marks. The node reports which voice it
  // actually used, so compare it against the canonical voice for this character.
  const said = sayRes.data;
  row.voiceUsed = said?.data?.voiceId || said?.voiceId || null;
  row.voiceFallback = said?.data?.voiceFallback === true;
  const canonical = CANONICAL_VOICES[node.characterId];
  if (canonical && row.voiceUsed) {
    row.voiceCorrect = row.voiceUsed === canonical;
    if (!row.voiceCorrect) {
      console.log(`   ⚠️  WRONG VOICE: used ${row.voiceUsed}, canonical is ${canonical}`);
    } else {
      console.log(`   voice: ${row.voiceUsed} ✓ canonical`);
    }
  }
  const castPaths = await Promise.all(capPromises);

  // 3. Score every microphone independently, then judge the node on its best.
  row.mics = [];
  for (let i = 0; i < devices.length; i++) {
    const d = devices[i], p = castPaths[i], floor = floors[d.card];
    const m = { label: d.label, dev: d.dev };
    if (p.error || !floor) { m.error = p.error || 'floor capture failed'; row.mics.push(m); continue; }

    const cast = measure(p);
    m.floorDb = +floor.medianDb.toFixed(1);
    m.castP90Db = +cast.p90Db.toFixed(1);
    m.castPeakDb = +cast.peakDb.toFixed(1);
    // Speech presence: how far the loud frames rise over this mic's own quiet floor.
    m.riseDb = +(cast.p90Db - floor.medianDb).toFixed(1);
    // A mic whose floor never varies at all is an unplugged jack, not a room.
    m.floorFlat = +(floor.p90Db - floor.medianDb).toFixed(1) < 0.5;

    const tr = await scribe(p);
    m.transcript = tr.text;
    if (tr.error) m.transcribeError = tr.error;
    m.recall = +wordRecall(phrase, tr.text).toFixed(2);

    console.log(`   [${d.label}] floor ${m.floorDb} → p90 ${m.castP90Db} (rise ${m.riseDb} dB), recall ${(m.recall * 100).toFixed(0)}%`);
    console.log(`      scribe: "${(tr.text || '(nothing)').slice(0, 80)}"`);
    row.mics.push(m);
    if (!KEEP) { try { sh(`rm -f ${p}`); } catch { /* best effort */ } }
  }

  // The best microphone is the one that heard the most of our words; ties and
  // total failures fall back to whichever rose furthest above its own floor.
  const scored = row.mics.filter(m => !m.error);
  const best = scored.sort((a, b) => (b.recall - a.recall) || (b.riseDb - a.riseDb))[0];
  if (!best) {
    row.verdict = 'CAPTURE-FAILED';
    row.note = row.mics.map(m => `${m.label}: ${m.error}`).join('; ');
    console.log(`   capture failed on every mic`);
    return row;
  }
  row.bestMic = best.label;
  row.floorDb = best.floorDb;
  row.castDb = best.castP90Db;
  row.riseDb = best.riseDb;
  row.recall = best.recall;
  row.transcript = best.transcript;

  // 4. Verdict. Both gates must pass — level alone can be a passing car, words
  //    alone can be another animatronic carrying across the yard.
  const levelOk = best.riseDb >= 4;
  const wordsOk = best.recall >= 0.5;
  if (!row.sayOk) row.verdict = 'SILENT';
  // A character speaking clearly in the wrong voice is not a pass. This outranks
  // the acoustic verdict because it is the more serious failure: a silent node is
  // obviously broken, whereas a confident stranger's voice sounds fine and is not
  // noticed until someone who knows the character hears it.
  else if (row.voiceCorrect === false) row.verdict = 'WRONG-VOICE';
  else if (levelOk && wordsOk) row.verdict = 'AUDIBLE';
  else if (levelOk && !wordsOk) row.verdict = 'GARBLED';
  else if (!levelOk && wordsOk) row.verdict = 'FAINT';
  else row.verdict = 'SILENT';

  if (row.verdict !== 'AUDIBLE') {
    const why = [];
    if (!row.sayOk) why.push('the say/TTS call itself failed');
    else if (row.verdict === 'WRONG-VOICE') why.push(
      `spoke in ${row.voiceUsed} but this character's canonical voice is ${CANONICAL_VOICES[node.characterId]}` +
      (row.voiceFallback ? ' (the node reported a voice FALLBACK — the configured voice failed)' : '')
    );
    else if (row.verdict === 'FAINT') why.push(`words were intelligible but the speaker only rose ${best.riseDb} dB over the mic floor — quiet for a yard`);
    else if (row.verdict === 'GARBLED') why.push('sound present but unintelligible — check clipping, distortion, or mic placement');
    else why.push(`no speech detected on any mic (best rise ${best.riseDb} dB)`);
    if (row.sinkVolume != null && row.sinkVolume < 0.7) why.push(`default sink volume is low (${row.sinkVolume}) — raise with wpctl`);
    const dead = row.mics.filter(m => m.floorFlat);
    if (dead.length) why.push(`${dead.map(m => m.label).join(', ')} shows a dead-flat floor (jack likely empty)`);
    row.diagnosis = why.join('; ');
  }
  console.log(`   VERDICT: ${row.verdict}${row.diagnosis ? ' — ' + row.diagnosis : ''}`);
  return row;
}

// ---------------------------------------------------------------- main

mkdirSync(OUTDIR, { recursive: true });

console.log(`Fleet audio ear-check — ${nodes.length} node(s), ${SECONDS}s capture window`);
const rows = [];
for (const node of nodes) rows.push(await checkNode(node));

const pad = (s, n) => String(s).padEnd(n);
console.log('\n\n=== PER-NODE AUDIBLE/SILENT MATRIX ===\n');
console.log(`${pad('Node', 16)}${pad('Best mic', 30)}${pad('Floor', 9)}${pad('Cast', 9)}${pad('Rise', 8)}${pad('Recall', 8)}${pad('Voice', 7)}Verdict`);
console.log('-'.repeat(103));
for (const r of rows) {
  console.log(
    pad(r.name, 16) +
    pad((r.bestMic || '—').slice(0, 28), 30) +
    pad(r.floorDb != null ? `${r.floorDb}` : '—', 9) +
    pad(r.castDb != null ? `${r.castDb}` : '—', 9) +
    pad(r.riseDb != null ? `${r.riseDb}` : '—', 8) +
    pad(r.recall != null ? `${(r.recall * 100).toFixed(0)}%` : '—', 8) +
    pad(r.voiceCorrect == null ? '—' : (r.voiceCorrect ? 'ok' : 'WRONG'), 7) +
    r.verdict
  );
}
const audible = rows.filter(r => r.verdict === 'AUDIBLE');
console.log('-'.repeat(103));
console.log(`${audible.length}/${rows.length} audible`);

const problems = rows.filter(r => r.verdict !== 'AUDIBLE');
if (problems.length) {
  console.log('\n=== NEEDS ATTENTION ===');
  for (const r of problems) console.log(`  ${r.name}: ${r.verdict}${r.diagnosis || r.note ? ' — ' + (r.diagnosis || r.note) : ''}`);
}

const stamp = new Date().toISOString().replace(/[:.]/g, '-').slice(0, 19);
const outFile = join(OUTDIR, `earcheck-${stamp}.json`);
writeFileSync(outFile, JSON.stringify({ ranAt: new Date().toISOString(), conductor: SELF, rows }, null, 2));
console.log(`\nMatrix written to ${outFile}`);
if (KEEP) console.log(`WAVs kept in ${OUTDIR}`);

process.exitCode = problems.some(r =>
  r.verdict === 'SILENT' || r.verdict === 'GARBLED' || r.verdict === 'WRONG-VOICE'
) ? 1 : 0;
