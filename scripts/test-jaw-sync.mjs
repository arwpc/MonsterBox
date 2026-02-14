// Test jaw-audio synchronization after ChatterPi-style fix
const BASE = 'http://localhost:3000/setup/jaw-animation';
const CID = 3;

async function poll() {
  const res = await fetch(`${BASE}/api/jaw-animation/${CID}/audio-levels`);
  return await res.json();
}

async function main() {
  console.log('Starting TTS...');
  const t0 = Date.now();
  
  // Fire TTS (don't await the response body)
  const ttsPromise = fetch(`${BASE}/api/jaw-animation/${CID}/test-tts`, {
    method: 'POST',
    headers: {'Content-Type': 'application/json'},
    body: JSON.stringify({text: 'Hello, I am Count Orlok. Welcome to my castle.'})
  });
  
  console.log('TTS request sent at t=0');
  
  // Poll continuously for 12 seconds
  const samples = [];
  let foundPlaying = false;
  let playingEndedAt = null;
  
  for (let i = 0; i < 350; i++) {
    const data = await poll();
    const elapsed = Date.now() - t0;
    
    samples.push({
      t: elapsed,
      amp: data.currentAmplitude || 0,
      angle: data.jawAngle || 0,
      playing: data.playing
    });
    
    if (data.playing && !foundPlaying) {
      console.log(`>>> PLAYING DETECTED at t=${elapsed}ms`);
      foundPlaying = true;
    }
    if (foundPlaying && !data.playing && !playingEndedAt) {
      console.log(`>>> PLAYING ENDED at t=${elapsed}ms`);
      playingEndedAt = elapsed;
      // Capture a few more samples then stop
      for (let j = 0; j < 5; j++) {
        await new Promise(r => setTimeout(r, 30));
        const d2 = await poll();
        samples.push({ t: Date.now() - t0, amp: d2.currentAmplitude || 0, angle: d2.jawAngle || 0, playing: d2.playing });
      }
      break;
    }
    
    if (i < 5 || i % 25 === 0) {
      console.log(`t=${String(elapsed).padStart(6)}ms  playing=${data.playing}  amp=${(data.currentAmplitude||0).toFixed(3)}  angle=${(data.jawAngle||0).toFixed(1)}`);
    }
    
    await new Promise(r => setTimeout(r, 30));
  }
  
  const ttsRes = await ttsPromise;
  const ttsJ = await ttsRes.json();
  console.log(`TTS response at t=${Date.now()-t0}ms:`, JSON.stringify(ttsJ));
  
  // Analyze results
  let playingCount = 0, zeroAngleWhilePlaying = 0, maxAngle = 0, minAngle = 999;
  
  for (const s of samples) {
    if (s.playing) {
      playingCount++;
      if (s.angle === 0) zeroAngleWhilePlaying++;
      if (s.angle > maxAngle) maxAngle = s.angle;
      if (s.angle > 0 && s.angle < minAngle) minAngle = s.angle;
    }
  }
  
  console.log(`\n=== SYNC TEST RESULTS ===`);
  console.log(`Total samples: ${samples.length}`);
  console.log(`Samples while playing: ${playingCount}`);
  console.log(`Zero-angle while playing: ${zeroAngleWhilePlaying} (${((zeroAngleWhilePlaying/Math.max(1,playingCount))*100).toFixed(1)}%)`);
  console.log(`Max angle: ${maxAngle}°`);
  console.log(`Min angle (non-zero): ${minAngle}°`);
  console.log(`Range used: ${(maxAngle - minAngle).toFixed(1)}° of 23° available`);
  
  console.log(`\n=== TIMELINE (playing frames) ===`);
  for (const s of samples) {
    if (s.playing) {
      const barLen = Math.max(0, Math.round(s.angle - 70));
      const bar = '█'.repeat(barLen);
      console.log(`t=${String(s.t).padStart(5)}  amp=${s.amp.toFixed(3)}  angle=${String(s.angle.toFixed(1)).padStart(5)}°  ${bar}`);
    }
  }
}

main().catch(console.error);
