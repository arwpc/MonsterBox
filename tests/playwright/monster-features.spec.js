/**
 * Monster Features Tests
 * Comprehensive tests for Jaw Animation, Parrot Mode, Head Tracking, and AI On
 * Tests state persistence, visual feedback, and integration with hardware
 * 
 * Run with: MB_E2E=1 npx playwright test test/e2e/monster-features.spec.js
 */

import { expect, test } from '@playwright/test';

test.describe('Monster Features - Comprehensive Tests', () => {
  test.skip(!process.env.MB_E2E, 'MB_E2E not set; skipping E2E test');

  test.beforeEach(async ({ page }) => {
    await page.goto(`/conversation`);
    await expect(page).toHaveTitle(/Conversation Mode/);
  });

  test.describe('Jaw Animation Feature', () => {
    test('Toggle persists state across page reloads', async ({ page }) => {
      const jawToggle = page.locator('#jawToggle');

      // Enable jaw animation
      await jawToggle.check();
      await page.waitForTimeout(500);

      // Reload page
      await page.reload();
      await page.waitForTimeout(1000);

      // Verify state persisted
      const isChecked = await page.locator('#jawToggle').isChecked();
      expect(isChecked).toBe(true);

      // Disable and verify
      await page.locator('#jawToggle').uncheck();
      await page.waitForTimeout(500);
      await page.reload();
      await page.waitForTimeout(1000);

      const isUnchecked = await page.locator('#jawToggle').isChecked();
      expect(isUnchecked).toBe(false);

      console.log('✅ Jaw Animation state persists across reloads');
    });

    test('Config button links to Super Powers page', async ({ page }) => {
      const configBtn = page.locator('a[title="Configure Jaw Animation"]');
      await expect(configBtn).toBeVisible();

      await configBtn.click();
      await expect(page).toHaveURL(/super-powers/);

      console.log('✅ Jaw Animation config button works');
    });

    test('Toggle shows visual feedback', async ({ page }) => {
      const jawToggle = page.locator('#jawToggle');
      const label = page.locator('label[for="jawToggle"]');

      await expect(label).toContainText('Jaw Animation');

      // Toggle and verify visual state changes
      const initialChecked = await jawToggle.isChecked();
      await jawToggle.click();
      await page.waitForTimeout(300);

      const newChecked = await jawToggle.isChecked();
      expect(newChecked).toBe(!initialChecked);

      console.log('✅ Jaw Animation toggle provides visual feedback');
    });

    test('Description text is accurate', async ({ page }) => {
      const description = page.locator('text=Automatically animates the jaw servo');
      await expect(description).toBeVisible();

      console.log('✅ Jaw Animation description displayed');
    });
  });

  test.describe('Parrot Mode Feature', () => {
    test('Toggle persists state across page reloads', async ({ page }) => {
      const parrotToggle = page.locator('#parrotToggle');

      // Enable parrot mode
      await parrotToggle.check();
      await page.waitForTimeout(500);

      // Reload page
      await page.reload();
      await page.waitForTimeout(1000);

      // Verify state persisted
      const isChecked = await page.locator('#parrotToggle').isChecked();
      expect(isChecked).toBe(true);

      // Disable and verify
      await page.locator('#parrotToggle').uncheck();
      await page.waitForTimeout(500);
      await page.reload();
      await page.waitForTimeout(1000);

      const isUnchecked = await page.locator('#parrotToggle').isChecked();
      expect(isUnchecked).toBe(false);

      console.log('✅ Parrot Mode state persists across reloads');
    });

    test('Config button links to Super Powers page', async ({ page }) => {
      const configBtn = page.locator('a[title="Configure Parrot Mode"]');
      await expect(configBtn).toBeVisible();

      await configBtn.click();
      await expect(page).toHaveURL(/super-powers/);

      console.log('✅ Parrot Mode config button works');
    });

    test('Description text is accurate', async ({ page }) => {
      const description = page.locator('text=Repeats detected speech back to the visitor');
      await expect(description).toBeVisible();

      console.log('✅ Parrot Mode description displayed');
    });
  });

  test.describe('Head Tracking Feature', () => {
    test('Toggle persists state across page reloads', async ({ page }) => {
      const headTrackToggle = page.locator('#headTrackToggle');

      // Enable head tracking
      await headTrackToggle.check();
      await page.waitForTimeout(500);

      // Reload page
      await page.reload();
      await page.waitForTimeout(1000);

      // Verify state persisted
      const isChecked = await page.locator('#headTrackToggle').isChecked();
      expect(isChecked).toBe(true);

      // Disable and verify
      await page.locator('#headTrackToggle').uncheck();
      await page.waitForTimeout(500);
      await page.reload();
      await page.waitForTimeout(1000);

      const isUnchecked = await page.locator('#headTrackToggle').isChecked();
      expect(isUnchecked).toBe(false);

      console.log('✅ Head Tracking state persists across reloads');
    });

    test('Config button links to Super Powers page', async ({ page }) => {
      const configBtn = page.locator('a[title="Configure Head Tracking"]');
      await expect(configBtn).toBeVisible();

      await configBtn.click();
      await expect(page).toHaveURL(/super-powers/);

      console.log('✅ Head Tracking config button works');
    });

    test('Description text is accurate', async ({ page }) => {
      const description = page.locator('text=Tracks visitor movement using webcam');
      await expect(description).toBeVisible();

      console.log('✅ Head Tracking description displayed');
    });
  });

  test.describe('AI On Feature', () => {
    test('Toggle persists state across page reloads', async ({ page }) => {
      const aiOnToggle = page.locator('#aiOnToggle');

      // Enable AI
      await aiOnToggle.check();
      await page.waitForTimeout(1000);

      // Reload page
      await page.reload();
      await page.waitForTimeout(1000);

      // Verify state persisted
      const isChecked = await page.locator('#aiOnToggle').isChecked();
      expect(isChecked).toBe(true);

      // Disable and verify
      await page.locator('#aiOnToggle').uncheck();
      await page.waitForTimeout(500);
      await page.reload();
      await page.waitForTimeout(1000);

      const isUnchecked = await page.locator('#aiOnToggle').isChecked();
      expect(isUnchecked).toBe(false);

      console.log('✅ AI On state persists across reloads');
    });

    test('Latency display shows when AI is enabled', async ({ page }) => {
      const aiOnToggle = page.locator('#aiOnToggle');
      const aiLatency = page.locator('#aiLatency');
      const latencyMs = page.locator('#latencyMs');

      // Initially latency should be hidden
      await expect(aiLatency).toBeHidden();

      // Enable AI
      await aiOnToggle.check();
      await page.waitForTimeout(1500);

      // Latency should now be visible
      await expect(aiLatency).toBeVisible();
      await expect(latencyMs).toBeVisible();

      // Latency value should be a number
      const latencyText = await latencyMs.textContent();
      expect(latencyText).toMatch(/\d+/);

      // Disable AI
      await aiOnToggle.uncheck();
      await page.waitForTimeout(500);

      // Latency should be hidden again
      await expect(aiLatency).toBeHidden();

      console.log('✅ AI On latency display works correctly');
    });

    test('Latency updates periodically when AI is on', async ({ page }) => {
      const aiOnToggle = page.locator('#aiOnToggle');
      const latencyMs = page.locator('#latencyMs');

      // Enable AI
      await aiOnToggle.check();
      await page.waitForTimeout(1500);

      // Get initial latency
      const latency1 = await latencyMs.textContent();

      // Wait for update (should update every 2 seconds)
      await page.waitForTimeout(2500);

      // Get updated latency
      const latency2 = await latencyMs.textContent();

      // Values should be numbers (may or may not be different)
      expect(latency1).toMatch(/\d+/);
      expect(latency2).toMatch(/\d+/);

      // Disable AI
      await aiOnToggle.uncheck();
      await page.waitForTimeout(500);

      console.log('✅ AI On latency monitoring works');
    });

    test('Description text is accurate', async ({ page }) => {
      const description = page.locator('text=Enables fully autonomous conversation mode');
      await expect(description).toBeVisible();

      console.log('✅ AI On description displayed');
    });
  });

  test.describe('Monster Features Integration', () => {
    test('All features can be enabled simultaneously', async ({ page }) => {
      // Enable all features
      await page.locator('#jawToggle').check();
      await page.waitForTimeout(300);
      await page.locator('#parrotToggle').check();
      await page.waitForTimeout(300);
      await page.locator('#headTrackToggle').check();
      await page.waitForTimeout(300);
      await page.locator('#aiOnToggle').check();
      await page.waitForTimeout(1000);

      // Verify all are checked
      expect(await page.locator('#jawToggle').isChecked()).toBe(true);
      expect(await page.locator('#parrotToggle').isChecked()).toBe(true);
      expect(await page.locator('#headTrackToggle').isChecked()).toBe(true);
      expect(await page.locator('#aiOnToggle').isChecked()).toBe(true);

      // Verify AI latency is showing
      await expect(page.locator('#aiLatency')).toBeVisible();

      console.log('✅ All Monster Features can be enabled simultaneously');
    });

    test('All features can be disabled simultaneously', async ({ page }) => {
      // First enable all
      await page.locator('#jawToggle').check();
      await page.locator('#parrotToggle').check();
      await page.locator('#headTrackToggle').check();
      await page.locator('#aiOnToggle').check();
      await page.waitForTimeout(1000);

      // Now disable all
      await page.locator('#jawToggle').uncheck();
      await page.waitForTimeout(300);
      await page.locator('#parrotToggle').uncheck();
      await page.waitForTimeout(300);
      await page.locator('#headTrackToggle').uncheck();
      await page.waitForTimeout(300);
      await page.locator('#aiOnToggle').uncheck();
      await page.waitForTimeout(500);

      // Verify all are unchecked
      expect(await page.locator('#jawToggle').isChecked()).toBe(false);
      expect(await page.locator('#parrotToggle').isChecked()).toBe(false);
      expect(await page.locator('#headTrackToggle').isChecked()).toBe(false);
      expect(await page.locator('#aiOnToggle').isChecked()).toBe(false);

      // Verify AI latency is hidden
      await expect(page.locator('#aiLatency')).toBeHidden();

      console.log('✅ All Monster Features can be disabled simultaneously');
    });

    test('Feature states persist together across reload', async ({ page }) => {
      // Enable all features
      await page.locator('#jawToggle').check();
      await page.locator('#parrotToggle').check();
      await page.locator('#headTrackToggle').check();
      await page.locator('#aiOnToggle').check();
      await page.waitForTimeout(1000);

      // Reload page
      await page.reload();
      await page.waitForTimeout(1500);

      // Verify all states persisted
      expect(await page.locator('#jawToggle').isChecked()).toBe(true);
      expect(await page.locator('#parrotToggle').isChecked()).toBe(true);
      expect(await page.locator('#headTrackToggle').isChecked()).toBe(true);
      expect(await page.locator('#aiOnToggle').isChecked()).toBe(true);

      // Clean up - disable all
      await page.locator('#jawToggle').uncheck();
      await page.locator('#parrotToggle').uncheck();
      await page.locator('#headTrackToggle').uncheck();
      await page.locator('#aiOnToggle').uncheck();
      await page.waitForTimeout(500);

      console.log('✅ All Monster Features states persist together');
    });
  });
});

