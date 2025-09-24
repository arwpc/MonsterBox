import scenesService from './scenesService.js';
import { executeScene } from './sceneExecutor.js';

// Simple in-memory queue per character
// Not persisted; resets on server restart (acceptable for Live Mode)
const queues = new Map(); // key: characterId -> { items: [{id,name,steps}], running: bool, stopRequested: bool }

function ensureQueue(characterId){
  const key = String(characterId);
  if (!queues.has(key)) queues.set(key, { items: [], running: false, stopRequested: false, nowPlaying: null });
  return queues.get(key);
}

export function getStatus(characterId){
  const q = ensureQueue(characterId);
  return {
    running: q.running,
    stopRequested: q.stopRequested,
    length: q.items.length,
    nowPlaying: q.nowPlaying ? { id: q.nowPlaying.id, name: q.nowPlaying.name } : null,
    items: q.items.map((s,i) => ({ index: i, id: s.id, name: s.name, steps: (s.steps||[]).length }))
  };
}

export async function enqueue(characterId, sceneId){
  const scenes = await scenesService.loadScenes();
  const scene = scenes.find(s => parseInt(s.id,10) === parseInt(sceneId,10));
  if (!scene) throw new Error('Scene not found');
  const q = ensureQueue(characterId);
  q.items.push(scene);
  return getStatus(characterId);
}

export function reorder(characterId, fromIndex, toIndex){
  const q = ensureQueue(characterId);
  const len = q.items.length;
  if (fromIndex < 0 || fromIndex >= len || toIndex < 0 || toIndex >= len) throw new Error('Index out of range');
  const [item] = q.items.splice(fromIndex, 1);
  q.items.splice(toIndex, 0, item);
  return getStatus(characterId);
}

export function clear(characterId){
  const q = ensureQueue(characterId);
  q.items = [];
  q.stopRequested = false;
  return getStatus(characterId);
}

export function stop(characterId){
  const q = ensureQueue(characterId);
  q.stopRequested = true;
  return getStatus(characterId);
}

async function runLoop(characterId){
  const q = ensureQueue(characterId);
  if (q.running) return; // already running
  q.running = true;
  try {
    while(q.items.length > 0){
      if (q.stopRequested) break;
      const next = q.items.shift();
      q.nowPlaying = { id: next.id, name: next.name };
      try {
        await executeScene(next, characterId, null);
      } catch (e) {
        // log error but keep going
        // console.warn('Scene failed in queue:', e && e.message);
      }
      q.nowPlaying = null;
    }
  } finally {
    q.running = false;
    q.stopRequested = false;
    q.nowPlaying = null;
  }
}

export async function start(characterId){
  await runLoop(characterId);
  return getStatus(characterId);
}

export default { getStatus, enqueue, reorder, clear, stop, start };

