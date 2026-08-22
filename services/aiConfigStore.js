import fs from 'fs/promises';
import path from 'path';
import { fileURLToPath } from 'url';
import { readConfig } from './configService.js';
import { writeJsonAtomic, withFileLock } from './atomicStore.js';

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
  // These files hold voice identity. A torn write on power loss would strip
  // voice_id, and getTTSConfigForCharacter would then refuse to speak for that
  // character until the file is repaired — atomic rename means the old config
  // survives any interrupted save.
  await writeJsonAtomic(full, data);
  return data;
}

/**
 * Merge a partial update over what is already on disk.
 *
 * These files hold a character's IDENTITY — which voice it speaks in, how fast —
 * alongside ordinary tunables. The settings UI only exposes some of those fields,
 * so a wholesale replace meant saving a slider silently deleted voice_id and
 * speed and the character started speaking in the shared fallback voice. Observed
 * for real: a browser-test pass through the AI settings page stripped a
 * character's voice mid-run.
 *
 * A save must only ever change what the caller actually sent.
 */
async function mergeJson(file, patch) {
  // The read-modify-write must be serialized per file: two concurrent partial
  // saves (e.g. the settings page saving two panels at once) would otherwise
  // each read the same base and the second write would drop the first's keys —
  // the same clobber class the merge itself exists to prevent.
  const baseDir = await getAIConfigDir();
  return withFileLock(path.join(baseDir, file), async () => {
    const existing = (await readJson(file)) || {};
    const merged = { ...existing };
    for (const [k, v] of Object.entries(patch || {})) {
      if (v !== undefined) merged[k] = v;
    }
    return writeJson(file, merged);
  });
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
    // Far-field arrays only (e.g. ReSpeaker XVF3800): transcribe once per
    // utterance from a gapless stream instead of per polled 0.3s chunk.
    // Default false = legacy per-chunk behavior for lavalier/dongle nodes.
    utteranceAggregation: typeof raw.utteranceAggregation === 'boolean' ? raw.utteranceAggregation : false,
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
  // Merge, never replace: a partial save must not silently drop the fields the
  // caller did not send (e.g. microphonePartId).
  return mergeJson('stt-config.json', cfg);
}

// Voice identity is DATA, not code: every character's canonical voice and
// speaking speed live in data/character-{id}/ai-config/tts-config.json, synced
// from the committed agent snapshots in config/elevenlabs/agents/.
//
// There is deliberately NO default voice constant here any more. There used to
// be one, described as a neutral shared fallback — but its value was one
// specific cast member's voice_id. So every character that was missing a
// voice_id silently spoke AS that character. That is the mechanism behind the
// wrong-voice bug where several characters all came out sounding like the same
// one: they had not been given a voice, and the "safe" fallback handed them
// somebody else's identity, with nothing but a one-line warning to show for it.
//
// Silently wrong is the worst possible failure mode for voice identity — it
// survived undetected across four characters. A missing voice is a data bug, and
// it now fails loudly instead of impersonating a real cast member.

/** Thrown when a character has been asked to speak but has no configured voice. */
export class MissingVoiceConfigError extends Error {
  constructor(characterId) {
    super(
      `No voice_id configured for character ${characterId}. Voice identity is data: set voice_id in ` +
      `data/character-${characterId}/ai-config/tts-config.json from the agent snapshot in ` +
      `config/elevenlabs/agents/. Refusing to speak in another character's voice.`
    );
    this.name = 'MissingVoiceConfigError';
    this.code = 'NO_VOICE_CONFIGURED';
    this.characterId = characterId;
  }
}

// ElevenLabs accepts 0.7–1.2; anything outside is rejected for the whole request.
function clampSpeed(value, fallback) {
  if (typeof value !== 'number' || Number.isNaN(value)) return fallback;
  return Math.min(1.2, Math.max(0.7, value));
}

function resolveVoiceId(parsedVoiceId, characterId) {
  if (parsedVoiceId && String(parsedVoiceId).trim()) return String(parsedVoiceId).trim();
  throw new MissingVoiceConfigError(characterId);
}

/**
 * TTS config for the CURRENTLY SELECTED character.
 *
 * Despite the name this is not a neutral global: it reads config.dataPath, which
 * is data/character-{selected}. It is therefore only safe for callers that mean
 * "the current character" — never as a fallback for some OTHER named character,
 * which would hand that character the selected character's voice.
 *
 * Deliberately non-throwing: it backs the AI-settings GET endpoint, which must
 * render even when no voice is chosen yet. When none is configured `voice_id` is
 * null — explicitly absent rather than quietly borrowed. The retry-fallback
 * callers already guard on `voice_id` being truthy, so null means "no fallback
 * available" instead of "retry in somebody else's voice".
 */
