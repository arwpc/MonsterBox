/**
 * Server-side STT Listener
 * Uses PipeWire/PulseAudio input device (from Microphone Part deviceId) and calls ElevenLabs STT
 * Implements simple polling-based "real-time" by recording short chunks and transcribing them.
 */

import { spawn } from 'child_process';
import elevenLabsSTTService from './elevenLabsSTTService.js';
import pipewireService from './pipewireService.js';
import { getSTTConfig } from './aiConfigStore.js';

import path from 'path';
import { fileURLToPath } from 'url';
const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

class ServerSTTListener {
  constructor() {
    this.sessions = new Map(); // sessionId -> { deviceId, model, language, running, timer, transcript }
    this.captureDurationSec = 0.3; // short chunks for responsive VU/suppression timing
    this.pollIntervalMs = 350; // balanced polling interval
    this._lastCapturePath = null; // 'python' | 'ffmpeg' | 'arecord' | 'parec'
    this._cachedCapturePath = null; // cached working capture method
    this._cachedCapturePathAt = 0; // timestamp of cache
    this._capturePathCacheTtl = 300000; // 5 minute cache TTL
    this._resolvedSourceCache = new Map(); // deviceId -> { resolvedId, timestamp }
    this._sourceCacheTtl = 60000; // 60 seconds
    this.sessionTimeoutMs = 3600000; // 1 hour max session duration
    this.cleanupIntervalMs = 60000; // cleanup every minute

    // Start periodic cleanup of old sessions
    this._cleanupTimer = setInterval(() => this._cleanupOldSessions(), this.cleanupIntervalMs);
  }

  _cleanupOldSessions() {
    const now = Date.now();
    const toDelete = [];
    for (const [sessionId, state] of this.sessions.entries()) {
      const age = now - state.startedAt;
      // Remove sessions older than timeout OR not running and older than 5 minutes
      if (age > this.sessionTimeoutMs || (!state.running && age > 300000)) {
        if (state.timer) clearTimeout(state.timer);
        // Aggregated sessions own a continuous recorder — never leak it.
        if (state.capture) { try { state.capture.stop(); } catch (_) { } state.capture = null; }
        if (state._aggCleanup) { try { state._aggCleanup(); } catch (_) { } }
        toDelete.push(sessionId);
      }
    }
    toDelete.forEach(id => this.sessions.delete(id));
    if (toDelete.length > 0) {
      console.log(`🧹 Cleaned up ${toDelete.length} old STT sessions`);
    }
  }

  _errText(e) {
    try {
      if (!e) return '';
      if (typeof e === 'string') return e;
      if (e.message) return String(e.message);
      if (Array.isArray(e)) return e.map((x) => x && (x.msg || x.message || JSON.stringify(x))).join('; ');
      if (e.detail) {
        var d = e.detail;
        if (typeof d === 'string') return d;
        if (Array.isArray(d)) return d.map((x) => x && (x.msg || x.message || JSON.stringify(x))).join('; ');
        if (typeof d === 'object') return d.msg || d.message || JSON.stringify(d);
      }
      return JSON.stringify(e);
    } catch (_) { return String(e); }
  }


