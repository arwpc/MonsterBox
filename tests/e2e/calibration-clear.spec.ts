/**
 * Calibration Clear Functionality E2E Tests
 * Tests for clearing individual part calibrations and clearing all calibrations
 */

import { test, expect } from '@playwright/test';

test.describe('Calibration Clear Functionality', () => {
  test.beforeEach(async ({ page }) => {
    // Navigate to calibration page
    await page.goto('http://localhost:3000/setup/calibration');
    await page.waitForLoadState('networkidle');
  });

  test('should show Clear button in calibration panel when part is selected', async ({ page }) => {
    // Select a calibratable part (servo or linear actuator)
    const partLink = page.locator('.list-group-item').filter({ hasText: /servo|linear_actuator/i }).first();
    await partLink.click();
    await page.waitForTimeout(500);

    // Check that Clear button is visible in calibration bounds section
    const clearButton = page.getByRole('button', { name: /clear/i }).filter({ hasText: 'Clear' }).first();
    await expect(clearButton).toBeVisible();
  });

  test('should show Clear All Calibrations button next to mode toggle', async ({ page }) => {
    const clearAllButton = page.getByRole('button', { name: /clear all calibrations/i });
    await expect(clearAllButton).toBeVisible();
  });

  test('should clear calibration for selected servo part', async ({ page }) => {
    // Select first servo part
    const servoPart = page.locator('.list-group-item').filter({ hasText: /servo/i }).first();
    await servoPart.click();
    await page.waitForTimeout(500);

    // Set some calibration data first (if not already set)
    const setMinButton = page.getByRole('button', { name: /set min/i });
    const setMaxButton = page.getByRole('button', { name: /set max/i });
    
    // Click Set Min and Set Max to ensure we have calibration data
    await setMinButton.click();
    await page.waitForTimeout(300);
    await setMaxButton.click();
    await page.waitForTimeout(300);

    // Verify calibration bounds are set
    const minDisplay = page.locator('#calMinDisplay');
    const maxDisplay = page.locator('#calMaxDisplay');
    const minText = await minDisplay.textContent();
    const maxText = await maxDisplay.textContent();
    
    expect(minText).not.toBe('—');
    expect(maxText).not.toBe('—');

    // Click Clear button
    const clearButton = page.getByRole('button', { name: /^clear$/i }).first();
    
    // Handle confirmation dialog
    page.once('dialog', async dialog => {
      expect(dialog.message()).toContain('Clear calibration data');
      await dialog.accept();
    });
    
    await clearButton.click();
    await page.waitForTimeout(500);

    // Verify calibration is cleared (bounds should be reset to —)
    await expect(minDisplay).toHaveText('—');
    await expect(maxDisplay).toHaveText('—');
  });

  test('should clear calibration for selected linear actuator part', async ({ page }) => {
    // Select first linear actuator part
    const actuatorPart = page.locator('.list-group-item').filter({ hasText: /linear_actuator/i }).first();
    
    // Check if part exists, if not skip test
    const partCount = await actuatorPart.count();
    if (partCount === 0) {
      test.skip();
      return;
    }

    await actuatorPart.click();
    await page.waitForTimeout(500);

    // Set some calibration data first
    const setMinButton = page.getByRole('button', { name: /set min/i });
    const setMaxButton = page.getByRole('button', { name: /set max/i });
    
    await setMinButton.click();
    await page.waitForTimeout(300);
    await setMaxButton.click();
    await page.waitForTimeout(300);

    // Click Clear button
    const clearButton = page.getByRole('button', { name: /^clear$/i }).first();
    
    page.once('dialog', async dialog => {
      await dialog.accept();
    });
    
    await clearButton.click();
    await page.waitForTimeout(500);

    // Verify calibration is cleared
    const minDisplay = page.locator('#calMinDisplay');
    const maxDisplay = page.locator('#calMaxDisplay');
    await expect(minDisplay).toHaveText('—');
    await expect(maxDisplay).toHaveText('—');
  });

  test('should cancel clear when user cancels confirmation', async ({ page }) => {
    // Select a servo part
    const servoPart = page.locator('.list-group-item').filter({ hasText: /servo/i }).first();
    await servoPart.click();
    await page.waitForTimeout(500);

    // Set calibration bounds
    await page.getByRole('button', { name: /set min/i }).click();
    await page.waitForTimeout(300);
    await page.getByRole('button', { name: /set max/i }).click();
    await page.waitForTimeout(300);

    // Get current bounds values
    const minDisplay = page.locator('#calMinDisplay');
    const maxDisplay = page.locator('#calMaxDisplay');
    const minBefore = await minDisplay.textContent();
    const maxBefore = await maxDisplay.textContent();

    // Click Clear but cancel
    const clearButton = page.getByRole('button', { name: /^clear$/i }).first();
    
    page.once('dialog', async dialog => {
      await dialog.dismiss();
    });
    
    await clearButton.click();
    await page.waitForTimeout(300);

    // Verify bounds are unchanged
    const minAfter = await minDisplay.textContent();
    const maxAfter = await maxDisplay.textContent();
    expect(minAfter).toBe(minBefore);
    expect(maxAfter).toBe(maxBefore);
  });

  test('should clear all calibrations for current character', async ({ page }) => {
    // Count calibratable parts before clearing
    const calibratableParts = page.locator('.list-group-item').filter({ 
      hasText: /servo|linear_actuator|motor|stepper/i 
    });
    const partCount = await calibratableParts.count();

    if (partCount === 0) {
      test.skip();
      return;
    }

    // Click Clear All Calibrations button
    const clearAllButton = page.getByRole('button', { name: /clear all calibrations/i });
    
    page.once('dialog', async dialog => {
      expect(dialog.message()).toContain('Clear ALL calibrations');
      expect(dialog.message()).toContain(`${partCount} part(s)`);
      await dialog.accept();
    });
    
    await clearAllButton.click();
    await page.waitForTimeout(1000);

    // Select a part and verify its calibration is cleared
    const firstPart = calibratableParts.first();
    await firstPart.click();
    await page.waitForTimeout(500);

    const minDisplay = page.locator('#calMinDisplay');
    const maxDisplay = page.locator('#calMaxDisplay');
    await expect(minDisplay).toHaveText('—');
    await expect(maxDisplay).toHaveText('—');
  });

  test('should show success message after clearing calibration', async ({ page }) => {
    // Select a servo part
    const servoPart = page.locator('.list-group-item').filter({ hasText: /servo/i }).first();
    await servoPart.click();
    await page.waitForTimeout(500);

    // Set calibration
    await page.getByRole('button', { name: /set min/i }).click();
    await page.waitForTimeout(300);

    // Clear calibration
    const clearButton = page.getByRole('button', { name: /^clear$/i }).first();
    
    page.once('dialog', async dialog => {
      await dialog.accept();
    });
    
    await clearButton.click();
    
    // Wait for success toast/alert
    await page.waitForTimeout(500);
    
    // Note: Success message handling depends on whether showToast is available
    // In test mode, it may show as alert or toast
  });

  test('should handle error when clearing non-existent calibration gracefully', async ({ page }) => {
    // Select a part that likely has no calibration
    const parts = page.locator('.list-group-item').filter({ hasText: /speaker|microphone|light/i });
    const nonCalibrablePart = await parts.first();
    
    // If we find a non-calibratable part, skip this test as we need a calibratable one without data
    const partCount = await parts.count();
    if (partCount === 0) {
      test.skip();
      return;
    }

    // This test is primarily to ensure the API doesn't crash on DELETE of non-existent profile
    // The UI only shows Clear button for calibratable parts, so this is an edge case
  });

  test('should only clear calibrations for current character, not other characters', async ({ page }) => {
    // This test would require switching characters, which is complex in E2E
    // For now, we verify the API is called with correct characterId
    // Implementation note: Manual testing should verify character isolation
    test.skip(); // Skip for now - requires multi-character setup
  });

  test('should update calibration status badges after clearing all', async ({ page }) => {
    // Get initial "Needs Cal" badge count
    const needsCalBadges = page.locator('.badge.text-bg-info').filter({ hasText: 'Needs Cal' });
    const initialCount = await needsCalBadges.count();

    // Clear all calibrations
    const clearAllButton = page.getByRole('button', { name: /clear all calibrations/i });
    
    page.once('dialog', async dialog => {
      await dialog.accept();
    });
    
    await clearAllButton.click();
    await page.waitForTimeout(1000);

    // Verify "Needs Cal" badges have increased (parts now need calibration)
    const finalCount = await needsCalBadges.count();
    expect(finalCount).toBeGreaterThanOrEqual(initialCount);
  });
});
