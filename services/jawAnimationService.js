const EventEmitter = require('events');
const logger = require('../scripts/logger');
const { getSuperPowersService } = require('./superPowersService');
const { getServoClient } = require('./servoWebSocketClient');

/**
 * JawAnimationService
 * Listens to ElevenLabs audio events and drives servo based on amplitude only.
 */
class JawAnimationService extends EventEmitter {
  constructor(options = {}) {
    super();
    this.superPowers = getSuperPowersService();
    this.servoClient = getServoClient();

    this.characterState = new Map(); // characterId -> { env: 0 }
  }

  async initialize() {
    // Ensure SuperPowers service is initialized by app bootstrap
    logger.info('🦷 JawAnimationService ready');

    // If ElevenLabs service exists now, attach; if not, app.js can attach after init
    if (global.elevenLabsService) {
      this.attachToElevenLabs(global.elevenLabsService);
    }
  }

  attachToElevenLabs(elevenLabsService) {
    if (!elevenLabsService || this._attached) return;
    elevenLabsService.on('jaw_audio', (payload) => this.handleJawAudio(payload));
    // Capture transcripts for later features
    elevenLabsService.on('transcript', (t) => this.emit('transcript', t));
    this._attached = true;
    logger.info('🪙 JawAnimationService attached to ElevenLabs service');
  }

  handleJawAudio({ sessionId, characterId, audioData, format, audioFormat }) {
    if (!characterId) return;
    const cfg = this.superPowers.getJawAnimationConfig(characterId);
    if (!cfg || !cfg.enabled || !cfg.servoPartId) return;

    // Decode base64 to Buffer
    try {
      const audioBuffer = Buffer.from(audioData, 'base64');
      const amp = this._estimateAmplitude(audioBuffer);
      const smoothed = this._smooth(characterId, amp, cfg.smoothing ?? 0.6);

      const angle = this._mapAmplitudeToAngle(smoothed * (cfg.sensitivity ?? 1.0), cfg.minAngle, cfg.maxAngle);
      // Send to servo using existing client
      this.servoClient.moveServo(cfg.servoPartId, angle, 0.08).catch(err => {
        logger.debug('Jaw move error (non-fatal):', err.message);
      });
    } catch (e) {
      logger.debug('Jaw audio decode error:', e.message);
    }
  }

  _smooth(characterId, value, alpha) {
    const st = this.characterState.get(characterId) || { env: 0 };
    st.env = alpha * st.env + (1 - alpha) * value;
    this.characterState.set(characterId, st);
    return st.env;
  }

  _estimateAmplitude(buffer) {
    // Assume 16-bit PCM LE if WAV; if raw base64 MP3/Opus, this is a crude fallback using byte variance
    if (buffer.length < 8) return 0;
    // Simple byte-level RMS proxy
    let sum = 0;
    const step = Math.max(1, Math.floor(buffer.length / 2000));
    for (let i = 0; i < buffer.length; i += step) {
      const v = buffer[i] - 128; // center
      sum += v * v;
    }
    const rms = Math.sqrt(sum / (buffer.length / step));
    // Normalize
    const normalized = Math.min(1, rms / 64);
    return normalized;
  }

  _mapAmplitudeToAngle(amp, minAngle, maxAngle) {
    amp = Math.max(0, Math.min(1, amp));
    const a = Math.max(0, Math.min(180, parseFloat(minAngle)));
    const b = Math.max(0, Math.min(180, parseFloat(maxAngle)));
    return a + (b - a) * amp;
  }
}

let instance = null;
function getJawAnimationService() {
  if (!instance) instance = new JawAnimationService();
  return instance;
}

module.exports = { JawAnimationService, getJawAnimationService };