  startSession({ deviceId = 'default', model = 'scribe_v2', language = 'auto' }) {
    // Stop any existing sessions for this device to prevent conflicts
    for (const [sid, s] of this.sessions.entries()) {
      if (s.deviceId === deviceId && s.running) {
        console.log(`⚠️ Stopping existing STT session ${sid} for device ${deviceId}`);
        this.stopSession(sid);
      }
    }

    const sessionId = 'stt_' + Date.now() + '_' + Math.random().toString(36).substr(2, 6);
    const state = {
      deviceId, model, language, running: true, transcript: '', lastError: null, timer: null,
      chunksCaptured: 0, chunksWithAudio: 0, chunksTranscribed: 0, lastChunkBytes: 0, startedAt: Date.now(), lastActivityAt: null,
      vadEnabled: false, vadThreshold: 0.40, consecutiveErrors: 0, maxConsecutiveErrors: 10
    };

    console.log(`🎤 Starting STT session ${sessionId} for device: ${deviceId}, model: ${model}, language: ${language}`);

    // Load VAD settings asynchronously from STT config (no await to keep sync start)
    try {
      getSTTConfig().then((cfg) => {
        if (!cfg) { state._startLegacy(); return; }
        state.vadEnabled = !!cfg.vadEnabled;
        if (typeof cfg.vadThreshold === 'number') {
          var t = cfg.vadThreshold; if (!(t >= 0.005 && t <= 0.6)) t = 0.40; state.vadThreshold = t;
        }
        console.log(`🎤 Session ${sessionId} VAD settings: enabled=${state.vadEnabled}, threshold=${state.vadThreshold}`);
        // Far-field arrays (per-character opt-in): transcribe once per UTTERANCE
        // from a gapless stream instead of per 0.3s polled chunk. 0.3s chunks
        // split words mid-syllable and the ~1s recorder spawn between polls
        // discards most of the speech. Default (knob absent/false) keeps the
        // legacy per-chunk path byte-for-byte identical.
        if (cfg.utteranceAggregation === true && state.running && !state.aggregation) {
          if (state._legacyKick) { try { clearTimeout(state._legacyKick); } catch (_) { } state._legacyKick = null; }
          this._startAggregatedCapture(sessionId, state, cfg);
        } else {
          state._startLegacy();
        }
      }).catch(() => { state._startLegacy(); });
    } catch (_) { state._startLegacy && state._startLegacy(); }
    this.sessions.set(sessionId, state);

    const tick = async () => {
      if (!state.running || state.aggregation) return;
      try {
        const buffer = await this.captureChunkWav(deviceId, this.captureDurationSec);
        state.chunksCaptured += 1;
        const sz = (buffer && buffer.length) || 0;
        state.lastChunkBytes = sz;

        if (sz > 0) {
          state.chunksWithAudio += 1;
          // Basic amplitude-based VAD gating (RMS on PCM16 from WAV)
          var shouldTranscribe = true;
          var rms = 0;
          try {
            // Env-gated per-chunk amplitude debug (MB_DEBUG_AUDIO=1): surfaces the
            // exact RMS the VAD gate sees, so thresholds can be MEASURED per node.
            var debugAudio = process.env.MB_DEBUG_AUDIO === '1';
            if (state.vadEnabled || debugAudio) {
              rms = this._computeWavRms(buffer);
              if (debugAudio) {
                console.log(`🎚️ Session ${sessionId}: chunk ${state.chunksCaptured} rms=${rms.toFixed(4)} vadEnabled=${state.vadEnabled} threshold=${state.vadThreshold}`);
              }
            }
            if (state.vadEnabled) {
              var thr = state.vadThreshold || 0.40;
              if (!(rms >= thr)) {
                shouldTranscribe = false;
                if (state.chunksCaptured % 20 === 0) {
                  console.log(`🔇 Session ${sessionId}: Audio below VAD threshold (${rms.toFixed(4)} < ${thr})`);
                }
              }
            }
          } catch (vadErr) {
            console.warn(`⚠️ Session ${sessionId}: VAD error:`, vadErr);
          }

          if (shouldTranscribe) {
            try {
              const result = await elevenLabsSTTService.transcribeAudio(buffer, { mimeType: 'audio/wav', model: state.model, language: state.language });
              if (result && result.success && (result.transcript || result.text)) {
                const text = (result.transcript || result.text || '').trim();
                if (text) {
                  state.transcript += (state.transcript ? ' ' : '') + text;
                  state.chunksTranscribed += 1;
                  console.log(`✅ Session ${sessionId}: Transcribed "${text}" (chunk ${state.chunksTranscribed})`);
                }
                state.lastError = null;
                state.lastActivityAt = Date.now();
                state.consecutiveErrors = 0; // Reset error counter on success
              } else {
                const errMsg = this._errText((result && result.error) || 'STT failed');
                state.lastError = errMsg;
                state.consecutiveErrors += 1;
                console.warn(`⚠️ Session ${sessionId}: Transcription failed (${state.consecutiveErrors}/${state.maxConsecutiveErrors}): ${errMsg}`);

                // Stop session if too many consecutive errors
                if (state.consecutiveErrors >= state.maxConsecutiveErrors) {
                  console.error(`❌ Session ${sessionId}: Too many consecutive errors, stopping session`);
                  state.running = false;
                  state.lastError = `Session stopped: ${state.maxConsecutiveErrors} consecutive errors`;
                }
              }
            } catch (transcribeErr) {
              const errMsg = this._errText(transcribeErr);
              state.lastError = errMsg;
              state.consecutiveErrors += 1;
              console.error(`❌ Session ${sessionId}: Transcription exception (${state.consecutiveErrors}/${state.maxConsecutiveErrors}):`, transcribeErr);

              if (state.consecutiveErrors >= state.maxConsecutiveErrors) {
                state.running = false;
                state.lastError = `Session stopped: ${state.maxConsecutiveErrors} consecutive errors`;
              }
            }
          } else {
            // Below VAD threshold: treat as silence (no error)
            state.lastError = null;
            state.consecutiveErrors = 0;
          }
        } else {
          state.lastError = 'No audio captured (0 bytes)';
          state.consecutiveErrors += 1;
          if (state.chunksCaptured % 10 === 0) {
            console.warn(`⚠️ Session ${sessionId}: No audio captured (${state.consecutiveErrors} times)`);
          }
        }
      } catch (e) {
        const errMsg = this._errText(e);
        state.lastError = errMsg;
        state.consecutiveErrors += 1;
        console.error(`❌ Session ${sessionId}: Capture error (${state.consecutiveErrors}/${state.maxConsecutiveErrors}):`, e);

        if (state.consecutiveErrors >= state.maxConsecutiveErrors) {
          state.running = false;
          state.lastError = `Session stopped: ${state.maxConsecutiveErrors} consecutive errors`;
        }
      } finally {
        if (state.running && !state.aggregation) {
          state.timer = setTimeout(tick, this.pollIntervalMs);
        } else if (!state.running) {
          console.log(`🛑 Session ${sessionId}: Stopped (running=false)`);
        }
      }
    };

    // Aggregated capture (when enabled) needs a way back to this legacy polling
    // loop if no continuous capture method works on this node.
    state._startLegacy = () => {
      if (!state.running || state.aggregation) return;
      if (state._legacyKick) { try { clearTimeout(state._legacyKick); } catch (_) { } state._legacyKick = null; }
      if (!state.timer) state.timer = setTimeout(tick, 10);
    };
    // The legacy poll must NOT start before the aggregation decision is made.
    // Its recorder opens the mic exclusively for ~1.4s, and on a device where
    // only PyAudio can stream (ReSpeaker XVF3800) that collision makes the
    // continuous capture's open fail — which silently demoted the whole session
    // back to the legacy path. Measured on Orlok: identical sessions passed or
    // failed purely on which of the two won the race. This kick is the safety
    // net for a config read that never resolves.
    state._legacyKick = setTimeout(() => { state._legacyKick = null; state._startLegacy(); }, 1500);
    return { success: true, sessionId };
  }

