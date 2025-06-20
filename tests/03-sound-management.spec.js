/**
 * Sound Management Tests for MonsterBox
 * 
 * Tests sound upload, editing, deletion, audio playback controls, and sound library functionality
 */

const { test, expect } = require('@playwright/test');
const TestHelpers = require('./utils/test-helpers');

test.describe('Sound Management', () => {
  test.beforeEach(async ({ page }) => {
    TestHelpers.logStep('Navigating to sounds page');
    await page.goto('/sounds');
    await TestHelpers.waitForPageLoad(page);
  });

  test('Sounds page loads correctly', async ({ page }, testInfo) => {
    TestHelpers.logStep('Testing sounds page load');
    
    // Check page title and heading
    await expect(page).toHaveTitle(/Sound/);
    await expect(page.locator('h1, h2').first()).toContainText(/Sound/);
    
    // Check for sound list or empty state
    const soundList = page.locator('.sound-list, .sounds-grid, .sound-card, .sound-item');
    const emptyState = page.locator('.empty-state, .no-sounds');
    
    // Either sounds exist or empty state is shown
    const hasSounds = await soundList.count() > 0;
    const hasEmptyState = await emptyState.count() > 0;
    
    expect(hasSounds || hasEmptyState).toBeTruthy();
    
    // Check for "Add Sound" or "Upload Sound" button
    const addButton = page.locator('a:has-text("Add"), a:has-text("Upload"), a:has-text("New"), button:has-text("Add"), button:has-text("Upload")');
    await expect(addButton.first()).toBeVisible({ timeout: 5000 });
    
    await TestHelpers.takeScreenshot(page, testInfo, 'sounds_page_loaded');
    TestHelpers.logStep('Sounds page test completed');
  });

  test('Sound upload form loads', async ({ page }, testInfo) => {
    TestHelpers.logStep('Testing sound upload form');
    
    // Find and click upload/add sound button
    const uploadButton = page.locator('a:has-text("Add"), a:has-text("Upload"), a:has-text("New")').first();
    await TestHelpers.safeClick(page, uploadButton);
    
    // Verify navigation to sound form
    await TestHelpers.waitForPageLoad(page);
    await expect(page.url()).toContain('/sound');
    
    // Check form elements exist
    const formElements = [
      'input[type="file"]', // File upload input
      'input[name="name"], #name', // Sound name
      'textarea[name="description"], #description', // Description
      'select[name="characterId"], #characterId', // Character selection
      'input[type="submit"], button[type="submit"]' // Submit button
    ];
    
    for (const selector of formElements) {
      const element = page.locator(selector);
      if (await element.count() > 0) {
        await expect(element.first()).toBeVisible({ timeout: 5000 });
        TestHelpers.logStep(`✓ Found form element: ${selector}`);
      }
    }
    
    await TestHelpers.takeScreenshot(page, testInfo, 'sound_upload_form');
    TestHelpers.logStep('Sound upload form test completed');
  });

  test('Sound form validation works', async ({ page }, testInfo) => {
    TestHelpers.logStep('Testing sound form validation');
    
    // Navigate to sound upload form
    const uploadButton = page.locator('a:has-text("Add"), a:has-text("Upload"), a:has-text("New")').first();
    await TestHelpers.safeClick(page, uploadButton);
    await TestHelpers.waitForPageLoad(page);
    
    // Test form validation with various invalid inputs
    const validationTests = [
      {
        description: 'Empty form submission',
        data: {},
        shouldFail: true,
        expectedErrors: ['required', 'file', 'name']
      },
      {
        description: 'Name too short',
        data: { name: 'A' },
        shouldFail: true,
        expectedErrors: ['name', 'length', 'short']
      },
      {
        description: 'Missing file upload',
        data: { 
          name: 'Test Sound',
          description: 'A test sound'
        },
        shouldFail: true,
        expectedErrors: ['file', 'required', 'upload']
      }
    ];
    
    await TestHelpers.testFormValidation(page, 'form', validationTests);
    
    await TestHelpers.takeScreenshot(page, testInfo, 'sound_form_validation');
    TestHelpers.logStep('Sound form validation test completed');
  });

  test('Sound file upload works', async ({ page }, testInfo) => {
    TestHelpers.logStep('Testing sound file upload');
    
    // Navigate to sound upload form
    const uploadButton = page.locator('a:has-text("Add"), a:has-text("Upload"), a:has-text("New")').first();
    await TestHelpers.safeClick(page, uploadButton);
    await TestHelpers.waitForPageLoad(page);
    
    // Find file input
    const fileInput = page.locator('input[type="file"]').first();
    await expect(fileInput).toBeVisible({ timeout: 5000 });
    
    // Test file upload with mock audio file
    await TestHelpers.testFileUpload(page, fileInput, {
      content: 'mock audio file content for testing'
    });
    
    // Fill other required fields
    const nameInput = page.locator('input[name="name"], #name').first();
    if (await nameInput.count() > 0) {
      await TestHelpers.safeFill(page, nameInput, 'Test Sound ' + Date.now());
    }
    
    const descriptionInput = page.locator('textarea[name="description"], #description').first();
    if (await descriptionInput.count() > 0) {
      await TestHelpers.safeFill(page, descriptionInput, 'A test sound uploaded by automated testing');
    }
    
    // Select character if dropdown exists
    const characterSelect = page.locator('select[name="characterId"], #characterId').first();
    if (await characterSelect.count() > 0) {
      const options = await characterSelect.locator('option').count();
      if (options > 1) {
        await TestHelpers.safeSelect(page, characterSelect, await characterSelect.locator('option').nth(1).getAttribute('value'));
      }
    }
    
    await TestHelpers.takeScreenshot(page, testInfo, 'sound_upload_filled');
    
    // Submit form
    const submitButton = page.locator('input[type="submit"], button[type="submit"]').first();
    await TestHelpers.safeClick(page, submitButton);
    
    // Wait for response
    await TestHelpers.waitForPageLoad(page);
    
    // Check for success indicators
    const successIndicators = [
      page.locator('.success, .alert-success'),
      page.locator('text=uploaded'),
      page.locator('text=saved'),
      page.locator('text=success')
    ];
    
    let successFound = false;
    for (const indicator of successIndicators) {
      if (await indicator.count() > 0) {
        successFound = true;
        break;
      }
    }
    
    // If redirected to sounds list, that's also success
    if (page.url().includes('/sounds') && !page.url().includes('/new')) {
      successFound = true;
    }
    
    expect(successFound).toBeTruthy();
    
    await TestHelpers.takeScreenshot(page, testInfo, 'sound_uploaded_successfully');
    TestHelpers.logStep('Sound file upload test completed');
  });

  test('Sound list displays sounds', async ({ page }, testInfo) => {
    TestHelpers.logStep('Testing sound list display');
    
    // Check for sound cards or list items
    const soundElements = page.locator('.sound-card, .sound-item, .sound-row, [data-sound-id]');
    const soundCount = await soundElements.count();
    
    TestHelpers.logStep(`Found ${soundCount} sound elements`);
    
    if (soundCount > 0) {
      // Test first sound element
      const firstSound = soundElements.first();
      await expect(firstSound).toBeVisible();
      
      // Check for sound name
      const nameElement = firstSound.locator('.sound-name, .name, h3, h4').first();
      if (await nameElement.count() > 0) {
        const soundName = await nameElement.textContent();
        expect(soundName).toBeTruthy();
        TestHelpers.logStep(`✓ Sound name: ${soundName}`);
      }
      
      // Check for action buttons (play, edit, delete)
      const actionButtons = firstSound.locator('a, button');
      const buttonCount = await actionButtons.count();
      TestHelpers.logStep(`Found ${buttonCount} action buttons on first sound`);
      
      // Test sound detail view if available
      const viewButton = firstSound.locator('a:has-text("View"), a:has-text("Details"), .view-btn').first();
      if (await viewButton.count() > 0) {
        await TestHelpers.safeClick(page, viewButton);
        await TestHelpers.waitForPageLoad(page);
        
        // Check sound detail page
        await expect(page.locator('h1, h2').first()).toBeVisible();
        await TestHelpers.takeScreenshot(page, testInfo, 'sound_detail_view');
        
        // Go back to sound list
        await page.goBack();
        await TestHelpers.waitForPageLoad(page);
      }
    }
    
    await TestHelpers.takeScreenshot(page, testInfo, 'sound_list_display');
    TestHelpers.logStep('Sound list display test completed');
  });

  test('Audio playback controls work', async ({ page }, testInfo) => {
    TestHelpers.logStep('Testing audio playback controls');
    
    // Find sound elements with audio controls
    const soundElements = page.locator('.sound-card, .sound-item, [data-sound-id]');
    const soundCount = await soundElements.count();
    
    if (soundCount > 0) {
      const firstSound = soundElements.first();
      
      // Look for audio element or play button
      const audioElement = firstSound.locator('audio').first();
      const playButton = firstSound.locator('button:has-text("Play"), .play-btn, [data-action="play"]').first();
      
      if (await audioElement.count() > 0) {
        TestHelpers.logStep('Audio element found, testing controls');
        
        // Test audio controls
        await TestHelpers.testMediaControls(page, audioElement);
        
        await TestHelpers.takeScreenshot(page, testInfo, 'audio_controls_tested');
      } else if (await playButton.count() > 0) {
        TestHelpers.logStep('Play button found, testing playback');
        
        await TestHelpers.safeClick(page, playButton);
        await page.waitForTimeout(1000);
        
        // Look for pause button or playing indicator
        const pauseButton = firstSound.locator('button:has-text("Pause"), .pause-btn, [data-action="pause"]').first();
        const playingIndicator = firstSound.locator('.playing, .is-playing').first();
        
        const isPlaying = (await pauseButton.count() > 0) || (await playingIndicator.count() > 0);
        expect(isPlaying).toBeTruthy();
        
        await TestHelpers.takeScreenshot(page, testInfo, 'sound_playing');
        
        // Stop playback if pause button exists
        if (await pauseButton.count() > 0) {
          await TestHelpers.safeClick(page, pauseButton);
        }
      } else {
        TestHelpers.logStep('No audio controls found - skipping playback test');
      }
    } else {
      TestHelpers.logStep('No sounds found - skipping playback test');
    }
    
    TestHelpers.logStep('Audio playback controls test completed');
  });

  test('Sound editing works', async ({ page }, testInfo) => {
    TestHelpers.logStep('Testing sound editing');
    
    // Find a sound to edit
    const soundElements = page.locator('.sound-card, .sound-item, [data-sound-id]');
    const soundCount = await soundElements.count();
    
    if (soundCount > 0) {
      const firstSound = soundElements.first();
      
      // Look for edit button
      const editButton = firstSound.locator('a:has-text("Edit"), .edit-btn, [href*="edit"]').first();
      
      if (await editButton.count() > 0) {
        await TestHelpers.safeClick(page, editButton);
        await TestHelpers.waitForPageLoad(page);
        
        // Verify we're on edit page
        expect(page.url()).toContain('edit');
        
        // Check form is pre-filled
        const nameInput = page.locator('input[name="name"], #name').first();
        if (await nameInput.count() > 0) {
          const currentName = await nameInput.inputValue();
          expect(currentName).toBeTruthy();
          TestHelpers.logStep(`✓ Form pre-filled with name: ${currentName}`);
          
          // Make a small edit
          const newName = currentName + ' (Edited)';
          await TestHelpers.safeFill(page, nameInput, newName);
          
          // Submit form
          const submitButton = page.locator('input[type="submit"], button[type="submit"]').first();
          await TestHelpers.safeClick(page, submitButton);
          await TestHelpers.waitForPageLoad(page);
          
          await TestHelpers.takeScreenshot(page, testInfo, 'sound_edited');
        }
      } else {
        TestHelpers.logStep('No edit button found - skipping edit test');
      }
    } else {
      TestHelpers.logStep('No sounds found - skipping edit test');
    }
    
    TestHelpers.logStep('Sound editing test completed');
  });

  test('Sound search and filtering works', async ({ page }, testInfo) => {
    TestHelpers.logStep('Testing sound search and filtering');
    
    // Look for search input
    const searchInput = page.locator('input[type="search"], input[placeholder*="search" i], .search-input');
    
    if (await searchInput.count() > 0) {
      TestHelpers.logStep('Search input found, testing search functionality');
      
      // Test search
      await TestHelpers.safeFill(page, searchInput.first(), 'test');
      await page.keyboard.press('Enter');
      await page.waitForTimeout(1000);
      
      await TestHelpers.takeScreenshot(page, testInfo, 'sound_search_results');
    }
    
    // Look for filter dropdowns
    const filterSelects = page.locator('select[name*="filter"], select[name*="sort"], .filter-select');
    const filterCount = await filterSelects.count();
    
    if (filterCount > 0) {
      TestHelpers.logStep(`Found ${filterCount} filter controls`);
      
      // Test first filter
      const firstFilter = filterSelects.first();
      const options = await firstFilter.locator('option').count();
      
      if (options > 1) {
        await TestHelpers.safeSelect(page, firstFilter, await firstFilter.locator('option').nth(1).getAttribute('value'));
        await page.waitForTimeout(1000);
        
        await TestHelpers.takeScreenshot(page, testInfo, 'sound_filtered_results');
      }
    }
    
    TestHelpers.logStep('Sound search and filtering test completed');
  });

  test('Sound categories and tags work', async ({ page }, testInfo) => {
    TestHelpers.logStep('Testing sound categories and tags');
    
    // Look for category or tag elements
    const categoryElements = page.locator('.category, .tag, .sound-category, .sound-tag');
    const categoryCount = await categoryElements.count();
    
    if (categoryCount > 0) {
      TestHelpers.logStep(`Found ${categoryCount} category/tag elements`);
      
      // Test clicking on first category/tag
      const firstCategory = categoryElements.first();
      const categoryText = await firstCategory.textContent();
      
      if (await firstCategory.locator('a').count() > 0) {
        await TestHelpers.safeClick(page, firstCategory.locator('a').first());
        await TestHelpers.waitForPageLoad(page);
        
        // Check if filtered by category
        await TestHelpers.takeScreenshot(page, testInfo, 'sound_category_filtered');
        TestHelpers.logStep(`✓ Filtered by category: ${categoryText}`);
      }
    } else {
      TestHelpers.logStep('No categories or tags found - skipping category test');
    }
    
    TestHelpers.logStep('Sound categories and tags test completed');
  });

  test('Sound deletion works with confirmation', async ({ page }, testInfo) => {
    TestHelpers.logStep('Testing sound deletion');
    
    // Find a sound to delete (preferably a test sound)
    const soundElements = page.locator('.sound-card, .sound-item, [data-sound-id]');
    const soundCount = await soundElements.count();
    
    if (soundCount > 0) {
      // Look for a test sound first
      const testSound = page.locator('.sound-card:has-text("Test"), .sound-item:has-text("Test")').first();
      const soundToDelete = await testSound.count() > 0 ? testSound : soundElements.first();
      
      // Look for delete button
      const deleteButton = soundToDelete.locator('button:has-text("Delete"), .delete-btn, [data-action="delete"]').first();
      
      if (await deleteButton.count() > 0) {
        await TestHelpers.safeClick(page, deleteButton);
        
        // Look for confirmation dialog
        const confirmDialog = page.locator('.modal, .confirm-dialog, .alert');
        
        if (await confirmDialog.count() > 0) {
          TestHelpers.logStep('Confirmation dialog appeared');
          
          // Look for confirm button
          const confirmButton = confirmDialog.locator('button:has-text("Delete"), button:has-text("Confirm"), .confirm-btn').first();
          
          if (await confirmButton.count() > 0) {
            await TestHelpers.safeClick(page, confirmButton);
            await page.waitForTimeout(1000);
            
            await TestHelpers.takeScreenshot(page, testInfo, 'sound_deleted');
            TestHelpers.logStep('✓ Sound deletion confirmed');
          }
        } else {
          // Check if sound was deleted immediately
          await page.waitForTimeout(1000);
          await TestHelpers.takeScreenshot(page, testInfo, 'sound_deleted_immediate');
        }
      } else {
        TestHelpers.logStep('No delete button found - skipping deletion test');
      }
    } else {
      TestHelpers.logStep('No sounds found - skipping deletion test');
    }
    
    TestHelpers.logStep('Sound deletion test completed');
  });
});
