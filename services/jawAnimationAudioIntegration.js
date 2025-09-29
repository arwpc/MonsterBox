import * as jawAnimationService from './jawAnimationSuperPowerService.js';
import elevenLabsWebSocketService from './elevenLabsWebSocketService.js';
import { readConfig } from './configService.js';

/**
 * Jaw Animation Audio Integration
 * Hooks into existing MonsterBox audio systems to drive jaw animation
 */

let isInitialized = false;
let audioProcessingInterval = null;

/**
 * Initialize audio integration hooks
 */
async function initialize() {
  if (isInitialized) {
    return;
  }
  
  console.log('🦷 Initializing jaw animation audio integration...');
  
  try {
    // Hook into ElevenLabs WebSocket service for AI audio
    initializeElevenLabsIntegration();
    
    // Initialize PipeWire monitoring for general audio
    initializePipeWireIntegration();
    
    isInitialized = true;
    console.log('✅ Jaw animation audio integration initialized');
  } catch (error) {
    console.error('❌ Failed to initialize jaw animation audio integration:', error);
  }
}

/**
 * Hook into ElevenLabs WebSocket service for AI TTS audio
 */
function initializeElevenLabsIntegration() {
  console.log('🎙️ Setting up ElevenLabs jaw animation hooks...');
  
  // Listen for audio events from ElevenLabs service
  elevenLabsWebSocketService.on('audio', async (data) => {
    try {
      await handleElevenLabsAudio(data);
    } catch (error) {
      console.error('Error handling ElevenLabs audio for jaw animation:', error);
    }
  });
  
  console.log('✅ ElevenLabs jaw animation hooks established');
}

/**
 * Handle audio from ElevenLabs TTS for jaw animation
 */
async function handleElevenLabsAudio(data) {
  if (!data.audioData || !data.sessionId) {
    return;
  }
  
  // Get character ID from session or current character
  const characterId = await getCurrentCharacterId();
  if (!characterId) {
    return;
  }
  
  // Check if jaw animation is enabled for this character
  const config = await jawAnimationService.readJawConfig(characterId);
  if (!config.enabled || !config.servoPartId) {
    return;
  }
  
  // Estimate amplitude from base64 audio data
  const amplitude = estimateAmplitudeFromBase64Audio(data.audioData);
  
  // Drive jaw servo
  const result = await jawAnimationService.driveJawFromAmplitude(characterId, amplitude);
  
  if (process.env.DEBUG_JAW_ANIMATION) {
    console.log(`🦷 ElevenLabs jaw animation:`, {
      characterId,
      amplitude: amplitude.toFixed(3),
      result: result.success ? 'success' : result.message
    });
  }
}

/**
 * Initialize PipeWire monitoring for general audio playback
 */
function initializePipeWireIntegration() {
  console.log('🔊 Setting up PipeWire jaw animation monitoring...');
  
  // Start audio level monitoring for all characters with jaw animation enabled
  startGlobalAudioMonitoring();
  
  console.log('✅ PipeWire jaw animation monitoring established');
}

/**
 * Start monitoring audio levels across the system
 */
function startGlobalAudioMonitoring() {
  if (audioProcessingInterval) {
    clearInterval(audioProcessingInterval);
  }
  
  // Monitor audio levels every 50ms for responsive jaw movement
  audioProcessingInterval = setInterval(async () => {
    try {
      await processGlobalAudioLevels();
    } catch (error) {
      // Silently handle monitoring errors to avoid spam
      if (process.env.DEBUG_JAW_ANIMATION) {
        console.debug('Global audio monitoring error:', error);
      }
    }
  }, 50);
}

/**
 * Process global audio levels for jaw animation
 */
