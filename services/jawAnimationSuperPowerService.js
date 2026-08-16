import fs from 'fs/promises';
import path from 'path';
import { fileURLToPath } from 'url';
import { spawn } from 'child_process';
import hardwareService from './hardwareService/index.js';
import jawServoDaemon from './jawServoDaemon.js';
import { readConfig } from './configService.js';
import { loadParts as loadPartsFromController } from '../controllers/partsController.js';
import { getCalibrationStore, isPlaceholderProfile } from '../server/calibration/store.js';
import { writeJsonAtomic, updateJsonUnderLock } from './atomicStore.js';
import speechExpression from './speechExpressionService.js';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);


/**
 * Jaw Animation Super Power Service
 * Handles jaw servo animation based on real-time audio amplitude
 * Integrates with existing MonsterBox audio and servo systems
 */

let audioMonitoringState = new Map(); // characterId -> { isMonitoring, lastAmplitude, smoothedAmplitude }
let characterConfigs = new Map(); // characterId -> jaw animation config
let activeJawDrives = new Map(); // characterId -> { cancelled, timer, amplitude, angle }
let envelopeState = new Map(); // characterId -> { lastAngle, lastTime }

/**
 * Get the data directory for the current character
 */
async function getCharacterDataDir(characterId) {
  // characterId is authoritative. The old code returned config.dataPath whenever
  // it contained "character-", ignoring the requested id — so reading/writing jaw
  // config for character B while character A was selected hit A's data dir,
  // corrupting the wrong character. Only fall back to config when no id is given.
  if (characterId != null) {
    // characterId reaches here from route params; reject non-integers so a
    // "../.." payload can't build a path outside the data directory.
    if (!/^\d+$/.test(String(characterId))) {
      throw new Error(`Invalid characterId: ${characterId}`);
    }
    return path.resolve(`data/character-${characterId}`);
  }
  const config = await readConfig();
  return path.resolve(config.dataPath || 'data');
}

/**
 * Read the raw jawAnimation object from super-powers.json.
 * Auto-migrates old flat format → multi-config format on first read.
 */
async function readRawJawSection(characterId) {
  const dataDir = await getCharacterDataDir(characterId);
  const configFile = path.join(dataDir, 'super-powers.json');

  let fileConfig = {};
  try {
    const data = await fs.readFile(configFile, 'utf8');
    fileConfig = JSON.parse(data);
  } catch (_) {
    // File missing — return default multi-config structure
    return buildDefaultMultiConfig();
  }

  let jaw = fileConfig.jawAnimation;
  if (!jaw) return buildDefaultMultiConfig();

  // Auto-migrate: if there's no configs array, this is the old flat format
  if (!Array.isArray(jaw.configs)) {
    jaw = migrateToMultiConfig(jaw);
    // Persist the migration
    fileConfig.jawAnimation = jaw;
    try {
      await writeJsonAtomic(configFile, fileConfig);
    } catch (writeErr) {
      console.warn('Could not persist jaw config migration:', writeErr.message);
    }
  }

  return jaw;
}

/**
 * Migrate a flat jaw config to multi-config format.
 * The existing config becomes the first entry in configs[].
 */
function migrateToMultiConfig(flat) {
  const { enabled, servoPartId, ...params } = flat;
  const configId = 'config-1';
  return {
    enabled: !!enabled,
    servoPartId: servoPartId || null,
    activeConfigId: configId,
    configs: [{
      id: configId,
      name: 'Default',
      ...params
    }]
  };
}

/**
 * Build a default multi-config structure for new characters.
 */
function buildDefaultMultiConfig() {
  const def = getDefaultJawConfig();
  const { enabled, servoPartId, ...params } = def;
  return {
    enabled: false,
    servoPartId: null,
    activeConfigId: 'config-1',
    configs: [{
      id: 'config-1',
      name: 'Default',
      ...params
    }]
  };
}

/**
 * Read jaw animation configuration for a character.
 * Returns a flat config (backward-compatible): { enabled, servoPartId, sensitivity, ... }
 * The active config's params are merged into the top-level object.
 * Also pre-warms the servo daemon if jaw is enabled.
 */
async function readJawConfig(characterId) {
  try {
    const jaw = await readRawJawSection(characterId);
    const flat = flattenJawConfig(jaw);

    // Overlay current calibration bounds from calibration_profiles.json so the
    // UI always shows the canonical min/max. Falls back to flat's stored values.
    if (flat.servoPartId) {
      try {
        const parts = await loadPartsSafe(characterId);
        const part = parts.find(p => String(p.id) === String(flat.servoPartId));
        if (part) {
          const cal = await getCalibrationForPart(part);
          if (cal.calibrated) {
            flat.minAngle = cal.minAngle;
            flat.maxAngle = cal.maxAngle;
          }
        }
      } catch (_) { /* retain stored values */ }
    }

    // Pre-warm daemon so it's ready when playWithJawSync is called
    if (flat.enabled && flat.servoPartId) {
      jawServoDaemon.ensureRunning().catch(() => {});
    }

    return flat;
  } catch (error) {
    return getDefaultJawConfig();
  }
}

/**
 * Flatten a multi-config jawAnimation section into the legacy flat format.
 * Merges the active config's params (sensitivity, smoothing, etc.) into top level.
 */
function flattenJawConfig(jaw) {
  const configs = jaw.configs || [];
  const active = configs.find(c => c.id === jaw.activeConfigId) || configs[0];

  if (!active) return getDefaultJawConfig();

  // Merge: top-level enabled/servoPartId + active config's tuning params
  const { id, name, ...tuningParams } = active;
  return {
    enabled: !!jaw.enabled,
    servoPartId: jaw.servoPartId || null,
    activeConfigId: jaw.activeConfigId,
    ...tuningParams
  };
}

/**
 * Write jaw animation configuration for a character.
 * Accepts either a flat config (from legacy POST /api/jaw-animation/:charId)
 * or params to update the active config. Updates the active config entry in configs[].
 */
async function writeJawConfig(characterId, jawConfig) {
  try {
    const dataDir = await getCharacterDataDir(characterId);
    await fs.mkdir(dataDir, { recursive: true });

    const configFile = path.join(dataDir, 'super-powers.json');

    // Serialize the whole read-modify-write of super-powers.json so a concurrent
    // head-tracking save (which writes the same file) can't clobber this jaw
    // update, and vice-versa (finding #47). The head service locks on the same
    // configFile key, so the two cross-service writers run one at a time.
    let savedJaw = null;
    await updateJsonUnderLock(configFile, (fileConfig) => {
      // Read existing multi-config structure (or migrate)
      let jaw = fileConfig.jawAnimation;
      if (!jaw || !Array.isArray(jaw.configs)) {
        jaw = jaw ? migrateToMultiConfig(jaw) : buildDefaultMultiConfig();
      }

      // Update top-level fields
      if (jawConfig.enabled !== undefined) jaw.enabled = !!jawConfig.enabled;
      if (jawConfig.servoPartId !== undefined) jaw.servoPartId = jawConfig.servoPartId;

      // Update the active config's tuning params.
      // Intentionally excludes minAngle/maxAngle — calibration_profiles.json is the
      // source of truth and readJawConfig overlays it on every read. Persisting the
      // overlaid values here caused cross-character bleed when two characters shared
      // a servo partId (profiles are keyed globally).
      const activeId = jaw.activeConfigId || (jaw.configs[0] && jaw.configs[0].id);
      const activeIdx = jaw.configs.findIndex(c => c.id === activeId);
      if (activeIdx >= 0) {
        const tuningKeys = [
          'sensitivity', 'smoothing', 'volumeThreshold', 'attackTime', 'releaseTime',
          'useBandpassFilter', 'useAGC', 'quantizationLevels', 'preset',
          'audioLeadTimeMs', 'testText',
          'amplitudeMapping', 'dynamicRangeDb', 'mappingGamma'
        ];
        for (const key of tuningKeys) {
          if (jawConfig[key] !== undefined) {
            jaw.configs[activeIdx][key] = jawConfig[key];
          }
        }
      }

      fileConfig.jawAnimation = jaw;
      savedJaw = jaw;
      return fileConfig;
    });

    // Update in-memory cache with flat config
    characterConfigs.set(String(characterId), flattenJawConfig(savedJaw));

    return true;
  } catch (error) {
    console.error('Error writing jaw config:', error);
    throw error;
  }
}

// ─── Multi-Config CRUD ──────────────────────────────────────────────

/**
 * List all jaw configs for a character.
 * Returns { enabled, servoPartId, activeConfigId, configs: [{ id, name, ... }] }
 */
async function listJawConfigs(characterId) {
  const jaw = await readRawJawSection(characterId);
  return {
    enabled: !!jaw.enabled,
    servoPartId: jaw.servoPartId || null,
    activeConfigId: jaw.activeConfigId,
    configs: (jaw.configs || []).map(c => ({
      id: c.id,
      name: c.name,
      preset: c.preset || 'custom'
    }))
  };
}

/**
 * Get a specific jaw config by ID.
 */
async function getJawConfigById(characterId, configId) {
  const jaw = await readRawJawSection(characterId);
  const config = (jaw.configs || []).find(c => c.id === configId);
  if (!config) return null;
  return { ...config };
}

