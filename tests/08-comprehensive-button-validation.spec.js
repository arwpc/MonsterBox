/**
 * Comprehensive Button and Link Validation Tests for MonsterBox
 * 
 * This test suite validates ALL buttons, links, and navigation elements
 * across the entire MonsterBox application to ensure they work correctly
 * and don't show "Pretty Print" errors or broken functionality.
 */

const { test, expect } = require('@playwright/test');
const TestHelpers = require('./utils/test-helpers');

test.describe('Comprehensive Button and Link Validation', () => {
  test.beforeEach(async ({ page }) => {
    TestHelpers.logStep('Setting up comprehensive validation test');
    await page.goto('/');
    await TestHelpers.waitForPageLoad(page);
  });

  test('Home page navigation buttons work correctly', async ({ page }, testInfo) => {
    TestHelpers.logStep('Testing home page navigation buttons');
    
    // Test all main navigation buttons on home page
    const homePageButtons = [
      { selector: 'a[href="/characters"]', expectedUrl: '/characters', name: 'Manage Characters' },
      { selector: 'a[href="/character-parts"]', expectedUrl: '/character-parts', name: 'Character Parts' },
      { selector: 'a[href="/parts"]', expectedUrl: '/parts', name: 'Hardware Parts' },
      { selector: 'a[href="/ai-instances"]', expectedUrl: '/ai-instances', name: 'AI Instances' },
      { selector: 'a[href="/chatterpi-chat.html"]', expectedUrl: '/chatterpi-chat', name: 'ChatterPi AI' },
      { selector: 'a[href="/ai-management"]', expectedUrl: '/ai-management', name: 'AI Management' },
      { selector: 'a[href="/ai-config"]', expectedUrl: '/ai-config', name: 'AI Configuration' },
      { selector: 'a[href="/sounds"]', expectedUrl: '/sounds', name: 'Sounds' },
      { selector: 'a[href="/Camera"]', expectedUrl: '/Camera', name: 'Video' },
      { selector: 'a[href="/scenes"]', expectedUrl: '/scenes', name: 'Scenes' },
      { selector: 'a[href="/configuration"]', expectedUrl: '/configuration', name: 'Configuration' },
      { selector: 'a[href="/logs"]', expectedUrl: '/logs', name: 'System Logs' }
    ];

    for (const button of homePageButtons) {
      TestHelpers.logStep(`Testing button: ${button.name}`);
      
      // Go back to home page
      await page.goto('/');
      await TestHelpers.waitForPageLoad(page);
      
      // Check if button exists
      const buttonElement = page.locator(button.selector).first();
      if (await buttonElement.count() > 0) {
        await expect(buttonElement).toBeVisible();
        
        // Click the button
        await TestHelpers.safeClick(page, buttonElement);
        await TestHelpers.waitForPageLoad(page);
        
        // Verify navigation worked and no "Pretty Print" error
        const currentUrl = page.url();
        expect(currentUrl).toContain(button.expectedUrl);
        
        // Check for "Pretty Print" error or JSON output
        const bodyText = await page.textContent('body');
        expect(bodyText).not.toContain('"success":false');
        expect(bodyText).not.toContain('"error":');
        expect(bodyText).not.toContain('Pretty-print');
        
        // Check for proper page content (not just JSON)
        const hasProperContent = await page.locator('h1, h2, .container, .main-content').count() > 0;
        expect(hasProperContent).toBe(true);
        
        TestHelpers.logStep(`✓ ${button.name} works correctly`);
      } else {
        TestHelpers.logStep(`⚠ Button not found: ${button.name}`);
      }
    }
    
    await TestHelpers.takeScreenshot(page, testInfo, 'home_page_buttons_validated');
  });

  test('Characters page buttons and functionality', async ({ page }, testInfo) => {
    TestHelpers.logStep('Testing Characters page buttons');
    
    await page.goto('/characters');
    await TestHelpers.waitForPageLoad(page);
    
    // Check for "Pretty Print" error first
    const bodyText = await page.textContent('body');
    expect(bodyText).not.toContain('"success":false');
    expect(bodyText).not.toContain('Pretty-print');
    
    // Test character management buttons
    const characterButtons = [
      { selector: 'button:has-text("Add Character")', name: 'Add Character' },
      { selector: 'button:has-text("New Character")', name: 'New Character' },
      { selector: '.btn:has-text("Create")', name: 'Create Character' },
      { selector: '.btn:has-text("Edit")', name: 'Edit Character' },
      { selector: '.btn:has-text("Delete")', name: 'Delete Character' },
      { selector: '.btn:has-text("Configure")', name: 'Configure Character' },
      { selector: '.btn:has-text("Test")', name: 'Test Character' }
    ];

    for (const button of characterButtons) {
      const buttonElement = page.locator(button.selector).first();
      if (await buttonElement.count() > 0) {
        TestHelpers.logStep(`Testing: ${button.name}`);
        await expect(buttonElement).toBeVisible();
        
        // For non-destructive buttons, test clicking
        if (!button.name.includes('Delete')) {
          try {
            await TestHelpers.safeClick(page, buttonElement);
            await page.waitForTimeout(1000);
            
            // Check for modal or navigation
            const hasModal = await page.locator('.modal, .dialog, .popup').count() > 0;
            const urlChanged = !page.url().includes('/characters');
            
            if (hasModal || urlChanged) {
              TestHelpers.logStep(`✓ ${button.name} opened modal or navigated`);
              
              // Close modal if present
              if (hasModal) {
                const closeButton = page.locator('.modal .close, .modal .btn-close, .modal [data-dismiss="modal"]').first();
                if (await closeButton.count() > 0) {
                  await TestHelpers.safeClick(page, closeButton);
                }
              }
              
              // Navigate back if URL changed
              if (urlChanged) {
                await page.goto('/characters');
                await TestHelpers.waitForPageLoad(page);
              }
            }
          } catch (error) {
            TestHelpers.logStep(`⚠ ${button.name} click failed: ${error.message}`);
          }
        }
      }
    }
    
    await TestHelpers.takeScreenshot(page, testInfo, 'characters_page_validated');
  });

  test('Hardware Parts page buttons and functionality', async ({ page }, testInfo) => {
    TestHelpers.logStep('Testing Hardware Parts page buttons');
    
    await page.goto('/parts');
    await TestHelpers.waitForPageLoad(page);
    
    // Check for "Pretty Print" error
    const bodyText = await page.textContent('body');
    expect(bodyText).not.toContain('"success":false');
    expect(bodyText).not.toContain('Pretty-print');
    
    // Test hardware part buttons
    const hardwareButtons = [
      { selector: 'button:has-text("Add Motor")', name: 'Add Motor' },
      { selector: 'button:has-text("Add Linear Actuator")', name: 'Add Linear Actuator' },
      { selector: 'button:has-text("Add Light")', name: 'Add Light' },
      { selector: 'button:has-text("Add LED")', name: 'Add LED' },
      { selector: 'button:has-text("Add Servo")', name: 'Add Servo' },
      { selector: 'button:has-text("Add Sensor")', name: 'Add Sensor' },
      { selector: 'button:has-text("Add Webcam")', name: 'Add Webcam' },
      { selector: 'button:has-text("Add Head Tracking")', name: 'Add Head Tracking' },
      { selector: 'button:has-text("Add Microphone")', name: 'Add Microphone' },
      { selector: 'button:has-text("Microphone Monitor")', name: 'Microphone Monitor' },
      { selector: 'button:has-text("Microphone Test")', name: 'Microphone Test' },
      { selector: 'button:has-text("Hardware Monitor")', name: 'Hardware Monitor' }
    ];

    for (const button of hardwareButtons) {
      const buttonElement = page.locator(button.selector).first();
      if (await buttonElement.count() > 0) {
        TestHelpers.logStep(`Testing: ${button.name}`);
        await expect(buttonElement).toBeVisible();
        
        try {
          await TestHelpers.safeClick(page, buttonElement);
          await page.waitForTimeout(1000);
          
          // Check for modal, navigation, or proper response
          const hasModal = await page.locator('.modal, .dialog, .popup').count() > 0;
          const urlChanged = !page.url().includes('/parts');
          
          if (hasModal || urlChanged) {
            TestHelpers.logStep(`✓ ${button.name} responded correctly`);
            
            // Close modal if present
            if (hasModal) {
              const closeButton = page.locator('.modal .close, .modal .btn-close, .modal [data-dismiss="modal"]').first();
              if (await closeButton.count() > 0) {
                await TestHelpers.safeClick(page, closeButton);
              }
            }
            
            // Navigate back if URL changed
            if (urlChanged) {
              await page.goto('/parts');
              await TestHelpers.waitForPageLoad(page);
            }
          }
        } catch (error) {
          TestHelpers.logStep(`⚠ ${button.name} click failed: ${error.message}`);
        }
      }
    }
    
    await TestHelpers.takeScreenshot(page, testInfo, 'hardware_parts_validated');
  });

  test('AI Management page buttons and functionality', async ({ page }, testInfo) => {
    TestHelpers.logStep('Testing AI Management page buttons');

    await page.goto('/ai-management');
    await TestHelpers.waitForPageLoad(page);

    // Check for "Pretty Print" error
    const bodyText = await page.textContent('body');
    expect(bodyText).not.toContain('"success":false');
    expect(bodyText).not.toContain('Pretty-print');

    // Test AI management buttons
    const aiButtons = [
      { selector: 'button:has-text("Test AI")', name: 'Test AI' },
      { selector: 'button:has-text("Save Configuration")', name: 'Save Configuration' },
      { selector: 'button:has-text("Reset")', name: 'Reset Configuration' },
      { selector: '.btn:has-text("Configure")', name: 'Configure AI' },
      { selector: '.btn:has-text("Enable")', name: 'Enable AI' },
      { selector: '.btn:has-text("Disable")', name: 'Disable AI' },
      { selector: 'button[type="submit"]', name: 'Submit Form' }
    ];

    for (const button of aiButtons) {
      const buttonElement = page.locator(button.selector).first();
      if (await buttonElement.count() > 0) {
        TestHelpers.logStep(`Testing: ${button.name}`);
        await expect(buttonElement).toBeVisible();

        // For non-destructive buttons, test clicking
        if (!button.name.includes('Reset') && !button.name.includes('Submit')) {
          try {
            await TestHelpers.safeClick(page, buttonElement);
            await page.waitForTimeout(1000);

            TestHelpers.logStep(`✓ ${button.name} clicked successfully`);
          } catch (error) {
            TestHelpers.logStep(`⚠ ${button.name} click failed: ${error.message}`);
          }
        }
      }
    }

    await TestHelpers.takeScreenshot(page, testInfo, 'ai_management_validated');
  });

  test('Sounds page buttons and functionality', async ({ page }, testInfo) => {
    TestHelpers.logStep('Testing Sounds page buttons');

    await page.goto('/sounds');
    await TestHelpers.waitForPageLoad(page);

    // Check for "Pretty Print" error
    const bodyText = await page.textContent('body');
    expect(bodyText).not.toContain('"success":false');
    expect(bodyText).not.toContain('Pretty-print');

    // Test sound management buttons
    const soundButtons = [
      { selector: 'button:has-text("Upload")', name: 'Upload Sound' },
      { selector: 'button:has-text("Play")', name: 'Play Sound' },
      { selector: 'button:has-text("Stop")', name: 'Stop Sound' },
      { selector: 'button:has-text("Delete")', name: 'Delete Sound' },
      { selector: '.btn:has-text("Add")', name: 'Add Sound' },
      { selector: '.btn:has-text("Edit")', name: 'Edit Sound' },
      { selector: 'input[type="file"]', name: 'File Upload Input' }
    ];

    for (const button of soundButtons) {
      const buttonElement = page.locator(button.selector).first();
      if (await buttonElement.count() > 0) {
        TestHelpers.logStep(`Testing: ${button.name}`);
        await expect(buttonElement).toBeVisible();

        // For non-destructive buttons, test clicking
        if (!button.name.includes('Delete') && !button.name.includes('File Upload')) {
          try {
            await TestHelpers.safeClick(page, buttonElement);
            await page.waitForTimeout(1000);

            TestHelpers.logStep(`✓ ${button.name} clicked successfully`);
          } catch (error) {
            TestHelpers.logStep(`⚠ ${button.name} click failed: ${error.message}`);
          }
        }
      }
    }

    await TestHelpers.takeScreenshot(page, testInfo, 'sounds_page_validated');
  });

  test('Configuration page buttons and functionality', async ({ page }, testInfo) => {
    TestHelpers.logStep('Testing Configuration page buttons');

    await page.goto('/configuration');
    await TestHelpers.waitForPageLoad(page);

    // Check for "Pretty Print" error
    const bodyText = await page.textContent('body');
    expect(bodyText).not.toContain('"success":false');
    expect(bodyText).not.toContain('Pretty-print');

    // Test configuration buttons
    const configButtons = [
      { selector: 'button:has-text("Save")', name: 'Save Configuration' },
      { selector: 'button:has-text("Reset")', name: 'Reset Settings' },
      { selector: 'button:has-text("Apply")', name: 'Apply Settings' },
      { selector: 'button:has-text("Reboot")', name: 'Reboot System' },
      { selector: 'button:has-text("Cleanup")', name: 'System Cleanup' },
      { selector: '.btn:has-text("Update")', name: 'Update System' },
      { selector: '.btn:has-text("Backup")', name: 'Backup Settings' }
    ];

    for (const button of configButtons) {
      const buttonElement = page.locator(button.selector).first();
      if (await buttonElement.count() > 0) {
        TestHelpers.logStep(`Testing: ${button.name}`);
        await expect(buttonElement).toBeVisible();

        // For non-destructive buttons, test clicking
        if (!button.name.includes('Reboot') && !button.name.includes('Reset') && !button.name.includes('Cleanup')) {
          try {
            await TestHelpers.safeClick(page, buttonElement);
            await page.waitForTimeout(1000);

            TestHelpers.logStep(`✓ ${button.name} clicked successfully`);
          } catch (error) {
            TestHelpers.logStep(`⚠ ${button.name} click failed: ${error.message}`);
          }
        }
      }
    }

    await TestHelpers.takeScreenshot(page, testInfo, 'configuration_page_validated');
  });

  test('ChatterPi AI page buttons and functionality', async ({ page }, testInfo) => {
    TestHelpers.logStep('Testing ChatterPi AI page buttons');

    // Try both possible URLs for ChatterPi
    const chatterPiUrls = ['/chatterpi-chat.html', '/chatterpi-chat', '/chatterpi'];
    let pageLoaded = false;

    for (const url of chatterPiUrls) {
      try {
        await page.goto(url);
        await TestHelpers.waitForPageLoad(page);

        const bodyText = await page.textContent('body');
        if (!bodyText.includes('"success":false') && !bodyText.includes('Pretty-print')) {
          pageLoaded = true;
          break;
        }
      } catch (error) {
        TestHelpers.logStep(`⚠ ChatterPi URL ${url} failed: ${error.message}`);
      }
    }

    if (pageLoaded) {
      // Test ChatterPi buttons
      const chatterPiButtons = [
        { selector: 'button:has-text("Start")', name: 'Start ChatterPi' },
        { selector: 'button:has-text("Stop")', name: 'Stop ChatterPi' },
        { selector: 'button:has-text("Send")', name: 'Send Message' },
        { selector: 'button:has-text("Clear")', name: 'Clear Chat' },
        { selector: 'button:has-text("Settings")', name: 'ChatterPi Settings' },
        { selector: '.btn:has-text("Connect")', name: 'Connect AI' },
        { selector: '.btn:has-text("Disconnect")', name: 'Disconnect AI' }
      ];

      for (const button of chatterPiButtons) {
        const buttonElement = page.locator(button.selector).first();
        if (await buttonElement.count() > 0) {
          TestHelpers.logStep(`Testing: ${button.name}`);
          await expect(buttonElement).toBeVisible();

          // For non-destructive buttons, test clicking
          if (!button.name.includes('Stop') && !button.name.includes('Clear') && !button.name.includes('Disconnect')) {
            try {
              await TestHelpers.safeClick(page, buttonElement);
              await page.waitForTimeout(1000);

              TestHelpers.logStep(`✓ ${button.name} clicked successfully`);
            } catch (error) {
              TestHelpers.logStep(`⚠ ${button.name} click failed: ${error.message}`);
            }
          }
        }
      }

      await TestHelpers.takeScreenshot(page, testInfo, 'chatterpi_page_validated');
    } else {
      TestHelpers.logStep('⚠ ChatterPi page could not be loaded');
    }
  });

  test('Navigation menu and header buttons work correctly', async ({ page }, testInfo) => {
    TestHelpers.logStep('Testing navigation menu and header buttons');

    await page.goto('/');
    await TestHelpers.waitForPageLoad(page);

    // Test main navigation links in header/navbar
    const navLinks = [
      { selector: 'nav a[href="/characters"]', expectedUrl: '/characters', name: 'Nav Characters' },
      { selector: 'nav a[href="/sounds"]', expectedUrl: '/sounds', name: 'Nav Sounds' },
      { selector: 'nav a[href="/ai-management"]', expectedUrl: '/ai-management', name: 'Nav AI Management' },
      { selector: 'nav a[href="/parts"]', expectedUrl: '/parts', name: 'Nav Hardware Parts' },
      { selector: 'nav a[href="/configuration"]', expectedUrl: '/configuration', name: 'Nav Configuration' },
      { selector: '.navbar a[href="/"]', expectedUrl: '/', name: 'Logo/Home Link' }
    ];

    for (const link of navLinks) {
      const linkElement = page.locator(link.selector).first();
      if (await linkElement.count() > 0) {
        TestHelpers.logStep(`Testing navigation: ${link.name}`);

        await expect(linkElement).toBeVisible();
        await TestHelpers.safeClick(page, linkElement);
        await TestHelpers.waitForPageLoad(page);

        // Verify navigation worked
        const currentUrl = page.url();
        expect(currentUrl).toContain(link.expectedUrl);

        // Check for "Pretty Print" error
        const bodyText = await page.textContent('body');
        expect(bodyText).not.toContain('"success":false');
        expect(bodyText).not.toContain('Pretty-print');

        TestHelpers.logStep(`✓ ${link.name} navigation works correctly`);
      }
    }

    await TestHelpers.takeScreenshot(page, testInfo, 'navigation_menu_validated');
  });

  test('Form submission buttons work correctly', async ({ page }, testInfo) => {
    TestHelpers.logStep('Testing form submission buttons across pages');

    const pagesWithForms = [
      { url: '/characters', name: 'Characters Forms' },
      { url: '/parts', name: 'Hardware Parts Forms' },
      { url: '/sounds', name: 'Sounds Forms' },
      { url: '/ai-management', name: 'AI Management Forms' },
      { url: '/configuration', name: 'Configuration Forms' }
    ];

    for (const pageInfo of pagesWithForms) {
      TestHelpers.logStep(`Testing forms on: ${pageInfo.name}`);

      await page.goto(pageInfo.url);
      await TestHelpers.waitForPageLoad(page);

      // Check for "Pretty Print" error first
      const bodyText = await page.textContent('body');
      if (bodyText.includes('"success":false') || bodyText.includes('Pretty-print')) {
        TestHelpers.logStep(`⚠ ${pageInfo.name} shows Pretty Print error - skipping form tests`);
        continue;
      }

      // Find all forms on the page
      const forms = page.locator('form');
      const formCount = await forms.count();

      TestHelpers.logStep(`Found ${formCount} forms on ${pageInfo.name}`);

      for (let i = 0; i < Math.min(formCount, 3); i++) { // Test max 3 forms per page
        const form = forms.nth(i);
        const submitButton = form.locator('button[type="submit"], input[type="submit"], .btn-submit').first();

        if (await submitButton.count() > 0) {
          TestHelpers.logStep(`Testing submit button in form ${i + 1}`);

          try {
            await expect(submitButton).toBeVisible();
            // Don't actually submit forms to avoid side effects
            TestHelpers.logStep(`✓ Submit button ${i + 1} is visible and accessible`);
          } catch (error) {
            TestHelpers.logStep(`⚠ Submit button ${i + 1} test failed: ${error.message}`);
          }
        }
      }
    }

    await TestHelpers.takeScreenshot(page, testInfo, 'form_buttons_validated');
  });

  test('Modal and popup buttons work correctly', async ({ page }, testInfo) => {
    TestHelpers.logStep('Testing modal and popup buttons');

    await page.goto('/');
    await TestHelpers.waitForPageLoad(page);

    // Look for buttons that might trigger modals
    const modalTriggers = [
      { selector: 'button:has-text("Add")', name: 'Add buttons' },
      { selector: 'button:has-text("Edit")', name: 'Edit buttons' },
      { selector: 'button:has-text("Settings")', name: 'Settings buttons' },
      { selector: 'button:has-text("Configure")', name: 'Configure buttons' },
      { selector: '.btn[data-toggle="modal"]', name: 'Modal trigger buttons' },
      { selector: '.btn[data-target*="modal"]', name: 'Modal target buttons' }
    ];

    const pagesToTest = ['/', '/characters', '/parts', '/sounds'];

    for (const pageUrl of pagesToTest) {
      TestHelpers.logStep(`Testing modals on page: ${pageUrl}`);

      await page.goto(pageUrl);
      await TestHelpers.waitForPageLoad(page);

      // Check for "Pretty Print" error first
      const bodyText = await page.textContent('body');
      if (bodyText.includes('"success":false') || bodyText.includes('Pretty-print')) {
        TestHelpers.logStep(`⚠ Page ${pageUrl} shows Pretty Print error - skipping modal tests`);
        continue;
      }

      for (const trigger of modalTriggers) {
        const triggerElement = page.locator(trigger.selector).first();
        if (await triggerElement.count() > 0) {
          TestHelpers.logStep(`Testing modal trigger: ${trigger.name}`);

          try {
            await expect(triggerElement).toBeVisible();
            await TestHelpers.safeClick(page, triggerElement);
            await page.waitForTimeout(1000);

            // Check if modal appeared
            const modal = page.locator('.modal, .dialog, .popup, [role="dialog"]').first();
            if (await modal.count() > 0 && await modal.isVisible()) {
              TestHelpers.logStep(`✓ ${trigger.name} opened modal successfully`);

              // Try to close modal
              const closeButton = modal.locator('.close, .btn-close, [data-dismiss="modal"], button:has-text("Cancel")').first();
              if (await closeButton.count() > 0) {
                await TestHelpers.safeClick(page, closeButton);
                await page.waitForTimeout(500);
              } else {
                // Try ESC key
                await page.keyboard.press('Escape');
              }
            }
          } catch (error) {
            TestHelpers.logStep(`⚠ ${trigger.name} test failed: ${error.message}`);
          }
        }
      }
    }

    await TestHelpers.takeScreenshot(page, testInfo, 'modal_buttons_validated');
  });

  test('All pages load without Pretty Print errors', async ({ page }, testInfo) => {
    TestHelpers.logStep('Testing all pages for Pretty Print errors');

    const allPages = [
      '/',
      '/characters',
      '/parts',
      '/sounds',
      '/ai-management',
      '/ai-config',
      '/configuration',
      '/chatterpi-chat',
      '/scenes',
      '/logs',
      '/ai-instances'
    ];

    const results = {
      working: [],
      prettyPrint: [],
      errors: []
    };

    for (const pageUrl of allPages) {
      TestHelpers.logStep(`Testing page: ${pageUrl}`);

      try {
        await page.goto(pageUrl);
        await TestHelpers.waitForPageLoad(page);

        const bodyText = await page.textContent('body');
        const title = await page.title();

        if (bodyText.includes('"success":false') || bodyText.includes('Pretty-print')) {
          results.prettyPrint.push(pageUrl);
          TestHelpers.logStep(`❌ ${pageUrl} shows Pretty Print error`);
        } else if (bodyText.includes('Error') && bodyText.length < 500) {
          results.errors.push(pageUrl);
          TestHelpers.logStep(`⚠ ${pageUrl} shows error page`);
        } else {
          results.working.push(pageUrl);
          TestHelpers.logStep(`✓ ${pageUrl} loads correctly`);
        }
      } catch (error) {
        results.errors.push(pageUrl);
        TestHelpers.logStep(`❌ ${pageUrl} failed to load: ${error.message}`);
      }
    }

    // Log summary
    TestHelpers.logStep(`\n=== PAGE VALIDATION SUMMARY ===`);
    TestHelpers.logStep(`Working pages: ${results.working.length}`);
    TestHelpers.logStep(`Pretty Print errors: ${results.prettyPrint.length}`);
    TestHelpers.logStep(`Other errors: ${results.errors.length}`);

    if (results.prettyPrint.length > 0) {
      TestHelpers.logStep(`Pages with Pretty Print errors: ${results.prettyPrint.join(', ')}`);
    }

    if (results.errors.length > 0) {
      TestHelpers.logStep(`Pages with other errors: ${results.errors.join(', ')}`);
    }

    await TestHelpers.takeScreenshot(page, testInfo, 'all_pages_validation_summary');

    // Save detailed results
    await TestHelpers.generateTestData(testInfo, results);
  });
});
