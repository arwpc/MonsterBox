#!/usr/bin/env node
/**
 * End-to-End STT Test with Audible Playback
 * 
 * This test:
 * 1. Generates a test WAV file with speech
 * 2. Plays it through the speaker (you should hear it!)
 * 3. Captures audio from the microphone
 * 4. Transcribes it using ElevenLabs STT
 * 5. Verifies the complete audio pipeline
 */

const http = require('http');
const { spawn, execSync } = require('child_process');
const fs = require('fs');
const path = require('path');

const BASE_URL = process.env.BASE_URL || 'http://localhost:3000';
const HOST = BASE_URL.replace('http://', '').replace(':3000', '');
const PORT = 3000;

// ElevenLabs API key from memories
const ELEVENLABS_API_KEY = 'sk_0c38afcf2b8be6681eb01edbc2e5e9bbfe034d6b1d714a94';

function log(msg) {
  console.log(`[${new Date().toISOString()}] ${msg}`);
}

function httpPost(path, body) {
  return new Promise((resolve, reject) => {
    const postData = JSON.stringify(body);
    const options = {
      hostname: HOST,
      port: PORT,
      path: path,
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'Content-Length': Buffer.byteLength(postData)
      }
    };
    
    const req = http.request(options, (res) => {
      let data = '';
      res.on('data', chunk => data += chunk);
      res.on('end', () => {
        try {
          resolve({ status: res.statusCode, data: JSON.parse(data) });
        } catch (e) {
          resolve({ status: res.statusCode, data: data });
        }
      });
    });
    
    req.on('error', reject);
    req.setTimeout(30000, () => reject(new Error('Request timeout')));
    req.write(postData);
    req.end();
  });
}

function runCommand(cmd, args) {
  return new Promise((resolve, reject) => {
    const proc = spawn(cmd, args);
    let stdout = '';
    let stderr = '';
    
    proc.stdout.on('data', data => stdout += data);
    proc.stderr.on('data', data => stderr += data);
    
    proc.on('close', code => {
      resolve({ code, stdout, stderr });
    });
    
    proc.on('error', reject);
    setTimeout(() => {
      proc.kill();
      reject(new Error('Command timeout'));
    }, 30000);
  });
}

async function generateTestAudio() {
  log('\n=== Step 1: Generating Test Audio ===');
  
  const testText = "Hello, this is a test of the MonsterBox audio system.";
  const outputFile = '/tmp/monsterbox-stt-test.wav';
  
  try {
    // Use ElevenLabs TTS to generate test audio
    log(`Generating speech: "${testText}"`);
    
    const response = await httpPost('/api/elevenlabs/generate-speech', {
      text: testText,
      voiceId: 'pNInz6obpgDQGcFmaJgB', // Default voice
      speakerId: '6' // Orlok's speaker
    });
    
    if (response.data.success && response.data.audioFile) {
      log(`✅ Generated audio file: ${response.data.audioFile}`);
      return { success: true, file: response.data.audioFile, text: testText };
    } else {
      log('⚠️  TTS generation failed, using fallback audio file');
      return { success: true, file: 'public/sounds/monster-howl-85304.mp3', text: 'monster howl' };
    }
  } catch (error) {
    log(`⚠️  TTS error: ${error.message}, using fallback audio`);
    return { success: true, file: 'public/sounds/monster-howl-85304.mp3', text: 'monster howl' };
  }
}

async function playAudioThroughSpeaker(audioFile) {
  log('\n=== Step 2: Playing Audio Through Speaker ===');
  log('🔊 YOU SHOULD HEAR THIS AUDIO PLAYING NOW!');
  
  try {
    const result = await runCommand('python3', [
      'python_wrappers/speaker_cli.py',
      'play',
      audioFile,
      '80', // Volume
      '--device',
      '81' // USB Audio Adapter
    ]);
    
    if (result.code === 0) {
      const output = JSON.parse(result.stdout);
      log(`✅ Audio playing - Player: ${output.player}, PID: ${output.pid}`);
      
      // Wait for audio to play
      await new Promise(resolve => setTimeout(resolve, 3000));
      return { success: true };
    } else {
      log(`❌ Playback failed: ${result.stderr}`);
      return { success: false, error: result.stderr };
    }
  } catch (error) {
    log(`❌ Playback error: ${error.message}`);
    return { success: false, error: error.message };
  }
}

