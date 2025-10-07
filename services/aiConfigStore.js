import fs from 'fs/promises';
import path from 'path';
import { fileURLToPath } from 'url';
import { readConfig } from './configService.js';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

async function getAIConfigDir() {
  const cfg = await readConfig();
  const appRoot = path.resolve(__dirname, '..');
  const dataDir = cfg && cfg.dataPath ? cfg.dataPath : 'data';
  return path.resolve(appRoot, dataDir, 'ai-config');
}

async function ensureDir() {
  const baseDir = await getAIConfigDir();
  await fs.mkdir(baseDir, { recursive: true });
}

async function readJson(file) {
  try {
    const baseDir = await getAIConfigDir();
    const full = path.join(baseDir, file);
    const txt = await fs.readFile(full, 'utf8');
    return JSON.parse(txt);
  } catch (e) {
    return null;
  }
}

async function writeJson(file, data) {
  await ensureDir();
  const baseDir = await getAIConfigDir();
  const full = path.join(baseDir, file);
  await fs.writeFile(full, JSON.stringify(data, null, 2), 'utf8');
  return data;
}

export async function getSTTConfig() {
  const d = await readJson('stt-config.json');
  return (
    d || {
      model: 'scribe_v1',
      language: 'auto',
      format: 'wav',
      sampleRate: 16000,
      channels: 1,
      microphonePartId: null,
      microphoneDeviceId: null,
    }
  );
}

export async function saveSTTConfig(cfg) {
  return writeJson('stt-config.json', cfg);
}

export async function getTTSConfig() {
  const d = await readJson('tts-config.json');
  return (
    d || {
      voice_id: 'Tj9l48J9AJbry5yCP5eW', // Default: Matthew Schmitz - Nosferatu Ancient Vampire Lord
      model: 'eleven_monolingual_v1',
      stability: 0.5,
      similarity_boost: 0.5,
      style: 0.0,
      use_speaker_boost: true,
    }
  );
}

export async function saveTTSConfig(cfg) {
  return writeJson('tts-config.json', cfg);
}

/**
 * Get TTS config for a specific character
 * Tries data/character-{id}/ai-config/tts-config.json first, falls back to global
 */
export async function getTTSConfigForCharacter(characterId) {
  if (!characterId) {
    return getTTSConfig();
  }

  try {
    const cfg = await readConfig();
    const appRoot = path.resolve(__dirname, '..');
    const baseDataDir = cfg && cfg.dataPath ? cfg.dataPath : path.join('data', `character-${characterId}`);
    const charConfigPath = path.resolve(appRoot, baseDataDir, 'ai-config', 'tts-config.json');

    const txt = await fs.readFile(charConfigPath, 'utf8');
    const parsed = JSON.parse(txt);

    // Merge with defaults to ensure all required fields exist
    return {
      voice_id: parsed.voice_id || 'Tj9l48J9AJbry5yCP5eW',
      model: parsed.model || 'eleven_monolingual_v1',
      stability: typeof parsed.stability === 'number' ? parsed.stability : 0.5,
      similarity_boost: typeof parsed.similarity_boost === 'number' ? parsed.similarity_boost : 0.5,
      style: typeof parsed.style === 'number' ? parsed.style : 0.0,
      use_speaker_boost: typeof parsed.use_speaker_boost === 'boolean' ? parsed.use_speaker_boost : true,
    };
  } catch (e) {
    // Fall back to global config if character-specific config doesn't exist
    return getTTSConfig();
  }
}

export default { getSTTConfig, saveSTTConfig, getTTSConfig, saveTTSConfig, getTTSConfigForCharacter };

