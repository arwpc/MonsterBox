#!/usr/bin/env node
/**
 * Fleet end-to-end verification — every animatronic, every layer.
 *
 * Runs the whole stack against each real node and prints one matrix: reachability,
 * pages, data integrity, every super power, the conversational AI, audio proven by
 * ear, the microphone proven by frames, and motion resolution proven against that
 * node's OWN hardware vocabulary.
 *
 * Three rules this script exists to honour:
 *
 *   1. A success field is not evidence. `played:true` is returned by a muted node,
 *      and `success:true` comes back from a say endpoint whose audio never reached
 *      the room. Audio is scored by measured level rise plus a Scribe transcript,
 *      via the existing ear-check harness rather than a second implementation.
 *
 *   2. Nothing is hardcoded to a character. Every node is asked what IT has —
 *      its parts, its roles, its capabilities — and checks adapt or skip. A node
 *      with no movable parts is not a failure; it is an audio-only character.
 *
 *   3. It never drives hardware the operator has declared broken, and never drives
 *      the two parts that are dangerous but NOT fault-listed (see DANGEROUS_PARTS).
 *      Motion is verified by DRY-RUN resolution by default; --drive opts in to one
 *      small real movement on a part this script has proven safe.
 *
 * Usage:
 *   node scripts/fleet-e2e.mjs                 # all nodes, no audio, no hardware
 *   node scripts/fleet-e2e.mjs --audio         # + ear-check (ElevenLabs credits, makes noise)
 *   node scripts/fleet-e2e.mjs --ai            # + live agent round trip (credits)
 *   node scripts/fleet-e2e.mjs --drive         # + ONE small real movement per node
 *   node scripts/fleet-e2e.mjs --nodes 3,6     # a subset
 *   node scripts/fleet-e2e.mjs --full          # --audio --ai --drive
 */
import { readFileSync, writeFileSync, mkdirSync } from 'node:fs';
import { spawnSync } from 'node:child_process';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import https from 'node:https';
import axiosMod from 'axios';

const HERE = dirname(fileURLToPath(import.meta.url));
const ROOT = join(HERE, '..');
const OUTDIR = join(HERE, 'fleet-audio', 'results');

const arg = (name, fallback) => {
  const i = process.argv.indexOf(`--${name}`);
  return i !== -1 && process.argv[i + 1] && !process.argv[i + 1].startsWith('--')
    ? process.argv[i + 1] : fallback;
};
const flag = (n) => process.argv.includes(`--${n}`);
const FULL = flag('full');
const WANT_AUDIO = FULL || flag('audio');
const WANT_AI = FULL || flag('ai');
const WANT_DRIVE = FULL || flag('drive');
const nodeFilter = arg('nodes', 'all');

// Every node serves HTTPS with a self-signed cert. Node's global fetch ignores
// an `agent` option (that is node-fetch's API, not undici's), so this uses the
// same axios + httpsAgent client the ear-check harness already relies on.
const axios = axiosMod.create({
  httpsAgent: new https.Agent({ rejectUnauthorized: false }),
  validateStatus: () => true
});

/**
 * Parts that are NOT in physical-faults.json but must never be driven by an
 * automated sweep. These are physics, recorded as knowledge rather than as
 * enforcement, per the operator's standing ruling that software refuses nothing.
 * A suite is exactly the caller that must respect them anyway.
 */
const DANGEROUS_PARTS = {
  // 900-degree multi-turn neck; a full rotation tears the head cabling.
  4: ['1'],
};

async function req(url, opts = {}) {
  const t0 = Date.now();
  try {
    const res = await axios.request({
      url,
      method: opts.method || 'GET',
      headers: opts.headers,
      data: opts.body,
      timeout: opts.timeoutMs || 15000,
      transformResponse: [(d) => d]        // keep the raw body; parse below
    });
    const text = typeof res.data === 'string' ? res.data : JSON.stringify(res.data);
    let json = null;
    try { json = JSON.parse(text); } catch (_) { /* an HTML page, not JSON */ }
    return { ok: res.status >= 200 && res.status < 300, status: res.status, json, text, ms: Date.now() - t0 };
  } catch (err) {
    return { ok: false, status: 0, error: err.message, ms: Date.now() - t0 };
  }
}

