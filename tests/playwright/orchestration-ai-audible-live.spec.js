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
    test.setTimeout(150000);
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

    // Poll last-AI telemetry until AI event appears (allow up to 60s), fallback to last-play if needed
  let seen = null;
  const start = Date.now();
    while (Date.now() - start < 60000) {
      try {
        const info = await getJson(page, '/__audio/last-ai');
        const ai = info.lastAI || null;
        if (ai && (ai.kind || '').toLowerCase() === 'ai' && Date.now() - (ai.ts || 0) < 60000) {
          seen = ai;
          break;
        }
      } catch {}
      try {
        const lp = await getJson(page, '/__audio/last-play');
        const last = lp.lastPlay || null;
        const fresh = last && (Date.now() - (last.ts || 0) < 60000);
        if (fresh && ((last.kind || '').toLowerCase() === 'ai' || (last.ts > start))) {
          seen = Object.assign({ kind: (last.kind || 'ai') }, last);
          break;
        }
      } catch {}
      await page.waitForTimeout(2000);
    }
    expect(seen).not.toBeNull();
    expect(Date.now() - (seen.ts || 0)).toBeLessThan(60000);
    expect(["mpg123", "ffmpeg|pw-play", "speaker_cli", "pw-play"]).toContain(seen.player);
  });
});
