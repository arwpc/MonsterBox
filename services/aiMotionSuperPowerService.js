import fs from 'fs/promises';
import path from 'path';
import { updateJsonUnderLock } from './atomicStore.js';

/**
 * AI Motion Super Power Service
 *
 * Config persistence for the super-powers.json `aiMotion` section, plus CRUD
 * over the character's motion VOCABULARY (data/character-{id}/gestures.json).
 * Pattern: followOrdersSuperPowerService.js / headAnimationSuperPowerService.js
 *
 * Why this exists: "the character moves as well as talks" was already true
 * twice over, in two mechanisms that did not know about each other and neither
 * of which had a settings page.
 *
 *   1. randomPoseService.triggerDuringTTS() fires a RANDOM pose every time the
 *      character speaks. It is called from the live conversation socket and
 *      three TTS routes. It had no page at all, and it was found armed on four
 *      of six nodes — including one whose neck servo is a 900 degree multi-turn
 *      that tears its own head cabling on a full rotation.
 *   2. gestureEngineService, driven by the agent's `gesture` client tool, picks
 *      a SEMANTICALLY APPROPRIATE recipe as the character speaks. That is the
 *      good one, and it existed for exactly one character with no way to author
 *      a vocabulary for anybody else.
 *
 * Guest-commanded motion (Follow Orders + the body-role interpreter) was a
 * third path with its own enable bit.
 *
 * AI Motion is the single answer to "may this character move right now, and
 * with what" regardless of what triggered it. It deliberately does NOT keep its
 * own copy of the vocabulary: capabilities live in gestures.json, which the
 * gesture engine already loads, validates and performs. One store, one truth.
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
 * Every body role the interpreter can resolve. Permissions are expressed as an
 * allow-list over these, so a character may be allowed to turn its head on its
 * own initiative but never to drive its torso.
 */
export const MOTION_ROLES = [
  'head', 'jaw', 'eye', 'arm', 'torso', 'wing', 'tail', 'leg', 'door', 'light', 'body'
];

/**
 * Defaults. A missing file or missing aiMotion key resolves to this shape, so
 * the super power is OFF everywhere until an operator turns it on per
 * character — the same posture Follow Orders takes.
 *
 * `ambientDuringSpeech` defaults to false on purpose. That is the random-pose
 * behaviour, and defaulting it on is how it came to be armed fleet-wide.
 */
export function getDefaultAiMotionConfig() {
  return {
    enabled: false,
    triggers: {
      agentGesture: true,
      guestCommand: true,
      ambientDuringSpeech: false
    },
    permissions: {
      allowedRoles: ['head', 'jaw', 'eye', 'arm', 'light'],
      deniedPartIds: [],
      kidSafeOnly: false,
      cooldownMs: 3000,
      maxPerConversation: 0,
      minConfidence: 0.6,
      requireAddressByName: false,
      ambientMinAmplitude: 0.2,
      ambientMaxAmplitude: 0.5
    }
  };
}

/** Merge a partial config over the defaults without losing nested sections. */
function mergeAiMotionConfig(partial) {
  const base = getDefaultAiMotionConfig();
  const incoming = partial || {};
  return {
    ...base,
    ...incoming,
    triggers: { ...base.triggers, ...(incoming.triggers || {}) },
    permissions: { ...base.permissions, ...(incoming.permissions || {}) }
  };
}

// A fleet disable has to take effect before the next utterance, so the cache is
// deliberately short-lived and every write invalidates it.
const CONFIG_CACHE_TTL_MS = 5000;
const configCache = new Map(); // String(characterId) -> { at, config }

export function invalidateAiMotionCache(characterId) {
  if (characterId == null) configCache.clear();
  else configCache.delete(String(characterId));
}

/**
 * Read AI Motion configuration from super-powers.json.
 * Returns a config object with defaults merged in. Never throws.
 */
