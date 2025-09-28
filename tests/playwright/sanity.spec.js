import { test, expect } from '../test.setup';

test('sanity check - page loads', async ({ page }) => {
  await page.goto('/');
  await expect(page.locator('nav')).toBeVisible();
});

