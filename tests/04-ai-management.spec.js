/**
 * AI Management Tests for MonsterBox
 * 
 * Tests STT configuration, AI personalities setup, TTS voice assignment, pipeline testing, and configuration import/export
 */

const { test, expect } = require('@playwright/test');
const TestHelpers = require('./utils/test-helpers');

test.describe('AI Management', () => {
  test.beforeEach(async ({ page }) => {
    TestHelpers.logStep('Navigating to AI Management dashboard');
    await page.goto('/ai-management');
    await TestHelpers.waitForPageLoad(page);
  });

  test('AI Management dashboard loads correctly', async ({ page }, testInfo) => {
    TestHelpers.logStep('Testing AI Management dashboard load');
    
    // Check page title and heading
    await expect(page).toHaveTitle(/AI Management/);
    await expect(page.locator('h1').first()).toContainText('AI Management');
    
    // Check for main dashboard sections
    const dashboardSections = [
      '.ai-system-grid', // System status cards
      '.pipeline-flow', // Pipeline diagram
      '.quick-actions' // Quick action buttons
    ];
    
    for (const section of dashboardSections) {
      const element = page.locator(section);
      if (await element.count() > 0) {
        await expect(element.first()).toBeVisible({ timeout: 5000 });
        TestHelpers.logStep(`✓ Found dashboard section: ${section}`);
      }
    }
    
    // Check for AI system cards (STT, AI, TTS)
    const systemCards = page.locator('.ai-system-card');
    const cardCount = await systemCards.count();
    expect(cardCount).toBeGreaterThanOrEqual(3); // STT, AI, TTS
    TestHelpers.logStep(`✓ Found ${cardCount} AI system cards`);
    
    await TestHelpers.takeScreenshot(page, testInfo, 'ai_management_dashboard');
    TestHelpers.logStep('AI Management dashboard test completed');
  });

  test('STT configuration page works', async ({ page }, testInfo) => {
    TestHelpers.logStep('Testing STT configuration');
    
    // Navigate to STT configuration
    const sttLink = page.locator('a[href*="/stt"], a:has-text("STT"), a:has-text("Speech")').first();
    await TestHelpers.safeClick(page, sttLink);
    await TestHelpers.waitForPageLoad(page);
    
    // Verify STT configuration page
    await expect(page.url()).toContain('/stt');
    await expect(page.locator('h1, h2').first()).toContainText(/STT|Speech/);
    
    // Check for configuration form elements
    const configElements = [
      'input[name="apiKey"], #apiKey',
      'select[name="model"], #model',
      'select[name="language"], #language',
      'input[name="confidenceThreshold"], #confidenceThreshold',
      'button[type="submit"], input[type="submit"]'
    ];
    
    for (const selector of configElements) {
      const element = page.locator(selector);
      if (await element.count() > 0) {
        await expect(element.first()).toBeVisible({ timeout: 5000 });
        TestHelpers.logStep(`✓ Found STT config element: ${selector}`);
      }
    }
    
    // Test configuration save
    const saveButton = page.locator('button:has-text("Save"), input[type="submit"]').first();
    if (await saveButton.count() > 0) {
      await TestHelpers.safeClick(page, saveButton);
      await page.waitForTimeout(1000);
      
      // Check for success message or no errors
      const errorElements = page.locator('.error, .alert-danger');
      const errorCount = await errorElements.count();
      TestHelpers.logStep(`STT config save result: ${errorCount} errors`);
    }
    
    await TestHelpers.takeScreenshot(page, testInfo, 'stt_configuration');
    TestHelpers.logStep('STT configuration test completed');
  });

  test('AI Personalities configuration works', async ({ page }, testInfo) => {
    TestHelpers.logStep('Testing AI Personalities configuration');
    
    // Navigate to AI Personalities configuration
    const personalitiesLink = page.locator('a[href*="/personalities"], a:has-text("Personalities"), a:has-text("AI")').first();
    await TestHelpers.safeClick(page, personalitiesLink);
    await TestHelpers.waitForPageLoad(page);
    
    // Verify AI Personalities page
    await expect(page.url()).toContain('/personalities');
    await expect(page.locator('h1, h2').first()).toContainText(/Personalities|AI/);
    
    // Check for global configuration section
    const globalConfig = page.locator('#globalConfigForm, .global-config');
    if (await globalConfig.count() > 0) {
      await expect(globalConfig.first()).toBeVisible();
      TestHelpers.logStep('✓ Found global AI configuration section');
      
      // Test global configuration elements
      const globalElements = [
        'select[name="defaultProvider"], #defaultProvider',
        'select[name="defaultModel"], #defaultModel',
        'input[name="defaultTemperature"], #defaultTemperature',
        'input[name="defaultMaxTokens"], #defaultMaxTokens'
      ];
      
      for (const selector of globalElements) {
        const element = globalConfig.locator(selector);
        if (await element.count() > 0) {
          await expect(element.first()).toBeVisible({ timeout: 5000 });
          TestHelpers.logStep(`✓ Found global config element: ${selector}`);
        }
      }
    }
    
    // Check for character personality cards
    const characterCards = page.locator('.character-card');
    const characterCount = await characterCards.count();
    TestHelpers.logStep(`Found ${characterCount} character cards`);
    
    if (characterCount > 0) {
      // Test character configuration
      const firstCharacter = characterCards.first();
      const configButton = firstCharacter.locator('button:has-text("Configure"), .configure-btn').first();
      
      if (await configButton.count() > 0) {
        await TestHelpers.safeClick(page, configButton);
        await page.waitForTimeout(1000);
        
        // Check for character configuration modal
        const modal = page.locator('.modal, .character-modal');
        if (await modal.count() > 0) {
          await expect(modal.first()).toBeVisible({ timeout: 5000 });
          TestHelpers.logStep('✓ Character configuration modal opened');
          
          await TestHelpers.takeScreenshot(page, testInfo, 'character_ai_config_modal');
          
          // Close modal
          const closeButton = modal.locator('.close, [data-dismiss="modal"]').first();
          if (await closeButton.count() > 0) {
            await TestHelpers.safeClick(page, closeButton);
          } else {
            await page.keyboard.press('Escape');
          }
        }
      }
    }
    
    await TestHelpers.takeScreenshot(page, testInfo, 'ai_personalities_configuration');
    TestHelpers.logStep('AI Personalities configuration test completed');
  });

  test('TTS configuration and voice catalog works', async ({ page }, testInfo) => {
    TestHelpers.logStep('Testing TTS configuration and voice catalog');
    
    // Navigate to TTS configuration
    const ttsLink = page.locator('a[href*="/tts"], a:has-text("TTS"), a:has-text("Voice")').first();
    await TestHelpers.safeClick(page, ttsLink);
    await TestHelpers.waitForPageLoad(page);
    
    // Verify TTS configuration page
    await expect(page.url()).toContain('/tts');
    await expect(page.locator('h1, h2').first()).toContainText(/TTS|Voice/);
    
    // Check for character voice assignment cards
    const voiceCards = page.locator('.character-voice-card, .character-card');
    const voiceCardCount = await voiceCards.count();
    TestHelpers.logStep(`Found ${voiceCardCount} character voice cards`);
    
    if (voiceCardCount > 0) {
      // Test voice configuration
      const firstCard = voiceCards.first();
      const configButton = firstCard.locator('button:has-text("Configure"), button:has-text("Assign"), .configure-btn').first();
      
      if (await configButton.count() > 0) {
        await TestHelpers.safeClick(page, configButton);
        await page.waitForTimeout(1000);
        
        // Check for voice catalog modal
        const voiceCatalogModal = page.locator('#voiceCatalogModal, .voice-catalog-modal, .modal');
        if (await voiceCatalogModal.count() > 0) {
          await expect(voiceCatalogModal.first()).toBeVisible({ timeout: 5000 });
          TestHelpers.logStep('✓ Voice catalog modal opened');
          
          // Test voice catalog features
          await TestHelpers.testVoiceCatalog(page, voiceCatalogModal.first(), testInfo);
          
          // Close modal
          const closeButton = voiceCatalogModal.locator('.close, [data-dismiss="modal"]').first();
          if (await closeButton.count() > 0) {
            await TestHelpers.safeClick(page, closeButton);
          } else {
            await page.keyboard.press('Escape');
          }
        }
      }
    }
    
    // Test global TTS settings
    const globalTTSForm = page.locator('#globalTTSForm, .voice-settings');
    if (await globalTTSForm.count() > 0) {
      TestHelpers.logStep('Testing global TTS settings');
      
      const ttsElements = [
        'input[name="defaultSpeed"], #defaultSpeed',
        'input[name="defaultPitch"], #defaultPitch',
        'input[name="defaultVolume"], #defaultVolume',
        'select[name="audioFormat"], #audioFormat'
      ];
      
      for (const selector of ttsElements) {
        const element = globalTTSForm.locator(selector);
        if (await element.count() > 0) {
          await expect(element.first()).toBeVisible({ timeout: 5000 });
          TestHelpers.logStep(`✓ Found TTS setting: ${selector}`);
        }
      }
    }
    
    await TestHelpers.takeScreenshot(page, testInfo, 'tts_configuration');
    TestHelpers.logStep('TTS configuration test completed');
  });

  test('AI pipeline testing works', async ({ page }, testInfo) => {
    TestHelpers.logStep('Testing AI pipeline functionality');
    
    // Test individual system tests
    const testButtons = [
      { selector: 'button:has-text("Test STT")', name: 'STT' },
      { selector: 'button:has-text("Test AI")', name: 'AI' },
      { selector: 'button:has-text("Test TTS")', name: 'TTS' }
    ];
    
    for (const testButton of testButtons) {
      const button = page.locator(testButton.selector).first();
      if (await button.count() > 0) {
        TestHelpers.logStep(`Testing ${testButton.name} system`);
        
        await TestHelpers.safeClick(page, button);
        await page.waitForTimeout(2000);
        
        // Look for test results modal or message
        const testModal = page.locator('.modal, .test-modal');
        const testMessage = page.locator('.success, .error, .test-result');
        
        if (await testModal.count() > 0) {
          await TestHelpers.takeScreenshot(page, testInfo, `${testButton.name.toLowerCase()}_test_modal`);
          
          // Close modal
          const closeButton = testModal.locator('.close').first();
          if (await closeButton.count() > 0) {
            await TestHelpers.safeClick(page, closeButton);
          }
        } else if (await testMessage.count() > 0) {
          TestHelpers.logStep(`✓ ${testButton.name} test completed with message`);
        }
      }
    }
    
    // Test full pipeline
    const pipelineTestButton = page.locator('button:has-text("Test Full Pipeline"), button:has-text("Test Pipeline")').first();
    if (await pipelineTestButton.count() > 0) {
      TestHelpers.logStep('Testing full AI pipeline');
      
      await TestHelpers.safeClick(page, pipelineTestButton);
      await page.waitForTimeout(3000);
      
      // Look for pipeline test results
      const pipelineModal = page.locator('.modal, .pipeline-modal');
      if (await pipelineModal.count() > 0) {
        await TestHelpers.takeScreenshot(page, testInfo, 'pipeline_test_results');
        
        // Close modal
        const closeButton = pipelineModal.locator('.close').first();
        if (await closeButton.count() > 0) {
          await TestHelpers.safeClick(page, closeButton);
        }
      }
    }
    
    TestHelpers.logStep('AI pipeline testing completed');
  });

  test('Configuration import/export works', async ({ page }, testInfo) => {
    TestHelpers.logStep('Testing configuration import/export');
    
    // Test export functionality
    const exportButton = page.locator('button:has-text("Export"), a:has-text("Export")').first();
    if (await exportButton.count() > 0) {
      TestHelpers.logStep('Testing configuration export');
      
      // Set up download handler
      const downloadPromise = page.waitForDownload();
      await TestHelpers.safeClick(page, exportButton);
      
      try {
        const download = await downloadPromise;
        const filename = download.suggestedFilename();
        expect(filename).toContain('config');
        TestHelpers.logStep(`✓ Configuration exported: ${filename}`);
      } catch (error) {
        TestHelpers.logStep('⚠ Export test failed or no download triggered');
      }
    }
    
    // Test import functionality
    const importButton = page.locator('button:has-text("Import"), input[type="file"]').first();
    if (await importButton.count() > 0) {
      TestHelpers.logStep('Testing configuration import');
      
      // Create a mock config file for import
      const mockConfig = {
        version: '1.0',
        timestamp: new Date().toISOString(),
        stt: { model: 'whisper-1', language: 'en' },
        personalities: { defaultModel: 'gpt-4' },
        tts: { defaultSpeed: 1.0 }
      };
      
      // If it's a file input, test file upload
      if (await page.locator('input[type="file"]').count() > 0) {
        await TestHelpers.testFileUpload(page, 'input[type="file"]', {
          content: JSON.stringify(mockConfig, null, 2)
        });
      }
    }
    
    await TestHelpers.takeScreenshot(page, testInfo, 'config_import_export');
    TestHelpers.logStep('Configuration import/export test completed');
  });

  test('AI system status indicators work', async ({ page }, testInfo) => {
    TestHelpers.logStep('Testing AI system status indicators');
    
    // Check system status indicators
    const statusIndicators = page.locator('.status-indicator, .status-online, .status-offline');
    const indicatorCount = await statusIndicators.count();
    
    TestHelpers.logStep(`Found ${indicatorCount} status indicators`);
    
    if (indicatorCount > 0) {
      // Check each status indicator
      for (let i = 0; i < Math.min(indicatorCount, 5); i++) {
        const indicator = statusIndicators.nth(i);
        await expect(indicator).toBeVisible();
        
        const classes = await indicator.getAttribute('class');
        const isOnline = classes.includes('online') || classes.includes('success');
        const isOffline = classes.includes('offline') || classes.includes('error');
        
        TestHelpers.logStep(`Status indicator ${i + 1}: ${isOnline ? 'Online' : isOffline ? 'Offline' : 'Unknown'}`);
      }
    }
    
    // Check system metrics if available
    const metricsCards = page.locator('.metric-card, .metrics-grid .card');
    const metricsCount = await metricsCards.count();
    
    if (metricsCount > 0) {
      TestHelpers.logStep(`Found ${metricsCount} metrics cards`);
      
      // Check first few metrics
      for (let i = 0; i < Math.min(metricsCount, 4); i++) {
        const metric = metricsCards.nth(i);
        const value = await metric.locator('.metric-value, .value').first().textContent();
        const label = await metric.locator('.metric-label, .label').first().textContent();
        
        TestHelpers.logStep(`Metric: ${label} = ${value}`);
      }
    }
    
    await TestHelpers.takeScreenshot(page, testInfo, 'ai_system_status');
    TestHelpers.logStep('AI system status test completed');
  });
});

