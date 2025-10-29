import { test, expect } from '@playwright/test';

const ORCHESTRATION_URL = '/orchestration';

test.describe('LIVE Orchestration AI Audio Check', () => {
  test('Ask AI on Orlok triggers AI audio telemetry', async ({ page }) => {
    test.setTimeout(120000);
    await page.goto(ORCHESTRATION_URL);
    await page.waitForLoadState('domcontentloaded');
    await expect(page.locator('h1:has-text("Orchestration Control Center")')).toBeVisible();

    // Find Orlok card
    const card = page.locator('.card.animatronic-card:has-text("Orlok")').first();
    await expect(card).toBeVisible();

    const input = card.locator('input[type="text"]').first();
    const askBtn = card.locator('button:has-text("Ask AI")').first();

    const question = 'Test immediate AI audio from Orlok at ' + Date.now();
    await input.fill(question);

    // Click Ask AI and then poll telemetry endpoint for AI last-play
    await askBtn.click();

    // Poll /__audio/last-ai for up to 45s
    const max = 45; // seconds
    let seen = null;
    for (let i = 0; i < max; i++) {
      const resp = await page.request.get('/__audio/last-ai');
      if (resp.ok()) {
        const body = await resp.json();
        if (body && body.lastAI && (body.lastAI.kind || '').toLowerCase() === 'ai') {
          seen = body.lastAI;
          break;
        }
      }
      await page.waitForTimeout(1000);
    }

    expect(seen).not.toBeNull();
    console.log('AI play telemetry seen:', seen);
  });
});
