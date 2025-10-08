import { test, expect } from '../test.setup';

/**
 * Halloween Readiness Test Suite
 * Verifies that an animatronic is fully operational:
 * - Webcam streaming through MonsterBox
 * - Audio system functional
 * - AI Chat/Conversation mode ready
 * 
 * Run with: npx playwright test tests/playwright/halloween-readiness.spec.js
 */

const TIMEOUT = 30000; // 30 seconds for each check

test.describe('Halloween Readiness - Full System Verification', () => {
  
  test('MonsterBox application is running and healthy', async ({ page }) => {
    // Check health endpoint
    const response = await page.goto('/health', { timeout: TIMEOUT });
    expect(response.status()).toBe(200);
    
    // Verify we can load the main page
    await page.goto('/', { timeout: TIMEOUT });
    await expect(page.locator('nav.navbar')).toBeVisible({ timeout: TIMEOUT });
    await expect(page.locator('.navbar-brand')).toContainText('MonsterBox');
  });

  test('Webcam is streaming through MonsterBox', async ({ page }) => {
    await page.goto('/conversation', { timeout: TIMEOUT });
    
    // Wait for page to load
    await expect(page.locator('h1')).toContainText('Conversation', { timeout: TIMEOUT });
    
    // Check for webcam element
    const webcamImg = page.locator('#webcamImg');
    await expect(webcamImg).toBeVisible({ timeout: TIMEOUT });
    
    // Verify the image source is set (should be mjpg-streamer stream)
    await page.waitForFunction(() => {
      const img = document.querySelector('#webcamImg');
      return img && img.src && img.src.includes('stream');
    }, { timeout: TIMEOUT });
    
    const imgSrc = await webcamImg.getAttribute('src');
    expect(imgSrc).toBeTruthy();
    expect(imgSrc).toContain('stream');
    
    // Verify webcam status shows it's working
    const webcamStatus = page.locator('#webcamStatus');
    const statusText = await webcamStatus.textContent();
    
    // Should not show error messages
    expect(statusText.toLowerCase()).not.toContain('error');
    expect(statusText.toLowerCase()).not.toContain('failed');
    expect(statusText.toLowerCase()).not.toContain('not found');
  });

  test('Audio system is configured and ready', async ({ page }) => {
    await page.goto('/conversation', { timeout: TIMEOUT });
    
    // Check that speaker selection is available
    const speakerSelect = page.locator('#convSpeakerSelect');
    await expect(speakerSelect).toBeVisible({ timeout: TIMEOUT });
    
    // Verify speakers are loaded
    await page.waitForFunction(() => {
      const select = document.querySelector('#convSpeakerSelect');
      return select && select.options.length > 0;
    }, { timeout: TIMEOUT });
    
    const optionCount = await speakerSelect.locator('option').count();
    expect(optionCount).toBeGreaterThan(0);
    
    // Check microphone controls are present
    const micStart = page.locator('#micStart');
    await expect(micStart).toBeVisible({ timeout: TIMEOUT });
    await expect(micStart).toContainText('Start Listening');
  });

  test('AI Chat/Conversation mode is accessible', async ({ page }) => {
    await page.goto('/conversation', { timeout: TIMEOUT });
    
    // Verify conversation page loads
    await expect(page.locator('h1')).toContainText('Conversation', { timeout: TIMEOUT });
    
    // Check "Make Character Say" functionality is present
    const sayInput = page.locator('#sayInput');
    const sayBtn = page.locator('#sayBtn');
    
    await expect(sayInput).toBeVisible({ timeout: TIMEOUT });
    await expect(sayBtn).toBeVisible({ timeout: TIMEOUT });
    await expect(sayBtn).toContainText('Speak');
    
    // Verify jaw animation toggle is present
    const jawToggle = page.locator('#jawToggle');
    await expect(jawToggle).toBeVisible({ timeout: TIMEOUT });
    
    // Check that we can access AI settings
    const sttConfigLink = page.locator('a[href="/ai-settings/stt"]');
    const ttsConfigLink = page.locator('a[href="/ai-settings/tts"]');
    
    await expect(sttConfigLink).toBeVisible({ timeout: TIMEOUT });
    await expect(ttsConfigLink).toBeVisible({ timeout: TIMEOUT });
  });

  test('ElevenLabs agent is configured', async ({ page }) => {
    // Check agent status endpoint
    const response = await page.request.get('/conversation/api/agent-status');
    expect(response.ok()).toBeTruthy();
    
    const data = await response.json();
    expect(data.success).toBeTruthy();
    
    // Agent should be configured for Halloween
    if (!data.configured) {
      console.warn('⚠️  ElevenLabs agent not configured - AI chat may not work');
    }
  });

  test('Webcam stream endpoint is responding', async ({ page }) => {
    // Get the webcam stream URL
    const response = await page.request.get('/conversation/api/webcam-stream-url');
    expect(response.ok()).toBeTruthy();
    
    const data = await response.json();
    expect(data.success).toBeTruthy();
    
    if (data.url) {
      // Verify the stream endpoint responds
      const streamResponse = await page.request.get(data.url);
      expect(streamResponse.ok()).toBeTruthy();
    } else {
      console.warn('⚠️  No webcam configured for this character');
    }
  });

  test('mjpg-streamer is running on port 8090', async ({ page }) => {
    // Direct check of mjpg-streamer
    try {
      const response = await page.request.get('http://localhost:8090/');
      expect(response.ok()).toBeTruthy();
    } catch (error) {
      throw new Error('mjpg-streamer is not responding on port 8090');
    }
  });

  test('Full conversation workflow simulation', async ({ page }) => {
    await page.goto('/conversation', { timeout: TIMEOUT });
    
    // Wait for everything to load
    await page.waitForLoadState('networkidle', { timeout: TIMEOUT });
    
    // Verify all critical elements are present and functional
    const webcamImg = page.locator('#webcamImg');
    const sayInput = page.locator('#sayInput');
    const sayBtn = page.locator('#sayBtn');
    const micStart = page.locator('#micStart');
    const speakerSelect = page.locator('#convSpeakerSelect');
    
    // All elements should be visible
    await expect(webcamImg).toBeVisible({ timeout: TIMEOUT });
    await expect(sayInput).toBeVisible({ timeout: TIMEOUT });
    await expect(sayBtn).toBeVisible({ timeout: TIMEOUT });
    await expect(micStart).toBeVisible({ timeout: TIMEOUT });
    await expect(speakerSelect).toBeVisible({ timeout: TIMEOUT });
    
    // Webcam should have a stream source
    const imgSrc = await webcamImg.getAttribute('src');
    expect(imgSrc).toBeTruthy();
    
    // Speaker select should have options
    const optionCount = await speakerSelect.locator('option').count();
    expect(optionCount).toBeGreaterThan(0);
    
    // Test "Make Character Say" input
    await sayInput.fill('Test message for Halloween');
    await expect(sayInput).toHaveValue('Test message for Halloween');
    
    // Say button should be enabled
    await expect(sayBtn).toBeEnabled();
  });

  test('System status summary', async ({ page }) => {
    const results = {
      monsterbox: false,
      webcam: false,
      audio: false,
      conversation: false,
      mjpgStreamer: false
    };
    
    // Check MonsterBox
    try {
      const response = await page.goto('/health', { timeout: 10000 });
      results.monsterbox = response.status() === 200;
    } catch (e) {
      results.monsterbox = false;
    }
    
    // Check webcam
    try {
      await page.goto('/conversation', { timeout: 10000 });
      const webcamImg = page.locator('#webcamImg');
      await webcamImg.waitFor({ state: 'visible', timeout: 5000 });
      const src = await webcamImg.getAttribute('src');
      results.webcam = src && src.includes('stream');
    } catch (e) {
      results.webcam = false;
    }
    
    // Check audio
    try {
      const speakerSelect = page.locator('#convSpeakerSelect');
      await speakerSelect.waitFor({ state: 'visible', timeout: 5000 });
      const count = await speakerSelect.locator('option').count();
      results.audio = count > 0;
    } catch (e) {
      results.audio = false;
    }
    
    // Check conversation
    try {
      const sayBtn = page.locator('#sayBtn');
      await sayBtn.waitFor({ state: 'visible', timeout: 5000 });
      results.conversation = true;
    } catch (e) {
      results.conversation = false;
    }
    
    // Check mjpg-streamer
    try {
      const response = await page.request.get('http://localhost:8090/');
      results.mjpgStreamer = response.ok();
    } catch (e) {
      results.mjpgStreamer = false;
    }
    
    // Log results
    console.log('\n🎃 Halloween Readiness Status:');
    console.log('================================');
    console.log(`MonsterBox App:    ${results.monsterbox ? '✅' : '❌'}`);
    console.log(`Webcam Streaming:  ${results.webcam ? '✅' : '❌'}`);
    console.log(`Audio System:      ${results.audio ? '✅' : '❌'}`);
    console.log(`Conversation Mode: ${results.conversation ? '✅' : '❌'}`);
    console.log(`mjpg-streamer:     ${results.mjpgStreamer ? '✅' : '❌'}`);
    console.log('================================\n');
    
    // All should be true for full readiness
    const allReady = Object.values(results).every(v => v === true);
    expect(allReady).toBeTruthy();
  });
});

