const { spawn } = require('child_process');
const fs = require('fs').promises;
const os = require('os');
const path = require('path');
const logger = require('../scripts/logger');

class SpeakerService {
  constructor() {
    this.defaultTestDuration = 3; // seconds
  }

  async getAvailableDevices() {
    const devices = [];

    // Try PulseAudio first (includes USB dongles and more devices)
    try {
      const pactl = await this._runCommand('pactl', ['list', 'short', 'sinks']);
      const pulseDevices = this._parsePulseAudioSinks(pactl.stdout || '');
      devices.push(...pulseDevices);
      logger.info(`Found ${pulseDevices.length} PulseAudio devices`);
    } catch (err) {
      logger.warn('PulseAudio not available or failed:', err.message);
    }

    // Also try ALSA devices as fallback/additional
    try {
      const aplay = await this._runCommand('aplay', ['-l']);
      const alsaDevices = this._parseAplayList(aplay.stdout || '');
      // Add ALSA devices that aren't already covered by PulseAudio
      alsaDevices.forEach(alsaDevice => {
        if (!devices.find(d => d.id === alsaDevice.id)) {
          devices.push(alsaDevice);
        }
      });
      logger.info(`Found ${alsaDevices.length} ALSA devices`);
    } catch (err) {
      logger.warn('ALSA aplay not available or failed:', err.message);
    }

    // Ensure we always have a default option
    if (devices.length === 0 || !devices.find(d => d.id === 'default')) {
      devices.unshift({
        id: 'default',
        name: 'System Default Audio',
        description: 'System default audio output device'
      });
    }

    logger.info(`Total audio output devices discovered: ${devices.length}`);
    return devices;
  }

  _parsePulseAudioSinks(stdout) {
    const devices = [];
    const lines = stdout.split('\n').filter(line => line.trim());

    for (const line of lines) {
      // PulseAudio sink format: INDEX	NAME	DRIVER	SAMPLE-SPEC	STATE
      const parts = line.split('\t');
      if (parts.length >= 2) {
        const index = parts[0];
        const name = parts[1];
        const driver = parts[2] || '';
        const state = parts[4] || '';

        // Create a more user-friendly name
        let displayName = name;
        if (name.includes('usb')) {
          displayName = `USB Audio Device (${name.split('.').pop()})`;
        } else if (name.includes('hdmi')) {
          displayName = `HDMI Audio (${name.split('.').pop()})`;
        } else if (name.includes('analog')) {
          displayName = `Analog Audio (${name.split('.').pop()})`;
        } else if (name.includes('bluez')) {
          displayName = `Bluetooth Audio (${name.split('.').pop()})`;
        } else {
          // Try to extract a meaningful name from the sink name
          const nameParts = name.split('.');
          displayName = nameParts[nameParts.length - 1].replace(/_/g, ' ');
        }

        devices.push({
          id: name, // Use the full PulseAudio sink name as ID
          name: displayName,
          description: `PulseAudio sink: ${driver} (${state})`,
          type: 'pulseaudio'
        });
      }
    }

    return devices;
  }

  _parseAplayList(output) {
    const lines = output.split(/\r?\n/);
    const devices = [];
    let currentCard = null;
    for (const line of lines) {
      const cardMatch = line.match(/^card\s+(\d+):\s+([^,]+),\s*(.+)$/i);
      if (cardMatch) {
        currentCard = { id: cardMatch[1], name: cardMatch[2], desc: cardMatch[3] };
        continue;
      }
      const devMatch = line.match(/^\s*Subdevice\s+(\d+):/i) || line.match(/^\s*device\s+(\d+):\s+([^,]+),\s*(.+)$/i);
      if (devMatch && currentCard) {
        // Build ALSA hw identifier (card,device)
        const deviceNum = devMatch[1];
        const label = devMatch[2] || `Device ${deviceNum}`;
        const desc = devMatch[3] || '';
        devices.push({
          id: `hw:${currentCard.id},${deviceNum}`,
          name: `${currentCard.name} - ${label}`,
          description: `ALSA: ${currentCard.desc}${desc ? ' - ' + desc : ''}`.trim(),
          type: 'alsa'
        });
      }
    }
    if (devices.length === 0) {
      // Ensure at least default
      devices.push({ id: 'default', name: 'Default ALSA Output', description: 'System default audio output' });
    }
    return devices;
  }

  async playTest(deviceId = 'default', durationSec = this.defaultTestDuration) {
    try {
      const wavPath = await this._generateTestWav(durationSec);
      let result;

      // Try PulseAudio first if the device looks like a PulseAudio sink
      if (deviceId !== 'default' && !deviceId.startsWith('hw:')) {
        try {
          // Use paplay for PulseAudio devices
          const args = ['--device', deviceId, wavPath];
          result = await this._runCommand('paplay', args, { timeoutMs: durationSec * 1500 + 3000 });
          logger.info(`Played test tone on PulseAudio device: ${deviceId}`);
        } catch (paErr) {
          logger.warn(`PulseAudio playback failed, trying ALSA: ${paErr.message}`);
          // Fall back to ALSA
          const args = ['-D', deviceId, wavPath];
          result = await this._runCommand('aplay', args, { timeoutMs: durationSec * 1500 + 3000 });
        }
      } else {
        // Use ALSA for hw: devices and default
        const args = [];
        if (deviceId && deviceId !== 'default') {
          args.push('-D', deviceId);
        }
        args.push(wavPath);
        result = await this._runCommand('aplay', args, { timeoutMs: durationSec * 1500 + 3000 });
        logger.info(`Played test tone on ALSA device: ${deviceId}`);
      }

      // Clean up
      try { await fs.unlink(wavPath); } catch (_) {}
      return { success: result.code === 0, stdout: result.stdout, stderr: result.stderr };
    } catch (err) {
      logger.warn('Speaker test failed:', err.message);
      return { success: false, error: err.message };
    }
  }