/**
 * Create or update a jaw config entry.
 * If configId exists, updates it. Otherwise creates a new entry.
 * Returns the saved config object.
 */
async function saveJawConfigById(characterId, configId, params) {
  const dataDir = await getCharacterDataDir(characterId);
  await fs.mkdir(dataDir, { recursive: true });
  const configFile = path.join(dataDir, 'super-powers.json');

  let fileConfig = {};
  try {
    const data = await fs.readFile(configFile, 'utf8');
    fileConfig = JSON.parse(data);
  } catch (_) {}

  let jaw = fileConfig.jawAnimation;
  if (!jaw || !Array.isArray(jaw.configs)) {
    jaw = jaw ? migrateToMultiConfig(jaw) : buildDefaultMultiConfig();
  }

  const idx = jaw.configs.findIndex(c => c.id === configId);
  if (idx >= 0) {
    // Update existing
    Object.assign(jaw.configs[idx], params);
    jaw.configs[idx].id = configId; // Ensure ID is not overwritten
  } else {
    // Create new
    jaw.configs.push({ id: configId, name: params.name || 'Unnamed', ...params });
  }

  fileConfig.jawAnimation = jaw;
  await writeJsonAtomic(configFile, fileConfig);

  // Refresh cache
  characterConfigs.set(String(characterId), flattenJawConfig(jaw));

  return jaw.configs.find(c => c.id === configId);
}

/**
 * Delete a jaw config entry. Cannot delete the active config.
 * Returns { success, error? }
 */
async function deleteJawConfigById(characterId, configId) {
  const dataDir = await getCharacterDataDir(characterId);
  const configFile = path.join(dataDir, 'super-powers.json');

  let fileConfig = {};
  try {
    const data = await fs.readFile(configFile, 'utf8');
    fileConfig = JSON.parse(data);
  } catch (_) {
    return { success: false, error: 'Config file not found' };
  }

  let jaw = fileConfig.jawAnimation;
  if (!jaw || !Array.isArray(jaw.configs)) {
    return { success: false, error: 'No configs found' };
  }

  if (jaw.configs.length <= 1) {
    return { success: false, error: 'Cannot delete the last config' };
  }

  if (jaw.activeConfigId === configId) {
    return { success: false, error: 'Cannot delete the active config. Switch to another config first.' };
  }

  jaw.configs = jaw.configs.filter(c => c.id !== configId);
  fileConfig.jawAnimation = jaw;
  await writeJsonAtomic(configFile, fileConfig);

  characterConfigs.set(String(characterId), flattenJawConfig(jaw));

  return { success: true };
}

/**
 * Set the active jaw config for a character.
 */
async function setActiveJawConfig(characterId, configId) {
  const dataDir = await getCharacterDataDir(characterId);
  const configFile = path.join(dataDir, 'super-powers.json');

  let fileConfig = {};
  try {
    const data = await fs.readFile(configFile, 'utf8');
    fileConfig = JSON.parse(data);
  } catch (_) {
    throw new Error('Config file not found');
  }

  let jaw = fileConfig.jawAnimation;
  if (!jaw || !Array.isArray(jaw.configs)) {
    throw new Error('No configs found');
  }

  const exists = jaw.configs.some(c => c.id === configId);
  if (!exists) {
    throw new Error('Config not found: ' + configId);
  }

  jaw.activeConfigId = configId;
  fileConfig.jawAnimation = jaw;
  await writeJsonAtomic(configFile, fileConfig);

  characterConfigs.set(String(characterId), flattenJawConfig(jaw));

  return flattenJawConfig(jaw);
}

/**
 * Generate a unique config ID.
 */
function generateConfigId() {
  return 'config-' + Date.now().toString(36) + Math.random().toString(36).substr(2, 4);
}

/**
 * Get default jaw animation configuration
 */
function getDefaultJawConfig() {
  return {
    enabled: false,
    servoPartId: null,
    sensitivity: 1.0,
    smoothing: 0.6,
    volumeThreshold: 0.02,
    attackTime: 50,  // milliseconds
    releaseTime: 150, // milliseconds
    minAngle: null,   // Will be populated from servo calibration
    maxAngle: null,   // Will be populated from servo calibration
    useBandpassFilter: true,   // 500-2500Hz speech formant filter
    useAGC: true,              // perceptual loudness normalisation (see normalizeSpeechFrames)
    amplitudeMapping: 'perceptual', // 'perceptual' | 'linear' (legacy absolute-RMS mapping)
    dynamicRangeDb: 20,        // dB below the loud reference that maps to fully closed
    mappingGamma: 0.75,        // <1 expands mid-level speech toward the open end
    quantizationLevels: 10,    // discrete jaw positions (5-20)
    preset: 'speech',          // 'speech' | 'music' | 'custom'
    audioLeadTimeMs: 0,        // ms offset: positive = delay jaw (audio leads), negative = advance jaw
    testText: 'The quick brown fox jumped over the lazy dog'
  };
}

/**
 * Load parts safely with error handling.
 * When characterId is provided, loads from the character-specific data
 * directory (data/character-{characterId}/parts.json) instead of relying
 * on the global dataPath in app-config.json.  This ensures that API
 * requests for a specific character always resolve the correct parts file.
 */
async function loadPartsSafe(characterId) {
  try {
    if (characterId != null) {
      const partsFile = path.resolve(`data/character-${characterId}`, 'parts.json');
      const data = await fs.readFile(partsFile, 'utf8');
      const parts = JSON.parse(data);
      return Array.isArray(parts) ? parts : [];
    }
    const parts = await loadPartsFromController();
    return Array.isArray(parts) ? parts : [];
  } catch (error) {
    console.error('Error loading parts:', error);
    return [];
  }
}

/**
 * Extract Min/Max calibration from a part's markers array.
 * Legacy marker-based calibration (parts.json).
 */
function getCalibrationFromMarkers(part) {
  const markers = Array.isArray(part.markers) ? part.markers : [];
  const minMarker = markers.find(m => m.name === 'Min');
  const maxMarker = markers.find(m => m.name === 'Max');
  const calibrated = !!(minMarker && maxMarker);
  return {
    calibrated,
    minAngle: minMarker ? parseFloat(minMarker.value) : null,
    maxAngle: maxMarker ? parseFloat(maxMarker.value) : null
  };
}

/**
 * Resolve Min/Max calibration for a part, preferring the calibration_profiles.json
 * store (source of truth for the /setup/calibration page) and falling back to
 * legacy markers on parts.json. Returns { calibrated, minAngle, maxAngle }.
 */
async function getCalibrationForPart(part) {
  try {
    const store = getCalibrationStore();
    const profile = await store.get(part.id);
    // An auto-generated profile is a PLACEHOLDER, not a calibration: the store
    // stamps every uncalibrated absolute-servo with the full 0-180 mechanical
    // span (server/calibration/router.js:129) and only clears `autoGenerated`
    // once a human actually calibrates. Treating that placeholder as real
    // calibration lets the jaw be driven to 0deg on a part whose hand-set Min/Max
    // markers are 63/131 — past the mechanical stops. Prefer real markers over a
    // placeholder; only trust the profile once it is genuinely calibrated.
    const isPlaceholder = isPlaceholderProfile(profile);
    if (profile && !isPlaceholder && profile.bounds && profile.capability && profile.capability.kind === 'absolute-servo') {
      const { minAngle, maxAngle } = profile.bounds;
      if (typeof minAngle === 'number' && typeof maxAngle === 'number') {
        return { calibrated: true, minAngle, maxAngle };
      }
    }
    if (isPlaceholder) {
      const fromMarkers = getCalibrationFromMarkers(part);
      if (fromMarkers.calibrated) return fromMarkers;
      // No markers either — fall back to the placeholder rather than 0/180 defaults.
      const { minAngle, maxAngle } = profile.bounds || {};
      if (typeof minAngle === 'number' && typeof maxAngle === 'number') {
        return { calibrated: true, minAngle, maxAngle };
      }
    }
  } catch (e) { /* fall through to markers */ }
  return getCalibrationFromMarkers(part);
}

/**
 * Extract PCA9685 channel and address from a servo part config.
 * Returns { channel, address, isPCA9685 }.
 */
function getDaemonParams(part) {
  const cfg = part.config || {};
  const isPCA9685 = part.usePCA9685 === true ||
    part.controllerType === 'pca9685' ||
    cfg.controllerType === 'pca9685';
  if (!isPCA9685) return { channel: null, address: null, isPCA9685: false };
  const channel = cfg.channel != null ? cfg.channel : part.channel;
  let address = (part.pca9685Settings && part.pca9685Settings.address) || cfg.address || 0x40;
  if (typeof address === 'string' && address.startsWith('0x')) address = parseInt(address, 16);
  return { channel: Number(channel), address: Number(address), isPCA9685: true };
}

/**
 * Send jaw angle via daemon (fast path) or fall back to hardwareService.
 * Fire-and-forget — does not await.
 */
