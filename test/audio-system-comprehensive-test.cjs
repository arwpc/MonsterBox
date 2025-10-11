#!/usr/bin/env node
/**
 * Comprehensive Audio System Test
 * Tests speaker playback, microphone capture, and end-to-end STT
 */

const http = require('http');
const { spawn } = require('child_process');
const fs = require('fs');
const path = require('path');

const BASE_URL = process.env.BASE_URL || 'http://localhost:3000';
const HOST = BASE_URL.replace('http://', '').replace(':3000', '');
const PORT = 3000;

let testsPassed = 0;
let testsFailed = 0;

function log(msg) {
  console.log(`[${new Date().toISOString()}] ${msg}`);
}

function pass(test) {
  testsPassed++;
  log(`✅ PASS: ${test}`);
}

function fail(test, error) {
  testsFailed++;
  log(`❌ FAIL: ${test}`);
  if (error) log(`   Error: ${error}`);
}

function httpGet(path) {
  return new Promise((resolve, reject) => {
    const options = {
      hostname: HOST,
      port: PORT,
      path: path,
      method: 'GET'
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
    req.setTimeout(10000, () => reject(new Error('Request timeout')));
    req.end();
  });
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
    }, 10000);
  });
}

async function testServerHealth() {
  log('\n=== Testing Server Health ===');
  try {
    const res = await httpGet('/setup/audio');
    if (res.status === 200) {
      pass('Server is responding');
    } else {
      fail('Server health check', `Status: ${res.status}`);
    }
  } catch (error) {
    fail('Server health check', error.message);
  }
}

async function testAudioDeviceEnumeration() {
  log('\n=== Testing Audio Device Enumeration ===');
  
  try {
    const outputs = await httpGet('/setup/audio/api/outputs');
    if (outputs.data.success && outputs.data.outputs.length > 0) {
      pass(`Found ${outputs.data.outputs.length} output devices`);
      log(`   Outputs: ${outputs.data.outputs.map(o => o.name).join(', ')}`);
    } else {
      fail('Output device enumeration', 'No outputs found');
    }
  } catch (error) {
    fail('Output device enumeration', error.message);
  }
  
  try {
    const inputs = await httpGet('/setup/audio/api/inputs');
    if (inputs.data.success && inputs.data.inputs.length > 0) {
      pass(`Found ${inputs.data.inputs.length} input devices`);
      log(`   Inputs: ${inputs.data.inputs.map(i => i.name).join(', ')}`);
    } else {
      fail('Input device enumeration', 'No inputs found');
    }
  } catch (error) {
    fail('Input device enumeration', error.message);
  }
}

async function testSpeakerPlayback() {
  log('\n=== Testing Speaker Playback ===');
  
  // Test with device ID 81 (USB Audio Adapter)
  try {
    log('Playing test audio on device 81...');
    const result = await runCommand('python3', [
      'python_wrappers/speaker_cli.py',
      'play',
      'public/sounds/monster-howl-85304.mp3',
      '80',
      '--device',
      '81'
    ]);
    
    if (result.code === 0) {
      const output = JSON.parse(result.stdout);
      if (output.status === 'success') {
        pass('Speaker playback with device 81');
        log(`   Player: ${output.player}, PID: ${output.pid}`);
      } else {
        fail('Speaker playback', output.message);
      }
    } else {
      fail('Speaker playback', result.stderr);
    }
  } catch (error) {
    fail('Speaker playback', error.message);
  }
  
  // Wait for playback to finish
  await new Promise(resolve => setTimeout(resolve, 2000));
}

async function testMicrophoneCapture() {
  log('\n=== Testing Microphone Capture ===');
  
  // Test with device ID 80 (USB Camera)
  try {
    log('Capturing from microphone device 80...');
    const result = await runCommand('python3', [
      'python_wrappers/microphone_cli.py',
      'get_level',
      '80',
      '16000',
      '1',
      '1.0'
    ]);
    
    if (result.code === 0) {
      const output = JSON.parse(result.stdout);
      if (output.status === 'success') {
        pass(`Microphone capture - Level: ${(output.level * 100).toFixed(1)}%`);
        log(`   Device: ${output.deviceId}, Sample Rate: ${output.sampleRate}Hz`);
      } else {
        fail('Microphone capture', output.message);
      }
    } else {
      fail('Microphone capture', result.stderr);
    }
  } catch (error) {
    fail('Microphone capture', error.message);
  }
}

async function testAudioLevelsAPI() {
  log('\n=== Testing Audio Levels API ===');
  
  try {
    const inputLevel = await httpGet('/setup/audio/api/audio-levels?deviceId=80&deviceType=input');
    if (inputLevel.data.success && typeof inputLevel.data.level === 'number') {
      pass(`Input level API - Level: ${(inputLevel.data.level * 100).toFixed(1)}%`);
    } else {
      fail('Input level API', 'Invalid response');
    }
  } catch (error) {
    fail('Input level API', error.message);
  }
  
  try {
    const outputLevel = await httpGet('/setup/audio/api/audio-levels?deviceId=81&deviceType=output');
    if (outputLevel.data.success) {
      pass('Output level API');
    } else {
      fail('Output level API', 'Invalid response');
    }
  } catch (error) {
    fail('Output level API', error.message);
  }
}

async function testEndToEndSTT() {
  log('\n=== Testing End-to-End STT ===');
  
  try {
    // Play audio through speaker
    log('Step 1: Playing test audio...');
    const playResult = await runCommand('python3', [
      'python_wrappers/speaker_cli.py',
      'play',
      'public/sounds/monster-howl-85304.mp3',
      '80',
      '--device',
      '81'
    ]);
    
    if (playResult.code !== 0) {
      fail('STT - Audio playback', playResult.stderr);
      return;
    }
    
    pass('STT - Audio playback started');
    
    // Wait a bit for audio to play
    await new Promise(resolve => setTimeout(resolve, 1000));
    
    // Capture from microphone
    log('Step 2: Capturing from microphone...');
    const captureResult = await runCommand('python3', [
      'python_wrappers/microphone_cli.py',
      'get_level',
      '80',
      '16000',
      '1',
      '2.0'
    ]);
    
    if (captureResult.code === 0) {
      const output = JSON.parse(captureResult.stdout);
      if (output.level > 0.1) {
        pass(`STT - Microphone captured audio (${(output.level * 100).toFixed(1)}%)`);
      } else {
        fail('STT - Microphone capture', `Level too low: ${(output.level * 100).toFixed(1)}%`);
      }
    } else {
      fail('STT - Microphone capture', captureResult.stderr);
    }
    
    log('Note: Full STT transcription test requires ElevenLabs API key');
    
  } catch (error) {
    fail('End-to-end STT', error.message);
  }
}

async function runAllTests() {
  log('🎵 MonsterBox Audio System Comprehensive Test');
  log('='.repeat(60));
  
  await testServerHealth();
  await testAudioDeviceEnumeration();
  await testSpeakerPlayback();
  await testMicrophoneCapture();
  await testAudioLevelsAPI();
  await testEndToEndSTT();
  
  log('\n' + '='.repeat(60));
  log(`📊 Test Results: ${testsPassed} passed, ${testsFailed} failed`);
  
  if (testsFailed === 0) {
    log('✅ All tests passed!');
    process.exit(0);
  } else {
    log('❌ Some tests failed');
    process.exit(1);
  }
}

runAllTests().catch(error => {
  log(`Fatal error: ${error.message}`);
  process.exit(1);
});

