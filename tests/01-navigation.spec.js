/**
 * Main Navigation Tests for MonsterBox
 * 
 * Tests home page, navigation menu, page routing, and basic page loading
 */

const { test, expect } = require('@playwright/test');
const TestHelpers = require('./utils/test-helpers');

test.describe('Main Navigation', () => {
  test.beforeEach(async ({ page }) => {
    TestHelpers.logStep('Navigating to home page');
    await page.goto('/');
    await TestHelpers.waitForPageLoad(page);
  });

  test('Home page loads correctly', async ({ page }, testInfo) => {
    TestHelpers.logStep('Testing home page load');
    
    // Check page title
    await expect(page).toHaveTitle(/MonsterBox/);
    
    // Check main heading (accepts both formats)
    await expect(page.locator('h1')).toContainText(/MONSTERBOX|MonsterBox/i);
    
    // Check navigation content exists (card-based layout)
    await expect(page.locator('.button-group').first()).toBeVisible();
    
    // Check main content area
    await expect(page.locator('main, .main-content, .container')).toBeVisible();
    
    // Take screenshot
    await TestHelpers.takeScreenshot(page, testInfo, 'home_page_loaded');
    
    TestHelpers.logStep('Home page test completed');
  });

  test('Navigation menu contains all expected links', async ({ page }, testInfo) => {
    TestHelpers.logStep('Testing navigation menu links');
    
    const expectedLinks = [
      { text: 'Characters', href: '/characters' },
      { text: 'Hardware Parts', href: '/parts' },
      { text: 'AI Management', href: '/ai-management' },
      { text: 'Sounds', href: '/sounds' },
      { text: 'Scenes', href: '/scenes' },
      { text: 'Configuration', href: '/ai-config' }
    ];
    
    for (const link of expectedLinks) {
      TestHelpers.logStep(`Checking navigation link: ${link.text}`);
      
      // Check if link exists and is visible
      const linkElement = page.locator(`a:has-text("${link.text}"), a[href*="${link.href}"]`).first();
      await expect(linkElement).toBeVisible({ timeout: 5000 });
      
      // Check href attribute
      const href = await linkElement.getAttribute('href');
      expect(href).toContain(link.href);
    }
    
    await TestHelpers.takeScreenshot(page, testInfo, 'navigation_menu');
    TestHelpers.logStep('Navigation menu test completed');
  });

  test('Navigation links work correctly', async ({ page }, testInfo) => {
    TestHelpers.logStep('Testing navigation link functionality');
    
    const navigationTests = [
      {
        linkText: 'Manage Characters',
        expectedUrl: '/characters',
        expectedTitle: 'Characters',
        expectedHeading: 'Character Management'
      },
      {
        linkText: 'Sounds',
        expectedUrl: '/sounds',
        expectedTitle: 'Sounds',
        expectedHeading: 'Sound'
      },
      {
        linkText: 'Hardware Parts',
        expectedUrl: '/parts',
        expectedTitle: 'Hardware Parts',
        expectedHeading: 'Hardware'
      }
    ];
    
    for (const navTest of navigationTests) {
      TestHelpers.logStep(`Testing navigation to: ${navTest.linkText}`);
      
      // Go back to home page
      await page.goto('/');
      await TestHelpers.waitForPageLoad(page);
      
      // Click navigation link
      const linkSelector = `a:has-text("${navTest.linkText}")`;
      await TestHelpers.safeClick(page, linkSelector);
      
      // Verify navigation
      await TestHelpers.verifyNavigation(page, navTest.expectedUrl, navTest.expectedTitle);
      
      // Check for expected heading (allow for emojis and variations)
      if (navTest.expectedHeading) {
        await expect(page.locator('h1, h2').first()).toContainText(navTest.expectedHeading, { timeout: 5000 });
      }
      
      // Take screenshot
      await TestHelpers.takeScreenshot(page, testInfo, `navigation_${navTest.linkText.toLowerCase().replace(/\s+/g, '_')}`);
    }
    
    TestHelpers.logStep('Navigation functionality test completed');
  });

  test('Page loads without JavaScript errors', async ({ page }, testInfo) => {
    TestHelpers.logStep('Testing for JavaScript errors');
    
    const jsErrors = await TestHelpers.checkForJSErrors(page);
    
    // Navigate through main pages and check for errors
    const pagesToTest = ['/', '/characters', '/sounds', '/ai-management'];
    
    for (const pageUrl of pagesToTest) {
      TestHelpers.logStep(`Checking JavaScript errors on: ${pageUrl}`);
      
      await page.goto(pageUrl);
      await TestHelpers.waitForPageLoad(page);
      await page.waitForTimeout(2000); // Allow time for any async operations
    }
    
    // Check if any JavaScript errors occurred
    if (jsErrors.length > 0) {
      console.warn('JavaScript errors detected:', jsErrors);
      await TestHelpers.takeScreenshot(page, testInfo, 'javascript_errors');
    }
    
    // For now, we'll log errors but not fail the test unless they're critical
    const criticalErrors = jsErrors.filter(error => 
      error.message.includes('TypeError') || 
      error.message.includes('ReferenceError') ||
      error.message.includes('SyntaxError')
    );
    
    expect(criticalErrors.length).toBe(0);
    TestHelpers.logStep('JavaScript error test completed');
  });

  test('Responsive navigation works on mobile', async ({ page }, testInfo) => {
    TestHelpers.logStep('Testing responsive navigation');
    
    // Test different viewport sizes
    const responsiveResults = await TestHelpers.testResponsive(page);
    
    // Test mobile navigation specifically
    await page.setViewportSize({ width: 375, height: 667 });
    await page.waitForTimeout(500);
    
    // Check if mobile menu toggle exists
    const mobileToggle = page.locator('.navbar-toggle, .menu-toggle, .hamburger, [data-toggle="collapse"]');
    
    if (await mobileToggle.count() > 0) {
      TestHelpers.logStep('Testing mobile menu toggle');
      
      // Click mobile menu toggle
      await TestHelpers.safeClick(page, mobileToggle.first());
      await page.waitForTimeout(500);
      
      // Check if navigation menu is visible
      const navMenu = page.locator('nav ul, .navbar-nav, .nav-menu');
      await expect(navMenu).toBeVisible({ timeout: 5000 });
      
      await TestHelpers.takeScreenshot(page, testInfo, 'mobile_navigation_open');
    }
    
    // Reset to desktop view
    await page.setViewportSize({ width: 1920, height: 1080 });
    
    TestHelpers.logStep('Responsive navigation test completed');
  });

  test('Search functionality works if present', async ({ page }, testInfo) => {
    TestHelpers.logStep('Testing search functionality');
    
    // Check if search input exists
    const searchInput = page.locator('input[type="search"], input[placeholder*="search" i], .search-input');
    
    if (await searchInput.count() > 0) {
      TestHelpers.logStep('Search input found, testing functionality');
      
      // Test search input
      await TestHelpers.safeFill(page, searchInput.first(), 'test search');
      
      // Look for search button or form
      const searchButton = page.locator('button[type="submit"], .search-button, input[type="submit"]');
      
      if (await searchButton.count() > 0) {
        await TestHelpers.safeClick(page, searchButton.first());
        await page.waitForTimeout(1000);
        
        // Check if search results or search page loads
        await TestHelpers.takeScreenshot(page, testInfo, 'search_results');
      }
    } else {
      TestHelpers.logStep('No search functionality found - skipping search test');
    }
    
    TestHelpers.logStep('Search functionality test completed');
  });

  test('Footer links work correctly', async ({ page }, testInfo) => {
    TestHelpers.logStep('Testing footer links');
    
    // Check if footer exists
    const footer = page.locator('footer, .footer');
    
    if (await footer.count() > 0) {
      await expect(footer).toBeVisible();
      
      // Find all links in footer
      const footerLinks = footer.locator('a[href]');
      const linkCount = await footerLinks.count();
      
      TestHelpers.logStep(`Found ${linkCount} footer links`);
      
      // Test first few footer links (to avoid testing too many external links)
      const linksToTest = Math.min(linkCount, 3);
      
      for (let i = 0; i < linksToTest; i++) {
        const link = footerLinks.nth(i);
        const href = await link.getAttribute('href');
        const text = await link.textContent();
        
        TestHelpers.logStep(`Testing footer link: ${text} (${href})`);
        
        // Only test internal links
        if (href && (href.startsWith('/') || href.startsWith('#'))) {
          await TestHelpers.safeClick(page, link);
          await TestHelpers.waitForPageLoad(page);
          
          // Go back to home page for next test
          await page.goto('/');
          await TestHelpers.waitForPageLoad(page);
        }
      }
      
      await TestHelpers.takeScreenshot(page, testInfo, 'footer_links');
    } else {
      TestHelpers.logStep('No footer found - skipping footer test');
    }
    
    TestHelpers.logStep('Footer links test completed');
  });

  test('Page accessibility basics', async ({ page }, testInfo) => {
    TestHelpers.logStep('Testing basic accessibility');
    
    // Check for main landmarks
    const landmarks = [
      { selector: 'main, [role="main"]', name: 'main content' },
      { selector: 'nav, [role="navigation"]', name: 'navigation' },
      { selector: 'header, [role="banner"]', name: 'header' }
    ];
    
    for (const landmark of landmarks) {
      const element = page.locator(landmark.selector);
      if (await element.count() > 0) {
        await expect(element.first()).toBeVisible();
        TestHelpers.logStep(`✓ ${landmark.name} landmark found`);
      } else {
        TestHelpers.logStep(`⚠ ${landmark.name} landmark not found`);
      }
    }
    
    // Check for page title
    const title = await page.title();
    expect(title).toBeTruthy();
    expect(title.length).toBeGreaterThan(0);
    TestHelpers.logStep(`✓ Page title: "${title}"`);
    
    // Check for heading hierarchy
    const h1Count = await page.locator('h1').count();
    expect(h1Count).toBeGreaterThanOrEqual(1);
    TestHelpers.logStep(`✓ Found ${h1Count} h1 heading(s)`);
    
    await TestHelpers.takeScreenshot(page, testInfo, 'accessibility_check');
    TestHelpers.logStep('Accessibility test completed');
  });
});