function sendJawAngleCmd(jawServo, angleDeg) {
  const { channel, address, isPCA9685 } = getDaemonParams(jawServo);
  if (isPCA9685 && channel != null && jawServoDaemon.isRunning()) {
    jawServoDaemon.sendAngle(channel, angleDeg, address);
  } else {
    // Fallback to full hardware service path
    hardwareService.controlPart(jawServo.id, 'moveToAngle', { angleDeg }).catch(() => {});
  }
}

/**
 * Find jaw servo for character or get available servos.
 * Reads calibration from part markers (unified calibration).
 */
async function getAvailableServos(characterId = null) {
  try {
    const parts = await loadPartsSafe(characterId);

    // Filter to servos only (optionally for a specific character)
    const servos = parts.filter(p => {
      if (String(p.type).toLowerCase() !== 'servo') return false;
      // When parts come from a character-specific data directory they lack
      // characterId — treat them as belonging to the requested character.
      if (characterId != null && p.characterId != null && String(p.characterId) !== String(characterId)) return false;
      return true;
    });

    const servoInfo = await Promise.all(servos.map(async servo => {
      const { calibrated, minAngle, maxAngle } = await getCalibrationForPart(servo);
      return {
        ...servo,
        calibrated,
        minAngle,
        maxAngle,
        isJawCandidate: String(servo.name || '').toLowerCase().includes('jaw')
      };
    }));

    // Sort by jaw candidates first, then by calibrated status
    return servoInfo.sort((a, b) => {
      if (a.isJawCandidate && !b.isJawCandidate) return -1;
      if (!a.isJawCandidate && b.isJawCandidate) return 1;
      if (a.calibrated && !b.calibrated) return -1;
      if (!a.calibrated && b.calibrated) return 1;
      return 0;
    });

  } catch (error) {
    console.error('Error getting available servos:', error);
    return [];
  }
}

/**
 * Load calibration guardrails (Min/Max) from part markers.
 * Looks up the part by ID and reads its markers array.
 */
async function loadCalibrationGuardrails(servoPartId, characterId) {
  try {
    const parts = await loadPartsSafe(characterId);
    const part = parts.find(p => String(p.id) === String(servoPartId));
    if (!part) return { minAngle: null, maxAngle: null };
    return await getCalibrationForPart(part);
  } catch (error) {
    console.warn('Could not load calibration guardrails:', error.message);
    return { minAngle: null, maxAngle: null };
  }
}

/* ---------------------------------------------------------------------------
 * Perceptual loudness mapping
 *
 * Raw RMS is a terrible drive signal for a jaw. Two reasons:
 *
 *  1. It is linear in pressure while hearing (and our sense of "how wide is
 *     that mouth open") is roughly logarithmic. A linear map spends most of
 *     the servo's travel on the top 6dB that speech almost never reaches.
 *  2. Its absolute scale is set by the voice, the TTS model and the network
 *     stream, not by the character. Conversational speech from the agent sits
 *     around RMS 0.05-0.25, so `amplitude * sensitivity` with sensitivity=1
 *     mapped onto a 63-131deg jaw produced a measured maximum of 77.5deg —
 *     21.8% of the calibrated travel. The mouth barely parted.
 *
 * The fix is to stop treating RMS as an absolute and normalise it against how
 * loud THIS speaker is being right now: convert to dBFS, track a rolling high
 * percentile of recent voiced frames as the "shouting" reference, place the
 * floor a fixed dynamic range below it, and map that span across the whole
 * calibrated travel with a gentle expansion curve.
 *
 * The reference is asymmetric on purpose — it rises quickly so a sudden loud
 * line does not clip for a second, and falls slowly so the quiet tail of a
 * sentence does not get amplified into a gaping mouth.
 *
 * Character-independent: every parameter comes from the character's own jaw
 * config, and all state is keyed by characterId.
 * ------------------------------------------------------------------------- */

const LOUDNESS_WINDOW_FRAMES = 80;   // 4s at 50ms — spans a sentence, not a whole turn
const LOUDNESS_PERCENTILE = 0.90;    // "loud for this utterance", robust to one plosive
const SILENCE_DB = -60;              // below this a frame is silence, not quiet speech
const REF_RISE = 0.35;               // EMA weight when the reference must climb
const REF_FALL = 0.03;               // ...and when it decays
const UTTERANCE_GAP_MS = 700;        // silence longer than this starts a new utterance
const DEFAULT_DYNAMIC_RANGE_DB = 20; // speech span below the loud reference
const DEFAULT_MAPPING_GAMMA = 0.75;  // <1 expands mid-level speech toward open

const loudnessState = new Map();

function _percentile(sortedValues, p) {
  if (sortedValues.length === 0) return null;
  const idx = Math.min(sortedValues.length - 1,
    Math.max(0, Math.round((sortedValues.length - 1) * p)));
  return sortedValues[idx];
}

/**
 * Shared dB -> 0..1 mapping used by both the streaming and offline paths so the
 * jaw behaves identically whether it is driven by the realtime agent or by a
 * pre-rendered TTS file.
 */
function _shapeFromDb(db, refDb, rangeDb, gamma) {
  const floorDb = refDb - rangeDb;
  if (refDb <= floorDb) return 0;
  const norm = (db - floorDb) / (refDb - floorDb);
  if (norm <= 0) return 0;
  if (norm >= 1) return 1;
  return Math.pow(norm, gamma);
}

/**
 * Causal, per-character normalisation of one RMS frame.
 * Returns a 0..1 "openness" that already accounts for how loud this speaker has
 * been over the last few seconds. Call this on the RAW frame RMS, before
 * smoothing — smoothing a normalised signal is correct, normalising a smoothed
 * one bakes in the lag.
 */
function normalizeSpeechAmplitude(characterId, rms, config = {}) {
  // Escape hatch: preserve the old absolute mapping for anyone who tuned to it.
  if (config.amplitudeMapping === 'linear') return rms;

  const cid = String(characterId);
  const now = Date.now();
  let st = loudnessState.get(cid);
  if (!st) {
    st = { window: [], refDb: null, lastVoiceMs: 0 };
    loudnessState.set(cid, st);
  }

  const db = 20 * Math.log10(Math.max(rms, 1e-6));

  if (db < SILENCE_DB) {
    // Silence tells us nothing about how loud the voice is — never let it drag
    // the reference down, or the first word after a pause blows the jaw open.
    return 0;
  }

  // A long gap means a new utterance: drop the sample window so the new line is
  // normalised on its own terms, but keep refDb as the prior so the opening
  // syllable is already in the right ballpark instead of guessing from one frame.
  if (st.lastVoiceMs && (now - st.lastVoiceMs) > UTTERANCE_GAP_MS) {
    st.window.length = 0;
  }
  st.lastVoiceMs = now;

  st.window.push(db);
  if (st.window.length > LOUDNESS_WINDOW_FRAMES) st.window.shift();

  const target = _percentile([...st.window].sort((a, b) => a - b), LOUDNESS_PERCENTILE);
  if (st.refDb === null) st.refDb = target;
  else {
    const alpha = target > st.refDb ? REF_RISE : REF_FALL;
    st.refDb = st.refDb + alpha * (target - st.refDb);
  }

  const rangeDb = config.dynamicRangeDb || DEFAULT_DYNAMIC_RANGE_DB;
  const gamma = config.mappingGamma || DEFAULT_MAPPING_GAMMA;
  return _shapeFromDb(db, st.refDb, rangeDb, gamma);
}

/**
 * Batch variant for the offline pre-analysis path, where the whole utterance is
 * already in hand. Uses the exact percentile of the file rather than a causal
 * estimate, which is strictly better when it is available.
 */
function normalizeSpeechFrames(rmsFrames, config = {}) {
  if (config.amplitudeMapping === 'linear') return rmsFrames.slice();

  const voiced = [];
  const dbFrames = new Array(rmsFrames.length);
  for (let i = 0; i < rmsFrames.length; i++) {
    const db = 20 * Math.log10(Math.max(rmsFrames[i], 1e-6));
    dbFrames[i] = db;
    if (db >= SILENCE_DB) voiced.push(db);
  }
  if (voiced.length === 0) return rmsFrames.map(() => 0);

  const refDb = _percentile(voiced.sort((a, b) => a - b), LOUDNESS_PERCENTILE);
  const rangeDb = config.dynamicRangeDb || DEFAULT_DYNAMIC_RANGE_DB;
  const gamma = config.mappingGamma || DEFAULT_MAPPING_GAMMA;

  return dbFrames.map(db => (db < SILENCE_DB ? 0 : _shapeFromDb(db, refDb, rangeDb, gamma)));
}

/** Drop per-character loudness state (session teardown). */
function resetLoudnessState(characterId) {
  loudnessState.delete(String(characterId));
}

/**
 * Calculate jaw angle based on audio amplitude with calibration guardrails.
 * Applies attack/release envelope when attackTime or releaseTime are configured.
 */
