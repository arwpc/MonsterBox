import { spawn as nodeSpawn, spawnSync } from 'child_process';
import fs from 'fs/promises';
import { readFileSync } from 'fs';
import { writeJsonAtomic } from './atomicStore.js';
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

// Resolve PipeWire sink ID from a speaker part object.
// Canonical field: config.audioDeviceId — legacy fallbacks kept for backward compat.
/**
 * Watchdog budget for one playback, scaled to how long the audio actually is.
 *
 * WHY: this was a flat 15000ms at all three player call sites. The timer exists so a
 * stuck audio device cannot hang the request, but a fixed 15s is also a hard ceiling
 * on utterance length: anything longer was SIGTERMed mid-sentence and returned
 * playback_timeout, so the caller saw a failure and the listener heard the line cut
 * off partway. A 16.3s character line — an ordinary length for a scene — reproduced it
 * every time.
 *
 * Estimate the real duration from the payload, then allow generous headroom on top so
 * a slow decode or a resuming sink still finishes. Short clips keep the old 15s floor,
 * so nothing that worked before waits any longer to fail.
 *
 * @returns {number} milliseconds
 */
function _playbackTimeoutMs(buffer, contentType = '') {
  const FLOOR_MS = 15000;    // unchanged behaviour for anything short
  const CEILING_MS = 300000; // a genuinely stuck device still fails, just not at 15s
  const len = (buffer && buffer.length) || 0;
  if (!len) return FLOOR_MS;

  let estMs = 0;
  if (/wav|wave|pcm/i.test(contentType)) {
    // RIFF byte-rate lives at offset 28 as uint32 LE. Fall back to 16kHz/16-bit mono.
    let byteRate = 0;
    try {
      if (len > 44 && buffer.slice(0, 4).toString('ascii') === 'RIFF') {
        byteRate = buffer.readUInt32LE(28);
      }
    } catch (_) { /* fall through to the assumption below */ }
    if (!byteRate || byteRate < 1000) byteRate = 16000 * 2;
    estMs = ((len - 44) / byteRate) * 1000;
  } else {
    // ElevenLabs MP3 is 128 kbps => 16000 bytes/sec. Over-estimating the duration only
    // buys more headroom, so a wrong guess here fails safe.
    estMs = (len / 16000) * 1000;
  }

  return Math.max(FLOOR_MS, Math.min(CEILING_MS, Math.round(estMs * 1.5) + 5000));
}

function _resolveSpeakerDevice(speaker) {
  if (!speaker) return 'default';
  const cfg = speaker.config || {};
  // Canonical field first, then legacy variants
  return cfg.audioDeviceId || cfg.outputDevice || cfg.device || cfg.deviceName ||
         cfg.pulseSink || cfg.sink || cfg.outputSink ||
         speaker.audioDeviceId || speaker.outputDevice || speaker.deviceName ||
         speaker.pulseSink || speaker.sink || 'default';
}

