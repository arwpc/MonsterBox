import { test, expect, Page } from '@playwright/test';

/**
 * Core Navigation and Basic Functionality Tests
 * Tests all main navigation, page loads, and basic UI elements
 */

test.describe('MonsterBox Core Navigation', () => {
  let errors: string[] = [];

  test.beforeEach(async ({ page }) => {
    errors = [];
    
    // Listen for console errors
    page.on('console', msg => {
      if (msg.type() === 'error') {
        errors.push(`Console Error: ${msg.text()}`);
      }
    });

    // Listen for page errors
    page.on('pageerror', error => {
      errors.push(`Page Error: ${error.message}`);
    });

    // Listen for failed requests
    page.on('requestfailed', request => {
      errors.push(`Request Failed: ${request.url()} - ${request.failure()?.errorText}`);
    });
  });

  test.afterEach(async ({ page }) => {
    if (errors.length > 0) {
      console.log('🚨 Errors detected in test:');
      errors.forEach(error => console.log(`  - ${error}`));
    }
  });

  test('Home page loads and displays correctly', async ({ page }) => {
    await page.goto('/');
    
    // Check page title
    await expect(page).toHaveTitle(/MonsterBox/);
    
    // Check main navigation elements
    await expect(page.locator('nav')).toBeVisible();
    
    // Check for MonsterBox logo/branding
    const logo = page.locator('img[alt*="MonsterBox"], .logo, h1:has-text("MonsterBox")');
    await expect(logo.first()).toBeVisible();
    
    // Check main menu items
    const menuItems = [
      'Characters',
      'Parts', 
      'AI Management',
      'Sounds',
      'Scenes',
      'Configuration'
    ];
    
    for (const item of menuItems) {
      const menuLink = page.locator(`a:has-text("${item}"), nav *:has-text("${item}")`);
      await expect(menuLink.first()).toBeVisible();
    }
  });

  test('Characters page navigation and load', async ({ page }) => {
    await page.goto('/characters');
    
    // Check page loads
    await expect(page.locator('h1, h2, .page-title')).toContainText(/Character/i);
    
    // Check for character management elements
    const characterElements = [
      'table, .character-list, .character-grid',
      'button:has-text("Add"), a:has-text("Add"), .btn-add',
      '.character-card, .character-item, tr[data-character-id]'
    ];
    
    for (const selector of characterElements) {
      const element = page.locator(selector);
      if (await element.count() > 0) {
        await expect(element.first()).toBeVisible();
        break;
      }
    }
  });

  test('Parts management page navigation', async ({ page }) => {
    await page.goto('/parts');
    
    // Check page loads
    await expect(page.locator('h1, h2, .page-title')).toContainText(/Parts/i);
    
    // Check for parts management elements
    await expect(page.locator('select, .character-filter')).toBeVisible();
    
    // Test character filter dropdown
    const characterSelect = page.locator('select[name*="character"], #characterFilter');
    if (await characterSelect.count() > 0) {
      await characterSelect.selectOption({ index: 0 });
    }
  });

  test('AI Management page navigation', async ({ page }) => {
    await page.goto('/ai-management');

    // Check page loads - use first() to handle multiple headings
    await expect(page.locator('h1, h2, .page-title').first()).toContainText(/AI/i);

    // Check for AI management sections
    const aiSections = [
      'STT', 'TTS', 'Assistant', 'Chat', 'Conversation'
    ];

    for (const section of aiSections) {
      const sectionElement = page.locator(`*:has-text("${section}")`);
      if (await sectionElement.count() > 0) {
        await expect(sectionElement.first()).toBeVisible();
      }
    }
  });

  test('Sounds page navigation', async ({ page }) => {
    await page.goto('/sounds');
    
    // Check page loads
    await expect(page.locator('h1, h2, .page-title')).toContainText(/Sound/i);
    
    // Check for sound management elements
    const soundElements = [
      'button:has-text("Upload"), input[type="file"]',
      '.sound-list, .audio-list, table',
      'button:has-text("Play"), .play-btn'
    ];
    
    for (const selector of soundElements) {
      const element = page.locator(selector);
      if (await element.count() > 0) {
        await expect(element.first()).toBeVisible();
        break;
      }
    }
  });

  test('Scenes page navigation', async ({ page }) => {
    await page.goto('/scenes');
    
    // Check page loads
    await expect(page.locator('h1, h2, .page-title')).toContainText(/Scene/i);
    
    // Check for scene management elements
    const sceneElements = [
      'button:has-text("Create"), button:has-text("Add")',
      '.scene-list, .scene-grid, table',
      'button:has-text("Play"), .play-btn'
    ];
    
    for (const selector of sceneElements) {
      const element = page.locator(selector);
      if (await element.count() > 0) {
        await expect(element.first()).toBeVisible();
        break;
      }
    }
  });

  test('Configuration page navigation', async ({ page }) => {
    await page.goto('/system-config');

    // Check page loads - use first() to handle multiple headings
    await expect(page.locator('h1, h2, .page-title').first()).toContainText(/Config/i);

    // Check for configuration sections
    const configSections = [
      'System', 'Network', 'Hardware', 'Service', 'SSL'
    ];

    for (const section of configSections) {
      const sectionElement = page.locator(`*:has-text("${section}")`);
      if (await sectionElement.count() > 0) {
        await expect(sectionElement.first()).toBeVisible();
      }
    }
  });

  test('Responsive navigation menu', async ({ page }) => {
    // Test mobile viewport
    await page.setViewportSize({ width: 375, height: 667 });
    await page.goto('/');
    
    // Check if mobile menu exists
    const mobileMenu = page.locator('.mobile-menu, .hamburger, .menu-toggle');
    if (await mobileMenu.count() > 0) {
      await mobileMenu.click();
      
      // Check menu items are visible after click
      const menuItems = page.locator('nav a, .menu-item');
      await expect(menuItems.first()).toBeVisible();
    }
  });

  test('Error handling for invalid routes', async ({ page }) => {
    await page.goto('/invalid-route-that-does-not-exist');
    
    // Should show 404 or redirect to home
    const is404 = await page.locator('*:has-text("404"), *:has-text("Not Found")').count() > 0;
    const isRedirected = page.url().includes('/') && !page.url().includes('invalid-route');
    
    expect(is404 || isRedirected).toBeTruthy();
  });

  test('Page load performance', async ({ page }) => {
    const startTime = Date.now();
    await page.goto('/');
    const loadTime = Date.now() - startTime;
    
    // Page should load within 10 seconds
    expect(loadTime).toBeLessThan(10000);
    
    // Check that main content is visible
    await expect(page.locator('body')).toBeVisible();
  });

  test('JavaScript and CSS resources load', async ({ page }) => {
    await page.goto('/');

    // Check for CSS
    const stylesheets = await page.locator('link[rel="stylesheet"]').count();
    expect(stylesheets).toBeGreaterThan(0);

    // Check for JavaScript - should now find external scripts
    const scripts = await page.locator('script[src]').count();
    expect(scripts).toBeGreaterThan(0);
  });
});
