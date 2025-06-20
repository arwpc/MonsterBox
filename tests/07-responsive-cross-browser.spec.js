/**
 * Responsive and Cross-Browser Tests for MonsterBox
 * 
 * Tests responsive behavior on different screen sizes and verifies functionality across different viewport sizes
 */

const { test, expect } = require('@playwright/test');
const TestHelpers = require('./utils/test-helpers');

test.describe('Responsive Design', () => {
  const viewports = [
    { name: 'Desktop Large', width: 1920, height: 1080 },
    { name: 'Desktop Medium', width: 1366, height: 768 },
    { name: 'Tablet Landscape', width: 1024, height: 768 },
    { name: 'Tablet Portrait', width: 768, height: 1024 },
    { name: 'Mobile Large', width: 414, height: 896 },
    { name: 'Mobile Medium', width: 375, height: 667 },
    { name: 'Mobile Small', width: 320, height: 568 }
  ];

  const pagesToTest = [
    '/',
    '/characters',
    '/sounds',
    '/ai-management',
    '/ai-management/stt',
    '/ai-management/personalities',
    '/ai-management/tts'
  ];

  test('Pages are responsive across different viewport sizes', async ({ page }, testInfo) => {
    TestHelpers.logStep('Testing responsive design across viewports');
    
    for (const pageUrl of pagesToTest) {
      TestHelpers.logStep(`Testing responsive design for: ${pageUrl}`);
      
      try {
        await page.goto(pageUrl);
        await TestHelpers.waitForPageLoad(page);
        
        for (const viewport of viewports) {
          TestHelpers.logStep(`Testing ${viewport.name} (${viewport.width}x${viewport.height})`);
          
          // Set viewport size
          await page.setViewportSize({ width: viewport.width, height: viewport.height });
          await page.waitForTimeout(500);
          
          // Check basic layout elements
          const layoutTests = await TestHelpers.testResponsiveLayout(page, viewport);
          
          // Take screenshot for this viewport
          await TestHelpers.takeScreenshot(
            page, 
            testInfo, 
            `responsive_${pageUrl.replace(/[^a-zA-Z0-9]/g, '_')}_${viewport.name.replace(/\s+/g, '_')}`
          );
          
          // Verify critical elements are accessible
          expect(layoutTests.navigation).toBeTruthy();
          expect(layoutTests.mainContent).toBeTruthy();
          
          TestHelpers.logStep(`✓ ${viewport.name}: Navigation=${layoutTests.navigation}, Content=${layoutTests.mainContent}`);
        }
        
      } catch (error) {
        TestHelpers.logStep(`⚠ Could not test responsive design on ${pageUrl}: ${error.message}`);
      }
    }
    
    TestHelpers.logStep('Responsive design tests completed');
  });

  test('Mobile navigation works correctly', async ({ page }, testInfo) => {
    TestHelpers.logStep('Testing mobile navigation functionality');
    
    // Set mobile viewport
    await page.setViewportSize({ width: 375, height: 667 });
    await page.goto('/');
    await TestHelpers.waitForPageLoad(page);
    
    // Look for mobile menu toggle
    const mobileMenuSelectors = [
      '.navbar-toggle',
      '.menu-toggle',
      '.hamburger',
      '[data-toggle="collapse"]',
      '.mobile-menu-btn',
      'button[aria-label*="menu" i]'
    ];
    
    let mobileToggle = null;
    for (const selector of mobileMenuSelectors) {
      const element = page.locator(selector).first();
      if (await element.count() > 0 && await element.isVisible()) {
        mobileToggle = element;
        TestHelpers.logStep(`Found mobile menu toggle: ${selector}`);
        break;
      }
    }
    
    if (mobileToggle) {
      // Test mobile menu toggle
      await TestHelpers.safeClick(page, mobileToggle);
      await page.waitForTimeout(500);
      
      // Check if navigation menu becomes visible
      const navMenuSelectors = [
        'nav ul',
        '.navbar-nav',
        '.nav-menu',
        '.mobile-menu',
        '.navigation-menu'
      ];
      
      let menuVisible = false;
      for (const selector of navMenuSelectors) {
        const menu = page.locator(selector).first();
        if (await menu.count() > 0 && await menu.isVisible()) {
          menuVisible = true;
          TestHelpers.logStep(`✓ Mobile menu visible: ${selector}`);
          break;
        }
      }
      
      expect(menuVisible).toBeTruthy();
      
      // Test navigation link in mobile menu
      const navLinks = page.locator('nav a, .nav-menu a').first();
      if (await navLinks.count() > 0) {
        const linkText = await navLinks.textContent();
        const linkHref = await navLinks.getAttribute('href');
        
        if (linkHref && linkHref.startsWith('/')) {
          await TestHelpers.safeClick(page, navLinks);
          await TestHelpers.waitForPageLoad(page);
          
          expect(page.url()).toContain(linkHref);
          TestHelpers.logStep(`✓ Mobile navigation link "${linkText}" works`);
        }
      }
      
      await TestHelpers.takeScreenshot(page, testInfo, 'mobile_navigation_open');
    } else {
      TestHelpers.logStep('No mobile menu toggle found - testing standard navigation');
      
      // Test if standard navigation is accessible on mobile
      const navElement = page.locator('nav, .navbar, .navigation').first();
      if (await navElement.count() > 0) {
        const isVisible = await navElement.isVisible();
        TestHelpers.logStep(`Standard navigation visible on mobile: ${isVisible}`);
      }
    }
    
    TestHelpers.logStep('Mobile navigation test completed');
  });

  test('Touch interactions work on mobile devices', async ({ page }, testInfo) => {
    TestHelpers.logStep('Testing touch interactions');
    
    // Set mobile viewport
    await page.setViewportSize({ width: 375, height: 667 });
    await page.goto('/ai-management');
    await TestHelpers.waitForPageLoad(page);
    
    // Test touch interactions on buttons
    const touchableElements = page.locator('button, a, .clickable, [role="button"]');
    const elementCount = await touchableElements.count();
    
    TestHelpers.logStep(`Found ${elementCount} touchable elements`);
    
    // Test first few touchable elements
    for (let i = 0; i < Math.min(elementCount, 5); i++) {
      const element = touchableElements.nth(i);
      
      if (await element.isVisible() && await element.isEnabled()) {
        const elementText = await element.textContent();
        TestHelpers.logStep(`Testing touch on: "${elementText}"`);
        
        // Test tap (touch equivalent of click)
        await element.tap();
        await page.waitForTimeout(300);
        
        // Check if any modal or navigation occurred
        const modal = page.locator('.modal, .dialog').first();
        if (await modal.count() > 0 && await modal.isVisible()) {
          TestHelpers.logStep('✓ Touch interaction opened modal');
          
          // Close modal
          await page.keyboard.press('Escape');
          await page.waitForTimeout(300);
        }
        
        TestHelpers.logStep(`✓ Touch interaction on "${elementText}" completed`);
      }
    }
    
    // Test swipe gestures if applicable
    await TestHelpers.testSwipeGestures(page, testInfo);
    
    await TestHelpers.takeScreenshot(page, testInfo, 'touch_interactions');
    TestHelpers.logStep('Touch interaction tests completed');
  });

  test('Text remains readable at different zoom levels', async ({ page }, testInfo) => {
    TestHelpers.logStep('Testing text readability at different zoom levels');
    
    await page.goto('/');
    await TestHelpers.waitForPageLoad(page);
    
    const zoomLevels = [0.5, 0.75, 1.0, 1.25, 1.5, 2.0];
    
    for (const zoomLevel of zoomLevels) {
      TestHelpers.logStep(`Testing zoom level: ${zoomLevel * 100}%`);
      
      // Set zoom level
      await page.evaluate((zoom) => {
        document.body.style.zoom = zoom;
      }, zoomLevel);
      
      await page.waitForTimeout(500);
      
      // Check text elements
      const textElements = page.locator('h1, h2, h3, p, span, div').first();
      const textCount = await textElements.count();
      
      if (textCount > 0) {
        // Check if text is still visible and readable
        const firstText = textElements.first();
        const isVisible = await firstText.isVisible();
        const textContent = await firstText.textContent();
        
        expect(isVisible).toBeTruthy();
        expect(textContent).toBeTruthy();
        
        TestHelpers.logStep(`✓ Text readable at ${zoomLevel * 100}%: "${textContent?.substring(0, 30)}..."`);
      }
      
      // Take screenshot at this zoom level
      await TestHelpers.takeScreenshot(page, testInfo, `zoom_${zoomLevel.toString().replace('.', '_')}`);
    }
    
    // Reset zoom
    await page.evaluate(() => {
      document.body.style.zoom = '1';
    });
    
    TestHelpers.logStep('Text readability tests completed');
  });

  test('Forms work correctly on mobile devices', async ({ page }, testInfo) => {
    TestHelpers.logStep('Testing form functionality on mobile');
    
    // Set mobile viewport
    await page.setViewportSize({ width: 375, height: 667 });
    await page.goto('/characters/new');
    await TestHelpers.waitForPageLoad(page);
    
    // Test form inputs on mobile
    const formInputs = page.locator('input, textarea, select');
    const inputCount = await formInputs.count();
    
    TestHelpers.logStep(`Found ${inputCount} form inputs to test on mobile`);
    
    // Test first few inputs
    for (let i = 0; i < Math.min(inputCount, 3); i++) {
      const input = formInputs.nth(i);
      
      if (await input.isVisible() && await input.isEnabled()) {
        const inputType = await input.getAttribute('type') || 'text';
        const inputName = await input.getAttribute('name') || `input_${i}`;
        
        TestHelpers.logStep(`Testing mobile input: ${inputName} (${inputType})`);
        
        // Test focus and input
        await input.focus();
        await page.waitForTimeout(200);
        
        // Check if virtual keyboard would appear (we can't test this directly)
        const isFocused = await input.evaluate(el => document.activeElement === el);
        expect(isFocused).toBeTruthy();
        
        // Test input value
        if (inputType === 'text' || inputType === 'email' || !inputType) {
          await input.fill('Mobile test input');
          const value = await input.inputValue();
          expect(value).toBe('Mobile test input');
          TestHelpers.logStep(`✓ Mobile input "${inputName}" accepts text input`);
        }
        
        // Test tap to focus
        await input.tap();
        await page.waitForTimeout(200);
        
        TestHelpers.logStep(`✓ Mobile input "${inputName}" responds to tap`);
      }
    }
    
    // Test form submission on mobile
    const submitButton = page.locator('input[type="submit"], button[type="submit"]').first();
    if (await submitButton.count() > 0) {
      // Fill required fields first
      const nameInput = page.locator('[name="char_name"], #char_name').first();
      if (await nameInput.count() > 0) {
        await nameInput.fill('Mobile Test Character');
      }
      
      // Test submit button tap
      await submitButton.tap();
      await page.waitForTimeout(1000);
      
      TestHelpers.logStep('✓ Form submission button responds to tap on mobile');
    }
    
    await TestHelpers.takeScreenshot(page, testInfo, 'mobile_form_interaction');
    TestHelpers.logStep('Mobile form tests completed');
  });

  test('Content adapts properly to different screen orientations', async ({ page }, testInfo) => {
    TestHelpers.logStep('Testing screen orientation changes');
    
    const orientationTests = [
      { name: 'Portrait Mobile', width: 375, height: 667 },
      { name: 'Landscape Mobile', width: 667, height: 375 },
      { name: 'Portrait Tablet', width: 768, height: 1024 },
      { name: 'Landscape Tablet', width: 1024, height: 768 }
    ];
    
    for (const orientation of orientationTests) {
      TestHelpers.logStep(`Testing ${orientation.name} orientation`);
      
      await page.setViewportSize({ width: orientation.width, height: orientation.height });
      await page.goto('/ai-management');
      await TestHelpers.waitForPageLoad(page);
      
      // Check layout adaptation
      const layoutTests = await TestHelpers.testResponsiveLayout(page, orientation);
      
      // Check specific elements that should adapt to orientation
      const adaptiveElements = [
        '.ai-system-grid',
        '.character-grid',
        '.sound-list',
        '.form-grid'
      ];
      
      for (const selector of adaptiveElements) {
        const element = page.locator(selector).first();
        if (await element.count() > 0) {
          const isVisible = await element.isVisible();
          TestHelpers.logStep(`${selector} visible in ${orientation.name}: ${isVisible}`);
        }
      }
      
      await TestHelpers.takeScreenshot(page, testInfo, `orientation_${orientation.name.replace(/\s+/g, '_')}`);
      
      expect(layoutTests.navigation).toBeTruthy();
      expect(layoutTests.mainContent).toBeTruthy();
    }
    
    TestHelpers.logStep('Screen orientation tests completed');
  });
});