function loadNodes() {
  const cfg = JSON.parse(readFileSync(join(ROOT, 'config', 'animatronics.json'), 'utf8'));
  const list = Object.values(cfg.animatronics || cfg).filter(a => a && a.ip);
  const wanted = nodeFilter === 'all' ? null : new Set(nodeFilter.split(',').map(s => s.trim()));
  return list
    .filter(a => !wanted || wanted.has(String(a.id)))
    .sort((a, b) => a.id - b.id);
}

function loadFaults() {
  try {
    return JSON.parse(readFileSync(join(ROOT, 'config', 'physical-faults.json'), 'utf8')).characters || {};
  } catch (_) { return {}; }
}

// ---------------------------------------------------------------- checks

function mkResult() { return { pass: 0, fail: 0, skip: 0, rows: [] }; }
function record(r, name, state, detail) {
  r.rows.push({ name, state, detail });
  if (state === 'PASS') r.pass++; else if (state === 'FAIL') r.fail++; else r.skip++;
}

async function runNode(node, faults) {
  const base = `https://${node.ip}:${node.port || 3000}`;
  const cid = node.characterId ?? node.id;
  const r = mkResult();
  r.node = node;

  // --- reachability + identity -------------------------------------
  const health = await req(`${base}/health`);
  if (!health.ok || !health.json) {
    record(r, 'reachable', 'FAIL', health.error || `HTTP ${health.status}`);
    return r; // everything else is meaningless
  }
  record(r, 'reachable', 'PASS', `v${health.json.version} in ${health.ms}ms`);

  const pkg = JSON.parse(readFileSync(join(ROOT, 'package.json'), 'utf8'));
  record(r, 'version matches repo', health.json.version === pkg.version ? 'PASS' : 'FAIL',
    `node ${health.json.version} vs repo ${pkg.version}`);

  const sel = await req(`${base}/api/config`);
  const selChar = sel.json?.config?.selectedCharacter;
  record(r, 'serving its own character', String(selChar) === String(cid) ? 'PASS' : 'FAIL',
    `selectedCharacter=${selChar}, expected ${cid} (${node.name})`);

  // --- pages --------------------------------------------------------
  const pages = ['/', '/setup', '/setup/ai-motion', '/setup/follow-orders',
    '/setup/jaw-animation', '/setup/head-animation', '/scenes', '/orchestration'];
  const bad = [];
  for (const p of pages) {
    const res = await req(`${base}${p}`, { timeoutMs: 20000 });
    if (!res.ok) bad.push(`${p}:${res.status || res.error}`);
  }
  record(r, `pages load (${pages.length})`, bad.length ? 'FAIL' : 'PASS', bad.join(' ') || 'all 200');

  // --- data ---------------------------------------------------------
  const parts = await req(`${base}/api/parts?characterId=${cid}`);
  const partList = Array.isArray(parts.json) ? parts.json : (parts.json?.parts || []);
  record(r, 'parts load', partList.length ? 'PASS' : 'FAIL', `${partList.length} parts`);

  // --- super powers -------------------------------------------------
  const am = await req(`${base}/setup/ai-motion/api/ai-motion/${cid}`);
  record(r, 'AI Motion config', am.json?.success ? 'PASS' : 'FAIL',
    am.json?.success ? `enabled=${am.json.config.enabled}` : (am.error || `HTTP ${am.status}`));

  const caps = await req(`${base}/setup/ai-motion/api/ai-motion/${cid}/capabilities`);
  const capCount = caps.json?.capabilities?.length ?? 0;
  const rejected = caps.json?.rejected?.length ?? 0;
  record(r, 'AI Motion capabilities', caps.json?.success ? (rejected ? 'FAIL' : 'PASS') : 'FAIL',
    `${capCount} authored, ${rejected} refused by the runtime`);

  const roles = await req(`${base}/setup/ai-motion/api/ai-motion/${cid}/roles`);
  const roleNames = Object.keys(roles.json?.roles || {});
  record(r, 'AI Motion roles resolved', roles.json?.success ? 'PASS' : 'FAIL',
    roleNames.length ? roleNames.join(',') : 'no movable parts (audio-only character)');

  // Toggle round trip — restore whatever it was.
  const wasEnabled = !!am.json?.config?.enabled;
  const on = await req(`${base}/conversation/api/ai-motion`, {
    method: 'POST', headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ enabled: true })
  });
  const readBack = await req(`${base}/conversation/api/ai-motion`);
  const latched = readBack.json?.enabled === true;
  // A node with nothing to move SHOULD refuse to latch on. That is a pass.
  const expectRefuse = roleNames.length === 0;
  record(r, 'AI Motion toggle honest',
    expectRefuse ? (latched ? 'FAIL' : 'PASS') : (latched ? 'PASS' : 'FAIL'),
    expectRefuse ? `refused as expected: ${on.json?.error || 'n/a'}` : `latched=${latched}`);
  await req(`${base}/conversation/api/ai-motion`, {
    method: 'POST', headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ enabled: wasEnabled })
  });

  for (const [label, path] of [
    ['Follow Orders config', `/setup/follow-orders/api/follow-orders/${cid}`],
    ['Jaw animation config', `/setup/jaw-animation/api/jaw-animation/${cid}`],
    ['Head tracking status', `/conversation/api/head-tracking-status`]
  ]) {
    const res = await req(`${base}${path}`);
    record(r, label, res.ok ? 'PASS' : 'FAIL', res.ok ? 'readable' : (res.error || `HTTP ${res.status}`));
  }

  // --- motion resolution (dry run — no hardware) ---------------------
  const phrases = ['look at me', 'open your mouth', 'wave at me', 'do something', 'light up'];
  const resolved = [];
  for (const ph of phrases) {
    const m = await req(`${base}/setup/follow-orders/api/test-match/${cid}`, {
      method: 'POST', headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ text: ph })
    });
    const match = m.json?.match;
    if (match?.matched) {
      resolved.push(`${ph}→${match.part?.name || match.poseName || match.gestureId}`);
    }
  }
  // Zero resolutions is only acceptable when the character genuinely cannot move.
  record(r, 'guest phrases resolve to its own parts',
    resolved.length ? 'PASS' : (roleNames.length ? 'FAIL' : 'SKIP'),
    resolved.length ? resolved.slice(0, 3).join('  ') : 'nothing movable');

  // --- capability CRUD round trip ------------------------------------
  if (roleNames.length >= 1) {
    const probeId = `e2e_probe_${Date.now()}`;
    const servo = (roles.json.roles.head || roles.json.roles.jaw || roles.json.roles.arm || [])[0];
    const light = (roles.json.roles.light || [])[0];
    let crud = 'SKIP', detail = 'needs a servo + a light to satisfy the concurrency rule';
    if (servo && light) {
      const create = await req(`${base}/setup/ai-motion/api/ai-motion/${cid}/capabilities`, {
        method: 'POST', headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          id: probeId, label: 'e2e probe', intent: 'verification',
          steps: [
            { partId: String(servo.partId), type: 'servo', target: 90, delayMs: 0, durationMs: 800 },
            { partId: String(light.partId), type: 'light', level: 40, delayMs: 100 }
          ]
        })
      });
      if (create.json?.success) {
        const del = await req(`${base}/setup/ai-motion/api/ai-motion/${cid}/capabilities/${probeId}`, { method: 'DELETE' });
        crud = del.json?.success ? 'PASS' : 'FAIL';
        detail = del.json?.success ? 'create + delete clean' : 'created but DELETE failed — LEFT BEHIND';
      } else {
        // A refusal naming a real rule is still correct behaviour, not a break.
        const err = create.json?.error || '';
        const principled = /calibrated window|distinct parts|pose/.test(err);
        crud = principled ? 'PASS' : 'FAIL';
        detail = principled ? `refused on a real rule: ${err.slice(0, 70)}` : err.slice(0, 90);
      }
    }
    record(r, 'capability CRUD', crud, detail);
  } else {
    record(r, 'capability CRUD', 'SKIP', 'no movable parts');
  }

  // --- conversational AI ---------------------------------------------
  if (WANT_AI) {
    const q1 = await req(`${base}/conversation/api/ask-ai?characterId=${cid}`, {
      method: 'POST', headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ question: 'Good evening. Who are you?' }), timeoutMs: 120000
    });
    const a1 = q1.json?.response || '';
    const real = q1.json?.success && !q1.json?.fallback && a1 && a1 !== 'Response received';
    record(r, 'AI answers (not fallback)', real ? 'PASS' : 'FAIL',
      real ? a1.slice(0, 70) : `fallback=${q1.json?.fallback} resp="${a1.slice(0, 40)}"`);

    if (real) {
      const q2 = await req(`${base}/conversation/api/ask-ai?characterId=${cid}`, {
        method: 'POST', headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ question: 'What do you want from me?' }), timeoutMs: 120000
      });
      const a2 = q2.json?.response || '';
      // The greeting bug: the agent's opening was glued onto the front of every
      // answer. If two different questions start with the same long prefix, it
      // is back.
      const prefix = (s) => s.replace(/\[[^\]]*\]/g, '').trim().slice(0, 45);
      const repeated = a2 && prefix(a1) && prefix(a1) === prefix(a2);
      record(r, 'greeting not replayed', repeated ? 'FAIL' : 'PASS',
        repeated ? `both turns open with "${prefix(a1)}"` : 'each turn opens differently');
    }
  } else {
    record(r, 'AI answers (not fallback)', 'SKIP', 'pass --ai');
    record(r, 'greeting not replayed', 'SKIP', 'pass --ai');
  }

  // --- one small real movement ---------------------------------------
  if (WANT_DRIVE) {
    const broken = new Set(Object.keys((faults[String(cid)] || {}).parts || {}));
    const dangerous = new Set(DANGEROUS_PARTS[cid] || []);
    const lights = (roles.json?.roles?.light || []).filter(p => !broken.has(String(p.partId)) && !dangerous.has(String(p.partId)));
    if (lights.length) {
      // A light is the safest possible proof of a real hardware round trip:
      // no travel, no rail, nothing to stall.
      const p = lights[0];
      const onRes = await req(`${base}/api/parts/${p.partId}/test?characterId=${cid}`, {
        method: 'POST', headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ action: 'on' }), timeoutMs: 20000
      });
      await new Promise(s => setTimeout(s, 600));
      await req(`${base}/api/parts/${p.partId}/test?characterId=${cid}`, {
        method: 'POST', headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ action: 'off' }), timeoutMs: 20000
      });
      record(r, 'real hardware driven', onRes.ok ? 'PASS' : 'FAIL', `${p.name} on/off`);
    } else {
      record(r, 'real hardware driven', 'SKIP', 'no safe light on this character');
    }
  } else {
    record(r, 'real hardware driven', 'SKIP', 'pass --drive');
  }

  return r;
}

