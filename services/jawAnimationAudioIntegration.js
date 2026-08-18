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
 * calls don't break.
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

export {
  initialize,
  stopAudioMonitoring
};
