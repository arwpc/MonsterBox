import path from 'path';
import fs from 'fs/promises';
import { fileURLToPath } from 'url';
import { readConfig } from '../configService.js';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

// Hard cap for any looping duration: 48 hours in seconds
const MAX_SECONDS = 48 * 60 * 60;

async function getDataDir(){
  const cfg = await readConfig();
  const appRoot = path.resolve(__dirname, '..', '..');
  return path.resolve(appRoot, cfg && cfg.dataPath ? cfg.dataPath : 'data');
}

async function getCharacterDir(characterId){
  const dataDir = await getDataDir();
  return path.resolve(dataDir, `character-${characterId}`);
}

async function ensureDir(p){
  try { await fs.mkdir(p, { recursive: true }); } catch(_){ /* noop */ }
}

async function getQueuesPath(characterId){
  const cdir = await getCharacterDir(characterId);
  await ensureDir(cdir);
  return path.resolve(cdir, 'scene-queues.json');
}

export function normalizeLifecycle(lc){
  const obj = lc || {};
  const mode = String(obj.mode || 'run_once');
  if (!['run_once', 'run_for_duration', 'loop_until_disabled'].includes(mode)) {
    throw new Error('Invalid lifecycle mode');
  }
  if (mode === 'run_for_duration') {
    const d = Number(obj.duration);
    if (!Number.isFinite(d) || d <= 0) throw new Error('duration must be > 0 seconds');
    if (d > MAX_SECONDS) throw new Error('duration exceeds 48h cap');
    return { mode, duration: Math.floor(d) };
  }
  if (mode === 'loop_until_disabled') {
    const md = Number(obj.max_duration);
    if (!Number.isFinite(md) || md <= 0) throw new Error('max_duration must be > 0 seconds');
    if (md > MAX_SECONDS) throw new Error('max_duration exceeds 48h cap');
    return { mode, max_duration: Math.floor(md) };
  }
  return { mode: 'run_once' };
}

export function validateQueueDefinition(def){
  const q = def || {};
  const mode = String(q.mode || 'sequential');
  if (!['sequential', 'loop_queue'].includes(mode)) throw new Error('Invalid queue mode');
  const name = q.name != null ? String(q.name) : '';
  const scenes = Array.isArray(q.scenes) ? q.scenes : [];
  if (scenes.length === 0) throw new Error('Queue must include at least one scene');
  const items = scenes.map((it) => {
    const scene_id = it.scene_id != null ? String(it.scene_id) : String(it.id || '');
    if (!scene_id) throw new Error('scene_id is required for each item');
    let lifecycle = null;
    if (it.lifecycle) {
      lifecycle = normalizeLifecycle(it.lifecycle);
    }
    return { scene_id, lifecycle };
  });
  const out = {
    queue_id: q.queue_id ? String(q.queue_id) : String(Date.now()),
    name,
    mode,
    scenes: items
  };
  return out;
}

export async function loadQueues(characterId){
  try {
    const p = await getQueuesPath(characterId);
    const raw = await fs.readFile(p, 'utf8');
    const data = JSON.parse(raw);
    return Array.isArray(data) ? data : [];
  } catch(_) {
    return [];
  }
}

export async function saveQueues(characterId, queues){
  const p = await getQueuesPath(characterId);
  await fs.writeFile(p, JSON.stringify(queues, null, 2), 'utf8');
}

export async function createQueue(characterId, def){
  const q = validateQueueDefinition(def);
  const all = await loadQueues(characterId);
  // ensure unique id
  let id = q.queue_id;
  const exists = all.find(x => String(x.queue_id) === String(id));
  if (exists) {
    id = String(id) + '-' + Date.now();
    q.queue_id = id;
  }
  all.push(q);
  await saveQueues(characterId, all);
  return q;
}

export async function getQueue(characterId, queueId){
  const all = await loadQueues(characterId);
  return all.find(x => String(x.queue_id) === String(queueId)) || null;
}

export async function updateQueue(characterId, queueId, patch){
  const all = await loadQueues(characterId);
  const idx = all.findIndex(x => String(x.queue_id) === String(queueId));
  if (idx === -1) throw new Error('Queue not found');
  const curr = all[idx];
  const merged = validateQueueDefinition({ ...curr, ...patch, queue_id: curr.queue_id });
  all[idx] = merged;
  await saveQueues(characterId, all);
  return merged;
}

export async function deleteQueue(characterId, queueId){
  const all = await loadQueues(characterId);
  const idx = all.findIndex(x => String(x.queue_id) === String(queueId));
  if (idx === -1) throw new Error('Queue not found');
  const [removed] = all.splice(idx, 1);
  await saveQueues(characterId, all);
  return removed;
}

export async function importQueue(characterId, json){
  const def = typeof json === 'string' ? JSON.parse(json) : json;
  return createQueue(characterId, def);
}

export async function exportQueue(characterId, queueId){
  const q = await getQueue(characterId, queueId);
  if (!q) throw new Error('Queue not found');
  return JSON.stringify(q, null, 2);
}

export default {
  normalizeLifecycle,
  validateQueueDefinition,
  loadQueues,
  saveQueues,
  createQueue,
  getQueue,
  updateQueue,
  deleteQueue,
  importQueue,
  exportQueue
};