export async function getTTSConfig() {
  const d = await readJson('tts-config.json');
  const base = {
    voice_id: null,
    model: 'eleven_v3',
    stability: 0.5,
    similarity_boost: 0.5,
  };
  return {
    // agent_id is optional and indicates a conversational AI agent to use
    agent_id: d && typeof d.agent_id === 'string' && d.agent_id.trim() ? d.agent_id : undefined,
    // Conversational mode: does this character talk through its ElevenLabs AGENT
    // (server-side voice, agent prompt, agent TTS settings) or through MonsterBox's
    // own one-shot TTS using the values in this file?
    //
    // It matters because the two are not interchangeable. Every agent has
    // overrides.conversation_config_override.tts.* set to FALSE, so stability,
    // similarity_boost, speed, voice_id and model CANNOT reach a conversation —
    // they only bite on the one-shot path. Without this flag the settings page has
    // no way to tell the operator which of its controls are live right now.
    conversationalMode: !!(d && d.conversationalMode),
    voice_id: d && typeof d.voice_id === 'string' && d.voice_id.trim() ? d.voice_id : base.voice_id,
    model: (d && d.model) || base.model,
    stability: d && typeof d.stability === 'number' ? d.stability : base.stability,
    similarity_boost: d && typeof d.similarity_boost === 'number' ? d.similarity_boost : base.similarity_boost,
    speed: clampSpeed(d && d.speed, 1.0),
    // style and use_speaker_boost are only used by pre-v3 models
    style: d && typeof d.style === 'number' ? d.style : 0.0,
    use_speaker_boost: d && typeof d.use_speaker_boost === 'boolean' ? d.use_speaker_boost : true,
  };
}

export async function saveTTSConfig(cfg) {
  // Merge, never replace: see mergeJson. Saving a stability slider must not
  // delete the character's voice.
  return mergeJson('tts-config.json', cfg);
}

/**
 * Get TTS config for a specific character.
 *
 * Reads data/character-{id}/ai-config/tts-config.json. If a character was named
 * but no voice_id can be resolved for it, this THROWS MissingVoiceConfigError
 * rather than returning a borrowed voice — see the note above the error class.
 *
 * The character-less call (no characterId) is the one explicit exception: it
 * returns the global config, whose voice_id may be null. That path is for
 * callers that have no character to impersonate in the first place.
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

    // Merge with defaults — use character-specific default voice, never another character's
    return {
      // include agent_id if specified for this character
      agent_id: parsed.agent_id && String(parsed.agent_id).trim() ? parsed.agent_id : undefined,
      conversationalMode: !!parsed.conversationalMode,
      voice_id: resolveVoiceId(parsed.voice_id, characterId),
      model: parsed.model || 'eleven_v3',
      stability: typeof parsed.stability === 'number' ? parsed.stability : 0.5,
      similarity_boost: typeof parsed.similarity_boost === 'number' ? parsed.similarity_boost : 0.5,
      speed: clampSpeed(parsed.speed, 1.0),
      style: typeof parsed.style === 'number' ? parsed.style : 0.0,
      use_speaker_boost: typeof parsed.use_speaker_boost === 'boolean' ? parsed.use_speaker_boost : true,
    };
  } catch (e) {
    // A character with a config file but no voice in it is a data bug, not a
    // missing-file condition — let it out rather than swallowing it into a
    // fallback, which is exactly how the wrong-voice bug stayed invisible.
    if (e instanceof MissingVoiceConfigError) throw e;

    // No per-character config on disk. This used to fall back to getTTSConfig(),
    // which reads config.dataPath — i.e. the CURRENTLY SELECTED character's
    // ai-config, not a neutral global one. So a character with no config of its
    // own spoke in the voice of whichever character happened to be selected on
    // that node. That is a second, independent impersonation path and it is why
    // the wrong voice tracked "whoever the fallback belonged to". A named
    // character's voice now comes from that character's own file or nowhere.
    throw new MissingVoiceConfigError(characterId);
  }
}

export default { getSTTConfig, saveSTTConfig, getTTSConfig, saveTTSConfig, getTTSConfigForCharacter };

