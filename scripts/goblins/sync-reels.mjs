#!/usr/bin/env node
/**
 * Keep the Goblins' coordinated set reels in step (operator 2026-10-23: the windows show one subject
 * together). scripts/goblins/set-plan.json names each Goblin's reel; every set is the same length on
 * every reel, so reels started at the same instant show the same set at the same time.
 *
 *   node scripts/goblins/sync-reels.mjs --assign   # once: put every Goblin on its set reel (looping)
 *   node scripts/goblins/sync-reels.mjs            # restart every set reel at the same instant
 *   options: --base https://<console>:3000 (default https://localhost:3000), --dry-run
 *
 * The sync stops every Goblin's queue at once, waits until each reports stopped (mpv exits on SIGTERM
 * at its own pace, so starting straight away would leave the windows seconds apart), then starts all
 * of them together. A Goblin whose queue is not its set reel (a show still casting, an operator's
 * choice) is left alone. Run by the fleet-event runner after every scheduled show, which is what puts
 * the reels back in step after the casts.
 */
import { readFileSync } from 'node:fs';
import { dirname, join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import https from 'node:https';
import axiosMod from 'axios';

const ROOT = resolve(dirname(fileURLToPath(import.meta.url)), '..', '..');
const args = process.argv.slice(2);
const flag = (n) => args.includes(n);
const opt = (n, d) => { const i = args.indexOf(n); return i !== -1 && args[i + 1] ? args[i + 1] : d; };
const BASE = opt('--base', 'https://localhost:3000');
const DRY = flag('--dry-run');
const axios = axiosMod.create({ httpsAgent: new https.Agent({ rejectUnauthorized: false }) });
const plan = JSON.parse(readFileSync(join(ROOT, 'scripts', 'goblins', 'set-plan.json'), 'utf8'));
const stamp = () => new Date().toLocaleString('sv-SE').slice(0, 19);
const log = (...m) => console.log(`[${stamp()}] goblin-sync:`, ...m);
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

async function goblins() {
  return Promise.all(Object.values(plan.reels).map(async (reel) => {
    const r = await axios.get(`${BASE}/video-library/api/goblins/resolve?name=${encodeURIComponent(reel.goblin)}`, { timeout: 10000 });
    return { name: reel.goblin, id: r.data.id, endpoint: r.data.endpoint, file: reel.file };
  }));
}

async function status(g) {
  try {
    const r = await axios.get(`${g.endpoint}/playback-status`, { timeout: 4000 });
    const d = r.data || {};
    const q = d.queue || {};
    const vids = (q.videos || []).map((v) => v.filename);
    return { ok: true, playing: !!d.playing, mpv: !!d.mpvRunning, current: d.currentVideo || '', queue: vids };
  } catch (err) {
    return { ok: false, error: err.code || err.message };
  }
}

async function assign(list) {
  for (const g of list) {
    if (DRY) { log(`${g.name}: would loop ${g.file}`); continue; }
    try {
      const r = await axios.post(`${BASE}/video-library/api/goblins/${encodeURIComponent(g.id)}/play`, { filename: g.file, mode: 'loop' }, { timeout: 90000 });
      log(`${g.name}: looping ${g.file} — ${r.data?.success ? 'proven' : `refused (${r.data?.error})`}`);
    } catch (err) {
      log(`${g.name}: loop ${g.file} failed (${err.response?.data?.error || err.code || err.message})`);
    }
  }
}

async function sync(list) {
  const before = await Promise.all(list.map(async (g) => ({ g, s: await status(g) })));
  const mine = before.filter(({ g, s }) => s.ok && s.queue.length === 1 && s.queue[0] === g.file).map(({ g }) => g);
  for (const { g, s } of before) {
    if (!mine.includes(g)) log(`${g.name}: left alone (${s.ok ? `queue is [${s.queue.join(', ')}], not ${g.file}` : `no answer: ${s.error}`})`);
  }
  if (mine.length < 2) { log(`nothing to line up (${mine.length} Goblin(s) on their set reel)`); return; }
  if (DRY) { log(`would restart together: ${mine.map((g) => g.name).join(', ')}`); return; }
  await Promise.all(mine.map((g) => axios.post(`${g.endpoint}/queue/stop`, {}, { timeout: 15000 }).catch((e) => log(`${g.name}: stop failed (${e.code || e.message})`))));
  const deadline = Date.now() + 12000;
  for (;;) {
    const st = await Promise.all(mine.map(status));
    if (st.every((s) => s.ok && !s.mpv && !s.playing) || Date.now() > deadline) break;
    await sleep(300);
  }
  const t0 = Date.now();
  await Promise.all(mine.map((g) => axios.post(`${g.endpoint}/queue/start`, { loopMode: 'queue' }, { timeout: 15000 }).catch((e) => log(`${g.name}: start failed (${e.code || e.message})`))));
  log(`restarted together in ${Date.now() - t0} ms: ${mine.map((g) => g.name).join(', ')}`);
  await sleep(4000);
  for (const g of mine) {
    const s = await status(g);
    log(`${g.name}: ${s.ok ? `playing=${s.playing} mpv=${s.mpv} ${s.current}` : `no answer (${s.error})`}`);
  }
}

const list = await goblins();
if (flag('--assign')) await assign(list);
await sync(list);
