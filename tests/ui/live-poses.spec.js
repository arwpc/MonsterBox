// @ts-check
import { expect, test } from '../test.setup';

// Use Playwright baseURL configured in playwright.config.ts

test.describe('Dashboard - Quick Poses', () => {
  test('page renders quick poses card', async ({ page }) => {
    await page.goto('/');
    await expect(page.locator('h5.card-title:has-text("Quick Poses")')).toBeVisible();
  });

  test('execute a quick pose if available', async ({ page }) => {
    await page.goto('/');
    // wait a bit for poses to load
    await page.waitForTimeout(700);
    const buttons = page.locator('#quick-poses button:has(i.bi-play)');
    const count = await buttons.count();
    if (count === 0) test.skip();
    await buttons.first().click();
    // There is no global status element on dashboard; accept lack of error as pass
    await page.waitForTimeout(300);
  });
});

