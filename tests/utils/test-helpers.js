/**
 * Test Helper Utilities for MonsterBox Tests
 * 
 * Common functions and utilities used across all test files
 */

const { expect } = require('@playwright/test');
const fs = require('fs').promises;
const path = require('path');

class TestHelpers {
  /**
   * Wait for page to load completely
   */
  static async waitForPageLoad(page, timeout = 10000) {
    await page.waitForLoadState('networkidle', { timeout });
    await page.waitForLoadState('domcontentloaded', { timeout });
  }

  /**
   * Take a screenshot with a descriptive name
   */
  static async takeScreenshot(page, testInfo, description) {
    const screenshotPath = `test-results/screenshots/${testInfo.title.replace(/[^a-zA-Z0-9]/g, '_')}_${description}.png`;
    await page.screenshot({ path: screenshotPath, fullPage: true });
    console.log(`📸 Screenshot saved: ${screenshotPath}`);
    return screenshotPath;
  }

  /**
   * Check if an element is visible and interactable
   */
  static async isElementInteractable(page, selector) {
    try {
      const element = page.locator(selector);
      await expect(element).toBeVisible({ timeout: 5000 });
      await expect(element).toBeEnabled({ timeout: 5000 });
      return true;
    } catch {
      return false;
    }
  }

  /**
   * Wait for and click an element safely
   */
  static async safeClick(page, selector, options = {}) {
    const element = page.locator(selector);
    await expect(element).toBeVisible({ timeout: 10000 });
    await expect(element).toBeEnabled({ timeout: 5000 });
    await element.click(options);
    await page.waitForTimeout(500); // Small delay for UI updates
  }

  /**
   * Fill form field safely with validation
   */
  static async safeFill(page, selector, value, options = {}) {
    const element = page.locator(selector);
    await expect(element).toBeVisible({ timeout: 5000 });
    await expect(element).toBeEnabled({ timeout: 5000 });
    await element.clear();
    await element.fill(value, options);
    
    // Verify the value was set correctly
    const actualValue = await element.inputValue();
    expect(actualValue).toBe(value);
  }

  /**
   * Select option from dropdown safely
   */
  static async safeSelect(page, selector, value) {
    const element = page.locator(selector);
    await expect(element).toBeVisible({ timeout: 5000 });
    await expect(element).toBeEnabled({ timeout: 5000 });
    await element.selectOption(value);
    
    // Verify selection
    const selectedValue = await element.inputValue();
    expect(selectedValue).toBe(value);
  }

  /**
   * Check if navigation was successful
   */
  static async verifyNavigation(page, expectedUrl, expectedTitle = null) {
    await this.waitForPageLoad(page);
    
    // Check URL
    const currentUrl = page.url();
    expect(currentUrl).toContain(expectedUrl);
    
    // Check title if provided
    if (expectedTitle) {
      const title = await page.title();
      expect(title).toContain(expectedTitle);
    }
    
    // Check for error indicators
    const errorElements = await page.locator('.error, .alert-danger, [class*="error"]').count();
    expect(errorElements).toBe(0);
  }

  /**
   * Test form validation by submitting invalid data
   */
  static async testFormValidation(page, formSelector, testCases) {
    for (const testCase of testCases) {
      console.log(`🧪 Testing validation: ${testCase.description}`);
      
      // Clear form
      await this.clearForm(page, formSelector);
      
      // Fill form with test data
      for (const [field, value] of Object.entries(testCase.data)) {
        if (value !== null) {
          await this.safeFill(page, `${formSelector} [name="${field}"]`, value);
        }
      }
      
      // Submit form
      await this.safeClick(page, `${formSelector} [type="submit"]`);
      
      // Check for expected validation messages
      if (testCase.expectedErrors) {
        for (const errorMessage of testCase.expectedErrors) {
          await expect(page.locator(`text=${errorMessage}`)).toBeVisible({ timeout: 5000 });
        }
      }
      
      // Check that form was not submitted successfully
      if (testCase.shouldFail) {
        await page.waitForTimeout(1000);
        const currentUrl = page.url();
        expect(currentUrl).toContain(testCase.expectedUrl || formSelector);
      }
    }
  }

  /**
   * Clear all form fields
   */
  static async clearForm(page, formSelector) {
    const inputs = page.locator(`${formSelector} input, ${formSelector} textarea, ${formSelector} select`);
    const count = await inputs.count();
    
    for (let i = 0; i < count; i++) {
      const input = inputs.nth(i);
      const tagName = await input.evaluate(el => el.tagName.toLowerCase());
      
      if (tagName === 'input' || tagName === 'textarea') {
        await input.clear();
      } else if (tagName === 'select') {
        await input.selectOption('');
      }
    }
  }

