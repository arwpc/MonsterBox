import { spawnSync } from 'child_process';
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

// Resolve PipeWire sink ID from a speaker part object.
// Canonical field: config.audioDeviceId — legacy fallbacks kept for backward compat.
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
const DEFAULT_VOLUME = 85;

class ServerPlaybackService {
  constructor() {
    // Streaming players keyed by characterId
    this._streams = new Map();
    // Persistent PCM (raw audio) streams for real-time ConvAI playback
    this._pcmStreams = new Map();
    this._lastPlay = null; // telemetry for tests/diagnostics
    this._lastAIPlay = null; // dedicated telemetry for AI playback
    this._speakerMuted = false; // global speaker mute flag
    this._mpg123Available = this._detectMpg123();
    this._ffmpegAvailable = this._detectCmd('ffmpeg');
    this._pwplayAvailable = this._detectCmd('pw-play');
  }

  setSpeakerMuted(muted) {
    this._speakerMuted = !!muted;
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

  _calcMpg123Scale(volume) {
    const vol = typeof volume === 'number' ? Math.max(0, Math.min(100, volume)) : DEFAULT_VOLUME;
    return Math.max(0, Math.min(32768, Math.round(32768 * (vol / 100))));
  }

  async _ensureMp3Stream(opts = {}) {
    if (!this._mpg123Available) {
      throw new Error('mpg123_not_available');
    }
    const key = String(opts.characterId || 'default');
    let rec = this._streams.get(key);
    if (rec && rec.proc && !rec.proc.killed) {
      return rec;
    }

    const deviceId = await this._resolveDeviceId(opts);
    const volume = typeof opts.volume === 'number' ? opts.volume : DEFAULT_VOLUME;

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
    });
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
    const key = 'pcm_' + String(opts.characterId || 'default') + '_' + deviceId;
    let rec = this._pcmStreams.get(key);
    if (rec && rec.proc && !rec.proc.killed) {
      return rec;
    }
    const sampleRate = opts.sampleRate || 16000;
    const volume = typeof opts.volume === 'number' ? opts.volume : DEFAULT_VOLUME;

    const { spawn } = await import('child_process');

    const pwArgs = ['--format', 's16', '--rate', String(sampleRate), '--channels', '1',
                    '--volume', String(Math.max(0, Math.min(1, volume / 100)).toFixed(3))];
    if (deviceId && deviceId !== 'default') pwArgs.push('--target', deviceId);
    pwArgs.push('-'); // read from stdin

    console.log(`🔊 Starting pw-play PCM stream for ${key}: device=${deviceId}, rate=${sampleRate}, volume=${volume}`);

    const pw = spawn('pw-play', pwArgs);

    pw.stdin.on('error', (err) => {
      console.error(`pw-play(pcm) stdin error for ${key}:`, err.message);
      this._pcmStreams.delete(key);
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

    rec = { proc: pw, deviceId, sampleRate, contentType: 'audio/pcm' };
    this._pcmStreams.set(key, rec);
    return rec;
  }

  /**
   * Write raw PCM16LE audio to a persistent pw-play stream.
   * Used for real-time ConvAI audio where chunks arrive continuously.
   */
  async writePcmStream(buffer, opts = {}) {
    if (!buffer || !buffer.length) return { success: false, error: 'empty_buffer' };
    if (this._speakerMuted) return { success: true, muted: true };
    if (!this._pwplayAvailable) {
      return { success: false, error: 'pw-play_not_available' };
    }
    const rec = await this._ensurePcmStream(opts);
    return new Promise((resolve) => {
      const ok = rec.proc.stdin.write(buffer);
      const done = () => {
        this._lastPlay = {
          ts: Date.now(),
          characterId: opts.characterId || null,
          deviceId: rec.deviceId,
          player: 'pw-play(pcm)',
          contentType: 'audio/pcm',
          streamed: buffer.length,
          volume: typeof opts.volume === 'number' ? opts.volume : DEFAULT_VOLUME,
          simulated: false,
          kind: opts.kind || 'ai'
        };
        if ((opts.kind || '').toLowerCase() === 'ai') {
          this._lastAIPlay = { ...this._lastPlay };
        }
        resolve({ success: true, streamed: buffer.length, deviceId: rec.deviceId });
      };
      if (ok) return done();
      rec.proc.stdin.once('drain', done);
    });
  }

  /**
   * Stop all persistent PCM streams for a character (any device).
   */
  async stopPcmStream(opts = {}) {
    const prefix = 'pcm_' + String(opts.characterId || 'default') + '_';
    for (const [key, rec] of this._pcmStreams) {
      if (key.startsWith(prefix)) {
        try { rec.proc.stdin.end(); } catch (_) { }
        try { rec.proc.kill('SIGTERM'); } catch (_) { }
        this._pcmStreams.delete(key);
      }
    }
    return { success: true };
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

      // Stop any managed stream for this character so AI gets exclusive path
      try { await this.stopStream({ characterId }); } catch (_) { /* best-effort */ }

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

      // Prefer using pw-play when available (more reliable sink targeting on PipeWire)
      const { spawn } = await import('child_process');
      // Best-effort: stop any external players on the target device so AI preempts other audio
      try {
        await runWrapper('speaker_cli.py', ['stop', '--device', deviceId], { enableLogging: false, timeoutMs: 3000 });
      } catch (e) {
        // ignore - best-effort
      }
      if (this._pwplayAvailable) {
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
              resolve({ success: true, player: 'pw-play', code, signal: sig, deviceId });
            });
            try { pw.stdin.write(buffer); pw.stdin.end(); } catch (e) { console.error('pw-play write failed:', e.message); }
          });
        } catch (err) {
          console.error('pw-play(ai) failed, falling back:', err && err.message);
          // continue to other fallbacks
        }
      }

      // Next fallback: mpg123 for MP3 data
      if (this._mpg123Available && (contentType.includes('mpeg') || contentType.includes('mp3'))) {
        try {
          const env = { ...process.env };
          if (deviceId && deviceId !== 'default') env.PULSE_SINK = deviceId;
          const scale = this._calcMpg123Scale(volume);
          const args = ['--quiet', '-o', 'pulse', '-f', String(scale), '-'];
          const proc = spawn('mpg123', args, { env });

          return await new Promise((resolve) => {
            let started = false;
            proc.on('error', (e) => {
              console.error('mpg123(ai) spawn error:', e && e.message);
              this._lastAIPlay = { ts: Date.now(), characterId, deviceId, player: 'mpg123', contentType, streamed: 0, volume, simulated: false, kind: 'ai', error: e && e.message };
              resolve({ success: false, error: e && e.message });
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
              resolve({ success: true, player: 'mpg123', code, signal: sig, deviceId });
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
          const finish = (playerName) => {
            if (finished) return;
            finished = true;
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

  async stopStream(opts = {}) {
    const key = String(opts.characterId || 'default');
    const rec = this._streams.get(key);
    if (rec) {
      try { rec.proc.stdin.end(); } catch (_) { }
      try { rec.proc.kill('SIGTERM'); } catch (_) { }
      if (rec.paplay) {
        try { rec.paplay.stdin.end(); } catch (_) { }
        try { rec.paplay.kill('SIGTERM'); } catch (_) { }
      }
      this._streams.delete(key);
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
      if (this._speakerMuted) return { success: true, muted: true };
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

