// Direct test of driveJawFromAudioBuffer
import { driveJawFromAudioBuffer, getJawDriveState } from '../services/jawAnimationSuperPowerService.js';

// Generate a simple test WAV
function makeTestWav(durationSec) {
  const sampleRate = 16000;
  const numSamples = sampleRate * durationSec;
  const buffer = Buffer.alloc(44 + numSamples * 2);
  
  buffer.write('RIFF', 0);
  buffer.writeUInt32LE(36 + numSamples * 2, 4);
  buffer.write('WAVE', 8);
  buffer.write('fmt ', 12);
  buffer.writeUInt32LE(16, 16);
  buffer.writeUInt16LE(1, 20);
  buffer.writeUInt16LE(1, 22);
  buffer.writeUInt32LE(sampleRate, 24);
  buffer.writeUInt32LE(sampleRate * 2, 28);
  buffer.writeUInt16LE(2, 32);
  buffer.writeUInt16LE(16, 34);
  buffer.write('data', 36);
  buffer.writeUInt32LE(numSamples * 2, 40);
  
  for (let i = 0; i < numSamples; i++) {
    const t = i / sampleRate;
    const env = Math.sin(Math.PI * t / durationSec) * (0.5 + 0.5 * Math.sin(2 * Math.PI * 4 * t));
    const sample = Math.round(env * 8000 * Math.sin(2 * Math.PI * 220 * t));
    buffer.writeInt16LE(Math.max(-32768, Math.min(32767, sample)), 44 + i * 2);
  }
  return buffer;
}

async function main() {
  const testAudio = makeTestWav(2);
  console.log('Test WAV size:', testAudio.length, 'bytes');
  
  // Start the drive as fire-and-forget
  const drivePromise = driveJawFromAudioBuffer(3, testAudio, 'audio/wav');
  
  // Poll state rapidly
  const startTime = Date.now();
  const samples = [];
  let foundPlaying = false;
  
  for (let i = 0; i < 200; i++) {
    const state = getJawDriveState(3);
    const elapsed = Date.now() - startTime;
    samples.push({ t: elapsed, ...state });
    
    if (state.active && !foundPlaying) {
      console.log(`>>> ACTIVE at t=${elapsed}ms`);
      foundPlaying = true;
    }
    
    if (i < 10 || state.active) {
      console.log(`t=${String(elapsed).padStart(5)}ms  active=${state.active}  amp=${state.amplitude.toFixed(4)}  angle=${state.angle.toFixed(1)}`);
    }
    
    await new Promise(r => setTimeout(r, 25));
  }
  
  const result = await drivePromise;
  console.log('\nDrive result:', JSON.stringify(result));
  
  // Analyze
  let activeCount = 0, zeroAngle = 0, maxAngle = 0;
  for (const s of samples) {
    if (s.active) {
      activeCount++;
      if (s.angle === 0) zeroAngle++;
      if (s.angle > maxAngle) maxAngle = s.angle;
    }
  }
  console.log(`\nActive samples: ${activeCount}, Zero-angle: ${zeroAngle} (${((zeroAngle/Math.max(1,activeCount))*100).toFixed(1)}%), Max angle: ${maxAngle.toFixed(1)}°`);
}

main().catch(err => {
  console.error('ERROR:', err.message);
  console.error(err.stack);
  process.exit(1);
});
