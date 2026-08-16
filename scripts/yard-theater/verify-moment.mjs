#!/usr/bin/env node
/**
 * Yard Theater — moment verifier. Proves a moment actually reached the yard.
 *
 * perform.mjs returning HTTP 200 only proves the orchestration API accepted the
 * call. This runs the moment for real with every node's OWN microphone open,
 * then transcribes each capture with ElevenLabs Scribe and scores it against the
 * lines that moment cast at that node. A node passes only if its microphone rose
 * above its own noise floor AND read back the words we sent it — the same two
 * gates as scripts/fleet-audio/earcheck.mjs, applied to a whole show.
 *
 * --volume exists so this can be rehearsed at 3am without waking the street: it
 * records each node's current sink volume, sets the rehearsal level, and
 * restores the original in a finally block even if the run throws.
 *
 * Usage:
 *   node scripts/yard-theater/verify-moment.mjs moments/dusk-ceremony.json --volume 0.12
 *   node scripts/yard-theater/verify-moment.mjs moments/thomas.json --keep
 */
import { readFileSync, writeFileSync, mkdirSync } from 'node:fs';
import { execFileSync, spawn, spawnSync } from 'node:child_process';
import { dirname, join, isAbsolute } from 'node:path';
import { fileURLToPath } from 'node:url';
import { hostname } from 'node:os';

const HERE = dirname(fileURLToPath(import.meta.url));
const ROOT = join(HERE, '..', '..');
const OUTDIR = join(HERE, 'results');
const EL = 'https://api.elevenlabs.io';

const arg = (n, d) => {
  const i = process.argv.indexOf(`--${n}`);
  return i !== -1 && process.argv[i + 1] && !process.argv[i + 1].startsWith('--') ? process.argv[i + 1] : d;
};
const flag = n => process.argv.includes(`--${n}`);

const momentArg = process.argv.slice(2).find(a => !a.startsWith('--') && a.endsWith('.json'));
if (!momentArg) { console.error('Usage: verify-moment.mjs <moment.json> [--volume 0.12] [--base URL] [--keep]'); process.exit(1); }
const momentPath = isAbsolute(momentArg) ? momentArg : join(HERE, momentArg);
const moment = JSON.parse(readFileSync(momentPath, 'utf8'));

const BASE = arg('base', 'https://localhost:3000');
const REHEARSAL_VOLUME = arg('volume', null);
const KEEP = flag('keep');
const PAD = parseInt(arg('pad', '10'), 10); // seconds of capture beyond the moment's own waits

const KEY = process.env.ELEVENLABS_API_KEY?.trim() ||
  readFileSync('/etc/monsterbox/elevenlabs.key', 'utf8').trim();

const { animatronics } = JSON.parse(readFileSync(join(ROOT, 'config', 'animatronics.json'), 'utf8'));
const SELF = hostname();

// Which nodes does this moment actually cast lines at?
const targeted = new Set();
for (const s of moment.steps) {
  const n = s.say?.node ?? s.audio?.node ?? s.stopAudio?.node;
  if (n === 'all') animatronics.forEach(a => targeted.add(a.id));
  else if (typeof n === 'number') targeted.add(n);
}

function sh(cmd, node, timeout = 60000) {
  if (!node || node.local) return execFileSync('bash', ['-lc', cmd], { timeout, encoding: 'utf8' });
  return execFileSync('ssh', ['-o', 'BatchMode=yes', '-o', 'StrictHostKeyChecking=no',
    '-o', 'ConnectTimeout=8', `remote@${node.ip}`, cmd], { timeout, encoding: 'utf8' });
}
const reachable = node => { try { sh('echo ok', node, 12000); return true; } catch { return false; } };

const nodes = animatronics
  .filter(a => targeted.has(a.id) && a.ip)
  .map(a => ({ ...a, local: a.hostname === SELF }))
  .filter(a => { const r = reachable(a); if (!r) console.log(`   ${a.name}: unreachable over ssh — not instrumented`); return r; });

function captureDevices(node) {
  try {
    return [...sh('arecord -l 2>/dev/null || true', node)
      .matchAll(/^card (\d+): (\S+) \[([^\]]+)\]/gm)].map(m => ({ dev: `plughw:${m[1]},0`, card: m[1], label: m[3] }));
  } catch { return []; }
}

const wpctl = 'XDG_RUNTIME_DIR=/run/user/1000 wpctl';
function getVolume(node) {
  try { return parseFloat(sh(`${wpctl} get-volume @DEFAULT_AUDIO_SINK@`, node).split(':')[1].trim()); }
  catch { return null; }
}
function setVolume(node, v) {
  try { sh(`${wpctl} set-volume @DEFAULT_AUDIO_SINK@ ${v}`, node); return true; } catch { return false; }
}

