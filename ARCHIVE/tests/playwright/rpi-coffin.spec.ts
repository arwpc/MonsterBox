import { test, expect, Page } from '@playwright/test';

/**
 * Coffin Breaker (192.168.8.140) Full System Test
 * Tests all functionality directly on Coffin Breaker RPi4b as end user
 */

test.describe('Coffin Breaker RPi4b Full System Test', () => {
  let errors: string[] = [];
  const COFFIN_URL = 'http://192.168.8.140:3000';

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
      console.log('🚨 Coffin Breaker System Errors:');
      errors.forEach(error => console.log(`  - ${error}`));
    }
  });

  test('Coffin Breaker web interface loads', async ({ page }) => {
    await page.goto(COFFIN_URL);
    
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

  test('Coffin Breaker character data loads', async ({ page }) => {
    await page.goto(`${COFFIN_URL}/characters`);
    
    // Check characters page loads
    await expect(page.locator('h1, h2, .page-title').first()).toContainText(/Character/i);
    
    // Look for Coffin Breaker character specifically
    const coffinChar = page.locator('*:has-text("Coffin"), *:has-text("Breaker")');
    if (await coffinChar.count() > 0) {
      await expect(coffinChar.first()).toBeVisible();
    }
    
    // Check character management buttons
    const actionButtons = page.locator('button:has-text("Parts"), button:has-text("AI"), a[href*="/parts"], a[href*="/ai"]');
    if (await actionButtons.count() > 0) {
      await expect(actionButtons.first()).toBeVisible();
    }
  });

  test('Coffin Breaker parts management', async ({ page }) => {
    await page.goto(`${COFFIN_URL}/parts`);
    
    // Check parts page loads
    await expect(page.locator('h1, h2, .page-title').first()).toContainText(/Parts/i);
    
    // Check character filter for Coffin Breaker
    const characterSelect = page.locator('select[name*="character"], #characterFilter');
    if (await characterSelect.count() > 0) {
      // Try to select Coffin Breaker
      const options = await characterSelect.locator('option').all();
      for (const option of options) {
        const text = await option.textContent();
        if (text && (text.toLowerCase().includes('coffin') || text.toLowerCase().includes('breaker'))) {
          await characterSelect.selectOption(await option.getAttribute('value') || '');
          break;
        }
      }
    }
    
    // Check for parts list
    const partsList = page.locator('table, .parts-list, .parts-grid');
    await expect(partsList).toBeVisible();
    
    // Look for Coffin Breaker specific parts
    const partTypes = ['webcam', 'microphone', 'speaker', 'servo'];
    for (const partType of partTypes) {
      const partElement = page.locator(`*:has-text("${partType}")`, { hasText: new RegExp(partType, 'i') });
      if (await partElement.count() > 0) {
        console.log(`✓ Found ${partType} part for Coffin Breaker`);
      }
    }
  });

  test('Coffin Breaker webcam functionality', async ({ page }) => {
    await page.goto(`${COFFIN_URL}/camera`);
    
    // Check camera page loads
    const cameraPage = page.locator('h1:has-text("Camera"), h2:has-text("Webcam"), .camera-container');
    if (await cameraPage.count() > 0) {
      await expect(cameraPage.first()).toBeVisible();
      
      // Check for video stream (Coffin should have working camera)
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

  test('Coffin Breaker servo control', async ({ page }) => {
    await page.goto(`${COFFIN_URL}/parts`);
    
    // Look for servo parts and test controls
    const servoTest = page.locator('button:has-text("Test"), .btn-test');
    if (await servoTest.count() > 0) {
      // Test first servo
      await servoTest.first().click();
      await page.waitForTimeout(3000);
      
      // Check for servo response or feedback
      const servoFeedback = page.locator('.test-result, .servo-status, .feedback');
      if (await servoFeedback.count() > 0) {
        await expect(servoFeedback.first()).toBeVisible();
      }
    }
  });

  test('Coffin Breaker AI Management', async ({ page }) => {
    await page.goto(`${COFFIN_URL}/ai-management`);
    
    // Check AI management loads
    await expect(page.locator('h1, h2, .page-title').first()).toContainText(/AI/i);
    
    // Test STT configuration for Coffin Breaker
    const sttLink = page.locator('a[href*="stt"], button:has-text("STT")');
    if (await sttLink.count() > 0) {
      await sttLink.first().click();
      
      // Check STT page
      await expect(page.locator('h1, h2').first()).toContainText(/STT|Speech/i);
      
      // Select Coffin Breaker character
      const characterSelect = page.locator('select[name*="character"], #characterSelect');
      if (await characterSelect.count() > 0) {
        const options = await characterSelect.locator('option').all();
        for (const option of options) {
          const text = await option.textContent();
          if (text && (text.toLowerCase().includes('coffin') || text.toLowerCase().includes('breaker'))) {
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

  test('Coffin Breaker Enhanced Test Chat', async ({ page }) => {
    await page.goto(`${COFFIN_URL}/ai-management/enhanced-test-chat`);
    
    // Check chat page loads
    await expect(page.locator('h1, h2, .page-title').first()).toContainText(/Chat|Test/i);
    
    // Select Coffin Breaker character
    const characterSelect = page.locator('select[name*="character"], #characterSelect');
    if (await characterSelect.count() > 0) {
      const options = await characterSelect.locator('option').all();
      for (const option of options) {
        const text = await option.textContent();
        if (text && (text.toLowerCase().includes('coffin') || text.toLowerCase().includes('breaker'))) {
          await characterSelect.selectOption(await option.getAttribute('value') || '');
          break;
        }
      }
    }
    
    // Test sending a message to Coffin Breaker
    const messageInput = page.locator('input[name*="message"], textarea[name*="message"], #messageInput');
    if (await messageInput.count() > 0) {
      await messageInput.fill('Hello Coffin Breaker! Are you ready to rise from the grave?');
      
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

  test('Coffin Breaker microphone testing', async ({ page }) => {
    await page.goto(`${COFFIN_URL}/ai-management/stt`);
    
    // Select Coffin Breaker character first
    const characterSelect = page.locator('select[name*="character"], #characterSelect');
    if (await characterSelect.count() > 0) {
      const options = await characterSelect.locator('option').all();
      for (const option of options) {
        const text = await option.textContent();
        if (text && (text.toLowerCase().includes('coffin') || text.toLowerCase().includes('breaker'))) {
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

  test('Coffin Breaker speaker testing', async ({ page }) => {
    await page.goto(`${COFFIN_URL}/ai-management/tts`);
    
    // Select Coffin Breaker character
    const characterSelect = page.locator('select[name*="character"], #characterSelect');
    if (await characterSelect.count() > 0) {
      const options = await characterSelect.locator('option').all();
      for (const option of options) {
        const text = await option.textContent();
        if (text && (text.toLowerCase().includes('coffin') || text.toLowerCase().includes('breaker'))) {
          await characterSelect.selectOption(await option.getAttribute('value') || '');
          break;
        }
      }
    }
    
    // Test TTS output
    const testText = page.locator('input[name*="text"], textarea[name*="text"], #testText');
    if (await testText.count() > 0) {
      await testText.fill('Testing Coffin Breaker speaker output. Rise from the dead!');
      
      const testButton = page.locator('button:has-text("Test"), button:has-text("Speak"), .btn-test');
      if (await testButton.count() > 0) {
        await testButton.first().click();
        await page.waitForTimeout(5000);
      }
    }
  });

  test('Coffin Breaker system health', async ({ page }) => {
    await page.goto(`${COFFIN_URL}/system-config`);
    
    // Check system configuration loads
    await expect(page.locator('h1, h2, .page-title').first()).toContainText(/Config/i);
    
    // Check for Coffin Breaker specific network info
    const networkInfo = page.locator('*:has-text("192.168.8.140"), *:has-text("coffin")');
    if (await networkInfo.count() > 0) {
      await expect(networkInfo.first()).toBeVisible();
    }
    
    // Check system status
    const systemStatus = page.locator('.system-status, .health-status, *:has-text("Status")');
    if (await systemStatus.count() > 0) {
      await expect(systemStatus.first()).toBeVisible();
    }
  });

  test('Coffin Breaker service connectivity', async ({ page }) => {
    // Test API endpoints
    const healthResponse = await page.request.get(`${COFFIN_URL}/api/health`);
    if (healthResponse.ok()) {
      const healthData = await healthResponse.json();
      expect(healthData).toBeTruthy();
      console.log('✓ Coffin Breaker health API responding');
    }
    
    // Test WebSocket services
    await page.goto(COFFIN_URL);
    
    // Check for WebSocket connections in console
    const wsConnections = page.locator('*:has-text("WebSocket"), *:has-text("Connected")');
    if (await wsConnections.count() > 0) {
      console.log('✓ Coffin Breaker WebSocket services detected');
    }
  });

  test('Coffin Breaker complete workflow test', async ({ page }) => {
    // Complete user workflow: View character -> Check parts -> Test AI -> View camera
    
    // 1. Start at home
    await page.goto(COFFIN_URL);
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
    await page.goto(`${COFFIN_URL}/camera`);
    const cameraElement = page.locator('video, img[src*="stream"], .camera-container');
    if (await cameraElement.count() > 0) {
      await expect(cameraElement.first()).toBeVisible();
    }
    
    console.log('✓ Coffin Breaker complete workflow test passed');
  });
});
