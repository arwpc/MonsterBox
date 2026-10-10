#!/usr/bin/env node
/**
 * Warm the scene TTS cache (data/tts-cache/<char>/) for every scripted line, so
 * a show never depends on live ElevenLabs quota or latency.
 *
 *   node scripts/prerender-scene-tts.mjs <charId|all> [--dry-run]
 *   node scripts/prerender-scene-tts.mjs --character <id> --text "a line" [--dry-run]
 *
 * Lines collected per character: its own `sayThis` steps, plus every
 * `fleet-say` line (in any character's scenes) aimed at it — `node: 'all'`
 * counts for every character in config/animatronics.json. Each line is keyed
 * exactly as the executor keys it (text + voice + model + stability +
 * similarity), using that character's TTS config in THIS repo, so the cache
 * matches a node whose ai-config came from the same deploy. Steps with
 * `nocache: true` or their own `voiceId` are rendered with that voice.
 *
 * Renders nothing audible; it only calls the TTS API and writes files.
 */
import fs from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { generateSpeechCached, ttsCacheKey, getCachedSpeech } from '../services/scenes/ttsCache.js';
import { resolveFleetNodes } from '../services/scenes/fleetNodes.js';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const ROOT = path.resolve(__dirname, '..');

const args = process.argv.slice(2);
const opt = (name) => { const i = args.indexOf(name); return i >= 0 ? args[i + 1] : null; };
const dryRun = args.includes('--dry-run');
const adHocText = opt('--text');
const adHocChar = opt('--character');
const target = args.find((a, i) => !a.startsWith('--') && !['--text', '--character'].includes(args[i - 1])) || 'all';

async function readJson(file) {
  try { return JSON.parse(await fs.readFile(file, 'utf8')); } catch (_) { return null; }
}

async function collectLines() {
  const lines = new Map(); // charId -> Map(key -> {text, voiceId})
  const push = (cid, text, voiceId) => {
    const t = String(text || '').trim();
    if (!t) return;
    if (!lines.has(String(cid))) lines.set(String(cid), []);
    lines.get(String(cid)).push({ text: t, voiceId: voiceId || null });
  };
  if (adHocText) {
    if (!/^\d+$/.test(String(adHocChar || ''))) { console.error('--text needs --character <id>'); process.exit(2); }
    push(adHocChar, adHocText, null);
    return lines;
  }
  const registry = ((await readJson(path.join(ROOT, 'config', 'animatronics.json'))) || {}).animatronics || [];
  const characters = ((await readJson(path.join(ROOT, 'data', 'characters.json'))) || []).map(c => c.id);
  for (const cid of characters) {
    const scenes = await readJson(path.join(ROOT, 'data', `character-${cid}`, 'scenes.json'));
    for (const scene of Array.isArray(scenes) ? scenes : []) {
      for (const step of Array.isArray(scene.steps) ? scene.steps : []) {
        if (!step) continue;
        if (step.type === 'sayThis' && step.nocache !== true) push(cid, step.text || step.say, step.voiceId);
        if (step.type === 'fleet-say') {
          const r = resolveFleetNodes(step.node, registry, { allowAll: true });
          for (const n of r.nodes || []) push(n.characterId != null ? n.characterId : n.id, step.text || step.say, null);
        }
      }
    }
  }
  if (target !== 'all') {
    for (const k of [...lines.keys()]) if (k !== String(target)) lines.delete(k);
  }
  return lines;
}

const lines = await collectLines();
const { getTTSConfigForCharacter } = await import('../services/aiConfigStore.js');
const tts = dryRun ? null : (await import('../services/elevenLabsTTSService.js')).default;

let rendered = 0, hits = 0, failed = 0, planned = 0;
for (const [cid, list] of lines) {
  let cfg;
  try { cfg = await getTTSConfigForCharacter(Number(cid)); }
  catch (e) { console.error(`character ${cid}: no TTS config (${e.message}) — skipped`); failed += list.length; continue; }
  const seen = new Set();
  for (const { text, voiceId } of list) {
    const voice = voiceId || cfg.voice_id;
    const key = ttsCacheKey({ text, voiceId: voice, model: cfg.model, stability: cfg.stability, similarity_boost: cfg.similarity_boost });
    if (seen.has(key)) continue;
    seen.add(key);
    planned++;
    const cached = await getCachedSpeech(Number(cid), key);
    if (cached) { hits++; console.log(`hit     char ${cid} ${key.slice(0, 12)} "${text.slice(0, 60)}"`); continue; }
    if (dryRun) { console.log(`missing char ${cid} ${key.slice(0, 12)} "${text.slice(0, 60)}"`); continue; }
    const t0 = Date.now();
    const r = await generateSpeechCached({ text, voiceId: voice, ttsCfg: cfg, characterId: Number(cid), generate: (t, v, c) => tts.generateSpeech(t, v, c) });
    if (r.success) { rendered++; console.log(`render  char ${cid} ${key.slice(0, 12)} ${Date.now() - t0} ms ${r.audioBuffer.length} B → ${r.stored || '(not stored)'}`); }
    else { failed++; console.error(`FAILED  char ${cid} "${text.slice(0, 60)}": ${r.error}`); }
  }
}
console.log(`prerender-scene-tts: ${planned} unique line(s): ${hits} already cached, ${rendered} rendered, ${failed} failed${dryRun ? ' (dry run)' : ''}`);
process.exit(failed > 0 ? 1 : 0);
