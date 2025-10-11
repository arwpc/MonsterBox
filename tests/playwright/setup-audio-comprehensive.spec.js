/**
 * Comprehensive Setup Audio Page Test
 * Tests ALL buttons and functionality on /setup/audio
 */

import { test, expect } from '@playwright/test';

const BASE_URL = process.env.BASE_URL || 'http://localhost:3000';

test.describe('Setup Audio - Comprehensive Button Tests', () => {
  test.beforeEach(async ({ page }) => {
    // Navigate to Setup Audio page
    await page.goto(`${BASE_URL}/setup/audio`);
    await page.waitForLoadState('networkidle');
    
    // Wait for page to be fully loaded
    await expect(page.locator('h1')).toContainText('Audio Configuration');
  });

  test('should load page without errors', async ({ page }) => {
    // Check for console errors
    const errors = [];
    page.on('console', msg => {
      if (msg.type() === 'error') {
        errors.push(msg.text());
      }
    });

    await page.waitForTimeout(2000);
    
    // Filter out known benign errors
    const realErrors = errors.filter(err => 
      !err.includes('VU meter element not found') && // Expected during cleanup
      !err.includes('410 Gone') // Expected for deprecated endpoints
    );
    
    expect(realErrors.length).toBe(0);
  });

  test('should display input and output device selectors', async ({ page }) => {
    // Check for input device selector
    const inputSelect = page.locator('#default-source');
    await expect(inputSelect).toBeVisible();
    
    // Check for output device selector
    const outputSelect = page.locator('#default-sink');
    await expect(outputSelect).toBeVisible();
  });

  test('should display VU meters', async ({ page }) => {
    // Check for input VU meter
    const inputVU = page.locator('#input-vu-meter');
    await expect(inputVU).toBeVisible();
    
    // Check for output VU meter
    const outputVU = page.locator('#output-vu-meter');
    await expect(outputVU).toBeVisible();
  });

  test('Test Audio Output button should work', async ({ page }) => {
    // Find and click the Test Audio Output button
    const testButton = page.locator('button:has-text("Test Audio Output")');
    await expect(testButton).toBeVisible();
    
    // Click the button
    await testButton.click();
    
    // Button should show "Playing..." state
    await expect(testButton).toContainText('Playing');
    
    // Wait for test to complete
    await page.waitForTimeout(3000);
    
    // Button should return to normal state
    await expect(testButton).toContainText('Test Audio Output');
  });

  test('Test Audio Input button should work', async ({ page }) => {
    // Find and click the Test Audio Input button
    const testButton = page.locator('button:has-text("Test Audio Input")');
    await expect(testButton).toBeVisible();
    
    // Click the button
    await testButton.click();
    
    // Button should show "Testing..." state
    await expect(testButton).toContainText('Testing');
    
    // Wait for test to complete
    await page.waitForTimeout(2000);
    
    // Button should return to normal state
    await expect(testButton).toContainText('Test Audio Input');
  });

  test('Start/Stop Input Monitoring button should toggle', async ({ page }) => {
    // Find the input monitoring toggle button
    const toggleButton = page.locator('button:has-text("Input Monitoring")');
    await expect(toggleButton).toBeVisible();
    
    // Initial state should be "Start"
    const toggleSpan = page.locator('#input-vu-toggle');
    await expect(toggleSpan).toHaveText('Start');
    
    // Click to start monitoring
    await toggleButton.click();
    await page.waitForTimeout(500);
    
    // Should change to "Stop"
    await expect(toggleSpan).toHaveText('Stop');
    
    // Click to stop monitoring
    await toggleButton.click();
    await page.waitForTimeout(500);
    
    // Should change back to "Start"
    await expect(toggleSpan).toHaveText('Start');
  });

  test('Start/Stop Output Monitoring button should toggle', async ({ page }) => {
    // Find the output monitoring toggle button
    const toggleButton = page.locator('button:has-text("Output Monitoring")');
    await expect(toggleButton).toBeVisible();
    
    // Initial state should be "Start"
    const toggleSpan = page.locator('#output-vu-toggle');
    await expect(toggleSpan).toHaveText('Start');
    
    // Click to start monitoring
    await toggleButton.click();
    await page.waitForTimeout(500);
    
    // Should change to "Stop"
    await expect(toggleSpan).toHaveText('Stop');
    
    // Click to stop monitoring
    await toggleButton.click();
    await page.waitForTimeout(500);
    
    // Should change back to "Start"
    await expect(toggleSpan).toHaveText('Start');
  });

  test('Input device selection should work', async ({ page }) => {
    const inputSelect = page.locator('#default-source');
    
    // Get current value
    const initialValue = await inputSelect.inputValue();
    
    // Get all options
    const options = await inputSelect.locator('option').all();
    
    if (options.length > 1) {
      // Select a different option
      await inputSelect.selectOption({ index: 1 });
      
      // Wait for change to apply
      await page.waitForTimeout(500);
      
      // Verify selection changed
      const newValue = await inputSelect.inputValue();
      expect(newValue).not.toBe(initialValue);
    }
  });

  test('Output device selection should work', async ({ page }) => {
    const outputSelect = page.locator('#default-sink');
    
    // Get current value
    const initialValue = await outputSelect.inputValue();
    
    // Get all options
    const options = await outputSelect.locator('option').all();
    
    if (options.length > 1) {
      // Select a different option
      await outputSelect.selectOption({ index: 1 });
      
      // Wait for change to apply
      await page.waitForTimeout(500);
      
      // Verify selection changed
      const newValue = await outputSelect.inputValue();
      expect(newValue).not.toBe(initialValue);
    }
  });

  test('VU meters should update during monitoring', async ({ page }) => {
    // Start input monitoring
    const toggleButton = page.locator('button:has-text("Input Monitoring")');
    await toggleButton.click();
    
    // Wait for VU meter to update
    await page.waitForTimeout(1000);
    
    // Check that level text is updating
    const levelText = page.locator('#input-level-text');
    const level = await levelText.textContent();
    
    // Level should be a percentage (e.g., "32%")
    expect(level).toMatch(/\d+%/);
    
    // Stop monitoring
    await toggleButton.click();
  });

  test('Microphone parts should display with VU meters', async ({ page }) => {
    // Check if microphone parts section exists
    const micSection = page.locator('text=Microphone Parts Controls');
    
    if (await micSection.isVisible()) {
      // Check for at least one microphone part
      const micParts = page.locator('[id^="mic-vu-"]');
      const count = await micParts.count();
      
      if (count > 0) {
        // First mic part should have VU meter
        const firstMicVU = micParts.first();
        await expect(firstMicVU).toBeVisible();
      }
    }
  });

  test('should not have VU meter null reference errors', async ({ page }) => {
    const errors = [];
    page.on('console', msg => {
      if (msg.type() === 'error' && msg.text().includes('Cannot read properties of null')) {
        errors.push(msg.text());
      }
    });

    // Start and stop monitoring multiple times
    const inputToggle = page.locator('button:has-text("Input Monitoring")');
    const outputToggle = page.locator('button:has-text("Output Monitoring")');
    
    for (let i = 0; i < 3; i++) {
      await inputToggle.click();
      await page.waitForTimeout(200);
      await inputToggle.click();
      await page.waitForTimeout(200);
      
      await outputToggle.click();
      await page.waitForTimeout(200);
      await outputToggle.click();
      await page.waitForTimeout(200);
    }
    
    // Should have no null reference errors
    expect(errors.length).toBe(0);
  });

  test('API endpoints should respond correctly', async ({ page }) => {
    // Test audio-levels endpoint for input
    const inputResponse = await page.request.get(`${BASE_URL}/setup/audio/api/audio-levels?deviceId=default&deviceType=input`);
    expect(inputResponse.ok()).toBeTruthy();
    const inputData = await inputResponse.json();
    expect(inputData.success).toBe(true);
    expect(typeof inputData.level).toBe('number');
    
    // Test audio-levels endpoint for output
    const outputResponse = await page.request.get(`${BASE_URL}/setup/audio/api/audio-levels?deviceId=default&deviceType=output`);
    expect(outputResponse.ok()).toBeTruthy();
    const outputData = await outputResponse.json();
    expect(outputData.success).toBe(true);
  });
});