/** Non-blocking capture: the recorder must already be open when the show starts. */
function startCapture(node, dev, secs, tag) {
  const remote = `/tmp/mb-verify-${tag}.wav`;
  const local = join(OUTDIR, `${node.hostname}-${tag}.wav`);
  const cmd = `arecord -D ${dev} -f S16_LE -r 16000 -c 1 -d ${secs} ${remote} >/dev/null 2>&1 || true`;
  const child = node.local
    ? spawn('bash', ['-lc', cmd])
    : spawn('ssh', ['-o', 'BatchMode=yes', '-o', 'StrictHostKeyChecking=no', '-o', 'ConnectTimeout=8',
      `remote@${node.ip}`, cmd]);
  return new Promise(resolve => {
    const t = setTimeout(() => child.kill(), (secs + 40) * 1000);
    child.on('close', () => {
      clearTimeout(t);
      try {
        if (node.local) sh(`cp ${remote} ${local}`);
        else execFileSync('scp', ['-o', 'BatchMode=yes', '-o', 'StrictHostKeyChecking=no',
          `remote@${node.ip}:${remote}`, local], { timeout: 120000 });
        sh(`rm -f ${remote}`, node);
        resolve(local);
      } catch (err) { resolve({ error: String(err).slice(0, 160) }); }
    });
    child.on('error', err => { clearTimeout(t); resolve({ error: String(err).slice(0, 160) }); });
  });
}

/** Frame envelope in dBFS — a 4 s line inside a 90 s window does not move a whole-window RMS. */
function measure(wav) {
  const buf = readFileSync(wav);
  let off = 12, dataOff = 44, dataLen = buf.length - 44, rate = 16000;
  while (off + 8 <= buf.length) {
    const id = buf.toString('ascii', off, off + 4), size = buf.readUInt32LE(off + 4);
    if (id === 'fmt ') rate = buf.readUInt32LE(off + 12);
    if (id === 'data') { dataOff = off + 8; dataLen = Math.min(size, buf.length - dataOff); break; }
    off += 8 + size + (size % 2);
  }
  const n = Math.floor(dataLen / 2);
  if (n <= 0) return { medianDb: -99, p90Db: -99, seconds: 0 };
  const db = v => (v > 0 ? 20 * Math.log10(v / 32768) : -99);
  const frameLen = Math.max(1, Math.floor(rate * 0.25));
  const frames = [];
  for (let i = 0; i + frameLen <= n; i += frameLen) {
    let sq = 0;
    for (let j = 0; j < frameLen; j++) { const s = buf.readInt16LE(dataOff + (i + j) * 2); sq += s * s; }
    frames.push(db(Math.sqrt(sq / frameLen)));
  }
  const sorted = [...frames].sort((a, b) => a - b);
  const at = q => sorted[Math.min(sorted.length - 1, Math.floor(sorted.length * q))];
  return { medianDb: at(0.5), p90Db: at(0.9), seconds: n / rate };
}

async function scribe(wav) {
  const form = new FormData();
  form.append('file', new Blob([readFileSync(wav)], { type: 'audio/wav' }), 'clip.wav');
  form.append('model_id', 'scribe_v2');
  const r = await fetch(`${EL}/v1/speech-to-text`, { method: 'POST', headers: { 'xi-api-key': KEY }, body: form });
  if (!r.ok) return { text: '', error: `HTTP ${r.status}: ${(await r.text()).slice(0, 160)}` };
  return { text: ((await r.json()).text || '').trim() };
}

/** Fraction of the cast line's distinctive words that survived into the transcript. */
function recall(expected, actual) {
  const strip = s => s.toLowerCase().replace(/\[[^\]]*\]/g, ' ').replace(/[^a-z0-9\s]/g, ' ').split(/\s+/).filter(Boolean);
  const common = new Set(['the', 'a', 'an', 'and', 'of', 'to', 'is', 'it', 'in', 'i', 'you', 'my', 'me',
    'we', 'are', 'be', 'for', 'on', 'at', 'this', 'that', 'from', 'up', 'now', 'all', 'can', 'so', 'as']);
  const exp = strip(expected).filter(w => !common.has(w) && w.length > 2);
  const got = new Set(strip(actual));
  if (!exp.length) return null;
  return exp.filter(w => got.has(w)).length / exp.length;
}

// ------------------------------------------------------------------------ run
mkdirSync(OUTDIR, { recursive: true });

const waitMs = moment.steps.reduce((a, s) => a + (s.wait || 0), 0);
const sayCount = moment.steps.filter(s => s.say).length;
const seconds = Math.ceil(waitMs / 1000) + sayCount * 8 + PAD;

console.log(`Verifying "${moment.name}" via ${BASE}`);
console.log(`Instrumenting ${nodes.length} node(s), ${seconds}s capture window\n`);

