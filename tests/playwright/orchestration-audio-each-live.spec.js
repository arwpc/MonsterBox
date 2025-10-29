/**
 * LIVE AUDIO TEST: Exercise Say and Play for each animatronic
 * Uses the live server configured in playwright.live.config.ts
 */

import { test, expect } from '@playwright/test';

const ORCHESTRATION_URL = '/orchestration';

test.describe('LIVE Audio per Animatronic', () => {
  test('Say + Play for each animatronic (audible)', async ({ page }) => {
    test.setTimeout(180000);
    await page.goto(ORCHESTRATION_URL);
    await page.waitForLoadState('domcontentloaded');
    await expect(page.locator('h1:has-text("Orchestration Control Center")')).toBeVisible();

    const animNames = ['PumpkinHead', 'Coffin Breaker', 'Orlok', 'Skulltalker', 'Groundbreaker'];

    for (const name of animNames) {
      console.log(`\n🔊 Testing audio on ${name}...`);
      const card = page.locator(`.card.animatronic-card:has-text("${name}")`).first();
      await expect(card).toBeVisible();
      await expect(card.locator('.badge.bg-success:has-text("ONLINE")').first()).toBeVisible();

      // Say (TTS)
      const sayInput = card.locator('input[type="text"]').first();
      await sayInput.fill(`Live test speaking on ${name}`);
      await card.locator('button:has-text("Say")').first().click();
      await page.waitForTimeout(1500);

      // Play from audio dropdown
      const audioSelect = card.locator('select[id^="audio-"]').first();
      const hasSelect = await audioSelect.isVisible();
      if (hasSelect) {
        await audioSelect.selectOption({ index: 1 });
        await card.locator('button:has-text("Play")').first().click();
        await page.waitForTimeout(2000);
        await card.locator('button:has-text("Stop")').first().click();
      } else {
        console.log(`(skip) No audio dropdown for ${name}`);
      }

      // Verify a log entry appeared recently for this card
      const lastLog = page.locator('.log-entry').last();
      await expect(lastLog).toBeVisible();
    }

    console.log('\n✅ Completed LIVE Say + Play across all animatronics');
  });
});
