#!/usr/bin/env node
/**
 * Log review — the standing error-log sweep for a MonsterBox node.
 *
 * Born 2026-08-17: a "ready for Halloween" v9.3.0 fleet turned out to be
 * carrying a dead webcam (USB over-current), voice configs silently flattened
 * by the test suite, a health check auditing the wrong character, failed
 * systemd units, and 143k lines of dead-token telemetry spam — none of it
 * visible until someone actually read the logs. This script makes that read
 * cheap, so it happens.
 *
 * Usage:
 *   node scripts/log-review.mjs            # full local sweep
 *   node scripts/log-review.mjs --quick    # fast subset (post-commit hook)
 *   node scripts/log-review.mjs --json     # machine-readable output
 *
 * Exit code: 0 = quiet, 1 = findings that deserve a look.
 * The AI-side triage (updating docs/troubleshooting/KNOWN-BUGS.md) is the
 * /log-review skill; this script only collects and flags.
 */

import { execSync } from 'child_process';
import fs from 'fs';
import os from 'os';

const QUICK = process.argv.includes('--quick');
const JSON_OUT = process.argv.includes('--json');
const findings = [];
const note = (level, area, message) => findings.push({ level, area, message });

function sh(cmd, timeoutMs = 8000) {
  try {
    return execSync(cmd, { encoding: 'utf8', timeout: timeoutMs, stdio: ['ignore', 'pipe', 'pipe'] }).trim();
  } catch (e) {
    return (e.stdout || '').toString().trim();
  }
}

// Lines that are known, tracked, and not news. Keep this list SHORT — every
// entry here must have a matching item in KNOWN-BUGS.md, or it is suppression.
const KNOWN_SIGNATURES = [
  /arm-fused-rail mixes incompatible voltage classes/,   // real hardware fact, tracked
  /ch\d+ is driven at [\d.]+us but no part/,             // stray PCA hold, tracked
  /Attempting to reconnect \d+ offline goblins/,          // throttled, offline goblins
];
const isKnown = (line) => KNOWN_SIGNATURES.some((re) => re.test(line));

// ── 1. systemd: failed units ────────────────────────────────────────────────
const failed = sh('systemctl --failed --no-legend --no-pager 2>/dev/null');
if (failed) note('error', 'systemd', `failed units:\n${failed}`);

// ── 2. kernel since boot: power / USB / thermal ─────────────────────────────
const kern = sh('journalctl -k -b --no-pager 2>/dev/null | grep -iE "over-current|under-voltage|throttl|usb .*disconnect" | tail -20', 15000);
if (kern) {
  const overCurrent = (kern.match(/over-current/gi) || []).length;
  const underVolt = (kern.match(/under-voltage/gi) || []).length;
  if (overCurrent) note('error', 'kernel', `${overCurrent} USB over-current events this boot (5V rail / hub) — last:\n${kern.split('\n').slice(-3).join('\n')}`);
  if (underVolt) note('error', 'kernel', `${underVolt} under-voltage events this boot (Pi supply browning out)`);
  if (!overCurrent && !underVolt) note('warn', 'kernel', `USB churn this boot:\n${kern.split('\n').slice(-5).join('\n')}`);
}

// ── 3. app error log: new content since last review ─────────────────────────
const STATE_FILE = 'data/log-review-state.json';
let state = {};
try { state = JSON.parse(fs.readFileSync(STATE_FILE, 'utf8')); } catch (_) { /* first run */ }
for (const f of ['/var/log/monsterbox.err', '/var/log/monsterbox.log']) {
  let size = 0;
  try { size = fs.statSync(f).size; } catch (_) { continue; }
  const prev = state[f] && state[f] <= size ? state[f] : 0; // log rotated → start over
  if (size > prev) {
    const delta = sh(`tail -c +${prev + 1} ${JSON.stringify(f)} 2>/dev/null`);
    const errLines = delta.split('\n').filter((l) =>
      /error|fail|refus|denied|EACCES|ENOENT|unhandled|exception|⚠|🛑/i.test(l) &&
      !isKnown(l) && l.trim());
    if (errLines.length) {
      const uniq = [...new Set(errLines.map((l) => l.replace(/[\d.]+/g, 'N').slice(0, 140)))];
      note(f.endsWith('.err') ? 'error' : 'warn', 'app-log',
        `${errLines.length} new error-ish lines in ${f} since last review; ${uniq.length} distinct:\n  ` +
        uniq.slice(0, 10).join('\n  '));
    }
  }
  state[f] = size;
}
try { fs.writeFileSync(STATE_FILE, JSON.stringify(state, null, 2)); } catch (_) { /* read-only tree */ }

