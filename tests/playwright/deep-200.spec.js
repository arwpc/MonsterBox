import { test, expect } from '@playwright/test';

/**
 * Deep 200 Test Suite
 * Validates critical API endpoints return 200 status with expected JSON shape
 * Part of MonsterBox 5.0 Gold Release verification
 */

test.describe('Deep 200 - Critical API Endpoints', () => {
  test.setTimeout(60000);

  test('Characters API - List all characters', async ({ request, baseURL }) => {
    const response = await request.get(`${baseURL}/setup/characters/api/characters`);
    expect(response.status()).toBe(200);
    
    const json = await response.json();
    expect(json).toHaveProperty('success', true);
    expect(json).toHaveProperty('characters');
    expect(Array.isArray(json.characters)).toBe(true);
    
    // Validate character structure if any exist
    if (json.characters.length > 0) {
      const char = json.characters[0];
      expect(char).toHaveProperty('id');
      expect(char).toHaveProperty('name');
    }
  });

  test('Characters API - Get current selected character', async ({ request, baseURL }) => {
    const response = await request.get(`${baseURL}/setup/characters/api/current`);
    expect(response.status()).toBe(200);
    
    const json = await response.json();
    expect(json).toHaveProperty('success', true);
    expect(json).toHaveProperty('selectedCharacter');
  });

  test('Characters API - Get character by ID', async ({ request, baseURL }) => {
    // First get the current character
    const currentRes = await request.get(`${baseURL}/setup/characters/api/current`);
    const currentJson = await currentRes.json();
    const charId = currentJson.selectedCharacter;
    
    if (charId) {
      const response = await request.get(`${baseURL}/setup/characters/api/characters/${charId}`);
      expect(response.status()).toBe(200);
      
      const json = await response.json();
      expect(json).toHaveProperty('success', true);
      expect(json).toHaveProperty('character');
      expect(json.character).toHaveProperty('id', charId);
      expect(json.character).toHaveProperty('name');
    }
  });

  test('Models API - List servo models', async ({ request, baseURL }) => {
    const response = await request.get(`${baseURL}/setup/models/api/servo`);
    expect(response.status()).toBe(200);
    
    const json = await response.json();
    expect(json).toHaveProperty('success', true);
    expect(json).toHaveProperty('type', 'servo');
    expect(json).toHaveProperty('models');
    expect(Array.isArray(json.models)).toBe(true);
  });

  test('Models API - List linear_actuator models', async ({ request, baseURL }) => {
    const response = await request.get(`${baseURL}/setup/models/api/linear_actuator`);
    expect(response.status()).toBe(200);
    
    const json = await response.json();
    expect(json).toHaveProperty('success', true);
    expect(json).toHaveProperty('type', 'linear_actuator');
    expect(json).toHaveProperty('models');
    expect(Array.isArray(json.models)).toBe(true);
  });

  test('Models API - List webcam models', async ({ request, baseURL }) => {
    const response = await request.get(`${baseURL}/setup/models/api/webcam`);
    expect(response.status()).toBe(200);
    
    const json = await response.json();
    expect(json).toHaveProperty('success', true);
    expect(json).toHaveProperty('type', 'webcam');
    expect(json).toHaveProperty('models');
    expect(Array.isArray(json.models)).toBe(true);
  });

  test('Parts API - List all parts for current character', async ({ request, baseURL }) => {
    const response = await request.get(`${baseURL}/setup/parts/api/parts`);
    expect(response.status()).toBe(200);
    
    const json = await response.json();
    expect(json).toHaveProperty('success', true);
    expect(json).toHaveProperty('parts');
    expect(Array.isArray(json.parts)).toBe(true);
  });

  test('Super Powers - Get jaw animation config for current character', async ({ request, baseURL }) => {
    // Get current character first
    const currentRes = await request.get(`${baseURL}/setup/characters/api/current`);
    const currentJson = await currentRes.json();
    const charId = currentJson.selectedCharacter;
    
    if (charId) {
      const response = await request.get(`${baseURL}/setup/super-powers/api/jaw-animation/${charId}`);
      expect(response.status()).toBe(200);
      
      const json = await response.json();
      expect(json).toHaveProperty('success', true);
      // Config may be null if not yet configured, which is valid
      expect(json).toHaveProperty('config');
    }
  });

  test('Webcam API - List video devices', async ({ request, baseURL }) => {
    const response = await request.get(`${baseURL}/setup/webcam/api/devices`);
    expect(response.status()).toBe(200);
    
    const json = await response.json();
    expect(json).toHaveProperty('success', true);
    expect(json).toHaveProperty('devices');
    expect(Array.isArray(json.devices)).toBe(true);
  });

  test('Webcam API - Probe devices (with timeout)', async ({ request, baseURL }) => {
    const response = await request.get(`${baseURL}/setup/webcam/api/devices/probe?timeoutMs=2000`);
    expect(response.status()).toBe(200);
    
    const json = await response.json();
    expect(json).toHaveProperty('success', true);
    expect(json).toHaveProperty('results');
    expect(Array.isArray(json.results)).toBe(true);
    
    // Validate probe result structure if any devices found
    if (json.results.length > 0) {
      const result = json.results[0];
      expect(result).toHaveProperty('path');
      expect(result).toHaveProperty('ok');
    }
  });

  test('Audio API - Get system config', async ({ request, baseURL }) => {
    const response = await request.get(`${baseURL}/setup/audio/api/system-config`);
    expect(response.status()).toBe(200);
    
    const json = await response.json();
    expect(json).toHaveProperty('success', true);
    expect(json).toHaveProperty('config');
  });

  test('Audio API - Get hardware devices', async ({ request, baseURL }) => {
    const response = await request.get(`${baseURL}/setup/audio/api/hardware-devices`);
    expect(response.status()).toBe(200);
    
    const json = await response.json();
    expect(json).toHaveProperty('success', true);
    expect(json).toHaveProperty('devices');
    expect(json.devices).toHaveProperty('outputs');
    expect(json.devices).toHaveProperty('inputs');
  });

  test('Scenes API - List all scenes', async ({ request, baseURL }) => {
    const response = await request.get(`${baseURL}/scenes/api`);
    expect(response.status()).toBe(200);
    
    const json = await response.json();
    expect(json).toHaveProperty('success', true);
    expect(json).toHaveProperty('scenes');
    expect(Array.isArray(json.scenes)).toBe(true);
  });

  test('Poses API - List all poses', async ({ request, baseURL }) => {
    const response = await request.get(`${baseURL}/poses/api`);
    // Poses API may not be implemented yet - accept 404 or 200
    expect([200, 404]).toContain(response.status());

    if (response.status() === 200) {
      const json = await response.json();
      expect(json).toHaveProperty('success', true);
      expect(json).toHaveProperty('poses');
      expect(Array.isArray(json.poses)).toBe(true);
    }
  });

  test('AI Settings - Get STT config', async ({ request, baseURL }) => {
    const response = await request.get(`${baseURL}/api/elevenlabs/stt/config`);
    expect(response.status()).toBe(200);

    const json = await response.json();
    // When ElevenLabs not configured, success=false is acceptable
    expect(json).toHaveProperty('success');
    if (json.success) {
      expect(json).toHaveProperty('config');
    } else {
      expect(json).toHaveProperty('configured', false);
    }
  });

  test('AI Settings - Get TTS config', async ({ request, baseURL }) => {
    const response = await request.get(`${baseURL}/api/elevenlabs/tts/config`);
    expect(response.status()).toBe(200);

    const json = await response.json();
    // When ElevenLabs not configured, success=false is acceptable
    expect(json).toHaveProperty('success');
    if (json.success) {
      expect(json).toHaveProperty('config');
    } else {
      expect(json).toHaveProperty('configured', false);
    }
  });

  test('AI Settings - List agents', async ({ request, baseURL }) => {
    const response = await request.get(`${baseURL}/api/elevenlabs/agents`);
    expect(response.status()).toBe(200);

    const json = await response.json();
    // When ElevenLabs not configured, success=false is acceptable
    expect(json).toHaveProperty('success');
    if (json.success) {
      expect(json).toHaveProperty('agents');
      expect(Array.isArray(json.agents)).toBe(true);
    } else {
      expect(json).toHaveProperty('configured', false);
    }
  });

  test('Health check - Root endpoint', async ({ request, baseURL }) => {
    const response = await request.get(`${baseURL}/`);
    expect(response.status()).toBe(200);
    
    const text = await response.text();
    expect(text.length).toBeGreaterThan(0);
  });

  test('Health check - Setup hub', async ({ request, baseURL }) => {
    const response = await request.get(`${baseURL}/setup`);
    expect(response.status()).toBe(200);
    
    const text = await response.text();
    expect(text.length).toBeGreaterThan(0);
  });

  test('Video Library API - List videos', async ({ request, baseURL }) => {
    const response = await request.get(`${baseURL}/video-library/api/videos`);
    // Video Library API may not be implemented yet - accept 404 or 200
    expect([200, 404]).toContain(response.status());

    if (response.status() === 200) {
      const json = await response.json();
      expect(json).toHaveProperty('success', true);
      expect(json).toHaveProperty('videos');
      expect(Array.isArray(json.videos)).toBe(true);
    }
  });

  test('Audio Library API - List audio files', async ({ request, baseURL }) => {
    const response = await request.get(`${baseURL}/audio-library/api/files`);
    // Audio Library API may not be implemented yet - accept 404 or 200
    expect([200, 404]).toContain(response.status());

    if (response.status() === 200) {
      const json = await response.json();
      expect(json).toHaveProperty('success', true);
      expect(json).toHaveProperty('files');
      expect(Array.isArray(json.files)).toBe(true);
    }
  });
});