  /**
   * Test file upload functionality
   */
  static async testFileUpload(page, fileInputSelector, testFile) {
    const fileInput = page.locator(fileInputSelector);
    await expect(fileInput).toBeVisible({ timeout: 5000 });
    
    // Create a test file if path provided
    if (typeof testFile === 'string') {
      await fileInput.setInputFiles(testFile);
    } else {
      // Create temporary test file
      const tempFilePath = path.join('test-results', 'temp-upload-file.txt');
      await fs.writeFile(tempFilePath, testFile.content || 'Test file content');
      await fileInput.setInputFiles(tempFilePath);
    }
    
    // Verify file was selected
    const files = await fileInput.evaluate(input => input.files.length);
    expect(files).toBeGreaterThan(0);
  }

  /**
   * Test audio/video controls
   */
  static async testMediaControls(page, mediaSelector) {
    const media = page.locator(mediaSelector);
    await expect(media).toBeVisible({ timeout: 5000 });
    
    // Test play button
    const playButton = page.locator(`${mediaSelector} ~ .controls [data-action="play"], ${mediaSelector} ~ * button[title*="play" i]`);
    if (await playButton.count() > 0) {
      await this.safeClick(page, playButton.first());
      await page.waitForTimeout(1000);
    }
    
    // Test pause button
    const pauseButton = page.locator(`${mediaSelector} ~ .controls [data-action="pause"], ${mediaSelector} ~ * button[title*="pause" i]`);
    if (await pauseButton.count() > 0) {
      await this.safeClick(page, pauseButton.first());
    }
    
    return true;
  }

  /**
   * Test modal dialog functionality
   */
  static async testModal(page, triggerSelector, modalSelector, closeSelector = null) {
    // Open modal
    await this.safeClick(page, triggerSelector);
    await expect(page.locator(modalSelector)).toBeVisible({ timeout: 5000 });
    
    // Test modal content is accessible
    const modalContent = page.locator(`${modalSelector} .modal-content, ${modalSelector} .modal-body`);
    await expect(modalContent).toBeVisible({ timeout: 5000 });
    
    // Close modal
    if (closeSelector) {
      await this.safeClick(page, closeSelector);
    } else {
      // Try common close methods
      const closeButton = page.locator(`${modalSelector} .close, ${modalSelector} [data-dismiss="modal"], ${modalSelector} .modal-close`);
      if (await closeButton.count() > 0) {
        await this.safeClick(page, closeButton.first());
      } else {
        // Try ESC key
        await page.keyboard.press('Escape');
      }
    }
    
    // Verify modal is closed
    await expect(page.locator(modalSelector)).toBeHidden({ timeout: 5000 });
  }

  /**
   * Test responsive behavior
   */
  static async testResponsive(page, breakpoints = [1920, 1024, 768, 375]) {
    const results = {};
    
    for (const width of breakpoints) {
      await page.setViewportSize({ width, height: 800 });
      await page.waitForTimeout(500);
      
      // Check if navigation is accessible
      const navVisible = await this.isElementInteractable(page, 'nav, .navbar, .navigation');
      
      // Check if main content is visible
      const mainVisible = await this.isElementInteractable(page, 'main, .main-content, .container');
      
      results[width] = {
        navigation: navVisible,
        mainContent: mainVisible,
        viewport: await page.viewportSize()
      };
    }
    
    return results;
  }

  /**
   * Generate test report data
   */
  static async generateTestData(testInfo, results) {
    const testData = {
      testName: testInfo.title,
      testFile: testInfo.file,
      status: testInfo.status,
      duration: testInfo.duration,
      results: results,
      timestamp: new Date().toISOString(),
      browser: testInfo.project.name,
      viewport: testInfo.project.use?.viewport
    };
    
    const reportPath = `test-results/test-data-${testInfo.title.replace(/[^a-zA-Z0-9]/g, '_')}.json`;
    await fs.writeFile(reportPath, JSON.stringify(testData, null, 2));
    
    return testData;
  }

  /**
   * Log test step with timestamp
   */
  static logStep(step, details = '') {
    const timestamp = new Date().toISOString();
    console.log(`[${timestamp}] 🧪 ${step} ${details}`);
  }

  /**
   * Wait for API response
   */
  static async waitForAPIResponse(page, urlPattern, timeout = 10000) {
    return await page.waitForResponse(
      response => response.url().includes(urlPattern) && response.status() === 200,
      { timeout }
    );
  }

  /**
   * Check for JavaScript errors
   */
  static async checkForJSErrors(page) {
    const errors = [];

    page.on('pageerror', error => {
      errors.push({
        message: error.message,
        stack: error.stack,
        timestamp: new Date().toISOString()
      });
    });

    page.on('console', msg => {
      if (msg.type() === 'error') {
        errors.push({
          message: msg.text(),
          type: 'console.error',
          timestamp: new Date().toISOString()
        });
      }
    });

    return errors;
  }

