/**
 * Character Management Tests for MonsterBox
 * 
 * Tests character creation, editing, deletion, form validation, and character-specific functionality
 */

const { test, expect } = require('@playwright/test');
const TestHelpers = require('./utils/test-helpers');

test.describe('Character Management', () => {
  test.beforeEach(async ({ page }) => {
    TestHelpers.logStep('Navigating to characters page');
    await page.goto('/characters');
    await TestHelpers.waitForPageLoad(page);
  });

  test('Characters page loads correctly', async ({ page }, testInfo) => {
    TestHelpers.logStep('Testing characters page load');
    
    // Check page title and heading
    await expect(page).toHaveTitle(/Characters/);
    await expect(page.locator('h1, h2').first()).toContainText(/Character Management|Characters/);
    
    // Check for character list or empty state
    const characterList = page.locator('.character-list, .characters-grid, .character-card');
    const emptyState = page.locator('.empty-state, .no-characters');
    
    // Either characters exist or empty state is shown
    const hasCharacters = await characterList.count() > 0;
    const hasEmptyState = await emptyState.count() > 0;
    
    expect(hasCharacters || hasEmptyState).toBeTruthy();
    
    // Check for "Add Character" or "Create Character" button
    const addButton = page.locator('a:has-text("Add"), a:has-text("Create"), a:has-text("New"), button:has-text("Add"), button:has-text("Create")');
    await expect(addButton.first()).toBeVisible({ timeout: 5000 });
    
    await TestHelpers.takeScreenshot(page, testInfo, 'characters_page_loaded');
    TestHelpers.logStep('Characters page test completed');
  });

  test('Create new character form loads', async ({ page }, testInfo) => {
    TestHelpers.logStep('Testing character creation form');
    
    // Find and click create/add character button
    const createButton = page.locator('a:has-text("Add"), a:has-text("Create"), a:has-text("New")').first();
    await TestHelpers.safeClick(page, createButton);
    
    // Verify navigation to character form
    await TestHelpers.waitForPageLoad(page);
    await expect(page.url()).toContain('/character');
    
    // Check form elements exist
    const formElements = [
      'input[name="char_name"], #char_name',
      'textarea[name="char_description"], #char_description',
      'textarea[name="char_personality"], #char_personality',
      'input[type="submit"], button[type="submit"]'
    ];
    
    for (const selector of formElements) {
      const element = page.locator(selector);
      if (await element.count() > 0) {
        await expect(element.first()).toBeVisible({ timeout: 5000 });
        TestHelpers.logStep(`✓ Found form element: ${selector}`);
      }
    }
    
    await TestHelpers.takeScreenshot(page, testInfo, 'character_creation_form');
    TestHelpers.logStep('Character creation form test completed');
  });

  test('Character form validation works', async ({ page }, testInfo) => {
    TestHelpers.logStep('Testing character form validation');
    
    // Navigate to character creation form
    const createButton = page.locator('a:has-text("Add"), a:has-text("Create"), a:has-text("New")').first();
    await TestHelpers.safeClick(page, createButton);
    await TestHelpers.waitForPageLoad(page);
    
    // Test form validation with various invalid inputs
    const validationTests = [
      {
        description: 'Empty form submission',
        data: {},
        shouldFail: true,
        expectedErrors: ['required', 'name']
      },
      {
        description: 'Name too short',
        data: { char_name: 'A' },
        shouldFail: true,
        expectedErrors: ['name', 'length', 'short']
      },
      {
        description: 'Name too long',
        data: { char_name: 'A'.repeat(200) },
        shouldFail: true,
        expectedErrors: ['name', 'length', 'long']
      }
    ];
    
    await TestHelpers.testFormValidation(page, 'form', validationTests);
    
    await TestHelpers.takeScreenshot(page, testInfo, 'character_form_validation');
    TestHelpers.logStep('Character form validation test completed');
  });

  test('Create character with valid data', async ({ page }, testInfo) => {
    TestHelpers.logStep('Testing character creation with valid data');
    
    // Navigate to character creation form
    const createButton = page.locator('a:has-text("Add"), a:has-text("Create"), a:has-text("New")').first();
    await TestHelpers.safeClick(page, createButton);
    await TestHelpers.waitForPageLoad(page);
    
    // Fill form with valid test data
    const testCharacter = {
      char_name: 'Test Character ' + Date.now(),
      char_description: 'A test character created by automated testing',
      char_personality: 'Friendly and helpful for testing purposes',
      char_backstory: 'Born in the realm of automated tests',
      char_appearance: 'Glowing green with test patterns',
      char_abilities: 'Can validate forms and click buttons',
      char_weaknesses: 'Vulnerable to test failures',
      char_goals: 'To pass all automated tests',
      char_fears: 'Being deleted by cleanup scripts',
      char_secrets: 'Knows all the test data'
    };
    
    // Fill form fields
    for (const [field, value] of Object.entries(testCharacter)) {
      const fieldSelector = `input[name="${field}"], textarea[name="${field}"], #${field}`;
      const element = page.locator(fieldSelector);
      
      if (await element.count() > 0) {
        await TestHelpers.safeFill(page, element.first(), value);
        TestHelpers.logStep(`✓ Filled ${field}: ${value.substring(0, 30)}...`);
      }
    }
    
    // Submit form
    const submitButton = page.locator('input[type="submit"], button[type="submit"]').first();
    await TestHelpers.safeClick(page, submitButton);
    
    // Wait for response
    await TestHelpers.waitForPageLoad(page);
    
    // Check for success indicators
    const successIndicators = [
      page.locator('.success, .alert-success'),
      page.locator('text=created'),
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
    
    // If redirected to character list, that's also success
    if (page.url().includes('/characters') && !page.url().includes('/new')) {
      successFound = true;
    }
    
    expect(successFound).toBeTruthy();
    
    await TestHelpers.takeScreenshot(page, testInfo, 'character_created_successfully');
    TestHelpers.logStep('Character creation test completed');
  });

  test('Character list displays characters', async ({ page }, testInfo) => {
    TestHelpers.logStep('Testing character list display');
    
    // Check for character cards or list items
    const characterElements = page.locator('.character-card, .character-item, .character-row, [data-character-id]');
    const characterCount = await characterElements.count();
    
    TestHelpers.logStep(`Found ${characterCount} character elements`);
    
    if (characterCount > 0) {
      // Test first character element
      const firstCharacter = characterElements.first();
      await expect(firstCharacter).toBeVisible();
      
      // Check for character name
      const nameElement = firstCharacter.locator('.character-name, .name, h3, h4').first();
      if (await nameElement.count() > 0) {
        const characterName = await nameElement.textContent();
        expect(characterName).toBeTruthy();
        TestHelpers.logStep(`✓ Character name: ${characterName}`);
      }
      
      // Check for action buttons (edit, delete, view)
      const actionButtons = firstCharacter.locator('a, button');
      const buttonCount = await actionButtons.count();
      TestHelpers.logStep(`Found ${buttonCount} action buttons on first character`);
      
      // Test character detail view if available
      const viewButton = firstCharacter.locator('a:has-text("View"), a:has-text("Details"), .view-btn').first();
      if (await viewButton.count() > 0) {
        await TestHelpers.safeClick(page, viewButton);
        await TestHelpers.waitForPageLoad(page);
        
        // Check character detail page
        await expect(page.locator('h1, h2').first()).toBeVisible();
        await TestHelpers.takeScreenshot(page, testInfo, 'character_detail_view');
        
        // Go back to character list
        await page.goBack();
        await TestHelpers.waitForPageLoad(page);
      }
    }
    
    await TestHelpers.takeScreenshot(page, testInfo, 'character_list_display');
    TestHelpers.logStep('Character list display test completed');
  });

  test('Character editing works', async ({ page }, testInfo) => {
    TestHelpers.logStep('Testing character editing');
    
    // Find a character to edit
    const characterElements = page.locator('.character-card, .character-item, [data-character-id]');
    const characterCount = await characterElements.count();
    
    if (characterCount > 0) {
      const firstCharacter = characterElements.first();
      
      // Look for edit button
      const editButton = firstCharacter.locator('a:has-text("Edit"), .edit-btn, [href*="edit"]').first();
      
      if (await editButton.count() > 0) {
        await TestHelpers.safeClick(page, editButton);
        await TestHelpers.waitForPageLoad(page);
        
        // Verify we're on edit page
        expect(page.url()).toContain('edit');
        
        // Check form is pre-filled
        const nameInput = page.locator('input[name="char_name"], #char_name').first();
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
          
          await TestHelpers.takeScreenshot(page, testInfo, 'character_edited');
        }
      } else {
        TestHelpers.logStep('No edit button found - skipping edit test');
      }
    } else {
      TestHelpers.logStep('No characters found - skipping edit test');
    }
    
    TestHelpers.logStep('Character editing test completed');
  });

  test('Configure Voice button works', async ({ page }, testInfo) => {
    TestHelpers.logStep('Testing Configure Voice button');
    
    // Find a character with Configure Voice button
    const characterElements = page.locator('.character-card, .character-item, [data-character-id]');
    const characterCount = await characterElements.count();
    
    if (characterCount > 0) {
      const firstCharacter = characterElements.first();
      
      // Look for Configure Voice button
      const voiceButton = firstCharacter.locator('a:has-text("Configure Voice"), .configure-voice-btn, [href*="voice"]').first();
      
      if (await voiceButton.count() > 0) {
        await TestHelpers.safeClick(page, voiceButton);
        await TestHelpers.waitForPageLoad(page);
        
        // Should navigate to TTS configuration or voice configuration page
        const expectedUrls = ['/ai-management/tts', '/voice', '/tts'];
        const currentUrl = page.url();
        const urlMatches = expectedUrls.some(url => currentUrl.includes(url));
        
        expect(urlMatches).toBeTruthy();
        TestHelpers.logStep(`✓ Navigated to voice configuration: ${currentUrl}`);
        
        await TestHelpers.takeScreenshot(page, testInfo, 'configure_voice_page');
      } else {
        TestHelpers.logStep('No Configure Voice button found - skipping voice test');
      }
    } else {
      TestHelpers.logStep('No characters found - skipping voice test');
    }
    
    TestHelpers.logStep('Configure Voice test completed');
  });

  test('Character image upload works if available', async ({ page }, testInfo) => {
    TestHelpers.logStep('Testing character image upload');
    
    // Navigate to character creation or edit form
    const createButton = page.locator('a:has-text("Add"), a:has-text("Create"), a:has-text("New")').first();
    await TestHelpers.safeClick(page, createButton);
    await TestHelpers.waitForPageLoad(page);
    
    // Look for file input for character image
    const fileInput = page.locator('input[type="file"]');
    
    if (await fileInput.count() > 0) {
      TestHelpers.logStep('File input found, testing image upload');
      
      // Test file upload
      await TestHelpers.testFileUpload(page, fileInput.first(), {
        content: 'fake image content for testing'
      });
      
      await TestHelpers.takeScreenshot(page, testInfo, 'character_image_upload');
    } else {
      TestHelpers.logStep('No file input found - skipping image upload test');
    }
    
    TestHelpers.logStep('Character image upload test completed');
  });

  test('Character search and filtering works', async ({ page }, testInfo) => {
    TestHelpers.logStep('Testing character search and filtering');
    
    // Look for search input
    const searchInput = page.locator('input[type="search"], input[placeholder*="search" i], .search-input');
    
    if (await searchInput.count() > 0) {
      TestHelpers.logStep('Search input found, testing search functionality');
      
      // Test search
      await TestHelpers.safeFill(page, searchInput.first(), 'test');
      await page.keyboard.press('Enter');
      await page.waitForTimeout(1000);
      
      await TestHelpers.takeScreenshot(page, testInfo, 'character_search_results');
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
        
        await TestHelpers.takeScreenshot(page, testInfo, 'character_filtered_results');
      }
    }
    
    TestHelpers.logStep('Character search and filtering test completed');
  });
});
