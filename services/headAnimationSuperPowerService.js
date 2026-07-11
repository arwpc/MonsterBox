import fs from 'fs/promises';
import path from 'path';
import { getCalibrationStore } from '../server/calibration/store.js';

/**
 * Head Animation Super Power Service
 * Config persistence for super-powers.json headTracking section.
 * Pattern: jawAnimationSuperPowerService.js
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
 * Return default head tracking configuration
 */
function getDefaultHeadTrackingConfig() {
  return {
    opencvEnabled: true,
    enabled: false,
    panServoId: null,
    webcamPartId: null,
    centerDeg: 0,
    rangeDeg: 60,
    invertPan: false,
    smoothing: 0.25,
    deadzone: 5,
    motionThreshold: 25,
    minContourArea: 3000,
    maxContourArea: 100000,
    backgroundLearningRate: 0.005,
    noiseReductionKernelSize: 5,
    blurSize: 5,
    dilateSize: 9,
    varThreshold: 25,
    targetLockStrength: 5,
    confirmFrames: 3,
    detectInterval: 5,
    detectionMode: 'person'
  };
}

/**
 * Load parts for a specific character from data/character-{id}/parts.json.
 * Ensures character independence — never relies on global dataPath.
 */
async function loadPartsSafe(characterId) {
  try {
    const partsFile = path.resolve(`data/character-${characterId}`, 'parts.json');
    const data = await fs.readFile(partsFile, 'utf8');
    const parts = JSON.parse(data);
    return Array.isArray(parts) ? parts : [];
  } catch (error) {
    console.error('Error loading parts for character', characterId, ':', error.message);
    return [];
  }
}

/**
 * Read head tracking configuration from super-powers.json.
 * Returns a flat config object with defaults merged in.
 */
async function readHeadTrackingConfig(characterId) {
  try {
    const dataDir = getCharacterDataDir(characterId);
    const configFile = path.join(dataDir, 'super-powers.json');

    let fileConfig = {};
    try {
      const data = await fs.readFile(configFile, 'utf8');
      fileConfig = JSON.parse(data);
    } catch (_) {
      // File missing — return defaults
      return getDefaultHeadTrackingConfig();
    }

    const headTracking = fileConfig.headTracking;
    if (!headTracking) return getDefaultHeadTrackingConfig();

    // Merge with defaults so new fields are always present
    return { ...getDefaultHeadTrackingConfig(), ...headTracking };
  } catch (error) {
    console.error('Error reading head tracking config:', error);
    return getDefaultHeadTrackingConfig();
  }
}

/**
 * Write head tracking configuration to super-powers.json.
 * Preserves other keys (jawAnimation, etc.)
 */
async function writeHeadTrackingConfig(characterId, config) {
  const dataDir = getCharacterDataDir(characterId);
  const configFile = path.join(dataDir, 'super-powers.json');

  let fileConfig = {};
  try {
    const data = await fs.readFile(configFile, 'utf8');
    fileConfig = JSON.parse(data);
  } catch (_) {
    // File missing — will create
  }

  // Merge with defaults to ensure all keys present, then overlay provided config
  fileConfig.headTracking = { ...getDefaultHeadTrackingConfig(), ...config };

  // Ensure directory exists
  await fs.mkdir(dataDir, { recursive: true });
  await fs.writeFile(configFile, JSON.stringify(fileConfig, null, 2));
}

/**
 * Get available servo parts for a character with calibration bounds.
 * Reads from calibration_profiles.json (primary) with fallback to parts.json markers.
 */
async function getAvailableServos(characterId) {
  try {
    const parts = await loadPartsSafe(characterId);
    if (!Array.isArray(parts)) return [];

    const calibrationStore = getCalibrationStore();
    const servos = parts.filter(p => p.type === 'servo');
    const results = [];

    for (const servo of servos) {
      let minAngle = null;
      let maxAngle = null;
      let calibrated = false;
      let servoKind = 'absolute-servo';

      // Primary: calibration_profiles.json bounds
      try {
        const profile = await calibrationStore.get(servo.id);
        if (profile) {
          if (profile.capability && profile.capability.kind) {
            servoKind = profile.capability.kind;
          }
          if (profile.bounds) {
            if (typeof profile.bounds.minAngle === 'number' && typeof profile.bounds.maxAngle === 'number') {
              minAngle = profile.bounds.minAngle;
              maxAngle = profile.bounds.maxAngle;
              calibrated = true;
            }
          }
        }
      } catch (_) { /* calibration read failed, fall through */ }

      // Fallback: parts.json markers
      if (!calibrated) {
        const markers = servo.markers || [];
        const minMarker = markers.find(m => m.name === 'Min');
        const maxMarker = markers.find(m => m.name === 'Max');
        if (minMarker && maxMarker) {
          minAngle = parseFloat(minMarker.value);
          maxAngle = parseFloat(maxMarker.value);
          calibrated = true;
        }
      }

      results.push({
        id: String(servo.id),
        name: servo.name || `Servo #${servo.id}`,
        calibrated,
        minAngle,
        maxAngle,
        servoKind,
        config: servo.config || {}
      });
    }

    return results;
  } catch (error) {
    console.error('Error getting available servos:', error);
    return [];
  }
}

/**
 * Get available webcam parts for a character.
 */
