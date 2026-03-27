/**
 * Actuator Position Store
 *
 * Persists open-loop actuator and continuous servo positions to disk so they
 * survive server restarts. Uses atomic writes (temp file + rename) to prevent
 * corruption on SD card power loss.
 *
 * State per part:
 *   currentP        — normalized position [0, 1]
 *   positionKnown   — true if position is trusted (homed or tracked)
 *   isMoving        — true while motor is running (crash recovery flag)
 *   lastDir         — 'extend'|'retract' or 'cw'|'ccw'
 *   confidence      — 'homed'|'tracked'|'degraded'|'unknown'
 *   movesSinceHome  — counter, resets on home
 *   lastHomedAt     — ISO timestamp
 *   lastUpdatedAt   — ISO timestamp
 *   cleanShutdown   — true if last server exit was graceful
 */

import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const STATE_FILE = path.resolve(__dirname, '..', 'data', 'actuator-positions.json');

let _cache = null; // in-memory cache: { partId: state }

function _loadFromDisk() {
  try {
    const raw = fs.readFileSync(STATE_FILE, 'utf8');
    return JSON.parse(raw);
  } catch {
    return {};
  }
}

function _saveToDisk(data) {
  const tmp = STATE_FILE + '.tmp';
  fs.writeFileSync(tmp, JSON.stringify(data, null, 2), 'utf8');
  fs.renameSync(tmp, STATE_FILE);
}

function _getAll() {
  if (!_cache) _cache = _loadFromDisk();
  return _cache;
}

/**
 * Load position state for a single part.
 * @param {string|number} partId
 * @returns {object|null} state or null if not tracked
 */
function load(partId) {
  const all = _getAll();
  return all[String(partId)] || null;
}

/**
 * Load all tracked positions.
 * @returns {object} map of partId → state
 */
function loadAll() {
  return { ..._getAll() };
}

/**
 * Save position state for a part (full replace).
 * @param {string|number} partId
 * @param {object} state
 */
function save(partId, state) {
  const all = _getAll();
  all[String(partId)] = {
    ...state,
    lastUpdatedAt: new Date().toISOString()
  };
  _saveToDisk(all);
}

/**
 * Update specific fields without replacing the entire state.
 * @param {string|number} partId
 * @param {object} fields — fields to merge
 */
function update(partId, fields) {
  const all = _getAll();
  const key = String(partId);
  const existing = all[key] || {};
  all[key] = {
    ...existing,
    ...fields,
    lastUpdatedAt: new Date().toISOString()
  };
  _saveToDisk(all);
}

/**
 * Mark that a move is starting (crash recovery: if we crash mid-move,
 * position is unknown on next startup).
 */
function markMoving(partId, direction) {
  update(partId, { isMoving: true, lastDir: direction });
}

/**
 * Mark that a move completed. Update position.
 * @param {string|number} partId
 * @param {number} newP — new normalized position
 */
function markStopped(partId, newP) {
  const existing = load(partId) || {};
  update(partId, {
    currentP: newP,
    isMoving: false,
    positionKnown: true,
    confidence: existing.confidence === 'homed' ? 'homed' : 'tracked',
    movesSinceHome: (existing.movesSinceHome || 0) + 1
  });
}

/**
 * Mark that the actuator was homed (driven to a known endstop).
 * @param {string|number} partId
 * @param {number} p — position after homing (0 or 1)
 */
function markHomed(partId, p) {
  update(partId, {
    currentP: p,
    isMoving: false,
    positionKnown: true,
    confidence: 'homed',
    movesSinceHome: 0,
    lastHomedAt: new Date().toISOString()
  });
}

/**
 * Mark position as unknown (e.g. emergency stop, crash recovery).
 */
function markUnknown(partId) {
  update(partId, {
    positionKnown: false,
    isMoving: false,
    confidence: 'unknown'
  });
}

/**
 * Mark all positions with cleanShutdown flag (called during graceful shutdown).
 */
function markCleanShutdown() {
  const all = _getAll();
  for (const key of Object.keys(all)) {
    all[key].cleanShutdown = true;
    all[key].isMoving = false;
  }
  _saveToDisk(all);
}

/**
 * On startup: check for crash recovery. If any part was isMoving=true or
 * cleanShutdown=false, mark its position as unknown.
 */
function recoverFromCrash() {
  const all = _getAll();
  let needsSave = false;
  for (const [key, state] of Object.entries(all)) {
    if (state.isMoving) {
      // Crashed during a move — position is unknown
      all[key].positionKnown = false;
      all[key].isMoving = false;
      all[key].confidence = 'unknown';
      needsSave = true;
      console.warn(`[ActuatorPositionStore] Part ${key} was moving during crash — position unknown, homing recommended`);
    }
    // Clear cleanShutdown flag for this session
    all[key].cleanShutdown = false;
  }
  if (needsSave) _saveToDisk(all);
}

/**
 * Clear cached state (for testing).
 */
function clearCache() {
  _cache = null;
}

export default {
  load, loadAll, save, update,
  markMoving, markStopped, markHomed, markUnknown,
  markCleanShutdown, recoverFromCrash, clearCache
};