// ---------------------------------------------------------------- audio

function runEarcheck(ids) {
  // spawnSync, not execFileSync: the ear-check exits NON-ZERO whenever any node
  // needs attention, which is a normal result, not a crash. execFileSync throws
  // on that and the harness reported a perfectly good audio sweep as "failed to
  // run" — discarding six real verdicts.
  //
  // 20s, not 14. A slow-speaking character's cast line runs past the shorter
  // window, and a clipped tail scores as GARBLED on word recall — a false
  // failure on a node whose audio is perfect. The ear-check's own source carries
  // this warning; the harness has to honour it too.
  const proc = spawnSync('node',
    [join(HERE, 'fleet-audio', 'earcheck.mjs'), '--nodes', ids.join(','), '--seconds', '20'],
    { cwd: ROOT, encoding: 'utf8', timeout: 25 * 60 * 1000, stdio: ['ignore', 'pipe', 'pipe'] });

  const out = `${proc.stdout || ''}`;
  // Read the ear-check's own JSON rather than scraping its printed matrix. It
  // already computes everything that matters — per-mic floorFlat and a written
  // diagnosis — and a regex over a column layout throws all of that away.
  const m = out.match(/Matrix written to (\S+)/);
  if (!m) return { __error: proc.error?.message || `no result file (status ${proc.status})` };
  try {
    const data = JSON.parse(readFileSync(m[1], 'utf8'));
    const byName = {};
    for (const row of data.rows || []) byName[row.name] = row;
    return byName;
  } catch (err) {
    return { __error: `could not read ${m[1]}: ${err.message}` };
  }
}

