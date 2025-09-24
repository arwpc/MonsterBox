import { test, expect } from '@playwright/test';

test('sanity check - page loads', async ({ page }) => {
  await page.goto('/');
  await expect(page.locator('nav')).toBeVisible();
});

