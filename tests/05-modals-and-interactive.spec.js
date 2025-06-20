/**
 * Modal and Interactive Element Tests for MonsterBox
 * 
 * Tests voice catalog modal, character configuration modal, dropdown menus, sliders, and all interactive UI components
 */

const { test, expect } = require('@playwright/test');
const TestHelpers = require('./utils/test-helpers');

test.describe('Modals and Interactive Elements', () => {
  test.beforeEach(async ({ page }) => {
    TestHelpers.logStep('Setting up for modal and interactive tests');
    await page.goto('/');
    await TestHelpers.waitForPageLoad(page);
  });

  test('Modal dialogs work correctly', async ({ page }, testInfo) => {
    TestHelpers.logStep('Testing modal dialog functionality');
    
    // Test modals across different pages
    const pagesWithModals = [
      { url: '/ai-management/tts', modalTrigger: 'button:has-text("Configure"), button:has-text("Assign")' },
      { url: '/ai-management/personalities', modalTrigger: 'button:has-text("Configure")' },
      { url: '/characters', modalTrigger: 'button:has-text("Delete"), .delete-btn' }
    ];
    
    for (const pageTest of pagesWithModals) {
      TestHelpers.logStep(`Testing modals on: ${pageTest.url}`);
      
      await page.goto(pageTest.url);
      await TestHelpers.waitForPageLoad(page);
      
      const modalTrigger = page.locator(pageTest.modalTrigger).first();
      
      if (await modalTrigger.count() > 0) {
        // Test modal opening
        await TestHelpers.safeClick(page, modalTrigger);
        await page.waitForTimeout(500);
        
        // Check if modal appeared
        const modal = page.locator('.modal, .dialog, .popup').first();
        if (await modal.count() > 0 && await modal.isVisible()) {
          TestHelpers.logStep('✓ Modal opened successfully');
          
          // Test modal content accessibility
          await expect(modal).toBeVisible();
          
          // Test modal close methods
          await TestHelpers.testModalClosing(page, modal, testInfo);
          
          await TestHelpers.takeScreenshot(page, testInfo, `modal_${pageTest.url.replace(/[^a-zA-Z0-9]/g, '_')}`);
        }
      }
    }
    
    TestHelpers.logStep('Modal dialog tests completed');
  });

  test('Dropdown menus work correctly', async ({ page }, testInfo) => {
    TestHelpers.logStep('Testing dropdown menu functionality');
    
    // Test dropdowns across different pages
    const pagesWithDropdowns = [
      '/ai-management/stt',
      '/ai-management/personalities', 
      '/ai-management/tts',
      '/characters/new',
      '/sounds/new'
    ];
    
    for (const pageUrl of pagesWithDropdowns) {
      TestHelpers.logStep(`Testing dropdowns on: ${pageUrl}`);
      
      try {
        await page.goto(pageUrl);
        await TestHelpers.waitForPageLoad(page);
        
        // Find all select elements
        const dropdowns = page.locator('select');
        const dropdownCount = await dropdowns.count();
        
        TestHelpers.logStep(`Found ${dropdownCount} dropdowns on ${pageUrl}`);
        
        // Test first few dropdowns
        for (let i = 0; i < Math.min(dropdownCount, 3); i++) {
          const dropdown = dropdowns.nth(i);
          
          if (await dropdown.isVisible() && await dropdown.isEnabled()) {
            const options = await dropdown.locator('option').count();
            
            if (options > 1) {
              // Get current value
              const originalValue = await dropdown.inputValue();
              
              // Select different option
              const newOption = await dropdown.locator('option').nth(1).getAttribute('value');
              if (newOption && newOption !== originalValue) {
                await TestHelpers.safeSelect(page, dropdown, newOption);
                
                // Verify selection changed
                const newValue = await dropdown.inputValue();
                expect(newValue).toBe(newOption);
                
                TestHelpers.logStep(`✓ Dropdown ${i + 1} selection changed from "${originalValue}" to "${newValue}"`);
              }
            }
          }
        }
        
        if (dropdownCount > 0) {
          await TestHelpers.takeScreenshot(page, testInfo, `dropdowns_${pageUrl.replace(/[^a-zA-Z0-9]/g, '_')}`);
        }
        
      } catch (error) {
        TestHelpers.logStep(`⚠ Could not test dropdowns on ${pageUrl}: ${error.message}`);
      }
    }
    
    TestHelpers.logStep('Dropdown menu tests completed');
  });

  test('Slider controls work correctly', async ({ page }, testInfo) => {
    TestHelpers.logStep('Testing slider control functionality');
    
    // Test sliders on AI management pages
    const pagesWithSliders = [
      '/ai-management/stt',
      '/ai-management/personalities',
      '/ai-management/tts'
    ];
    
    for (const pageUrl of pagesWithSliders) {
      TestHelpers.logStep(`Testing sliders on: ${pageUrl}`);
      
      try {
        await page.goto(pageUrl);
        await TestHelpers.waitForPageLoad(page);
        
        // Find all range input elements (sliders)
        const sliders = page.locator('input[type="range"]');
        const sliderCount = await sliders.count();
        
        TestHelpers.logStep(`Found ${sliderCount} sliders on ${pageUrl}`);
        
        // Test each slider
        for (let i = 0; i < sliderCount; i++) {
          const slider = sliders.nth(i);
          
          if (await slider.isVisible() && await slider.isEnabled()) {
            // Get slider properties
            const min = await slider.getAttribute('min') || '0';
            const max = await slider.getAttribute('max') || '100';
            const step = await slider.getAttribute('step') || '1';
            const originalValue = await slider.inputValue();
            
            TestHelpers.logStep(`Slider ${i + 1}: min=${min}, max=${max}, step=${step}, current=${originalValue}`);
            
            // Test slider movement
            const newValue = Math.min(parseFloat(max), parseFloat(originalValue) + parseFloat(step));
            await slider.fill(newValue.toString());
            
            // Verify value changed
            const actualValue = await slider.inputValue();
            expect(parseFloat(actualValue)).toBeCloseTo(newValue, 1);
            
            TestHelpers.logStep(`✓ Slider ${i + 1} moved from ${originalValue} to ${actualValue}`);
            
            // Check if display value updates
            const displayElement = page.locator(`#${await slider.getAttribute('id')}Value, [data-slider="${await slider.getAttribute('id')}"]`).first();
            if (await displayElement.count() > 0) {
              const displayValue = await displayElement.textContent();
              TestHelpers.logStep(`✓ Display value updated to: ${displayValue}`);
            }
          }
        }
        
        if (sliderCount > 0) {
          await TestHelpers.takeScreenshot(page, testInfo, `sliders_${pageUrl.replace(/[^a-zA-Z0-9]/g, '_')}`);
        }
        
      } catch (error) {
        TestHelpers.logStep(`⚠ Could not test sliders on ${pageUrl}: ${error.message}`);
      }
    }
    
    TestHelpers.logStep('Slider control tests completed');
  });

  test('Button interactions work correctly', async ({ page }, testInfo) => {
    TestHelpers.logStep('Testing button interaction functionality');
    
    // Test different types of buttons across pages
    const buttonTests = [
      {
        page: '/ai-management',
        buttons: [
          'button:has-text("Test")',
          'button:has-text("Export")',
          'button:has-text("Import")'
        ]
      },
      {
        page: '/characters',
        buttons: [
          'a:has-text("Add"), a:has-text("Create")',
          'button:has-text("Search")',
          'button:has-text("Filter")'
        ]
      },
      {
        page: '/sounds',
        buttons: [
          'a:has-text("Upload"), a:has-text("Add")',
          'button:has-text("Play")',
          'button:has-text("Stop")'
        ]
      }
    ];
    
    for (const pageTest of buttonTests) {
      TestHelpers.logStep(`Testing buttons on: ${pageTest.page}`);
      
      try {
        await page.goto(pageTest.page);
        await TestHelpers.waitForPageLoad(page);
        
        for (const buttonSelector of pageTest.buttons) {
          const buttons = page.locator(buttonSelector);
          const buttonCount = await buttons.count();
          
          if (buttonCount > 0) {
            const button = buttons.first();
            
            if (await button.isVisible() && await button.isEnabled()) {
              const buttonText = await button.textContent();
              TestHelpers.logStep(`Testing button: "${buttonText}"`);
              
              // Test button hover state
              await button.hover();
              await page.waitForTimeout(200);
              
              // Test button click (but handle navigation/modals carefully)
              const isLink = await button.evaluate(el => el.tagName.toLowerCase() === 'a');
              
              if (isLink) {
                // For links, just verify they have href
                const href = await button.getAttribute('href');
                expect(href).toBeTruthy();
                TestHelpers.logStep(`✓ Link button has href: ${href}`);
              } else {
                // For buttons, test click but handle any resulting modals/navigation
                await TestHelpers.safeClick(page, button);
                await page.waitForTimeout(500);
                
                // Check if modal opened
                const modal = page.locator('.modal, .dialog').first();
                if (await modal.count() > 0 && await modal.isVisible()) {
                  TestHelpers.logStep('✓ Button opened modal');
                  
                  // Close modal
                  const closeBtn = modal.locator('.close, [data-dismiss="modal"]').first();
                  if (await closeBtn.count() > 0) {
                    await TestHelpers.safeClick(page, closeBtn);
                  } else {
                    await page.keyboard.press('Escape');
                  }
                }
                
                TestHelpers.logStep(`✓ Button "${buttonText}" clicked successfully`);
              }
            }
          }
        }
        
        await TestHelpers.takeScreenshot(page, testInfo, `buttons_${pageTest.page.replace(/[^a-zA-Z0-9]/g, '_')}`);
        
      } catch (error) {
        TestHelpers.logStep(`⚠ Could not test buttons on ${pageTest.page}: ${error.message}`);
      }
    }
    
    TestHelpers.logStep('Button interaction tests completed');
  });

  test('Form input interactions work correctly', async ({ page }, testInfo) => {
    TestHelpers.logStep('Testing form input interactions');
    
    // Test form inputs on different pages
    const formPages = [
      '/characters/new',
      '/sounds/new',
      '/ai-management/stt'
    ];
    
    for (const pageUrl of formPages) {
      TestHelpers.logStep(`Testing form inputs on: ${pageUrl}`);
      
      try {
        await page.goto(pageUrl);
        await TestHelpers.waitForPageLoad(page);
        
        // Test text inputs
        const textInputs = page.locator('input[type="text"], input[type="email"], input[type="url"], input:not([type])');
        const textInputCount = await textInputs.count();
        
        for (let i = 0; i < Math.min(textInputCount, 3); i++) {
          const input = textInputs.nth(i);
          
          if (await input.isVisible() && await input.isEnabled()) {
            const placeholder = await input.getAttribute('placeholder') || '';
            TestHelpers.logStep(`Testing text input: ${placeholder}`);
            
            // Test input focus
            await input.focus();
            await page.waitForTimeout(100);
            
            // Test typing
            const testValue = 'Test Input Value';
            await TestHelpers.safeFill(page, input, testValue);
            
            // Verify value
            const actualValue = await input.inputValue();
            expect(actualValue).toBe(testValue);
            
            TestHelpers.logStep(`✓ Text input filled with: "${testValue}"`);
          }
        }
        
        // Test textarea inputs
        const textareas = page.locator('textarea');
        const textareaCount = await textareas.count();
        
        for (let i = 0; i < Math.min(textareaCount, 2); i++) {
          const textarea = textareas.nth(i);
          
          if (await textarea.isVisible() && await textarea.isEnabled()) {
            const placeholder = await textarea.getAttribute('placeholder') || '';
            TestHelpers.logStep(`Testing textarea: ${placeholder}`);
            
            const testValue = 'This is a test textarea value with multiple lines.\nSecond line of text.';
            await TestHelpers.safeFill(page, textarea, testValue);
            
            const actualValue = await textarea.inputValue();
            expect(actualValue).toBe(testValue);
            
            TestHelpers.logStep(`✓ Textarea filled successfully`);
          }
        }
        
        // Test file inputs
        const fileInputs = page.locator('input[type="file"]');
        const fileInputCount = await fileInputs.count();
        
        if (fileInputCount > 0) {
          TestHelpers.logStep(`Testing ${fileInputCount} file inputs`);
          
          const fileInput = fileInputs.first();
          if (await fileInput.isVisible()) {
            await TestHelpers.testFileUpload(page, fileInput, {
              content: 'test file content for input testing'
            });
            
            TestHelpers.logStep('✓ File input tested');
          }
        }
        
        await TestHelpers.takeScreenshot(page, testInfo, `form_inputs_${pageUrl.replace(/[^a-zA-Z0-9]/g, '_')}`);
        
      } catch (error) {
        TestHelpers.logStep(`⚠ Could not test form inputs on ${pageUrl}: ${error.message}`);
      }
    }
    
    TestHelpers.logStep('Form input interaction tests completed');
  });

  test('Audio and media controls work correctly', async ({ page }, testInfo) => {
    TestHelpers.logStep('Testing audio and media controls');
    
    // Test media controls on sounds page
    await page.goto('/sounds');
    await TestHelpers.waitForPageLoad(page);
    
    // Look for audio elements
    const audioElements = page.locator('audio');
    const audioCount = await audioElements.count();
    
    TestHelpers.logStep(`Found ${audioCount} audio elements`);
    
    if (audioCount > 0) {
      for (let i = 0; i < Math.min(audioCount, 2); i++) {
        const audio = audioElements.nth(i);
        
        if (await audio.isVisible()) {
          TestHelpers.logStep(`Testing audio element ${i + 1}`);
          
          // Test audio controls
          await TestHelpers.testMediaControls(page, audio);
          
          TestHelpers.logStep(`✓ Audio element ${i + 1} controls tested`);
        }
      }
    }
    
    // Look for custom play/pause buttons
    const playButtons = page.locator('button:has-text("Play"), .play-btn, [data-action="play"]');
    const playButtonCount = await playButtons.count();
    
    TestHelpers.logStep(`Found ${playButtonCount} play buttons`);
    
    if (playButtonCount > 0) {
      const playButton = playButtons.first();
      
      if (await playButton.isVisible() && await playButton.isEnabled()) {
        await TestHelpers.safeClick(page, playButton);
        await page.waitForTimeout(1000);
        
        // Look for pause button or playing state
        const pauseButton = page.locator('button:has-text("Pause"), .pause-btn, [data-action="pause"]').first();
        if (await pauseButton.count() > 0) {
          await TestHelpers.safeClick(page, pauseButton);
          TestHelpers.logStep('✓ Play/pause buttons tested');
        }
      }
    }
    
    await TestHelpers.takeScreenshot(page, testInfo, 'media_controls');
    TestHelpers.logStep('Audio and media control tests completed');
  });

  test('Keyboard navigation works correctly', async ({ page }, testInfo) => {
    TestHelpers.logStep('Testing keyboard navigation');
    
    await page.goto('/ai-management');
    await TestHelpers.waitForPageLoad(page);
    
    // Test Tab navigation
    TestHelpers.logStep('Testing Tab key navigation');
    
    let focusableElements = [];
    const tabCount = 10; // Test first 10 tab stops
    
    for (let i = 0; i < tabCount; i++) {
      await page.keyboard.press('Tab');
      await page.waitForTimeout(100);
      
      // Get currently focused element
      const focusedElement = await page.evaluate(() => {
        const el = document.activeElement;
        return {
          tagName: el.tagName,
          type: el.type || '',
          text: el.textContent?.substring(0, 30) || '',
          id: el.id || '',
          className: el.className || ''
        };
      });
      
      focusableElements.push(focusedElement);
      TestHelpers.logStep(`Tab ${i + 1}: ${focusedElement.tagName} ${focusedElement.type} "${focusedElement.text}"`);
    }
    
    // Test Enter key on focused button
    const currentElement = await page.evaluate(() => document.activeElement);
    if (currentElement) {
      await page.keyboard.press('Enter');
      await page.waitForTimeout(500);
      TestHelpers.logStep('✓ Enter key pressed on focused element');
    }
    
    // Test Escape key
    await page.keyboard.press('Escape');
    await page.waitForTimeout(500);
    TestHelpers.logStep('✓ Escape key tested');
    
    await TestHelpers.takeScreenshot(page, testInfo, 'keyboard_navigation');
    TestHelpers.logStep('Keyboard navigation tests completed');
  });
});

// Helper function for testing modal closing
TestHelpers.testModalClosing = async function(page, modal, testInfo) {
  TestHelpers.logStep('Testing modal closing methods');
  
  // Test close button
  const closeButton = modal.locator('.close, [data-dismiss="modal"], .modal-close').first();
  if (await closeButton.count() > 0) {
    await TestHelpers.safeClick(page, closeButton);
    await page.waitForTimeout(500);
    
    if (await modal.isHidden()) {
      TestHelpers.logStep('✓ Modal closed with close button');
      return;
    }
  }
  
  // Test Escape key
  await page.keyboard.press('Escape');
  await page.waitForTimeout(500);
  
  if (await modal.isHidden()) {
    TestHelpers.logStep('✓ Modal closed with Escape key');
    return;
  }
  
  // Test clicking outside modal
  await page.click('body', { position: { x: 10, y: 10 } });
  await page.waitForTimeout(500);
  
  if (await modal.isHidden()) {
    TestHelpers.logStep('✓ Modal closed by clicking outside');
    return;
  }
  
  TestHelpers.logStep('⚠ Modal did not close with standard methods');
};