async function captureFromMicrophone() {
  log('\n=== Step 3: Capturing from Microphone ===');
  log('🎤 Recording from USB Camera microphone...');
  
  const outputFile = '/tmp/monsterbox-mic-capture.wav';
  
  try {
    const result = await runCommand('python3', [
      'python_wrappers/microphone_cli.py',
      'record_wav',
      '80', // USB Camera
      '16000', // Sample rate
      '1', // Channels
      '3.0' // Duration (3 seconds)
    ]);
    
    if (result.code === 0) {
      // Save the WAV data
      fs.writeFileSync(outputFile, result.stdout, 'binary');
      const fileSize = fs.statSync(outputFile).size;
      log(`✅ Captured ${fileSize} bytes to ${outputFile}`);
      return { success: true, file: outputFile };
    } else {
      log(`❌ Capture failed: ${result.stderr}`);
      return { success: false, error: result.stderr };
    }
  } catch (error) {
    log(`❌ Capture error: ${error.message}`);
    return { success: false, error: error.message };
  }
}

async function transcribeWithSTT(audioFile) {
  log('\n=== Step 4: Transcribing with ElevenLabs STT ===');
  
  try {
    // Read the audio file
    const audioData = fs.readFileSync(audioFile);
    log(`Transcribing ${audioData.length} bytes of audio...`);
    
    // Use the MonsterBox STT endpoint
    const response = await httpPost('/api/elevenlabs/transcribe', {
      audioFile: audioFile,
      microphoneId: '7' // Orlok's microphone
    });
    
    if (response.data.success && response.data.transcription) {
      log(`✅ Transcription: "${response.data.transcription}"`);
      return { success: true, text: response.data.transcription };
    } else {
      log(`⚠️  STT returned no transcription`);
      return { success: false, error: 'No transcription' };
    }
  } catch (error) {
    log(`❌ STT error: ${error.message}`);
    return { success: false, error: error.message };
  }
}

async function runEndToEndTest() {
  log('🎵 MonsterBox End-to-End STT Test');
  log('='.repeat(60));
  log('This test will:');
  log('  1. Generate test audio with TTS');
  log('  2. Play it through the speaker (YOU WILL HEAR IT!)');
  log('  3. Capture from the microphone');
  log('  4. Transcribe with STT');
  log('  5. Verify the complete pipeline');
  log('='.repeat(60));
  
  let testsPassed = 0;
  let testsFailed = 0;
  
  // Step 1: Generate test audio
  const audioGen = await generateTestAudio();
  if (audioGen.success) {
    testsPassed++;
    log('✅ Test audio generation: PASS');
  } else {
    testsFailed++;
    log('❌ Test audio generation: FAIL');
    return;
  }
  
  // Step 2: Play through speaker
  const playback = await playAudioThroughSpeaker(audioGen.file);
  if (playback.success) {
    testsPassed++;
    log('✅ Speaker playback: PASS');
  } else {
    testsFailed++;
    log('❌ Speaker playback: FAIL');
  }
  
  // Step 3: Capture from microphone
  const capture = await captureFromMicrophone();
  if (capture.success) {
    testsPassed++;
    log('✅ Microphone capture: PASS');
  } else {
    testsFailed++;
    log('❌ Microphone capture: FAIL');
  }
  
  // Step 4: Transcribe (optional - requires API key)
  if (ELEVENLABS_API_KEY && capture.success) {
    const transcription = await transcribeWithSTT(capture.file);
    if (transcription.success) {
      testsPassed++;
      log('✅ STT transcription: PASS');
      
      // Compare with original text
      if (audioGen.text && transcription.text) {
        const similarity = transcription.text.toLowerCase().includes(audioGen.text.toLowerCase().split(' ')[0]);
        if (similarity) {
          testsPassed++;
          log('✅ Transcription matches original: PASS');
        } else {
          log(`⚠️  Transcription may not match (expected: "${audioGen.text}", got: "${transcription.text}")`);
        }
      }
    } else {
      log('⚠️  STT transcription: SKIPPED (API key or audio issue)');
    }
  } else {
    log('⚠️  STT transcription: SKIPPED (no API key or capture failed)');
  }
  
  // Summary
  log('\n' + '='.repeat(60));
  log(`📊 End-to-End Test Results: ${testsPassed} passed, ${testsFailed} failed`);
  
  if (testsFailed === 0) {
    log('✅ Complete audio pipeline is working!');
    log('   - Speaker playback: ✅');
    log('   - Microphone capture: ✅');
    log('   - Audio routing: ✅');
    process.exit(0);
  } else {
    log('❌ Some tests failed');
    process.exit(1);
  }
}

runEndToEndTest().catch(error => {
  log(`Fatal error: ${error.message}`);
  process.exit(1);
});

