/**
 * Disk cache for scripted scene speech (`sayThis`).
 *
 * Every scene line used to be a live ElevenLabs call on every play: a show
 * paid quota for the same sentence night after night, waited a network round
 * trip before each line, and went silent the moment credits ran out (recorded
 * `quota_exceeded` failures on 2026-08-19 and 2026-09-26). A scripted line is
 * deterministic in everything that shapes its audio — text, voice, model and
 * the two voice settings — so it is rendered once and replayed from disk.
 *
 * Layout: data/tts-cache/<characterId>/<sha256>.<mp3|wav>. Deliberately NOT
 * under data/audio-library/files/, which the library rescan would register as
 * tracks. The directory is gitignored; a deploy from the dev seat carries the
 * dev seat's cache, and a miss on a node simply renders and stores the line.
 *
 * Writes are atomic (temp file + rename) so a power cut mid-write can never
 * leave a truncated clip that a later play would serve as a hit.
 */
import crypto from 'crypto';
import fs from 'fs/promises';
import path from 'path';
import { fileURLToPath } from 'url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const APP_ROOT = path.resolve(__dirname, '..', '..');

const EXT_FOR_TYPE = { 'audio/mpeg': 'mp3', 'audio/mp3': 'mp3', 'audio/wav': 'wav', 'audio/x-wav': 'wav', 'audio/wave': 'wav' };
const TYPE_FOR_EXT = { mp3: 'audio/mpeg', wav: 'audio/wav' };
// Anything smaller than this is not a real rendering (the test-mode stub is
// 12 bytes); never serve or store it.
const MIN_AUDIO_BYTES = 256;

let _tmpCounter = 0;

export function cacheRoot() {
  return process.env.MB_TTS_CACHE_DIR
    ? path.resolve(process.env.MB_TTS_CACHE_DIR)
    : path.resolve(APP_ROOT, 'data', 'tts-cache');
}

function charDir(characterId, root = cacheRoot()) {
  const cid = /^\d+$/.test(String(characterId)) ? String(characterId) : 'shared';
  return path.join(root, cid);
}

/**
 * The cache key: everything that changes the rendered audio, nothing that
 * doesn't. Undefined settings are written as the TTS service's defaults so a
 * config that omits a value and one that spells the default share a clip.
 */
export function ttsCacheKey({ text, voiceId, model, stability, similarity_boost }) {
  const parts = [
    String(text == null ? '' : text),
    String(voiceId || ''),
    String(model || 'eleven_v3'),
    String(stability !== undefined && stability !== null ? Number(stability) : 0.5),
    String(similarity_boost !== undefined && similarity_boost !== null ? Number(similarity_boost) : 0.5)
  ];
  return crypto.createHash('sha256').update(parts.join('\u0000')).digest('hex');
}

/** @returns {Promise<{audioBuffer:Buffer, contentType:string, file:string}|null>} */
export async function getCachedSpeech(characterId, key, root = cacheRoot()) {
  const dir = charDir(characterId, root);
  for (const ext of ['mp3', 'wav']) {
    const file = path.join(dir, `${key}.${ext}`);
    try {
      const audioBuffer = await fs.readFile(file);
      if (audioBuffer.length < MIN_AUDIO_BYTES) continue;
      return { audioBuffer, contentType: TYPE_FOR_EXT[ext], file };
    } catch (_) { /* miss */ }
  }
  return null;
}

/** Atomically store a rendering. Returns the file written, or null if refused. */
export async function putCachedSpeech(characterId, key, audioBuffer, contentType, root = cacheRoot()) {
  if (!Buffer.isBuffer(audioBuffer) || audioBuffer.length < MIN_AUDIO_BYTES) return null;
  const ext = EXT_FOR_TYPE[String(contentType || '').split(';')[0].trim().toLowerCase()] || 'mp3';
  const dir = charDir(characterId, root);
  await fs.mkdir(dir, { recursive: true });
  const file = path.join(dir, `${key}.${ext}`);
  const tmp = path.join(dir, `.${key}.${process.pid}.${_tmpCounter++}.tmp`);
  try {
    await fs.writeFile(tmp, audioBuffer);
    await fs.rename(tmp, file);
    return file;
  } catch (err) {
    try { await fs.unlink(tmp); } catch (_) { /* best effort */ }
    throw err;
  }
}

/**
 * Render a line through the cache.
 * @param {object} a
 * @param {string} a.text
 * @param {string} a.voiceId
 * @param {object} a.ttsCfg      the character's TTS config (model, stability, similarity_boost, ...)
 * @param {number} a.characterId
 * @param {boolean} [a.nocache]  bypass the cache entirely (no read, no write)
 * @param {Function} a.generate  (text, voiceId, ttsCfg) => {success, audioBuffer, contentType, error}
 * @returns {Promise<{success:boolean, audioBuffer?:Buffer, contentType?:string, cached:boolean, key?:string, error?:string}>}
 */
export async function generateSpeechCached({ text, voiceId, ttsCfg = {}, characterId, nocache = false, generate, root = cacheRoot() }) {
  if (typeof generate !== 'function') throw new Error('generateSpeechCached needs a generate function');
  if (nocache) {
    const gen = await generate(text, voiceId, ttsCfg);
    return Object.assign({}, gen, { cached: false, bypassed: true });
  }
  const key = ttsCacheKey({ text, voiceId, model: ttsCfg.model, stability: ttsCfg.stability, similarity_boost: ttsCfg.similarity_boost });
  try {
    const hit = await getCachedSpeech(characterId, key, root);
    if (hit) return { success: true, audioBuffer: hit.audioBuffer, contentType: hit.contentType, cached: true, key, file: hit.file };
  } catch (e) {
    console.warn(`⚠️ TTS cache read failed (${e.message}) — rendering live`);
  }
  const gen = await generate(text, voiceId, ttsCfg);
  if (!gen || !gen.success) return Object.assign({ success: false }, gen || {}, { cached: false, key });
  // Test mode renders a stub; storing it would replay silence on a real run.
  if (process.env.MB_TEST_MODE !== '1') {
    try {
      const file = await putCachedSpeech(characterId, key, gen.audioBuffer, gen.contentType, root);
      return Object.assign({}, gen, { cached: false, key, stored: file });
    } catch (e) {
      console.warn(`⚠️ TTS cache write failed (${e.message}) — line still plays`);
    }
  }
  return Object.assign({}, gen, { cached: false, key });
}

export default { ttsCacheKey, getCachedSpeech, putCachedSpeech, generateSpeechCached, cacheRoot };
