import { test, expect } from '@playwright/test';

/**
 * Parrot Mode E2E smoke test (no new packages)
 * - Ensures the Parrot Mode toggle renders
 * - Simulates a final transcript event and expects a speak call to succeed
 * Run with: MB_E2E=1 npx playwright test test/e2e/parrot-mode.spec.js
 */

const BASE_URL = process.env.BASE_URL || 'http://localhost:3000';

test.describe('Conversation Parrot Mode', () => {
  test.skip(!process.env.MB_E2E, 'MB_E2E not set; skipping e2e');

  test('Parrot Mode echoes final transcript via /conversation/api/say', async ({ page }) => {
    await page.goto(`${BASE_URL}/conversation`);

    // Toggle Parrot Mode on
    const toggle = page.locator('#parrotToggle');
    await expect(toggle).toBeVisible();
    const checked = await toggle.isChecked();
    if (!checked) await toggle.check();

    // Listen for the API call; MB_TEST_MODE routes should respond 200
    const [response] = await Promise.all([
      page.waitForResponse((res) => res.url().endsWith('/conversation/api/say') && res.request().method() === 'POST'),
      // Dispatch a final transcript custom event that MicPanel listeners would send
      page.evaluate(() => {
        const evt = new CustomEvent('micpanel:user_transcript', { detail: { text: 'Testing parrot mode' } });
        document.dispatchEvent(evt);
      })
    ]);

    expect(response.ok()).toBeTruthy();

    // UI feedback should update sayStatus
    await expect(page.locator('#sayStatus')).toContainText(/Parrot (spoke|:)/i);
  });
});

