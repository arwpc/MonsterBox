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
  async playBufferOnCharacterSpeaker(buffer, opts = {}) {
    try {
      if (!buffer || !buffer.length) {
        return { success: false, error: 'No audio buffer provided' };
      }
      const characterId = opts.characterId || null;
      const contentType = opts.contentType || 'audio/mpeg';
      const volume = typeof opts.volume === 'number' ? opts.volume : 80;

      const deviceId = characterId ? await getSpeakerDeviceForCharacter(characterId) : 'default';
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

  async stopForCharacter(characterId) {
    try {
      const deviceId = characterId ? await getSpeakerDeviceForCharacter(characterId) : 'default';
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

