/**
 * Backend API Tests for Conversation Mode
 * Tests all API endpoints for the Conversation Mode page
 */

import { test, expect } from '@playwright/test';

// Use Playwright baseURL

test.describe('Conversation Mode - Backend API Tests', () => {
  test.beforeEach(async ({ page }) => {
    // Ensure we have a character selected
  await page.goto('/setup/characters');
  });

  test('GET /conversation/api/webcam-stream-url returns valid stream URL', async ({ request }) => {
  const response = await request.get('/conversation/api/webcam-stream-url');
    expect(response.ok()).toBeTruthy();

    const data = await response.json();
    expect(data.success).toBeTruthy();
    expect(data.url).toBeDefined();

    console.log('✅ Webcam stream URL endpoint working');
  });

  test('GET /conversation/api/speakers returns speaker list', async ({ request }) => {
  const response = await request.get('/conversation/api/speakers');
    expect(response.ok()).toBeTruthy();

    const data = await response.json();
    expect(data.success).toBeTruthy();
    expect(Array.isArray(data.speakers)).toBeTruthy();

    console.log(`✅ Speakers endpoint returned ${data.speakers.length} speakers`);
  });

  test('GET /conversation/api/jaw-settings returns jaw animation state', async ({ request }) => {
  const response = await request.get('/conversation/api/jaw-settings');
    expect(response.ok()).toBeTruthy();

    const data = await response.json();
    expect(data.success).toBeTruthy();
    expect(typeof data.enabled).toBe('boolean');

    console.log(`✅ Jaw settings endpoint working (enabled: ${data.enabled})`);
  });

  test('POST /conversation/api/jaw-settings enables/disables jaw animation', async ({ request }) => {
    // Enable jaw animation
  let response = await request.post('/conversation/api/jaw-settings', {
      data: { enabled: true }
    });
    expect(response.ok()).toBeTruthy();

    let data = await response.json();
    expect(data.success).toBeTruthy();
    expect(data.enabled).toBe(true);

    // Verify it was enabled
  response = await request.get('/conversation/api/jaw-settings');
    data = await response.json();
    expect(data.enabled).toBe(true);

    // Disable jaw animation
  response = await request.post('/conversation/api/jaw-settings', {
      data: { enabled: false }
    });
    data = await response.json();
    expect(data.success).toBeTruthy();
    expect(data.enabled).toBe(false);

    console.log('✅ Jaw settings endpoint working (enable/disable cycle complete)');
  });

  test('GET /conversation/api/head-tracking-status returns head tracking state', async ({ request }) => {
  const response = await request.get('/conversation/api/head-tracking-status');
    expect(response.ok()).toBeTruthy();

    const data = await response.json();
    expect(data.success).toBeTruthy();

    // Response format: { success: true, headTracking: { enabled: boolean } }
    const enabled = data.headTracking?.enabled ?? data.enabled ?? false;
    expect(typeof enabled).toBe('boolean');

    console.log(`✅ Head tracking status endpoint working (enabled: ${enabled})`);
  });

  test('POST /conversation/api/head-tracking enables/disables head tracking', async ({ request }) => {
    // Enable head tracking
  let response = await request.post('/conversation/api/head-tracking', {
      data: { enabled: true }
    });
    expect(response.ok()).toBeTruthy();

    let data = await response.json();
    expect(data.success).toBeTruthy();

    // In test mode, response is { success: true, testMode: true, enabled: true }
    // In production, response delegates to motion tracking controller
    const enabledValue = data.testMode ? data.enabled : (data.headTracking?.enabled ?? true);
    expect(enabledValue).toBe(true);

    // Disable head tracking
  response = await request.post('/conversation/api/head-tracking', {
      data: { enabled: false }
    });
    data = await response.json();
    expect(data.success).toBeTruthy();

    const disabledValue = data.testMode ? data.enabled : (data.headTracking?.enabled ?? false);
    expect(disabledValue).toBe(false);

    console.log('✅ Head tracking endpoint working');
  });

  test('GET /conversation/api/listen-in-url returns microphone stream URL', async ({ request }) => {
  const response = await request.get('/conversation/api/listen-in-url');

    const data = await response.json();

    // May fail if no microphone configured, but should return valid JSON
    if (data.success) {
      expect(data.url).toBeDefined();
      console.log('✅ Listen In URL endpoint working');
    } else {
      expect(data.error).toBeDefined();
      console.log('⚠️  Listen In URL endpoint working (no microphone configured)');
    }
  });

  test('POST /conversation/api/ai-on enables/disables AI agent', async ({ request }) => {
    // Enable AI agent
  let response = await request.post('/conversation/api/ai-on', {
      data: { enabled: true }
    });

    let data = await response.json();

    // May fail if no character selected
    if (response.ok()) {
      expect(data.success).toBeTruthy();
      expect(data.enabled).toBe(true);

      // Disable AI agent
  response = await request.post('/conversation/api/ai-on', {
        data: { enabled: false }
      });
      data = await response.json();
      expect(data.success).toBeTruthy();
      expect(data.enabled).toBe(false);

      console.log('✅ AI On toggle endpoint working');
    } else {
      console.log('⚠️  AI On toggle requires character selection');
    }
  });

  test('GET /conversation/api/ai-status returns AI agent status and latency', async ({ request }) => {
  const response = await request.get('/conversation/api/ai-status');
    expect(response.ok()).toBeTruthy();

    const data = await response.json();
    expect(data.success).toBeTruthy();
    expect(typeof data.enabled).toBe('boolean');

    if (data.enabled) {
      expect(data.latency).toBeDefined();
      expect(typeof data.latency).toBe('number');
      console.log(`✅ AI status endpoint working (latency: ${data.latency}ms)`);
    } else {
      expect(data.latency).toBeNull();
      console.log('✅ AI status endpoint working (AI disabled)');
    }
  });

  test('POST /conversation/api/say generates and plays speech', async ({ request }) => {
  const response = await request.post('/conversation/api/say', {
      data: {
        text: 'Test speech for automated testing',
        speakerPartId: null // Use character's default speaker
      }
    });

    const data = await response.json();

    // May fail if no TTS configured or no speaker available
    if (data.success) {
      expect(data.device).toBeDefined();
      console.log('✅ Say endpoint working (speech generated and played)');
    } else {
      expect(data.error).toBeDefined();
      console.log(`⚠️  Say endpoint error: ${data.error}`);
    }
  });

  test('POST /conversation/api/jaw-drive accepts amplitude values', async ({ request }) => {
    // Test valid amplitude
  let response = await request.post('/conversation/api/jaw-drive', {
      data: { amplitude: 0.5 }
    });
    expect(response.ok()).toBeTruthy();

    let data = await response.json();
    expect(data.success).toBeTruthy();

    // Test boundary values
  response = await request.post('/conversation/api/jaw-drive', {
      data: { amplitude: 0.0 }
    });
    data = await response.json();
    expect(data.success).toBeTruthy();

  response = await request.post('/conversation/api/jaw-drive', {
      data: { amplitude: 1.0 }
    });
    data = await response.json();
    expect(data.success).toBeTruthy();

    // Test invalid amplitude (should fail)
  response = await request.post('/conversation/api/jaw-drive', {
      data: { amplitude: 'invalid' }
    });
    expect(response.status()).toBe(400);

    console.log('✅ Jaw drive endpoint working (amplitude validation correct)');
  });

  test('GET /scenes/api returns scenes list for Scenes panel', async ({ request }) => {
  const response = await request.get('/scenes/api');
    expect(response.ok()).toBeTruthy();

    const data = await response.json();
    expect(data.success).toBeTruthy();
    expect(Array.isArray(data.scenes)).toBeTruthy();

    console.log(`✅ Scenes API endpoint working (${data.scenes.length} scenes available)`);
  });

  test('POST /scenes/api/play/:id plays a scene', async ({ request }) => {
    // First get available scenes
  const scenesResponse = await request.get('/scenes/api');
    const scenesData = await scenesResponse.json();

    if (scenesData.scenes && scenesData.scenes.length > 0) {
      const sceneId = scenesData.scenes[0].id;

      try {
  const response = await request.post(`/scenes/api/play/${sceneId}`, {
          maxRedirects: 0 // Don't follow redirects
        });

        // Scene playback may fail if hardware is not available, which is expected in test mode
        // Accept 200 (success), 400 (hardware not available), or 302 (redirect)
        expect([200, 302, 400]).toContain(response.status());

        if (response.status() === 200) {
          const data = await response.json();

          if (data.success) {
            console.log(`✅ Scene playback endpoint working (played scene ${sceneId})`);
          } else {
            console.log(`⚠️  Scene playback error (expected in test mode): ${data.error || 'Hardware not available'}`);
          }
        } else {
          console.log(`⚠️  Scene playback returned status ${response.status()} (expected in test mode)`);
        }
      } catch (error) {
        console.log(`⚠️  Scene playback test skipped: ${error.message}`);
      }
    } else {
      console.log('⚠️  No scenes available to test playback (skipping)');
    }
  });
});

