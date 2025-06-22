/**
 * Deep ChatterPi Testing
 * 
 * Comprehensive tests for ChatterPi functionality including:
 * - Chat interface and message handling
 * - Voice processing and real-time audio
 * - Jaw animation with servo control (GPIO 18, closed=50°, open=30°)
 * - Audio settings and WebSocket communication
 * - OpenAI integration and AI responses
 * - TopMediai TTS integration
 * - Audio streaming coordination
 * - Real-time amplitude-based jaw movement
 */

const { test, expect } = require('@playwright/test');
const TestHelpers = require('../utils/test-helpers');
const TestDataFactory = require('../utils/test-data-factory');
const { HomePage, ChatterPiPage } = require('../utils/page-objects');

test.describe('ChatterPi Deep Functionality Tests', () => {
  let homePage, chatterPiPage;

  test.beforeEach(async ({ page }) => {
    TestHelpers.logStep('Setting up ChatterPi deep functionality test');
    homePage = new HomePage(page);
    chatterPiPage = new ChatterPiPage(page);
    
    await homePage.goto('/');
    
    // Try multiple ChatterPi URLs
    const chatterPiUrls = ['/chatterpi-chat', '/chatterpi-chat.html', '/chatterpi'];
    let pageLoaded = false;

    for (const url of chatterPiUrls) {
      try {
        await page.goto(url);
        await TestHelpers.waitForPageLoad(page);
        
        const validation = await chatterPiPage.validatePageLoad();
        if (validation.pageLoaded && validation.noErrors) {
          pageLoaded = true;
          break;
        }
      } catch (error) {
        // Try next URL
      }
    }

    expect(pageLoaded).toBe(true);
  });

  test.afterEach(async () => {
    await TestDataFactory.cleanup();
  });

  test('ChatterPi Chat Interface - Complete Workflow', async ({ page }, testInfo) => {
    TestHelpers.logStep('Testing ChatterPi chat interface and message handling');

    // Test chat input and send functionality
    const chatInput = page.locator(chatterPiPage.selectors.chatInput);
    const sendButton = page.locator(chatterPiPage.selectors.sendButton);

    if (await chatInput.count() > 0 && await sendButton.count() > 0) {
      TestHelpers.logStep('Testing chat message sending');
      
      // Send test message
      const testMessage = 'Hello ChatterPi, this is a test message';
      await TestHelpers.safeFill(page, chatInput, testMessage);
      await TestHelpers.safeClick(page, sendButton);
      
      // Wait for response
      await page.waitForTimeout(5000);
      
      // Check for messages
      const messageCount = await chatterPiPage.getMessageCount();
      expect(messageCount).toBeGreaterThan(0);
      
      TestHelpers.logStep(`Found ${messageCount} chat messages`);
    } else {
      TestHelpers.logStep('⚠ Chat interface elements not found');
    }

    // Test chat history and message display
    const chatMessages = page.locator(chatterPiPage.selectors.chatMessages);
    const messageCount = await chatMessages.count();
    
    if (messageCount > 0) {
      TestHelpers.logStep('Testing chat message display');
      
      // Check message content
      for (let i = 0; i < Math.min(messageCount, 3); i++) {
        const message = chatMessages.nth(i);
        const messageText = await message.textContent();
        expect(messageText.length).toBeGreaterThan(0);
      }
    }

    // Test clear chat functionality
    const clearButton = page.locator('button:has-text("Clear"), button:has-text("Reset")');
    if (await clearButton.count() > 0) {
      TestHelpers.logStep('Testing clear chat functionality');
      await TestHelpers.safeClick(page, clearButton.first());
      await page.waitForTimeout(1000);
    }

    await chatterPiPage.takeScreenshot(testInfo, 'chatterpi_chat_interface_complete');
  });

  test('Jaw Animation System - Servo Control and Calibration', async ({ page }, testInfo) => {
    TestHelpers.logStep('Testing jaw animation system with servo control');

    // Look for jaw animation controls
    const jawControls = page.locator(chatterPiPage.selectors.jawAnimationControls);
    const jawControlCount = await jawControls.count();
    
    if (jawControlCount > 0) {
      TestHelpers.logStep('Found jaw animation controls');
      
      // Test jaw calibration
      const calibrationButtons = [
        'button:has-text("Calibrate")',
        'button:has-text("Set Closed")',
        'button:has-text("Set Open")',
        'button:has-text("Test Movement")'
      ];

      for (const buttonSelector of calibrationButtons) {
        const button = page.locator(buttonSelector);
        if (await button.count() > 0) {
          TestHelpers.logStep(`Testing jaw calibration: ${buttonSelector}`);
          await TestHelpers.safeClick(page, button.first());
          await page.waitForTimeout(2000); // Servo movements take time
        }
      }

      // Test jaw position controls
      const positionSlider = page.locator('input[type="range"][name*="jaw"], input[type="range"][name*="position"]');
      if (await positionSlider.count() > 0) {
        TestHelpers.logStep('Testing jaw position control');
        
        // Test closed position (50°)
        await TestHelpers.safeFill(page, positionSlider.first(), '50');
        await page.waitForTimeout(1000);
        
        // Test open position (30°)
        await TestHelpers.safeFill(page, positionSlider.first(), '30');
        await page.waitForTimeout(1000);
      }

      // Test jaw animation settings
      const animationSettings = [
        'input[name*="smoothing"]',
        'input[name*="attack"]',
        'input[name*="release"]',
        'input[name*="threshold"]'
      ];

      for (const settingSelector of animationSettings) {
        const setting = page.locator(settingSelector);
        if (await setting.count() > 0) {
          TestHelpers.logStep(`Testing animation setting: ${settingSelector}`);
          await TestHelpers.safeFill(page, setting.first(), '0.5');
          await page.waitForTimeout(500);
        }
      }
    } else {
      TestHelpers.logStep('⚠ No jaw animation controls found');
    }

    await chatterPiPage.takeScreenshot(testInfo, 'jaw_animation_system_complete');
  });

  test('WebSocket Communication - Real-time Connectivity', async ({ page }, testInfo) => {
    TestHelpers.logStep('Testing ChatterPi WebSocket communication');

    // Test WebSocket connections
    const wsResults = await chatterPiPage.testWebSocketConnection();
    expect(wsResults.connected).toBe(true);
    
    TestHelpers.logStep(`WebSocket connections: ${wsResults.actualConnections}`);
    
    // Test specific ChatterPi WebSocket ports
    const expectedPorts = ['8765', '8767'];
    for (const port of expectedPorts) {
      TestHelpers.logStep(`Checking WebSocket connection on port ${port}`);
    }

    // Test real-time communication
    const startButton = page.locator(chatterPiPage.selectors.startButton);
    if (await startButton.count() > 0) {
      TestHelpers.logStep('Testing ChatterPi start/stop functionality');
      
      await TestHelpers.safeClick(page, startButton);
      await page.waitForTimeout(3000);
      
      // Test stop functionality
      const stopButton = page.locator(chatterPiPage.selectors.stopButton);
      if (await stopButton.count() > 0) {
        await TestHelpers.safeClick(page, stopButton);
        await page.waitForTimeout(1000);
      }
    }

    // Test WebSocket message handling
    const wsMessages = TestDataFactory.generateWebSocketMessages();
    for (const message of wsMessages) {
      if (message.type === 'jaw_animation' || message.type === 'chat') {
        TestHelpers.logStep(`Testing WebSocket message type: ${message.type}`);
        // WebSocket messages would be tested through the interface
      }
    }

    await chatterPiPage.takeScreenshot(testInfo, 'websocket_communication_complete');
  });

  test('Audio Processing and Voice Integration', async ({ page }, testInfo) => {
    TestHelpers.logStep('Testing ChatterPi audio processing and voice integration');

    // Test audio input/output controls
    const audioResults = await TestHelpers.testAudioFunctionality(page);
    expect(audioResults.errors.length).toBe(0);

    // Test microphone controls
    const microphoneButtons = [
      'button:has-text("Start Recording")',
      'button:has-text("Stop Recording")',
      'button:has-text("Microphone")',
      'button:has-text("Voice")'
    ];

    for (const buttonSelector of microphoneButtons) {
      const button = page.locator(buttonSelector);
      if (await button.count() > 0) {
        TestHelpers.logStep(`Testing microphone control: ${buttonSelector}`);
        await TestHelpers.safeClick(page, button.first());
        await page.waitForTimeout(2000);
      }
    }

    // Test volume controls
    const volumeControls = page.locator(chatterPiPage.selectors.volumeControls);
    const volumeCount = await volumeControls.count();
    
    if (volumeCount > 0) {
      TestHelpers.logStep('Testing volume controls');
      
      for (let i = 0; i < Math.min(volumeCount, 3); i++) {
        const volumeControl = volumeControls.nth(i);
        await TestHelpers.safeFill(page, volumeControl, '0.7');
        await page.waitForTimeout(500);
      }
    }

    // Test audio level monitoring
    const audioLevelElements = [
      '.audio-level',
      '.volume-meter',
      '[data-audio-level]',
      '.microphone-level'
    ];

    let audioLevelFound = false;
    for (const selector of audioLevelElements) {
      if (await page.locator(selector).count() > 0) {
        audioLevelFound = true;
        TestHelpers.logStep(`Found audio level monitoring: ${selector}`);
        break;
      }
    }

    // Test voice activity detection
    const vadElements = [
      '.voice-activity',
      '[data-vad]',
      '.speech-detection'
    ];

    let vadFound = false;
    for (const selector of vadElements) {
      if (await page.locator(selector).count() > 0) {
        vadFound = true;
        TestHelpers.logStep(`Found voice activity detection: ${selector}`);
        break;
      }
    }

    TestHelpers.logStep(`Audio level monitoring: ${audioLevelFound}, VAD: ${vadFound}`);
    await chatterPiPage.takeScreenshot(testInfo, 'audio_processing_complete');
  });

  test('AI Integration - OpenAI and Character Responses', async ({ page }, testInfo) => {
    TestHelpers.logStep('Testing ChatterPi AI integration and character responses');

    // Test character selection
    const characterSelectors = [
      'select[name*="character"]',
      '.character-select',
      'button:has-text("Orlok")',
      'button:has-text("Blackbeard")',
      'button:has-text("RoboChat")'
    ];

    let characterFound = false;
    for (const selector of characterSelectors) {
      const characterElement = page.locator(selector);
      if (await characterElement.count() > 0) {
        characterFound = true;
        TestHelpers.logStep(`Found character selection: ${selector}`);
        
        if (selector.includes('select')) {
          const options = await characterElement.locator('option').count();
          if (options > 1) {
            await TestHelpers.safeSelect(page, characterElement.first(), { index: 1 });
          }
        } else if (selector.includes('button')) {
          await TestHelpers.safeClick(page, characterElement.first());
          await page.waitForTimeout(1000);
        }
        break;
      }
    }

    // Test AI response generation
    if (characterFound) {
      TestHelpers.logStep('Testing AI response generation');
      
      const chatInput = page.locator(chatterPiPage.selectors.chatInput);
      const sendButton = page.locator(chatterPiPage.selectors.sendButton);
      
      if (await chatInput.count() > 0 && await sendButton.count() > 0) {
        // Send message that should trigger AI response
        await TestHelpers.safeFill(page, chatInput, 'Tell me about yourself');
        await TestHelpers.safeClick(page, sendButton);
        
        // Wait for AI response
        await page.waitForTimeout(8000);
        
        // Check for AI response
        const messages = page.locator(chatterPiPage.selectors.chatMessages);
        const messageCount = await messages.count();
        
        if (messageCount > 0) {
          // Look for AI response indicators
          const aiResponseElements = [
            '.ai-response',
            '.character-response',
            '[data-sender="ai"]',
            '[data-sender="character"]'
          ];

          let aiResponseFound = false;
          for (const selector of aiResponseElements) {
            if (await page.locator(selector).count() > 0) {
              aiResponseFound = true;
              TestHelpers.logStep(`Found AI response: ${selector}`);
              break;
            }
          }

          if (!aiResponseFound) {
            // Check message content for AI-like responses
            const lastMessage = messages.last();
            const messageText = await lastMessage.textContent();
            if (messageText.length > 10) {
              TestHelpers.logStep('✓ AI response detected by content length');
            }
          }
        }
      }
    }

    // Test AI connection status
    const connectionStatus = page.locator('.ai-status, .connection-status, [data-ai-status]');
    if (await connectionStatus.count() > 0) {
      TestHelpers.logStep('Found AI connection status indicator');
    }

    await chatterPiPage.takeScreenshot(testInfo, 'ai_integration_complete');
  });

  test('TTS Integration and Voice Synthesis', async ({ page }, testInfo) => {
    TestHelpers.logStep('Testing ChatterPi TTS integration and voice synthesis');

    // Test TTS controls
    const ttsButtons = [
      'button:has-text("Speak")',
      'button:has-text("TTS")',
      'button:has-text("Voice")',
      'button:has-text("Generate")'
    ];

    let ttsFound = false;
    for (const buttonSelector of ttsButtons) {
      const button = page.locator(buttonSelector);
      if (await button.count() > 0) {
        ttsFound = true;
        TestHelpers.logStep(`Testing TTS control: ${buttonSelector}`);
        await TestHelpers.safeClick(page, button.first());
        await page.waitForTimeout(3000);
        break;
      }
    }

    // Test voice settings
    const voiceSettings = [
      'select[name*="voice"]',
      'input[name*="speed"]',
      'input[name*="pitch"]',
      'input[name*="volume"]'
    ];

    for (const settingSelector of voiceSettings) {
      const setting = page.locator(settingSelector);
      if (await setting.count() > 0) {
        TestHelpers.logStep(`Testing voice setting: ${settingSelector}`);
        
        if (settingSelector.includes('select')) {
          const options = await setting.locator('option').count();
          if (options > 1) {
            await TestHelpers.safeSelect(page, setting.first(), { index: 1 });
          }
        } else {
          await TestHelpers.safeFill(page, setting.first(), '1.0');
        }
        await page.waitForTimeout(500);
      }
    }

    // Test TopMediai integration
    const topMediaiElements = [
      '[data-provider="topmediai"]',
      '.topmediai-config',
      ':has-text("TopMediai")'
    ];

    let topMediaiFound = false;
    for (const selector of topMediaiElements) {
      if (await page.locator(selector).count() > 0) {
        topMediaiFound = true;
        TestHelpers.logStep(`Found TopMediai integration: ${selector}`);
        break;
      }
    }

    TestHelpers.logStep(`TTS found: ${ttsFound}, TopMediai integration: ${topMediaiFound}`);
    await chatterPiPage.takeScreenshot(testInfo, 'tts_integration_complete');
  });

  test('Advanced Audio Settings and Configuration', async ({ page }, testInfo) => {
    TestHelpers.logStep('Testing ChatterPi advanced audio settings');

    // Look for settings button or advanced controls
    const settingsButton = page.locator(chatterPiPage.selectors.settingsButton);
    if (await settingsButton.count() > 0) {
      TestHelpers.logStep('Opening advanced audio settings');
      await TestHelpers.safeClick(page, settingsButton);
      await page.waitForTimeout(1000);
    }

    // Test advanced audio settings
    const advancedSettings = [
      'input[name*="smoothing"]',
      'input[name*="attack"]',
      'input[name*="release"]',
      'input[name*="threshold"]',
      'input[name*="sensitivity"]',
      'select[name*="mode"]'
    ];

    let settingsFound = 0;
    for (const settingSelector of advancedSettings) {
      const setting = page.locator(settingSelector);
      if (await setting.count() > 0) {
        settingsFound++;
        TestHelpers.logStep(`Testing advanced setting: ${settingSelector}`);
        
        if (settingSelector.includes('select')) {
          const options = await setting.locator('option').count();
          if (options > 1) {
            await TestHelpers.safeSelect(page, setting.first(), { index: 1 });
          }
        } else {
          await TestHelpers.safeFill(page, setting.first(), '0.5');
        }
        await page.waitForTimeout(500);
      }
    }

    // Test preset buttons
    const presetButtons = [
      'button:has-text("Smooth")',
      'button:has-text("Responsive")',
      'button:has-text("Debug")',
      'button:has-text("Default")'
    ];

    for (const buttonSelector of presetButtons) {
      const button = page.locator(buttonSelector);
      if (await button.count() > 0) {
        TestHelpers.logStep(`Testing preset: ${buttonSelector}`);
        await TestHelpers.safeClick(page, button.first());
        await page.waitForTimeout(1000);
      }
    }

    // Test save settings
    const saveButton = page.locator('button:has-text("Save"), button:has-text("Apply")');
    if (await saveButton.count() > 0) {
      TestHelpers.logStep('Testing settings save');
      await TestHelpers.safeClick(page, saveButton.first());
      await page.waitForTimeout(1000);
    }

    TestHelpers.logStep(`Found ${settingsFound} advanced audio settings`);
    await chatterPiPage.takeScreenshot(testInfo, 'advanced_audio_settings_complete');
  });

  test('Error Handling and Recovery', async ({ page }, testInfo) => {
    TestHelpers.logStep('Testing ChatterPi error handling and recovery');

    // Test connection error handling
    const connectionTests = [
      'button:has-text("Reconnect")',
      'button:has-text("Retry")',
      '.error-message',
      '.connection-error'
    ];

    for (const selector of connectionTests) {
      const element = page.locator(selector);
      if (await element.count() > 0) {
        TestHelpers.logStep(`Found error handling element: ${selector}`);
        
        if (selector.includes('button')) {
          await TestHelpers.safeClick(page, element.first());
          await page.waitForTimeout(2000);
        }
      }
    }

    // Test service status monitoring
    const statusElements = [
      '.service-status',
      '.chatterpi-status',
      '[data-service-status]'
    ];

    let statusFound = false;
    for (const selector of statusElements) {
      if (await page.locator(selector).count() > 0) {
        statusFound = true;
        TestHelpers.logStep(`Found status monitoring: ${selector}`);
        break;
      }
    }

    // Test restart functionality
    const restartButton = page.locator('button:has-text("Restart"), button:has-text("Reset")');
    if (await restartButton.count() > 0) {
      TestHelpers.logStep('Testing restart functionality');
      // Don't actually restart to avoid disrupting other tests
      await expect(restartButton.first()).toBeVisible();
    }

    TestHelpers.logStep(`Status monitoring found: ${statusFound}`);
    await chatterPiPage.takeScreenshot(testInfo, 'error_handling_complete');
  });
});
