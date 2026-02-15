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
    this.captureDurationSec = 2.0; // longer chunks capture full sentences
    this.pollIntervalMs = 500; // faster polling for better responsiveness
    this._lastCapturePath = null; // 'python' | 'ffmpeg' | 'arecord' | 'parec'
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
      vadEnabled: false, vadThreshold: 0.03, consecutiveErrors: 0, maxConsecutiveErrors: 10
    };

    console.log(`🎤 Starting STT session ${sessionId} for device: ${deviceId}, model: ${model}, language: ${language}`);

    // Load VAD settings asynchronously from STT config (no await to keep sync start)
    try {
      getSTTConfig().then((cfg) => {
        if (!cfg) return;
        state.vadEnabled = !!cfg.vadEnabled;
        if (typeof cfg.vadThreshold === 'number') {
          var t = cfg.vadThreshold; if (!(t >= 0.005 && t <= 0.6)) t = 0.03; state.vadThreshold = t;
        }
        console.log(`🎤 Session ${sessionId} VAD settings: enabled=${state.vadEnabled}, threshold=${state.vadThreshold}`);
      }).catch(() => { /* ignore */ });
    } catch (_) { /* ignore */ }
    this.sessions.set(sessionId, state);

    const tick = async () => {
      if (!state.running) return;
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
            if (state.vadEnabled) {
              rms = this._computeWavRms(buffer);
              var thr = state.vadThreshold || 0.03;
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
        if (state.running) {
          state.timer = setTimeout(tick, this.pollIntervalMs);
        } else {
          console.log(`🛑 Session ${sessionId}: Stopped (running=false)`);
        }
      }
    };

    state.timer = setTimeout(tick, 10);
    return { success: true, sessionId };
  }

  stopSession(sessionId) {
    const s = this.sessions.get(sessionId);
    if (!s) return { success: false, error: 'No such session' };
    console.log(`🛑 Stopping STT session ${sessionId} (captured=${s.chunksCaptured}, transcribed=${s.chunksTranscribed})`);
    s.running = false;
    if (s.timer) { clearTimeout(s.timer); s.timer = null; }
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

  _getMicWrapperPath() {
    return path.resolve(__dirname, '../python_wrappers/microphone_cli.py');
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
    const src = await this.resolvePulseSourceId(deviceId);
    const sourceArg = src || 'default';

    // ALWAYS log which microphone we're using (not just in debug mode)
    console.log(`🎙️ STT capturing from: "${sourceArg}" (requested: "${deviceId}") for ${durationSec || 1}s`);

    if (process.env.MB_DEBUG_AUDIO === '1') {
      console.log(`   Sample rate: ${sr}Hz, Channels: ${ch}`);
    }

    // 1) First try Python/PyAudio route (preferred capture method)
    const pyBuf = await this._captureWithPython(sourceArg, durationSec);
    if (pyBuf && pyBuf.length > 44) { // WAV header is 44 bytes
      this._lastCapturePath = 'python';
      console.log(`✓ Captured ${pyBuf.length} bytes via Python/PyAudio from "${sourceArg}"`);
      return pyBuf;
    } else {
      console.warn(`⚠️ Python capture failed or returned empty buffer (${pyBuf ? pyBuf.length : 0} bytes), trying fallback...`);
    }

    // 2) Fallback chain: ffmpeg -> arecord -> parec
    return new Promise((resolve) => {
      const self = this;
      function byteLen(arr) { try { return arr.reduce(function (n, c) { return n + c.length; }, 0); } catch (_) { return 0; } }
      function finish(buf, pathTag) { try { self._lastCapturePath = pathTag || self._lastCapturePath; resolve(buf || Buffer.alloc(0)); } catch (_) { resolve(Buffer.alloc(0)); } }

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
}

export default new ServerSTTListener();

