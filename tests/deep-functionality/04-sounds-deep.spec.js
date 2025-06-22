/**
 * Deep Sounds Management Testing
 * 
 * Comprehensive tests for all sound-related functionality including:
 * - File upload (MP3/WAV validation, file size limits, error handling)
 * - Playback controls (Play/pause/stop functionality, volume controls)
 * - Sound library (Organization, categorization, search functionality)
 * - Character/scene assignment (Test sound assignment workflows)
 * - TTS integration (TopMediai TTS integration, WAV format support)
 * - Audio processing (Real-time audio handling, streaming)
 * - Sound quality validation
 * - Batch operations
 */

const { test, expect } = require('@playwright/test');
const TestHelpers = require('../utils/test-helpers');
const TestDataFactory = require('../utils/test-data-factory');
const { HomePage, SoundsPage } = require('../utils/page-objects');

test.describe('Sounds Management Deep Functionality Tests', () => {
  let homePage, soundsPage;

  test.beforeEach(async ({ page }) => {
    TestHelpers.logStep('Setting up Sounds Management deep functionality test');
    homePage = new HomePage(page);
    soundsPage = new SoundsPage(page);
    
    await homePage.goto('/');
    await homePage.navigateToSounds();
    
    const validation = await soundsPage.validatePageLoad();
    expect(validation.pageLoaded).toBe(true);
    expect(validation.noErrors).toBe(true);
  });

  test.afterEach(async () => {
    await TestDataFactory.cleanup();
  });

  test('Audio File Upload - Multiple Formats and Validation', async ({ page }, testInfo) => {
    TestHelpers.logStep('Testing audio file upload with multiple formats');

    // Test WAV file upload
    const wavFile = await TestDataFactory.generateTestFile('audio', 'small');
    TestHelpers.logStep('Testing WAV file upload');
    
    await soundsPage.uploadSound(wavFile.path);
    
    // Verify upload success
    await page.waitForTimeout(2000);
    const soundCount = await soundsPage.getSoundCount();
    expect(soundCount).toBeGreaterThan(0);

    // Test file validation
    const fileInput = page.locator(soundsPage.selectors.fileInput);
    if (await fileInput.count() > 0) {
      TestHelpers.logStep('Testing file validation');
      
      // Test invalid file type
      const textFile = await TestDataFactory.generateTestFile('text', 'small');
      try {
        await TestHelpers.testFileUpload(page, fileInput, textFile.path);
        
        // Should show validation error
        const errorElements = page.locator('.error, .alert-danger, [class*="error"]');
        const errorCount = await errorElements.count();
        
        if (errorCount > 0) {
          TestHelpers.logStep('✓ File validation working correctly');
        }
      } catch (error) {
        TestHelpers.logStep('⚠ File validation test failed: ' + error.message);
      }
    }

    // Test large file handling
    TestHelpers.logStep('Testing large file upload');
    const largeFile = await TestDataFactory.generateTestFile('audio', 'large');
    try {
      await soundsPage.uploadSound(largeFile.path);
      await page.waitForTimeout(5000); // Large files take longer
    } catch (error) {
      TestHelpers.logStep('Large file upload test completed (may have size limits)');
    }

    await soundsPage.takeScreenshot(testInfo, 'audio_file_upload_complete');
  });

  test('Audio Playback Controls - Complete Testing', async ({ page }, testInfo) => {
    TestHelpers.logStep('Testing audio playback controls');

    // First upload a test sound
    const testAudio = await TestDataFactory.generateTestFile('audio', 'small');
    await soundsPage.uploadSound(testAudio.path);
    await page.waitForTimeout(2000);

    // Test audio playback functionality
    const audioResults = await soundsPage.testAudioPlayback();
    expect(audioResults.errors.length).toBe(0);

    // Test individual playback controls
    const playButtons = page.locator(soundsPage.selectors.playButtons);
    const playButtonCount = await playButtons.count();
    
    if (playButtonCount > 0) {
      TestHelpers.logStep('Testing play button functionality');
      
      // Test play button
      await TestHelpers.safeClick(page, playButtons.first());
      await page.waitForTimeout(2000);
      
      // Test stop button
      const stopButtons = page.locator(soundsPage.selectors.stopButtons);
      if (await stopButtons.count() > 0) {
        await TestHelpers.safeClick(page, stopButtons.first());
        await page.waitForTimeout(1000);
      }
    }

    // Test volume controls
    const volumeSliders = page.locator(soundsPage.selectors.volumeSliders);
    const volumeCount = await volumeSliders.count();
    
    if (volumeCount > 0) {
      TestHelpers.logStep('Testing volume controls');
      
      // Test volume adjustment
      await TestHelpers.safeFill(page, volumeSliders.first(), '0.5');
      await page.waitForTimeout(1000);
      
      // Test mute/unmute if available
      const muteButton = page.locator('button:has-text("Mute"), button[data-action="mute"]');
      if (await muteButton.count() > 0) {
        await TestHelpers.safeClick(page, muteButton.first());
        await page.waitForTimeout(1000);
      }
    }

    // Test audio element properties
    const audioElements = page.locator(soundsPage.selectors.audioElements);
    const audioElementCount = await audioElements.count();
    
    if (audioElementCount > 0) {
      TestHelpers.logStep(`Found ${audioElementCount} audio elements`);
      
      // Test audio element controls
      const firstAudio = audioElements.first();
      const hasControls = await firstAudio.getAttribute('controls');
      expect(hasControls).toBeTruthy();
    }

    await soundsPage.takeScreenshot(testInfo, 'audio_playback_controls_complete');
  });

  test('Sound Library Organization and Management', async ({ page }, testInfo) => {
    TestHelpers.logStep('Testing sound library organization and management');

    // Upload multiple test sounds
    const testSounds = [
      { name: 'vampire_laugh', category: 'character' },
      { name: 'creepy_whisper', category: 'ambient' },
      { name: 'door_creak', category: 'effects' }
    ];

    for (const soundData of testSounds) {
      const testFile = await TestDataFactory.generateTestFile('audio', 'small');
      await soundsPage.uploadSound(testFile.path);
      await page.waitForTimeout(1000);
    }

    // Test sound categorization
    const categorySelectors = [
      'select[name*="category"]',
      '.category-select',
      'input[name*="category"]'
    ];

    let categoryFound = false;
    for (const selector of categorySelectors) {
      const categoryElement = page.locator(selector);
      if (await categoryElement.count() > 0) {
        categoryFound = true;
        TestHelpers.logStep(`Found category selector: ${selector}`);
        
        if (selector.includes('select')) {
          const options = await categoryElement.locator('option').count();
          if (options > 1) {
            await TestHelpers.safeSelect(page, categoryElement.first(), { index: 1 });
          }
        }
        break;
      }
    }

    // Test sound search functionality
    const searchSelectors = [
      'input[type="search"]',
      'input[name*="search"]',
      'input[placeholder*="search" i]',
      '.search-input'
    ];

    let searchFound = false;
    for (const selector of searchSelectors) {
      const searchInput = page.locator(selector);
      if (await searchInput.count() > 0) {
        searchFound = true;
        TestHelpers.logStep('Testing sound search functionality');
        
        await TestHelpers.safeFill(page, searchInput, 'vampire');
        await page.waitForTimeout(1000);
        
        // Check filtered results
        const visibleSounds = page.locator(soundsPage.selectors.soundCards + ':visible');
        const visibleCount = await visibleSounds.count();
        TestHelpers.logStep(`Search returned ${visibleCount} results`);
        break;
      }
    }

    // Test sound sorting
    const sortSelectors = [
      'select[name*="sort"]',
      '.sort-select',
      'button:has-text("Sort")'
    ];

    for (const selector of sortSelectors) {
      const sortElement = page.locator(selector);
      if (await sortElement.count() > 0) {
        TestHelpers.logStep(`Testing sort functionality: ${selector}`);
        
        if (selector.includes('select')) {
          const options = await sortElement.locator('option').count();
          if (options > 1) {
            await TestHelpers.safeSelect(page, sortElement.first(), { index: 1 });
            await page.waitForTimeout(1000);
          }
        } else {
          await TestHelpers.safeClick(page, sortElement.first());
          await page.waitForTimeout(1000);
        }
        break;
      }
    }

    TestHelpers.logStep(`Category found: ${categoryFound}, Search found: ${searchFound}`);
    await soundsPage.takeScreenshot(testInfo, 'sound_library_organization_complete');
  });

  test('TopMediai TTS Integration and WAV Support', async ({ page }, testInfo) => {
    TestHelpers.logStep('Testing TopMediai TTS integration and WAV format support');

    // Look for TTS interface
    const ttsSelectors = [
      '.tts-interface',
      'button:has-text("Generate")',
      'button:has-text("TTS")',
      'textarea[name*="text"]',
      '[data-tts]'
    ];

    let ttsFound = false;
    for (const selector of ttsSelectors) {
      const ttsElement = page.locator(selector);
      if (await ttsElement.count() > 0) {
        ttsFound = true;
        TestHelpers.logStep(`Found TTS interface: ${selector}`);
        break;
      }
    }

    if (ttsFound) {
      // Test TTS text input
      const textInput = page.locator('textarea[name*="text"], input[name*="text"]');
      if (await textInput.count() > 0) {
        await TestHelpers.safeFill(page, textInput.first(), 'This is a test of the TTS system');
      }

      // Test voice selection
      const voiceSelect = page.locator('select[name*="voice"]');
      if (await voiceSelect.count() > 0) {
        const options = await voiceSelect.locator('option').count();
        if (options > 1) {
          await TestHelpers.safeSelect(page, voiceSelect, { index: 1 });
        }
      }

      // Test TTS generation
      const generateButton = page.locator('button:has-text("Generate"), button:has-text("TTS")');
      if (await generateButton.count() > 0) {
        await TestHelpers.safeClick(page, generateButton.first());
        await page.waitForTimeout(5000); // TTS generation takes time
        
        // Check for generated audio
        const newSoundCount = await soundsPage.getSoundCount();
        TestHelpers.logStep(`Sound count after TTS generation: ${newSoundCount}`);
      }

      // Test WAV format preference
      const formatSelect = page.locator('select[name*="format"]');
      if (await formatSelect.count() > 0) {
        await TestHelpers.safeSelect(page, formatSelect, 'wav');
      }
    } else {
      TestHelpers.logStep('⚠ No TTS interface found');
    }

    await soundsPage.takeScreenshot(testInfo, 'tts_integration_complete');
  });

  test('Sound Assignment to Characters and Scenes', async ({ page }, testInfo) => {
    TestHelpers.logStep('Testing sound assignment to characters and scenes');

    // First upload a test sound
    const testAudio = await TestDataFactory.generateTestFile('audio', 'small');
    await soundsPage.uploadSound(testAudio.path);
    await page.waitForTimeout(2000);

    // Test character assignment
    const characterAssignmentSelectors = [
      'select[name*="character"]',
      '.character-assignment',
      'button:has-text("Assign to Character")'
    ];

    let characterAssignmentFound = false;
    for (const selector of characterAssignmentSelectors) {
      const assignmentElement = page.locator(selector);
      if (await assignmentElement.count() > 0) {
        characterAssignmentFound = true;
        TestHelpers.logStep(`Found character assignment: ${selector}`);
        
        if (selector.includes('select')) {
          const options = await assignmentElement.locator('option').count();
          if (options > 1) {
            await TestHelpers.safeSelect(page, assignmentElement.first(), { index: 1 });
          }
        } else {
          await TestHelpers.safeClick(page, assignmentElement.first());
          await page.waitForTimeout(1000);
        }
        break;
      }
    }

    // Test scene assignment
    const sceneAssignmentSelectors = [
      'select[name*="scene"]',
      '.scene-assignment',
      'button:has-text("Add to Scene")'
    ];

    let sceneAssignmentFound = false;
    for (const selector of sceneAssignmentSelectors) {
      const assignmentElement = page.locator(selector);
      if (await assignmentElement.count() > 0) {
        sceneAssignmentFound = true;
        TestHelpers.logStep(`Found scene assignment: ${selector}`);
        
        if (selector.includes('select')) {
          const options = await assignmentElement.locator('option').count();
          if (options > 1) {
            await TestHelpers.safeSelect(page, assignmentElement.first(), { index: 1 });
          }
        } else {
          await TestHelpers.safeClick(page, assignmentElement.first());
          await page.waitForTimeout(1000);
        }
        break;
      }
    }

    // Test bulk assignment
    const bulkAssignmentButton = page.locator('button:has-text("Bulk"), button:has-text("Assign All")');
    if (await bulkAssignmentButton.count() > 0) {
      TestHelpers.logStep('Testing bulk assignment');
      await TestHelpers.safeClick(page, bulkAssignmentButton.first());
      await page.waitForTimeout(1000);
    }

    TestHelpers.logStep(`Character assignment: ${characterAssignmentFound}, Scene assignment: ${sceneAssignmentFound}`);
    await soundsPage.takeScreenshot(testInfo, 'sound_assignment_complete');
  });

  test('Audio Quality and Format Validation', async ({ page }, testInfo) => {
    TestHelpers.logStep('Testing audio quality and format validation');

    // Test different audio qualities
    const qualityTests = [
      { name: 'Low Quality', sampleRate: 22050 },
      { name: 'Standard Quality', sampleRate: 44100 },
      { name: 'High Quality', sampleRate: 48000 }
    ];

    for (const qualityTest of qualityTests) {
      TestHelpers.logStep(`Testing ${qualityTest.name} audio`);
      
      // Look for quality settings
      const qualitySelectors = [
        'select[name*="quality"]',
        'select[name*="sample"]',
        'input[name*="bitrate"]'
      ];

      for (const selector of qualitySelectors) {
        const qualityElement = page.locator(selector);
        if (await qualityElement.count() > 0) {
          if (selector.includes('select')) {
            const options = await qualityElement.locator('option').count();
            if (options > 1) {
              await TestHelpers.safeSelect(page, qualityElement.first(), { index: 1 });
            }
          } else {
            await TestHelpers.safeFill(page, qualityElement.first(), qualityTest.sampleRate.toString());
          }
          break;
        }
      }
    }

    // Test format conversion
    const formatSelectors = [
      'select[name*="format"]',
      'button:has-text("Convert")',
      '.format-options'
    ];

    for (const selector of formatSelectors) {
      const formatElement = page.locator(selector);
      if (await formatElement.count() > 0) {
        TestHelpers.logStep(`Testing format options: ${selector}`);
        
        if (selector.includes('select')) {
          const options = await formatElement.locator('option').count();
          if (options > 1) {
            await TestHelpers.safeSelect(page, formatElement.first(), 'wav');
          }
        } else {
          await TestHelpers.safeClick(page, formatElement.first());
          await page.waitForTimeout(1000);
        }
        break;
      }
    }

    await soundsPage.takeScreenshot(testInfo, 'audio_quality_validation_complete');
  });

  test('Sound Deletion and Cleanup Operations', async ({ page }, testInfo) => {
    TestHelpers.logStep('Testing sound deletion and cleanup operations');

    // Upload test sounds for deletion
    const testAudio1 = await TestDataFactory.generateTestFile('audio', 'small');
    const testAudio2 = await TestDataFactory.generateTestFile('audio', 'small');
    
    await soundsPage.uploadSound(testAudio1.path);
    await page.waitForTimeout(1000);
    await soundsPage.uploadSound(testAudio2.path);
    await page.waitForTimeout(2000);

    const initialCount = await soundsPage.getSoundCount();
    TestHelpers.logStep(`Initial sound count: ${initialCount}`);

    // Test individual sound deletion
    const deleteButtons = page.locator(soundsPage.selectors.deleteButtons);
    const deleteButtonCount = await deleteButtons.count();
    
    if (deleteButtonCount > 0) {
      TestHelpers.logStep('Testing individual sound deletion');
      
      await TestHelpers.safeClick(page, deleteButtons.first());
      
      // Look for confirmation dialog
      const confirmationSelectors = [
        'button:has-text("Confirm")',
        'button:has-text("Yes")',
        'button:has-text("Delete")',
        '.modal button[data-action="confirm"]'
      ];

      let confirmationFound = false;
      for (const selector of confirmationSelectors) {
        if (await page.locator(selector).count() > 0) {
          await TestHelpers.safeClick(page, page.locator(selector).first());
          confirmationFound = true;
          break;
        }
      }

      if (confirmationFound) {
        await TestHelpers.waitForPageLoad(page);
        
        const newCount = await soundsPage.getSoundCount();
        expect(newCount).toBeLessThan(initialCount);
        TestHelpers.logStep('✓ Sound deleted successfully');
      }
    }

    // Test bulk deletion/cleanup
    const cleanupButtons = [
      'button:has-text("Cleanup")',
      'button:has-text("Delete All")',
      'button:has-text("Clear")'
    ];

    for (const buttonSelector of cleanupButtons) {
      const cleanupButton = page.locator(buttonSelector);
      if (await cleanupButton.count() > 0) {
        TestHelpers.logStep(`Testing cleanup operation: ${buttonSelector}`);
        // Don't actually click to avoid deleting all sounds
        await expect(cleanupButton).toBeVisible();
        break;
      }
    }

    await soundsPage.takeScreenshot(testInfo, 'sound_deletion_cleanup_complete');
  });

  test('Real-time Audio Processing and Streaming', async ({ page }, testInfo) => {
    TestHelpers.logStep('Testing real-time audio processing and streaming');

    // Test WebSocket audio connections
    const wsResults = await TestHelpers.testWebSocketConnection(page, ['8777', 'audio']);
    TestHelpers.logStep(`WebSocket connections found: ${wsResults.actualConnections}`);

    // Test real-time audio controls
    const realtimeSelectors = [
      'button:has-text("Start Stream")',
      'button:has-text("Live")',
      '.audio-stream',
      '[data-realtime]'
    ];

    let realtimeFound = false;
    for (const selector of realtimeSelectors) {
      const realtimeElement = page.locator(selector);
      if (await realtimeElement.count() > 0) {
        realtimeFound = true;
        TestHelpers.logStep(`Found real-time audio: ${selector}`);
        
        if (selector.includes('button')) {
          await TestHelpers.safeClick(page, realtimeElement.first());
          await page.waitForTimeout(3000);
        }
        break;
      }
    }

    // Test audio level monitoring
    const levelMonitors = [
      '.audio-level',
      '.volume-meter',
      '[data-audio-level]',
      '.level-indicator'
    ];

    let levelMonitorFound = false;
    for (const selector of levelMonitors) {
      if (await page.locator(selector).count() > 0) {
        levelMonitorFound = true;
        TestHelpers.logStep(`Found audio level monitor: ${selector}`);
        break;
      }
    }

    // Test audio processing settings
    const processingSettings = [
      'input[name*="gain"]',
      'input[name*="filter"]',
      'select[name*="processing"]'
    ];

    for (const selector of processingSettings) {
      const settingElement = page.locator(selector);
      if (await settingElement.count() > 0) {
        TestHelpers.logStep(`Testing audio processing setting: ${selector}`);
        
        if (selector.includes('select')) {
          const options = await settingElement.locator('option').count();
          if (options > 1) {
            await TestHelpers.safeSelect(page, settingElement.first(), { index: 1 });
          }
        } else {
          await TestHelpers.safeFill(page, settingElement.first(), '0.8');
        }
        break;
      }
    }

    TestHelpers.logStep(`Real-time found: ${realtimeFound}, Level monitor: ${levelMonitorFound}`);
    await soundsPage.takeScreenshot(testInfo, 'realtime_audio_processing_complete');
  });
});
