/**
 * Deep Characters Management Testing
 * 
 * Comprehensive tests for all character-related functionality including:
 * - Character CRUD operations
 * - Hardware parts assignment
 * - AI instance assignment
 * - Jaw animation configuration
 * - Voice settings
 * - Form validation
 * - Data persistence
 */

const { test, expect } = require('@playwright/test');
const TestHelpers = require('../utils/test-helpers');
const TestDataFactory = require('../utils/test-data-factory');
const { HomePage, CharactersPage } = require('../utils/page-objects');

test.describe('Characters Deep Functionality Tests', () => {
  let homePage, charactersPage;

  test.beforeEach(async ({ page }) => {
    TestHelpers.logStep('Setting up Characters deep functionality test');
    homePage = new HomePage(page);
    charactersPage = new CharactersPage(page);
    
    await homePage.goto('/');
    await homePage.validatePageLoad();
  });

  test.afterEach(async () => {
    // Cleanup test data
    await TestDataFactory.cleanup();
  });

  test('Character CRUD Operations - Complete Workflow', async ({ page }, testInfo) => {
    TestHelpers.logStep('Testing complete character CRUD workflow');

    // Navigate to characters page
    await homePage.navigateToCharacters();
    const initialValidation = await charactersPage.validateCharacterDisplay();
    expect(initialValidation.pageLoaded).toBe(true);
    expect(initialValidation.noErrors).toBe(true);

    // Test character creation
    const testCharacter = TestDataFactory.generateCharacterData({
      name: 'Test Character CRUD',
      description: 'Character for testing CRUD operations'
    });

    TestHelpers.logStep('Creating new character');
    const initialCount = await charactersPage.getCharacterCount();
    await charactersPage.addNewCharacter(testCharacter);
    
    // Verify character was created
    const newCount = await charactersPage.getCharacterCount();
    expect(newCount).toBeGreaterThan(initialCount);

    // Test character editing
    TestHelpers.logStep('Testing character editing');
    const updatedData = {
      name: 'Updated Test Character',
      description: 'Updated description for testing'
    };
    
    if (newCount > 0) {
      await charactersPage.editCharacter(0, updatedData);
      
      // Verify edit was successful
      const pageContent = await page.textContent('body');
      expect(pageContent).toContain(updatedData.name);
    }

    await charactersPage.takeScreenshot(testInfo, 'character_crud_complete');
  });

  test('Character Form Validation - All Fields', async ({ page }, testInfo) => {
    TestHelpers.logStep('Testing character form validation');

    await homePage.navigateToCharacters();
    
    // Test form validation cases
    const validationCases = TestDataFactory.generateFormValidationCases('character');
    
    for (const testCase of validationCases) {
      TestHelpers.logStep(`Testing validation: ${testCase.description}`);
      
      // Click add character to open form
      await TestHelpers.safeClick(page, charactersPage.selectors.addCharacterButton);
      
      // Fill form with test data
      await charactersPage.fillCharacterForm(testCase.data);
      
      if (testCase.shouldFail) {
        // Try to submit and expect validation errors
        await TestHelpers.safeClick(page, charactersPage.selectors.submitButton);
        
        // Check that we're still on the form (validation failed)
        const formStillVisible = await page.locator(charactersPage.selectors.characterForm).isVisible();
        expect(formStillVisible).toBe(true);
        
        // Cancel form to reset for next test
        const cancelButton = page.locator(charactersPage.selectors.cancelButton);
        if (await cancelButton.count() > 0) {
          await TestHelpers.safeClick(page, cancelButton);
        } else {
          await page.keyboard.press('Escape');
        }
      } else {
        // Valid data should submit successfully
        await TestHelpers.safeClick(page, charactersPage.selectors.submitButton);
        await TestHelpers.waitForPageLoad(page);
        
        // Verify we're back on characters list
        const currentUrl = page.url();
        expect(currentUrl).toContain('/characters');
      }
    }

    await charactersPage.takeScreenshot(testInfo, 'character_form_validation');
  });

  test('Hardware Parts Assignment - Complete Integration', async ({ page }, testInfo) => {
    TestHelpers.logStep('Testing hardware parts assignment to characters');

    await homePage.navigateToCharacters();
    
    // Create a test character first
    const testCharacter = TestDataFactory.generateCharacterData({
      name: 'Hardware Test Character'
    });
    await charactersPage.addNewCharacter(testCharacter);

    // Test parts assignment
    const partsSection = page.locator(charactersPage.selectors.partsSection);
    if (await partsSection.count() > 0) {
      TestHelpers.logStep('Testing parts assignment interface');
      
      // Look for part selection checkboxes or dropdowns
      const partSelectors = page.locator('input[type="checkbox"][name*="part"], select[name*="part"]');
      const partCount = await partSelectors.count();
      
      if (partCount > 0) {
        // Select first available part
        const firstPart = partSelectors.first();
        const tagName = await firstPart.evaluate(el => el.tagName.toLowerCase());
        
        if (tagName === 'input') {
          await firstPart.check();
        } else if (tagName === 'select') {
          const options = await firstPart.locator('option').count();
          if (options > 1) {
            await firstPart.selectOption({ index: 1 });
          }
        }
        
        // Save character with parts
        await TestHelpers.safeClick(page, charactersPage.selectors.submitButton);
        await TestHelpers.waitForPageLoad(page);
        
        TestHelpers.logStep('✓ Parts assignment completed');
      } else {
        TestHelpers.logStep('⚠ No parts available for assignment');
      }
    }

    await charactersPage.takeScreenshot(testInfo, 'hardware_parts_assignment');
  });

  test('AI Instance Assignment and Configuration', async ({ page }, testInfo) => {
    TestHelpers.logStep('Testing AI instance assignment to characters');

    await homePage.navigateToCharacters();
    
    // Create test character
    const testCharacter = TestDataFactory.generateCharacterData({
      name: 'AI Test Character'
    });
    await charactersPage.addNewCharacter(testCharacter);

    // Look for AI configuration section
    const aiSelectors = [
      'select[name*="ai"]',
      'select[name*="instance"]',
      '[data-section="ai"]',
      '.ai-section'
    ];

    let aiSectionFound = false;
    for (const selector of aiSelectors) {
      if (await page.locator(selector).count() > 0) {
        aiSectionFound = true;
        TestHelpers.logStep(`Found AI section: ${selector}`);
        
        const aiSelect = page.locator(selector).first();
        const options = await aiSelect.locator('option').count();
        
        if (options > 1) {
          await aiSelect.selectOption({ index: 1 });
          TestHelpers.logStep('✓ AI instance assigned');
        }
        break;
      }
    }

    if (!aiSectionFound) {
      TestHelpers.logStep('⚠ No AI configuration section found');
    }

    await charactersPage.takeScreenshot(testInfo, 'ai_instance_assignment');
  });

  test('Character Image Upload and Management', async ({ page }, testInfo) => {
    TestHelpers.logStep('Testing character image upload functionality');

    await homePage.navigateToCharacters();
    
    // Create test image file
    const testImage = await TestDataFactory.generateTestFile('image', 'small');
    
    // Create character with image
    const testCharacter = TestDataFactory.generateCharacterData({
      name: 'Image Test Character',
      image: testImage.path
    });

    await charactersPage.addNewCharacter(testCharacter);
    
    // Verify image upload worked
    const imageElements = page.locator('img[src*="character"], .character-image img');
    const imageCount = await imageElements.count();
    
    if (imageCount > 0) {
      TestHelpers.logStep('✓ Character image uploaded successfully');
      
      // Test image display
      const firstImage = imageElements.first();
      await expect(firstImage).toBeVisible();
      
      // Check image source
      const imageSrc = await firstImage.getAttribute('src');
      expect(imageSrc).toBeTruthy();
      
    } else {
      TestHelpers.logStep('⚠ No character images found');
    }

    await charactersPage.takeScreenshot(testInfo, 'character_image_upload');
  });

  test('Character Data Persistence and Reload', async ({ page }, testInfo) => {
    TestHelpers.logStep('Testing character data persistence across page reloads');

    await homePage.navigateToCharacters();
    
    // Create test character
    const testCharacter = TestDataFactory.generateCharacterData({
      name: 'Persistence Test Character',
      description: 'Testing data persistence across reloads'
    });

    await charactersPage.addNewCharacter(testCharacter);
    const initialCount = await charactersPage.getCharacterCount();

    // Reload page
    await page.reload();
    await TestHelpers.waitForPageLoad(page);

    // Verify data persisted
    const reloadedCount = await charactersPage.getCharacterCount();
    expect(reloadedCount).toBe(initialCount);

    // Check character data is still visible
    const pageContent = await page.textContent('body');
    expect(pageContent).toContain(testCharacter.name);

    TestHelpers.logStep('✓ Character data persisted across reload');
    await charactersPage.takeScreenshot(testInfo, 'character_data_persistence');
  });

  test('Character Deletion with Confirmation', async ({ page }, testInfo) => {
    TestHelpers.logStep('Testing character deletion workflow');

    await homePage.navigateToCharacters();
    
    // Create test character to delete
    const testCharacter = TestDataFactory.generateCharacterData({
      name: 'Delete Test Character'
    });

    await charactersPage.addNewCharacter(testCharacter);
    const initialCount = await charactersPage.getCharacterCount();

    // Find and test delete button
    const deleteButton = page.locator(charactersPage.selectors.deleteButtons).first();
    if (await deleteButton.count() > 0) {
      await TestHelpers.safeClick(page, deleteButton);
      
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
        
        // Verify character was deleted
        const finalCount = await charactersPage.getCharacterCount();
        expect(finalCount).toBeLessThan(initialCount);
        
        TestHelpers.logStep('✓ Character deleted successfully');
      } else {
        TestHelpers.logStep('⚠ No confirmation dialog found');
      }
    } else {
      TestHelpers.logStep('⚠ No delete buttons found');
    }

    await charactersPage.takeScreenshot(testInfo, 'character_deletion');
  });

  test('Character Search and Filtering', async ({ page }, testInfo) => {
    TestHelpers.logStep('Testing character search and filtering functionality');

    await homePage.navigateToCharacters();
    
    // Create multiple test characters
    const testCharacters = TestDataFactory.generateCharacterTestCases();
    
    for (const character of testCharacters) {
      await charactersPage.addNewCharacter(character);
    }

    // Look for search/filter controls
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
        TestHelpers.logStep('Testing search functionality');
        
        // Test search
        await TestHelpers.safeFill(page, searchInput, 'Orlok');
        await page.waitForTimeout(1000);
        
        // Check if results are filtered
        const visibleCharacters = page.locator(charactersPage.selectors.characterCards + ':visible');
        const visibleCount = await visibleCharacters.count();
        
        TestHelpers.logStep(`Search returned ${visibleCount} results`);
        break;
      }
    }

    if (!searchFound) {
      TestHelpers.logStep('⚠ No search functionality found');
    }

    await charactersPage.takeScreenshot(testInfo, 'character_search_filtering');
  });
});