  async setVolume(percent = 80) {
    // Best-effort: use amixer if available
    const clamped = Math.max(0, Math.min(100, Math.round(percent)));
    try {
      const result = await this._runCommand('amixer', ['-M', 'set', 'Master', `${clamped}%`]);
      return { success: result.code === 0, stdout: result.stdout };
    } catch (err) {
      logger.warn('amixer not available:', err.message);
      return { success: false, error: err.message };
    }
  }

  /**
   * Play audio file using character's configured speaker
   */
  async playAudioForCharacter(audioFilePath, characterId = null) {
    try {
      let deviceId = 'default';

      // Get character's audio output device if character ID is provided
      if (characterId) {
        const characterAudioConfigService = require('./characterAudioConfigService');
        const audioDevice = await characterAudioConfigService.getCharacterAudioOutputDevice(characterId);
        deviceId = audioDevice.device;
        logger.info(`Using character ${characterId} audio device: ${deviceId} (${audioDevice.speakerName})`);
      }

      // Play the audio file using the determined device
      let result;

      // Try PulseAudio first if the device looks like a PulseAudio sink
      if (deviceId !== 'default' && !deviceId.startsWith('hw:')) {
        try {
          // Use paplay for PulseAudio devices
          const args = ['--device', deviceId, audioFilePath];
          result = await this._runCommand('paplay', args, { timeoutMs: 30000 });
          logger.info(`Played audio on PulseAudio device: ${deviceId}`);
        } catch (paErr) {
          logger.warn(`PulseAudio playback failed, trying ALSA: ${paErr.message}`);
          // Fall back to ALSA
          const args = ['-D', deviceId, audioFilePath];
          result = await this._runCommand('aplay', args, { timeoutMs: 30000 });
        }
      } else {
        // Use ALSA for hw: devices and default
        const args = [];
        if (deviceId && deviceId !== 'default') {
          args.push('-D', deviceId);
        }
        args.push(audioFilePath);
        result = await this._runCommand('aplay', args, { timeoutMs: 30000 });
      }

      return { success: result.code === 0, stdout: result.stdout, stderr: result.stderr, device: deviceId };
    } catch (err) {
      logger.error(`Error playing audio for character ${characterId}: ${err.message}`);
      return { success: false, error: err.message };
    }
  }

  async _generateTestWav(durationSec = 3, freq = 440, sampleRate = 44100) {
    const samples = Math.floor(durationSec * sampleRate);
    const buffer = Buffer.alloc(44 + samples * 2); // 16-bit mono
    // RIFF header
    buffer.write('RIFF', 0);
    buffer.writeUInt32LE(36 + samples * 2, 4);
    buffer.write('WAVE', 8);
    buffer.write('fmt ', 12);
    buffer.writeUInt32LE(16, 16); // PCM chunk size
    buffer.writeUInt16LE(1, 20); // PCM format
    buffer.writeUInt16LE(1, 22); // channels
    buffer.writeUInt32LE(sampleRate, 24); // sample rate
    buffer.writeUInt32LE(sampleRate * 2, 28); // byte rate
    buffer.writeUInt16LE(2, 32); // block align
    buffer.writeUInt16LE(16, 34); // bits per sample
    buffer.write('data', 36);
    buffer.writeUInt32LE(samples * 2, 40);
    // Sine wave
    for (let i = 0; i < samples; i++) {
      const t = i / sampleRate;
      const s = Math.sin(2 * Math.PI * freq * t);
      const val = Math.max(-1, Math.min(1, s)) * 0.6; // 60% amplitude
      buffer.writeInt16LE(Math.floor(val * 32767), 44 + i * 2);
    }
    const tmpPath = path.join(os.tmpdir(), `monsterbox_speaker_test_${Date.now()}.wav`);
    await fs.writeFile(tmpPath, buffer);
    return tmpPath;
  }

  _runCommand(cmd, args = [], { timeoutMs = 10000 } = {}) {
    return new Promise((resolve, reject) => {
      const child = spawn(cmd, args);
      let stdout = '';
      let stderr = '';
      const timer = setTimeout(() => {
        try { child.kill(); } catch (_) {}
        reject(new Error(`${cmd} timeout after ${timeoutMs}ms`));
      }, timeoutMs);
      child.stdout.on('data', d => { stdout += d.toString(); });
      child.stderr.on('data', d => { stderr += d.toString(); });
      child.on('error', err => {
        clearTimeout(timer);
        reject(err);
      });
      child.on('close', code => {
        clearTimeout(timer);
        resolve({ code, stdout, stderr });
      });
    });
  }
}

module.exports = SpeakerService;