function calculateJawAngle(amplitude, config, guardrails = {}, characterId) {
  const minAngle = guardrails.minAngle ?? config.minAngle ?? 0;
  const maxAngle = guardrails.maxAngle ?? config.maxAngle ?? 180;

  // Apply volume threshold
  if (amplitude < config.volumeThreshold) {
    var rawTarget = minAngle;
  } else {
    // Apply sensitivity
    const sensitiveAmplitude = Math.min(1.0, amplitude * config.sensitivity);
    const angleRange = maxAngle - minAngle;
    rawTarget = minAngle + (sensitiveAmplitude * angleRange);
    rawTarget = Math.max(minAngle, Math.min(maxAngle, rawTarget));
  }

  // Apply attack/release envelope if characterId is provided
  if (characterId) {
    const now = Date.now();
    const env = envelopeState.get(String(characterId)) || { lastAngle: minAngle, lastTime: now };
    const dt = Math.max(1, now - env.lastTime); // ms since last update

    if (rawTarget > env.lastAngle) {
      // Opening — apply attack ramp
      const attackTime = config.attackTime || 50;
      const maxDelta = ((maxAngle - minAngle) * dt) / Math.max(1, attackTime);
      rawTarget = Math.min(rawTarget, env.lastAngle + maxDelta);
    } else if (rawTarget < env.lastAngle) {
      // Closing — apply release ramp
      const releaseTime = config.releaseTime || 150;
      const maxDelta = ((maxAngle - minAngle) * dt) / Math.max(1, releaseTime);
      rawTarget = Math.max(rawTarget, env.lastAngle - maxDelta);
    }

    rawTarget = Math.max(minAngle, Math.min(maxAngle, rawTarget));
    env.lastAngle = rawTarget;
    env.lastTime = now;
    envelopeState.set(String(characterId), env);
  }

  return rawTarget;
}

/**
 * Apply smoothing to amplitude values
 */
function applySmoothingToAmplitude(characterId, currentAmplitude, config) {
  const state = audioMonitoringState.get(String(characterId)) || {
    isMonitoring: false,
    lastAmplitude: 0,
    smoothedAmplitude: 0
  };

  // Apply exponential smoothing
  const alpha = 1.0 - config.smoothing;
  state.smoothedAmplitude = (alpha * currentAmplitude) + (config.smoothing * state.smoothedAmplitude);
  state.lastAmplitude = currentAmplitude;

  audioMonitoringState.set(String(characterId), state);

  return state.smoothedAmplitude;
}

/**
 * Drive jaw servo based on amplitude with calibration guardrails
 */
async function driveJawFromAmplitude(characterId, amplitude) {
  try {
    const config = characterConfigs.get(String(characterId)) || await readJawConfig(characterId);

    if (!config.enabled || !config.servoPartId) {
      return { success: false, message: 'Jaw animation disabled or no servo configured' };
    }

    // Get servo part (compare as strings for consistency)
    const parts = await loadPartsSafe(characterId);
    const jawServo = parts.find(p => String(p.id) === String(config.servoPartId));

    if (!jawServo) {
      return { success: false, message: 'Jaw servo not found' };
    }

    // Load calibration guardrails (Min/Max markers)
    const guardrails = await loadCalibrationGuardrails(config.servoPartId, characterId);

    // NOTE: deliberately NOT perceptually normalised. Every caller of this
    // primitive passes a commanded openness (a slider, a test level, an explicit
    // 0 to close), not a measured RMS — normalising intent would turn "open the
    // jaw halfway" into "open it fully". The paths that hold real audio energy
    // (driveJawFromPcmStream, preAnalyzeAudio, driveJawFromAudioBuffer) normalise
    // before they get here.

    // Apply smoothing
    const smoothedAmplitude = applySmoothingToAmplitude(characterId, amplitude, config);

    // Calculate target angle with guardrails and attack/release envelope
    const targetAngle = calculateJawAngle(smoothedAmplitude, config, guardrails, characterId);

    // Move servo — use daemon fast path to avoid PCA9685 re-init that glitches other channels
    sendJawAngleCmd(jawServo, targetAngle);

    return {
      success: true,
      amplitude: amplitude,
      smoothedAmplitude: smoothedAmplitude,
      targetAngle: targetAngle,
      guardrails: guardrails
    };

  } catch (error) {
    console.error('Error driving jaw from amplitude:', error);
    return { success: false, message: error.message };
  }
}

/**
 * Test jaw servo movement
 */
async function testJawMovement(characterId) {
  try {
    const config = await readJawConfig(characterId);

    if (!config.servoPartId) {
      throw new Error('No jaw servo configured');
    }

    // Get servo part (compare as strings)
    const parts = await loadPartsSafe(characterId);
    const jawServo = parts.find(p => String(p.id) === String(config.servoPartId));

    if (!jawServo) {
      throw new Error('Jaw servo not found');
    }

    // Use calibration markers from the part for accurate test range
    const { calibrated, minAngle: calMin, maxAngle: calMax } = getCalibrationFromMarkers(jawServo);
    const minAngle = calMin ?? config.minAngle ?? 0;
    const maxAngle = calMax ?? config.maxAngle ?? 180;
    const midAngle = (minAngle + maxAngle) / 2;

    // Test sequence: min -> max -> mid -> min
    const testSequence = [
      { angle: minAngle, duration: 500 },
      { angle: maxAngle, duration: 500 },
      { angle: midAngle, duration: 500 },
      { angle: minAngle, duration: 500 }
    ];

    // Try daemon fast path
    const { channel, address, isPCA9685 } = getDaemonParams(jawServo);
    const useDaemon = isPCA9685 && channel != null;
    if (useDaemon) {
      try { await jawServoDaemon.ensureRunning(); } catch (_) { /* fallback below */ }
    }

    for (const step of testSequence) {
      if (useDaemon && jawServoDaemon.isRunning()) {
        jawServoDaemon.sendAngle(channel, step.angle, address);
      } else {
        await hardwareService.controlPart(jawServo.id, 'moveToAngle', {
          angleDeg: step.angle
        });
      }

      // Wait for movement
      await new Promise(resolve => setTimeout(resolve, step.duration));
    }

    return { success: true, message: 'Jaw test completed successfully' };

  } catch (error) {
    console.error('Error testing jaw movement:', error);
    return { success: false, message: error.message };
  }
}

/**
 * Start audio monitoring for a character
 */
async function startAudioMonitoring(characterId) {
  const state = audioMonitoringState.get(String(characterId)) || {
    isMonitoring: false,
    lastAmplitude: 0,
    smoothedAmplitude: 0
  };

  state.isMonitoring = true;
  audioMonitoringState.set(String(characterId), state);

  return { success: true, message: 'Audio monitoring started' };
}

/**
 * Stop audio monitoring for a character
 */
async function stopAudioMonitoring(characterId) {
  const state = audioMonitoringState.get(String(characterId));

  if (state) {
    state.isMonitoring = false;
    audioMonitoringState.set(String(characterId), state);
  }

  return { success: true, message: 'Audio monitoring stopped' };
}

/**
 * Get current audio monitoring state
 */
function getAudioMonitoringState(characterId) {
  const state = audioMonitoringState.get(String(characterId)) || {
    isMonitoring: false,
    lastAmplitude: 0,
    smoothedAmplitude: 0
  };

  return state;
}

/**
 * Estimate amplitude from text (for non-audio sources)
 */
function estimateAmplitudeFromText(text) {
  // Simple heuristic based on text characteristics
  const len = Math.min(String(text || '').length, 400);
  const vowels = (text.match(/[aeiouAEIOU]/g) || []).length;
  const punctuation = (text.match(/[!?,.;:]/g) || []).length;

  const score = len * 0.3 + vowels * 0.8 + punctuation * 1.5;
  const normalized = Math.max(0.1, Math.min(1.0, score / 100));

  return normalized;
}

/**
 * Initialize jaw animation for a character (called when ElevenLabs audio starts)
 */
async function initializeForCharacter(characterId) {
  try {
    // Load and cache configuration
    const config = await readJawConfig(characterId);
    characterConfigs.set(String(characterId), config);

    // Initialize monitoring state
    if (config.enabled) {
      await startAudioMonitoring(characterId);
    }

    return config;
  } catch (error) {
    console.error('Error initializing jaw animation for character:', error);
    return null;
  }
}

/**
 * Test servo position for advanced servo control
 */
async function testServoPosition(characterId, servoPartId, position) {
  try {
    console.log(`🔧 Testing servo ${servoPartId} at position ${position}° for character ${characterId}`);

    // Validate parameters
    if (!characterId || !servoPartId || position === undefined) {
      return {
        success: false,
        error: 'Missing required parameters'
      };
    }

    // Validate position range
    const pos = parseInt(position);
    if (pos < 0 || pos > 180) {
      return {
        success: false,
        error: 'Position must be between 0 and 180 degrees'
      };
    }

    // Get the servo part
    const parts = await loadPartsSafe(characterId);
    const servoPart = parts.find(p => String(p.id) === String(servoPartId) && p.type === 'servo');

    if (!servoPart) {
      return {
        success: false,
        error: 'Servo part not found'
      };
    }

    // Use hardware service to move servo via controlPart
    const result = await hardwareService.controlPart(servoPart.id, 'moveToAngle', {
      angleDeg: pos
    });

    console.log(`✅ Servo ${servoPartId} moved to ${pos}°`);
    return {
      success: true,
      message: `Servo moved to ${pos}°`,
      position: pos,
      servoPartId: servoPartId,
      servoResult: result
    };

  } catch (error) {
    console.error('Error testing servo position:', error);
    return {
      success: false,
      error: error.message
    };
  }
}