const originalVolumes = new Map();
let rows = [];
try {
  if (REHEARSAL_VOLUME) {
    for (const n of nodes) {
      const v = getVolume(n);
      originalVolumes.set(n.id, v);
      const ok = setVolume(n, REHEARSAL_VOLUME);
      console.log(`   ${n.name}: sink volume ${v} -> ${REHEARSAL_VOLUME}${ok ? '' : ' (FAILED to set)'}`);
    }
    console.log('');
  }

  const caps = [];
  for (const n of nodes) {
    for (const d of captureDevices(n)) {
      caps.push({ node: n, dev: d, promise: startCapture(n, d.dev, seconds, `c${d.card}`) });
    }
  }
  if (!caps.length) console.log('   WARNING: no capture devices found on any node — level/transcript proof unavailable');
  await new Promise(r => setTimeout(r, 2000)); // let every recorder actually open

  console.log('--- performing ---');
  const perform = spawnSync('node', [join(HERE, 'perform.mjs'), momentPath, '--base', BASE],
    { encoding: 'utf8', timeout: (seconds + 60) * 1000 });
  process.stdout.write(perform.stdout || '');
  process.stderr.write(perform.stderr || '');
  console.log('--- performed, waiting for captures ---\n');

  const done = await Promise.all(caps.map(c => c.promise));

  // Every line this moment cast, per node.
  const linesFor = id => moment.steps.filter(s => s.say && s.say.node === id).map(s => s.say.text);

  for (const n of nodes) {
    const mine = caps.map((c, i) => ({ ...c, path: done[i] })).filter(c => c.node.id === n.id);
    const expected = linesFor(n.id);
    const scored = [];
    for (const c of mine) {
      if (c.path?.error) { scored.push({ label: c.dev.label, error: c.path.error }); continue; }
      const m = measure(c.path);
      const tr = await scribe(c.path);
      const rec = expected.length ? Math.max(...expected.map(e => recall(e, tr.text) ?? 0)) : null;
      scored.push({
        label: c.dev.label, floorDb: +m.medianDb.toFixed(1), p90Db: +m.p90Db.toFixed(1),
        riseDb: +(m.p90Db - m.medianDb).toFixed(1), recall: rec, transcript: tr.text, error: tr.error
      });
      if (!KEEP) { try { sh(`rm -f "${c.path}"`); } catch { /* best effort */ } }
    }
    const ok = scored.filter(s => !s.error);
    const best = ok.sort((a, b) => (b.recall ?? 0) - (a.recall ?? 0) || b.riseDb - a.riseDb)[0];
    const row = { id: n.id, name: n.name, expectedLines: expected.length, best };
    if (!best) row.verdict = 'CAPTURE-FAILED';
    else if (!expected.length) row.verdict = best.riseDb >= 4 ? 'SOUND-HEARD' : 'NO-LINES-CAST';
    else if (best.riseDb >= 4 && best.recall >= 0.4) row.verdict = 'HEARD';
    else if (best.riseDb >= 4) row.verdict = 'GARBLED';
    else row.verdict = 'SILENT';
    rows.push(row);

    console.log(`── ${n.name} (${expected.length} line(s) cast)`);
    if (best) {
      console.log(`   mic ${best.label}: floor ${best.floorDb} dB, p90 ${best.p90Db} dB (rise ${best.riseDb}), recall ${best.recall == null ? 'n/a' : (best.recall * 100).toFixed(0) + '%'}`);
      console.log(`   scribe: "${(best.transcript || '(nothing)').slice(0, 200)}"`);
    }
    console.log(`   VERDICT: ${row.verdict}\n`);
  }
} finally {
  for (const [id, v] of originalVolumes) {
    if (v == null) continue;
    const n = nodes.find(x => x.id === id);
    const ok = setVolume(n, v);
    console.log(`   ${n.name}: sink volume restored to ${v}${ok ? '' : ' (RESTORE FAILED — set it by hand)'}`);
  }
}

console.log('\n=== MOMENT VERIFICATION ===');
for (const r of rows) console.log(`  ${String(r.name).padEnd(16)}${String(r.expectedLines).padEnd(8)}${r.verdict}`);
const stamp = new Date().toISOString().replace(/[:.]/g, '-').slice(0, 19);
const out = join(OUTDIR, `verify-${stamp}.json`);
writeFileSync(out, JSON.stringify({ ranAt: new Date().toISOString(), moment: moment.name, base: BASE, rehearsalVolume: REHEARSAL_VOLUME, rows }, null, 2));
console.log(`\nWritten to ${out}`);
process.exitCode = rows.some(r => r.verdict === 'SILENT' || r.verdict === 'CAPTURE-FAILED') ? 1 : 0;
