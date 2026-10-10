#!/usr/bin/env node
/**
 * Install (or refresh) the fleet-event conductor scenes into one character's scenes.json through the validated,
 * backed-up `POST /scenes/api/replace` endpoint of the running MonsterBox on this node.
 *
 *   node scripts/fleet-events/install-conductors.mjs --character 3                 # install on the host character
 *   node scripts/fleet-events/install-conductors.mjs --character 3 --validate-only # check without writing
 *   node scripts/fleet-events/install-conductors.mjs --character 3 --base http://localhost:3100
 *
 * The character's existing scenes are kept; any scene whose id matches a conductor id is replaced. A locked
 * character answers 423 (unlock first: `node scripts/character-lock.mjs unlock <id>`). The conductor files live
 * in scripts/fleet-events/conductors/*.json and are the source of truth; edit them, re-run this.
 */
import { readFileSync, readdirSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import https from 'node:https';
import axiosMod from 'axios';

const HERE = dirname(fileURLToPath(import.meta.url));
const axios = axiosMod.create({ httpsAgent: new https.Agent({ rejectUnauthorized: false }) });
const args = process.argv.slice(2);
const opt = (name, fallback) => { const i = args.indexOf(name); return i !== -1 && args[i + 1] ? args[i + 1] : fallback; };
const BASE = opt('--base', 'https://localhost:3000');
const CHAR = opt('--character', null);
const VALIDATE_ONLY = args.includes('--validate-only');
if (!CHAR) { console.error('Usage: install-conductors.mjs --character <id> [--base url] [--validate-only]'); process.exit(2); }

const conductors = readdirSync(join(HERE, 'conductors')).filter((f) => f.endsWith('.json')).sort()
  .map((f) => JSON.parse(readFileSync(join(HERE, 'conductors', f), 'utf8')));
const ids = new Set(conductors.map((c) => c.id));

const current = await axios.get(`${BASE}/scenes/api/?characterId=${CHAR}`, { timeout: 15000 });
const kept = (current.data?.scenes || []).filter((s) => !ids.has(s.id));
const scenes = [...kept, ...conductors].sort((a, b) => a.id - b.id);
console.log(`character ${CHAR}: ${kept.length} existing scene(s) kept, ${conductors.length} conductor(s) ${VALIDATE_ONLY ? 'validated' : 'installed'}: ${[...ids].join(', ')}`);

try {
  const r = await axios.post(`${BASE}/scenes/api/replace?characterId=${CHAR}${VALIDATE_ONLY ? '&validateOnly=1' : ''}`, { scenes }, { timeout: 30000 });
  console.log(JSON.stringify(r.data, null, 2).slice(0, 2000));
} catch (err) {
  const d = err.response?.data;
  console.error(`replace failed (${err.response?.status || err.code}):`);
  console.error(JSON.stringify(d ?? err.message, null, 2).slice(0, 4000));
  process.exit(1);
}
