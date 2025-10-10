import { test, expect } from '@playwright/test';

/**
 * Parrot Mode E2E smoke test (no new packages)
 * Uses configured Playwright setup in playwright.config.ts
 * Run with: MB_E2E=1 npx playwright test -c playwright.config.ts tests/playwright/parrot-mode.spec.js --project=firefox
 */

const BASE_URL = process.env.BASE_URL || 'http://127.0.0.1:3000';

test.describe('Conversation Parrot Mode', () => {
  test.skip(!process.env.MB_E2E, 'MB_E2E not set; skipping e2e');

  test('Parrot Mode echoes final transcript via /conversation/api/say', async ({ page }) => {
    page.on('console', (msg) => {
      // Surface browser console for debugging
      // eslint-disable-next-line no-console
      console.log('[browser]', msg.type(), msg.text());
    });
    page.on('pageerror', (err) => {
      // eslint-disable-next-line no-console
      console.log('[pageerror]', String(err));
    });
    await page.goto(`${BASE_URL}/conversation`);

    // Wait for scripts to initialize
    await page.waitForFunction(() => !!window.__conv, null, { timeout: 15000 });

    // Toggle Parrot Mode on
    const toggle = page.locator('#parrotToggle');
    await expect(toggle).toBeVisible();
    if (!(await toggle.isChecked())) {
      await toggle.check();
    }
    // Ensure change handlers ran and state is true
    await page.evaluate(() => {
      const t = document.getElementById('parrotToggle');
      if (t && !t.checked) t.checked = true;
      if (t) t.dispatchEvent(new Event('change', { bubbles: true }));
    });

    // Dispatch after ensuring listeners are bound
    await Promise.all([
      page.evaluate(() => {
        setTimeout(() => {
          const evt = new CustomEvent('micpanel:user_transcript', { detail: { text: 'Testing parrot mode' } });
          document.dispatchEvent(evt);
        }, 100);
      })
    ]);

    // Verify the POST was made and UI reflects outcome
    const response = await page.waitForResponse((res) => res.url().endsWith('/conversation/api/say') && res.request().method() === 'POST', { timeout: 15000 });
    expect(response.ok()).toBeTruthy();
    await expect(page.locator('#sayStatus')).toContainText(/Parrot (spoke|failed|error)/i, { timeout: 5000 });
  });
});

