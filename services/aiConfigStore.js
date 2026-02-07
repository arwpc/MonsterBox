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
  const raw = (await readJson('stt-config.json')) || {};
  return {
    model: raw.model ?? 'scribe_v2',
    language: raw.language ?? 'auto',
    format: raw.format ?? 'wav',
    sampleRate: typeof raw.sampleRate === 'number' ? raw.sampleRate : 16000,
    channels: typeof raw.channels === 'number' ? raw.channels : 1,
    microphonePartId: raw.microphonePartId ?? null,
    microphoneDeviceId: raw.microphoneDeviceId ?? null,
    // Voice Activity Detection - optimized for real-world use
    vadEnabled: typeof raw.vadEnabled === 'boolean' ? raw.vadEnabled : true,
    vadThreshold: typeof raw.vadThreshold === 'number' ? raw.vadThreshold : 0.40,
    vadSilenceDuration: typeof raw.vadSilenceDuration === 'number' ? raw.vadSilenceDuration : 500,
    // Audio Filtering - optimized for speech clarity
    audioFilterEnabled: typeof raw.audioFilterEnabled === 'boolean' ? raw.audioFilterEnabled : true,
    highpassFreq: typeof raw.highpassFreq === 'number' ? raw.highpassFreq : 180,
    lowpassFreq: typeof raw.lowpassFreq === 'number' ? raw.lowpassFreq : 4200,
    denoiseLevel: typeof raw.denoiseLevel === 'number' ? raw.denoiseLevel : -22,
    // Text Filtering - reject gibberish and sound effects
    filterSfx: typeof raw.filterSfx === 'boolean' ? raw.filterSfx : true,
    validateEnglish: typeof raw.validateEnglish === 'boolean' ? raw.validateEnglish : true,
    minLetterRatio: typeof raw.minLetterRatio === 'number' ? raw.minLetterRatio : 55,
    requireVowels: typeof raw.requireVowels === 'boolean' ? raw.requireVowels : true,
  };
}

export async function saveSTTConfig(cfg) {
  return writeJson('stt-config.json', cfg);
}

export async function getTTSConfig() {
  const d = await readJson('tts-config.json');
  const base = {
    voice_id: 'Tj9l48J9AJbry5yCP5eW', // Default: Matthew Schmitz - Nosferatu Ancient Vampire Lord
    model: 'eleven_flash_v2_5',
    stability: 0.5,
    similarity_boost: 0.5,
    style: 0.0,
    use_speaker_boost: true,
  };
  return {
    // agent_id is optional and indicates a conversational AI agent to use
    agent_id: d && typeof d.agent_id === 'string' && d.agent_id.trim() ? d.agent_id : undefined,
    voice_id: d && typeof d.voice_id === 'string' && d.voice_id.trim() ? d.voice_id : base.voice_id,
    model: (d && d.model) || base.model,
    stability: d && typeof d.stability === 'number' ? d.stability : base.stability,
    similarity_boost: d && typeof d.similarity_boost === 'number' ? d.similarity_boost : base.similarity_boost,
    style: d && typeof d.style === 'number' ? d.style : base.style,
    use_speaker_boost: d && typeof d.use_speaker_boost === 'boolean' ? d.use_speaker_boost : base.use_speaker_boost,
  };
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
    // Determine data root; if cfg.dataPath already points to a character subdir, use its parent as root
    const dataPath = cfg && cfg.dataPath ? cfg.dataPath : 'data';
    const dataRoot = /character-\d+/.test(dataPath) ? path.dirname(dataPath) : dataPath;
    const baseDataDir = path.join(dataRoot, `character-${characterId}`);
    const charConfigPath = path.resolve(appRoot, baseDataDir, 'ai-config', 'tts-config.json');

    const txt = await fs.readFile(charConfigPath, 'utf8');
    const parsed = JSON.parse(txt);

    // Merge with defaults to ensure all required fields exist
    return {
      // include agent_id if specified for this character
      agent_id: parsed.agent_id && String(parsed.agent_id).trim() ? parsed.agent_id : undefined,
      voice_id: parsed.voice_id && String(parsed.voice_id).trim() ? parsed.voice_id : 'Tj9l48J9AJbry5yCP5eW',
      model: parsed.model || 'eleven_flash_v2_5',
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

