// @ts-check
import { test, expect } from '../test.setup';

const BASE_URL = process.env.BASE_URL || 'http://127.0.0.1:3100';

test.describe('Live Mode - Quick Poses', () => {
  test('page renders quick poses card', async ({ page }) => {
    await page.goto(BASE_URL + '/live');
    await expect(page.getByRole('heading', { name: /Quick Poses/i })).toBeVisible();
  });

  test('execute first pose if available', async ({ page }) => {
    await page.goto(BASE_URL + '/live');
    // wait a bit for poses to load
    await page.waitForTimeout(500);
    const buttons = page.locator('button:has-text("Pose "), button:has(i.bi-play-fill)');
    const count = await buttons.count();
    if (count === 0) test.skip();
    const status = page.locator('#posesStatus');
    await buttons.nth(0).click();
    // We expect either success or error banner to appear
    await expect(status).toBeVisible({ timeout: 5000 });
  });
});

