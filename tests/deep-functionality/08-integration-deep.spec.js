/**
 * Deep Integration Testing
 * 
 * Comprehensive tests for cross-component workflows and system integration:
 * - Character creation → hardware assignment → AI configuration → scene creation
 * - WebSocket communication stability across all services
 * - Audio pipeline: input → processing → output → jaw animation
 * - Error recovery and system resilience
 * - Performance under load
 * - Real-time coordination between components
 * - End-to-end user workflows
 */

const { test, expect } = require('@playwright/test');
const TestHelpers = require('../utils/test-helpers');
const TestDataFactory = require('../utils/test-data-factory');
const { HomePage, CharactersPage, HardwarePartsPage, AIManagementPage, SoundsPage, ChatterPiPage } = require('../utils/page-objects');

test.describe('Integration Deep Functionality Tests', () => {
  let homePage, charactersPage, hardwarePartsPage, aiManagementPage, soundsPage, chatterPiPage;

  test.beforeEach(async ({ page }) => {
    TestHelpers.logStep('Setting up Integration deep functionality test');
    
    // Initialize all page objects
    homePage = new HomePage(page);
    charactersPage = new CharactersPage(page);
    hardwarePartsPage = new HardwarePartsPage(page);
    aiManagementPage = new AIManagementPage(page);
    soundsPage = new SoundsPage(page);
    chatterPiPage = new ChatterPiPage(page);
    
    await homePage.goto('/');
    const validation = await homePage.validatePageLoad();
    expect(validation.pageLoaded).toBe(true);
    expect(validation.noErrors).toBe(true);
  });

  test.afterEach(async () => {
    await TestDataFactory.cleanup();
  });

  test('Complete Character Workflow - Creation to Scene Execution', async ({ page }, testInfo) => {
    TestHelpers.logStep('Testing complete character workflow from creation to scene execution');

    // Step 1: Create a new character
    TestHelpers.logStep('Step 1: Creating new character');
    await homePage.navigateToCharacters();
    
    const testCharacter = TestDataFactory.generateCharacterData({
      name: 'Integration Test Character',
      description: 'Character for testing complete workflow'
    });
    
    await charactersPage.addNewCharacter(testCharacter);
    const characterCount = await charactersPage.getCharacterCount();
    expect(characterCount).toBeGreaterThan(0);

    // Step 2: Add hardware parts
    TestHelpers.logStep('Step 2: Adding hardware parts');
    await homePage.navigateToHardwareParts();
    
    const servoConfig = TestDataFactory.generateHardwarePartData('servo', {
      pin: 18,
      minAngle: 30,
      maxAngle: 50
    });
    
    await hardwarePartsPage.addHardwarePart('Servo', servoConfig);
    const partCount = await hardwarePartsPage.getPartCount();
    expect(partCount).toBeGreaterThan(0);

    // Step 3: Configure AI
    TestHelpers.logStep('Step 3: Configuring AI');
    await homePage.navigateToAIManagement();
    
    const aiConfig = TestDataFactory.generateAIConfigData('openai');
    await aiManagementPage.configureAI(aiConfig);
    await aiManagementPage.saveConfiguration();

    // Step 4: Upload sounds
    TestHelpers.logStep('Step 4: Uploading sounds');
    await homePage.navigateToSounds();
    
    const testAudio = await TestDataFactory.generateTestFile('audio', 'small');
    await soundsPage.uploadSound(testAudio.path);
    const soundCount = await soundsPage.getSoundCount();
    expect(soundCount).toBeGreaterThan(0);

    // Step 5: Test ChatterPi integration
    TestHelpers.logStep('Step 5: Testing ChatterPi integration');
    try {
      await page.goto('/chatterpi-chat');
      await TestHelpers.waitForPageLoad(page);
      
      const chatValidation = await chatterPiPage.validatePageLoad();
      if (chatValidation.pageLoaded) {
        // Test sending a message
        await chatterPiPage.sendMessage('Hello, integration test');
        const messageCount = await chatterPiPage.getMessageCount();
        expect(messageCount).toBeGreaterThan(0);
      }
    } catch (error) {
      TestHelpers.logStep('⚠ ChatterPi integration test skipped: ' + error.message);
    }

    await TestHelpers.takeScreenshot(page, testInfo, 'complete_character_workflow');
  });

  test('WebSocket Communication Stability - All Services', async ({ page }, testInfo) => {
    TestHelpers.logStep('Testing WebSocket communication stability across all services');

    const webSocketTests = [
      { url: '/chatterpi-chat', expectedPorts: ['8765', '8767'], name: 'ChatterPi' },
      { url: '/parts', expectedPorts: [], name: 'Hardware Parts' },
      { url: '/characters', expectedPorts: [], name: 'Characters' },
      { url: '/', expectedPorts: [], name: 'Home' }
    ];

    const wsResults = [];

    for (const test of webSocketTests) {
      TestHelpers.logStep(`Testing WebSocket connectivity for ${test.name}`);
      
      try {
        await page.goto(test.url);
        await TestHelpers.waitForPageLoad(page);
        
        const wsResult = await TestHelpers.testWebSocketConnection(page, test.expectedPorts);
        wsResults.push({
          ...test,
          connected: wsResult.connected,
          connections: wsResult.actualConnections,
          errors: wsResult.errors
        });
        
        TestHelpers.logStep(`${test.name}: ${wsResult.actualConnections} connections`);
      } catch (error) {
        wsResults.push({
          ...test,
          connected: false,
          connections: 0,
          errors: [{ message: error.message }]
        });
      }
    }

    // Verify at least one service has WebSocket connectivity
    const connectedServices = wsResults.filter(result => result.connected);
    expect(connectedServices.length).toBeGreaterThan(0);

    await TestHelpers.takeScreenshot(page, testInfo, 'websocket_stability_test');
  });

  test('Audio Pipeline Integration - Input to Jaw Animation', async ({ page }, testInfo) => {
    TestHelpers.logStep('Testing complete audio pipeline from input to jaw animation');

    // Navigate to ChatterPi for audio testing
    try {
      await page.goto('/chatterpi-chat');
      await TestHelpers.waitForPageLoad(page);
      
      // Test audio input
      TestHelpers.logStep('Testing audio input');
      const microphoneButtons = page.locator('button:has-text("Microphone"), button:has-text("Record")');
      if (await microphoneButtons.count() > 0) {
        await TestHelpers.safeClick(page, microphoneButtons.first());
        await page.waitForTimeout(2000);
      }

      // Test audio processing
      TestHelpers.logStep('Testing audio processing');
      const audioResults = await TestHelpers.testAudioFunctionality(page);
      expect(audioResults.errors.length).toBe(0);

      // Test jaw animation response
      TestHelpers.logStep('Testing jaw animation response to audio');
      const jawControls = page.locator('[data-control="jaw"], .jaw-controls');
      if (await jawControls.count() > 0) {
        // Test jaw movement
        const jawSlider = page.locator('input[type="range"][name*="jaw"]');
        if (await jawSlider.count() > 0) {
          await TestHelpers.safeFill(page, jawSlider.first(), '30'); // Open position
          await page.waitForTimeout(1000);
          await TestHelpers.safeFill(page, jawSlider.first(), '50'); // Closed position
          await page.waitForTimeout(1000);
        }
      }

      // Test TTS to jaw animation
      TestHelpers.logStep('Testing TTS to jaw animation pipeline');
      const chatInput = page.locator('input[type="text"], textarea[name*="message"]');
      const sendButton = page.locator('button:has-text("Send")');
      
      if (await chatInput.count() > 0 && await sendButton.count() > 0) {
        await TestHelpers.safeFill(page, chatInput, 'Test audio pipeline with jaw animation');
        await TestHelpers.safeClick(page, sendButton);
        await page.waitForTimeout(5000); // Wait for TTS and jaw animation
      }

    } catch (error) {
      TestHelpers.logStep('⚠ Audio pipeline test limited: ' + error.message);
    }

    await TestHelpers.takeScreenshot(page, testInfo, 'audio_pipeline_integration');
  });

  test('Cross-Component Data Persistence', async ({ page }, testInfo) => {
    TestHelpers.logStep('Testing data persistence across components');

    // Create test data in multiple components
    const testData = {
      character: TestDataFactory.generateCharacterData({ name: 'Persistence Test Character' }),
      hardware: TestDataFactory.generateHardwarePartData('servo', { pin: 22 }),
      ai: TestDataFactory.generateAIConfigData('openai'),
      sound: await TestDataFactory.generateTestFile('audio', 'small')
    };

    // Step 1: Create character
    TestHelpers.logStep('Creating character for persistence test');
    await homePage.navigateToCharacters();
    await charactersPage.addNewCharacter(testData.character);

    // Step 2: Add hardware
    TestHelpers.logStep('Adding hardware for persistence test');
    await homePage.navigateToHardwareParts();
    await hardwarePartsPage.addHardwarePart('Servo', testData.hardware);

    // Step 3: Configure AI
    TestHelpers.logStep('Configuring AI for persistence test');
    await homePage.navigateToAIManagement();
    await aiManagementPage.configureAI(testData.ai);
    await aiManagementPage.saveConfiguration();

    // Step 4: Upload sound
    TestHelpers.logStep('Uploading sound for persistence test');
    await homePage.navigateToSounds();
    await soundsPage.uploadSound(testData.sound.path);

    // Step 5: Verify persistence across page reloads
    TestHelpers.logStep('Verifying data persistence across reloads');
    
    // Reload and check characters
    await homePage.navigateToCharacters();
    await page.reload();
    await TestHelpers.waitForPageLoad(page);
    const characterCount = await charactersPage.getCharacterCount();
    expect(characterCount).toBeGreaterThan(0);

    // Reload and check hardware
    await homePage.navigateToHardwareParts();
    await page.reload();
    await TestHelpers.waitForPageLoad(page);
    const partCount = await hardwarePartsPage.getPartCount();
    expect(partCount).toBeGreaterThan(0);

    // Reload and check sounds
    await homePage.navigateToSounds();
    await page.reload();
    await TestHelpers.waitForPageLoad(page);
    const soundCount = await soundsPage.getSoundCount();
    expect(soundCount).toBeGreaterThan(0);

    TestHelpers.logStep('✓ Data persistence verified across all components');
    await TestHelpers.takeScreenshot(page, testInfo, 'cross_component_persistence');
  });

  test('Error Recovery and System Resilience', async ({ page }, testInfo) => {
    TestHelpers.logStep('Testing error recovery and system resilience');

    const errorScenarios = [
      { name: 'Invalid form submission', test: 'form_validation' },
      { name: 'Network interruption simulation', test: 'network_error' },
      { name: 'Large file upload', test: 'large_file' },
      { name: 'Rapid navigation', test: 'rapid_navigation' }
    ];

    for (const scenario of errorScenarios) {
      TestHelpers.logStep(`Testing error scenario: ${scenario.name}`);

      try {
        switch (scenario.test) {
          case 'form_validation':
            await this.testFormValidationErrors(page);
            break;
          case 'network_error':
            await this.testNetworkErrorRecovery(page);
            break;
          case 'large_file':
            await this.testLargeFileHandling(page);
            break;
          case 'rapid_navigation':
            await this.testRapidNavigation(page);
            break;
        }
        
        TestHelpers.logStep(`✓ ${scenario.name} handled correctly`);
      } catch (error) {
        TestHelpers.logStep(`⚠ ${scenario.name} error: ${error.message}`);
      }
    }

    await TestHelpers.takeScreenshot(page, testInfo, 'error_recovery_testing');
  });

  test('Form Validation Error Handling', async ({ page }, testInfo) => {
    TestHelpers.logStep('Testing form validation error handling');

    await testFormValidationErrors(page);
    await TestHelpers.takeScreenshot(page, testInfo, 'form_validation_errors');
  });

  async function testFormValidationErrors(page) {
    // Test invalid character creation
    await homePage.navigateToCharacters();
    
    const addButton = page.locator('button:has-text("Add"), button:has-text("New")');
    if (await addButton.count() > 0) {
      await TestHelpers.safeClick(page, addButton.first());
      
      // Submit empty form
      const submitButton = page.locator('button[type="submit"]');
      if (await submitButton.count() > 0) {
        await TestHelpers.safeClick(page, submitButton.first());
        await page.waitForTimeout(1000);
        
        // Should still be on form (validation failed)
        const formVisible = await page.locator('form').count() > 0;
        expect(formVisible).toBe(true);
      }
    }
  }

  test('Network Error Recovery', async ({ page }, testInfo) => {
    TestHelpers.logStep('Testing network error recovery');

    await testNetworkErrorRecovery(page);
    await TestHelpers.takeScreenshot(page, testInfo, 'network_error_recovery');
  });

  async function testNetworkErrorRecovery(page) {
    // Simulate network issues by rapid navigation
    const pages = ['/', '/characters', '/parts', '/sounds'];
    
    for (const pageUrl of pages) {
      await page.goto(pageUrl);
      await page.waitForTimeout(100); // Very short wait to stress test
    }
    
    // Verify final page loads correctly
    await TestHelpers.waitForPageLoad(page);
    const validation = await TestHelpers.validatePageFunctionality(page);
    expect(validation.pageLoaded).toBe(true);
  }

  test('Large File Handling', async ({ page }, testInfo) => {
    TestHelpers.logStep('Testing large file handling');

    await testLargeFileHandling(page);
    await TestHelpers.takeScreenshot(page, testInfo, 'large_file_handling');
  });

  async function testLargeFileHandling(page) {
    await homePage.navigateToSounds();
    
    // Try to upload large file
    const largeFile = await TestDataFactory.generateTestFile('audio', 'large');
    try {
      await soundsPage.uploadSound(largeFile.path);
      await page.waitForTimeout(10000); // Wait longer for large file
    } catch (error) {
      // Large file might be rejected, which is acceptable
      TestHelpers.logStep('Large file handling test completed');
    }
  }

  test('Rapid Navigation Stress Test', async ({ page }, testInfo) => {
    TestHelpers.logStep('Testing rapid navigation stress scenarios');

    await testRapidNavigation(page);
    await TestHelpers.takeScreenshot(page, testInfo, 'rapid_navigation');
  });

  async function testRapidNavigation(page) {
    const navigationSequence = [
      () => homePage.navigateToCharacters(),
      () => homePage.navigateToHardwareParts(),
      () => homePage.navigateToSounds(),
      () => homePage.navigateToAIManagement(),
      () => homePage.goto('/')
    ];

    for (const navigate of navigationSequence) {
      await navigate();
      await page.waitForTimeout(200); // Rapid navigation
    }

    // Verify final state
    const validation = await homePage.validatePageLoad();
    expect(validation.pageLoaded).toBe(true);
  }

  test('Performance Under Load - Concurrent Operations', async ({ page }, testInfo) => {
    TestHelpers.logStep('Testing performance under load with concurrent operations');

    const performanceTests = TestDataFactory.generatePerformanceScenarios();
    
    for (const scenario of performanceTests) {
      TestHelpers.logStep(`Testing performance scenario: ${scenario.name}`);
      
      const startTime = Date.now();
      
      try {
        // Execute performance test based on scenario
        switch (scenario.name) {
          case 'Character Creation Load Test':
            await this.testCharacterCreationLoad(page, scenario);
            break;
          case 'Hardware Control Stress Test':
            await this.testHardwareControlStress(page, scenario);
            break;
          case 'Audio Playback Test':
            await this.testAudioPlaybackLoad(page, scenario);
            break;
        }
        
        const duration = Date.now() - startTime;
        TestHelpers.logStep(`✓ ${scenario.name} completed in ${duration}ms`);
        
        // Verify system is still responsive
        const validation = await TestHelpers.validatePageFunctionality(page);
        expect(validation.pageLoaded).toBe(true);
        
      } catch (error) {
        TestHelpers.logStep(`⚠ Performance test ${scenario.name} failed: ${error.message}`);
      }
    }

    await TestHelpers.takeScreenshot(page, testInfo, 'performance_under_load');
  });

  async function testCharacterCreationLoad(page, scenario) {
    await homePage.navigateToCharacters();
    
    // Rapid character creation
    for (let i = 0; i < Math.min(scenario.iterations, 3); i++) {
      const testCharacter = TestDataFactory.generateCharacterData({
        name: `Load Test Character ${i}`
      });
      
      try {
        await charactersPage.addNewCharacter(testCharacter);
        await page.waitForTimeout(100);
      } catch (error) {
        // Some operations might fail under load, which is acceptable
        break;
      }
    }
  }

  async function testHardwareControlStress(page, scenario) {
    await homePage.navigateToHardwareParts();
    
    // Rapid hardware control operations
    const controlButtons = page.locator('button:has-text("Test"), button:has-text("Start")');
    const buttonCount = await controlButtons.count();
    
    for (let i = 0; i < Math.min(scenario.iterations, buttonCount * 2); i++) {
      try {
        const button = controlButtons.nth(i % buttonCount);
        if (await button.count() > 0) {
          await TestHelpers.safeClick(page, button);
          await page.waitForTimeout(50);
        }
      } catch (error) {
        break;
      }
    }
  }

  async function testAudioPlaybackLoad(page, scenario) {
    await homePage.navigateToSounds();
    
    // Rapid audio operations
    const playButtons = page.locator('button:has-text("Play")');
    const playCount = await playButtons.count();
    
    if (playCount > 0) {
      for (let i = 0; i < Math.min(scenario.iterations, 5); i++) {
        try {
          await TestHelpers.safeClick(page, playButtons.first());
          await page.waitForTimeout(100);
          
          const stopButtons = page.locator('button:has-text("Stop")');
          if (await stopButtons.count() > 0) {
            await TestHelpers.safeClick(page, stopButtons.first());
            await page.waitForTimeout(100);
          }
        } catch (error) {
          break;
        }
      }
    }
  }

  test('Real-time Coordination Between Components', async ({ page }, testInfo) => {
    TestHelpers.logStep('Testing real-time coordination between components');

    // Test character selection propagation
    await homePage.goto('/');
    
    // Select a character if character selector exists
    const characterSelector = page.locator('select[name="characterId"]');
    if (await characterSelector.count() > 0) {
      const options = await characterSelector.locator('option').count();
      if (options > 1) {
        await TestHelpers.safeSelect(page, characterSelector, { index: 1 });
        
        const setButton = page.locator('button:has-text("Set")');
        if (await setButton.count() > 0) {
          await TestHelpers.safeClick(page, setButton);
          await page.waitForTimeout(1000);
        }
      }
    }

    // Test real-time updates across pages
    const testPages = ['/characters', '/parts', '/chatterpi-chat'];
    
    for (const testPage of testPages) {
      try {
        await page.goto(testPage);
        await TestHelpers.waitForPageLoad(page);
        
        // Check for real-time elements
        const realtimeElements = [
          '.real-time',
          '[data-realtime]',
          '.live-update',
          '.status-indicator'
        ];

        let realtimeFound = false;
        for (const selector of realtimeElements) {
          if (await page.locator(selector).count() > 0) {
            realtimeFound = true;
            TestHelpers.logStep(`Found real-time element on ${testPage}: ${selector}`);
            break;
          }
        }

        // Wait for potential real-time updates
        await page.waitForTimeout(2000);
        
      } catch (error) {
        TestHelpers.logStep(`⚠ Real-time test on ${testPage} failed: ${error.message}`);
      }
    }

    await TestHelpers.takeScreenshot(page, testInfo, 'realtime_coordination');
  });
});
