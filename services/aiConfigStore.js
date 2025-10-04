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

async function getCharacterAIConfigDir(characterId) {
  const cfg = await readConfig();
  const appRoot = path.resolve(__dirname, '..');
  const dataDir = cfg && cfg.dataPath ? cfg.dataPath : 'data';
  const nid = Number(characterId);
  return path.resolve(appRoot, dataDir, `character-${nid}`, 'ai-config');
}

async function ensureDir() {
  const baseDir = await getAIConfigDir();
  await fs.mkdir(baseDir, { recursive: true });
}

async function readJsonAtDir(dir, file) {
  try {
    const full = path.join(dir, file);
    const txt = await fs.readFile(full, 'utf8');
    return JSON.parse(txt);
  } catch (e) {
    return null;
  }
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

export async function getCharacterTTSConfig(characterId) {
  if (!characterId && characterId !== 0) return getTTSConfig();
  try {
    const dir = await getCharacterAIConfigDir(characterId);
    const d = await readJsonAtDir(dir, 'tts-config.json');
    if (d && d.voice_id) return d;
  } catch (_) {
    // fall back below
  }
  return getTTSConfig();
}

export async function saveCharacterTTSConfig(characterId, cfg) {
  const dir = await getCharacterAIConfigDir(characterId);
  await fs.mkdir(dir, { recursive: true });
  const full = path.join(dir, 'tts-config.json');
  await fs.writeFile(full, JSON.stringify(cfg, null, 2), 'utf8');
  return cfg;
}

export default { getSTTConfig, saveSTTConfig, getTTSConfig, saveTTSConfig, getCharacterTTSConfig, saveCharacterTTSConfig };

