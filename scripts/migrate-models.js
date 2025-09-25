#!/usr/bin/env node
/**
 * MonsterBox - Migrate per-character and legacy model files into global shared models directory
 *
 * - Reads legacy files from:
 *   - data/<type>_models.json (root-level legacy)
 *   - data/character-<id>/<type>_models.json (per-character legacy)
 * - Writes merged results to:
 *   - data/models/<type>_models.json (global, shared across characters)
 *
 * Notes:
 * - Non-destructive: legacy files are left in place.
 * - De-duplicates by (name + JSON.stringify(defaults)).
 * - Ensures unique string IDs. If duplicates exist, generates new ids.
 */

import fs from 'fs/promises';
import path from 'path';

const TYPE_TO_FILE = {
  servo: 'servo_models.json',
  linear_actuator: 'linear_actuator_models.json',
  motor: 'motor_models.json',
  led: 'led_models.json',
  light: 'light_models.json',
  sensor: 'sensor_models.json',
  motion_sensor: 'motion_sensor_models.json',
  microphone: 'microphone_models.json',
  speaker: 'speaker_models.json',
  webcam: 'webcam_models.json',
  head_tracking: 'head_tracking_models.json'
};

function dataDir() {
  return path.resolve(process.cwd(), 'data');
}

function globalModelsDir() {
  return path.resolve(dataDir(), 'models');
}

async function ensureDir(dir) {
  await fs.mkdir(dir, { recursive: true });
}

async function readJsonArraySafe(fp) {
  try {
    const raw = await fs.readFile(fp, 'utf8');
    const arr = JSON.parse(raw);
    return Array.isArray(arr) ? arr : [];
  } catch (_) {
    return [];
  }
}

function normalizeModel(m) {
  if (!m || typeof m !== 'object') return null;
  const out = { ...m };
  out.id = String(out.id ?? Date.now() + Math.random());
  out.name = String(out.name ?? 'Model');
  out.defaults = (out.defaults && typeof out.defaults === 'object') ? out.defaults : {};
  return out;
}

function sigFor(m) {
  return `${(m.name || '').trim()}::${JSON.stringify(m.defaults || {})}`;
}

async function migrateType(type) {
  const fname = TYPE_TO_FILE[type];
  const gDir = globalModelsDir();
  const outPath = path.resolve(gDir, fname);
  await ensureDir(gDir);

  // Start with existing global
  const existing = await readJsonArraySafe(outPath);
  const bySig = new Map(existing.map(m => {
    const n = normalizeModel(m); return [sigFor(n), n];
  }));
  const usedIds = new Set(existing.map(m => String(m.id)));

  const sources = [];
  // Root legacy
  sources.push(path.resolve(dataDir(), fname));
  // Per-character legacy (character-1, character-2, ...)
  try {
    const entries = await fs.readdir(dataDir(), { withFileTypes: true });
    for (const d of entries) {
      if (d.isDirectory() && /^character-/.test(d.name)) {
        sources.push(path.resolve(dataDir(), d.name, fname));
      }
    }
  } catch (_) { }

  let added = 0;
  for (const src of sources) {
    const arr = await readJsonArraySafe(src);
    for (const raw of arr) {
      const m = normalizeModel(raw);
      if (!m) continue;
      const sig = sigFor(m);
      if (bySig.has(sig)) continue; // skip duplicate by content
      // Ensure unique id
      let id = String(m.id || '');
      if (!id || usedIds.has(id)) {
        id = `${Date.now()}${Math.floor(Math.random() * 100000)}`;
      }
      usedIds.add(id);
      bySig.set(sig, { ...m, id });
      added++;
    }
  }

  const merged = Array.from(bySig.values());
  await fs.writeFile(outPath, JSON.stringify(merged, null, 2), 'utf8');
  return { outPath, added, total: merged.length };
}

async function main() {
  const types = Object.keys(TYPE_TO_FILE);
  await ensureDir(globalModelsDir());
  const results = [];
  for (const t of types) {
    const r = await migrateType(t);
    results.push({ type: t, ...r });
  }
  // eslint-disable-next-line no-console
  console.log('Model migration complete');
  for (const r of results) {
    // eslint-disable-next-line no-console
    console.log(` - ${r.type}: +${r.added} merged (now ${r.total}) -> ${path.relative(process.cwd(), r.outPath)}`);
  }
}

main().catch(err => {
  console.error('Migration failed:', err);
  process.exit(1);
});