/**
 * Test jaw animation with an audio file
 * Combines audio playback with synchronized jaw movement
 */
async function testJawWithAudio(characterId, audioFile, jawConfig) {
  try {
    console.log(`🎵🦷 Testing jaw animation with audio "${audioFile.title}" for character ${characterId}`);

    // Validate jaw configuration
    if (!jawConfig.enabled || !jawConfig.servoPartId) {
      return {
        success: false,
        error: 'Jaw animation must be enabled with a servo selected'
      };
    }

    // Get the servo to make sure it exists and is calibrated
    const servos = await getAvailableServos(characterId);
    const jawServo = servos.find(s => s.id === jawConfig.servoPartId);

    if (!jawServo) {
      return {
        success: false,
        error: 'Selected jaw servo not found'
      };
    }

    if (!jawServo.calibrated) {
      return {
        success: false,
        error: 'Selected jaw servo must be calibrated first'
      };
    }

    // Initialize jaw animation for this character
    await initializeForCharacter(characterId);

    // Start a simple jaw test sequence while indicating audio context
    console.log(`🎵 Testing jaw movement in context of audio "${audioFile.title}"`);

    // Run a basic test movement (the actual audio-jaw sync happens
    // via the audio integration service during real playback)
    const testResult = await testJawMovement(characterId);

    return {
      success: testResult.success,
      message: testResult.success
        ? `Jaw animation test completed for "${audioFile.title}"`
        : testResult.message,
      audioId: audioFile.id,
      audioTitle: audioFile.title,
      characterId: characterId
    };

  } catch (error) {
    console.error('Error testing jaw with audio:', error);
    return {
      success: false,
      error: error.message
    };
  }
}

/**
 * Move the jaw servo to a specific angle directly.
 * This is the core primitive used by both driveJawFromAmplitude and testJawMovement.
 * Clamps angle to calibrated Min/Max range.
 */
async function moveJawToAngle(characterId, angleDeg) {
  try {
    const config = characterConfigs.get(String(characterId)) || await readJawConfig(characterId);
    if (!config.servoPartId) {
      return { success: false, message: 'No jaw servo configured' };
    }

    const parts = await loadPartsSafe(characterId);
    const jawServo = parts.find(p => String(p.id) === String(config.servoPartId));
    if (!jawServo) {
      return { success: false, message: 'Jaw servo not found' };
    }

    // Clamp to calibrated range
    const { minAngle, maxAngle } = getCalibrationFromMarkers(jawServo);
    const lo = minAngle ?? 0;
    const hi = maxAngle ?? 180;
    const clamped = Math.max(lo, Math.min(hi, angleDeg));

    // Use daemon fast path when available
    const { channel, address, isPCA9685 } = getDaemonParams(jawServo);
    if (isPCA9685 && channel != null && jawServoDaemon.isRunning()) {
      jawServoDaemon.sendAngle(channel, clamped, address);
      return { success: true, angleDeg: clamped };
    }

    const result = await hardwareService.controlPart(jawServo.id, 'moveToAngle', {
      angleDeg: clamped
    });

    return { success: true, angleDeg: clamped, servoResult: result };
  } catch (error) {
    console.error('Error moving jaw to angle:', error);
    return { success: false, message: error.message };
  }
}

/**
 * Drive jaw from text content — estimates amplitude from text and moves jaw.
 * Used by conversation route for AI speech jaw sync.
 */
async function driveFromText({ characterId, text }) {
  try {
    const config = characterConfigs.get(String(characterId)) || await readJawConfig(characterId);
    if (!config.enabled || !config.servoPartId) return;

    const amplitude = estimateAmplitudeFromText(text);
    // Normalize the 0-1 amplitude and drive a brief open-close pattern
    const normalizedAmp = Math.max(0, Math.min(1, amplitude));

    // Drive open
    await driveJawFromAmplitude(characterId, normalizedAmp);
    // Brief hold
    await new Promise(resolve => setTimeout(resolve, 200));
    // Drive closed
    await driveJawFromAmplitude(characterId, 0);
  } catch (_) {
    // Best-effort jaw sync
  }
}

/**
 * Pre-analyze an audio buffer into a complete jaw timeline.
 * Uses bandpass filter (500-2500Hz speech formants), AGC, quantization.
 *
 * @param {Buffer} audioBuffer - Raw audio data (MP3/WAV/etc)
 * @param {string} contentType - MIME type of audio
 * @param {object} config - Jaw animation config
 * @param {object} guardrails - { minAngle, maxAngle }
 * @returns {Promise<{frames: Array<{time, angle, amplitude}>, duration, peakRms}>}
 */
async function preAnalyzeAudio(audioBuffer, contentType, config, guardrails) {
  const SAMPLE_RATE = 16000;
  const FRAME_DURATION_MS = 20; // Match PCA9685 50Hz PWM rate
  const FRAME_SIZE = SAMPLE_RATE * (FRAME_DURATION_MS / 1000) * 2; // 640 bytes

  const minAngle = guardrails.minAngle ?? config.minAngle ?? 0;
  const maxAngle = guardrails.maxAngle ?? config.maxAngle ?? 180;
  const angleRange = maxAngle - minAngle;
  const useBandpass = config.useBandpassFilter !== false;
  const useAGC = config.useAGC !== false;
  const levels = Math.max(2, Math.min(20, config.quantizationLevels || 10));

  return new Promise((resolve, reject) => {
    // Build ffmpeg args: optional bandpass filter for speech formants
    const ffmpegArgs = ['-i', 'pipe:0'];
    if (useBandpass) {
      // Bandpass 500-2500Hz (speech formant range, center=1500Hz, width=2000Hz)
      ffmpegArgs.push('-af', 'bandpass=f=1500:width_type=h:w=2000');
    }
    ffmpegArgs.push('-f', 's16le', '-ar', String(SAMPLE_RATE), '-ac', '1', 'pipe:1');

    const ffmpeg = spawn('ffmpeg', ffmpegArgs, { stdio: ['pipe', 'pipe', 'pipe'] });
    const pcmChunks = [];

    ffmpeg.stdout.on('data', (chunk) => pcmChunks.push(chunk));
    ffmpeg.stderr.on('data', () => {}); // suppress

    ffmpeg.on('error', (err) => {
      reject(new Error(`ffmpeg error: ${err.message}`));
    });

    ffmpeg.on('close', (code) => {
      const pcmBuffer = Buffer.concat(pcmChunks);
      if (pcmBuffer.length === 0) {
        resolve({ frames: [], duration: 0, peakRms: 0 });
        return;
      }

      // Compute RMS per frame
      const rmsFrames = [];
      for (let offset = 0; offset < pcmBuffer.length; offset += FRAME_SIZE) {
        const end = Math.min(offset + FRAME_SIZE, pcmBuffer.length);
        const frameData = pcmBuffer.subarray(offset, end);
        let sum = 0;
        const sampleCount = Math.floor(frameData.length / 2);
        for (let i = 0; i < sampleCount; i++) {
          const sample = frameData.readInt16LE(i * 2);
          sum += sample * sample;
        }
        const rms = sampleCount > 0 ? Math.sqrt(sum / sampleCount) / 32768 : 0;
        rmsFrames.push(rms);
      }

      let peakRms = 0;
      for (const r of rmsFrames) { if (r > peakRms) peakRms = r; }

      // Perceptual normalisation, same math the streaming path uses, but with
      // the whole utterance in hand so the reference is an exact percentile.
      // This replaces the old peak-AGC: dividing by the single loudest frame let
      // one plosive squash the entire rest of the line, and it stayed linear in
      // pressure, so normal speech still only parted the jaw.
      const levels_ = (useAGC === false)
        ? rmsFrames.slice()
        : normalizeSpeechFrames(rmsFrames, config);

      // Build timeline with angle mapping, envelope, and quantization
      const frames = [];
      let prevAngle = minAngle;
      let prevTime = 0;

      for (let i = 0; i < rmsFrames.length; i++) {
        const time = i * FRAME_DURATION_MS;
        const rawAmp = levels_[i];

        // Volume threshold
        let amplitude;
        if (rawAmp < (config.volumeThreshold || 0.02)) {
          amplitude = 0;
        } else {
          amplitude = Math.min(1.0, rawAmp * (config.sensitivity || 1.0));
        }

        // Map to angle
        let targetAngle = amplitude > 0
          ? minAngle + (amplitude * angleRange)
          : minAngle;

        // Attack/release envelope
        const dt = i === 0 ? FRAME_DURATION_MS : FRAME_DURATION_MS;
        if (targetAngle > prevAngle) {
          const attackTime = config.attackTime || 50;
          const maxDelta = (angleRange * dt) / Math.max(1, attackTime);
          targetAngle = Math.min(targetAngle, prevAngle + maxDelta);
        } else if (targetAngle < prevAngle) {
          const releaseTime = config.releaseTime || 150;
          const maxDelta = (angleRange * dt) / Math.max(1, releaseTime);
          targetAngle = Math.max(targetAngle, prevAngle - maxDelta);
        }

        // Clamp
        targetAngle = Math.max(minAngle, Math.min(maxAngle, targetAngle));

        // Quantize to N discrete positions
        const step = angleRange / (levels - 1);
        const quantized = step > 0
          ? minAngle + Math.round((targetAngle - minAngle) / step) * step
          : minAngle;

        frames.push({
          time,
          angle: Math.max(minAngle, Math.min(maxAngle, quantized)),
          amplitude: rawAmp
        });

        prevAngle = quantized;
      }

      const duration = rmsFrames.length * FRAME_DURATION_MS;
      resolve({ frames, duration, peakRms });
    });

    ffmpeg.stdin.write(audioBuffer);
    ffmpeg.stdin.end();
  });
}

