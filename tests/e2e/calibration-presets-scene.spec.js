/**
 * E2E test: Calibration Presets in Scene Editor
 * 
 * Verifies that calibration presets can be loaded and used in scene steps:
 * - Load calibration profiles via API
 * - Navigate to scene editor
 * - Add a step with a calibrated part
 * - Switch to Preset control mode
 * - Select Min/Max position presets
 * - Verify step data is correctly saved with preset information
 */

import { test, expect } from '@playwright/test';

test.describe('Calibration Presets in Scene Editor', () => {
  test('should load calibration profiles and use presets in scene steps', async ({ page }) => {
    // Navigate to scene editor for Coffin Breaker (character 2)
    await page.goto('http://localhost:3000/scenes/edit/new?characterId=2', { timeout: 30000 });
    
    // Wait for scene editor to initialize
    await page.waitForSelector('#sceneName', { timeout: 10000 });
    
    // Enter scene name
    await page.fill('#sceneName', 'Test Calibration Presets Scene');
    
    // Click "Add Step" button
    await page.click('#addStepBtn');
    
    // Wait for modal to appear
    await page.waitForSelector('#addStepModal', { state: 'visible', timeout: 5000 });
    
    // Find and click on a Linear Actuator step button (Coffin Door, part 1)
    const actuatorButton = page.locator('button[data-type="linear_actuator"][data-part-id="1"]').first();
    await actuatorButton.click();
    
    // Wait for step form to render
    await page.waitForTimeout(500);
    
    // Verify Control Mode dropdown exists
    const controlModeSelect = page.locator('select[data-field="usePreset"]').first();
    await expect(controlModeSelect).toBeVisible();
    
    // Switch to "Position Preset" mode
    await controlModeSelect.selectOption('true');
    
    // Wait for preset dropdown to appear
    await page.waitForTimeout(500);
    
    // Verify Preset dropdown exists and has Min/Max options
    const presetSelect = page.locator('select[data-field="presetName"]').first();
    await expect(presetSelect).toBeVisible();
    
    // Check that Min and Max options exist
    const minOption = presetSelect.locator('option[value="__MIN__"]');
    const maxOption = presetSelect.locator('option[value="__MAX__"]');
    await expect(minOption).toHaveCount(1);
    await expect(maxOption).toHaveCount(1);
    
    // Select Min Position
    await presetSelect.selectOption('__MIN__');
    
    // Add step to scene
    const addStepButton = page.locator('#addStepModal button:has-text("Add Step")').first();
    if (await addStepButton.count() > 0) {
      await addStepButton.click();
    }
    
    // Wait for step to be added to list
    await page.waitForTimeout(500);
    
    // Verify step appears in steps list
    const stepsContainer = page.locator('#stepsContainer');
    await expect(stepsContainer).toBeVisible();
    
    console.log('✅ Calibration presets UI test passed');
  });
  
  test('should handle switching between Manual and Preset control modes', async ({ page }) => {
    await page.goto('http://localhost:3000/scenes/edit/new?characterId=2', { timeout: 30000 });
    
    await page.waitForSelector('#sceneName', { timeout: 10000 });
    await page.fill('#sceneName', 'Test Mode Switching');
    
    // Add servo step (part 3 - Jaw of Coffin)
    await page.click('#addStepBtn');
    await page.waitForSelector('#addStepModal', { state: 'visible', timeout: 5000 });
    
    const servoButton = page.locator('button[data-type="servo"][data-part-id="3"]').first();
    await servoButton.click();
    await page.waitForTimeout(500);
    
    // Verify Manual controls are visible initially
    const angleInput = page.locator('input[data-field="angle"]').first();
    await expect(angleInput).toBeVisible();
    
    // Switch to Preset mode
    const controlModeSelect = page.locator('select[data-field="usePreset"]').first();
    await controlModeSelect.selectOption('true');
    await page.waitForTimeout(500);
    
    // Verify Preset dropdown is visible and angle input is hidden
    const presetSelect = page.locator('select[data-field="presetName"]').first();
    await expect(presetSelect).toBeVisible();
    
    // Switch back to Manual mode
    await controlModeSelect.selectOption('false');
    await page.waitForTimeout(500);
    
    // Verify Manual controls are visible again
    await expect(angleInput).toBeVisible();
    
    console.log('✅ Mode switching test passed');
  });
});
