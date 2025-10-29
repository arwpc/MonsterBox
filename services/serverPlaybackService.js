import fs from 'fs/promises';
import os from 'os';
import path from 'path';
import { fileURLToPath } from 'url';
import { readConfig } from './configService.js';
import { runWrapper } from './hardwareService/exec.js';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

async function resolvePartsPath() {
  try {
    const cfg = await readConfig();
    const appRoot = path.resolve(__dirname, '..');
    if (cfg && cfg.dataPath) {
      return path.resolve(appRoot, cfg.dataPath, 'parts.json');
    }
    return path.resolve(appRoot, 'data', 'parts.json');
  } catch (e) {
    const appRoot = path.resolve(__dirname, '..');
    return path.resolve(appRoot, 'data', 'parts.json');
  }
}

async function getSpeakerDeviceForCharacter(characterId) {
  try {
    const partsFile = await resolvePartsPath();
    const content = await fs.readFile(partsFile, 'utf8');
    const parts = JSON.parse(content);
    if (Array.isArray(parts)) {
      const speaker = parts.find(p => String(p.type).toLowerCase() === 'speaker' && Number(p.characterId) === Number(characterId));
      if (speaker) {
        // Try various common fields
        const cfg = speaker.config || {};
        return cfg.outputDevice || cfg.audioDeviceId || speaker.outputDevice || 'default';
      }
    }
  } catch (e) {
    console.warn('⚠️ Could not resolve speaker for character:', e.message);
  }
  return 'default';
}

async function getSpeakerDeviceForPartId(speakerPartId) {
  try {
    const partsFile = await resolvePartsPath();
    const content = await fs.readFile(partsFile, 'utf8');
    const parts = JSON.parse(content);
    if (Array.isArray(parts)) {
      const speaker = parts.find(p => String(p.id) === String(speakerPartId) && String(p.type).toLowerCase() === 'speaker');
      if (speaker) {
        const cfg = speaker.config || {};
        return cfg.outputDevice || cfg.audioDeviceId || speaker.outputDevice || 'default';
      }
    }
  } catch (e) {
    console.warn('⚠️ Could not resolve speaker for partId:', e.message);
  }
  return 'default';
}

function pickExtensionFromContentType(ct) {
  if (!ct) return '.mp3';
  const c = ct.toLowerCase();
  if (c.indexOf('wav') !== -1) return '.wav';
  if (c.indexOf('wave') !== -1) return '.wav';
  if (c.indexOf('mpeg') !== -1 || c.indexOf('mp3') !== -1) return '.mp3';
  if (c.indexOf('ogg') !== -1) return '.ogg';
  return '.mp3';
}

async function writeTempAudio(buffer, contentType) {
  const ext = pickExtensionFromContentType(contentType);
  const tmpDir = os.tmpdir();
  const filePath = path.join(tmpDir, `mb_tts_${Date.now()}_${Math.floor(Math.random() * 1e6)}${ext}`);
  await fs.writeFile(filePath, buffer);
  return filePath;
}

class ServerPlaybackService {
  constructor() {
    // Streaming players keyed by characterId
    this._streams = new Map();
    this._lastPlay = null; // telemetry for tests/diagnostics
  }

  async _resolveDeviceId(opts = {}) {
    const characterId = opts.characterId || null;
    if (opts.deviceId) return opts.deviceId;
    if (opts.speakerPartId) return await getSpeakerDeviceForPartId(opts.speakerPartId);
    if (characterId) return await getSpeakerDeviceForCharacter(characterId);
    return 'default';
  }

  _calcMpg123Scale(volume) {
    const vol = typeof volume === 'number' ? Math.max(0, Math.min(100, volume)) : 80;
    return Math.max(0, Math.min(32768, Math.round(32768 * (vol / 100))));
  }

