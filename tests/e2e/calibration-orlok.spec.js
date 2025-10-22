/**
 * E2E tests for Unified Calibration System (Positions v1.5)
 * Tests calibration controls, position tracking, and bounds setting with Character Orlok
 */

import { test, expect } from '@playwright/test';

const BASE_URL = 'http://localhost:3000';

test.describe('Parts & Calibration - Character Orlok', () => {
  test.beforeEach(async ({ page }) => {
    // Enable test mode for deterministic behavior
    await page.addInitScript(() => {
      window.MB_TEST_MODE = true;
    });
    
    await page.goto(`${BASE_URL}/setup/calibration`);
    await expect(page.locator('h1, h2')).toContainText(/parts/i);
  });

  test('should load calibration page successfully', async ({ page }) => {
    // Check page structure
    await expect(page.locator('nav.navbar')).toBeVisible();
    await expect(page.locator('#characterSelect')).toBeVisible();
    await expect(page.locator('#partSelect')).toBeVisible();
    
    console.log('✅ Calibration page loaded');
  });

  test('should select Character Orlok and display parts', async ({ page }) => {
    // Select Orlok character
    await page.selectOption('#characterSelect', '1'); // Character Orlok is ID 1
    
    // Wait for parts to load
    await page.waitForTimeout(500);
    
    // Check that part dropdown has options
    const partOptions = await page.locator('#partSelect option').count();
    expect(partOptions).toBeGreaterThan(1); // At least "Select a part" + actual parts
    
    console.log(`✅ Orlok character selected with ${partOptions - 1} parts`);
  });

  test('should display unified calibration panel', async ({ page }) => {
    // Select Orlok
    await page.selectOption('#characterSelect', '1');
    await page.waitForTimeout(500);
    
    // Check for calibration panel sections
    await expect(page.locator('text=Current Position')).toBeVisible();
    await expect(page.locator('text=Calibration Bounds')).toBeVisible();
    await expect(page.locator('#btnSetMin')).toBeVisible();
    await expect(page.locator('#btnSetMax')).toBeVisible();
    
    console.log('✅ Unified calibration panel displayed');
  });

  test('should NOT display redundant Jog Controls', async ({ page }) => {
    // Select Orlok and a part
    await page.selectOption('#characterSelect', '1');
    await page.waitForTimeout(500);
    
    // Select first available part (should be Jaw of Orlok)
    const partValue = await page.locator('#partSelect option').nth(1).getAttribute('value');
    if (partValue) {
      await page.selectOption('#partSelect', partValue);
      await page.waitForTimeout(500);
    }
    
    // Verify jog controls are NOT present (we removed them)
    const jogScaleButtons = await page.locator('button:has-text("Fine"), button:has-text("Medium"), button:has-text("Coarse")').count();
    expect(jogScaleButtons).toBe(0);
    
    console.log('✅ No redundant jog controls (consolidation successful)');
  });

  test('should display servo controls for Jaw of Orlok', async ({ page }) => {
    // Select Orlok
    await page.selectOption('#characterSelect', '1');
    await page.waitForTimeout(500);
    
    // Find and select Jaw of Orlok (servo type)
    const jawOption = await page.locator('#partSelect option:has-text("Jaw")').first();
    const jawValue = await jawOption.getAttribute('value');
    
    if (jawValue) {
      await page.selectOption('#partSelect', jawValue);
      await page.waitForTimeout(500);
      
      // Check for servo-specific controls
      await expect(page.locator('#ang')).toBeVisible(); // Angle slider
      await expect(page.locator('#angNum')).toBeVisible(); // Angle number input
      await expect(page.locator('#goAng')).toBeVisible(); // Move button
      
      console.log('✅ Servo controls displayed for Jaw of Orlok');
    }
  });

  test('should update position display after servo movement', async ({ page }) => {
    // Select Orlok and Jaw
    await page.selectOption('#characterSelect', '1');
    await page.waitForTimeout(500);
    
    const jawOption = await page.locator('#partSelect option:has-text("Jaw")').first();
    const jawValue = await jawOption.getAttribute('value');
    
    if (jawValue) {
      await page.selectOption('#partSelect', jawValue);
      await page.waitForTimeout(500);
      
      // Get initial position
      const initialPos = await page.locator('#currentPositionBadge').textContent();
      
      // Set angle to 90 degrees and move
      await page.fill('#angNum', '90');
      await page.click('#goAng');
      
      // Wait for movement to complete
      await page.waitForTimeout(1000);
      
      // Check position updated
      const newPos = await page.locator('#currentPositionBadge').textContent();
      
      // Position should be 0.500 (90° = 50% of 180°)
      expect(newPos).toContain('0.5');
      
      console.log(`✅ Position updated: ${initialPos} → ${newPos}`);
    }
  });

  test('should display linear actuator controls for Right Arm', async ({ page }) => {
    // Select Orlok
    await page.selectOption('#characterSelect', '1');
    await page.waitForTimeout(500);
    
    // Find and select Right Arm (linear actuator)
    const armOption = await page.locator('#partSelect option:has-text("Right Arm")').first();
    const armValue = await armOption.getAttribute('value');
    
    if (armValue) {
      await page.selectOption('#partSelect', armValue);
      await page.waitForTimeout(500);
      
      // Check for linear actuator controls
      await expect(page.locator('#extendBtn')).toBeVisible();
      await expect(page.locator('#retractBtn')).toBeVisible();
      await expect(page.locator('#stopBtn')).toBeVisible();
      await expect(page.locator('#laSpd')).toBeVisible(); // Speed input
      await expect(page.locator('#laDur')).toBeVisible(); // Duration input
      
      console.log('✅ Linear actuator controls displayed for Right Arm');
    }
  });

  test('should update position after linear actuator movement', async ({ page }) => {
    // Select Orlok and Right Arm
    await page.selectOption('#characterSelect', '1');
    await page.waitForTimeout(500);
    
    const armOption = await page.locator('#partSelect option:has-text("Right Arm")').first();
    const armValue = await armOption.getAttribute('value');
    
    if (armValue) {
      await page.selectOption('#partSelect', armValue);
      await page.waitForTimeout(500);
      
      // Get initial position
      const initialPos = await page.locator('#currentPositionBadge').textContent();
      
      // Click Extend
      await page.click('#extendBtn');
      
      // Wait for movement
      await page.waitForTimeout(1000);
      
      // Check position changed
      const newPos = await page.locator('#currentPositionBadge').textContent();
      expect(newPos).not.toBe(initialPos);
      
      console.log(`✅ Linear actuator position updated: ${initialPos} → ${newPos}`);
    }
  });

  test('should set minimum calibration bound', async ({ page }) => {
    // Select Orlok and Jaw
    await page.selectOption('#characterSelect', '1');
    await page.waitForTimeout(500);
    
    const jawOption = await page.locator('#partSelect option:has-text("Jaw")').first();
    const jawValue = await jawOption.getAttribute('value');
    
    if (jawValue) {
      await page.selectOption('#partSelect', jawValue);
      await page.waitForTimeout(500);
      
      // Move to position 45 degrees
      await page.fill('#angNum', '45');
      await page.click('#goAng');
      await page.waitForTimeout(1000);
      
      // Click Set Min
      await page.click('#btnSetMin');
      await page.waitForTimeout(500);
      
      // Check that min bound was updated (should show in UI)
      const minBound = await page.locator('text=/Min:.*0\\.2[0-9]{2}/').count();
      expect(minBound).toBeGreaterThan(0);
      
      console.log('✅ Minimum bound set successfully');
    }
  });

  test('should set maximum calibration bound', async ({ page }) => {
    // Select Orlok and Jaw
    await page.selectOption('#characterSelect', '1');
    await page.waitForTimeout(500);
    
    const jawOption = await page.locator('#partSelect option:has-text("Jaw")').first();
    const jawValue = await jawOption.getAttribute('value');
    
    if (jawValue) {
      await page.selectOption('#partSelect', jawValue);
      await page.waitForTimeout(500);
      
      // Move to position 135 degrees
      await page.fill('#angNum', '135');
      await page.click('#goAng');
      await page.waitForTimeout(1000);
      
      // Click Set Max
      await page.click('#btnSetMax');
      await page.waitForTimeout(500);
      
      // Check that max bound was updated
      const maxBound = await page.locator('text=/Max:.*0\\.7[0-9]{2}/').count();
      expect(maxBound).toBeGreaterThan(0);
      
      console.log('✅ Maximum bound set successfully');
    }
  });

  test('should have no console errors during operation', async ({ page }) => {
    const consoleErrors = [];
    
    page.on('console', msg => {
      if (msg.type() === 'error') {
        consoleErrors.push(msg.text());
      }
    });
    
    // Select Orlok
    await page.selectOption('#characterSelect', '1');
    await page.waitForTimeout(500);
    
    // Select Jaw
    const jawOption = await page.locator('#partSelect option:has-text("Jaw")').first();
    const jawValue = await jawOption.getAttribute('value');
    
    if (jawValue) {
      await page.selectOption('#partSelect', jawValue);
      await page.waitForTimeout(500);
      
      // Perform movements
      await page.fill('#angNum', '90');
      await page.click('#goAng');
      await page.waitForTimeout(1000);
      
      // Set bounds
      await page.click('#btnSetMin');
      await page.waitForTimeout(500);
      
      await page.fill('#angNum', '120');
      await page.click('#goAng');
      await page.waitForTimeout(1000);
      
      await page.click('#btnSetMax');
      await page.waitForTimeout(500);
    }
    
    // Check for errors
    expect(consoleErrors.length).toBe(0);
    
    console.log('✅ No console errors detected');
  });

  test('should test all Orlok part types', async ({ page }) => {
    // Select Orlok
    await page.selectOption('#characterSelect', '1');
    await page.waitForTimeout(500);
    
    // Get all part options
    const partOptions = await page.locator('#partSelect option').allTextContents();
    const parts = partOptions.slice(1); // Skip "Select a part"
    
    let testedCount = 0;
    
    for (const partText of parts) {
      const option = await page.locator(`#partSelect option:has-text("${partText}")`).first();
      const value = await option.getAttribute('value');
      
      if (value) {
        await page.selectOption('#partSelect', value);
        await page.waitForTimeout(500);
        
        // Verify controls area is populated
        const controlsArea = await page.locator('#controlsArea').textContent();
        expect(controlsArea.length).toBeGreaterThan(10);
        
        testedCount++;
      }
    }
    
    console.log(`✅ Tested ${testedCount} parts on Character Orlok`);
    expect(testedCount).toBeGreaterThan(0);
  });
});
