import fs from 'fs/promises';
import path from 'path';
import { fileURLToPath } from 'url';
import hardwareService from './hardwareService/index.js';
import { readConfig } from './configService.js';
import { loadParts as loadPartsFromController } from '../controllers/partsController.js';
import { getMarkersForPart } from '../routes/setup/calibration.js';

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
 * Find jaw servo for character or get available servos
 */
async function getAvailableServos(characterId = null) {
  try {
    const parts = await loadPartsSafe();

    // Filter servos and add calibration status
    const servos = parts.filter(p => String(p.type).toLowerCase() === 'servo');

    const servoInfo = await Promise.all(servos.map(async (servo) => {
      // Check if servo has calibration data
      let calibrated = false;
      let minAngle = null;
      let maxAngle = null;

      try {
        const dataDir = characterId ? await getCharacterDataDir(characterId) : 'data';
        const calibFile = path.resolve(dataDir, 'servo_calibrations.json');
        const calibData = JSON.parse(await fs.readFile(calibFile, 'utf8'));

        if (calibData[servo.id] && calibData[servo.id].positions) {
          const positions = calibData[servo.id].positions;
          if (positions.min && positions.max) {
            calibrated = true;
            minAngle = positions.min.angle || 0;
            maxAngle = positions.max.angle || 180;
          }
        }
      } catch (error) {
        // No calibration data available
      }

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
 * Load calibration guardrails (Min/Max) from markers
 */
async function loadCalibrationGuardrails(servoPartId) {
  try {
    const markers = await getMarkersForPart(servoPartId);
    const minMarker = markers.find(m => m.name === 'Min');
    const maxMarker = markers.find(m => m.name === 'Max');

    return {
      minAngle: minMarker ? parseFloat(minMarker.value) : null,
      maxAngle: maxMarker ? parseFloat(maxMarker.value) : null
    };
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

    // Get servo part
    const parts = await loadPartsSafe();
    const jawServo = parts.find(p => p.id === config.servoPartId);

    if (!jawServo) {
      return { success: false, message: 'Jaw servo not found' };
    }

    // Load calibration guardrails (Min/Max markers)
    const guardrails = await loadCalibrationGuardrails(config.servoPartId);

    // Apply smoothing
    const smoothedAmplitude = applySmoothingToAmplitude(characterId, amplitude, config);

    // Calculate target angle with guardrails
    const targetAngle = calculateJawAngle(smoothedAmplitude, config, guardrails);

    // Move servo
    const result = await hardwareService.controlPart(jawServo, 'moveToAngle', {
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

    // Get servo part
    const parts = await loadPartsSafe();
    const jawServo = parts.find(p => p.id === config.servoPartId);

    if (!jawServo) {
      throw new Error('Jaw servo not found');
    }

    const minAngle = config.minAngle || 0;
    const maxAngle = config.maxAngle || 180;
    const midAngle = (minAngle + maxAngle) / 2;

    // Test sequence: min -> max -> mid -> min
    const testSequence = [
      { angle: minAngle, duration: 500 },
      { angle: maxAngle, duration: 500 },
      { angle: midAngle, duration: 500 },
      { angle: minAngle, duration: 500 }
    ];

    for (const step of testSequence) {
      await hardwareService.controlPart(jawServo, 'moveToAngle', {
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
    const parts = await loadPartsFromController(characterId);
    const servoPart = parts.find(p => p.id === parseInt(servoPartId) && p.type === 'servo');

    if (!servoPart) {
      return {
        success: false,
        error: 'Servo part not found'
      };
    }

    // Use hardware service to move servo
    const result = await hardwareService.moveServo(servoPart, pos);

    if (result.success) {
      console.log(`✅ Servo ${servoPartId} successfully moved to ${pos}°`);
      return {
        success: true,
        message: `Servo moved to ${pos}°`,
        position: pos,
        servoPartId: servoPartId
      };
    } else {
      console.error(`❌ Failed to move servo ${servoPartId}:`, result.error);
      return {
        success: false,
        error: result.error || 'Failed to move servo'
      };
    }

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

    // Start the audio playback with jaw animation
    // This will rely on the existing audio processing pipeline
    // that hooks into driveJawFromAmplitude during playback
    console.log(`🎵 Starting audio playback with jaw sync for "${audioFile.title}"`);

    // Use the audio library service to play the file
    // The audio playback will automatically trigger jaw animation
    // through the existing audio processing hooks
    const audioLibraryService = await import('./audioLibraryService.js');
    const playbackResult = await audioLibraryService.playAudioWithJawSync(audioFile.id, {
      characterId: characterId,
      jawAnimationConfig: jawConfig,
      volume: 80
    });

    if (playbackResult.success) {
      return {
        success: true,
        message: `Started jaw animation test with "${audioFile.title}"`,
        audioId: audioFile.id,
        audioTitle: audioFile.title,
        duration: audioFile.duration,
        characterId: characterId
      };
    } else {
      return {
        success: false,
        error: playbackResult.error || 'Failed to start audio playback with jaw sync'
      };
    }

  } catch (error) {
    console.error('Error testing jaw with audio:', error);
    return {
      success: false,
      error: error.message
    };
  }
}

export {
  readJawConfig,
  writeJawConfig,
  getDefaultJawConfig,
  getAvailableServos,
  driveJawFromAmplitude,
  testJawMovement,
  startAudioMonitoring,
  stopAudioMonitoring,
  getAudioMonitoringState,
  estimateAmplitudeFromText,
  initializeForCharacter,
  calculateJawAngle,
  applySmoothingToAmplitude,
  testServoPosition,
  testJawWithAudio
};