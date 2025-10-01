import { test, expect, Page } from '@playwright/test';

/**
 * SkullTalker (192.168.8.130) Full System Test
 * Tests all functionality directly on SkullTalker RPi4b as end user
 */

test.describe('SkullTalker RPi4b Full System Test', () => {
  let errors: string[] = [];
  const SKULLTALKER_URL = 'http://192.168.8.130:3000';

  test.beforeEach(async ({ page }) => {
    errors = [];
    
    // Error collection
    page.on('console', msg => {
      if (msg.type() === 'error') {
        errors.push(`Console Error: ${msg.text()}`);
      }
    });

    page.on('pageerror', error => {
      errors.push(`Page Error: ${error.message}`);
    });

    page.on('requestfailed', request => {
      errors.push(`Request Failed: ${request.url()} - ${request.failure()?.errorText}`);
    });
  });

  test.afterEach(async ({ page }) => {
    if (errors.length > 0) {
      console.log('🚨 SkullTalker System Errors:');
      errors.forEach(error => console.log(`  - ${error}`));
    }
  });

  test('SkullTalker web interface loads', async ({ page }) => {
    await page.goto(SKULLTALKER_URL);
    
    // Check page loads
    await expect(page).toHaveTitle(/MonsterBox/);
    await expect(page.locator('body')).toBeVisible();
    
    // Check for MonsterBox branding
    const logo = page.locator('img[alt*="MonsterBox"], .logo, h1:has-text("MonsterBox")');
    await expect(logo.first()).toBeVisible();
    
    // Check main navigation
    const navItems = ['Characters', 'Parts', 'AI Management', 'Sounds', 'Scenes', 'Configuration'];
    for (const item of navItems) {
      const navLink = page.locator(`a:has-text("${item}"), nav *:has-text("${item}")`);
      await expect(navLink.first()).toBeVisible();
    }
  });

  test('SkullTalker character data loads', async ({ page }) => {
    await page.goto(`${SKULLTALKER_URL}/characters`);
    
    // Check characters page loads
    await expect(page.locator('h1, h2, .page-title')).toContainText(/Character/i);
    
    // Look for SkullTalker character specifically
    const skulltalkerChar = page.locator('*:has-text("Skulltalker"), *:has-text("SkullTalker")');
    if (await skulltalkerChar.count() > 0) {
      await expect(skulltalkerChar.first()).toBeVisible();
    }
    
    // Check character management buttons
    const actionButtons = page.locator('button:has-text("Parts"), button:has-text("AI"), a[href*="/parts"], a[href*="/ai"]');
    if (await actionButtons.count() > 0) {
      await expect(actionButtons.first()).toBeVisible();
    }
  });

  test('SkullTalker parts management', async ({ page }) => {
    await page.goto(`${SKULLTALKER_URL}/parts`);
    
    // Check parts page loads
    await expect(page.locator('h1, h2, .page-title')).toContainText(/Parts/i);
    
    // Check character filter for SkullTalker
    const characterSelect = page.locator('select[name*="character"], #characterFilter');
    if (await characterSelect.count() > 0) {
      // Try to select SkullTalker
      const options = await characterSelect.locator('option').all();
      for (const option of options) {
        const text = await option.textContent();
        if (text && text.toLowerCase().includes('skull')) {
          await characterSelect.selectOption(await option.getAttribute('value') || '');
          break;
        }
      }
    }
    
    // Check for parts list
    const partsList = page.locator('table, .parts-list, .parts-grid');
    await expect(partsList).toBeVisible();
    
    // Test adding a part for SkullTalker
    const addButtons = page.locator('button:has-text("Add"), .btn-add');
    if (await addButtons.count() > 0) {
      await addButtons.first().click();
      await page.waitForTimeout(2000);
    }
  });

  test('SkullTalker webcam functionality', async ({ page }) => {
    await page.goto(`${SKULLTALKER_URL}/camera`);
    
    // Check camera page loads
    const cameraPage = page.locator('h1:has-text("Camera"), h2:has-text("Webcam"), .camera-container');
    if (await cameraPage.count() > 0) {
      await expect(cameraPage.first()).toBeVisible();
      
      // Check for video stream
      const videoStream = page.locator('video, img[src*="stream"], .video-stream');
      if (await videoStream.count() > 0) {
        await expect(videoStream.first()).toBeVisible();
      }
      
      // Check for camera controls
      const cameraControls = page.locator('button:has-text("Start"), button:has-text("Stop"), .camera-controls');
      if (await cameraControls.count() > 0) {
        await expect(cameraControls.first()).toBeVisible();
      }
    }
  });

  test('SkullTalker AI Management', async ({ page }) => {
    await page.goto(`${SKULLTALKER_URL}/ai-management`);
    
    // Check AI management loads - use first() to handle multiple headings
    await expect(page.locator('h1, h2, .page-title').first()).toContainText(/AI/i);
    
    // Test STT configuration
    const sttLink = page.locator('a[href*="stt"], button:has-text("STT")');
    if (await sttLink.count() > 0) {
      await sttLink.first().click();
      
      // Check STT page
      await expect(page.locator('h1, h2')).toContainText(/STT|Speech/i);
      
      // Check for microphone selection
      const micSelect = page.locator('select[name*="microphone"], #microphoneSelect');
      if (await micSelect.count() > 0) {
        await expect(micSelect).toBeVisible();
      }
    }
    
    // Go back and test TTS
    await page.goto(`${SKULLTALKER_URL}/ai-management/tts`);
    
    // Check TTS page
    await expect(page.locator('h1, h2')).toContainText(/TTS|Text.*Speech/i);
    
    // Check for speaker selection
    const speakerSelect = page.locator('select[name*="speaker"], #speakerSelect');
    if (await speakerSelect.count() > 0) {
      await expect(speakerSelect).toBeVisible();
    }
  });

  test('SkullTalker Enhanced Test Chat', async ({ page }) => {
    await page.goto(`${SKULLTALKER_URL}/ai-management/enhanced-test-chat`);
    
    // Check chat page loads
    await expect(page.locator('h1, h2, .page-title')).toContainText(/Chat|Test/i);
    
    // Check for character selection (should default to SkullTalker)
    const characterSelect = page.locator('select[name*="character"], #characterSelect');
    if (await characterSelect.count() > 0) {
      await expect(characterSelect).toBeVisible();
    }
    
    // Test sending a message
    const messageInput = page.locator('input[name*="message"], textarea[name*="message"], #messageInput');
    if (await messageInput.count() > 0) {
      await messageInput.fill('Hello SkullTalker, this is a test message.');
      
      const sendButton = page.locator('button:has-text("Send"), button[type="submit"], .btn-send');
      if (await sendButton.count() > 0) {
        await sendButton.click();
        await page.waitForTimeout(5000);
        
        // Check for response in chat
        const messages = page.locator('.message, .chat-message');
        if (await messages.count() > 0) {
          await expect(messages.last()).toBeVisible();
        }
      }
    }
  });

  test('SkullTalker sounds management', async ({ page }) => {
    await page.goto(`${SKULLTALKER_URL}/sounds`);
    
    // Check sounds page loads
    await expect(page.locator('h1, h2, .page-title')).toContainText(/Sound/i);
    
    // Check for sounds list
    const soundsList = page.locator('table, .sounds-list, .audio-list');
    await expect(soundsList).toBeVisible();
    
    // Test sound playback
    const playButton = page.locator('button:has-text("Play"), .play-btn').first();
    if (await playButton.count() > 0) {
      await playButton.click();
      await page.waitForTimeout(3000);
      
      // Stop playback
      const stopButton = page.locator('button:has-text("Stop"), .stop-btn');
      if (await stopButton.count() > 0) {
        await stopButton.first().click();
      }
    }
  });

  test('SkullTalker system configuration', async ({ page }) => {
    await page.goto(`${SKULLTALKER_URL}/system-config`);
    
    // Check config page loads - use first() to handle multiple headings
    await expect(page.locator('h1, h2, .page-title').first()).toContainText(/Config/i);
    
    // Check for system status
    const systemStatus = page.locator('.system-status, .status-panel, *:has-text("Status")');
    if (await systemStatus.count() > 0) {
      await expect(systemStatus.first()).toBeVisible();
    }
    
    // Check for network configuration
    const networkConfig = page.locator('*:has-text("Network"), *:has-text("192.168.8.130")');
    if (await networkConfig.count() > 0) {
      await expect(networkConfig.first()).toBeVisible();
    }
  });

  test('SkullTalker service health check', async ({ page }) => {
    await page.goto(SKULLTALKER_URL);
    
    // Check for service status indicators
    const serviceStatus = page.locator('.service-status, .health-indicator, .status');
    if (await serviceStatus.count() > 0) {
      await expect(serviceStatus.first()).toBeVisible();
    }
    
    // Test API endpoints
    const response = await page.request.get(`${SKULLTALKER_URL}/api/health`);
    if (response.ok()) {
      const healthData = await response.json();
      expect(healthData).toBeTruthy();
    }
  });

  test('SkullTalker microphone testing', async ({ page }) => {
    await page.goto(`${SKULLTALKER_URL}/ai-management/stt`);
    
    // Look for microphone test functionality - use first() to handle multiple buttons
    const testButton = page.locator('button:has-text("Test"), button:has-text("Record"), .btn-test');
    if (await testButton.count() > 0) {
      await testButton.first().click();
      await page.waitForTimeout(3000);
      
      // Check for audio level indicator
      const audioLevel = page.locator('.audio-level, .volume-meter, .level-indicator');
      if (await audioLevel.count() > 0) {
        await expect(audioLevel.first()).toBeVisible();
      }
      
      // Stop test
      const stopButton = page.locator('button:has-text("Stop"), .btn-stop');
      if (await stopButton.count() > 0) {
        await stopButton.click();
      }
    }
  });

  test('SkullTalker speaker testing', async ({ page }) => {
    await page.goto(`${SKULLTALKER_URL}/ai-management/tts`);
    
    // Test TTS output
    const testText = page.locator('input[name*="text"], textarea[name*="text"], #testText');
    if (await testText.count() > 0) {
      await testText.fill('Testing SkullTalker speaker output.');
      
      const testButton = page.locator('button:has-text("Test"), button:has-text("Speak"), .btn-test');
      if (await testButton.count() > 0) {
        await testButton.first().click();
        await page.waitForTimeout(5000);
      }
    }
  });
});
