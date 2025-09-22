import fs from 'fs/promises';
import path from 'path';
import { fileURLToPath } from 'url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

const BASE_DIR = path.resolve(__dirname, '..', 'data', 'ai-config');

async function ensureDir() {
  await fs.mkdir(BASE_DIR, { recursive: true });
}

async function readJson(file) {
  try {
    const full = path.join(BASE_DIR, file);
    const txt = await fs.readFile(full, 'utf8');
    return JSON.parse(txt);
  } catch (e) {
    return null;
  }
}

async function writeJson(file, data) {
  await ensureDir();
  const full = path.join(BASE_DIR, file);
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

export default { getSTTConfig, saveSTTConfig, getTTSConfig, saveTTSConfig };