async function getAvailableWebcams(characterId) {
  try {
    const parts = await loadPartsSafe(characterId);
    if (!Array.isArray(parts)) return [];

    return parts
      .filter(p => p.type === 'webcam')
      .map(webcam => ({
        id: String(webcam.id),
        name: webcam.name || `Webcam #${webcam.id}`,
        config: webcam.config || {}
      }));
  } catch (error) {
    console.error('Error getting available webcams:', error);
    return [];
  }
}

// ─── Built-in presets (not deletable) ────────────────────────────────
const BUILTIN_PRESETS = [
  {
    id: 'person-hog', name: 'Person Tracking (HOG)', builtin: true,
    params: { detectionMode: 'person', detectInterval: 5, motionThreshold: 20, minContourArea: 5000, maxContourArea: 150000, backgroundLearningRate: 0.003, noiseReductionKernelSize: 5, blurSize: 7, dilateSize: 11, varThreshold: 20, targetLockStrength: 7, confirmFrames: 2 }
  },
  {
    id: 'person-hybrid', name: 'Person + Motion (Hybrid)', builtin: true,
    params: { detectionMode: 'person+motion', detectInterval: 5, motionThreshold: 20, minContourArea: 4000, maxContourArea: 150000, backgroundLearningRate: 0.003, noiseReductionKernelSize: 5, blurSize: 7, dilateSize: 11, varThreshold: 20, targetLockStrength: 7, confirmFrames: 3 }
  },
  {
    id: 'upperbody', name: 'Upper Body Tracking', builtin: true,
    params: { detectionMode: 'upperbody', detectInterval: 3, motionThreshold: 20, minContourArea: 3000, maxContourArea: 150000, backgroundLearningRate: 0.003, noiseReductionKernelSize: 5, blurSize: 5, dilateSize: 9, varThreshold: 20, targetLockStrength: 6, confirmFrames: 2 }
  },
  {
    id: 'noisy', name: 'Noisy Environment', builtin: true,
    params: { detectionMode: 'person', detectInterval: 8, motionThreshold: 35, minContourArea: 8000, maxContourArea: 100000, backgroundLearningRate: 0.002, noiseReductionKernelSize: 7, blurSize: 9, dilateSize: 13, varThreshold: 35, targetLockStrength: 8, confirmFrames: 5 }
  },
  {
    id: 'sensitive', name: 'High Sensitivity', builtin: true,
    params: { detectionMode: 'person+motion', detectInterval: 3, motionThreshold: 12, minContourArea: 1500, maxContourArea: 200000, backgroundLearningRate: 0.008, noiseReductionKernelSize: 3, blurSize: 5, dilateSize: 7, varThreshold: 15, targetLockStrength: 4, confirmFrames: 2 }
  }
];

/**
 * List all presets for a character (built-in + custom).
 */
async function listPresets(characterId) {
  const config = await readHeadTrackingConfig(characterId);
  const customPresets = (config.presets || []).map(p => ({ ...p, builtin: false }));
  return [...BUILTIN_PRESETS, ...customPresets];
}

/**
 * Save a custom preset for a character.
 */
async function savePreset(characterId, preset) {
  const dataDir = getCharacterDataDir(characterId);
  const configFile = path.join(dataDir, 'super-powers.json');

  let fileConfig = {};
  try {
    const data = await fs.readFile(configFile, 'utf8');
    fileConfig = JSON.parse(data);
  } catch (_) { }

  if (!fileConfig.headTracking) fileConfig.headTracking = getDefaultHeadTrackingConfig();
  if (!Array.isArray(fileConfig.headTracking.presets)) fileConfig.headTracking.presets = [];

  const id = preset.id || ('custom_' + Date.now());
  const existing = fileConfig.headTracking.presets.findIndex(p => p.id === id);
  const entry = { id, name: preset.name || 'Custom Preset', params: preset.params || {} };

  if (existing >= 0) {
    fileConfig.headTracking.presets[existing] = entry;
  } else {
    fileConfig.headTracking.presets.push(entry);
  }

  await fs.mkdir(dataDir, { recursive: true });
  await fs.writeFile(configFile, JSON.stringify(fileConfig, null, 2));
  return entry;
}

/**
 * Delete a custom preset for a character. Cannot delete built-in presets.
 */
async function deletePreset(characterId, presetId) {
  if (BUILTIN_PRESETS.some(p => p.id === presetId)) {
    throw new Error('Cannot delete built-in preset');
  }

  const dataDir = getCharacterDataDir(characterId);
  const configFile = path.join(dataDir, 'super-powers.json');

  let fileConfig = {};
  try {
    const data = await fs.readFile(configFile, 'utf8');
    fileConfig = JSON.parse(data);
  } catch (_) { }

  if (!fileConfig.headTracking || !Array.isArray(fileConfig.headTracking.presets)) {
    throw new Error('Preset not found');
  }

  const idx = fileConfig.headTracking.presets.findIndex(p => p.id === presetId);
  if (idx < 0) throw new Error('Preset not found');

  fileConfig.headTracking.presets.splice(idx, 1);
  await fs.writeFile(configFile, JSON.stringify(fileConfig, null, 2));
}

export {
  readHeadTrackingConfig,
  writeHeadTrackingConfig,
  getDefaultHeadTrackingConfig,
  getAvailableServos,
  getAvailableWebcams,
  listPresets,
  savePreset,
  deletePreset
};
