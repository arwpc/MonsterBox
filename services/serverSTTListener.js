/**
 * Server-side STT Listener
 * Uses PipeWire/PulseAudio input device (from Microphone Part deviceId) and calls ElevenLabs STT
 * Implements simple polling-based "real-time" by recording short chunks and transcribing them.
 */

import { spawn } from 'child_process';
import elevenLabsSTTService from './elevenLabsSTTService.js';
import pipewireService from './pipewireService.js';

class ServerSTTListener {
  constructor() {
    this.sessions = new Map(); // sessionId -> { deviceId, model, language, running, timer, transcript }
    this.captureDurationSec = 0.8; // slightly longer to avoid ultra-short empty chunks
    this.pollIntervalMs = 500; // poll with a small buffer
  }

  startSession({ deviceId = 'default', model = 'eleven_multilingual_v2', language = 'auto' }) {
    const sessionId = 'stt_' + Date.now() + '_' + Math.random().toString(36).substr(2, 6);
    const state = {
      deviceId, model, language, running: true, transcript: '', lastError: null, timer: null,
      chunksCaptured: 0, chunksWithAudio: 0, chunksTranscribed: 0, lastChunkBytes: 0, startedAt: Date.now(), lastActivityAt: null
    };
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
          const result = await elevenLabsSTTService.transcribeAudio(buffer, { mimeType: 'audio/wav', model, language });
          if (result && result.success && (result.transcript || result.text)) {
            const text = (result.transcript || result.text || '').trim();
            if (text) { state.transcript += (state.transcript ? ' ' : '') + text; state.chunksTranscribed += 1; }
            state.lastError = null; state.lastActivityAt = Date.now();
          } else {
            state.lastError = (result && result.error) || 'STT failed';
          }
        } else {
          state.lastError = 'No audio captured (0 bytes)';
        }
      } catch (e) {
        state.lastError = e && e.message || String(e);
      } finally {
        if (state.running) state.timer = setTimeout(tick, this.pollIntervalMs);
      }
    };

    state.timer = setTimeout(tick, 10);
    return { success: true, sessionId };
  }

  stopSession(sessionId) {
    const s = this.sessions.get(sessionId);
    if (!s) return { success: false, error: 'No such session' };
    s.running = false;
    if (s.timer) { clearTimeout(s.timer); s.timer = null; }
    return { success: true };
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

  async captureChunkWav(deviceId, durationSec) {
    const sr = 16000, ch = 1;
    const src = await this.resolvePulseSourceId(deviceId);
    const sourceArg = src || 'default';
    if (process.env.MB_DEBUG_AUDIO === '1') {
      console.log(`🎙️ STT capture from source: ${sourceArg} (requested: ${deviceId}) for ${durationSec || 1}s`);
    }
    return new Promise((resolve) => {
      function byteLen(arr) { try { return arr.reduce(function (n, c) { return n + c.length; }, 0); } catch (_) { return 0; } }
      function finish(buf) { try { resolve(buf || Buffer.alloc(0)); } catch (_) { resolve(Buffer.alloc(0)); } }

      // Primary: ffmpeg (PulseAudio) to WAV on stdout
      var ffArgs = ['-hide_banner', '-loglevel', 'error', '-f', 'pulse', '-i', sourceArg,
        '-t', String(durationSec || 1), '-ac', String(ch), '-ar', String(sr), '-f', 'wav', 'pipe:1'];
      var ff = spawn('ffmpeg', ffArgs, { stdio: ['ignore', 'pipe', 'ignore'] });
      var chunks = [];
      var finished = false;

      function tryFallbackArecord() {
        if (finished) return; finished = true;
        // Fallback 1: arecord with PulseAudio plugin; pass source via env
        var arArgs = ['-D', 'pulse', '-q', '-t', 'wav', '-r', String(sr), '-f', 'S16_LE', '-c', String(ch), '-d', String(durationSec || 1), '-'];
        var env = Object.assign({}, process.env, { PULSE_SOURCE: sourceArg });
        chunks = [];
        var ar = spawn('arecord', arArgs, { stdio: ['ignore', 'pipe', 'ignore'], env: env });
        ar.stdout.on('data', function (d) { chunks.push(d); });
        ar.on('error', function () { tryFallbackParec(); });
        ar.on('close', function (code) {
          if (process.env.MB_DEBUG_AUDIO === '1') console.log('🎙️ STT fallback arecord exit', code, 'bytes=', byteLen(chunks));
          if (code === 0 && chunks.length) return finish(Buffer.concat(chunks));
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
          pr.on('error', function () { finish(Buffer.alloc(0)); });
          pr.on('close', (code) => {
            if (process.env.MB_DEBUG_AUDIO === '1') console.log('🎙️ STT fallback parec exit', code, 'bytes=', byteLen(chunks));
            try { clearTimeout(timer); } catch (_) { }
            if (chunks.length) {
              const raw = Buffer.concat(chunks);
              const wav = this._encodeWavPCM16LE(raw, sr, ch);
              return finish(wav && wav.length ? wav : Buffer.alloc(0));
            }
            finish(Buffer.alloc(0));
          });
        } catch (_) {
          finish(Buffer.alloc(0));
        }
      }

      ff.stdout.on('data', function (d) { chunks.push(d); });
      ff.on('error', function () { tryFallbackArecord(); });
      ff.on('close', function (code) {
        if (process.env.MB_DEBUG_AUDIO === '1') console.log('🎙️ STT primary ffmpeg exit', code, 'bytes=', byteLen(chunks));
        if (code === 0 && chunks.length) finish(Buffer.concat(chunks)); else tryFallbackArecord();
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