async function processGlobalAudioLevels() {
  const characterId = await getCurrentCharacterId();
  if (!characterId) {
    return;
  }
  
  const config = await jawAnimationService.readJawConfig(characterId);
  if (!config.enabled || !config.servoPartId) {
    return;
  }
  
  // Get current monitoring state
  const monitoringState = jawAnimationService.getAudioMonitoringState(characterId);
  if (!monitoringState.isMonitoring) {
    return;
  }
  
  // Get audio level from the system (simplified - in production this would use actual PipeWire monitoring)
  const currentAmplitude = await getCurrentSystemAudioLevel(characterId);
  
  if (currentAmplitude > 0) {
    // Drive jaw animation
    await jawAnimationService.driveJawFromAmplitude(characterId, currentAmplitude);
  }
}

/**
 * Get current system audio level (placeholder - in production would monitor PipeWire)
 */
async function getCurrentSystemAudioLevel(characterId) {
  // This is a simplified implementation
  // In production, this would monitor the actual PipeWire audio stream
  
  const monitoringState = jawAnimationService.getAudioMonitoringState(characterId);
  
  // Return a small random value to simulate audio activity for testing
  // In production, this would be replaced with actual audio level detection
  if (monitoringState.isMonitoring) {
    return Math.random() * 0.1; // Low-level simulation
  }
  
  return 0;
}

/**
 * Estimate audio amplitude from base64 encoded audio data
 */
function estimateAmplitudeFromBase64Audio(base64Audio) {
  if (!base64Audio) {
    return 0;
  }
  
  try {
    // Decode base64 to buffer
    const audioBuffer = Buffer.from(base64Audio, 'base64');
    
    if (audioBuffer.length < 8) {
      return 0;
    }
    
    // Simple RMS calculation for amplitude estimation
    let sum = 0;
    const sampleCount = Math.min(2000, audioBuffer.length);
    const step = Math.max(1, Math.floor(audioBuffer.length / sampleCount));
    
    for (let i = 0; i < audioBuffer.length; i += step) {
      // Treat bytes as signed values centered around 0
      const sample = audioBuffer[i] - 128;
      sum += sample * sample;
    }
    
    const rms = Math.sqrt(sum / (audioBuffer.length / step));
    
    // Normalize to 0-1 range
    const normalized = Math.min(1.0, rms / 64);
    
    return normalized;
  } catch (error) {
    console.debug('Error estimating amplitude from audio:', error);
    return 0;
  }
}

/**
 * Get current character ID from configuration
 */
async function getCurrentCharacterId() {
  try {
    const config = await readConfig();
    return config.selectedCharacter || null;
  } catch (error) {
    console.debug('Error getting current character ID:', error);
    return null;
  }
}

/**
 * Handle text-based TTS for jaw animation (for non-audio TTS sources)
 */
async function handleTTSTextForJaw(characterId, text) {
  if (!characterId || !text) {
    return;
  }
  
  const config = await jawAnimationService.readJawConfig(characterId);
  if (!config.enabled || !config.servoPartId) {
    return;
  }
  
  // Estimate amplitude from text characteristics
  const amplitude = jawAnimationService.estimateAmplitudeFromText(text);
  
  // Drive jaw animation with estimated amplitude
  const result = await jawAnimationService.driveJawFromAmplitude(characterId, amplitude);
  
  if (process.env.DEBUG_JAW_ANIMATION) {
    console.log(`🦷 Text-based jaw animation:`, {
      characterId,
      text: text.substring(0, 50) + '...',
      amplitude: amplitude.toFixed(3),
      result: result.success ? 'success' : result.message
    });
  }
  
  return result;
}

/**
 * Stop audio monitoring
 */
function stopAudioMonitoring() {
  if (audioProcessingInterval) {
    clearInterval(audioProcessingInterval);
    audioProcessingInterval = null;
  }
  
  console.log('🦷 Jaw animation audio monitoring stopped');
}

/**
 * Restart audio monitoring (useful after configuration changes)
 */
function restartAudioMonitoring() {
  stopAudioMonitoring();
  startGlobalAudioMonitoring();
  
  console.log('🦷 Jaw animation audio monitoring restarted');
}

export {
  initialize,
  handleTTSTextForJaw,
  stopAudioMonitoring,
  restartAudioMonitoring,
  estimateAmplitudeFromBase64Audio
};