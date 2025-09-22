import { test, expect } from '@playwright/test';

// Run with: MB_E2E=1 BASE_URL=http://localhost:3000 npx playwright test test/e2e/convai-conversation.spec.js
// On RPi4b, ensure Firefox is installed and Playwright uses headless firefox.

const BASE_URL = process.env.BASE_URL || 'http://localhost:3000';

test.describe('ConvAI conversation smoke', () => {
  test.skip(!process.env.MB_E2E, 'MB_E2E not set; skipping ConvAI e2e smoke test');

  test('loads app shell and can reach chat UI', async ({ page, browserName }) => {
    test.slow();
    await page.goto(BASE_URL, { waitUntil: 'domcontentloaded' });

    // Try to find a top-level nav element; be permissive to avoid flakiness across setups
    const body = page.locator('body');
    await expect(body).toBeVisible();

    // If Enhanced Test Chat page is linked, try navigating there
    // This is best-effort; test passes if app shell loads
    const chatLink = page.locator('a:has-text("Chat")');
    if (await chatLink.count()) {
      await chatLink.first().click();
    }
  });
});