// ── 4. startup health record ────────────────────────────────────────────────
try {
  const h = JSON.parse(fs.readFileSync('data/startup-health.json', 'utf8'));
  if (h.overallStatus !== 'OK') {
    const warns = Object.entries(h.checks).filter(([, c]) => c.status !== 'ok')
      .map(([k, c]) => `${k}: ${c.status}${c.warnings ? ' — ' + c.warnings.join(' | ') : ''}`);
    const fresh = warns.filter((w) => !isKnown(w));
    if (fresh.length) note('warn', 'startup-health', fresh.join('\n'));
  }
} catch (_) { /* no record */ }

// ── 5. voice-config drift vs committed canonical ────────────────────────────
// The fingerprint of the historical clobber class is stability/similarity
// silently becoming page defaults while voice_id survives. Committed configs
// are canonical; drift here has twice meant "a save path is flattening voices".
const charDirs = fs.readdirSync('data').filter((d) => /^character-\d+$/.test(d));
for (const d of charDirs) {
  const rel = `data/${d}/ai-config/tts-config.json`;
  if (!fs.existsSync(rel)) continue;
  const committed = sh(`git show HEAD:${JSON.stringify(rel)} 2>/dev/null`);
  if (!committed) continue;
  try {
    const a = JSON.parse(committed); const b = JSON.parse(fs.readFileSync(rel, 'utf8'));
    const diffs = ['voice_id', 'stability', 'similarity_boost', 'speed', 'model']
      .filter((k) => JSON.stringify(a[k]) !== JSON.stringify(b[k]))
      .map((k) => `${k}: ${JSON.stringify(a[k])} → ${JSON.stringify(b[k])}`);
    if (diffs.length) note('error', 'voice-config', `${rel} drifted from committed canonical: ${diffs.join(', ')}`);
  } catch (_) { note('warn', 'voice-config', `${rel} unparseable`); }
}

// ── 6. sink volume + mute vs canonical ──────────────────────────────────────
try {
  const anims = JSON.parse(fs.readFileSync('config/animatronics.json', 'utf8')).animatronics || [];
  const me = anims.find((a) => a.hostname === os.hostname());
  const vol = parseFloat((sh('wpctl get-volume @DEFAULT_AUDIO_SINK@ 2>/dev/null').match(/[\d.]+/) || [])[0]);
  if (me && me.sinkVolume != null && Number.isFinite(vol) && Math.abs(vol - me.sinkVolume) > 0.02) {
    note('warn', 'audio', `sink volume ${vol} != canonical ${me.sinkVolume} (wpctl is node-local; suites and reboots reset it)`);
  } else if (me && me.sinkVolume == null && Number.isFinite(vol)) {
    // A live node with no recorded canonical is a gap, not a pass — the level
    // that "worked" evaporates on the next reboot with nothing to compare to.
    note('warn', 'audio', `no canonical sinkVolume recorded for ${me.hostname} in config/animatronics.json — ear-verify a level and record it`);
  }
  const mute = sh('curl -sk --max-time 4 https://localhost:3000/conversation/api/speaker-mute 2>/dev/null');
  if (/"muted":true/.test(mute)) note('error', 'audio', 'speaker mute flag is ON — the show plays silence (a dead WS session has left this on before)');
} catch (_) { /* not fatal */ }

