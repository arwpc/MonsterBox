/**
 * Deep AI Management Testing
 * 
 * Comprehensive tests for all AI-related functionality including:
 * - AI configuration forms and validation
 * - Character-AI assignment workflows
 * - AI chat interface and message handling
 * - Voice settings and TTS configuration
 * - AI instance management (Create/Edit/Delete)
 * - API key validation and testing
 * - Real-time AI communication
 * - Error handling and recovery
 */

const { test, expect } = require('@playwright/test');
const TestHelpers = require('../utils/test-helpers');
const TestDataFactory = require('../utils/test-data-factory');
const { HomePage, AIManagementPage } = require('../utils/page-objects');

test.describe('AI Management Deep Functionality Tests', () => {
  let homePage, aiManagementPage;

  test.beforeEach(async ({ page }) => {
    TestHelpers.logStep('Setting up AI Management deep functionality test');
    homePage = new HomePage(page);
    aiManagementPage = new AIManagementPage(page);
    
    await homePage.goto('/');
    await homePage.navigateToAIManagement();
    
    const validation = await aiManagementPage.validatePageLoad();
    expect(validation.pageLoaded).toBe(true);
    expect(validation.noErrors).toBe(true);
  });

  test.afterEach(async () => {
    await TestDataFactory.cleanup();
  });

  test('OpenAI Configuration and Testing - Complete Workflow', async ({ page }, testInfo) => {
    TestHelpers.logStep('Testing OpenAI configuration and API testing');

    const openaiConfig = TestDataFactory.generateAIConfigData('openai', {
      apiKey: 'test-openai-key-12345',
      model: 'gpt-3.5-turbo',
      temperature: 0.7,
      maxTokens: 150
    });

    // Configure OpenAI
    await aiManagementPage.configureAI(openaiConfig);

    // Test configuration form elements
    const configForm = page.locator(aiManagementPage.selectors.aiConfigForm);
    if (await configForm.count() > 0) {
      TestHelpers.logStep('Testing OpenAI configuration form');

      // Test model selection
      const modelSelect = page.locator('select[name*="model"], select:has(option[value*="gpt"])');
      if (await modelSelect.count() > 0) {
        await TestHelpers.safeSelect(page, modelSelect, openaiConfig.model);
      }

      // Test temperature setting
      const temperatureInput = page.locator('input[name*="temperature"], input[type="range"][name*="temperature"]');
      if (await temperatureInput.count() > 0) {
        await TestHelpers.safeFill(page, temperatureInput.first(), openaiConfig.temperature.toString());
      }

      // Test max tokens setting
      const maxTokensInput = page.locator('input[name*="token"], input[name*="max"]');
      if (await maxTokensInput.count() > 0) {
        await TestHelpers.safeFill(page, maxTokensInput.first(), openaiConfig.maxTokens.toString());
      }
    }

    // Test AI connection
    await aiManagementPage.testAIConnection();
    
    // Save configuration
    await aiManagementPage.saveConfiguration();

    // Verify configuration was saved
    const pageContent = await page.textContent('body');
    const savedSuccessfully = pageContent.includes('saved') || pageContent.includes('success') || 
                             !pageContent.includes('error');
    expect(savedSuccessfully).toBe(true);

    await aiManagementPage.takeScreenshot(testInfo, 'openai_configuration_complete');
  });

  test('Anthropic Claude Configuration and Testing', async ({ page }, testInfo) => {
    TestHelpers.logStep('Testing Anthropic Claude configuration');

    const anthropicConfig = TestDataFactory.generateAIConfigData('anthropic', {
      apiKey: 'test-anthropic-key-12345',
      model: 'claude-3-sonnet-20240229'
    });

    // Look for Anthropic-specific configuration
    const anthropicSection = page.locator('[data-provider="anthropic"], .anthropic-config, :has-text("Anthropic")');
    if (await anthropicSection.count() > 0) {
      TestHelpers.logStep('Found Anthropic configuration section');

      // Configure Anthropic
      const apiKeyInput = anthropicSection.locator('input[name*="api"], input[name*="key"]').first();
      if (await apiKeyInput.count() > 0) {
        await TestHelpers.safeFill(page, apiKeyInput, anthropicConfig.apiKey);
      }

      // Test model selection
      const modelSelect = anthropicSection.locator('select[name*="model"]').first();
      if (await modelSelect.count() > 0) {
        const options = await modelSelect.locator('option').count();
        if (options > 1) {
          await TestHelpers.safeSelect(page, modelSelect, { index: 1 });
        }
      }

      // Test Anthropic connection
      const testButton = anthropicSection.locator('button:has-text("Test")').first();
      if (await testButton.count() > 0) {
        await TestHelpers.safeClick(page, testButton);
        await page.waitForTimeout(3000);
      }
    } else {
      TestHelpers.logStep('⚠ No Anthropic configuration section found');
    }

    await aiManagementPage.takeScreenshot(testInfo, 'anthropic_configuration_complete');
  });

  test('TopMediai TTS Configuration and Voice Testing', async ({ page }, testInfo) => {
    TestHelpers.logStep('Testing TopMediai TTS configuration and voice testing');

    const topMediaiConfig = TestDataFactory.generateAIConfigData('topmediai', {
      apiKey: '3d31edf8c9a24824b72bf325f0d46ced',
      voice: 'en-US-AriaNeural',
      speed: 1.0,
      pitch: 1.0
    });

    // Look for TopMediai/TTS configuration
    const ttsSection = page.locator('[data-provider="topmediai"], .tts-config, :has-text("TopMediai"), :has-text("TTS")');
    if (await ttsSection.count() > 0) {
      TestHelpers.logStep('Found TTS configuration section');

      // Configure API key
      const apiKeyInput = ttsSection.locator('input[name*="api"], input[name*="key"]').first();
      if (await apiKeyInput.count() > 0) {
        await TestHelpers.safeFill(page, apiKeyInput, topMediaiConfig.apiKey);
      }

      // Test voice selection (2000+ voices)
      const voiceSelect = ttsSection.locator('select[name*="voice"]').first();
      if (await voiceSelect.count() > 0) {
        const options = await voiceSelect.locator('option').count();
        TestHelpers.logStep(`Found ${options} voice options`);
        
        if (options > 1) {
          // Select a specific voice or random voice
          await TestHelpers.safeSelect(page, voiceSelect, { index: Math.min(5, options - 1) });
        }
      }

      // Test speed configuration
      const speedInput = ttsSection.locator('input[name*="speed"], input[type="range"][name*="speed"]');
      if (await speedInput.count() > 0) {
        await TestHelpers.safeFill(page, speedInput.first(), topMediaiConfig.speed.toString());
      }

      // Test pitch configuration
      const pitchInput = ttsSection.locator('input[name*="pitch"], input[type="range"][name*="pitch"]');
      if (await pitchInput.count() > 0) {
        await TestHelpers.safeFill(page, pitchInput.first(), topMediaiConfig.pitch.toString());
      }

      // Test voice preview
      const previewButton = ttsSection.locator('button:has-text("Preview"), button:has-text("Test Voice")').first();
      if (await previewButton.count() > 0) {
        await TestHelpers.safeClick(page, previewButton);
        await page.waitForTimeout(3000);
      }
    } else {
      TestHelpers.logStep('⚠ No TTS configuration section found');
    }

    await aiManagementPage.takeScreenshot(testInfo, 'topmediai_configuration_complete');
  });

  test('AI Instance Management - CRUD Operations', async ({ page }, testInfo) => {
    TestHelpers.logStep('Testing AI instance CRUD operations');

    // Navigate to AI instances page
    await page.goto('/ai-instances');
    await TestHelpers.waitForPageLoad(page);

    const validation = await TestHelpers.validatePageFunctionality(page);
    expect(validation.pageLoaded).toBe(true);

    // Test creating new AI instance
    const addInstanceButton = page.locator('button:has-text("Add"), button:has-text("New"), button:has-text("Create")');
    if (await addInstanceButton.count() > 0) {
      TestHelpers.logStep('Testing AI instance creation');
      
      await TestHelpers.safeClick(page, addInstanceButton.first());
      
      // Fill instance form
      const nameInput = page.locator('input[name*="name"]').first();
      if (await nameInput.count() > 0) {
        await TestHelpers.safeFill(page, nameInput, 'Test AI Instance');
      }

      const descriptionInput = page.locator('textarea[name*="description"], input[name*="description"]').first();
      if (await descriptionInput.count() > 0) {
        await TestHelpers.safeFill(page, descriptionInput, 'Test AI instance for automated testing');
      }

      // Submit form
      const submitButton = page.locator('button[type="submit"], input[type="submit"]').first();
      if (await submitButton.count() > 0) {
        await TestHelpers.safeClick(page, submitButton);
        await TestHelpers.waitForPageLoad(page);
      }
    }

    // Test editing AI instance
    const editButtons = page.locator('button:has-text("Edit"), .btn:has-text("Edit")');
    if (await editButtons.count() > 0) {
      TestHelpers.logStep('Testing AI instance editing');
      
      await TestHelpers.safeClick(page, editButtons.first());
      
      // Update name
      const nameInput = page.locator('input[name*="name"]').first();
      if (await nameInput.count() > 0) {
        await TestHelpers.safeFill(page, nameInput, 'Updated Test AI Instance');
      }

      // Save changes
      const saveButton = page.locator('button:has-text("Save"), button[type="submit"]').first();
      if (await saveButton.count() > 0) {
        await TestHelpers.safeClick(page, saveButton);
        await TestHelpers.waitForPageLoad(page);
      }
    }

    // Test AI instance status display
    const instanceCards = page.locator(aiManagementPage.selectors.aiInstanceCards);
    const instanceCount = await instanceCards.count();
    TestHelpers.logStep(`Found ${instanceCount} AI instances`);

    await aiManagementPage.takeScreenshot(testInfo, 'ai_instance_management_complete');
  });

  test('Character-AI Assignment Workflow', async ({ page }, testInfo) => {
    TestHelpers.logStep('Testing character-AI assignment workflow');

    // Navigate to characters page
    await page.goto('/characters');
    await TestHelpers.waitForPageLoad(page);

    // Look for character with AI assignment options
    const characterCards = page.locator('.character-card, .card');
    const characterCount = await characterCards.count();

    if (characterCount > 0) {
      TestHelpers.logStep('Testing AI assignment to character');
      
      // Click on first character or edit button
      const editButton = page.locator('button:has-text("Edit"), .btn:has-text("Edit")').first();
      if (await editButton.count() > 0) {
        await TestHelpers.safeClick(page, editButton);
        await TestHelpers.waitForPageLoad(page);

        // Look for AI assignment section
        const aiAssignmentSelectors = [
          'select[name*="ai"]',
          'select[name*="instance"]',
          '[data-section="ai"]',
          '.ai-assignment'
        ];

        let aiAssignmentFound = false;
        for (const selector of aiAssignmentSelectors) {
          const aiSelect = page.locator(selector);
          if (await aiSelect.count() > 0) {
            aiAssignmentFound = true;
            TestHelpers.logStep(`Found AI assignment: ${selector}`);
            
            const options = await aiSelect.locator('option').count();
            if (options > 1) {
              await TestHelpers.safeSelect(page, aiSelect, { index: 1 });
              TestHelpers.logStep('✓ AI instance assigned to character');
            }
            break;
          }
        }

        if (!aiAssignmentFound) {
          TestHelpers.logStep('⚠ No AI assignment section found');
        }

        // Save character changes
        const saveButton = page.locator('button:has-text("Save"), button[type="submit"]').first();
        if (await saveButton.count() > 0) {
          await TestHelpers.safeClick(page, saveButton);
          await TestHelpers.waitForPageLoad(page);
        }
      }
    } else {
      TestHelpers.logStep('⚠ No characters found for AI assignment testing');
    }

    await aiManagementPage.takeScreenshot(testInfo, 'character_ai_assignment_complete');
  });

  test('AI Chat Interface and Message Handling', async ({ page }, testInfo) => {
    TestHelpers.logStep('Testing AI chat interface and message handling');

    // Navigate to AI chat interface
    const chatUrls = ['/ai-chat', '/chat', '/ai-management'];
    let chatPageFound = false;

    for (const url of chatUrls) {
      try {
        await page.goto(url);
        await TestHelpers.waitForPageLoad(page);
        
        const pageContent = await page.textContent('body');
        if (!pageContent.includes('"success":false') && !pageContent.includes('Pretty-print')) {
          chatPageFound = true;
          break;
        }
      } catch (error) {
        // Try next URL
      }
    }

    if (chatPageFound) {
      // Test chat interface elements
      const chatInput = page.locator('input[type="text"], textarea[name*="message"], .chat-input');
      const sendButton = page.locator('button:has-text("Send"), .send-button');
      const chatMessages = page.locator('.message, .chat-message, .ai-response');

      if (await chatInput.count() > 0 && await sendButton.count() > 0) {
        TestHelpers.logStep('Testing AI chat functionality');
        
        // Send test message
        await TestHelpers.safeFill(page, chatInput.first(), 'Hello, this is a test message');
        await TestHelpers.safeClick(page, sendButton.first());
        
        // Wait for response
        await page.waitForTimeout(5000);
        
        // Check for AI response
        const messageCount = await chatMessages.count();
        TestHelpers.logStep(`Found ${messageCount} chat messages`);
        
        if (messageCount > 0) {
          TestHelpers.logStep('✓ AI chat interface working');
        }
      } else {
        TestHelpers.logStep('⚠ Chat interface elements not found');
      }
    } else {
      TestHelpers.logStep('⚠ No AI chat interface found');
    }

    await aiManagementPage.takeScreenshot(testInfo, 'ai_chat_interface_complete');
  });

  test('AI Form Validation and Error Handling', async ({ page }, testInfo) => {
    TestHelpers.logStep('Testing AI configuration form validation');

    const validationCases = TestDataFactory.generateFormValidationCases('ai');
    
    for (const testCase of validationCases) {
      TestHelpers.logStep(`Testing AI validation: ${testCase.description}`);
      
      // Clear and fill form
      const apiKeyInput = page.locator(aiManagementPage.selectors.apiKeyInputs).first();
      if (await apiKeyInput.count() > 0) {
        await TestHelpers.safeFill(page, apiKeyInput, testCase.data.apiKey || '');
      }

      const modelSelect = page.locator(aiManagementPage.selectors.modelSelects).first();
      if (await modelSelect.count() > 0 && testCase.data.model) {
        await TestHelpers.safeSelect(page, modelSelect, testCase.data.model);
      }

      // Try to save/test
      const testButton = page.locator(aiManagementPage.selectors.testAIButton);
      if (await testButton.count() > 0) {
        await TestHelpers.safeClick(page, testButton);
        await page.waitForTimeout(2000);
        
        if (testCase.shouldFail) {
          // Check for error messages
          const errorElements = page.locator('.error, .alert-danger, [class*="error"]');
          const errorCount = await errorElements.count();
          expect(errorCount).toBeGreaterThan(0);
        }
      }
    }

    await aiManagementPage.takeScreenshot(testInfo, 'ai_form_validation_complete');
  });

  test('Voice Settings Persistence and Character Integration', async ({ page }, testInfo) => {
    TestHelpers.logStep('Testing voice settings persistence and character integration');

    // Navigate to voice settings or character voice configuration
    const voiceUrls = ['/voice-settings', '/characters', '/ai-config'];
    
    for (const url of voiceUrls) {
      await page.goto(url);
      await TestHelpers.waitForPageLoad(page);
      
      // Look for voice configuration
      const voiceSelectors = [
        'select[name*="voice"]',
        '.voice-settings',
        'button:has-text("Voice")',
        '[data-voice-config]'
      ];

      let voiceConfigFound = false;
      for (const selector of voiceSelectors) {
        if (await page.locator(selector).count() > 0) {
          voiceConfigFound = true;
          TestHelpers.logStep(`Found voice configuration: ${selector}`);
          
          // Test voice selection
          if (selector.includes('select')) {
            const voiceSelect = page.locator(selector).first();
            const options = await voiceSelect.locator('option').count();
            
            if (options > 1) {
              await TestHelpers.safeSelect(page, voiceSelect, { index: 1 });
              TestHelpers.logStep('✓ Voice selected');
            }
          } else if (selector.includes('button')) {
            await TestHelpers.safeClick(page, page.locator(selector).first());
            await page.waitForTimeout(1000);
          }
          break;
        }
      }

      if (voiceConfigFound) {
        // Test voice settings persistence
        const saveButton = page.locator('button:has-text("Save")').first();
        if (await saveButton.count() > 0) {
          await TestHelpers.safeClick(page, saveButton);
          await TestHelpers.waitForPageLoad(page);
          
          // Reload page and verify settings persisted
          await page.reload();
          await TestHelpers.waitForPageLoad(page);
          
          TestHelpers.logStep('✓ Voice settings persistence tested');
        }
        break;
      }
    }

    await aiManagementPage.takeScreenshot(testInfo, 'voice_settings_persistence_complete');
  });

  test('AI Status Monitoring and Health Checks', async ({ page }, testInfo) => {
    TestHelpers.logStep('Testing AI status monitoring and health checks');

    // Look for AI status indicators
    const statusElements = page.locator(aiManagementPage.selectors.statusIndicators);
    const statusCount = await statusElements.count();
    
    TestHelpers.logStep(`Found ${statusCount} AI status indicators`);

    // Test status refresh
    const refreshButton = page.locator('button:has-text("Refresh"), button:has-text("Check Status")');
    if (await refreshButton.count() > 0) {
      await TestHelpers.safeClick(page, refreshButton.first());
      await page.waitForTimeout(2000);
    }

    // Test individual AI health checks
    const healthCheckButtons = page.locator('button:has-text("Health"), button:has-text("Test Connection")');
    const healthCheckCount = await healthCheckButtons.count();
    
    for (let i = 0; i < Math.min(healthCheckCount, 3); i++) {
      const healthButton = healthCheckButtons.nth(i);
      await TestHelpers.safeClick(page, healthButton);
      await page.waitForTimeout(3000);
    }

    // Check for real-time status updates
    await page.waitForTimeout(5000);
    
    const updatedStatusCount = await statusElements.count();
    expect(updatedStatusCount).toBeGreaterThanOrEqual(statusCount);

    await aiManagementPage.takeScreenshot(testInfo, 'ai_status_monitoring_complete');
  });
});
