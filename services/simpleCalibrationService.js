/**
 * Simple Calibration Service (Unified for servo, motor, linear_actuator)
 * Stores per-part safeMin/safeMax and named points.
 */

import fs from 'fs/promises';
import path from 'path';
import { fileURLToPath } from 'url';
import { readConfig } from './configService.js';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

async function getFilePath() {
  const cfg = await readConfig();
  const appRoot = path.resolve(__dirname, '..');
  const dataDir = cfg && cfg.dataPath ? cfg.dataPath : 'data';
  return path.resolve(appRoot, dataDir, 'simple_calibrations.json');
}

async function loadAll() {
  try {
    const fp = await getFilePath();
    const raw = await fs.readFile(fp, 'utf8');
    return JSON.parse(raw || '{}');
  } catch (e) {
    if (e.code === 'ENOENT') return {};
    throw e;
  }
}

async function saveAll(obj) {
  const fp = await getFilePath();
  await fs.mkdir(path.dirname(fp), { recursive: true });
  await fs.writeFile(fp, JSON.stringify(obj, null, 2), 'utf8');
}

export async function getForPart(partId) {
  const all = await loadAll();
  return all[String(partId)] || { safeMin: null, safeMax: null, points: [] };
}

export async function setSafe(partId, which, value) {
  const w = String(which);
  if (w !== 'min' && w !== 'max') throw new Error('which must be "min" or "max"');
  const v = Number(value);
  if (isNaN(v)) throw new Error('value must be a number');
  const all = await loadAll();
  const key = String(partId);
  const cur = all[key] || { safeMin: null, safeMax: null, points: [] };
  if (w === 'min') cur.safeMin = v; else cur.safeMax = v;
  all[key] = cur;
  await saveAll(all);
  return cur;
}

export async function upsertPoint(partId, name, value, description = '') {
  if (!name || !String(name).trim()) throw new Error('name required');
  const v = Number(value);
  if (isNaN(v)) throw new Error('value must be a number');
  const all = await loadAll();
  const key = String(partId);
  const cur = all[key] || { safeMin: null, safeMax: null, points: [] };
  const pts = Array.isArray(cur.points) ? cur.points : [];
  const idx = pts.findIndex(p => p.name === name);
  const entry = { name, value: v, description: description || '' };
  if (idx === -1) pts.push(entry); else pts[idx] = entry;
  cur.points = pts;
  all[key] = cur;
  await saveAll(all);
  return cur;
}

export async function deletePoint(partId, name) {
  const all = await loadAll();
  const key = String(partId);
  const cur = all[key] || { safeMin: null, safeMax: null, points: [] };
  cur.points = (cur.points || []).filter(p => p.name !== name);
  all[key] = cur;
  await saveAll(all);
  return cur;
}

export async function renamePoint(partId, oldName, newName) {
  if (!newName || !String(newName).trim()) throw new Error('newName required');
  const all = await loadAll();
  const key = String(partId);
  const cur = all[key] || { safeMin: null, safeMax: null, points: [] };
  const idx = (cur.points || []).findIndex(p => p.name === oldName);
  if (idx === -1) return cur;
  cur.points[idx].name = String(newName).trim();
  all[key] = cur;
  await saveAll(all);
  return cur;
}

export async function reset(partId) {
  const all = await loadAll();
  delete all[String(partId)];
  await saveAll(all);
  return true;
}

export default { getForPart, setSafe, upsertPoint, deletePoint, renamePoint, reset };