  async _ensureMp3Stream(opts = {}) {
    const key = String(opts.characterId || 'default');
    let rec = this._streams.get(key);
    if (rec && rec.proc && !rec.proc.killed) {
      return rec;
    }

    const deviceId = await this._resolveDeviceId(opts);
    const volume = typeof opts.volume === 'number' ? opts.volume : 80;

    const env = { ...process.env };
    if (deviceId && deviceId !== 'default') env.PULSE_SINK = deviceId;

    const { spawn } = await import('child_process');

    // Use mpg123 to play MP3 stream directly (no conversion needed)
    // Calculate volume scale (0-32768) from percentage (0-100)
    const scale = Math.max(0, Math.min(32768, Math.floor(32768 * (volume / 100.0))));
    const mpg123Args = ['--quiet', '-o', 'pulse', '-f', String(scale), '-'];

    console.log(`🎵 Starting mpg123 audio stream for character ${key}: device=${deviceId}, volume=${volume}`);

    // Start mpg123 to play MP3 from stdin
    const mpg123 = spawn('mpg123', mpg123Args, { env });

    // Handle errors to prevent EPIPE crashes
    mpg123.stdin.on('error', (err) => {
      console.error(`mpg123 stdin error for ${key}:`, err.message);
      this._streams.delete(key);
    });

    mpg123.stderr.on('data', (data) => {
      const msg = data.toString();
      if (!msg.includes('ALSA lib') && !msg.includes('Playing MPEG')) {
        console.error(`mpg123 stderr for ${key}:`, msg.trim());
      }
    });

    mpg123.on('exit', (code, signal) => {
      console.log(`mpg123 exited for ${key} with code ${code}, signal ${signal}`);
      const cur = this._streams.get(key);
      if (cur && cur.proc === mpg123) this._streams.delete(key);
    });

    rec = { proc: mpg123, deviceId, contentType: 'audio/mpeg', writerBusy: false };
    this._streams.set(key, rec);
    return rec;
  }

  async writeMp3Stream(buffer, opts = {}) {
    if (!buffer || !buffer.length) return { success: false, error: 'empty_buffer' };
    const rec = await this._ensureMp3Stream(opts);
    console.log(`🔊 Writing ${buffer.length} bytes to mpg123 stream (device: ${rec.deviceId})`);
    return new Promise((resolve) => {
      const ok = rec.proc.stdin.write(buffer);
      const done = () => {
        // Record last-play telemetry
        this._lastPlay = {
          ts: Date.now(),
          characterId: opts.characterId || null,
          deviceId: rec.deviceId,
          player: 'mpg123',
          contentType: 'audio/mpeg',
          streamed: buffer.length,
          volume: typeof opts.volume === 'number' ? opts.volume : 80,
          simulated: false
        };
        resolve({ success: true, streamed: buffer.length, deviceId: rec.deviceId });
      };
      if (ok) return done();
      rec.proc.stdin.once('drain', done);
    });
  }

  async stopStream(opts = {}) {
    const key = String(opts.characterId || 'default');
    const rec = this._streams.get(key);
    if (!rec) return { success: true };
    try { rec.proc.stdin.end(); } catch (_) { }
    try { rec.proc.kill('SIGTERM'); } catch (_) { }
    if (rec.paplay) {
      try { rec.paplay.stdin.end(); } catch (_) { }
      try { rec.paplay.kill('SIGTERM'); } catch (_) { }
    }
    this._streams.delete(key);
    return { success: true };
  }