export async function readAiMotionConfig(characterId) {
  const key = String(characterId);
  const cached = configCache.get(key);
  if (cached && Date.now() - cached.at < CONFIG_CACHE_TTL_MS) return cached.config;

  let config = getDefaultAiMotionConfig();
  try {
    const configFile = path.join(getCharacterDataDir(characterId), 'super-powers.json');
    let fileConfig = null;
    try {
      fileConfig = JSON.parse(await fs.readFile(configFile, 'utf8'));
    } catch (_) {
      // File missing — defaults apply.
    }
    if (fileConfig && fileConfig.aiMotion) {
      config = mergeAiMotionConfig(fileConfig.aiMotion);
    }
  } catch (error) {
    console.error('Error reading AI Motion config:', error.message);
  }

  configCache.set(key, { at: Date.now(), config });
  return config;
}

/**
 * Write AI Motion configuration to super-powers.json.
 * Preserves the sibling sections (jawAnimation, headTracking, followOrders) by
 * going through the same file lock those services use — writing this file with
 * a plain read-modify-write silently drops whichever section was written last
 * (finding #47).
 */
export async function writeAiMotionConfig(characterId, config) {
  const dataDir = getCharacterDataDir(characterId);
  const configFile = path.join(dataDir, 'super-powers.json');

  await fs.mkdir(dataDir, { recursive: true });
  await updateJsonUnderLock(configFile, (fileConfig) => {
    fileConfig.aiMotion = mergeAiMotionConfig(config);
    return fileConfig;
  });

  invalidateAiMotionCache(characterId);
  return readAiMotionConfig(characterId);
}

/**
 * Validate a partial config before it is written. Returns an array of human
 * readable errors; empty means acceptable. The page relies on these messages,
 * so they name the offending field.
 */
export function validateAiMotionConfig(partial) {
  const errors = [];
  const c = partial || {};

  if (c.triggers != null && typeof c.triggers !== 'object') {
    errors.push('triggers must be an object');
  }
  const p = c.permissions;
  if (p != null) {
    if (typeof p !== 'object') {
      errors.push('permissions must be an object');
    } else {
      if (p.allowedRoles != null) {
        if (!Array.isArray(p.allowedRoles)) {
          errors.push('permissions.allowedRoles must be an array');
        } else {
          const bad = p.allowedRoles.filter(r => !MOTION_ROLES.includes(r));
          if (bad.length) errors.push(`unknown motion role(s): ${bad.join(', ')}`);
        }
      }
      if (p.deniedPartIds != null && !Array.isArray(p.deniedPartIds)) {
        errors.push('permissions.deniedPartIds must be an array');
      }
      const numeric = [
        ['cooldownMs', 0, 600000],
        ['maxPerConversation', 0, 1000],
        ['minConfidence', 0, 1],
        ['ambientMinAmplitude', 0, 1],
        ['ambientMaxAmplitude', 0, 1]
      ];
      for (const [field, min, max] of numeric) {
        if (p[field] == null) continue;
        const n = Number(p[field]);
        if (!Number.isFinite(n) || n < min || n > max) {
          errors.push(`permissions.${field} must be a number between ${min} and ${max}`);
        }
      }
      const lo = p.ambientMinAmplitude, hi = p.ambientMaxAmplitude;
      if (lo != null && hi != null && Number(lo) > Number(hi)) {
        errors.push('permissions.ambientMinAmplitude cannot exceed ambientMaxAmplitude');
      }
    }
  }
  return errors;
}

/**
 * Is a part allowed to be driven by AI Motion on its OWN initiative?
 *
 * This is an authority check, not a safety check. It never widens anything: the
 * physical-fault veto in the servo daemon and the executor still refuse broken
 * hardware regardless of what this returns.
 */
export function isMotionAllowed(config, { role, partId } = {}) {
  const cfg = mergeAiMotionConfig(config);
  if (!cfg.enabled) return { allowed: false, reason: 'AI Motion is disabled for this character' };
  const denied = (cfg.permissions.deniedPartIds || []).map(String);
  if (partId != null && denied.includes(String(partId))) {
    return { allowed: false, reason: `part ${partId} is on this character's AI Motion deny list` };
  }
  if (role && !(cfg.permissions.allowedRoles || []).includes(role)) {
    return { allowed: false, reason: `role "${role}" is not permitted for this character` };
  }
  return { allowed: true };
}

export default {
  MOTION_ROLES,
  getDefaultAiMotionConfig,
  readAiMotionConfig,
  writeAiMotionConfig,
  validateAiMotionConfig,
  invalidateAiMotionCache,
  isMotionAllowed
};
