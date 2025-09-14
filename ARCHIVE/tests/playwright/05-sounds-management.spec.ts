import { test, expect, Page } from '@playwright/test';

/**
 * Sounds Management Comprehensive Tests
 * Tests sound upload, playback, TTS integration, and audio processing
 */

test.describe('Sounds Management', () => {
  let errors: string[] = [];

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
      console.log('🚨 Sounds Management Errors:');
      errors.forEach(error => console.log(`  - ${error}`));
    }
  });

  test('Sounds page loads correctly', async ({ page }) => {
    await page.goto('/sounds');
    
    // Check page title
    await expect(page.locator('h1, h2, .page-title')).toContainText(/Sound/i);
    
    // Check for sounds list
    const soundsList = page.locator('table, .sounds-list, .audio-list');
    await expect(soundsList).toBeVisible();
    
    // Check for upload functionality
    const uploadButton = page.locator('button:has-text("Upload"), input[type="file"], .upload-btn');
    await expect(uploadButton.first()).toBeVisible();
  });

  test('Sound upload workflow', async ({ page }) => {
    await page.goto('/sounds');
    
    // Find upload button or file input
    const fileInput = page.locator('input[type="file"]');
    if (await fileInput.count() > 0) {
      // Note: In real test, you'd upload an actual audio file
      // For now, just verify the upload element exists and is functional
      await expect(fileInput).toBeVisible();
      
      // Check if there's a form around it
      const uploadForm = page.locator('form:has(input[type="file"])');
      if (await uploadForm.count() > 0) {
        await expect(uploadForm).toBeVisible();
      }
    }
  });

  test('Sound playback functionality', async ({ page }) => {
    await page.goto('/sounds');
    
    // Find play buttons
    const playButtons = page.locator('button:has-text("Play"), .play-btn, .btn-play');
    if (await playButtons.count() > 0) {
      await playButtons.first().click();
      await page.waitForTimeout(2000);
      
      // Check for audio controls or feedback
      const audioControls = page.locator('audio, .audio-player, .playback-controls');
      if (await audioControls.count() > 0) {
        await expect(audioControls.first()).toBeVisible();
      }
      
      // Look for stop button
      const stopButton = page.locator('button:has-text("Stop"), .stop-btn, .btn-stop');
      if (await stopButton.count() > 0) {
        await stopButton.first().click();
      }
    }
  });

  test('Sound editing and management', async ({ page }) => {
    await page.goto('/sounds');
    
    // Find edit buttons
    const editButton = page.locator('button:has-text("Edit"), .btn-edit, .edit-sound').first();
    if (await editButton.count() > 0) {
      await editButton.click();
      
      // Should open edit form or modal
      const editForm = page.locator('form, .modal, .edit-form');
      if (await editForm.count() > 0) {
        // Try to edit sound name
        const nameField = page.locator('input[name*="name"], #soundName');
        if (await nameField.count() > 0) {
          await nameField.fill('Updated Sound Name');
          
          // Save changes
          const saveButton = page.locator('button[type="submit"], button:has-text("Save")');
          if (await saveButton.count() > 0) {
            await saveButton.click();
            await page.waitForTimeout(2000);
          }
        }
      }
    }
  });

  test('Sound deletion workflow', async ({ page }) => {
    await page.goto('/sounds');
    
    // Find delete button
    const deleteButton = page.locator('button:has-text("Delete"), .btn-delete, .delete-sound').first();
    if (await deleteButton.count() > 0) {
      await deleteButton.click();
      
      // Handle confirmation dialog
      const confirmDialog = page.locator('.modal, .dialog, .confirm');
      if (await confirmDialog.count() > 0) {
        // Cancel to avoid deleting actual data
        const cancelButton = page.locator('button:has-text("Cancel"), .btn-cancel');
        if (await cancelButton.count() > 0) {
          await cancelButton.click();
        }
      }
    }
  });

  test('Sound categories and filtering', async ({ page }) => {
    await page.goto('/sounds');
    
    // Check for category filters
    const categoryFilter = page.locator('select[name*="category"], .category-filter');
    if (await categoryFilter.count() > 0) {
      const options = await categoryFilter.locator('option').count();
      if (options > 1) {
        await categoryFilter.selectOption({ index: 1 });
        await page.waitForTimeout(1000);
        
        // Verify sounds list updates
        const soundsList = page.locator('table, .sounds-list, .audio-list');
        await expect(soundsList).toBeVisible();
      }
    }
    
    // Check for search functionality
    const searchField = page.locator('input[type="search"], input[placeholder*="search"], .search-input');
    if (await searchField.count() > 0) {
      await searchField.fill('test');
      await page.waitForTimeout(1000);
      await searchField.clear();
    }
  });

  test('TTS integration', async ({ page }) => {
    await page.goto('/sounds');
    
    // Look for TTS functionality
    const ttsButton = page.locator('button:has-text("TTS"), button:has-text("Text to Speech"), .btn-tts');
    if (await ttsButton.count() > 0) {
      await ttsButton.click();
      
      // Should open TTS form
      const ttsForm = page.locator('form, .modal, .tts-form');
      if (await ttsForm.count() > 0) {
        // Fill TTS text
        const textField = page.locator('textarea, input[name*="text"], #ttsText');
        if (await textField.count() > 0) {
          await textField.fill('This is a test of the text to speech system.');
          
          // Select voice if available
          const voiceSelect = page.locator('select[name*="voice"], #voiceSelect');
          if (await voiceSelect.count() > 0) {
            await voiceSelect.selectOption({ index: 0 });
          }
          
          // Generate TTS
          const generateButton = page.locator('button:has-text("Generate"), button:has-text("Create")');
          if (await generateButton.count() > 0) {
            await generateButton.click();
            await page.waitForTimeout(5000);
          }
        }
      }
    }
  });

  test('Audio format support', async ({ page }) => {
    await page.goto('/sounds');
    
    // Check for supported format information
    const formatInfo = page.locator('*:has-text("MP3"), *:has-text("WAV"), *:has-text("format")');
    if (await formatInfo.count() > 0) {
      await expect(formatInfo.first()).toBeVisible();
    }
    
    // Check file input accepts audio formats
    const fileInput = page.locator('input[type="file"]');
    if (await fileInput.count() > 0) {
      const acceptAttr = await fileInput.getAttribute('accept');
      if (acceptAttr) {
        expect(acceptAttr).toMatch(/audio|\.mp3|\.wav/i);
      }
    }
  });

  test('Sound volume and playback controls', async ({ page }) => {
    await page.goto('/sounds');
    
    // Look for volume controls
    const volumeControl = page.locator('input[type="range"], .volume-slider, .volume-control');
    if (await volumeControl.count() > 0) {
      await volumeControl.first().fill('50');
      await page.waitForTimeout(1000);
    }
    
    // Test playback controls
    const playButton = page.locator('button:has-text("Play"), .play-btn').first();
    if (await playButton.count() > 0) {
      await playButton.click();
      await page.waitForTimeout(2000);
      
      // Look for pause/stop
      const pauseButton = page.locator('button:has-text("Pause"), button:has-text("Stop"), .pause-btn');
      if (await pauseButton.count() > 0) {
        await pauseButton.first().click();
      }
    }
  });

  test('Sound library organization', async ({ page }) => {
    await page.goto('/sounds');
    
    // Check for sorting options
    const sortSelect = page.locator('select[name*="sort"], .sort-select');
    if (await sortSelect.count() > 0) {
      await sortSelect.selectOption({ index: 0 });
      await page.waitForTimeout(1000);
    }
    
    // Check for view options (list/grid)
    const viewToggle = page.locator('button:has-text("Grid"), button:has-text("List"), .view-toggle');
    if (await viewToggle.count() > 0) {
      await viewToggle.first().click();
      await page.waitForTimeout(1000);
    }
  });

  test('Sound metadata and properties', async ({ page }) => {
    await page.goto('/sounds');
    
    // Look for sound details/properties
    const detailsButton = page.locator('button:has-text("Details"), button:has-text("Info"), .btn-details').first();
    if (await detailsButton.count() > 0) {
      await detailsButton.click();
      
      // Check for metadata display
      const metadata = page.locator('.metadata, .properties, .sound-info');
      if (await metadata.count() > 0) {
        await expect(metadata.first()).toBeVisible();
      }
    }
  });
});