  stopSession(sessionId) {
    const s = this.sessions.get(sessionId);
    if (!s) return { success: false, error: 'No such session' };
    console.log(`🛑 Stopping STT session ${sessionId} (captured=${s.chunksCaptured}, transcribed=${s.chunksTranscribed})`);
    s.running = false;
    if (s.timer) { clearTimeout(s.timer); s.timer = null; }
    if (s._legacyKick) { try { clearTimeout(s._legacyKick); } catch (_) { } s._legacyKick = null; }
    // Aggregated-capture sessions own a continuous recorder and possibly a
    // buffered utterance: release the mic and transcribe what was in flight.
    if (s.capture) { try { s.capture.stop(); } catch (_) { } s.capture = null; }
    if (s._aggCleanup) { try { s._aggCleanup(); } catch (_) { } }
    if (s._aggFinalize) { try { s._aggFinalize('session-stop'); } catch (_) { } }
    // Don't delete immediately - let cleanup handle it
    return { success: true };
  }

  stopAllSessions() {
    console.log(`🛑 Stopping all ${this.sessions.size} STT sessions`);
    for (const [sessionId, state] of this.sessions.entries()) {
      if (state.running) {
        this.stopSession(sessionId);
      }
    }
    return { success: true, stopped: this.sessions.size };
  }

  getStatus(sessionId) {
    const s = this.sessions.get(sessionId);
    if (!s) return { success: false, error: 'No such session' };
    return {
      success: true, transcript: s.transcript, running: s.running, lastError: s.lastError,
      chunksCaptured: s.chunksCaptured, chunksWithAudio: s.chunksWithAudio, chunksTranscribed: s.chunksTranscribed, lastChunkBytes: s.lastChunkBytes,
      startedAt: s.startedAt, lastActivityAt: s.lastActivityAt
    };
  }

  // Minimal WAV encoder for PCM 16-bit LE mono
  _encodeWavPCM16LE(rawPcm, sampleRate, channels) {
    try {
      const dataLen = rawPcm.length;
      const blockAlign = channels * 2; // 16-bit
      const byteRate = sampleRate * blockAlign;
      const buf = Buffer.alloc(44);
      buf.write('RIFF', 0);
      buf.writeUInt32LE(36 + dataLen, 4);
      buf.write('WAVE', 8);
      buf.write('fmt ', 12);
      buf.writeUInt32LE(16, 16); // PCM chunk size
      buf.writeUInt16LE(1, 20);  // PCM format
      buf.writeUInt16LE(channels, 22);
      buf.writeUInt32LE(sampleRate, 24);
      buf.writeUInt32LE(byteRate, 28);
      buf.writeUInt16LE(blockAlign, 32);
      buf.writeUInt16LE(16, 34); // bits per sample
      buf.write('data', 36);
      buf.writeUInt32LE(dataLen, 40);
      return Buffer.concat([buf, rawPcm]);
    } catch (_) {
      return Buffer.alloc(0);
    }
  }

  _computeWavRms(buf) {
    try {
      if (!buf || buf.length < 64) return 0.0;
      // Find 'data' chunk start (simplified: assume header 44 bytes)
      var off = 44; if (off >= buf.length) return 0.0;
      var len = buf.length - off; var n = Math.floor(len / 2); if (n <= 0) return 0.0;
      var sum = 0.0; var i = 0; var view = buf;
      for (i = 0; i < n; i++) {
        var sample = view.readInt16LE(off + i * 2);
        var norm = sample / 32768.0; sum += norm * norm;
      }
      var rms = Math.sqrt(sum / n); if (!isFinite(rms)) return 0.0; return rms;
    } catch (_) { return 0.0; }
  }

  // RMS of raw headerless PCM16LE (aggregated-capture frames).
  _computePcmRms(buf) {
    try {
      if (!buf || buf.length < 2) return 0.0;
      var n = Math.floor(buf.length / 2); if (n <= 0) return 0.0;
      var sum = 0.0;
      for (var i = 0; i < n; i++) {
        var norm = buf.readInt16LE(i * 2) / 32768.0; sum += norm * norm;
      }
      var rms = Math.sqrt(sum / n); return isFinite(rms) ? rms : 0.0;
    } catch (_) { return 0.0; }
  }

