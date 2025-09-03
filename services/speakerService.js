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
    // Try to discover ALSA output devices using `aplay -l`
    try {
      const devices = await this._runCommand('aplay', ['-l']);
      const list = this._parseAplayList(devices.stdout || '');
      return list;
    } catch (err) {
      logger.warn('aplay not available or failed, falling back to default output device');
      return [
        { id: 'default', name: 'Default ALSA Output', description: 'System default audio output' }
      ];
    }
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
          description: `${currentCard.desc}${desc ? ' - ' + desc : ''}`.trim()
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
    // Generate a short WAV file (440 Hz) and play with aplay
    try {
      const wavPath = await this._generateTestWav(durationSec);
      const args = [];
      if (deviceId && deviceId !== 'default') {
        args.push('-D', deviceId);
      }
      args.push(wavPath);
      const result = await this._runCommand('aplay', args, { timeoutMs: durationSec * 1500 + 3000 });
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