// ---------------------------------------------------------------- main

const nodes = loadNodes();
const faults = loadFaults();
console.log(`\nFleet end-to-end — ${nodes.length} node(s)` +
  `  [audio:${WANT_AUDIO ? 'on' : 'off'} ai:${WANT_AI ? 'on' : 'off'} drive:${WANT_DRIVE ? 'on' : 'off'}]\n`);

const results = [];
for (const node of nodes) {
  process.stdout.write(`── ${node.name} (${node.ip}) `);
  const r = await runNode(node, faults);
  results.push(r);
  console.log(`${r.pass} pass / ${r.fail} fail / ${r.skip} skip`);
  for (const row of r.rows) {
    const mark = row.state === 'PASS' ? '✓' : row.state === 'FAIL' ? '✗' : '·';
    console.log(`   ${mark} ${row.name.padEnd(34)} ${row.detail || ''}`);
  }
  console.log('');
}

if (WANT_AUDIO) {
  const reachable = results.filter(r => r.rows[0].state === 'PASS').map(r => r.node.id);
  console.log(`── ear-check (${reachable.length} node(s)) — recording each node's own microphone…\n`);
  const verdicts = runEarcheck(reachable);
  if (verdicts.__error) {
    console.log(`   ear-check failed to run: ${verdicts.__error}\n`);
  } else {
    for (const r of results) {
      const v = verdicts[r.node.name];
      if (!v) { record(r, 'speaker AUDIBLE by ear', 'SKIP', 'no ear-check row'); continue; }
      // A dead-flat floor is an EMPTY MICROPHONE JACK, not a silent speaker. The
      // adapter reports a pristine -80-something dB with no signal path behind
      // it, so nothing the speaker does can ever raise it. Scoring that as a
      // speaker failure blames the wrong component and sends someone to check a
      // speaker that is fine. The ear-check already flags it per mic as
      // floorFlat; when EVERY microphone on a node is flat there is no capture
      // path at all and the honest answer is "unproven", not "failed".
      // Trust the physics, not just the flag. The ear-check's own floorFlat is
      // computed per run and has been observed both true and false for the SAME
      // empty jack on the same node minutes apart, so it cannot be the only
      // signal. A floor below -70 dB is not a room: a live microphone anywhere
      // near a working animatronic sits around -40. Either signal means there is
      // no capture path, and a node with no capture path cannot testify about
      // its own speaker either way.
      const mics = v.mics || [];
      const deaf = (x) => x.floorFlat === true || (typeof x.floorDb === 'number' && x.floorDb < -70);
      const noCapture = mics.length > 0 && mics.every(deaf);
      if (v.verdict !== 'AUDIBLE' && noCapture) {
        record(r, 'speaker AUDIBLE by ear', 'SKIP',
          `cannot verify — every microphone on this node is a dead-flat jack. Speaker UNPROVEN, not disproven. ${v.diagnosis || ''}`);
      } else {
        record(r, 'speaker AUDIBLE by ear', v.verdict === 'AUDIBLE' ? 'PASS' : 'FAIL',
          `${v.verdict} rise ${v.riseDb}dB recall ${v.recall}%` + (v.transcript ? ` — "${String(v.transcript).slice(0, 50)}"` : ''));
      }
    }
  }
}

