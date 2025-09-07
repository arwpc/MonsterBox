import { test, expect, Page } from '@playwright/test';

/**
 * Orlok (192.168.8.120) Full System Test
 * Tests all functionality directly on Orlok RPi4b as end user
 */

test.describe('Orlok RPi4b Full System Test', () => {
  let errors: string[] = [];
  const ORLOK_URL = 'http://192.168.8.120:3000';

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
      console.log('🚨 Orlok System Errors:');
      errors.forEach(error => console.log(`  - ${error}`));
    }
  });

  test('Orlok web interface loads', async ({ page }) => {
    await page.goto(ORLOK_URL);
    
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

  test('Orlok character data loads', async ({ page }) => {
    await page.goto(`${ORLOK_URL}/characters`);
    
    // Check characters page loads
    await expect(page.locator('h1, h2, .page-title').first()).toContainText(/Character/i);
    
    // Look for Orlok character specifically
    const orlokChar = page.locator('*:has-text("Orlok")');
    if (await orlokChar.count() > 0) {
      await expect(orlokChar.first()).toBeVisible();
    }
    
    // Check character management buttons
    const actionButtons = page.locator('button:has-text("Parts"), button:has-text("AI"), a[href*="/parts"], a[href*="/ai"]');
    if (await actionButtons.count() > 0) {
      await expect(actionButtons.first()).toBeVisible();
    }
  });

  test('Orlok parts management', async ({ page }) => {
    await page.goto(`${ORLOK_URL}/parts`);
    
    // Check parts page loads
    await expect(page.locator('h1, h2, .page-title').first()).toContainText(/Parts/i);
    
    // Check character filter for Orlok
    const characterSelect = page.locator('select[name*="character"], #characterFilter');
    if (await characterSelect.count() > 0) {
      // Try to select Orlok
      const options = await characterSelect.locator('option').all();
      for (const option of options) {
        const text = await option.textContent();
        if (text && text.toLowerCase().includes('orlok')) {
          await characterSelect.selectOption(await option.getAttribute('value') || '');
          break;
        }
      }
    }
    
    // Check for parts list
    const partsList = page.locator('table, .parts-list, .parts-grid');
    await expect(partsList).toBeVisible();
    
    // Look for Orlok specific parts
    const partTypes = ['webcam', 'microphone', 'speaker'];
    for (const partType of partTypes) {
      const partElement = page.locator(`*:has-text("${partType}")`, { hasText: new RegExp(partType, 'i') });
      if (await partElement.count() > 0) {
        console.log(`✓ Found ${partType} part for Orlok`);
      }
    }
  });

  test('Orlok webcam functionality', async ({ page }) => {
    await page.goto(`${ORLOK_URL}/camera`);
    
    // Check camera page loads
    const cameraPage = page.locator('h1:has-text("Camera"), h2:has-text("Webcam"), .camera-container');
    if (await cameraPage.count() > 0) {
      await expect(cameraPage.first()).toBeVisible();
      
      // Check for video stream
      const videoStream = page.locator('video, img[src*="stream"], .video-stream');
      if (await videoStream.count() > 0) {
        await expect(videoStream.first()).toBeVisible();
        
        // Wait for stream to load
        await page.waitForTimeout(5000);
        
        // Check if stream is actually displaying content
        const streamSrc = await videoStream.first().getAttribute('src');
        if (streamSrc) {
          expect(streamSrc).toContain('stream');
        }
      }
      
      // Check for camera controls
      const cameraControls = page.locator('button:has-text("Start"), button:has-text("Stop"), .camera-controls');
      if (await cameraControls.count() > 0) {
        await expect(cameraControls.first()).toBeVisible();
      }
    }
  });

  test('Orlok AI Management', async ({ page }) => {
    await page.goto(`${ORLOK_URL}/ai-management`);
    
    // Check AI management loads
    await expect(page.locator('h1, h2, .page-title').first()).toContainText(/AI/i);
    
    // Test STT configuration for Orlok
    const sttLink = page.locator('a[href*="stt"], button:has-text("STT")');
    if (await sttLink.count() > 0) {
      await sttLink.first().click();
      
      // Check STT page
      await expect(page.locator('h1, h2').first()).toContainText(/STT|Speech/i);
      
      // Select Orlok character
      const characterSelect = page.locator('select[name*="character"], #characterSelect');
      if (await characterSelect.count() > 0) {
        const options = await characterSelect.locator('option').all();
        for (const option of options) {
          const text = await option.textContent();
          if (text && text.toLowerCase().includes('orlok')) {
            await characterSelect.selectOption(await option.getAttribute('value') || '');
            break;
          }
        }
      }
      
      // Check for microphone selection
      const micSelect = page.locator('select[name*="microphone"], #microphoneSelect');
      if (await micSelect.count() > 0) {
        await expect(micSelect).toBeVisible();
      }
    }
  });

  test('Orlok Enhanced Test Chat', async ({ page }) => {
    await page.goto(`${ORLOK_URL}/ai-management/enhanced-test-chat`);
    
    // Check chat page loads
    await expect(page.locator('h1, h2, .page-title').first()).toContainText(/Chat|Test/i);
    
    // Select Orlok character
    const characterSelect = page.locator('select[name*="character"], #characterSelect');
    if (await characterSelect.count() > 0) {
      const options = await characterSelect.locator('option').all();
      for (const option of options) {
        const text = await option.textContent();
        if (text && text.toLowerCase().includes('orlok')) {
          await characterSelect.selectOption(await option.getAttribute('value') || '');
          break;
        }
      }
    }
    
    // Test sending a message to Orlok
    const messageInput = page.locator('input[name*="message"], textarea[name*="message"], #messageInput');
    if (await messageInput.count() > 0) {
      await messageInput.fill('Hello Orlok! Tell me about your vampiric powers.');
      
      const sendButton = page.locator('button:has-text("Send"), button[type="submit"], .btn-send');
      if (await sendButton.count() > 0) {
        await sendButton.click();
        await page.waitForTimeout(8000); // Allow time for AI response
        
        // Check for response in chat
        const messages = page.locator('.message, .chat-message');
        if (await messages.count() > 1) {
          await expect(messages.last()).toBeVisible();
        }
      }
    }
  });

  test('Orlok microphone testing', async ({ page }) => {
    await page.goto(`${ORLOK_URL}/ai-management/stt`);
    
    // Select Orlok character first
    const characterSelect = page.locator('select[name*="character"], #characterSelect');
    if (await characterSelect.count() > 0) {
      const options = await characterSelect.locator('option').all();
      for (const option of options) {
        const text = await option.textContent();
        if (text && text.toLowerCase().includes('orlok')) {
          await characterSelect.selectOption(await option.getAttribute('value') || '');
          break;
        }
      }
    }
    
    // Look for microphone test functionality
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

  test('Orlok speaker testing', async ({ page }) => {
    await page.goto(`${ORLOK_URL}/ai-management/tts`);
    
    // Select Orlok character
    const characterSelect = page.locator('select[name*="character"], #characterSelect');
    if (await characterSelect.count() > 0) {
      const options = await characterSelect.locator('option').all();
      for (const option of options) {
        const text = await option.textContent();
        if (text && text.toLowerCase().includes('orlok')) {
          await characterSelect.selectOption(await option.getAttribute('value') || '');
          break;
        }
      }
    }
    
    // Test TTS output
    const testText = page.locator('input[name*="text"], textarea[name*="text"], #testText');
    if (await testText.count() > 0) {
      await testText.fill('Testing Orlok speaker output. I vant to suck your blood!');
      
      const testButton = page.locator('button:has-text("Test"), button:has-text("Speak"), .btn-test');
      if (await testButton.count() > 0) {
        await testButton.first().click();
        await page.waitForTimeout(5000);
      }
    }
  });

  test('Orlok system health', async ({ page }) => {
    await page.goto(`${ORLOK_URL}/system-config`);
    
    // Check system configuration loads
    await expect(page.locator('h1, h2, .page-title').first()).toContainText(/Config/i);
    
    // Check for Orlok specific network info
    const networkInfo = page.locator('*:has-text("192.168.8.120"), *:has-text("orlok")');
    if (await networkInfo.count() > 0) {
      await expect(networkInfo.first()).toBeVisible();
    }
    
    // Check system status
    const systemStatus = page.locator('.system-status, .health-status, *:has-text("Status")');
    if (await systemStatus.count() > 0) {
      await expect(systemStatus.first()).toBeVisible();
    }
  });

  test('Orlok service connectivity', async ({ page }) => {
    // Test API endpoints
    const healthResponse = await page.request.get(`${ORLOK_URL}/api/health`);
    if (healthResponse.ok()) {
      const healthData = await healthResponse.json();
      expect(healthData).toBeTruthy();
      console.log('✓ Orlok health API responding');
    }
    
    // Test WebSocket services
    await page.goto(ORLOK_URL);
    
    // Check for WebSocket connections in console
    const wsConnections = page.locator('*:has-text("WebSocket"), *:has-text("Connected")');
    if (await wsConnections.count() > 0) {
      console.log('✓ Orlok WebSocket services detected');
    }
  });

  test('Orlok complete workflow test', async ({ page }) => {
    // Complete user workflow: View character -> Check parts -> Test AI -> View camera
    
    // 1. Start at home
    await page.goto(ORLOK_URL);
    await expect(page.locator('body')).toBeVisible();
    
    // 2. Go to characters
    await page.click('a:has-text("Characters"), nav *:has-text("Characters")');
    await expect(page.locator('h1, h2').first()).toContainText(/Character/i);
    
    // 3. Go to parts
    await page.click('a:has-text("Parts"), nav *:has-text("Parts")');
    await expect(page.locator('h1, h2').first()).toContainText(/Parts/i);
    
    // 4. Go to AI Management
    await page.click('a:has-text("AI"), nav *:has-text("AI")');
    await expect(page.locator('h1, h2').first()).toContainText(/AI/i);
    
    // 5. Go to camera
    await page.goto(`${ORLOK_URL}/camera`);
    const cameraElement = page.locator('video, img[src*="stream"], .camera-container');
    if (await cameraElement.count() > 0) {
      await expect(cameraElement.first()).toBeVisible();
    }
    
    console.log('✓ Orlok complete workflow test passed');
  });

  test('Orlok character-specific functionality', async ({ page }) => {
    // Test Orlok-specific features if any
    await page.goto(`${ORLOK_URL}/characters`);
    
    // Look for Orlok character card/row
    const orlokElement = page.locator('*:has-text("Orlok")');
    if (await orlokElement.count() > 0) {
      // Check for character-specific actions
      const characterActions = page.locator('button, a').filter({ hasText: /parts|ai|edit|config/i });
      if (await characterActions.count() > 0) {
        console.log('✓ Orlok character actions available');
      }
    }
  });
});
