#!/usr/bin/env node
/**
 * Yard Theater — scripted cross-animatronic moments over the existing
 * orchestration endpoints. No application code involved: this is a client.
 *
 * A "moment" is a JSON file of steps executed in order:
 *   { "say":  { "node": <id>|"all", "text": "..." } }
 *   { "audio":{ "node": <id>|"all", "filename": "x.mp3", "volume": 0-100, "loop": bool } }
 *   { "stopAudio": { "node": <id>|"all" } }
 *   { "wait": <ms> }
 * Unreachable nodes are skipped with a warning — the show goes on.
 *
 * Usage:
 *   node scripts/yard-theater/perform.mjs moments/thomas.json
 *   node scripts/yard-theater/perform.mjs moments/dusk-ceremony.json --base https://<node-host>:3000
 */
import { readFileSync } from 'node:fs';
import { dirname, join, isAbsolute } from 'node:path';
import { fileURLToPath } from 'node:url';
import https from 'node:https';
import axiosMod from 'axios';

const HERE = dirname(fileURLToPath(import.meta.url));
const axios = axiosMod.create({ httpsAgent: new https.Agent({ rejectUnauthorized: false }) });

const args = process.argv.slice(2);
const momentFile = args.find(a => !a.startsWith('--'));
if (!momentFile) { console.error('Usage: perform.mjs <moment.json> [--base https://host:port]'); process.exit(1); }
const baseIdx = args.indexOf('--base');
const BASE = baseIdx !== -1 ? args[baseIdx + 1] : 'https://localhost:3000';
const API = `${BASE}/api/orchestration`;

const path = isAbsolute(momentFile) ? momentFile : join(HERE, momentFile);
const moment = JSON.parse(readFileSync(path, 'utf8'));

async function post(url, body) {
  try {
    const r = await axios.post(url, body ?? {}, { timeout: 20000 });
    return r.data?.success !== false;
  } catch (err) {
    console.warn(`  ! skipped (${err.response?.status || err.code}): ${url}`);
    return false;
  }
}

async function runStep(step) {
  if (step.wait) { await new Promise(r => setTimeout(r, step.wait)); return; }
  if (step.say) {
    const { node, text } = step.say;
    console.log(`  say [${node}]: ${text.slice(0, 70)}...`);
    if (node === 'all') return post(`${API}/say-all`, { text });
    return post(`${API}/animatronic/${node}/say`, { text });
  }
  if (step.audio) {
    const { node, filename, volume = 80, loop = false } = step.audio;
    console.log(`  audio [${node}]: ${filename} vol=${volume} loop=${loop}`);
    const body = { filename, volume, loop };
    if (node === 'all') {
      const ids = moment.nodes || [1, 2, 3, 4, 5];
      await Promise.all(ids.map(id => post(`${API}/animatronic/${id}/play-audio`, body)));
      return;
    }
    return post(`${API}/animatronic/${node}/play-audio`, body);
  }
  if (step.stopAudio) {
    const { node } = step.stopAudio;
    if (node === 'all') {
      const ids = moment.nodes || [1, 2, 3, 4, 5];
      await Promise.all(ids.map(id => post(`${API}/animatronic/${id}/stop-audio`)));
      return;
    }
    return post(`${API}/animatronic/${node}/stop-audio`);
  }
  console.warn('  ? unknown step', JSON.stringify(step).slice(0, 80));
}

console.log(`Performing: ${moment.name} (${moment.steps.length} steps)`);
for (const step of moment.steps) await runStep(step);
console.log('Done.');
