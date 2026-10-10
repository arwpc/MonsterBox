#!/usr/bin/env node
/**
 * Validate scenes and poses against the character's real parts, poses, the audio
 * library, the Goblin registry and clip manifests, this node's calibration
 * windows and the hazard rules in config/scene-hazards.json.
 *
 *   node scripts/validate-scenes.mjs <charId|all> [--json] [--no-calibration] [--quiet] [--baseline <file>]
 *
 * --baseline names a JSON list of known legacy errors ({file, scene, step, message}).
 * A matching error is reported as "baselined" and does not fail the run, so the
 * gate can carry the validator before the old scene sets are rebuilt; the list
 * may only shrink (an entry that no longer occurs is reported as stale).
 *
 * Exit 0 when there are no errors (warnings are printed but do not fail),
 * 1 when any error is found, 2 on bad usage. Messages are `file:scene:step`.
 * See services/scenes/sceneValidator.js for the rules.
 */
import fs from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { validateCharacter, loadValidationContext, formatIssue } from '../services/scenes/sceneValidator.js';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const ROOT = path.resolve(__dirname, '..');

const args = process.argv.slice(2);
const baselineIdx = args.indexOf('--baseline');
const baselinePath = baselineIdx >= 0 ? args[baselineIdx + 1] : null;
const positional = args.filter((a, i) => !a.startsWith('--') && !(baselineIdx >= 0 && i === baselineIdx + 1));
const flags = new Set(args.filter(a => a.startsWith('--')));
const target = positional[0] || 'all';

if (flags.has('--help') || !/^(all|\d+)$/.test(target)) {
  console.log('usage: node scripts/validate-scenes.mjs <charId|all> [--json] [--no-calibration] [--quiet]');
  process.exit(flags.has('--help') ? 0 : 2);
}

async function characterIds() {
  if (target !== 'all') return [parseInt(target, 10)];
  try {
    const reg = JSON.parse(await fs.readFile(path.join(ROOT, 'data', 'characters.json'), 'utf8'));
    return (Array.isArray(reg) ? reg : []).map(c => c.id).filter(id => Number.isInteger(id));
  } catch (e) {
    console.error(`cannot read data/characters.json: ${e.message}`);
    process.exit(2);
  }
}

const issueKey = (i) => [i.file, i.scene, i.step, i.pose, i.part, i.message].map(v => (v == null ? '' : String(v))).join('|');
let baseline = [];
if (baselinePath) {
  try { baseline = JSON.parse(await fs.readFile(path.resolve(ROOT, baselinePath), 'utf8')).entries || []; }
  catch (e) { console.error(`cannot read baseline ${baselinePath}: ${e.message}`); process.exit(2); }
}
const baselineKeys = new Set(baseline.map(issueKey));
const seenBaseline = new Set();

const ctx = await loadValidationContext({ root: ROOT, calibration: !flags.has('--no-calibration') });
const report = [];
let errorCount = 0;
let warningCount = 0;
for (const id of await characterIds()) {
  const r = await validateCharacter(id, { root: ROOT, ctx });
  const errors = [];
  const baselined = [];
  for (const e of r.errors) {
    const k = issueKey(e);
    if (baselineKeys.has(k)) { baselined.push(e); seenBaseline.add(k); } else errors.push(e);
  }
  errorCount += errors.length;
  warningCount += r.warnings.length;
  report.push({ characterId: id, errors, baselined, warnings: r.warnings });
}

if (flags.has('--json')) {
  console.log(JSON.stringify({ errors: errorCount, warnings: warningCount, characters: report }, null, 2));
} else {
  for (const c of report) {
    for (const e of c.errors) console.log(`ERROR   ${formatIssue(e)}`);
    for (const b of c.baselined) console.log(`legacy  ${formatIssue(b)} (baselined)`);
    if (!flags.has('--quiet')) for (const w of c.warnings) console.log(`warning ${formatIssue(w)}`);
  }
  const stale = baseline.filter(b => !seenBaseline.has(issueKey(b)));
  for (const b of stale) console.log(`stale   baseline entry no longer occurs — remove it: ${formatIssue(b)}`);
  console.log(`validate-scenes: ${report.length} character(s), ${errorCount} error(s), ${warningCount} warning(s)`);
}
process.exit(errorCount > 0 ? 1 : 0);