  /**
   * Utterance-aggregated capture for a polling STT session — opt-in via the
   * per-character stt-config `utteranceAggregation` knob (default false; nodes
   * without the knob keep the legacy per-chunk path untouched).
   *
   * Why: the legacy path records 0.3s chunks with ~1s of recorder-spawn dead
   * time between them, so far-field speech reaches the transcriber as isolated
   * word fragments. Here ONE gapless continuous stream is re-framed into 300ms
   * frames (so vadThreshold keeps the exact meaning it has on the legacy path);
   * frames at/above threshold open an utterance (with a short pre-roll), and
   * after vadSilenceDuration of quiet the whole utterance is transcribed in one
   * call.
   */
  _startAggregatedCapture(sessionId, state, cfg) {
    const self = this;
    state.aggregation = true;
    if (state.timer) { try { clearTimeout(state.timer); } catch (_) { } state.timer = null; }

    const SR = 16000, CH = 1;
    const FRAME_MS = 300; // same span as a legacy chunk => same RMS scale
    const FRAME_BYTES = SR * 2 * (FRAME_MS / 1000); // 9600
    const PREROLL_FRAMES = 2;   // 600ms of context so utterances do not start mid-word
    const MAX_UTTER_MS = 15000; // hard cap: a noisy hour can never buffer unbounded
    const silenceNeededMs = (typeof cfg.vadSilenceDuration === 'number' && cfg.vadSilenceDuration > 0) ? cfg.vadSilenceDuration : 550;
    const thr = state.vadThreshold || 0.40;
    const debugAudio = process.env.MB_DEBUG_AUDIO === '1';

    console.log(`🎤 Session ${sessionId}: utterance aggregation ON (threshold=${thr}, silence=${silenceNeededMs}ms)`);

    let pending = Buffer.alloc(0);
    let preroll = [];
    let utterFrames = null; // null = idle, array = collecting
    let utterMs = 0;
    let silenceMs = 0;
    let bytesSinceCheck = 0;

    const finalize = (reason) => {
      const frames = utterFrames;
      utterFrames = null; utterMs = 0; silenceMs = 0;
      if (!frames || !frames.length) return;
      const pcm = Buffer.concat(frames);
      // Anything under ~0.4s is a click or a lone transient, not speech.
      if (pcm.length < SR * 2 * 0.4) return;
      const wav = self._encodeWavPCM16LE(pcm, SR, CH);
      if (!wav || wav.length <= 44) return;
      if (debugAudio) console.log(`🗣️ Session ${sessionId}: transcribing utterance ${(pcm.length / (SR * 2)).toFixed(1)}s (${reason})`);
      elevenLabsSTTService.transcribeAudio(wav, { mimeType: 'audio/wav', model: state.model, language: state.language })
        .then((result) => {
          if (result && result.success && (result.transcript || result.text)) {
            const text = (result.transcript || result.text || '').trim();
            if (text) {
              state.transcript += (state.transcript ? ' ' : '') + text;
              state.chunksTranscribed += 1;
              console.log(`✅ Session ${sessionId}: Transcribed utterance "${text}"`);
            }
            state.lastError = null;
            state.lastActivityAt = Date.now();
            state.consecutiveErrors = 0;
          } else {
            state.lastError = self._errText((result && result.error) || 'STT failed');
            console.warn(`⚠️ Session ${sessionId}: Utterance transcription failed: ${state.lastError}`);
          }
        })
        .catch((err) => {
          state.lastError = self._errText(err);
          console.error(`❌ Session ${sessionId}: Utterance transcription exception:`, err);
        });
    };
    state._aggFinalize = finalize;

    const onFrame = (frame) => {
      state.chunksCaptured += 1;
      state.lastChunkBytes = frame.length;
      const rms = self._computePcmRms(frame);
      if (debugAudio) console.log(`🎚️ Session ${sessionId}: frame ${state.chunksCaptured} rms=${rms.toFixed(4)} threshold=${thr} collecting=${!!utterFrames}`);
      if (rms >= thr) {
        state.chunksWithAudio += 1;
        if (!utterFrames) { utterFrames = preroll.slice(); utterMs = utterFrames.length * FRAME_MS; preroll = []; }
        utterFrames.push(frame); utterMs += FRAME_MS; silenceMs = 0;
        if (utterMs >= MAX_UTTER_MS) finalize('max-length');
      } else if (utterFrames) {
        utterFrames.push(frame); utterMs += FRAME_MS; silenceMs += FRAME_MS;
        if (silenceMs >= silenceNeededMs) finalize('silence');
        else if (utterMs >= MAX_UTTER_MS) finalize('max-length');
      } else {
        preroll.push(frame);
        if (preroll.length > PREROLL_FRAMES) preroll.shift();
      }
    };

    const capture = self.startContinuousCapture(state.deviceId, (buf) => {
      if (!state.running) return;
      bytesSinceCheck += buf.length;
      pending = pending.length ? Buffer.concat([pending, buf]) : buf;
      while (pending.length >= FRAME_BYTES) {
        const frame = Buffer.from(pending.subarray(0, FRAME_BYTES));
        pending = pending.subarray(FRAME_BYTES);
        try { onFrame(frame); } catch (_) { /* keep the stream alive */ }
      }
    }, (err) => {
      // Every continuous method failed — fall back to the proven legacy polling
      // path so the session still hears SOMETHING rather than going deaf.
      console.warn(`⚠️ Session ${sessionId}: continuous capture unavailable (${self._errText(err)}); falling back to per-chunk polling`);
      cleanup();
      if (state.running && state._startLegacy) { state.aggregation = false; state._startLegacy(); }
    });
    state.capture = capture;

    // Watchdog for the known trap where a recorder opens the source but streams
    // zero frames (seen with hand-run parec on the XVF3800): kill the silent
    // process so startContinuousCapture's close handler advances to the next
    // capture method instead of waiting forever.
    const watchdog = setInterval(() => {
      if (!state.running) { cleanup(); return; }
      if (bytesSinceCheck === 0 && capture.proc) {
        console.warn(`⚠️ Session ${sessionId}: continuous capture (${capture.method}) produced no audio in 5s — advancing method`);
        try { capture.proc.kill('SIGTERM'); } catch (_) { }
      }
      bytesSinceCheck = 0;
    }, 5000);

    function cleanup() { try { clearInterval(watchdog); } catch (_) { } }
    state._aggCleanup = cleanup;
  }