/**
 * Play audio with synchronized jaw movement.
 * Pre-analyzes the complete audio, then plays audio and jaw timeline in parallel.
 * This eliminates the audio/jaw desync of the old fire-and-forget approach.
 *
 * @param {string|number} characterId
 * @param {Buffer} audioBuffer
 * @param {string} contentType
 * @param {object} [options] - { skipAudio, preAnalysis } skipAudio skips audio playback; preAnalysis reuses pre-computed frames
 * @returns {Promise<{success, duration, frameCount, timeline?}>}
 */
async function playWithJawSync(characterId, audioBuffer, contentType, options = {}) {
  // Cancel any existing drive for this character
  cancelJawDrive(characterId);

  const cid = String(characterId);
  const config = characterConfigs.get(cid) || await readJawConfig(characterId);
  if (!config.enabled || !config.servoPartId) {
    return { success: false, message: 'Jaw animation disabled or no servo configured' };
  }

  const parts = await loadPartsSafe(characterId);
  const jawServo = parts.find(p => String(p.id) === String(config.servoPartId));
  if (!jawServo) {
    return { success: false, message: 'Jaw servo not found' };
  }

  const guardrails = await loadCalibrationGuardrails(config.servoPartId, characterId);
  const closedAngle = guardrails.minAngle ?? config.minAngle ?? 0;

  // Use pre-computed analysis if provided, otherwise analyze now
  let analysis;
  if (options.preAnalysis && options.preAnalysis.frames && options.preAnalysis.frames.length > 0) {
    analysis = options.preAnalysis;
  } else {
    try {
      analysis = await preAnalyzeAudio(audioBuffer, contentType, config, guardrails);
    } catch (err) {
      console.error('Pre-analysis failed:', err.message);
      return { success: false, message: `Pre-analysis failed: ${err.message}` };
    }
  }

  if (analysis.frames.length === 0) {
    return { success: false, message: 'No audio frames to animate' };
  }

  // Ensure daemon is running — await fully before starting audio
  try {
    await jawServoDaemon.ensureRunning();
  } catch (daemonErr) {
    console.warn('Jaw servo daemon not available, using hardwareService fallback (slower):', daemonErr.message);
  }

  // Set up drive state for monitoring/cancel
  const driveState = { cancelled: false, timer: null, amplitude: 0, angle: closedAngle };
  activeJawDrives.set(cid, driveState);
  const monState = audioMonitoringState.get(cid) || { isMonitoring: false, lastAmplitude: 0, smoothedAmplitude: 0 };
  monState.isMonitoring = true;
  audioMonitoringState.set(cid, monState);

  // Echo suppression: suppress mic for audio duration + buffer
  try {
    if (analysis.duration > 0) {
      const { default: wsService } = await import('./elevenLabsWebSocketService.js');
      wsService.suppressMicForCharacter(characterId, analysis.duration + 1000);
    }
  } catch (_) { /* best-effort */ }

  // Audio sync offset: positive = audio leads (delay jaw), negative = jaw leads (delay audio)
  const audioLeadTimeMs = Math.max(-1000, Math.min(1000, config.audioLeadTimeMs || 0));
  console.log(`[jaw-sync] characterId=${cid} audioLeadTimeMs=${audioLeadTimeMs} sensitivity=${config.sensitivity} smoothing=${config.smoothing} frames=${analysis.frames.length} duration=${analysis.duration}ms`);

  // Pre-import and pre-warm playback service before the synchronized start.
  // This ensures mpg123 is already spawned and ready so writing the buffer
  // produces sound with minimal latency (~10-50ms instead of ~300-500ms).
  let serverPlaybackService = null;
  if (!options.skipAudio) {
    try {
      serverPlaybackService = (await import('./serverPlaybackService.js')).default;
      // Pre-warm: ensure mpg123 process is spawned and ready before sync start
      await serverPlaybackService.warmUpStream({ characterId });
    } catch (err) {
      console.error('Could not import/warm playback service:', err.message);
    }
  }

  const syncStartTime = Date.now();

  // Synchronized start: launch audio and jaw timeline with offset compensation
  return new Promise((resolve) => {
    function startJawTimeline() {
      console.log(`[jaw-sync] jaw timeline started at T+${Date.now() - syncStartTime}ms`);
      const startTime = Date.now();
      let frameIndex = 0;

      function scheduleNext() {
        if (driveState.cancelled || frameIndex >= analysis.frames.length) {
          // Done — close jaw
          sendJawAngleCmd(jawServo, closedAngle);
          driveState.amplitude = 0;
          driveState.angle = closedAngle;
          const ms = audioMonitoringState.get(cid);
          if (ms) { ms.isMonitoring = false; ms.lastAmplitude = 0; ms.smoothedAmplitude = 0; }
          activeJawDrives.delete(cid);
          resolve({ success: true, duration: analysis.duration, frameCount: analysis.frames.length });
          return;
        }

        const frame = analysis.frames[frameIndex];

        // Update state for polling endpoint
        driveState.amplitude = frame.amplitude;
        driveState.angle = frame.angle;
        const ms = audioMonitoringState.get(cid);
        if (ms) { ms.lastAmplitude = frame.amplitude; ms.smoothedAmplitude = frame.amplitude; }

        // Send angle to servo
        sendJawAngleCmd(jawServo, frame.angle);

        frameIndex++;

        // Schedule next frame relative to startTime to self-correct for drift
        if (frameIndex < analysis.frames.length) {
          const nextTime = analysis.frames[frameIndex].time;
          const elapsed = Date.now() - startTime;
          const delay = Math.max(0, nextTime - elapsed);
          driveState.timer = setTimeout(scheduleNext, delay);
        } else {
          // Schedule final cleanup after last frame's duration
          driveState.timer = setTimeout(scheduleNext, 20);
        }
      }

      scheduleNext();
    }

    function startAudioPlayback() {
      console.log(`[jaw-sync] audio playback started at T+${Date.now() - syncStartTime}ms`);
      if (serverPlaybackService) {
        // Use writeMp3Stream directly for minimal latency (stream is pre-warmed)
        serverPlaybackService.writeMp3Stream(audioBuffer, {
          characterId
        }).catch((err) => {
          // Fall back to full playback path
          serverPlaybackService.playBufferOnCharacterSpeaker(audioBuffer, {
            contentType, characterId
          }).catch((err2) => {
            console.error('Jaw sync audio playback error:', err2.message);
          });
        });
      }
    }

    if (audioLeadTimeMs > 0) {
      // Audio leads: start audio now, delay jaw start
      startAudioPlayback();
      driveState.timer = setTimeout(startJawTimeline, audioLeadTimeMs);
    } else if (audioLeadTimeMs < 0) {
      // Jaw leads: start jaw now, delay audio start
      startJawTimeline();
      setTimeout(startAudioPlayback, Math.abs(audioLeadTimeMs));
    } else {
      // No offset: start both simultaneously
      startAudioPlayback();
      startJawTimeline();
    }
  });
}

/**
 * Drive jaw servo from an audio buffer (MP3/WAV).
 * Decodes to raw PCM via ffmpeg, computes RMS per 50ms frame,
 * and drives the jaw synchronously each frame (ChatterPi-style).
 *
 * Key design: all angle computation happens synchronously in the
 * frame loop — config, parts and guardrails are preloaded once.
 * The servo command is fired async but we don't wait for it.
 * This eliminates the race condition where driveState.angle was
 * only set inside an async .then() callback.
 *
 * Returns a Promise that resolves when playback is complete.
 */
