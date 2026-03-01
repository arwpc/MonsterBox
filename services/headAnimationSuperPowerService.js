import fs from 'fs/promises';
import path from 'path';

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
    enabled: false,
    panServoId: null,
    webcamPartId: null,
    centerDeg: 0,
    rangeDeg: 60,
    invertPan: false,
    smoothing: 0.3,
    deadzone: 5,
    motionThreshold: 30,
    minContourArea: 300,
    maxContourArea: 30000,
    backgroundLearningRate: 0.02,
    noiseReductionKernelSize: 3
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
 * Get available servo parts for a character with calibration markers.
 */
async function getAvailableServos(characterId) {
  try {
    const parts = await loadPartsSafe(characterId);
    if (!Array.isArray(parts)) return [];

    return parts
      .filter(p => p.type === 'servo')
      .map(servo => {
        const markers = servo.markers || [];
        const minMarker = markers.find(m => m.name === 'Min');
        const maxMarker = markers.find(m => m.name === 'Max');
        const calibrated = !!(minMarker && maxMarker);

        return {
          id: String(servo.id),
          name: servo.name || `Servo #${servo.id}`,
          calibrated,
          minAngle: minMarker ? parseFloat(minMarker.value) : null,
          maxAngle: maxMarker ? parseFloat(maxMarker.value) : null,
          config: servo.config || {}
        };
      });
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
