import * as jawAnimationService from './jawAnimationSuperPowerService.js';

/**
 * Jaw Animation Audio Integration
 *
 * The PipeWire / global-interval approach has been replaced by
 * driveJawFromAudioBuffer() in jawAnimationSuperPowerService.js,
 * which decodes real PCM from each TTS buffer and drives the jaw
 * frame-by-frame.
 *
 * This module is kept as a thin facade so server.js startup/shutdown
 * calls don't break.  estimateAmplitudeFromBase64Audio() is retained
 * because the ElevenLabs WebSocket path still calls it.
 */

/**
 * No-op — retained for server.js startup compatibility.
 */
async function initialize() {
  console.log('🦷 Jaw animation audio integration initialized (audio-buffer driven)');
}

/**
 * No-op — retained for server.js shutdown compatibility.
 */
function stopAudioMonitoring() {
  // nothing to stop – driveJawFromAudioBuffer manages its own lifecycle
}

/**
 * Estimate audio amplitude from base64 encoded audio data.
 * Used by the ElevenLabs WebSocket audio-event path.
 */
function estimateAmplitudeFromBase64Audio(base64Audio) {
  if (!base64Audio) return 0;

  try {
    const audioBuffer = Buffer.from(base64Audio, 'base64');
    if (audioBuffer.length < 8) return 0;

    let sum = 0;
    const sampleCount = Math.min(2000, audioBuffer.length);
    const step = Math.max(1, Math.floor(audioBuffer.length / sampleCount));

    for (let i = 0; i < audioBuffer.length; i += step) {
      const sample = audioBuffer[i] - 128;
      sum += sample * sample;
    }

    const rms = Math.sqrt(sum / (audioBuffer.length / step));
    return Math.min(1.0, rms / 64);
  } catch (error) {
    console.debug('Error estimating amplitude from audio:', error);
    return 0;
  }
}

export {
  initialize,
  stopAudioMonitoring,
  estimateAmplitudeFromBase64Audio
};