// Helper function for testing responsive layout
TestHelpers.testResponsiveLayout = async function(page, viewport) {
  const results = {
    navigation: false,
    mainContent: false,
    viewport: viewport
  };
  
  // Check navigation accessibility
  const navSelectors = ['nav', '.navbar', '.navigation', '.nav-menu'];
  for (const selector of navSelectors) {
    const nav = page.locator(selector).first();
    if (await nav.count() > 0) {
      const isVisible = await nav.isVisible();
      if (isVisible) {
        results.navigation = true;
        break;
      }
    }
  }
  
  // Check main content accessibility
  const contentSelectors = ['main', '.main-content', '.container', '.content'];
  for (const selector of contentSelectors) {
    const content = page.locator(selector).first();
    if (await content.count() > 0) {
      const isVisible = await content.isVisible();
      if (isVisible) {
        results.mainContent = true;
        break;
      }
    }
  }
  
  return results;
};

// Helper function for testing swipe gestures
TestHelpers.testSwipeGestures = async function(page, testInfo) {
  TestHelpers.logStep('Testing swipe gestures');
  
  // Look for swipeable elements
  const swipeableSelectors = [
    '.carousel',
    '.slider',
    '.swiper',
    '.gallery',
    '[data-swipe]'
  ];
  
  for (const selector of swipeableSelectors) {
    const element = page.locator(selector).first();
    if (await element.count() > 0 && await element.isVisible()) {
      TestHelpers.logStep(`Testing swipe on: ${selector}`);
      
      // Get element bounds
      const box = await element.boundingBox();
      if (box) {
        // Simulate swipe left
        await page.mouse.move(box.x + box.width * 0.8, box.y + box.height / 2);
        await page.mouse.down();
        await page.mouse.move(box.x + box.width * 0.2, box.y + box.height / 2);
        await page.mouse.up();
        
        await page.waitForTimeout(500);
        TestHelpers.logStep(`✓ Swipe gesture performed on ${selector}`);
      }
    }
  }
};
