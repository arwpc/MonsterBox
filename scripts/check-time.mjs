#!/usr/bin/env node
/**
 * Fleet clock matrix — every animatronic and every Goblin: timezone, NTP on, synchronized, and the offset of its
 * clock from this node's, read over ssh in one short session per node. Schedules, quiet hours and the half-hour
 * fleet events are written in local time and compared across nodes, so a node on UTC, with NTP off, or drifted
 * by seconds fires shows at the wrong moment (mission decision D8, 2026-10-09).
 *
 *   npm run check:time                 # key-based ssh only (animatronics trust this node's key)
 *   # with the fleet password (Goblins, and any animatronic without key trust), run as the service user:
 *   sudo sh -c '. /etc/monsterbox/env; exec sudo -u remote env MONSTERBOX_SSH_PASSWORD="$MONSTERBOX_SSH_PASSWORD" node scripts/check-time.mjs'
 *   node scripts/check-time.mjs --json # machine-readable
 *
 * Exit code 1 when any reachable node is on the wrong zone, has NTP off, is unsynchronized, or is more than
 * MAX_OFFSET_MS (default 2000) away from this node. Unreachable nodes are reported, not counted as failures.
 */
import { readFileSync } from 'node:fs';
import { spawn } from 'node:child_process';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const WANT_ZONE = process.env.MB_TIMEZONE || 'America/Chicago';
const MAX_OFFSET_MS = parseInt(process.env.MAX_OFFSET_MS || '2000', 10);
const SSH_USER = process.env.MB_SSH_USER || 'remote';
const PASSWORD = process.env.MONSTERBOX_SSH_PASSWORD || '';
const JSON_OUT = process.argv.includes('--json');

const REMOTE_CMD = "timedatectl show -p Timezone -p NTP -p NTPSynchronized --value 2>/dev/null; date +%s%N";

function readJson(rel) { try { return JSON.parse(readFileSync(path.join(ROOT, rel), 'utf8')); } catch { return null; } }

function targets() {
  const out = [];
  const anim = readJson('config/animatronics.json');
  const list = Array.isArray(anim) ? anim : (anim?.animatronics || []);
  for (const a of list) out.push({ kind: 'animatronic', name: a.name, ip: a.host || a.ip });
  const gob = readJson('data/goblins.json');
  const glist = Array.isArray(gob) ? gob : Object.values(gob?.goblins || gob || {});
  for (const g of glist) {
    const ip = g.ipAddress || g.ip || (g.endpoint ? new URL(g.endpoint).hostname : null);
    if (ip) out.push({ kind: 'goblin', name: g.name, ip });
  }
  return out.filter((t) => t.ip);
}

/** One ssh session per node; key first, then the fleet password through sshpass -e (never on argv). */
function probe(t) {
  return new Promise((resolve) => {
    const sshArgs = ['-o', 'BatchMode=' + (PASSWORD ? 'no' : 'yes'), '-o', 'ConnectTimeout=6', '-o', 'StrictHostKeyChecking=accept-new',
      '-o', 'PreferredAuthentications=' + (PASSWORD ? 'publickey,password' : 'publickey'), `${SSH_USER}@${t.ip}`, REMOTE_CMD];
    const useSshpass = Boolean(PASSWORD); // the fleet password is one password; sshpass -e keeps it off argv
    const cmd = useSshpass ? 'sshpass' : 'ssh';
    const args = useSshpass ? ['-e', 'ssh', ...sshArgs] : sshArgs;
    const sentAt = Date.now();
    const child = spawn(cmd, args, { env: { ...process.env, SSHPASS: PASSWORD }, stdio: ['ignore', 'pipe', 'pipe'] });
    let out = '', err = '';
    child.stdout.on('data', (d) => (out += d));
    child.stderr.on('data', (d) => (err += d));
    child.on('error', (e) => resolve({ ...t, reachable: false, error: e.message }));
    child.on('close', (code) => {
      const receivedAt = Date.now();
      if (code !== 0 || !out.trim()) return resolve({ ...t, reachable: false, error: (err.trim().split('\n').pop() || `ssh exit ${code}`).slice(0, 80) });
      const lines = out.trim().split('\n');
      const ns = Number(lines[lines.length - 1]);
      const [zone, ntp, synced] = lines.slice(0, 3);
      // The remote `date` runs at the very end of the session (after a slow auth), so its stamp is
      // compared with the moment its output arrived here, not with the round-trip midpoint.
      const offsetMs = Math.round(ns / 1e6 - receivedAt);
      const problems = [];
      if (zone !== WANT_ZONE) problems.push(`zone ${zone || '?'} (want ${WANT_ZONE})`);
      if (ntp !== 'yes') problems.push('NTP off');
      if (synced !== 'yes') problems.push('not synchronized');
      if (Math.abs(offsetMs) > MAX_OFFSET_MS) problems.push(`offset ${offsetMs} ms`);
      resolve({ ...t, reachable: true, zone, ntp: ntp === 'yes', synced: synced === 'yes', offsetMs, rttMs: receivedAt - sentAt, problems });
    });
  });
}

const results = await Promise.all(targets().map(probe));
if (JSON_OUT) {
  console.log(JSON.stringify({ wantZone: WANT_ZONE, maxOffsetMs: MAX_OFFSET_MS, checkedAt: new Date().toISOString(), results }, null, 2));
} else {
  console.log(`Fleet clock check — want ${WANT_ZONE}, NTP on, synchronized, |offset| ≤ ${MAX_OFFSET_MS} ms (local ${new Date().toLocaleString('sv-SE')})`);
  console.log('node             ip               zone              ntp  synced  offset   rtt   status');
  for (const r of results) {
    const name = r.name.padEnd(16), ip = r.ip.padEnd(16);
    if (!r.reachable) { console.log(`${name} ${ip} ${'-'.padEnd(17)} -    -       -        -     UNREACHABLE (${r.error})`); continue; }
    console.log(`${name} ${ip} ${String(r.zone).padEnd(17)} ${r.ntp ? 'yes' : 'NO '}  ${r.synced ? 'yes   ' : 'NO    '} ${String(r.offsetMs + ' ms').padStart(8)} ${String(r.rttMs + ' ms').padStart(7)}  ${r.problems.length ? 'FAIL: ' + r.problems.join(', ') : 'OK'}`);
  }
}
const bad = results.filter((r) => r.reachable && r.problems.length);
const down = results.filter((r) => !r.reachable);
if (!JSON_OUT) console.log(`${results.length - down.length} reachable, ${bad.length} failing, ${down.length} unreachable`);
process.exitCode = bad.length ? 1 : 0;