async function getSpeakerDeviceForCharacter(characterId) {
  try {
    const partsFile = await resolvePartsPath();
    const content = await fs.readFile(partsFile, 'utf8');
    const parts = JSON.parse(content);
    if (Array.isArray(parts)) {
      const speaker = parts.find(p => String(p.type).toLowerCase() === 'speaker' && Number(p.characterId) === Number(characterId));
      return _resolveSpeakerDevice(speaker);
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
      return _resolveSpeakerDevice(speaker);
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

// Canonical default volume for all playback paths (0-100)
const DEFAULT_VOLUME = 100;

// A drained stop ends the player's stdin and lets it play out what it already
// holds. pw-play and mpg123 both exit on their own at EOF (measured on an XVF3800 node:
// 2.0 s of PCM, exit 0 at 2096 ms), so this timer is only a safety net for a
// player that hangs instead of exiting: it fires after the audio the player was
// handed should have finished, plus slack, and never later than the cap.
const DRAIN_SLACK_MS = 2500;
const DRAIN_CAP_MS = 60000;

/**
 * Key of one persistent PCM player.
 *
 * `owner` separates players that share a character and a device. A browser
 * test session and the headless agent used to share ONE pw-play per
 * character, so when the browser tab closed (or changed speaker part, or was
 * reaped) it killed the player the headless agent was speaking through: the
 * character stopped mid-sentence because someone closed a laptop. Each session
 * now owns its own player and can only ever stop that one.
 *
 * Legacy callers pass no owner and keep the historical key, so
 * `stopPcmStream({ characterId })` without an owner still stops everything the
 * character has, exactly as before.
 */
function pcmStreamKey(characterId, deviceId, owner) {
  return 'pcm_' + String(characterId || 'default') + '_' + String(deviceId || 'default') + (owner ? '#' + owner : '');
}

function mp3StreamKey(characterId, owner) {
  return String(characterId || 'default') + (owner ? '#' + owner : '');
}

function keyOwner(key) {
  const i = key.indexOf('#');
  return i === -1 ? null : key.slice(i + 1);
}

class ServerPlaybackService {
  constructor() {
    // Streaming players keyed by characterId
    this._streams = new Map();
    // Persistent PCM (raw audio) streams for real-time ConvAI playback
    this._pcmStreams = new Map();
    this._lastPlay = null; // telemetry for tests/diagnostics
    this._lastAIPlay = null; // dedicated telemetry for AI playback
    // Restored from disk, not defaulted. See _loadMuteState().
    this._speakerMuted = this._loadMuteState();
    this._mpg123Available = this._detectMpg123();
    this._ffmpegAvailable = this._detectCmd('ffmpeg');
    this._pwplayAvailable = this._detectCmd('pw-play');
    // Probed on first use, not here: see _pwplayRawArgs().
    this._pwplayRaw = null;
    // Persistent players are spawned through this so the stream bookkeeping can
    // be unit-tested without a sound server.
    this._spawn = nodeSpawn;
    // Players that were asked to finish what they hold and exit. They are no
    // longer in _pcmStreams/_streams (a new write must not land in a player that
    // is closing), so explicit stops have to be able to find them here.
    this._draining = new Set();
    // Per character+owner write chains for callers that do not pass a device:
    // device resolution is async, and two un-awaited writes must still reach the
    // player in the order they were made.
    this._pcmWriteChains = new Map();
  }

  /**
   * Where the speaker mute flag survives a restart.
   *
   * Node-local runtime state, alongside actuator-positions.json and
   * movement-telemetry.json, and gitignored for the same reason: it describes THIS
   * node right now, not the project.
   */
  _muteStatePath() {
    return path.resolve(__dirname, '..', 'data', 'speaker-state.json');
  }

  /**
   * The mute flag used to be initialised to `false` in the constructor and kept only
   * in memory, so every restart of monsterbox.service — a crash, a deploy, a plain
   * `systemctl restart` — silently re-armed every speaker in the house. An operator
   * who muted for the night got audio back with no warning and no log line.
   *
   * That is not a theoretical risk: the household was woken at 00:20 by two
   * animatronics talking, the fleet was muted in response, and a single restart
   * would have undone it.
   *
   * Reading synchronously is deliberate — it happens exactly once, at construction,
   * and the flag must be correct BEFORE anything can ask whether it may make noise.
   * A missing or unreadable file defaults to unmuted, which is the historical
   * behaviour, so this is strictly non-regressive.
   */
  _loadMuteState() {
    try {
      const parsed = JSON.parse(readFileSync(this._muteStatePath(), 'utf8') || '{}');
      const muted = parsed.speakerMuted === true;
      if (muted) console.log('🔇 Speaker mute restored from disk — this node boots muted');
      return muted;
    } catch (_) {
      return false;
    }
  }

  async _persistMuteState(muted) {
    try {
      await writeJsonAtomic(this._muteStatePath(), {
        speakerMuted: !!muted,
        updatedAt: new Date().toISOString()
      });
    } catch (e) {
      // Never let a failed state write break the mute itself — the in-memory flag
      // is authoritative for this process; the file only has to be right by the
      // time the next one boots.
      console.error('Failed to persist speaker mute state:', e);
    }
  }

  /**
   * Set the mute flag and persist it.
   *
   * Returns a promise, and callers MUST await it. This used to fire the persist and
   * forget, which made the on-disk flag a race: two rapid toggles (mute then unmute
   * — exactly what the dashboard toggle and the API test both do) issue two atomic
   * writes with no ordering guarantee, so the LOSING write could land last and the
   * node would boot muted. Because the flag is deliberately persisted so a restart
   * cannot un-mute the house overnight, a lost update here is not cosmetic: the show
   * plays silence, survives every restart, and the only symptom is nothing coming
   * out of the speakers.
   *
   * Writes are serialized on a single chain so the last caller always wins.
   */
  setSpeakerMuted(muted) {
    this._speakerMuted = !!muted;
    const next = this._speakerMuted;
    this._mutePersistChain = Promise.resolve(this._mutePersistChain)
      .catch(() => {})
      .then(() => this._persistMuteState(next));
    return this._mutePersistChain;
  }

  isSpeakerMuted() {
    return this._speakerMuted;
  }

  _detectMpg123() {
    try {
      const r = spawnSync('mpg123', ['--version'], { encoding: 'utf8' });
      return r && r.status === 0;
    } catch (_) {
      return false;
    }
  }

  /**
   * Headerless PCM on stdin needs `--raw` from PipeWire 1.4 on (Debian 13 / Pi 5).
   *
   * Bookworm's pw-play (1.2.x) has no such flag and plays raw stdin as-is. 1.4.2
   * hands stdin to libsndfile instead, which answers "Format not recognised",
   * pw-play exits, and every chunk the conversation writes lands as EPIPE — the
   * stream is re-spawned per chunk and the node says nothing while writePcmStream
   * reports success. Found in Renfield's .err after his first conversation.
   * Probed once per process from the tool's own --help; absent flag = old syntax.
   */
  _pwplayRawArgs() {
    if (this._pwplayRaw === null) {
      try {
        const r = spawnSync('pw-play', ['--help'], { encoding: 'utf8', timeout: 3000 });
        this._pwplayRaw = /--raw\b/.test(String(r.stdout || '') + String(r.stderr || ''));
      } catch (_) {
        this._pwplayRaw = false;
      }
    }
    return this._pwplayRaw ? ['--raw'] : [];
  }

  _detectCmd(cmd) {
    try {
      const r = spawnSync(cmd, ['--version'], { encoding: 'utf8' });
      if (r && r.status === 0) return true;
      // Some tools use -version instead of --version
      const r2 = spawnSync(cmd, ['-version'], { encoding: 'utf8' });
      return r2 && r2.status === 0;
    } catch (_) {
      return false;
    }
  }

  async _resolveDeviceId(opts = {}) {
    const characterId = opts.characterId || null;
    if (opts.deviceId) return opts.deviceId;
    if (opts.speakerPartId) return await getSpeakerDeviceForPartId(opts.speakerPartId);
    if (characterId) return await getSpeakerDeviceForCharacter(characterId);
    return 'default';
  }

  /**
   * Resolve a character's (or speaker part's) output device ONCE, so a caller
   * that streams many chunks can pass `deviceId` on every write.
   *
   * Without this every conversation chunk re-read app-config.json and parts.json
   * from the SD card before it could be written (two disk reads and two JSON
   * parses roughly four times a second), and, because those reads were async and
   * the writes were not awaited, chunks could reach the player out of order.
   */
  async resolveSpeakerDevice(opts = {}) {
    try {
      return await this._resolveDeviceId(opts);
    } catch (e) {
      console.warn('⚠️ Could not resolve speaker device, using default:', e.message);
      return 'default';
    }
  }

  _calcMpg123Scale(volume) {
    const vol = typeof volume === 'number' ? Math.max(0, Math.min(100, volume)) : DEFAULT_VOLUME;
    return Math.max(0, Math.min(32768, Math.round(32768 * (vol / 100))));
  }

  async _ensureMp3Stream(opts = {}) {
    if (!this._mpg123Available) {
      throw new Error('mpg123_not_available');
    }
    const key = mp3StreamKey(opts.characterId, opts.owner);
    const volume = typeof opts.volume === 'number' ? opts.volume : DEFAULT_VOLUME;
    // mpg123's -f scale is fixed at spawn time, so a warm stream physically cannot
    // honour a new volume. Reusing it unconditionally pinned every later playback
    // to the FIRST volume ever requested for this character: one play from the
    // audio player's slider (default 80%, draggable to 0) left the whole audio
    // library attenuated until the service restarted, while TTS — a fresh one-shot
    // mpg123 per call — stayed at full scale. That is the "library quiet, TTS loud"
    // report. Measured on Sir Dragomir: play at volume 30 spawned `-f 9830`, and a
    // following play at volume 100 reused the same process, still at `-f 9830`.
    const wantScale = this._calcMpg123Scale(volume);
    let rec = this._streams.get(key);
    if (rec && rec.proc && !rec.proc.killed) {
      if (rec.scale === wantScale) return rec;
      try { rec.proc.stdin.end(); } catch (_) { /* already gone */ }
      try { rec.proc.kill('SIGTERM'); } catch (_) { /* already gone */ }
      this._streams.delete(key);
      rec = null;
    }

    const deviceId = await this._resolveDeviceId(opts);

    const env = { ...process.env };
    if (deviceId && deviceId !== 'default') env.PULSE_SINK = deviceId;

    // Use mpg123 to play MP3 stream directly (no conversion needed)
    const scale = wantScale;
    const mpg123Args = ['--quiet', '-o', 'pulse', '-f', String(scale), '-'];

    console.log(`🎵 Starting mpg123 audio stream for character ${key}: device=${deviceId}, volume=${volume}`);

    // Start mpg123 to play MP3 from stdin
    const mpg123 = this._spawn('mpg123', mpg123Args, { env });

    // A missing binary is reported as an 'error' event on the child; with no
    // listener Node rethrows it and takes the whole server down.
    mpg123.on('error', (err) => {
      console.error(`mpg123 spawn error for ${key}:`, err && err.message);
      const cur = this._streams.get(key);
      if (cur && cur.proc === mpg123) this._streams.delete(key);
    });

    // Handle errors to prevent EPIPE crashes
    mpg123.stdin.on('error', (err) => {
      console.error(`mpg123 stdin error for ${key}:`, err.message);
      const cur = this._streams.get(key);
      if (cur && cur.proc === mpg123) this._streams.delete(key);
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

    rec = { proc: mpg123, deviceId, scale, contentType: 'audio/mpeg', writerBusy: false,
            owner: opts.owner || null, characterKey: String(opts.characterId || 'default'), playsUntilMs: 0 };
    this._streams.set(key, rec);
    return rec;
  }

  /**
   * Pre-warm the mpg123 stream for a character so it's ready for immediate playback.
   * Returns the resolved device ID.
   */
  async warmUpStream(opts = {}) {
    if (!this._mpg123Available) return null;
    try {
      const rec = await this._ensureMp3Stream(opts);
      return rec ? rec.deviceId : null;
    } catch (_) {
      return null;
    }
  }

  async writeMp3Stream(buffer, opts = {}) {
    if (!buffer || !buffer.length) return { success: false, error: 'empty_buffer' };
    if (this._speakerMuted) return { success: true, muted: true };
    if (!this._mpg123Available) {
      return { success: false, error: 'mpg123_not_available' };
    }
    const rec = await this._ensureMp3Stream(opts);
    console.log(`🔊 Writing ${buffer.length} bytes to mpg123 stream (device: ${rec.deviceId})`);
    // ~128 kbps MP3; only used to bound how long a drained stop may take.
    rec.playsUntilMs = Math.max(Date.now(), rec.playsUntilMs || 0) + (buffer.length * 8 / 128);
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
          volume: typeof opts.volume === 'number' ? opts.volume : DEFAULT_VOLUME,
          simulated: false,
          kind: opts.kind || 'general'
        };
        // If this was AI, mirror to lastAI telemetry as well
        if ((opts.kind || '').toLowerCase() === 'ai') {
          this._lastAIPlay = { ...this._lastPlay };
        }
        resolve({ success: true, streamed: buffer.length, deviceId: rec.deviceId });
      };
      if (ok) return done();
      rec.proc.stdin.once('drain', done);
      // A player that dies with data still queued never emits 'drain'; without
      // this the caller's promise (and everything chained on it) hung forever.
      rec.proc.once('exit', done);
    });
  }

  /**
   * Spawn one persistent pw-play for raw PCM16LE on stdin and register it.
   * Synchronous on purpose: see _writePcmNow().
   */
  _spawnPcmPlayer(key, { characterId, deviceId, owner, sampleRate, volume }) {
    const pwArgs = [...this._pwplayRawArgs(),
                    '--format', 's16', '--rate', String(sampleRate), '--channels', '1',
                    '--volume', String(Math.max(0, Math.min(1, volume / 100)).toFixed(3))];
    if (deviceId && deviceId !== 'default') pwArgs.push('--target', deviceId);
    pwArgs.push('-'); // read from stdin

    console.log(`🔊 Starting pw-play PCM stream for ${key}: device=${deviceId}, rate=${sampleRate}, volume=${volume}`);

    const pw = this._spawn('pw-play', pwArgs);
    const rec = {
      proc: pw, deviceId, sampleRate, contentType: 'audio/pcm',
      owner: owner || null,
      characterKey: String(characterId || 'default'),
      spawnedAt: Date.now(),
      // Modelled wall-clock time the audio handed to this player finishes.
      playsUntilMs: 0,
      bytesWritten: 0
    };

    pw.on('error', (err) => {
      console.error(`pw-play(pcm) spawn error for ${key}:`, err && err.message);
      const cur = this._pcmStreams.get(key);
      if (cur && cur.proc === pw) this._pcmStreams.delete(key);
    });

    pw.stdin.on('error', (err) => {
      // EPIPE from a player WE stopped (an interruption kills it with audio
      // still buffered) is expected; logging it as an error buried real faults
      // in monsterbox.err (1,525 such lines in two nights of barge-ins).
      if (rec.stoppedByUs && err && err.code === 'EPIPE') return;
      console.error(`pw-play(pcm) stdin error for ${key}:`, err.message);
      const cur = this._pcmStreams.get(key);
      if (cur && cur.proc === pw) this._pcmStreams.delete(key);
    });

    pw.stderr.on('data', (data) => {
      const msg = data.toString().trim();
      if (msg) console.error(`pw-play(pcm) stderr for ${key}:`, msg);
    });

    pw.on('exit', (code, signal) => {
      console.log(`pw-play(pcm) exited for ${key} with code ${code}, signal ${signal}`);
      const cur = this._pcmStreams.get(key);
      if (cur && cur.proc === pw) this._pcmStreams.delete(key);
    });

    this._pcmStreams.set(key, rec);
    return rec;
  }

  _livePcmRecord(key) {
    const rec = this._pcmStreams.get(key);
    if (rec && rec.proc && !rec.proc.killed && rec.proc.exitCode == null && rec.proc.signalCode == null) return rec;
    if (rec) this._pcmStreams.delete(key);
    return null;
  }

  /**
   * Ensure a persistent pw-play process for raw PCM16LE streaming (e.g. ElevenLabs ConvAI).
   * Uses pw-play --format s16 --rate <sampleRate> --channels 1 --target <device> -
   */
  async _ensurePcmStream(opts = {}) {
    if (!this._pwplayAvailable) {
      throw new Error('pw-play_not_available');
    }
    const deviceId = await this._resolveDeviceId(opts);
    const key = pcmStreamKey(opts.characterId, deviceId, opts.owner);
    const rec = this._livePcmRecord(key);
    if (rec) return rec;
    return this._spawnPcmPlayer(key, {
      characterId: opts.characterId, deviceId, owner: opts.owner,
      sampleRate: opts.sampleRate || 16000,
      volume: typeof opts.volume === 'number' ? opts.volume : DEFAULT_VOLUME
    });
  }

  /**
   * Hand one PCM buffer to its player NOW, synchronously up to stdin.write().
   *
   * Everything between the call and the write is synchronous (spawn included),
   * so buffers reach the player in exactly the order this is called. The old
   * path awaited device resolution (two disk reads) before every write, and
   * the conversation did not await each write, so a chunk whose reads finished
   * first could overtake the one before it.
   */
  _writePcmNow(buffer, opts, deviceId) {
    const key = pcmStreamKey(opts.characterId, deviceId, opts.owner);
    const sampleRate = opts.sampleRate || 16000;
    const volume = typeof opts.volume === 'number' ? opts.volume : DEFAULT_VOLUME;
    let rec = this._livePcmRecord(key);
    const coldStart = !rec;
    if (!rec) {
      rec = this._spawnPcmPlayer(key, { characterId: opts.characterId, deviceId, owner: opts.owner, sampleRate, volume });
    }
    const now = Date.now();
    const durMs = (buffer.length / ((rec.sampleRate || sampleRate) * 2)) * 1000;
    const startsAtMs = Math.max(now, rec.playsUntilMs || 0);
    rec.playsUntilMs = startsAtMs + durMs;
    rec.bytesWritten += buffer.length;
    rec.lastWriteAt = now;

    let ok = true;
    try {
      ok = rec.proc.stdin.write(buffer);
    } catch (e) {
      return Promise.resolve({ success: false, error: e.message, deviceId });
    }
    this._lastPlay = {
      ts: now,
      characterId: opts.characterId || null,
      deviceId: rec.deviceId,
      player: 'pw-play(pcm)',
      contentType: 'audio/pcm',
      streamed: buffer.length,
      volume,
      simulated: false,
      kind: opts.kind || 'ai'
    };
    if ((opts.kind || 'ai').toLowerCase() === 'ai') {
      this._lastAIPlay = { ...this._lastPlay };
    }
    const result = {
      success: true, streamed: buffer.length, deviceId: rec.deviceId,
      coldStart, spawnedAt: rec.spawnedAt, startsAtMs, playsUntilMs: rec.playsUntilMs,
      owner: rec.owner
    };
    if (ok) return Promise.resolve(result);
    return new Promise((resolve) => {
      let settled = false;
      const done = () => { if (settled) return; settled = true; resolve(result); };
      rec.proc.stdin.once('drain', done);
      rec.proc.once('exit', done);
    });
  }

  /**
   * Write raw PCM16LE audio to a persistent pw-play stream.
   * Used for real-time ConvAI audio where chunks arrive continuously.
   *
   * Pass `deviceId` (resolve it once with resolveSpeakerDevice()) to get the
   * ordered, disk-free fast path. `owner` keeps one session's player separate
   * from another's (see pcmStreamKey). Never throws; always returns a promise.
   */
  writePcmStream(buffer, opts = {}) {
    try {
      if (!buffer || !buffer.length) return Promise.resolve({ success: false, error: 'empty_buffer' });
      if (this._speakerMuted) return Promise.resolve({ success: true, muted: true });
      if (!this._pwplayAvailable) {
        return Promise.resolve({ success: false, error: 'pw-play_not_available' });
      }
      if (opts.deviceId) return this._writePcmNow(buffer, opts, opts.deviceId);

      // Legacy callers that leave device resolution to us: resolve
      // asynchronously, but behind the previous write for the same
      // character+owner so un-awaited writes still play in call order.
      const chainKey = String(opts.characterId || 'default') + '#' + (opts.owner || '');
      const prev = this._pcmWriteChains.get(chainKey) || Promise.resolve();
      const next = prev.catch(() => {}).then(async () => {
        const deviceId = await this._resolveDeviceId(opts);
        if (this._speakerMuted) return { success: true, muted: true };
        return this._writePcmNow(buffer, opts, deviceId);
      });
      this._pcmWriteChains.set(chainKey, next);
      next.finally(() => {
        if (this._pcmWriteChains.get(chainKey) === next) this._pcmWriteChains.delete(chainKey);
      }).catch(() => {});
      return next;
    } catch (e) {
      return Promise.resolve({ success: false, error: e.message });
    }
  }

  /**
   * End a player's input and let it finish what it already holds, then exit.
   * A conversation that ends (the agent switched off, a browser tab closed, a
   * one-shot ask completed) must not cut the character off mid-sentence.
   */
  _drainRecord(rec, label) {
    if (!rec || !rec.proc) return;
    rec.draining = true;
    this._draining.add(rec);
    try { rec.proc.stdin.end(); } catch (_) { /* already closed */ }
    const remaining = Math.max(0, (rec.playsUntilMs || 0) - Date.now());
    const timer = setTimeout(() => {
      if (rec.proc.exitCode == null && rec.proc.signalCode == null) {
        console.warn(`⚠️ ${label} did not exit after draining: terminating`);
        try { rec.proc.kill('SIGTERM'); } catch (_) { /* gone */ }
      }
      this._draining.delete(rec);
    }, Math.min(DRAIN_CAP_MS, remaining + DRAIN_SLACK_MS));
    if (timer.unref) timer.unref();
    rec.proc.once('exit', () => { clearTimeout(timer); this._draining.delete(rec); });
  }

  /** Stop a player NOW: an interruption, a stop button, a panic. */
  _killRecord(rec) {
    if (!rec || !rec.proc) return;
    rec.stoppedByUs = true;
    try { rec.proc.stdin.end(); } catch (_) { }
    try { rec.proc.kill('SIGTERM'); } catch (_) { }
    if (rec.paplay) {
      try { rec.paplay.stdin.end(); } catch (_) { }
      try { rec.paplay.kill('SIGTERM'); } catch (_) { }
    }
    this._draining.delete(rec);
  }

  _ownerMatches(rec, key, owner) {
    if (!owner) return true;
    return (rec && rec.owner === owner) || keyOwner(key) === owner;
  }

  /**
   * Stop persistent PCM streams for a character (any device).
   *
   * opts.owner  only that session's player (others keep playing)
   * opts.drain  true = let the player finish what it holds (conversation ended);
   *             default false = stop now (interruption / stop button), which is
   *             also what every pre-existing caller gets.
   */
  async stopPcmStream(opts = {}) {
    const prefix = 'pcm_' + String(opts.characterId || 'default') + '_';
    const owner = opts.owner || null;
    for (const [key, rec] of this._pcmStreams) {
      if (!key.startsWith(prefix) || !this._ownerMatches(rec, key, owner)) continue;
      this._pcmStreams.delete(key);
      if (opts.drain) this._drainRecord(rec, `pw-play(pcm) ${key}`);
      else this._killRecord(rec);
    }
    if (!opts.drain) {
      // An explicit stop must also silence players that were already draining.
      const charKey = String(opts.characterId || 'default');
      for (const rec of [...this._draining]) {
        if (rec.contentType !== 'audio/pcm' || rec.characterKey !== charKey) continue;
        if (owner && rec.owner !== owner) continue;
        this._killRecord(rec);
      }
    }
    return { success: true };
  }

  /**
   * Cut one session's speech off immediately, without touching any other
   * player on the node. Used for interruptions: the guest (or the agent's turn
   * model) has the floor, so what this session queued must go now, but
   * background music, a scene's line or another session must not.
   */
  async interruptPlayback(opts = {}) {
    return this.stopStream({ characterId: opts.characterId, owner: opts.owner, drain: false });
  }

  /** Modelled end of the audio handed to a character's players (0 if none). */
  getPlaybackHorizon(opts = {}) {
    const charKey = String(opts.characterId || 'default');
    let until = 0;
    const consider = (rec, key) => {
      if (!rec || rec.characterKey !== charKey) return;
      if (opts.owner && !this._ownerMatches(rec, key || '', opts.owner)) return;
      until = Math.max(until, rec.playsUntilMs || 0);
    };
    for (const [key, rec] of this._pcmStreams) consider(rec, key);
    for (const rec of this._draining) consider(rec, null);
    return until;
  }

  /**
   * Play AI audio immediately with its own stream so it never waits for other audio.
   * Uses mpg123 for MP3 streaming when available, otherwise falls back to ffmpeg->pw-play pipeline.
   */
  async playAIOnCharacterSpeaker(buffer, opts = {}) {
    try {
      if (!buffer || !buffer.length) return { success: false, error: 'No audio buffer provided' };
      const characterId = opts.characterId || null;
      const contentType = (opts.contentType || 'audio/mpeg').toLowerCase();
      const volume = typeof opts.volume === 'number' ? opts.volume : DEFAULT_VOLUME;
      const deviceId = await this._resolveDeviceId({ characterId, deviceId: opts.deviceId, speakerPartId: opts.speakerPartId });

      // NOTE: Do NOT stop the persistent mpg123 stream here — use a separate
      // one-shot player so the managed stream stays warm for other audio.

      // Echo suppression: estimate duration and suppress mic for non-ConvAI paths
      try {
        const ct = String(contentType).toLowerCase();
        let estimatedMs = 0;
        if (ct.includes('wav') || ct.includes('pcm')) {
          estimatedMs = (buffer.length / (16000 * 2)) * 1000;
        } else if (ct.includes('mpeg') || ct.includes('mp3')) {
          estimatedMs = (buffer.length * 8 / 128);
        } else {
          estimatedMs = 3000;
        }
        if (estimatedMs > 0) {
          const { default: wsService } = await import('./elevenLabsWebSocketService.js');
          wsService.suppressMicForCharacter(characterId, estimatedMs + 1000);
        }
      } catch (_) { /* best-effort echo suppression */ }

      // Test mode: record telemetry only
      if (process.env.MB_TEST_MODE === '1' || process.env.MB_TEST_MODE === 'true') {
        this._lastPlay = {
          ts: Date.now(),
          characterId,
          deviceId,
          player: contentType.includes('mpeg') ? 'mpg123' : (this._pwplayAvailable ? 'pw-play' : 'unknown'),
          contentType,
          streamed: buffer.length,
          volume,
          simulated: true,
          kind: 'ai'
        };
        return { success: true, simulated: true, deviceId };
      }

      const { spawn } = await import('child_process');

      // Determine if content is WAV/PCM (pw-play can handle) vs MP3 (needs mpg123)
      const isWavContent = contentType.includes('wav') || contentType.includes('wave') || contentType.includes('pcm');
      const isMp3Content = contentType.includes('mpeg') || contentType.includes('mp3');

      // For MP3 content, skip pw-play (it can't decode MP3 from stdin) and go straight to mpg123
      if (this._pwplayAvailable && isWavContent) {
        try {
          const env = { ...process.env };
          if (deviceId && deviceId !== 'default') env.PULSE_SINK = deviceId;
          const pwArgs = deviceId && deviceId !== 'default' ? ['--target', deviceId, '-'] : ['-'];
          const pw = spawn('pw-play', pwArgs, { env });

          pw.stdin.on('error', (err) => {
            console.error('pw-play(ai) stdin error:', err.message);
          });
          pw.stderr.on('data', (d) => {
            const msg = String(d || '').trim();
            if (msg) console.error('pw-play(ai) stderr:', msg);
          });

          // Telemetry at start
          this._lastPlay = {
            ts: Date.now(),
            characterId,
            deviceId,
            player: 'pw-play',
            contentType,
            streamed: 0,
            volume,
            simulated: false,
            kind: 'ai'
          };
          this._lastAIPlay = { ...this._lastPlay };

          return await new Promise((resolve) => {
            let done = false;
            let timer = null;
            const finishOnce = (result) => { if (done) return; done = true; if (timer) clearTimeout(timer); resolve(result); };
            // Bound the wait: a blocked audio device would otherwise never emit
            // 'exit', hanging the request (and its caller) indefinitely.
            timer = setTimeout(() => {
              try { pw.kill('SIGTERM'); } catch (_) {}
              setTimeout(() => { try { pw.kill('SIGKILL'); } catch (_) {} }, 500);
              finishOnce({ success: false, error: 'playback_timeout', player: 'pw-play', deviceId });
            }, _playbackTimeoutMs(buffer, contentType));
            pw.on('exit', (code, sig) => {
              this._lastPlay = {
                ts: Date.now(),
                characterId,
                deviceId,
                player: 'pw-play',
                contentType,
                streamed: buffer.length,
                volume,
                simulated: false,
                kind: 'ai'
              };
              this._lastAIPlay = { ...this._lastPlay };
              finishOnce({ success: true, player: 'pw-play', code, signal: sig, deviceId });
            });
            try { pw.stdin.write(buffer); pw.stdin.end(); } catch (e) { console.error('pw-play write failed:', e.message); }
          });
        } catch (err) {
          console.error('pw-play(ai) failed, falling back:', err && err.message);
          // continue to other fallbacks
        }
      }

      // Primary path for MP3 data: one-shot mpg123 (does not touch the persistent stream)
      if (this._mpg123Available && isMp3Content) {
        try {
          const env = { ...process.env };
          if (deviceId && deviceId !== 'default') env.PULSE_SINK = deviceId;
          const scale = this._calcMpg123Scale(volume);
          const args = ['--quiet', '-o', 'pulse', '-f', String(scale), '-'];
          const proc = spawn('mpg123', args, { env });

          return await new Promise((resolve) => {
            let started = false;
            let done = false;
            let timer = null;
            const finishOnce = (result) => { if (done) return; done = true; if (timer) clearTimeout(timer); resolve(result); };
            // Bound the wait so a stuck audio device can't hang the request.
            timer = setTimeout(() => {
              try { proc.kill('SIGTERM'); } catch (_) {}
              setTimeout(() => { try { proc.kill('SIGKILL'); } catch (_) {} }, 500);
              finishOnce({ success: false, error: 'playback_timeout', player: 'mpg123', deviceId });
            }, _playbackTimeoutMs(buffer, contentType));
            proc.on('error', (e) => {
              console.error('mpg123(ai) spawn error:', e && e.message);
              this._lastAIPlay = { ts: Date.now(), characterId, deviceId, player: 'mpg123', contentType, streamed: 0, volume, simulated: false, kind: 'ai', error: e && e.message };
              finishOnce({ success: false, error: e && e.message });
            });
            proc.stdin.on('error', (err) => {
              console.error('mpg123(ai) stdin error:', err.message);
            });
            proc.stderr.on('data', (d) => {
              const msg = String(d || '').trim();
              if (msg && !/ALSA lib|Playing MPEG/.test(msg)) console.error('mpg123(ai) stderr:', msg);
            });
            proc.on('spawn', () => {
              started = true;
              this._lastPlay = { ts: Date.now(), characterId, deviceId, player: 'mpg123', contentType: 'audio/mpeg', streamed: 0, volume, simulated: false, kind: 'ai' };
              this._lastAIPlay = { ...this._lastPlay };
            });
            proc.on('exit', (code, sig) => {
              this._lastPlay = { ts: Date.now(), characterId, deviceId, player: 'mpg123', contentType: 'audio/mpeg', streamed: buffer.length, volume, simulated: false, kind: 'ai' };
              this._lastAIPlay = { ...this._lastPlay };
              finishOnce({ success: true, player: 'mpg123', code, signal: sig, deviceId });
            });
            try { proc.stdin.write(buffer); proc.stdin.end(); } catch (e) { console.error('mpg123(ai) write failed:', e.message); }
          });
        } catch (e) {
          console.error('mpg123(ai) failed:', e && e.message);
        }
      }

      // Fallbacks: if ffmpeg and pw-play available, pipe MP3/WAV to pw-play with target
      if (this._ffmpegAvailable && this._pwplayAvailable) {
        const { spawn } = await import('child_process');
        const env = { ...process.env };
        if (deviceId && deviceId !== 'default') env.PULSE_SINK = deviceId; // for pw-play target may still be passed

        const ffArgs = ['-hide_banner', '-loglevel', 'error', '-i', 'pipe:0', '-f', 'wav', 'pipe:1'];
        const ff = spawn('ffmpeg', ffArgs, { env });
        const pwArgs = ['--target', deviceId, '-'];
        const pw = spawn('pw-play', pwArgs, { env });

        // Pipe ffmpeg PCM to pw-play
        ff.stdout.pipe(pw.stdin);
        ff.stdin.on('error', () => { });
        pw.stdin.on('error', () => { });

        // Telemetry at start
        this._lastPlay = {
          ts: Date.now(),
          characterId,
          deviceId,
          player: 'ffmpeg|pw-play',
          contentType,
          streamed: 0,
          volume,
          simulated: false,
          kind: 'ai'
        };
        this._lastAIPlay = { ...this._lastPlay };

        return await new Promise((resolve) => {
          let finished = false;
          let timer = null;
          const finish = (playerName) => {
            if (finished) return;
            finished = true;
            if (timer) clearTimeout(timer);
            this._lastPlay = {
              ts: Date.now(),
              characterId,
              deviceId,
              player: playerName,
              contentType,
              streamed: buffer.length,
              volume,
              simulated: false,
              kind: 'ai'
            };
            this._lastAIPlay = { ...this._lastPlay };
            resolve({ success: true, player: playerName, deviceId });
          };
          // Bound the wait so a stuck device can't hang the request forever.
          timer = setTimeout(() => {
            if (finished) return;
            finished = true;
            try { ff.kill('SIGKILL'); } catch (_) {}
            try { pw.kill('SIGKILL'); } catch (_) {}
            resolve({ success: false, error: 'playback_timeout', player: 'ffmpeg|pw-play', deviceId });
          }, _playbackTimeoutMs(buffer, contentType));

          ff.on('exit', () => { /* wait for pw-play */ });
          pw.on('exit', () => finish('ffmpeg|pw-play'));

          try {
            ff.stdin.write(buffer);
            ff.stdin.end();
          } catch (e) {
            console.error('ffmpeg write failed:', e.message);
          }
        });
      }

      // Last resort: write temp file and invoke speaker_cli (synchronous play)
      const tmpFile = await writeTempAudio(buffer, contentType);
      const args = ['play', tmpFile, String(volume), '--device', deviceId];
      let raw = await runWrapper('speaker_cli.py', args, { enableLogging: false, timeoutMs: 15000 });
      let parsed = null; try { parsed = JSON.parse(raw); } catch { }
      const ok = parsed ? parsed.status === 'success' : true;
      this._lastPlay = {
        ts: Date.now(),
        characterId,
        deviceId,
        player: (parsed && parsed.player) || 'speaker_cli',
        contentType,
        streamed: 0,
        volume,
        simulated: false,
        kind: 'ai'
      };
      this._lastAIPlay = { ...this._lastPlay };
      return ok ? { success: true, player: parsed && parsed.player, deviceId } : { success: false, error: parsed && parsed.message };
    } catch (error) {
      console.error('ServerPlaybackService AI error:', error);
      return { success: false, error: error.message };
    }
  }

  /**
   * Stop a character's persistent players (mpg123 and pw-play).
   *
   * Same options as stopPcmStream(): `owner` limits the stop to one session's
   * players, `drain: true` lets them finish what they hold. Without options it
   * stops everything the character has, immediately, the historical contract.
   */
  async stopStream(opts = {}) {
    const charKey = String(opts.characterId || 'default');
    const owner = opts.owner || null;
    for (const [key, rec] of this._streams) {
      const recChar = rec.characterKey || key.split('#')[0];
      if (recChar !== charKey || !this._ownerMatches(rec, key, owner)) continue;
      this._streams.delete(key);
      if (opts.drain) this._drainRecord(rec, `mpg123 ${key}`);
      else this._killRecord(rec);
    }
    if (!opts.drain) {
      for (const rec of [...this._draining]) {
        if (rec.contentType !== 'audio/mpeg' || rec.characterKey !== charKey) continue;
        if (owner && rec.owner !== owner) continue;
        this._killRecord(rec);
      }
    }
    // Also stop any PCM stream for this character
    try { await this.stopPcmStream(opts); } catch (_) { }
    return { success: true };
  }

  async playBufferOnCharacterSpeaker(buffer, opts = {}) {
    try {
      if (!buffer || !buffer.length) {
        return { success: false, error: 'No audio buffer provided' };
      }
      if (this._speakerMuted) {
        // One line per skipped play (not per chunk) so a silent night is
        // diagnosable from the service log instead of looking like dead audio.
        console.log('🔇 Speaker muted — playback skipped (unmute via the Dashboard Mute Speaker toggle or POST /conversation/api/speaker-mute)');
        return { success: true, muted: true };
      }
      const characterId = opts.characterId || null;
      const contentType = opts.contentType || 'audio/mpeg';
      const volume = typeof opts.volume === 'number' ? opts.volume : DEFAULT_VOLUME;

      // Echo suppression: estimate audio duration and suppress mic
      try {
        const ct = String(contentType).toLowerCase();
        let estimatedMs = 0;
        if (ct.includes('wav') || ct.includes('pcm')) {
          // PCM16LE mono 16kHz: 2 bytes/sample
          estimatedMs = (buffer.length / (16000 * 2)) * 1000;
        } else if (ct.includes('mpeg') || ct.includes('mp3')) {
          // ~128kbps MP3
          estimatedMs = (buffer.length * 8 / 128);
        } else {
          estimatedMs = 3000; // fallback estimate
        }
        if (estimatedMs > 0) {
          const { default: wsService } = await import('./elevenLabsWebSocketService.js');
          wsService.suppressMicForCharacter(characterId, estimatedMs + 1000);
        }
      } catch (_) { /* best-effort echo suppression */ }

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

      // Streaming fast-path for MP3 chunks (only if mpg123 available)
      if (this._mpg123Available && ((contentType || '').toLowerCase().includes('mpeg') || (contentType || '').toLowerCase().includes('mp3'))) {
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
        player: result.player || (String(contentType).toLowerCase().includes('wav') ? 'pw-play' : (this._mpg123Available ? 'mpg123' : 'pw-play')),
        contentType,
        streamed: 0,
        volume,
        simulated: false,
        kind: opts.kind || 'general'
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
      // Stop all managed MP3 streams
      for (const [key, rec] of this._streams) {
        try { rec.proc.stdin.end(); } catch (_) { }
        try { rec.proc.kill('SIGTERM'); } catch (_) { }
        if (rec.paplay) {
          try { rec.paplay.stdin.end(); } catch (_) { }
          try { rec.paplay.kill('SIGTERM'); } catch (_) { }
        }
      }
      this._streams.clear();
      // Stop all managed PCM streams
      for (const [key, rec] of this._pcmStreams) {
        try { rec.proc.stdin.end(); } catch (_) { }
        try { rec.proc.kill('SIGTERM'); } catch (_) { }
      }
      this._pcmStreams.clear();
      // ...and anything still playing out its tail after a drained stop.
      for (const rec of [...this._draining]) this._killRecord(rec);
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

  // Expose last AI playback telemetry
  getLastAIPlay() {
    return this._lastAIPlay ? { ...this._lastAIPlay } : null;
  }
}

export default new ServerPlaybackService();

