import fs from 'fs/promises';
import path from 'path';
import { fileURLToPath } from 'url';
import hardwareService from './hardwareService/index.js';
import { readConfig } from './configService.js';
import { loadParts as loadPartsFromController } from '../controllers/partsController.js';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);


/**
 * Jaw Animation Super Power Service
 * Handles jaw servo animation based on real-time audio amplitude
 * Integrates with existing MonsterBox audio and servo systems
 */

let audioMonitoringState = new Map(); // characterId -> { isMonitoring, lastAmplitude, smoothedAmplitude }
let characterConfigs = new Map(); // characterId -> jaw animation config

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

  // Create character-specific path
  return path.resolve(`data/character-${characterId}`);
}

/**
 * Read jaw animation configuration for a character
 */
async function readJawConfig(characterId) {
  try {
    const dataDir = await getCharacterDataDir(characterId);
    const configFile = path.join(dataDir, 'super-powers.json');

    const data = await fs.readFile(configFile, 'utf8');
    const config = JSON.parse(data);

    return config.jawAnimation || getDefaultJawConfig();
  } catch (error) {
    // Return default config if file doesn't exist
    return getDefaultJawConfig();
  }
}

/**
 * Write jaw animation configuration for a character
 */
async function writeJawConfig(characterId, jawConfig) {
  try {
    const dataDir = await getCharacterDataDir(characterId);
    await fs.mkdir(dataDir, { recursive: true });

    const configFile = path.join(dataDir, 'super-powers.json');

    // Read existing config or create new one
    let config = {};
    try {
      const data = await fs.readFile(configFile, 'utf8');
      config = JSON.parse(data);
    } catch (error) {
      // File doesn't exist, start with empty config
    }

    // Update jaw animation section
    config.jawAnimation = jawConfig;

    // Write back to file
    await fs.writeFile(configFile, JSON.stringify(config, null, 2));

    // Update in-memory cache
    characterConfigs.set(String(characterId), jawConfig);

    return true;
  } catch (error) {
    console.error('Error writing jaw config:', error);
    throw error;
  }
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
    maxAngle: null    // Will be populated from servo calibration
  };
}

/**
 * Load parts safely with error handling
 */
async function loadPartsSafe() {
  try {
    const parts = await loadPartsFromController();
    return Array.isArray(parts) ? parts : [];
  } catch (error) {
    console.error('Error loading parts:', error);
    return [];
  }
}

/**
 * Extract Min/Max calibration from a part's markers array.
 * Markers are the unified calibration source of truth.
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
 * Find jaw servo for character or get available servos.
 * Reads calibration from part markers (unified calibration).
 */
async function getAvailableServos(characterId = null) {
  try {
    const parts = await loadPartsSafe();

    // Filter to servos only (optionally for a specific character)
    const servos = parts.filter(p => {
      if (String(p.type).toLowerCase() !== 'servo') return false;
      // When parts come from a character-specific data directory they lack
      // characterId — treat them as belonging to the requested character.
      if (characterId != null && p.characterId != null && String(p.characterId) !== String(characterId)) return false;
      return true;
    });

    const servoInfo = servos.map(servo => {
      const { calibrated, minAngle, maxAngle } = getCalibrationFromMarkers(servo);
      return {
        ...servo,
        calibrated,
        minAngle,
        maxAngle,
        isJawCandidate: String(servo.name || '').toLowerCase().includes('jaw')
      };
    });

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
async function loadCalibrationGuardrails(servoPartId) {
  try {
    const parts = await loadPartsSafe();
    const part = parts.find(p => String(p.id) === String(servoPartId));
    if (!part) return { minAngle: null, maxAngle: null };
    return getCalibrationFromMarkers(part);
  } catch (error) {
    console.warn('Could not load calibration guardrails:', error.message);
    return { minAngle: null, maxAngle: null };
  }
}

/**
 * Calculate jaw angle based on audio amplitude with calibration guardrails
 */
function calculateJawAngle(amplitude, config, guardrails = {}) {
  // Apply volume threshold
  if (amplitude < config.volumeThreshold) {
    return guardrails.minAngle || config.minAngle || 0;
  }

  // Apply sensitivity
  const sensitiveAmplitude = Math.min(1.0, amplitude * config.sensitivity);

  // Use calibration guardrails if available, otherwise fall back to config
  const minAngle = guardrails.minAngle ?? config.minAngle ?? 0;
  const maxAngle = guardrails.maxAngle ?? config.maxAngle ?? 180;
  const angleRange = maxAngle - minAngle;

  // Calculate target angle and clamp to guardrails
  const targetAngle = minAngle + (sensitiveAmplitude * angleRange);
  return Math.max(minAngle, Math.min(maxAngle, targetAngle));
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
    const parts = await loadPartsSafe();
    const jawServo = parts.find(p => String(p.id) === String(config.servoPartId));

    if (!jawServo) {
      return { success: false, message: 'Jaw servo not found' };
    }

    // Load calibration guardrails (Min/Max markers)
    const guardrails = await loadCalibrationGuardrails(config.servoPartId);

    // Apply smoothing
    const smoothedAmplitude = applySmoothingToAmplitude(characterId, amplitude, config);

    // Calculate target angle with guardrails
    const targetAngle = calculateJawAngle(smoothedAmplitude, config, guardrails);

    // Move servo — pass the part ID (not the object)
    const result = await hardwareService.controlPart(jawServo.id, 'moveToAngle', {
      angleDeg: targetAngle
    });

    return {
      success: true,
      amplitude: amplitude,
      smoothedAmplitude: smoothedAmplitude,
      targetAngle: targetAngle,
      guardrails: guardrails,
      servoResult: result
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
    const parts = await loadPartsSafe();
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

    for (const step of testSequence) {
      await hardwareService.controlPart(jawServo.id, 'moveToAngle', {
        angleDeg: step.angle
      });

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
    const parts = await loadPartsSafe();
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

    const parts = await loadPartsSafe();
    const jawServo = parts.find(p => String(p.id) === String(config.servoPartId));
    if (!jawServo) {
      return { success: false, message: 'Jaw servo not found' };
    }

    // Clamp to calibrated range
    const { minAngle, maxAngle } = getCalibrationFromMarkers(jawServo);
    const lo = minAngle ?? 0;
    const hi = maxAngle ?? 180;
    const clamped = Math.max(lo, Math.min(hi, angleDeg));

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

export {
  readJawConfig,
  writeJawConfig,
  getDefaultJawConfig,
  getAvailableServos,
  getCalibrationFromMarkers,
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
  driveFromText
};