async function driveJawFromAudioBuffer(characterId, audioBuffer, contentType) {
  // Cancel any existing drive for this character
  cancelJawDrive(characterId);

  const cid = String(characterId);
  const driveState = { cancelled: false, timer: null, amplitude: 0, angle: 0 };
  activeJawDrives.set(cid, driveState);

  // Update monitoring state to indicate active playback
  const monState = audioMonitoringState.get(cid) || { isMonitoring: false, lastAmplitude: 0, smoothedAmplitude: 0 };
  monState.isMonitoring = true;
  audioMonitoringState.set(cid, monState);

  // --- Preload all async dependencies ONCE before the frame loop ---
  // This is inspired by ChatterPi's approach: everything the audio
  // callback needs is resolved up-front so the per-frame work is
  // purely synchronous (compute angle, set state, fire servo).
  const config = characterConfigs.get(cid) || await readJawConfig(characterId);
  if (!config.enabled || !config.servoPartId) {
    activeJawDrives.delete(cid);
    return { success: false, message: 'Jaw animation disabled or no servo configured' };
  }

  const parts = await loadPartsSafe(characterId);
  const jawServo = parts.find(p => String(p.id) === String(config.servoPartId));
  if (!jawServo) {
    activeJawDrives.delete(cid);
    return { success: false, message: 'Jaw servo not found' };
  }

  const guardrails = await loadCalibrationGuardrails(config.servoPartId, characterId);
  const closedAngle = guardrails.minAngle ?? config.minAngle ?? 0;

  // Pre-warm the daemon so servo commands are <1ms
  try { await jawServoDaemon.ensureRunning(); } catch (_) { /* fallback to hardwareService */ }

  return new Promise((resolve, reject) => {
    // Decode audio to raw PCM: signed 16-bit little-endian, 16kHz, mono
    const ffmpeg = spawn('ffmpeg', [
      '-i', 'pipe:0',
      '-f', 's16le',
      '-ar', '16000',
      '-ac', '1',
      'pipe:1'
    ], { stdio: ['pipe', 'pipe', 'pipe'] });

    const pcmChunks = [];

    ffmpeg.stdout.on('data', (chunk) => {
      pcmChunks.push(chunk);
    });

    ffmpeg.stderr.on('data', () => {
      // Suppress ffmpeg stderr noise
    });

    ffmpeg.on('error', (err) => {
      console.error('ffmpeg spawn error:', err.message);
      driveState.cancelled = true;
      activeJawDrives.delete(cid);
      resolve({ success: false, error: err.message });
    });

    ffmpeg.on('close', (code) => {
      if (driveState.cancelled) {
        resolve({ success: false, error: 'Cancelled' });
        return;
      }

      const pcmBuffer = Buffer.concat(pcmChunks);
      if (pcmBuffer.length === 0) {
        activeJawDrives.delete(cid);
        resolve({ success: false, error: 'No PCM data decoded' });
        return;
      }

      // Split into 50ms frames: 16000 Hz * 0.05s * 2 bytes = 1600 bytes per frame
      const FRAME_SIZE = 1600;
      const FRAME_DURATION_MS = 50;
      const frames = [];

      for (let offset = 0; offset < pcmBuffer.length; offset += FRAME_SIZE) {
        const end = Math.min(offset + FRAME_SIZE, pcmBuffer.length);
        const frameData = pcmBuffer.subarray(offset, end);

        // Compute RMS amplitude
        let sum = 0;
        const sampleCount = Math.floor(frameData.length / 2);
        for (let i = 0; i < sampleCount; i++) {
          const sample = frameData.readInt16LE(i * 2);
          sum += sample * sample;
        }
        const rms = sampleCount > 0 ? Math.sqrt(sum / sampleCount) / 32768 : 0;
        frames.push(rms);
      }

      // Same perceptual mapping as every other drive path — the whole buffer is
      // known here, so use the exact-percentile variant.
      const levels = normalizeSpeechFrames(frames, config);

      const totalDuration = frames.length * FRAME_DURATION_MS;
      let frameIndex = 0;

      function nextFrame() {
        if (driveState.cancelled || frameIndex >= frames.length) {
          // Done — close jaw (fire-and-forget servo command)
          sendJawAngleCmd(jawServo, closedAngle);
          driveState.amplitude = 0;
          driveState.angle = closedAngle;
          const ms = audioMonitoringState.get(cid);
          if (ms) {
            ms.isMonitoring = false;
            ms.lastAmplitude = 0;
            ms.smoothedAmplitude = 0;
          }
          activeJawDrives.delete(cid);
          resolve({ success: true, duration: totalDuration, frameCount: frames.length });
          return;
        }

        const amplitude = levels[frameIndex];

        // --- Synchronous angle computation (ChatterPi-style) ---
        // Apply smoothing, threshold, sensitivity, and envelope —
        // all pure math, no async calls needed.
        const smoothedAmplitude = applySmoothingToAmplitude(characterId, amplitude, config);
        const targetAngle = calculateJawAngle(smoothedAmplitude, config, guardrails, characterId);

        // Set state IMMEDIATELY so the polling endpoint always
        // sees the current amplitude and angle — no async gap.
        driveState.amplitude = amplitude;
        driveState.angle = targetAngle;

        // Update monitoring state synchronously
        const ms = audioMonitoringState.get(cid);
        if (ms) {
          ms.lastAmplitude = amplitude;
          ms.smoothedAmplitude = smoothedAmplitude;
        }

        // Fire servo command (daemon: <1ms, fallback: hardwareService)
        sendJawAngleCmd(jawServo, targetAngle);

        frameIndex++;
        driveState.timer = setTimeout(nextFrame, FRAME_DURATION_MS);
      }

      // Begin the frame loop
      nextFrame();
    });

    // Write audio buffer to ffmpeg stdin
    ffmpeg.stdin.write(audioBuffer);
    ffmpeg.stdin.end();
  });
}

/**
 * Streaming jaw drive for the realtime agent path.
 *
 * The agent delivers raw PCM16 @16kHz in chunks whose size is set by the network,
 * not by the audio. Taking one RMS over a whole chunk yields a single jaw update
 * per chunk (measured: 4-6 servo moves across an entire spoken reply), which is
 * not lip sync. This slices each chunk into the same 50ms frames the offline path
 * uses and feeds them to a single per-character timer that drains at the same rate
 * the audio plays, so the jaw tracks speech instead of stepping once per packet.
 *
 * Chunks arrive faster than realtime, so the queue absorbs network jitter; the
 * timer is the clock. Safe to call for every chunk — state is resolved once.
 */
const pcmJawStreams = new Map();
const PCM_JAW_FRAME_BYTES = 1600; // 16000Hz * 0.05s * 2 bytes
const PCM_JAW_FRAME_MS = 50;
const PCM_JAW_MAX_QUEUE = 400;    // ~20s of audio; safety valve against runaway buffering

async function driveJawFromPcmStream(characterId, pcmChunk) {
  const cid = String(characterId);
  if (!pcmChunk || pcmChunk.length === 0) return { success: false, message: 'empty chunk' };

  let stream = pcmJawStreams.get(cid);
  if (!stream) {
    const config = characterConfigs.get(cid) || await readJawConfig(characterId);
    if (!config.enabled || !config.servoPartId) {
      return { success: false, message: 'Jaw animation disabled or no servo configured' };
    }
    const parts = await loadPartsSafe(characterId);
    const jawServo = parts.find(p => String(p.id) === String(config.servoPartId));
    if (!jawServo) return { success: false, message: 'Jaw servo not found' };

    // Same calibrated guardrails the offline path uses — never raw 0/180.
    const guardrails = await loadCalibrationGuardrails(config.servoPartId, characterId);

    stream = {
      queue: [], residual: Buffer.alloc(0), timer: null,
      config, jawServo, guardrails, dropped: 0
    };
    pcmJawStreams.set(cid, stream);
    jawServoDaemon.ensureRunning().catch(() => {});
  }

  // Carry partial frames across chunk boundaries so no audio is lost or duplicated.
  const buf = stream.residual.length ? Buffer.concat([stream.residual, pcmChunk]) : pcmChunk;
  let offset = 0;
  for (; offset + PCM_JAW_FRAME_BYTES <= buf.length; offset += PCM_JAW_FRAME_BYTES) {
    const frame = buf.subarray(offset, offset + PCM_JAW_FRAME_BYTES);
    let sum = 0;
    const sampleCount = frame.length >> 1;
    for (let i = 0; i < sampleCount; i++) {
      const s = frame.readInt16LE(i * 2);
      sum += s * s;
    }
    const rms = sampleCount > 0 ? Math.sqrt(sum / sampleCount) / 32768 : 0;
    // Normalise here, at frame-production time, not at drain time. Chunks arrive
    // faster than realtime, so normalising on the way in makes the rolling
    // reference advance along the AUDIO timeline rather than the network's —
    // frame i is always normalised against frames 0..i of the speech itself,
    // which makes the result independent of arrival jitter.
    const level = normalizeSpeechAmplitude(cid, rms, stream.config);
    if (stream.queue.length < PCM_JAW_MAX_QUEUE) stream.queue.push(level);
    else stream.dropped++;
  }
  stream.residual = buf.subarray(offset);

  if (!stream.timer) _startPcmJawTimer(cid);
  return { success: true, queued: stream.queue.length };
}