// ── fleet mode: every animatronic in the registry, whoever is live today ────
// No hostname is special-cased: the roster comes entirely from
// config/animatronics.json, so a node that comes online next week is covered
// with zero changes here. ip:null entries (Renfield) are skipped exactly the
// way isValidHost() skips them in orchestration.
if (process.argv.includes('--fleet')) {
  const anims = JSON.parse(fs.readFileSync('config/animatronics.json', 'utf8')).animatronics || [];
  const myVersion = JSON.parse(fs.readFileSync('package.json', 'utf8')).version;
  for (const a of anims) {
    if (a.hostname === os.hostname()) continue;
    if (!a.ip) { note('info', 'fleet', `${a.name}: no address by design — never networked, nothing to check`); continue; }
    const health = sh(`curl -sk --max-time 6 https://${a.ip}:3000/health 2>/dev/null`, 8000);
    let v = null;
    try { v = JSON.parse(health).version; } catch (_) { /* offline */ }
    if (!v) { note('warn', 'fleet', `${a.name} (${a.ip}): OFFLINE / no health — unverified, not assumed fine`); continue; }
    if (v !== myVersion) note('error', 'fleet', `${a.name} (${a.ip}): serving v${v} but this node is v${myVersion} — mixed-version fleet (a fix only exists on a node that received the deploy)`);
    else note('info', 'fleet', `${a.name} (${a.ip}): online, v${v}`);
    // Deep sweep when SSH credentials are available in the environment.
    if (process.env.MONSTERBOX_SSH_PASSWORD) {
      const remote = sh(`sshpass -e ssh -o StrictHostKeyChecking=no -o ConnectTimeout=8 remote@${a.ip} 'cd /home/remote/MonsterBox && node scripts/log-review.mjs --quick --json' 2>/dev/null`, 60000);
      try {
        const rj = JSON.parse(remote);
        for (const f of rj.findings || []) note(f.level, `fleet:${a.name}/${f.area}`, f.message);
        if (!(rj.findings || []).length) note('info', 'fleet', `${a.name}: quiet`);
      } catch (_) { note('warn', 'fleet', `${a.name}: reachable but remote collector did not answer (old build without scripts/log-review.mjs?)`); }
    }
  }
}

if (!QUICK) {
  // ── 7. journal error volume since boot (spam detection) ───────────────────
  const jcount = parseInt(sh('journalctl -b -p warning --no-pager 2>/dev/null | wc -l', 20000) || '0', 10);
  if (jcount > 2000) note('warn', 'journal', `${jcount} warning+ journal lines this boot — something is flooding (dead-token telemetry did 143k once)`);

  // ── 8. git position ───────────────────────────────────────────────────────
  sh('git fetch origin --quiet 2>/dev/null', 20000);
  const behind = parseInt(sh('git rev-list --count HEAD..origin/main 2>/dev/null') || '0', 10);
  if (behind > 0) note('warn', 'git', `HEAD is ${behind} commits behind origin/main — sync before work (see sync-before-work memory)`);
  const codeDirty = sh('git status --porcelain 2>/dev/null')
    .split('\n').filter((l) => /\.(js|mjs|ejs|py|sh)$/.test(l) && !l.startsWith('??')).length;
  if (codeDirty) note('warn', 'git', `${codeDirty} tracked CODE files modified on this node — uncommitted logic is a fleet-divergence risk`);

  // ── 9. disk / journal size ────────────────────────────────────────────────
  const avail = parseInt((sh("df -BM --output=avail / | tail -1").match(/\d+/) || [])[0] || '99999', 10);
  if (avail < 2000) note('error', 'disk', `only ${avail}MB free on /`);
  const jsize = sh('du -sm /var/log/journal 2>/dev/null | cut -f1');
  if (parseInt(jsize || '0', 10) > 100) note('warn', 'journal', `journal is ${jsize}MB (cap should hold it near 64MB)`);
}

// ── report ──────────────────────────────────────────────────────────────────
const errors = findings.filter((f) => f.level === 'error');
if (JSON_OUT) {
  console.log(JSON.stringify({ host: os.hostname(), at: new Date().toISOString(), findings }, null, 2));
} else {
  console.log(`── log review · ${os.hostname()} · ${new Date().toISOString()} ${QUICK ? '(quick)' : ''}`);
  if (!findings.length) console.log('   quiet — nothing new worth a look');
  for (const f of findings) console.log(`   [${f.level.toUpperCase()}] ${f.area}: ${f.message}`);
  if (findings.length) console.log('\n   Triage: run /log-review in Claude Code — it updates docs/troubleshooting/KNOWN-BUGS.md.');
}
process.exit(errors.length ? 1 : 0);
