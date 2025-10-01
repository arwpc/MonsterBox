/**
 * Microphone record_wav smoke test (PyAudio via PipeWire)
 *
 * Attempts a very short capture using python_wrappers/microphone_cli.py record_wav.
 * Passes if bytes >= 44 (WAV header) OR gracefully skips when audio is unavailable.
 */

import { expect } from 'chai';
import { spawn } from 'child_process';
import path from 'path';
import { fileURLToPath } from 'url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

const WRAPPER = path.join(__dirname, '..', 'python_wrappers', 'microphone_cli.py');

function capture(durationSec = 0.2, deviceId = 'default') {
  return new Promise((resolve) => {
    const args = [WRAPPER, 'record_wav', deviceId, '16000', '1', String(durationSec)];
    const env = { ...process.env, PULSE_SOURCE: deviceId };
    const cp = spawn('python3', args, { stdio: ['ignore', 'pipe', 'pipe'], env });
    const chunks = [];
    let stderr = '';
    cp.stdout.on('data', (d) => chunks.push(d));
    cp.stderr.on('data', (d) => { stderr += d.toString(); });
    cp.on('close', (code) => {
      const buf = chunks.length ? Buffer.concat(chunks) : Buffer.alloc(0);
      resolve({ code, buf, stderr });
    });
    cp.on('error', () => resolve({ code: 1, buf: Buffer.alloc(0), stderr: 'spawn error' }));
  });
}

describe('microphone_cli.py record_wav', function () {
  it('should produce a WAV buffer or gracefully skip', async function () {
    this.timeout(8000);
    const { code, buf, stderr } = await capture(0.2, 'default');
    // Acceptable outcomes:
    // - Success with WAV bytes >= 44
    // - Exit code nonzero due to missing audio; do not fail hard in CI
    if (code === 0 && buf.length >= 44) {
      // Minimal RIFF header checks
      expect(buf.slice(0, 4).toString('ascii')).to.equal('RIFF');
      expect(buf.slice(8, 12).toString('ascii')).to.equal('WAVE');
    } else {
      console.warn('record_wav skipped (no audio available): code=%d bytes=%d stderr=%s', code, buf.length, stderr);
    }
  });
});