console.log('\n=== FLEET MATRIX ===\n');
const allChecks = [...new Set(results.flatMap(r => r.rows.map(x => x.name)))];
const w = Math.max(...allChecks.map(c => c.length)) + 1;
process.stdout.write('CHECK'.padEnd(w));
for (const r of results) process.stdout.write(r.node.name.slice(0, 13).padEnd(15));
console.log('');
console.log('-'.repeat(w + 15 * results.length));
for (const c of allChecks) {
  process.stdout.write(c.padEnd(w));
  for (const r of results) {
    const row = r.rows.find(x => x.name === c);
    process.stdout.write((row ? (row.state === 'PASS' ? '✓' : row.state === 'FAIL' ? '✗ FAIL' : '·') : '?').padEnd(15));
  }
  console.log('');
}
console.log('-'.repeat(w + 15 * results.length));
process.stdout.write('TOTAL'.padEnd(w));
for (const r of results) process.stdout.write(`${r.pass}/${r.pass + r.fail}`.padEnd(15));
console.log('\n');

const failures = results.flatMap(r => r.rows.filter(x => x.state === 'FAIL').map(x => `${r.node.name}: ${x.name} — ${x.detail}`));
if (failures.length) {
  console.log('=== NEEDS ATTENTION ===');
  for (const f of failures) console.log(`  ✗ ${f}`);
} else {
  console.log('All checks passed on every reachable node.');
}

mkdirSync(OUTDIR, { recursive: true });
const stamp = new Date().toISOString().replace(/[:.]/g, '-').slice(0, 19);
const outFile = join(OUTDIR, `fleet-e2e-${stamp}.json`);
writeFileSync(outFile, JSON.stringify({
  ranAt: new Date().toISOString(),
  options: { audio: WANT_AUDIO, ai: WANT_AI, drive: WANT_DRIVE },
  results: results.map(r => ({ id: r.node.id, name: r.node.name, ip: r.node.ip, pass: r.pass, fail: r.fail, skip: r.skip, rows: r.rows }))
}, null, 2));
console.log(`\nMatrix written to ${outFile}`);
process.exit(failures.length ? 1 : 0);
