import fs from 'fs/promises';
import path from 'path';
import { updateJsonUnderLock } from '../atomicStore.js';
import { getCharacterById } from '../characterContext.js';

/**
 * Follow Orders Super Power Service
 * Config persistence for super-powers.json followOrders section.
 * Pattern: headAnimationSuperPowerService.js / jawAnimationSuperPowerService.js
 *
 * Follow Orders lets a character obey spoken commands ("raise your arm") by
 * matching STT transcripts locally against poses, gestures, and part names —
 * deliberately NOT by giving the ElevenLabs agent a vocabulary of ids, which
 * was measured to leak into speech (config/elevenlabs/gesture/README.md).
 */

/**
 * Get the data directory for a specific character.
 * Always resolves to data/character-{id} to ensure character independence.
 */
function getCharacterDataDir(characterId) {
  // characterId arrives from route params; reject non-integer values so a
  // "../.." payload can never build a path outside the data directory.
  if (!/^\d+$/.test(String(characterId))) {
    throw new Error(`Invalid characterId: ${characterId}`);
  }
  return path.resolve(`data/character-${characterId}`);
}

/**
 * Default configuration. A missing file or missing followOrders key resolves
 * to this shape, so the feature is disabled everywhere until an operator
 * enables it per character.
 */
function getDefaultFollowOrdersConfig() {
  return {
    enabled: false,
    requireAddressByName: false,
    addressAliases: [],
    ackMode: 'speak',
    ackPhrases: ['As you command.'],
    refusalPhrases: [],
    minConfidence: 0.6,
    cooldownMs: 2000,
    defaultDurationMs: 1200,
    maxDurationMs: 3000,
    enablePoseMatching: true,
    enableGestureMatching: true,
    enablePartMatching: true,
    commands: [],
    partAliases: []
  };
}

/**
 * Load parts for a specific character from data/character-{id}/parts.json.
 * Never relies on the global dataPath.
 */
async function loadPartsSafe(characterId) {
  try {
    const partsFile = path.join(getCharacterDataDir(characterId), 'parts.json');
    const data = await fs.readFile(partsFile, 'utf8');
    const parts = JSON.parse(data);
    return Array.isArray(parts) ? parts : [];
  } catch (error) {
    console.error('Error loading parts for character', characterId, ':', error.message);
    return [];
  }
}

// Fleet disable must take effect before the next utterance, so the cache is
// deliberately short-lived and every write invalidates it.
const CONFIG_CACHE_TTL_MS = 5000;
const configCache = new Map(); // String(characterId) -> { at, config }

function invalidateFollowOrdersCache(characterId) {
  if (characterId == null) configCache.clear();
  else configCache.delete(String(characterId));
}

/**
 * Read follow-orders configuration from super-powers.json.
 * Returns a flat config object with defaults merged in. Never throws.
 */
async function readFollowOrdersConfig(characterId) {
  const key = String(characterId);
  const cached = configCache.get(key);
  if (cached && Date.now() - cached.at < CONFIG_CACHE_TTL_MS) return cached.config;

  let config = getDefaultFollowOrdersConfig();
  try {
    const configFile = path.join(getCharacterDataDir(characterId), 'super-powers.json');
    let fileConfig = null;
    try {
      fileConfig = JSON.parse(await fs.readFile(configFile, 'utf8'));
    } catch (_) {
      // File missing — defaults apply.
    }
    if (fileConfig && fileConfig.followOrders) {
      config = { ...getDefaultFollowOrdersConfig(), ...fileConfig.followOrders };
    }
  } catch (error) {
    console.error('Error reading follow-orders config:', error.message);
  }

  configCache.set(key, { at: Date.now(), config });
  return config;
}

/**
 * Write follow-orders configuration to super-powers.json.
 * Preserves other keys (jawAnimation, headTracking). Serialized under the
 * same file lock those services use, so cross-section saves can't clobber
 * each other (finding #47).
 */
