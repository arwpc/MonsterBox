import { expect } from 'chai';
import { spawnSync } from 'child_process';

// Import the service functions directly
import {
  preAnalyzeAudio,
  calculateJawAngle,
  applySmoothingToAmplitude,
  getDefaultJawConfig
} from '../../services/jawAnimationSuperPowerService.js';

describe('Jaw Pre-Analysis Engine', () => {

  // Helper: generate a sine wave PCM buffer (s16le, 16kHz, mono)
  function generateSineWavePCM(freqHz, durationMs, amplitude) {
    const sampleRate = 16000;
    const numSamples = Math.round(sampleRate * durationMs / 1000);
    const buf = Buffer.alloc(numSamples * 2);
    for (let i = 0; i < numSamples; i++) {
      const t = i / sampleRate;
      const sample = Math.round(amplitude * 32767 * Math.sin(2 * Math.PI * freqHz * t));
      buf.writeInt16LE(Math.max(-32768, Math.min(32767, sample)), i * 2);
    }
    return buf;
  }

  // Helper: wrap raw PCM into a minimal WAV container so ffmpeg can decode it
  function wrapAsWav(pcmBuffer, sampleRate, channels, bitsPerSample) {
    sampleRate = sampleRate || 16000;
    channels = channels || 1;
    bitsPerSample = bitsPerSample || 16;
    const byteRate = sampleRate * channels * bitsPerSample / 8;
    const blockAlign = channels * bitsPerSample / 8;
    const dataSize = pcmBuffer.length;
    const header = Buffer.alloc(44);
    header.write('RIFF', 0);
    header.writeUInt32LE(36 + dataSize, 4);
    header.write('WAVE', 8);
    header.write('fmt ', 12);
    header.writeUInt32LE(16, 16); // chunk size
    header.writeUInt16LE(1, 20);  // PCM format
    header.writeUInt16LE(channels, 22);
    header.writeUInt32LE(sampleRate, 24);
    header.writeUInt32LE(byteRate, 28);
    header.writeUInt16LE(blockAlign, 32);
    header.writeUInt16LE(bitsPerSample, 34);
    header.write('data', 36);
    header.writeUInt32LE(dataSize, 40);
    return Buffer.concat([header, pcmBuffer]);
  }

  const defaultConfig = getDefaultJawConfig();
  const testGuardrails = { minAngle: 70, maxAngle: 93, calibrated: true };

  describe('preAnalyzeAudio()', () => {
    // preAnalyzeAudio shells out to ffmpeg to decode audio into PCM. On hosts
    // without ffmpeg (some CI images, cloud dev containers) these tests cannot
    // run at all, so skip them rather than reporting spurious ENOENT failures.
    // The RPi4B and the release CI both have ffmpeg, where these run normally.
    before(function () {
      const probe = spawnSync('ffmpeg', ['-version']);
      if (probe.error) {
        console.warn('  ⚠️  ffmpeg not found — skipping preAnalyzeAudio() suite');
        this.skip();
      }
    });

    it('should return frames for a 500ms sine wave', async function() {
      this.timeout(10000);
      const pcm = generateSineWavePCM(1000, 500, 0.5);
      const wav = wrapAsWav(pcm);
      const result = await preAnalyzeAudio(wav, 'audio/wav', defaultConfig, testGuardrails);

      expect(result).to.have.property('frames').that.is.an('array');
      expect(result.frames.length).to.be.greaterThan(0);
      expect(result).to.have.property('duration').that.is.a('number');
      expect(result).to.have.property('peakRms').that.is.a('number');

      // Duration should be approximately 500ms (allow for ffmpeg padding)
      expect(result.duration).to.be.within(400, 700);
    });

    it('should produce frames with time, angle, and amplitude', async function() {
      this.timeout(10000);
      const pcm = generateSineWavePCM(1000, 300, 0.5);
      const wav = wrapAsWav(pcm);
      const result = await preAnalyzeAudio(wav, 'audio/wav', defaultConfig, testGuardrails);

      const frame = result.frames[0];
      expect(frame).to.have.property('time').that.is.a('number');
      expect(frame).to.have.property('angle').that.is.a('number');
      expect(frame).to.have.property('amplitude').that.is.a('number');
    });

    it('should match frame count to expected duration at 20ms intervals', async function() {
      this.timeout(10000);
      const pcm = generateSineWavePCM(1000, 1000, 0.5);
      const wav = wrapAsWav(pcm);
      const result = await preAnalyzeAudio(wav, 'audio/wav', defaultConfig, testGuardrails);

      // At 20ms per frame, 1000ms should produce ~50 frames (allow for padding)
      const expectedFrames = Math.round(1000 / 20);
      expect(result.frames.length).to.be.within(expectedFrames - 5, expectedFrames + 10);
    });

    it('should apply AGC normalization (peak near 0.8)', async function() {
      this.timeout(10000);
      // Low amplitude signal
      const pcm = generateSineWavePCM(1000, 500, 0.1);
      const wav = wrapAsWav(pcm);
      const agcConfig = { ...defaultConfig, useAGC: true, volumeThreshold: 0.001 };
      const result = await preAnalyzeAudio(wav, 'audio/wav', agcConfig, testGuardrails);

      // With AGC, peak amplitude in frames should be near 0.8
      const peakAmp = result.frames.reduce(function(max, f) {
        return f.amplitude > max ? f.amplitude : max;
      }, 0);
      expect(peakAmp).to.be.within(0.4, 1.0);
    });

    it('should gate silence below volume threshold', async function() {
      this.timeout(10000);
      // Very quiet signal
      const pcm = generateSineWavePCM(1000, 300, 0.001);
      const wav = wrapAsWav(pcm);
      const config = { ...defaultConfig, volumeThreshold: 0.1, useAGC: false };
      const result = await preAnalyzeAudio(wav, 'audio/wav', config, testGuardrails);

      // All frames should be at minAngle (silence gated)
      result.frames.forEach(function(f) {
        expect(f.angle).to.equal(testGuardrails.minAngle);
      });
    });

    it('should quantize angles to discrete levels', async function() {
      this.timeout(10000);
      const pcm = generateSineWavePCM(1000, 500, 0.5);
      const wav = wrapAsWav(pcm);
      const config = { ...defaultConfig, quantizationLevels: 5 };
      const result = await preAnalyzeAudio(wav, 'audio/wav', config, testGuardrails);

      // Collect unique angles
      const uniqueAngles = new Set();
      result.frames.forEach(function(f) { uniqueAngles.add(f.angle); });

      // Should have at most quantizationLevels unique angles
      expect(uniqueAngles.size).to.be.at.most(5);
    });

    it('should handle empty buffer gracefully', async function() {
      this.timeout(10000);
      const emptyWav = wrapAsWav(Buffer.alloc(0));
      const result = await preAnalyzeAudio(emptyWav, 'audio/wav', defaultConfig, testGuardrails);

      expect(result.frames).to.be.an('array');
      expect(result.duration).to.equal(0);
    });

    it('should clamp all angles within guardrails', async function() {
      this.timeout(10000);
      const pcm = generateSineWavePCM(1000, 500, 1.0);
      const wav = wrapAsWav(pcm);
      const result = await preAnalyzeAudio(wav, 'audio/wav', defaultConfig, testGuardrails);

      result.frames.forEach(function(f) {
        expect(f.angle).to.be.at.least(testGuardrails.minAngle);
        expect(f.angle).to.be.at.most(testGuardrails.maxAngle);
      });
    });

    it('should respect useBandpassFilter=false', async function() {
      this.timeout(10000);
      const pcm = generateSineWavePCM(1000, 300, 0.5);
      const wav = wrapAsWav(pcm);
      const config = { ...defaultConfig, useBandpassFilter: false };
      const result = await preAnalyzeAudio(wav, 'audio/wav', config, testGuardrails);

      // Should still produce valid frames
      expect(result.frames.length).to.be.greaterThan(0);
    });
  });

  describe('calculateJawAngle()', () => {
    it('should return minAngle when amplitude is below threshold', () => {
      const config = { ...defaultConfig, volumeThreshold: 0.1 };
      const angle = calculateJawAngle(0.05, config, testGuardrails);
      expect(angle).to.equal(testGuardrails.minAngle);
    });

    it('should return angle above minAngle for significant amplitude', () => {
      const angle = calculateJawAngle(0.5, defaultConfig, testGuardrails);
      expect(angle).to.be.greaterThan(testGuardrails.minAngle);
    });

    it('should clamp angle to maxAngle', () => {
      const angle = calculateJawAngle(10.0, defaultConfig, testGuardrails);
      expect(angle).to.be.at.most(testGuardrails.maxAngle);
    });
  });

  describe('getDefaultJawConfig()', () => {
    it('should include v2 config fields', () => {
      const config = getDefaultJawConfig();
      expect(config).to.have.property('useBandpassFilter', true);
      expect(config).to.have.property('useAGC', true);
      expect(config).to.have.property('quantizationLevels', 10);
      expect(config).to.have.property('preset', 'speech');
    });

    it('should have backward-compatible defaults', () => {
      const config = getDefaultJawConfig();
      expect(config).to.have.property('sensitivity', 1.0);
      expect(config).to.have.property('smoothing', 0.6);
      expect(config).to.have.property('volumeThreshold', 0.02);
      expect(config).to.have.property('attackTime', 50);
      expect(config).to.have.property('releaseTime', 150);
    });
  });
});
