import fs from 'fs/promises';
import path from 'path';
import { fileURLToPath } from 'url';
import { spawn } from 'child_process';
import hardwareService from './hardwareService/index.js';
import jawServoDaemon from './jawServoDaemon.js';
import { readConfig } from './configService.js';
import { loadParts as loadPartsFromController } from '../controllers/partsController.js';
import { getCalibrationStore } from '../server/calibration/store.js';
import { writeJsonAtomic } from './atomicStore.js';

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
  const config = await readConfig();
  const baseDataPath = config.dataPath || 'data';

  if (baseDataPath.includes('character-')) {
    // Already character-specific path
    return path.resolve(baseDataPath);
  }

  // Create character-specific path. characterId reaches here from route params
  // (e.g. /setup/jaw-animation/api/jaw-animation/:charId), so reject anything
  // that is not a plain integer before it can build a traversal path.
  if (!/^\d+$/.test(String(characterId))) {
    throw new Error(`Invalid characterId: ${characterId}`);
  }
  return path.resolve(`data/character-${characterId}`);
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

    let fileConfig = {};
    try {
      const data = await fs.readFile(configFile, 'utf8');
      fileConfig = JSON.parse(data);
    } catch (_) {
      // File doesn't exist, start fresh
    }

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
        'audioLeadTimeMs', 'testText'
      ];
      for (const key of tuningKeys) {
        if (jawConfig[key] !== undefined) {
          jaw.configs[activeIdx][key] = jawConfig[key];
        }
      }
    }

    fileConfig.jawAnimation = jaw;
    await writeJsonAtomic(configFile, fileConfig);

    // Update in-memory cache with flat config
    characterConfigs.set(String(characterId), flattenJawConfig(jaw));

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
    useAGC: true,              // automatic gain control
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
    if (profile && profile.bounds && profile.capability && profile.capability.kind === 'absolute-servo') {
      const { minAngle, maxAngle } = profile.bounds;
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

      // AGC: normalize so peak = 0.8
      let peakRms = 0;
      for (const r of rmsFrames) { if (r > peakRms) peakRms = r; }

      const agcGain = (useAGC && peakRms > 0.001) ? (0.8 / peakRms) : 1.0;

      // Build timeline with angle mapping, envelope, and quantization
      const frames = [];
      let prevAngle = minAngle;
      let prevTime = 0;

      for (let i = 0; i < rmsFrames.length; i++) {
        const time = i * FRAME_DURATION_MS;
        const rawAmp = Math.min(1.0, rmsFrames[i] * agcGain);

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

        const amplitude = frames[frameIndex];

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
  testServoPosition,
  testJawWithAudio,
  driveFromText,
  preAnalyzeAudio,
  playWithJawSync,
  driveJawFromAudioBuffer,
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