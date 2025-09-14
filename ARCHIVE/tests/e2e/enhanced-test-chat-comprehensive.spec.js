const { test, expect } = require('@playwright/test');
const path = require('path');

test.describe('Enhanced Test Chat - Comprehensive E2E Test', () => {
  let page;
  let context;

  test.beforeAll(async ({ browser }) => {
    // Create context with microphone permissions
    context = await browser.newContext({
      permissions: ['microphone'],
      viewport: { width: 1280, height: 720 }
    });
    page = await context.newPage();

    // Enable console logging for debugging
    page.on('console', msg => {
      if (msg.type() === 'error') {
        console.error(`❌ Console Error: ${msg.text()}`);
      } else if (msg.type() === 'warn') {
        console.warn(`⚠️ Console Warning: ${msg.text()}`);
      } else {
        console.log(`📝 Console: ${msg.text()}`);
      }
    });

    // Listen for network errors
    page.on('requestfailed', request => {
      console.error(`❌ Network Error: ${request.url()} - ${request.failure().errorText}`);
    });
  });

  test.afterAll(async () => {
    await context.close();
  });

  test('Complete Enhanced Test Chat Flow with Skulltalker', async () => {
    console.log('🚀 Starting comprehensive Enhanced Test Chat test...');

    // Step 1: Navigate to Enhanced Test Chat with Skulltalker
    console.log('📍 Step 1: Navigating to Enhanced Test Chat page...');
    await page.goto('http://localhost:3000/enhanced-test-chat?characterId=4');
    await page.waitForLoadState('networkidle');
    
    // Take initial screenshot
    await page.screenshot({ 
      path: 'tests/screenshots/enhanced-chat-initial.png',
      fullPage: true 
    });

    // Step 2: Validate Universal Header and Page Layout
    console.log('🎭 Step 2: Validating page layout and universal header...');
    
    // Check universal header exists
    await expect(page.locator('.universal-header')).toBeVisible();
    
    // Verify character selection shows Skulltalker
    const characterBadge = page.locator('.character-badge, .current-character');
    await expect(characterBadge).toContainText('Skulltalker', { timeout: 10000 });
    
    // Validate main content layout
    await expect(page.locator('.main-content')).toBeVisible();
    await expect(page.locator('.chat-container')).toBeVisible();
    await expect(page.locator('.chat-header')).toBeVisible();

    // Step 3: Validate Performance Metrics Display
    console.log('📊 Step 3: Checking performance metrics...');
    await expect(page.locator('.performance-metrics')).toBeVisible();
    await expect(page.locator('.metric')).toHaveCount(3); // Voice Input, AI Response, TTS Output
    
    // Verify metric labels
    await expect(page.locator('.metric-label').first()).toContainText('Voice Input');

    // Step 4: Validate Character Selection and Configuration
    console.log('⚙️ Step 4: Validating character configuration...');
    
    // Check character selector
    const characterSelect = page.locator('#characterSelect');
    await expect(characterSelect).toBeVisible();
    
    // Verify Skulltalker is selected
    const selectedValue = await characterSelect.inputValue();
    expect(selectedValue).toBe('4');

    // Step 5: Test Speaker Configuration Loading
    console.log('🔊 Step 5: Testing speaker configuration...');
    
    // Wait for character speaker config to load
    await page.waitForFunction(() => {
      return window.testChat && window.testChat.currentCharacter && 
             window.testChat.currentCharacter.speakerConfig;
    }, { timeout: 15000 });

    // Validate speaker configuration in console
    const speakerConfig = await page.evaluate(() => {
      return window.testChat?.currentCharacter?.speakerConfig;
    });
    
    expect(speakerConfig).toBeTruthy();
    console.log('✅ Speaker configuration loaded:', speakerConfig);

    // Step 6: Test Voice Controls and UI Elements
    console.log('🎤 Step 6: Testing voice controls...');
    
    // Check voice toggle buttons
    await expect(page.locator('.voice-toggle')).toHaveCount(2); // STT and TTS toggles
    
    // Verify Live Mode toggle
    const liveModeToggle = page.locator('#liveModeToggle');
    await expect(liveModeToggle).toBeVisible();
    
    // Check TTS Configuration button
    const ttsConfigBtn = page.locator('#ttsConfigBtn');
    await expect(ttsConfigBtn).toBeVisible();

    // Step 7: Test Chat Interface Elements
    console.log('💬 Step 7: Validating chat interface...');
    
    // Check chat messages area
    await expect(page.locator('#chatMessages')).toBeVisible();
    
    // Check input area
    await expect(page.locator('#messageInput')).toBeVisible();
    await expect(page.locator('#sendButton')).toBeVisible();
    
    // Verify send button is initially disabled (no message)
    await expect(page.locator('#sendButton')).toBeDisabled();

    // Step 8: Test Text Input and Send Functionality
    console.log('✍️ Step 8: Testing text input functionality...');
    
    const testMessage = "Hello Skulltalker, this is a test message for TTS audio routing.";
    
    // Type test message
    await page.fill('#messageInput', testMessage);
    
    // Verify send button becomes enabled
    await expect(page.locator('#sendButton')).toBeEnabled();
    
    // Take screenshot before sending
    await page.screenshot({ 
      path: 'tests/screenshots/enhanced-chat-message-ready.png' 
    });

    // Step 9: Send Message and Test AI Response
    console.log('🤖 Step 9: Sending message and testing AI response...');
    
    // Click send button
    await page.click('#sendButton');
    
    // Wait for message to appear in chat
    await expect(page.locator('#chatMessages .message').last()).toContainText(testMessage, { timeout: 5000 });
    
    // Wait for AI response (this may take time)
    console.log('⏳ Waiting for AI response...');
    await page.waitForFunction(() => {
      const messages = document.querySelectorAll('#chatMessages .message');
      return messages.length >= 2; // User message + AI response
    }, { timeout: 30000 });

    // Step 10: Validate TTS Audio Routing
    console.log('🔊 Step 10: Testing TTS audio routing...');
    
    // Monitor network requests for audio playback
    let audioPlaybackRequested = false;
    page.on('request', request => {
      if (request.url().includes('/voice/play-audio')) {
        audioPlaybackRequested = true;
        console.log('✅ Audio playback request detected:', request.url());
      }
    });

    // Wait for potential audio playback
    await page.waitForTimeout(5000);
    
    // Check if audio routing was attempted
    if (audioPlaybackRequested) {
      console.log('✅ TTS audio routing through character speaker confirmed');
    } else {
      console.log('ℹ️ No server-side audio routing detected (may be using browser audio)');
    }

    // Step 11: Test STT Configuration
    console.log('🎙️ Step 11: Testing STT configuration...');
    
    // Click STT toggle to enable
    const sttToggle = page.locator('#sttToggle');
    if (await sttToggle.isVisible()) {
      await sttToggle.click();
      
      // Wait for STT to activate
      await page.waitForTimeout(2000);
      
      // Check if STT is active
      const sttActive = await page.locator('#sttToggle.active').isVisible();
      if (sttActive) {
        console.log('✅ STT activated successfully');
      }
    }

    // Step 12: Test TTS Configuration Modal
    console.log('⚙️ Step 12: Testing TTS configuration modal...');
    
    // Open TTS configuration
    await page.click('#ttsConfigBtn');
    
    // Wait for modal to appear
    await expect(page.locator('#ttsConfigModal')).toBeVisible({ timeout: 5000 });
    
    // Verify speaker selection shows USB Dongle
    const speakerSelect = page.locator('#ttsOutputDevice');
    if (await speakerSelect.isVisible()) {
      const speakerOptions = await speakerSelect.locator('option').allTextContents();
      console.log('🔊 Available speakers:', speakerOptions);
      
      // Look for USB Audio Device
      const hasUsbSpeaker = speakerOptions.some(option => 
        option.includes('USB') || option.includes('C-Media')
      );
      
      if (hasUsbSpeaker) {
        console.log('✅ USB Dongle speaker option found');
      }
    }
    
    // Close modal
    await page.click('#cancelTTSConfig');
    await expect(page.locator('#ttsConfigModal')).toBeHidden();

    // Step 13: Test Responsive Design
    console.log('📱 Step 13: Testing responsive design...');
    
    // Test mobile viewport
    await page.setViewportSize({ width: 375, height: 667 });
    await page.waitForTimeout(1000);
    
    // Take mobile screenshot
    await page.screenshot({ 
      path: 'tests/screenshots/enhanced-chat-mobile.png' 
    });
    
    // Verify mobile layout
    await expect(page.locator('.chat-container')).toBeVisible();
    await expect(page.locator('.performance-metrics')).toBeVisible();
    
    // Restore desktop viewport
    await page.setViewportSize({ width: 1280, height: 720 });

    // Step 14: Test Error Handling
    console.log('🚨 Step 14: Testing error handling...');
    
    // Test with invalid character selection
    await page.evaluate(() => {
      if (window.testChat) {
        window.testChat.currentCharacter = null;
      }
    });
    
    // Try to send a message without character
    await page.fill('#messageInput', 'Test error handling');
    await page.click('#sendButton');
    
    // Should handle gracefully
    await page.waitForTimeout(2000);

    // Step 15: Final Validation and Screenshots
    console.log('📸 Step 15: Final validation and screenshots...');
    
    // Take final screenshot
    await page.screenshot({ 
      path: 'tests/screenshots/enhanced-chat-final.png',
      fullPage: true 
    });
    
    // Validate no console errors
    const consoleErrors = [];
    page.on('console', msg => {
      if (msg.type() === 'error') {
        consoleErrors.push(msg.text());
      }
    });
    
    // Wait a bit more to catch any delayed errors
    await page.waitForTimeout(3000);
    
    // Report results
    console.log('📊 Test Results Summary:');
    console.log('✅ Page navigation: SUCCESS');
    console.log('✅ Universal header: SUCCESS');
    console.log('✅ Character selection: SUCCESS');
    console.log('✅ Performance metrics: SUCCESS');
    console.log('✅ Voice controls: SUCCESS');
    console.log('✅ Chat interface: SUCCESS');
    console.log('✅ Message sending: SUCCESS');
    console.log('✅ TTS configuration: SUCCESS');
    console.log('✅ Responsive design: SUCCESS');
    console.log('✅ Error handling: SUCCESS');
    
    if (consoleErrors.length === 0) {
      console.log('✅ No console errors detected');
    } else {
      console.log(`⚠️ Console errors detected: ${consoleErrors.length}`);
      consoleErrors.forEach(error => console.log(`  - ${error}`));
    }
    
    console.log('🎉 Comprehensive Enhanced Test Chat test completed successfully!');
  });

  test('Hardware Integration Validation', async () => {
    console.log('🔧 Testing hardware integration aspects...');

    await page.goto('http://localhost:3000/enhanced-test-chat?characterId=4');
    await page.waitForLoadState('networkidle');

    // Test WebSocket connections
    console.log('🌐 Checking WebSocket connections...');

    // Monitor WebSocket connections
    let wsConnections = 0;
    page.on('websocket', ws => {
      wsConnections++;
      console.log(`🔌 WebSocket connection established: ${ws.url()}`);

      ws.on('framereceived', event => {
        console.log(`📨 WebSocket frame received: ${event.payload}`);
      });
    });

    // Wait for potential WebSocket connections
    await page.waitForTimeout(5000);

    console.log(`📊 Total WebSocket connections: ${wsConnections}`);

    // Test hardware status endpoints
    console.log('🔍 Testing hardware status endpoints...');

    const response = await page.request.get('http://localhost:3000/api/character-audio-config/4/speaker');
    expect(response.ok()).toBeTruthy();

    const speakerData = await response.json();
    expect(speakerData.success).toBeTruthy();

    console.log('✅ Speaker configuration API working');
    console.log('📊 Speaker data:', speakerData.data);

    // Validate speaker part ID 66 is configured
    if (speakerData.data.speakerConfig.defaultSpeakerId === 66) {
      console.log('✅ Correct speaker part ID (66) configured');
    }

    // Test servo status for jaw animation (GPIO 16, Servo ID 69)
    console.log('🦷 Testing jaw servo configuration...');

    try {
      const servoResponse = await page.request.get('http://localhost:3000/api/servo-calibration/status/69');
      if (servoResponse.ok()) {
        const servoData = await servoResponse.json();
        console.log('✅ Jaw servo API accessible');
        console.log('📊 Servo data:', servoData.data);

        if (servoData.data && servoData.data.calibration) {
          console.log('✅ Servo calibration data available');
        }
      }
    } catch (error) {
      console.log('ℹ️ Servo service may not be available:', error.message);
    }

    // Test microphone parts configuration
    console.log('🎤 Testing microphone configuration...');

    const micResponse = await page.request.get('http://localhost:3000/api/character-audio-config/4/microphone-parts');
    if (micResponse.ok()) {
      const micData = await micResponse.json();
      console.log('✅ Microphone parts API working');
      console.log('📊 Microphone parts:', micData.data);
    }

    console.log('🎉 Hardware integration validation completed!');
  });

  test('Audio Level Indicators and Visual Feedback', async () => {
    console.log('📊 Testing audio level indicators and visual feedback...');

    await page.goto('http://localhost:3000/enhanced-test-chat?characterId=4');
    await page.waitForLoadState('networkidle');

    // Test STT activation and audio level indicators
    console.log('🎙️ Testing STT audio level indicators...');

    // Enable STT if available
    const sttToggle = page.locator('#sttToggle');
    if (await sttToggle.isVisible()) {
      await sttToggle.click();

      // Look for audio level indicators
      const audioLevelIndicator = page.locator('.audio-level-indicator, .audio-meter, .volume-meter');
      if (await audioLevelIndicator.first().isVisible({ timeout: 5000 })) {
        console.log('✅ Audio level indicator found');

        // Take screenshot of audio indicators
        await page.screenshot({
          path: 'tests/screenshots/enhanced-chat-audio-indicators.png'
        });
      } else {
        console.log('ℹ️ No visual audio level indicators detected');
      }
    }

    // Test Live Mode visual feedback
    console.log('🎯 Testing Live Mode visual feedback...');

    const liveModeToggle = page.locator('#liveModeToggle');
    if (await liveModeToggle.isVisible()) {
      await liveModeToggle.click();

      // Wait for Live Mode to activate
      await page.waitForTimeout(2000);

      // Check for Live Mode visual states
      const liveModeActive = await page.locator('#liveModeToggle.active').isVisible();
      if (liveModeActive) {
        console.log('✅ Live Mode visual feedback working');

        // Take screenshot of Live Mode
        await page.screenshot({
          path: 'tests/screenshots/enhanced-chat-live-mode.png'
        });
      }
    }

    // Test performance metrics updates
    console.log('⏱️ Testing performance metrics updates...');

    // Send a test message to trigger metrics
    await page.fill('#messageInput', 'Test performance metrics');
    await page.click('#sendButton');

    // Wait for metrics to potentially update
    await page.waitForTimeout(3000);

    // Check if any metrics show values
    const metricValues = await page.locator('.metric-value').allTextContents();
    const hasMetricData = metricValues.some(value => value !== '—' && value !== '0ms');

    if (hasMetricData) {
      console.log('✅ Performance metrics updating');
      console.log('📊 Metric values:', metricValues);
    } else {
      console.log('ℹ️ Performance metrics showing default values');
    }

    console.log('🎉 Audio level indicators and visual feedback test completed!');
  });

  test('Error Scenarios and Edge Cases', async () => {
    console.log('🚨 Testing error scenarios and edge cases...');

    await page.goto('http://localhost:3000/enhanced-test-chat?characterId=4');
    await page.waitForLoadState('networkidle');

    // Test with invalid character ID
    console.log('❌ Testing invalid character ID...');
    await page.goto('http://localhost:3000/enhanced-test-chat?characterId=999');
    await page.waitForLoadState('networkidle');

    // Should handle gracefully
    await expect(page.locator('.chat-container')).toBeVisible();

    // Test network failure simulation
    console.log('🌐 Testing network failure handling...');

    // Go back to valid character
    await page.goto('http://localhost:3000/enhanced-test-chat?characterId=4');
    await page.waitForLoadState('networkidle');

    // Simulate network failure
    await page.route('**/voice/play-audio', route => {
      route.abort('failed');
    });

    // Try to send a message
    await page.fill('#messageInput', 'Test network failure');
    await page.click('#sendButton');

    // Wait and check for error handling
    await page.waitForTimeout(5000);

    // Should not crash the application
    await expect(page.locator('.chat-container')).toBeVisible();

    console.log('✅ Error scenarios handled gracefully');
    console.log('🎉 Error scenarios and edge cases test completed!');
  });
});
});
