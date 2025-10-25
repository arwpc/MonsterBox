import { executeScene } from './sceneExecutor.js';
import scenesService from './scenesService.js';

// In-memory queue per character (reset on server restart)
// q shape: { items: [sceneWithMeta], originalItems: [sceneWithMeta], priority: [sceneWithMeta], running, paused, stopRequested, skipRequested, nowPlaying, mode }
const queues = new Map();

function ensureQueue(characterId) {
  const key = String(characterId);
  if (!queues.has(key)) {
    queues.set(key, {
      items: [],
      originalItems: [],
      priority: [],
      running: false,
      paused: false,
      stopRequested: false,
      skipRequested: false,
      nowPlaying: null,
      mode: 'sequential'
    });
  }
  return queues.get(key);
}

function projectItem(item, index) {
  if (!item) return null;
  const s = item.scene || item; // backward compatibility: may be a raw scene
  const lifecycle = item.lifecycle || null;
  return { index, id: s.id, name: s.name, steps: Array.isArray(s.steps) ? s.steps.length : 0, lifecycle: lifecycle ? lifecycle.mode : undefined };
}

export function getStatus(characterId) {
  const q = ensureQueue(characterId);
  return {
    running: q.running,
    paused: q.paused,
    stopRequested: q.stopRequested,
    length: q.items.length,
    mode: q.mode,
    nowPlaying: q.nowPlaying ? { id: q.nowPlaying.id, name: q.nowPlaying.name } : null,
    items: q.items.map((it, i) => projectItem(it, i)),
    priority: q.priority.map((it, i) => projectItem(it, i))
  };
}

export async function enqueue(characterId, sceneId) {
  const scenes = await scenesService.loadScenes();
  const scene = scenes.find(s => parseInt(s.id, 10) === parseInt(sceneId, 10));
  if (!scene) throw new Error('Scene not found');
  const q = ensureQueue(characterId);
  q.items.push({ scene });
  if (!q.originalItems || q.originalItems.length === 0) q.originalItems = q.items.slice();
  return getStatus(characterId);
}

export function reorder(characterId, fromIndex, toIndex) {
  const q = ensureQueue(characterId);
  const len = q.items.length;
  if (fromIndex < 0 || fromIndex >= len || toIndex < 0 || toIndex >= len) throw new Error('Index out of range');
  const [item] = q.items.splice(fromIndex, 1);
  q.items.splice(toIndex, 0, item);
  q.originalItems = q.items.slice();
  return getStatus(characterId);
}

export function clear(characterId) {
  const q = ensureQueue(characterId);
  q.items = [];
  q.originalItems = [];
  q.priority = [];
  q.stopRequested = false;
  q.paused = false;
  q.skipRequested = false;
  return getStatus(characterId);
}

export function stop(characterId) {
  const q = ensureQueue(characterId);
  q.stopRequested = true;
  return getStatus(characterId);
}

export function emergencyStop(characterId) {
  const q = ensureQueue(characterId);
  q.stopRequested = true;
  q.priority = [];
  q.items = [];
  return getStatus(characterId);
}

export function pause(characterId) {
  const q = ensureQueue(characterId);
  q.paused = true;
  return getStatus(characterId);
}

export function resume(characterId) {
  const q = ensureQueue(characterId);
  q.paused = false;
  return getStatus(characterId);
}

export function skip(characterId) {
  const q = ensureQueue(characterId);
  q.skipRequested = true;
  return getStatus(characterId);
}

export async function insertPriority(characterId, sceneId) {
  const scenes = await scenesService.loadScenes();
  const scene = scenes.find(s => parseInt(s.id, 10) === parseInt(sceneId, 10));
  if (!scene) throw new Error('Scene not found');
  const q = ensureQueue(characterId);
  q.priority.push({ scene });
  return getStatus(characterId);
}

async function awaitIfPaused(q) {
  while (q.paused && !q.stopRequested) {
    await new Promise(r => setTimeout(r, 50));
  }
}

async function runSceneWithLifecycle(q, characterId, item) {
  const s = item.scene || item;
  const lc = item.lifecycle || { mode: 'run_once' };
  const mode = lc.mode || 'run_once';
  const start = Date.now();
  q.nowPlaying = { id: s.id, name: s.name };
  try {
    if (mode === 'run_for_duration') {
      const dSec = Math.max(1, Math.floor(lc.duration || 1));
      const deadline = start + dSec * 1000;
      while (Date.now() < deadline && !q.stopRequested) {
        await awaitIfPaused(q);
        if (q.stopRequested || q.skipRequested) break;
        await executeScene(s, characterId, null);
      }
    } else if (mode === 'loop_until_disabled') {
      const maxSec = Math.max(1, Math.floor(lc.max_duration || 1));
      const deadline = start + maxSec * 1000;
      while (Date.now() < deadline && !q.stopRequested) {
        await awaitIfPaused(q);
        if (q.stopRequested || q.skipRequested) break;
        await executeScene(s, characterId, null);
      }
    } else {
      await awaitIfPaused(q);
      if (!q.stopRequested && !q.skipRequested) {
        await executeScene(s, characterId, null);
      }
    }
  } finally {
    q.nowPlaying = null;
  }
}

async function runLoop(characterId) {
  const q = ensureQueue(characterId);
  if (q.running) return; // already running
  q.running = true;
  try {
    while (!q.stopRequested) {
      // Priority override first
      let next = q.priority.length > 0 ? q.priority.shift() : null;
      if (!next) {
        // Check if queue is empty
        if (q.items.length === 0) {
          if (q.mode === 'loop_queue' && q.originalItems && q.originalItems.length > 0) {
            // Refill queue for loop mode
            q.items = q.originalItems.slice();
          } else {
            // Sequential mode or no items - exit loop
            break;
          }
        }
        // Get next item only if queue has items
        if (q.items.length > 0) {
          next = q.items.shift();
        }
      }
      q.skipRequested = false;
      if (!next) break;
      await runSceneWithLifecycle(q, characterId, next);
    }
  } finally {
    q.running = false;
    q.stopRequested = false;
    q.paused = false;
    q.skipRequested = false;
    q.nowPlaying = null;
  }
}

export async function start(characterId) {
  const q = ensureQueue(characterId);
  if (!q.originalItems || q.originalItems.length === 0) q.originalItems = q.items.slice();
  // Start loop in background - don't await
  runLoop(characterId).catch(err => {
    console.error(`Queue loop error for character ${characterId}:`, err);
    q.running = false;
  });
  return getStatus(characterId);
}

export async function startWithConfig(characterId, config) {
  const q = ensureQueue(characterId);
  q.items = [];
  q.priority = [];
  q.stopRequested = false;
  q.paused = false;
  q.skipRequested = false;
  q.mode = (config && config.mode === 'loop_queue') ? 'loop_queue' : 'sequential';
  // Load scenes and build items
  const scenes = await scenesService.loadScenes();
  const items = (config && Array.isArray(config.scenes)) ? config.scenes : [];
  for (const it of items) {
    const sid = parseInt(it.scene_id || it.id, 10);
    const s = scenes.find(x => parseInt(x.id, 10) === sid);
    if (s) {
      q.items.push({ scene: s, lifecycle: it.lifecycle || null });
    }
  }
  q.originalItems = q.items.slice();
  // Start loop in background - don't await
  runLoop(characterId).catch(err => {
    console.error(`Queue loop error for character ${characterId}:`, err);
    q.running = false;
  });
  return getStatus(characterId);
}

export default { getStatus, enqueue, reorder, clear, stop, start, emergencyStop, pause, resume, skip, insertPriority, startWithConfig };