  _getMicWrapperPath() {
    return path.resolve(__dirname, '../python_wrappers/microphone_cli.py');
  }

  /**
   * Capture using a specific method (for cache hits). Returns Buffer or empty Buffer.
   */
  async _captureWithMethod(method, sourceArg, durationSec, sr, ch) {
    try {
      if (method === 'python') {
        return await this._captureWithPython(sourceArg, durationSec);
      }
      if (method === 'ffmpeg') {
        return await this._captureWithFfmpeg(sourceArg, durationSec, sr, ch);
      }
      if (method === 'arecord') {
        return await this._captureWithArecord(sourceArg, durationSec, sr, ch);
      }
      if (method === 'parec') {
        return await this._captureWithParec(sourceArg, durationSec, sr, ch);
      }
    } catch (_) { }
    return Buffer.alloc(0);
  }

  _captureWithFfmpeg(sourceArg, durationSec, sr, ch) {
    return new Promise((resolve) => {
      try {
        const ffArgs = ['-hide_banner', '-loglevel', 'error', '-f', 'pulse', '-i', sourceArg,
          '-t', String(durationSec || 1), '-ac', String(ch), '-ar', String(sr), '-f', 'wav', 'pipe:1'];
        const ff = spawn('ffmpeg', ffArgs, { stdio: ['ignore', 'pipe', 'ignore'] });
        const chunks = [];
        ff.stdout.on('data', (d) => chunks.push(d));
        ff.on('error', () => resolve(Buffer.alloc(0)));
        ff.on('close', (code) => {
          resolve(code === 0 && chunks.length ? Buffer.concat(chunks) : Buffer.alloc(0));
        });
      } catch (_) { resolve(Buffer.alloc(0)); }
    });
  }

  _captureWithArecord(sourceArg, durationSec, sr, ch) {
    return new Promise((resolve) => {
      try {
        const arArgs = ['-D', 'pulse', '-q', '-t', 'wav', '-r', String(sr), '-f', 'S16_LE', '-c', String(ch), '-d', String(durationSec || 1), '-'];
        const env = Object.assign({}, process.env, { PULSE_SOURCE: sourceArg });
        const ar = spawn('arecord', arArgs, { stdio: ['ignore', 'pipe', 'ignore'], env });
        const chunks = [];
        ar.stdout.on('data', (d) => chunks.push(d));
        ar.on('error', () => resolve(Buffer.alloc(0)));
        ar.on('close', (code) => {
          resolve(code === 0 && chunks.length ? Buffer.concat(chunks) : Buffer.alloc(0));
        });
      } catch (_) { resolve(Buffer.alloc(0)); }
    });
  }

  _captureWithParec(sourceArg, durationSec, sr, ch) {
    const self = this;
    return new Promise((resolve) => {
      try {
        const chunks = [];
        const args = ['--format=s16le', '--rate', String(sr), '--channels', String(ch)];
        if (sourceArg && sourceArg !== 'default') args.push('-d', sourceArg);
        const pr = spawn('parec', args, { stdio: ['ignore', 'pipe', 'ignore'] });
        const timer = setTimeout(() => { try { pr.kill('SIGINT'); } catch (_) { } }, Math.max(50, Math.round((durationSec || 1) * 1000)));
        pr.stdout.on('data', (d) => chunks.push(d));
        pr.on('error', () => resolve(Buffer.alloc(0)));
        pr.on('close', () => {
          try { clearTimeout(timer); } catch (_) { }
          if (chunks.length) {
            const raw = Buffer.concat(chunks);
            resolve(self._encodeWavPCM16LE(raw, sr, ch));
          } else {
            resolve(Buffer.alloc(0));
          }
        });
      } catch (_) { resolve(Buffer.alloc(0)); }
    });
  }

