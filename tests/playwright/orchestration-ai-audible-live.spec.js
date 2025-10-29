/**
 * LIVE: Verify Ask AI produces immediate audible playback via preemptive stream
 */
import { test, expect } from '@playwright/test';

const ORCH_URL = '/orchestration';

async function getJson(page, path) {
  const res = await page.request.get(path, { timeout: 10000 });
  expect(res.ok()).toBeTruthy();
  return await res.json();
}

test.describe('LIVE AI audible (preemptive)', () => {
  test('Orlok Ask AI triggers AI audio stream now', async ({ page }) => {
    test.setTimeout(90000);
    await page.goto(ORCH_URL);
    await expect(page.locator('h1:has-text("Orchestration Control Center")')).toBeVisible();

    // Select Orlok card
    const orlok = page.locator('.card.animatronic-card:has-text("Orlok")').first();
    await expect(orlok).toBeVisible();

    // Ask AI
    const input = orlok.locator('input[type="text"]').first();
    const q = `Live AI preemptive test ${Date.now()}`;
    await input.fill(q);
    await orlok.locator('button:has-text("Ask AI")').first().click();

    // Poll last-play telemetry until AI kind appears (allow up to 45s)
    let lp = {};
    const start = Date.now();
    while (Date.now() - start < 45000) {
      const info = await getJson(page, '/__audio/last-play');
      lp = info.lastPlay || {};
      if (lp && lp.kind === 'ai' && Date.now() - (lp.ts || 0) < 60000) break;
      await page.waitForTimeout(2000);
    }
    expect(lp.kind).toBe('ai');
    expect(Date.now() - (lp.ts || 0)).toBeLessThan(60000);
    expect(["mpg123", "ffmpeg|pw-play", "speaker_cli"]).toContain(lp.player);
  });
});
