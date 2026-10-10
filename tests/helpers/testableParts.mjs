/**
 * Which parts an AUTOMATED test may command on this node.
 *
 * A part listed in config/physical-faults.json (status "broken") is never
 * selected: the servo daemon vetoes its channel anyway, but a test that picks it
 * is still a test commanding a broken part (2026-10-10: tests/system/parts-api
 * took servos[0] — a broken, fused-rail elbow — for its "no angle" case and the
 * daemon logged REFUSED ch4 twice). Parts named in config/scene-hazards.json
 * (exclusiveParts, partAngleRanges) are excluded too: automated suites drive
 * those only on operator direction.
 */
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const REPO_ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..', '..');

function readJson(rel) {
  try { return JSON.parse(fs.readFileSync(path.join(REPO_ROOT, rel), 'utf8')); } catch { return {}; }
}

/** Part ids (strings) an automated test must never command for this character. */
export function untouchablePartIds(characterId) {
  const ids = new Set();
  if (characterId == null) return ids;
  const faults = ((readJson('config/physical-faults.json').characters || {})[String(characterId)] || {}).parts || {};
  for (const [id, f] of Object.entries(faults)) if (f && f.status === 'broken') ids.add(String(id));
  const hz = (readJson('config/scene-hazards.json').characters || {})[String(characterId)] || {};
  for (const group of hz.exclusiveParts || []) for (const id of group) ids.add(String(id));
  for (const id of Object.keys(hz.partAngleRanges || {})) ids.add(String(id));
  return ids;
}

/** Filter a part list down to what an automated test may command. */
export function testableParts(characterId, parts) {
  const bad = untouchablePartIds(characterId);
  return (parts || []).filter(p => p && !bad.has(String(p.id)) && p.enabled !== false);
}
