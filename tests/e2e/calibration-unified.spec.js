/**
 * E2E tests for Unified Calibration UI (Positions v1.5)
 * Tests the calibration interface with Chrome DevTools Protocol
 */

import { test, expect } from '@playwright/test';

test.describe('Unified Calibration Interface', () => {
  test.beforeEach(async ({ page }) => {
    await page.goto('/setup/calibration/unified');
  });

  test('should load calibration page with correct title', async ({ page }) => {
    await expect(page).toHaveTitle(/Unified Calibration/);
    await expect(page.locator('h1')).toContainText('Unified Calibration');
  });

  test('should list positionable parts in dropdown', async ({ page }) => {
    const partSelect = page.locator('#partSelect');
    await expect(partSelect).toBeVisible();
    
    const options = await partSelect.locator('option').allTextContents();
    expect(options.length).toBeGreaterThan(1); // At least "Select a part..." + some parts
    expect(options[0]).toContain('Select a part');
  });

  test('should load profile when part is selected', async ({ page }) => {
    const partSelect = page.locator('#partSelect');
    
    // Select first actual part (not the placeholder)
    await partSelect.selectOption({ index: 1 });
    
    // Wait for profile to load (status message should appear)
    await expect(page.locator('.alert-success')).toBeVisible({ timeout: 3000 });
    await expect(page.locator('.alert-success')).toContainText(/Loaded profile/);
    
    // Verify controls are enabled
    await expect(page.getByRole('button', { name: 'E-STOP' })).toBeEnabled();
    await expect(page.getByRole('button', { name: /Min/ })).toBeEnabled();
    await expect(page.getByRole('button', { name: /Max/ })).toBeEnabled();
  });

  test('should update position when jog button clicked', async ({ page }) => {
    // Select a part
    await page.locator('#partSelect').selectOption({ index: 1 });
    await page.waitForTimeout(500); // Wait for profile load
    
    // Get initial position
    const posDisplay = page.locator('#currentPosDisplay');
    const initialPos = await posDisplay.textContent();
    
    // Click jog button (Max)
    await page.getByRole('button', { name: 'Max ▶' }).click();
    
    // Wait for position update
    await page.waitForTimeout(500);
    const newPos = await posDisplay.textContent();
    
    // Position should have changed
    expect(newPos).not.toBe(initialPos);
  });

  test('should adjust global speed cap slider', async ({ page }) => {
    const speedSlider = page.locator('#globalSpeedCap');
    const speedDisplay = page.locator('#speedCapDisplay');
    
    // Set to 75%
    await speedSlider.fill('75');
    await expect(speedDisplay).toHaveText('75%');
    
    // Verify API was called (check for success message or no error)
    await page.waitForTimeout(500);
    const alerts = page.locator('.alert-danger');
    await expect(alerts).toHaveCount(0); // No error alerts
  });

  test('should show E-STOP button and controls', async ({ page }) => {
    const estopBtn = page.getByRole('button', { name: 'E-STOP' });
    await expect(estopBtn).toBeVisible();
    
    // Should be disabled initially (no part selected)
    await expect(estopBtn).toBeDisabled();
    
    // Select a part
    await page.locator('#partSelect').selectOption({ index: 1 });
    await page.waitForTimeout(500);
    
    // Now should be enabled
    await expect(estopBtn).toBeEnabled();
  });

  test('should display part info panel when part selected', async ({ page }) => {
    await page.locator('#partSelect').selectOption({ index: 1 });
    await page.waitForTimeout(500);
    
    // Check part info is displayed
    const partInfo = page.locator('.part-info-panel');
    await expect(partInfo).toBeVisible();
    
    // Should show selected part name
    const selectedPartName = page.locator('#selectedPartName');
    await expect(selectedPartName).not.toHaveText('None');
  });

  test('should handle console errors gracefully', async ({ page }) => {
    const errors = [];
    page.on('console', msg => {
      if (msg.type() === 'error') {
        errors.push(msg.text());
      }
    });
    
    await page.locator('#partSelect').selectOption({ index: 1 });
    await page.waitForTimeout(1000);
    await page.getByRole('button', { name: 'Max ▶' }).click();
    await page.waitForTimeout(500);
    
    // No console errors should occur during normal operation
    expect(errors.length).toBe(0);
  });
});
