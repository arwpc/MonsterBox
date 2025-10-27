import { test, expect } from '@playwright/test';

// Use Playwright baseURL

async function startServerIfNeeded() {
  // server should already be running from our earlier step in this session.
}

test.describe('Debug VU toggle', () => {
  test('log before/after click', async ({ page }) => {
    await startServerIfNeeded();
  await page.goto('/setup/audio');

    const toggleButtonIn = page.locator('button:has-text("Input Monitoring")').first();
    await expect(toggleButtonIn).toBeVisible();

    const spanIn = page.locator('#input-vu-toggle');
    await page.waitForTimeout(200);
    console.log('initial spanIn text =', await spanIn.textContent());

    // attach console listener to capture errors
    page.on('console', msg => console.log('PAGE LOG:', msg.type(), msg.text()));

    await toggleButtonIn.click();
    await page.waitForTimeout(800);

    console.log('after click spanIn text =', await spanIn.textContent());

    const toggleButtonOut = page.locator('button:has-text("Output Monitoring")').first();
    const spanOut = page.locator('#output-vu-toggle');
    console.log('initial spanOut text =', await spanOut.textContent());
    await toggleButtonOut.click();
    await page.waitForTimeout(800);
    console.log('after click spanOut text =', await spanOut.textContent());
  });
});