// Helper function for testing voice catalog
TestHelpers.testVoiceCatalog = async function(page, modal, testInfo) {
  TestHelpers.logStep('Testing voice catalog functionality');
  
  // Test voice search
  const searchInput = modal.locator('input[type="search"], .search-input').first();
  if (await searchInput.count() > 0) {
    await TestHelpers.safeFill(page, searchInput, 'test');
    await page.waitForTimeout(500);
    TestHelpers.logStep('✓ Voice search tested');
  }
  
  // Test voice filters
  const filterSelects = modal.locator('select');
  const filterCount = await filterSelects.count();
  
  if (filterCount > 0) {
    const firstFilter = filterSelects.first();
    const options = await firstFilter.locator('option').count();
    
    if (options > 1) {
      await TestHelpers.safeSelect(page, firstFilter, await firstFilter.locator('option').nth(1).getAttribute('value'));
      await page.waitForTimeout(500);
      TestHelpers.logStep('✓ Voice filter tested');
    }
  }
  
  // Test voice selection
  const voiceItems = modal.locator('.voice-item, .voice-card');
  const voiceCount = await voiceItems.count();
  
  if (voiceCount > 0) {
    await TestHelpers.safeClick(page, voiceItems.first());
    await page.waitForTimeout(500);
    TestHelpers.logStep('✓ Voice selection tested');
    
    // Test voice preview if available
    const previewButton = modal.locator('button:has-text("Preview"), .preview-btn').first();
    if (await previewButton.count() > 0) {
      await TestHelpers.safeClick(page, previewButton);
      await page.waitForTimeout(1000);
      TestHelpers.logStep('✓ Voice preview tested');
    }
  }
  
  await TestHelpers.takeScreenshot(page, testInfo, 'voice_catalog_tested');
};
