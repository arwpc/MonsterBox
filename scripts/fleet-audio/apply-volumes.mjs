#!/usr/bin/env node
/**
 * Apply the canonical per-node speaker volumes from speaker-volumes.json.
 *
 * WHY THIS EXISTS: sink volume is node-local runtime state. It is not in git, it is
 * not deployed, and it does not survive a reboot -- and it was observed resetting to
 * 0.65 on two nodes after a redeploy while a third held its value. speaker-volumes.json
 * documented the measured levels but was, in its own words, "a RECORD, not a mechanism".
 * This is the mechanism.
 *
 * It must use wpctl rather than the HTTP API: the tuned levels for the Unitek rigs are
 * ABOVE 1.00 (software gain above unity), and both PUT /api/system/volume and
 * PUT /api/orchestration/volume take an integer percent 0-100 and clamp there.
 *
 *   node scripts/fleet-audio/apply-volumes.mjs            # apply to every node
 *   node scripts/fleet-audio/apply-volumes.mjs --check     # report drift, change nothing
 *   node scripts/fleet-audio/apply-volumes.mjs --nodes 2,4 # only these node ids
 */
import { readFileSync } from 'fs';
import { execFileSync } from 'child_process';
import { fileURLToPath } from 'url';
import { dirname, join } from 'path';

const HERE = dirname(fileURLToPath(import.meta.url));
const MAP_FILE = join(HERE, '..', 'yard-theater', 'speaker-volumes.json');
const WPCTL = 'XDG_RUNTIME_DIR=/run/user/1000 wpctl';
const SINK = '@DEFAULT_AUDIO_SINK@';

const argv = process.argv.slice(2);
const CHECK_ONLY = argv.includes('--check');
const nodesArg = (() => {
  const i = argv.indexOf('--nodes');
  return i !== -1 && argv[i + 1] ? argv[i + 1].split(',').map(s => parseInt(s.trim(), 10)) : null;
})();

const parsed = JSON.parse(readFileSync(MAP_FILE, 'utf8'));
const entries = (parsed.nodes || parsed.volumes || (Array.isArray(parsed) ? parsed : []))
  .filter(n => typeof n.sinkVolume === 'number')
  .filter(n => !nodesArg || nodesArg.includes(n.id));

if (!entries.length) {
  console.error('No nodes with a sinkVolume found in speaker-volumes.json');
  process.exit(1);
}

// Local node is whichever entry matches this host's own MonsterBox character. Rather
// than guess, treat any node we cannot reach over ssh as remote-and-down and say so;
// running wpctl locally is only correct for the node we are actually on.
const localIps = (() => {
  try {
    return execFileSync('hostname', ['-I'], { encoding: 'utf8' }).trim().split(/\s+/);
  } catch { return []; }
})();

function run(node, cmd) {
  const isLocal = node.ip && localIps.includes(node.ip);
  if (isLocal) return execFileSync('bash', ['-lc', `${WPCTL} ${cmd}`], { encoding: 'utf8', timeout: 15000 });
  return execFileSync('ssh', [
    '-o', 'StrictHostKeyChecking=no', '-o', 'ConnectTimeout=8',
    `remote@${node.ip}`, `${WPCTL} ${cmd}`
  ], { encoding: 'utf8', timeout: 20000 });
}

const readVolume = node => {
  const out = run(node, `get-volume ${SINK}`);
  const m = out.match(/Volume:\s*([0-9.]+)/);
  return m ? parseFloat(m[1]) : null;
};

let drift = 0, failed = 0;
for (const node of entries) {
  const label = `${node.name || 'node ' + node.id} (${node.ip || 'no ip'})`.padEnd(34);
  if (!node.ip) { console.log(`${label} SKIP    no address (in storage / not yet on the network)`); continue; }
  try {
    const before = readVolume(node);
    const want = node.sinkVolume;
    if (before !== null && Math.abs(before - want) < 0.005) {
      console.log(`${label} ok      ${before}`);
      continue;
    }
    drift++;
    if (CHECK_ONLY) {
      console.log(`${label} DRIFT   ${before} -> should be ${want}`);
      continue;
    }
    run(node, `set-volume ${SINK} ${want}`);
    const after = readVolume(node);
    const good = after !== null && Math.abs(after - want) < 0.005;
    console.log(`${label} ${good ? 'SET    ' : 'FAILED '} ${before} -> ${after} (target ${want})`);
    if (!good) failed++;
  } catch (err) {
    failed++;
    console.log(`${label} UNREACHABLE  ${String(err.message).split('\n')[0]}`);
  }
}

console.log(`\n${CHECK_ONLY ? 'Checked' : 'Applied'} ${entries.length} node(s): ${drift} needed changing, ${failed} failed.`);
if (!CHECK_ONLY && drift > 0 && failed === 0) {
  console.log('Re-verify by ear:  node scripts/fleet-audio/earcheck.mjs --nodes ' + entries.map(n => n.id).join(','));
}
process.exit(failed > 0 ? 1 : 0);