  _captureWithPython(sourceArg, durationSec) {
    return new Promise((resolve) => {
      try {
        const sr = 16000, ch = 1;
        const script = this._getMicWrapperPath();
        const args = [script, 'record_wav', String(sourceArg || 'default'), String(sr), String(ch), String(durationSec || 1)];
        const env = Object.assign({}, process.env, { PULSE_SOURCE: String(sourceArg || 'default') });
        const py = spawn('python3', args, { stdio: ['ignore', 'pipe', 'ignore'], env });
        const chunks = [];
        py.stdout.on('data', (d) => chunks.push(d));
        py.on('error', () => resolve(Buffer.alloc(0)));
        py.on('close', (code) => {
          const buf = chunks.length ? Buffer.concat(chunks) : Buffer.alloc(0);
          if (process.env.MB_DEBUG_AUDIO === '1') console.log('🎙️ python record_wav exit', code, 'bytes=', buf.length);
          resolve(code === 0 ? buf : Buffer.alloc(0));
        });
      } catch (_) {
        resolve(Buffer.alloc(0));
      }
    });
  }


  async captureChunkWav(deviceId, durationSec) {
    const sr = 16000, ch = 1;

    // Use cached source resolution to avoid shelling out on every chunk
    const cached = this._resolvedSourceCache.get(deviceId);
    const now_src = Date.now();
    let sourceArg;
    if (cached && (now_src - cached.timestamp) < this._sourceCacheTtl) {
      sourceArg = cached.resolvedId;
    } else {
      const src = await this.resolvePulseSourceId(deviceId);
      sourceArg = src || 'default';
      this._resolvedSourceCache.set(deviceId, { resolvedId: sourceArg, timestamp: now_src });
    }

    if (process.env.MB_DEBUG_AUDIO === '1') {
      console.log(`🎙️ STT capturing from: "${sourceArg}" (requested: "${deviceId}") for ${durationSec || 1}s`);
      console.log(`   Sample rate: ${sr}Hz, Channels: ${ch}`);
    }

    // Try cached capture method first (avoids full fallback chain on every call)
    const now = Date.now();
    if (this._cachedCapturePath && (now - this._cachedCapturePathAt) < this._capturePathCacheTtl) {
      const buf = await this._captureWithMethod(this._cachedCapturePath, sourceArg, durationSec, sr, ch);
      if (buf && buf.length > 44) {
        this._lastCapturePath = this._cachedCapturePath;
        return buf;
      }
      // Cached method failed — clear cache and fall through to full chain
      this._cachedCapturePath = null;
    }

    // 1) First try Python/PyAudio route (preferred capture method)
    const pyBuf = await this._captureWithPython(sourceArg, durationSec);
    if (pyBuf && pyBuf.length > 44) { // WAV header is 44 bytes
      this._lastCapturePath = 'python';
      this._cachedCapturePath = 'python';
      this._cachedCapturePathAt = now;
      if (process.env.MB_DEBUG_AUDIO === '1') console.log(`✓ Captured ${pyBuf.length} bytes via Python/PyAudio (cached)`);
      return pyBuf;
    } else if (process.env.MB_DEBUG_AUDIO === '1') {
      console.warn(`⚠️ Python capture failed (${pyBuf ? pyBuf.length : 0} bytes), trying fallback...`);
    }

    // 2) Fallback chain: ffmpeg -> arecord -> parec
    return new Promise((resolve) => {
      const self = this;
      function byteLen(arr) { try { return arr.reduce(function (n, c) { return n + c.length; }, 0); } catch (_) { return 0; } }
      function finish(buf, pathTag) { try { self._lastCapturePath = pathTag || self._lastCapturePath; if (buf && buf.length > 44 && pathTag) { self._cachedCapturePath = pathTag; self._cachedCapturePathAt = now; } resolve(buf || Buffer.alloc(0)); } catch (_) { resolve(Buffer.alloc(0)); } }

      // Primary fallback: ffmpeg (PulseAudio) to WAV on stdout
      var ffArgs = ['-hide_banner', '-loglevel', 'error', '-f', 'pulse', '-i', sourceArg,
        '-t', String(durationSec || 1), '-ac', String(ch), '-ar', String(sr), '-f', 'wav', 'pipe:1'];
      var ff = spawn('ffmpeg', ffArgs, { stdio: ['ignore', 'pipe', 'ignore'] });
      var chunks = [];

      function tryFallbackArecord() {
        // Fallback 1: arecord with PulseAudio plugin; pass source via env
        var arArgs = ['-D', 'pulse', '-q', '-t', 'wav', '-r', String(sr), '-f', 'S16_LE', '-c', String(ch), '-d', String(durationSec || 1), '-'];
        var env = Object.assign({}, process.env, { PULSE_SOURCE: sourceArg });
        chunks = [];
        var ar = spawn('arecord', arArgs, { stdio: ['ignore', 'pipe', 'ignore'], env: env });
        ar.stdout.on('data', function (d) { chunks.push(d); });
        ar.on('error', function () { tryFallbackParec(); });
        ar.on('close', function (code) {
          if (process.env.MB_DEBUG_AUDIO === '1') console.log('🎙️ STT fallback arecord exit', code, 'bytes=', byteLen(chunks));
          if (code === 0 && chunks.length) return finish(Buffer.concat(chunks), 'arecord');
          tryFallbackParec();
        });
      }

      function tryFallbackParec() {
        // Fallback 2: parec (Pulse/PIPEWIRE raw PCM) -> wrap to WAV
        try {
          chunks = [];
          var args = ['--format=s16le', '--rate', String(sr), '--channels', String(ch)];
          if (sourceArg && sourceArg !== 'default') { args.push('-d', sourceArg); }
          var pr = spawn('parec', args, { stdio: ['ignore', 'pipe', 'ignore'] });
          var timer = setTimeout(function () { try { pr.kill('SIGINT'); } catch (_) { } }, Math.max(50, Math.round((durationSec || 1) * 1000)));
          pr.stdout.on('data', function (d) { chunks.push(d); });
          pr.on('error', function () { finish(Buffer.alloc(0), 'parec'); });
          pr.on('close', (code) => {
            if (process.env.MB_DEBUG_AUDIO === '1') console.log('🎙️ STT fallback parec exit', code, 'bytes=', byteLen(chunks));
            try { clearTimeout(timer); } catch (_) { }
            if (chunks.length) {
              const raw = Buffer.concat(chunks);
              const wav = self._encodeWavPCM16LE(raw, sr, ch);
              return finish(wav && wav.length ? wav : Buffer.alloc(0), 'parec');
            }
            finish(Buffer.alloc(0), 'parec');
          });
        } catch (_) {
          finish(Buffer.alloc(0), 'parec');
        }
      }

      ff.stdout.on('data', function (d) { chunks.push(d); });
      ff.on('error', function () { tryFallbackArecord(); });
      ff.on('close', function (code) {
        if (process.env.MB_DEBUG_AUDIO === '1') console.log('🎙️ STT primary ffmpeg exit', code, 'bytes=', byteLen(chunks));
        if (code === 0 && chunks.length) return finish(Buffer.concat(chunks), 'ffmpeg');
        tryFallbackArecord();
      });
    });
  }