  async playBufferOnCharacterSpeaker(buffer, opts = {}) {
    try {
      if (!buffer || !buffer.length) {
        return { success: false, error: 'No audio buffer provided' };
      }
      const characterId = opts.characterId || null;
      const contentType = opts.contentType || 'audio/mpeg';
      const volume = typeof opts.volume === 'number' ? opts.volume : 80;

      // In automated test mode, avoid invoking system audio; just record telemetry
      if (process.env.MB_TEST_MODE === '1' || process.env.MB_TEST_MODE === 'true') {
        const deviceId = await this._resolveDeviceId({ characterId, deviceId: opts.deviceId, speakerPartId: opts.speakerPartId });
        this._lastPlay = {
          ts: Date.now(),
          characterId,
          deviceId,
          player: (String(contentType).toLowerCase().includes('mpeg') ? 'mpg123' : 'pw-play'),
          contentType,
          streamed: (String(contentType).toLowerCase().includes('mpeg') ? buffer.length : 0),
          volume,
          simulated: true
        };
        return { success: true, deviceId, player: this._lastPlay.player, simulated: true };
      }

      // Streaming fast-path for MP3 chunks
      if ((contentType || '').toLowerCase().includes('mpeg') || (contentType || '').toLowerCase().includes('mp3')) {
        const res = await this.writeMp3Stream(buffer, { characterId, volume, deviceId: opts.deviceId, speakerPartId: opts.speakerPartId });
        if (res && res.success) return { success: true, streamed: buffer.length, deviceId: res.deviceId, player: 'mpg123' };
        // if streaming failed, fall through to file-based
      }

      // Determine output device priority: explicit deviceId > speakerPartId > character speaker > default
      const deviceId = await this._resolveDeviceId({ characterId, deviceId: opts.deviceId, speakerPartId: opts.speakerPartId });

      const tmpFile = await writeTempAudio(buffer, contentType);

      // Use speaker_cli.py wrapper which handles PipeWire routing and players
      const args = ['play', tmpFile, String(volume), '--device', deviceId];
      let raw = await runWrapper('speaker_cli.py', args, { enableLogging: false, timeoutMs: 15000 });
      let parsed = null; try { parsed = JSON.parse(raw); } catch (_) { }

      const result = {
        success: parsed ? (parsed.status === 'success') : true,
        deviceId,
        file: tmpFile,
        player: parsed && parsed.player,
        volume,
        message: parsed && parsed.message
      };
      // Record telemetry
      this._lastPlay = {
        ts: Date.now(),
        characterId,
        deviceId,
        player: result.player || (String(contentType).toLowerCase().includes('wav') ? 'pw-play' : 'unknown'),
        contentType,
        streamed: 0,
        volume,
        simulated: false
      };
      return result;
    } catch (error) {
      console.error('ServerPlaybackService error:', error);
      return { success: false, error: error.message };
    }
  }

  async stopForCharacter(characterId, opts = {}) {
    try {
      // Stop managed stream first
      try { await this.stopStream({ characterId, deviceId: opts.deviceId, speakerPartId: opts.speakerPartId }); } catch (_) { }

      // Determine device for stopping: explicit deviceId > speakerPartId > character speaker > default
      let deviceId = 'default';
      if (opts.deviceId) {
        deviceId = opts.deviceId;
      } else if (opts.speakerPartId) {
        deviceId = await getSpeakerDeviceForPartId(opts.speakerPartId);
      } else if (characterId) {
        deviceId = await getSpeakerDeviceForCharacter(characterId);
      }
      try {
        await runWrapper('speaker_cli.py', ['stop', '--device', deviceId], { enableLogging: false, timeoutMs: 5000 });
      } catch (_) { /* best-effort */ }
      return { success: true, deviceId };
    } catch (error) {
      return { success: false, error: error.message };
    }
  }

  async stopAll() {
    try {
      // Stop all managed streams
      for (const [key, rec] of this._streams) {
        try { rec.proc.stdin.end(); } catch (_) { }
        try { rec.proc.kill('SIGTERM'); } catch (_) { }
        if (rec.paplay) {
          try { rec.paplay.stdin.end(); } catch (_) { }
          try { rec.paplay.kill('SIGTERM'); } catch (_) { }
        }
      }
      this._streams.clear();
      try {
        await runWrapper('speaker_cli.py', ['stop'], { enableLogging: false, timeoutMs: 5000 });
      } catch (_) { /* best-effort */ }
      return { success: true };
    } catch (error) {
      return { success: false, error: error.message };
    }
  }

  // Expose last playback telemetry for diagnostics/tests
  getLastPlay() {
    return this._lastPlay ? { ...this._lastPlay } : null;
  }
}

export default new ServerPlaybackService();

