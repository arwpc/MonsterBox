#!/usr/bin/env node
/*
  MonsterBox - Clean Test Artifacts Script
  - Removes test-created characters from data/characters.json matching known patterns
  - Deletes corresponding data/character-<id> directories for removed characters
  - Cleans test-created entries inside kept characters (parts.json, poses.json, scenes.json) by name patterns
  - Cleans global models under data/models/* by name patterns
  - Clears Playwright artifacts (test-results, playwright-report)

  Safety:
  - Only deletes by conservative name patterns used in tests: /^TestChar/, /_Updated$/, 'Groundbreaker', names containing 'Playwright', names starting with 'Test', or 'PW '.
  - Keeps canonical characters: PumpkinHead, Coffin Breaker, Orlok, Skulltalker (ids typically 1..4)
*/

import fs from 'fs/promises';
import path from 'path';
import { fileURLToPath } from 'url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const repoRoot = path.resolve(__dirname, '..');

const dataDir = path.resolve(repoRoot, 'data');
const charactersFile = path.resolve(dataDir, 'characters.json');

const canonicalNames = new Set(['PumpkinHead', 'Coffin Breaker', 'Orlok', 'Skulltalker']);
const characterDeleteNamePatterns = [
  /^TestChar/i,
  /_Updated$/i,
  /^Groundbreaker$/i,
];
const testNamePatterns = [
  /^Test/i,
  /Playwright/i,
  /^PW\b/i,
];

function isTestCharacterName(name) {
  if (!name) return false;
  for (const re of characterDeleteNamePatterns) {
    if (re.test(String(name))) return true;
  }
  return false;
}

function isTestItemName(name) {
  if (!name) return false;
  for (const re of testNamePatterns) {
    if (re.test(String(name))) return true;
  }
  return false;
}

async function readJSON(file, fallback) {
  try {
    const data = await fs.readFile(file, 'utf8');
    return JSON.parse(data);
  } catch (_) {
    return fallback;
  }
}

async function writeJSON(file, obj) {
  await fs.mkdir(path.dirname(file), { recursive: true });
  await fs.writeFile(file, JSON.stringify(obj, null, 2), 'utf8');
}

async function rmrf(targetPath) {
  try {
    await fs.rm(targetPath, { recursive: true, force: true });
  } catch (_) { /* ignore */ }
}

async function fileExists(p) {
  try { await fs.stat(p); return true; } catch { return false; }
}

async function cleanCharacters() {
  const chars = await readJSON(charactersFile, []);
  const keep = [];
  const removed = [];
  for (const c of (Array.isArray(chars) ? chars : [])) {
    const name = c && c.name;
    if (canonicalNames.has(String(name))) {
      keep.push(c);
      continue;
    }
    if (isTestCharacterName(name)) {
      removed.push(c);
      continue;
    }
    // Be conservative: keep any other names (assumed user-created)
    keep.push(c);
  }

  // Rewrite characters.json
  await writeJSON(charactersFile, keep);

  // Delete data directories for removed characters
  for (const c of removed) {
    const dir = path.resolve(dataDir, `character-${c.id}`);
    await rmrf(dir);
  }

  return { kept: keep.map(c => ({ id: c.id, name: c.name })), removed: removed.map(c => ({ id: c.id, name: c.name })) };
}

async function cleanPerCharacterFiles(characterId) {
  const cdir = path.resolve(dataDir, `character-${characterId}`);
  const candidateFiles = ['parts.json', 'poses.json', 'scenes.json'];
  const results = [];
  for (const file of candidateFiles) {
    const fpath = path.join(cdir, file);
    if (!(await fileExists(fpath))) continue;
    const json = await readJSON(fpath, null);
    if (!json) continue;
    let arr;
    // files are typically arrays
    if (Array.isArray(json)) arr = json;
    else if (Array.isArray(json.items)) arr = json.items;
    else continue;

    const before = arr.length;
    const filtered = arr.filter(item => !isTestItemName(item && item.name));
    if (filtered.length !== before) {
      if (Array.isArray(json)) {
        await writeJSON(fpath, filtered);
      } else {
        json.items = filtered;
        await writeJSON(fpath, json);
      }
      results.push({ file: fpath, removed: before - filtered.length });
    }
  }
  return results;
}

async function cleanGlobalModels() {
  const modelsDir = path.resolve(dataDir, 'models');
  const files = [
    'servo_models.json', 'linear_actuator_models.json', 'motor_models.json',
    'speaker_models.json', 'microphone_models.json', 'webcam_models.json',
    'light_models.json', 'led_models.json', 'motion_sensor_models.json', 'head_tracking_models.json'
  ];
  const changes = [];
  for (const name of files) {
    const f = path.join(modelsDir, name);
    if (!(await fileExists(f))) continue;
    const json = await readJSON(f, []);
    if (!Array.isArray(json)) continue;
    const before = json.length;
    const filtered = json.filter(m => !isTestItemName(m && m.name));
    if (filtered.length !== before) {
      await writeJSON(f, filtered);
      changes.push({ file: f, removed: before - filtered.length });
    }
  }
  return changes;
}

async function clearPlaywrightArtifacts() {
  await rmrf(path.resolve(repoRoot, 'test-results'));
  await rmrf(path.resolve(repoRoot, 'playwright-report'));
}

async function main() {
  console.log('🧹 Cleaning test artifacts...');
  const { kept, removed } = await cleanCharacters();
  console.log(`Characters kept: ${kept.length}, removed: ${removed.length}`);
  if (removed.length) {
    console.log('Removed characters:', removed);
  }

  // Clean per-character test items for kept characters
  const perCharChanges = [];
  for (const c of kept) {
    const changes = await cleanPerCharacterFiles(c.id);
    if (changes.length) perCharChanges.push({ characterId: c.id, changes });
  }
  if (perCharChanges.length) console.log('Per-character file changes:', perCharChanges);

  // Clean global models
  const modelChanges = await cleanGlobalModels();
  if (modelChanges.length) console.log('Global models cleaned:', modelChanges);

  // Clear artifacts
  await clearPlaywrightArtifacts();
  console.log('Cleared test-results and playwright-report');

  console.log('✅ Done.');
}

main().catch(err => {
  console.error('Cleanup failed:', err);
  process.exit(1);
});