  async resolvePulseSourceId(deviceId) {
    try {
      const id = String(deviceId || '').trim();
      if (!id || id === 'default' || id === 'sysdefault' || id === 'pulse') {
        // Let PulseWire default resolve
        const sources = await pipewireService.listSources();
        const def = (sources || []).find(function (s) { return s.isDefault || s.default; });
        return def ? (def.id || def.name) : 'default';
      }
      // If already looks like a Pulse/PipeWire source name, prefer it
      const sources = await pipewireService.listSources();
      const byExact = (sources || []).find(function (s) { return s.id === id || s.name === id; });
      if (byExact) return byExact.name || byExact.id; // prefer PulseWire name over numeric id

      // Map ALSA-style ids (hw:X,Y) to closest matching Pulse source by name/description
      if (id.indexOf('hw:') === 0) {
        try {
          const devices = await pipewireService.listHardwareDevices();
          const alsa = (devices.inputs || []).find(function (d) { return d.id === id; });
          if (alsa && sources && sources.length) {
            const match = sources.find(function (s) {
              return (s.name && alsa.name && s.name.indexOf(alsa.name) !== -1)
                || (s.description && alsa.name && s.description.indexOf(alsa.name) !== -1)
                || (s.name && alsa.description && alsa.description.indexOf(s.name) !== -1);
            });
            if (match) return match.id || match.name;
          }
        } catch (_) { /* best-effort */ }
        // Fallback to default
        const def = (sources || []).find(function (s) { return s.isDefault || s.default; });
        return def ? (def.name || def.id) : 'default';
      }

      // As a last resort, pass through original id
      return id;
    } catch (e) {
      return 'default';
    }
  }

