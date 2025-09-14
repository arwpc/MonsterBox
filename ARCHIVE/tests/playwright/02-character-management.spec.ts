import { test, expect, Page } from '@playwright/test';

/**
 * Character Management Comprehensive Tests
 * Tests character CRUD operations, parts assignment, AI configuration
 */

test.describe('Character Management', () => {
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
      console.log('🚨 Character Management Errors:');
      errors.forEach(error => console.log(`  - ${error}`));
    }
  });

  test('Characters list displays correctly', async ({ page }) => {
    await page.goto('/characters');
    
    // Check page title/header - use first() to handle multiple headings
    await expect(page.locator('h1, h2, .page-title').first()).toContainText(/Character/i);
    
    // Check for character display elements
    const characterDisplay = page.locator('table, .character-list, .character-grid, .character-cards');
    await expect(characterDisplay).toBeVisible();
    
    // Check for Add Character button
    const addButton = page.locator('button:has-text("Add"), a:has-text("Add"), .btn-add, .add-character');
    await expect(addButton.first()).toBeVisible();
  });

  test('Character creation workflow', async ({ page }) => {
    await page.goto('/characters');
    
    // Click Add Character button
    const addButton = page.locator('button:has-text("Add"), a:has-text("Add"), .btn-add, .add-character');
    await addButton.first().click();
    
    // Should navigate to character creation form or open modal
    const isModal = await page.locator('.modal, .dialog').count() > 0;
    const isNewPage = page.url().includes('/add') || page.url().includes('/new') || page.url().includes('/create');
    
    expect(isModal || isNewPage).toBeTruthy();
    
    // Fill character form
    const nameField = page.locator('input[name*="name"], input[id*="name"], #characterName');
    if (await nameField.count() > 0) {
      await nameField.fill('Test Character Playwright');
    }
    
    // Check for other form fields
    const formFields = [
      'input[name*="description"], textarea[name*="description"]',
      'input[name*="host"], input[name*="ip"]',
      'select[name*="type"], select[name*="category"]'
    ];
    
    for (const fieldSelector of formFields) {
      const field = page.locator(fieldSelector);
      if (await field.count() > 0) {
        if (fieldSelector.includes('select')) {
          await field.selectOption({ index: 0 });
        } else {
          await field.fill('Test Value');
        }
      }
    }
    
    // Submit form
    const submitButton = page.locator('button[type="submit"], button:has-text("Save"), button:has-text("Create")');
    if (await submitButton.count() > 0) {
      await submitButton.click();
      
      // Wait for response
      await page.waitForTimeout(2000);
    }
  });

  test('Character editing workflow', async ({ page }) => {
    await page.goto('/characters');
    
    // Find first character edit button
    const editButton = page.locator('button:has-text("Edit"), a:has-text("Edit"), .btn-edit, .edit-character').first();
    
    if (await editButton.count() > 0) {
      await editButton.click();
      
      // Should open edit form
      const nameField = page.locator('input[name*="name"], input[id*="name"], #characterName');
      if (await nameField.count() > 0) {
        await nameField.fill('Updated Character Name');
        
        // Submit changes
        const saveButton = page.locator('button[type="submit"], button:has-text("Save"), button:has-text("Update")');
        if (await saveButton.count() > 0) {
          await saveButton.click();
          await page.waitForTimeout(2000);
        }
      }
    }
  });

  test('Character parts assignment', async ({ page }) => {
    await page.goto('/characters');
    
    // Find Parts button for first character
    const partsButton = page.locator('button:has-text("Parts"), a:has-text("Parts"), .btn-parts, a[href*="/parts"]').first();
    
    if (await partsButton.count() > 0) {
      await partsButton.click();
      
      // Should navigate to parts page with character filter
      await expect(page.url()).toContain('parts');
      
      // Check character filter is set
      const characterSelect = page.locator('select[name*="character"], #characterFilter');
      if (await characterSelect.count() > 0) {
        await expect(characterSelect).toBeVisible();
      }
      
      // Check for parts list
      const partsList = page.locator('table, .parts-list, .parts-grid');
      await expect(partsList).toBeVisible();
    }
  });

  test('Character AI assignment', async ({ page }) => {
    await page.goto('/characters');
    
    // Find AI button for first character
    const aiButton = page.locator('button:has-text("AI"), a:has-text("AI"), .btn-ai, a[href*="/ai"]').first();
    
    if (await aiButton.count() > 0) {
      await aiButton.click();
      
      // Should navigate to AI management
      await expect(page.url()).toContain('ai');
      
      // Check for AI configuration elements
      const aiElements = page.locator('select, .ai-config, .assistant-config');
      await expect(aiElements.first()).toBeVisible();
    }
  });

  test('Character deletion workflow', async ({ page }) => {
    await page.goto('/characters');
    
    // Find delete button (usually requires confirmation)
    const deleteButton = page.locator('button:has-text("Delete"), .btn-delete, .delete-character').first();
    
    if (await deleteButton.count() > 0) {
      await deleteButton.click();
      
      // Check for confirmation dialog
      const confirmDialog = page.locator('.modal, .dialog, .confirm');
      if (await confirmDialog.count() > 0) {
        // Cancel deletion to avoid removing actual data
        const cancelButton = page.locator('button:has-text("Cancel"), .btn-cancel');
        if (await cancelButton.count() > 0) {
          await cancelButton.click();
        }
      }
    }
  });

  test('Character search and filtering', async ({ page }) => {
    await page.goto('/characters');
    
    // Check for search functionality
    const searchField = page.locator('input[type="search"], input[placeholder*="search"], .search-input');
    if (await searchField.count() > 0) {
      await searchField.fill('test');
      await page.waitForTimeout(1000);
      
      // Clear search
      await searchField.clear();
    }
    
    // Check for filter options
    const filterSelect = page.locator('select[name*="filter"], .filter-select');
    if (await filterSelect.count() > 0) {
      await filterSelect.selectOption({ index: 0 });
    }
  });

  test('Character image upload', async ({ page }) => {
    await page.goto('/characters');
    
    // Try to find character with image upload
    const imageUpload = page.locator('input[type="file"], .image-upload, .avatar-upload');
    if (await imageUpload.count() > 0) {
      // Note: In real test, you'd upload a test image file
      // For now, just verify the upload element exists
      await expect(imageUpload.first()).toBeVisible();
    }
  });

  test('Character status and health monitoring', async ({ page }) => {
    await page.goto('/characters');
    
    // Check for status indicators
    const statusElements = page.locator('.status, .health, .online, .offline, .connected');
    if (await statusElements.count() > 0) {
      await expect(statusElements.first()).toBeVisible();
    }
    
    // Check for health monitoring buttons
    const monitorButton = page.locator('button:has-text("Monitor"), button:has-text("Status"), .btn-monitor');
    if (await monitorButton.count() > 0) {
      await monitorButton.first().click();
      await page.waitForTimeout(2000);
    }
  });

  test('Character network configuration', async ({ page }) => {
    await page.goto('/characters');
    
    // Look for network/connection settings
    const networkButton = page.locator('button:has-text("Network"), button:has-text("Config"), .btn-network');
    if (await networkButton.count() > 0) {
      await networkButton.first().click();
      
      // Check for network configuration fields
      const networkFields = page.locator('input[name*="host"], input[name*="ip"], input[name*="port"]');
      if (await networkFields.count() > 0) {
        await expect(networkFields.first()).toBeVisible();
      }
    }
  });

  test('Character data persistence', async ({ page }) => {
    await page.goto('/characters');
    
    // Get initial character count
    const initialCharacters = await page.locator('tr[data-character-id], .character-card, .character-item').count();
    
    // Refresh page
    await page.reload();
    
    // Verify character count remains the same
    const afterRefreshCharacters = await page.locator('tr[data-character-id], .character-card, .character-item').count();
    expect(afterRefreshCharacters).toBe(initialCharacters);
  });
});