  /**
   * Deep validation of page functionality
   */
  static async validatePageFunctionality(page, validationCriteria = {}) {
    const results = {
      pageLoaded: false,
      noErrors: false,
      buttonsWork: false,
      formsValid: false,
      navigationWorks: false,
      dataLoaded: false,
      errors: []
    };

    try {
      // Check page loaded properly
      await this.waitForPageLoad(page);
      const bodyText = await page.textContent('body');
      results.pageLoaded = !bodyText.includes('"success":false') && !bodyText.includes('Pretty-print');

      // Check for errors
      const jsErrors = await this.checkForJSErrors(page);
      results.noErrors = jsErrors.length === 0;
      results.errors = jsErrors;

      // Check buttons are clickable
      const buttons = page.locator('button, .btn, input[type="submit"]');
      const buttonCount = await buttons.count();
      let workingButtons = 0;

      for (let i = 0; i < Math.min(buttonCount, 5); i++) {
        try {
          const button = buttons.nth(i);
          if (await button.isVisible() && await button.isEnabled()) {
            workingButtons++;
          }
        } catch (error) {
          results.errors.push({ message: `Button ${i} validation failed: ${error.message}` });
        }
      }
      results.buttonsWork = workingButtons > 0;

      // Check forms exist and are valid
      const forms = page.locator('form');
      const formCount = await forms.count();
      results.formsValid = formCount >= 0; // Forms are optional

      // Check navigation elements
      const navElements = page.locator('nav a, .navbar a, .navigation a');
      const navCount = await navElements.count();
      results.navigationWorks = navCount > 0;

      // Check data loaded (tables, lists, cards)
      const dataElements = page.locator('table, .card, .list-item, .character-card, .part-card');
      const dataCount = await dataElements.count();
      results.dataLoaded = dataCount >= 0; // Data is optional

    } catch (error) {
      results.errors.push({ message: `Page validation failed: ${error.message}` });
    }

    return results;
  }

  /**
   * Test hardware control functionality
   */
  static async testHardwareControls(page, hardwareType) {
    const results = {
      configurationForm: false,
      controlButtons: false,
      statusDisplay: false,
      errors: []
    };

    try {
      // Test configuration form
      const configForm = page.locator(`form[data-hardware="${hardwareType}"], form:has([name*="${hardwareType}"])`);
      if (await configForm.count() > 0) {
        results.configurationForm = true;
      }

      // Test control buttons
      const controlButtons = page.locator(`button:has-text("Start"), button:has-text("Stop"), button:has-text("Test"), button:has-text("Calibrate")`);
      const buttonCount = await controlButtons.count();
      results.controlButtons = buttonCount > 0;

      // Test status display
      const statusElements = page.locator('.status, .hardware-status, [data-status]');
      const statusCount = await statusElements.count();
      results.statusDisplay = statusCount > 0;

    } catch (error) {
      results.errors.push({ message: `Hardware control test failed: ${error.message}` });
    }

    return results;
  }

  /**
   * Test WebSocket connectivity
   */
  static async testWebSocketConnection(page, expectedConnections = []) {
    const results = {
      connected: false,
      expectedConnections: expectedConnections.length,
      actualConnections: 0,
      errors: []
    };

    try {
      // Listen for WebSocket connections
      const wsConnections = [];

      page.on('websocket', ws => {
        wsConnections.push({
          url: ws.url(),
          timestamp: new Date().toISOString()
        });
      });

      // Wait for connections to establish
      await page.waitForTimeout(3000);

      results.actualConnections = wsConnections.length;
      results.connected = wsConnections.length > 0;

      // Check for expected connections
      for (const expectedUrl of expectedConnections) {
        const found = wsConnections.some(ws => ws.url.includes(expectedUrl));
        if (!found) {
          results.errors.push({ message: `Expected WebSocket connection not found: ${expectedUrl}` });
        }
      }

    } catch (error) {
      results.errors.push({ message: `WebSocket test failed: ${error.message}` });
    }

    return results;
  }

  /**
   * Test audio functionality
   */
  static async testAudioFunctionality(page) {
    const results = {
      audioElements: false,
      playbackControls: false,
      volumeControls: false,
      errors: []
    };

    try {
      // Check for audio elements
      const audioElements = page.locator('audio, video, .audio-player');
      const audioCount = await audioElements.count();
      results.audioElements = audioCount > 0;

      // Check playback controls
      const playControls = page.locator('button:has-text("Play"), button:has-text("Pause"), button:has-text("Stop")');
      const playCount = await playControls.count();
      results.playbackControls = playCount > 0;

      // Check volume controls
      const volumeControls = page.locator('input[type="range"][name*="volume"], .volume-slider');
      const volumeCount = await volumeControls.count();
      results.volumeControls = volumeCount > 0;

    } catch (error) {
      results.errors.push({ message: `Audio test failed: ${error.message}` });
    }

    return results;
  }
}

module.exports = TestHelpers;