  /**
   * Continuous capture: ONE long-lived process streaming raw PCM16LE @16kHz mono.
   *
   * captureChunkWav() spawns a fresh recorder per call, so the ~950ms of process
   * startup between chunks is audio nobody ever hears. Measured on this node:
   * 1452ms of wall time per 500ms of audio, a 34% duty cycle, which shredded
   * words before they reached the conversational agent. This keeps one process
   * open for the life of the session so the stream has no holes.
   *
   * captureChunkWav() is deliberately left untouched — batch/browser callers that
   * legitimately want a single chunk still use it.
   *
   * @param {string} deviceId  microphone device (resolved to a Pulse source)
   * @param {function(Buffer)} onPcm  called with raw PCM16LE as it arrives
   * @param {function(Error)=} onError  optional; called on unrecoverable failure
   * @returns {{stop: function}} handle — stop() kills the process and halts restarts
   */
  startContinuousCapture(deviceId, onPcm, onError) {
    const sr = 16000, ch = 1;
    const self = this;
    const handle = { stopped: false, proc: null, restarts: 0, restartTimer: null, stop: null };
    // A method that yields nothing gets ONE retry before being written off: a
    // transient collision with another recorder must not permanently demote the
    // only capture path that works on this device.
    const retriedOnce = new Set();

    // Ordered candidates, all emitting headerless PCM16LE on stdout.
    function buildCommand(sourceArg) {
      return [
        // PyAudio via the app's own wrapper FIRST: it is the only method proven
        // to stream from the ReSpeaker XVF3800 array (parec/pw-record open that
        // source but deliver zero frames — see docs/hardware/RESPEAKER-XVF3800.md),
        // and it is the same capture layer every node already uses for the
        // legacy per-chunk STT path, so it is the least-surprising choice
        // everywhere. The pulse/ALSA recorders remain as fallbacks.
        { cmd: 'python3', args: [self._getMicWrapperPath(), 'stream_raw', String(sourceArg || 'default'),
          String(sr), String(ch)] },
        // --latency-msec keeps parec from handing back 2-second 64KB blocks, which
        // would put a 2s delay in front of every user turn.
        { cmd: 'parec', args: ['--device=' + sourceArg, '--rate=' + sr, '--channels=' + ch, '--format=s16le',
          '--latency-msec=50', '--process-time-msec=20'] },
        { cmd: 'ffmpeg', args: ['-hide_banner', '-loglevel', 'error', '-f', 'pulse', '-i', sourceArg,
          '-ac', String(ch), '-ar', String(sr), '-f', 's16le', 'pipe:1'] },
        { cmd: 'arecord', args: ['-D', 'pulse', '-q', '-r', String(sr), '-f', 'S16_LE', '-c', String(ch), '-t', 'raw', '-'] }
      ];
    }

    async function launch(methodIndex) {
      if (handle.stopped) return;
      let sourceArg = 'default';
      try {
        const cached = self._resolvedSourceCache.get(deviceId);
        if (cached && (Date.now() - cached.timestamp) < self._sourceCacheTtl) {
          sourceArg = cached.resolvedId;
        } else {
          sourceArg = (await self.resolvePulseSourceId(deviceId)) || 'default';
          self._resolvedSourceCache.set(deviceId, { resolvedId: sourceArg, timestamp: Date.now() });
        }
      } catch (_) { sourceArg = 'default'; }
      if (handle.stopped) return;

      const candidates = buildCommand(sourceArg);
      const idx = Math.min(methodIndex, candidates.length - 1);
      const { cmd, args } = candidates[idx];

      let proc;
      try {
        // python3 mirrors _captureWithPython: the wrapper reads PULSE_SOURCE to
        // route PyAudio at the requested source. arecord needs it for pulse.
        const env = (cmd === 'arecord' || cmd === 'python3')
          ? Object.assign({}, process.env, { PULSE_SOURCE: sourceArg })
          : process.env;
        proc = spawn(cmd, args, { stdio: ['ignore', 'pipe', 'ignore'], env });
      } catch (err) {
        return scheduleRestart(idx + 1, err);
      }
      handle.proc = proc;
      handle.method = cmd;

      const startedAt = Date.now();
      let gotAudio = false;

      proc.stdout.on('data', (buf) => {
        if (handle.stopped || !buf || buf.length === 0) return;
        gotAudio = true;
        try { onPcm(buf); } catch (_) { /* never let a consumer error kill capture */ }
      });

      proc.on('error', (err) => {
        if (handle.stopped) return;
        scheduleRestart(nextAfterFailure(idx, gotAudio), err);
      });

      proc.on('close', () => {
        if (handle.stopped) return;
        // A run that produced audio for a while is a transient death: retry the
        // SAME method. One that never produced audio means this method does not
        // work here, so advance to the next candidate.
        const ranLong = (Date.now() - startedAt) > 5000 && gotAudio;
        if (ranLong) handle.restarts = 0;
        scheduleRestart(nextAfterFailure(idx, gotAudio), null);
      });
    }

    function nextAfterFailure(idx, gotAudio) {
      if (gotAudio) return idx;
      if (!retriedOnce.has(idx)) { retriedOnce.add(idx); return idx; }
      return idx + 1;
    }

    function scheduleRestart(nextIndex, err) {
      if (handle.stopped) return;
      handle.proc = null;
      if (nextIndex > 3) { // == buildCommand() candidate count - 1
        // Every capture method failed — report once and stop trying.
        if (onError) { try { onError(err || new Error('all capture methods failed')); } catch (_) { } }
        return;
      }
      handle.restarts++;
      // Exponential backoff so a permanently broken device cannot spin the CPU.
      const delay = Math.min(8000, 500 * Math.pow(2, Math.min(4, handle.restarts - 1)));
      handle.restartTimer = setTimeout(() => launch(nextIndex), delay);
    }

    handle.stop = function () {
      handle.stopped = true;
      if (handle.restartTimer) { try { clearTimeout(handle.restartTimer); } catch (_) { } handle.restartTimer = null; }
      const p = handle.proc;
      handle.proc = null;
      if (p) {
        try { p.stdout.removeAllListeners('data'); } catch (_) { }
        try { p.kill('SIGTERM'); } catch (_) { }
        // Guarantee no orphan survives a wedged recorder.
        setTimeout(() => { try { if (!p.killed) p.kill('SIGKILL'); } catch (_) { } }, 1000);
      }
    };

    launch(0);
    return handle;
  }
}

export default new ServerSTTListener();

