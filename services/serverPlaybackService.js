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
    const args = ['--quiet', '-'];
    const scale = this._calcMpg123Scale(volume);
    if (scale > 0) args.splice(0, 0, '-f', String(scale));
    const proc = spawn('mpg123', args, { env });

    proc.on('exit', () => {
      const cur = this._streams.get(key);
      if (cur && cur.proc === proc) this._streams.delete(key);
    });

    rec = { proc, deviceId, contentType: 'audio/mpeg', writerBusy: false };
    this._streams.set(key, rec);
    return rec;
  }

  async writeMp3Stream(buffer, opts = {}) {
    if (!buffer || !buffer.length) return { success: false, error: 'empty_buffer' };
    const rec = await this._ensureMp3Stream(opts);
    return new Promise((resolve) => {
      const ok = rec.proc.stdin.write(buffer);
      if (ok) return resolve({ success: true, streamed: buffer.length, deviceId: rec.deviceId });
      rec.proc.stdin.once('drain', () => resolve({ success: true, streamed: buffer.length, deviceId: rec.deviceId }));
    });
  }

  async stopStream(opts = {}) {
    const key = String(opts.characterId || 'default');
    const rec = this._streams.get(key);
    if (!rec) return { success: true };
    try { rec.proc.stdin.end(); } catch (_) {}
    try { rec.proc.kill('SIGTERM'); } catch (_) {}
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

      return {
        success: parsed ? (parsed.status === 'success') : true,
        deviceId,
        file: tmpFile,
        player: parsed && parsed.player,
        volume,
        message: parsed && parsed.message
      };
    } catch (error) {
      console.error('ServerPlaybackService error:', error);
      return { success: false, error: error.message };
    }
  }

  async stopForCharacter(characterId, opts = {}) {
    try {
      // Stop managed stream first
      try { await this.stopStream({ characterId, deviceId: opts.deviceId, speakerPartId: opts.speakerPartId }); } catch (_) {}

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
        try { rec.proc.stdin.end(); } catch (_) {}
        try { rec.proc.kill('SIGTERM'); } catch (_) {}
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
}

export default new ServerPlaybackService();