async function writeFollowOrdersConfig(characterId, config) {
  const dataDir = getCharacterDataDir(characterId);
  const configFile = path.join(dataDir, 'super-powers.json');

  await fs.mkdir(dataDir, { recursive: true });
  await updateJsonUnderLock(configFile, (fileConfig) => {
    fileConfig.followOrders = { ...getDefaultFollowOrdersConfig(), ...config };
    return fileConfig;
  });

  invalidateFollowOrdersCache(characterId);
  return readFollowOrdersConfig(characterId);
}

// Part types a spoken order may operate. Types appear with both hyphen and
// underscore spellings across characters; normalize before comparing.
const CONTROLLABLE_TYPES = new Set([
  'servo', 'continuous_servo', 'linear_actuator', 'motor', 'stepper',
  'light', 'led', 'speaker'
]);

function normalizeType(type) {
  return String(type || '').replace(/-/g, '_');
}

/**
 * Everything the pure matcher needs to resolve one transcript, in one object.
 * Assembled here so orderMatcher stays free of I/O and unit-testable.
 */
async function buildMatchContext(characterId) {
  const character = getCharacterById(characterId);
  const config = await readFollowOrdersConfig(characterId);

  let poses = [];
  if (config.enablePoseMatching) {
    try {
      const { loadPoses } = await import('../poses/poseRepository.js');
      const data = await loadPoses(characterId);
      poses = (data.poses || []).map(p => ({
        id: p.id, name: p.name || '', category: p.category || '', tags: p.tags || []
      }));
    } catch (err) {
      console.warn(`Follow orders: pose load failed for character ${characterId}: ${err.message}`);
    }
  }

  let gestures = [];
  if (config.enableGestureMatching) {
    try {
      const gestureEngine = await import('../gestureEngineService.js').then(m => m.default || m);
      const list = await gestureEngine.listGestures(characterId);
      gestures = (list.available || []).map(g => ({ id: g.id, label: g.label || '', intent: g.intent || '' }));
    } catch (err) {
      console.warn(`Follow orders: gesture load failed for character ${characterId}: ${err.message}`);
    }
  }

  const rawParts = await loadPartsSafe(characterId);
  const parts = rawParts
    .filter(p => p.enabled !== false && CONTROLLABLE_TYPES.has(normalizeType(p.type)))
    .map(p => ({
      partId: String(p.id),
      type: normalizeType(p.type),
      name: p.name || '',
      description: p.description || '',
      markers: Array.isArray(p.markers) ? p.markers : []
    }));

  // Which of this character's parts the operator has declared physically
  // broken. The body-role interpreter uses it to pick the arm that still works
  // when a role has more than one candidate; the executor still enforces the
  // refusal, so a miss here costs nothing.
  let brokenPartIds = [];
  try {
    const { getPhysicalFault } = await import('../hardwareService/safetyLimits.js');
    const checked = await Promise.all(parts.map(async p => {
      const fault = await getPhysicalFault(characterId, p.partId);
      return fault && fault.broken ? p.partId : null;
    }));
    brokenPartIds = checked.filter(Boolean);
  } catch (err) {
    console.warn(`Follow orders: physical-fault lookup failed for character ${characterId}: ${err.message}`);
  }

  return {
    characterName: (character && character.name) || '',
    config,
    poses,
    gestures,
    parts,
    brokenPartIds
  };
}

/**
 * Can this character follow orders at all? Needs at least one controllable
 * part and a microphone part to hear with. Used by the enable route so the
 * toggle refuses honestly instead of latching on a deaf or limbless node.
 */
async function canPerform(characterId) {
  const parts = await loadPartsSafe(characterId);
  const controllable = parts.filter(p => p.enabled !== false && CONTROLLABLE_TYPES.has(normalizeType(p.type)));
  if (!controllable.length) {
    return { ok: false, reason: 'No controllable parts (servo/motor/actuator/light/speaker) configured for this character' };
  }
  const mic = parts.find(p => normalizeType(p.type) === 'microphone' && p.enabled !== false);
  if (!mic) {
    return { ok: false, reason: 'No microphone part configured for this character' };
  }
  return { ok: true, reason: null };
}

export {
  getDefaultFollowOrdersConfig,
  readFollowOrdersConfig,
  writeFollowOrdersConfig,
  buildMatchContext,
  canPerform,
  invalidateFollowOrdersCache,
  loadPartsSafe,
  CONTROLLABLE_TYPES
};