function _startPcmJawTimer(cid) {
  const stream = pcmJawStreams.get(cid);
  if (!stream || stream.timer) return;

  const step = () => {
    const s = pcmJawStreams.get(cid);
    if (!s) return;
    if (s.queue.length === 0) {
      // Underrun: speech ended (or the network stalled). Close the jaw to its
      // calibrated minimum and idle — the next chunk restarts the timer.
      const closed = s.guardrails.minAngle ?? s.config.minAngle ?? 0;
      sendJawAngleCmd(s.jawServo, closed);
      const ms = audioMonitoringState.get(cid);
      if (ms) { ms.lastAmplitude = 0; ms.smoothedAmplitude = 0; }
      s.timer = null;
      // End of an utterance: let the head ease home and idle liveliness resume.
      try { speechExpression.stopSpeaking(cid); } catch (_) { /* decorative only */ }
      return;
    }
    const amplitude = s.queue.shift();
    // Same normalised level drives the head, so mouth and head emphasis come
    // from one signal instead of two that merely overlap in time.
    try { speechExpression.noteLevel(cid, amplitude); } catch (_) { /* decorative only */ }
    const smoothed = applySmoothingToAmplitude(cid, amplitude, s.config);
    const angle = calculateJawAngle(smoothed, s.config, s.guardrails, cid);
    sendJawAngleCmd(s.jawServo, angle);
    const ms = audioMonitoringState.get(cid);
    if (ms) { ms.lastAmplitude = amplitude; ms.smoothedAmplitude = smoothed; }
    s.timer = setTimeout(step, PCM_JAW_FRAME_MS);
  };

  // A new drain run is a new spoken utterance — start head co-expression with it.
  // Failures here must never affect speech, so this is fire-and-forget.
  speechExpression.startSpeaking(cid).catch(() => {});

  stream.timer = setTimeout(step, 0);
}

/**
 * Tear down a streaming jaw drive and park the jaw at its calibrated minimum.
 * Must be called on session teardown so no timer outlives the agent socket.
 */
function stopPcmJawStream(characterId) {
  const cid = String(characterId);
  const stream = pcmJawStreams.get(cid);
  if (!stream) return { success: false, message: 'no active pcm jaw stream' };
  if (stream.timer) clearTimeout(stream.timer);
  const closed = stream.guardrails.minAngle ?? stream.config.minAngle ?? 0;
  try { sendJawAngleCmd(stream.jawServo, closed); } catch (_) { /* non-fatal */ }
  pcmJawStreams.delete(cid);
  // The loudness reference belongs to the session that built it — carrying it
  // into the next conversation would normalise the first line against a voice
  // that is no longer speaking.
  resetLoudnessState(cid);
  // Session teardown must leave nothing ticking: this drops every co-expression
  // and idle timer and releases the head claim.
  try { speechExpression.stopAll(cid); } catch (_) { /* non-fatal */ }
  const ms = audioMonitoringState.get(cid);
  if (ms) { ms.isMonitoring = false; ms.lastAmplitude = 0; ms.smoothedAmplitude = 0; }
  return { success: true, dropped: stream.dropped };
}

/**
 * Cancel an active jaw drive for a character.
 * Stops the frame loop and returns jaw to closed position.
 */
function cancelJawDrive(characterId) {
  const cid = String(characterId);
  const state = activeJawDrives.get(cid);
  if (state) {
    state.cancelled = true;
    if (state.timer) {
      clearTimeout(state.timer);
      state.timer = null;
    }
    activeJawDrives.delete(cid);
  }
  // Reset monitoring state
  const ms = audioMonitoringState.get(cid);
  if (ms) {
    ms.isMonitoring = false;
    ms.lastAmplitude = 0;
    ms.smoothedAmplitude = 0;
  }
}

/**
 * Get the current jaw drive state for a character (used by the polling endpoint).
 */
function getJawDriveState(characterId) {
  const cid = String(characterId);
  const state = activeJawDrives.get(cid);
  if (state && !state.cancelled) {
    return { active: true, amplitude: state.amplitude, angle: state.angle };
  }
  return { active: false, amplitude: 0, angle: 0 };
}

/**
 * Simulate jaw drive for test/demo mode (no real audio or hardware).
 * Generates synthetic amplitude frames that look like natural speech
 * and updates the same state maps so the polling endpoint returns
 * animated data.
 */
function simulateJawDrive(characterId, durationMs) {
  cancelJawDrive(characterId);

  const cid = String(characterId);
  const FRAME_MS = 50;
  const totalFrames = Math.ceil((durationMs || 2000) / FRAME_MS);
  const driveState = { cancelled: false, timer: null, amplitude: 0, angle: 0 };
  activeJawDrives.set(cid, driveState);

  const monState = audioMonitoringState.get(cid) || { isMonitoring: false, lastAmplitude: 0, smoothedAmplitude: 0 };
  monState.isMonitoring = true;
  audioMonitoringState.set(cid, monState);

  // Pre-generate synthetic speech-like amplitude frames
  const frames = [];
  for (let i = 0; i < totalFrames; i++) {
    const t = i / totalFrames;
    // Envelope: fade in 10%, sustain, fade out last 15%
    let env = 1;
    if (t < 0.10) env = t / 0.10;
    else if (t > 0.85) env = (1 - t) / 0.15;
    // Simulate speech with mixed sine waves + randomness
    const speech = 0.3 + 0.25 * Math.sin(i * 0.7) + 0.15 * Math.sin(i * 1.3) + 0.1 * Math.sin(i * 2.9);
    // Add brief pauses (simulates word boundaries)
    const wordPause = (Math.sin(i * 0.15) > 0.85) ? 0.05 : 1;
    frames.push(Math.max(0, Math.min(1, speech * env * wordPause + Math.random() * 0.05)));
  }

  let frameIndex = 0;

  function nextFrame() {
    if (driveState.cancelled || frameIndex >= frames.length) {
      driveState.amplitude = 0;
      driveState.angle = 0;
      const ms = audioMonitoringState.get(cid);
      if (ms) { ms.isMonitoring = false; ms.lastAmplitude = 0; ms.smoothedAmplitude = 0; }
      activeJawDrives.delete(cid);
      return;
    }

    const amp = frames[frameIndex];
    driveState.amplitude = amp;
    // Map amplitude to angle range (use config min/max or defaults)
    const minA = 70, maxA = 93; // default simulated jaw range
    driveState.angle = minA + amp * (maxA - minA);

    const ms = audioMonitoringState.get(cid);
    if (ms) {
      ms.lastAmplitude = amp;
      ms.smoothedAmplitude = amp * 0.7 + (ms.smoothedAmplitude || 0) * 0.3;
    }

    frameIndex++;
    driveState.timer = setTimeout(nextFrame, FRAME_MS);
  }

  nextFrame();
}

/**
 * Adjust a part's Min or Max calibration angle by a delta, writing to the
 * calibration_profiles.json store (new source of truth). Auto-creates an
 * absolute-servo profile if none exists. Clamps to [0, 180] and preserves
 * min <= max ordering. Returns { newValue, minAngle, maxAngle }.
 */
async function adjustPartCalibration(partId, marker, delta) {
  if (marker !== 'Min' && marker !== 'Max') {
    throw new Error('marker must be "Min" or "Max"');
  }
  const store = getCalibrationStore();
  let profile = await store.get(partId);
  if (!profile) {
    profile = {
      partId: parseInt(partId, 10),
      capability: { kind: 'absolute-servo', usMin: 500, usMax: 2500 },
      bounds: { minAngle: 0, maxAngle: 180 },
      presets: [],
      motion: {},
      version: 1,
      autoGenerated: false
    };
  }
  const bounds = Object.assign({}, profile.bounds || {});
  const currentVal = marker === 'Min'
    ? (typeof bounds.minAngle === 'number' ? bounds.minAngle : 0)
    : (typeof bounds.maxAngle === 'number' ? bounds.maxAngle : 180);
  const newVal = Math.max(0, Math.min(180, parseFloat(currentVal) + parseFloat(delta)));
  if (marker === 'Min') bounds.minAngle = newVal;
  else bounds.maxAngle = newVal;
  if (typeof bounds.minAngle === 'number' && typeof bounds.maxAngle === 'number' && bounds.minAngle > bounds.maxAngle) {
    const tmp = bounds.minAngle; bounds.minAngle = bounds.maxAngle; bounds.maxAngle = tmp;
  }
  profile.bounds = bounds;
  profile.autoGenerated = false;
  await store.upsert(profile);
  return { newValue: newVal, minAngle: bounds.minAngle, maxAngle: bounds.maxAngle };
}

export {
  readJawConfig,
  writeJawConfig,
  getDefaultJawConfig,
  getAvailableServos,
  getCalibrationFromMarkers,
  getCalibrationForPart,
  adjustPartCalibration,
  getDaemonParams,
  loadCalibrationGuardrails,
  driveJawFromAmplitude,
  moveJawToAngle,
  testJawMovement,
  startAudioMonitoring,
  stopAudioMonitoring,
  getAudioMonitoringState,
  estimateAmplitudeFromText,
  initializeForCharacter,
  calculateJawAngle,
  applySmoothingToAmplitude,
  normalizeSpeechAmplitude,
  normalizeSpeechFrames,
  resetLoudnessState,
  testServoPosition,
  testJawWithAudio,
  driveFromText,
  preAnalyzeAudio,
  playWithJawSync,
  driveJawFromAudioBuffer,
  driveJawFromPcmStream,
  stopPcmJawStream,
  cancelJawDrive,
  getJawDriveState,
  simulateJawDrive,
  jawServoDaemon,
  // Multi-config CRUD
  listJawConfigs,
  getJawConfigById,
  saveJawConfigById,
  deleteJawConfigById,
  setActiveJawConfig,
  generateConfigId
};