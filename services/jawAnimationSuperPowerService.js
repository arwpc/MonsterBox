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
 * Calculate jaw angle based on audio amplitude
 */
function calculateJawAngle(amplitude, config) {
  // Apply volume threshold
  if (amplitude < config.volumeThreshold) {
    return config.minAngle || 0;
  }
  
  // Apply sensitivity
  const sensitiveAmplitude = Math.min(1.0, amplitude * config.sensitivity);
  
  // Map to angle range
  const minAngle = config.minAngle || 0;
  const maxAngle = config.maxAngle || 180;
  const angleRange = maxAngle - minAngle;
  
  return minAngle + (sensitiveAmplitude * angleRange);
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
 * Drive jaw servo based on amplitude
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
    
    // Apply smoothing
    const smoothedAmplitude = applySmoothingToAmplitude(characterId, amplitude, config);
    
    // Calculate target angle
    const targetAngle = calculateJawAngle(smoothedAmplitude, config);
    
    // Move servo
    const result = await hardwareService.controlPart(jawServo, 'moveToAngle', {
      angleDeg: targetAngle
    });
    
    return {
      success: true,
      amplitude: amplitude,
      smoothedAmplitude: smoothedAmplitude,
      targetAngle: targetAngle,
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
  applySmoothingToAmplitude
};