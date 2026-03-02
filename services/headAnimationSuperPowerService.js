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
    confirmFrames: 3
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

export {
  readHeadTrackingConfig,
  writeHeadTrackingConfig,
  getDefaultHeadTrackingConfig,
  getAvailableServos,
  getAvailableWebcams
};
