import { test, expect } from '../test.setup';

// Runs in Firefox headless per repository config

test.describe('Setup Audio page - Microphone Parts Controls', () => {
  test('renders mic parts section and sliders, no console flood', async ({ page }) => {
    const consoleMessages = [];
    page.on('console', (msg) => {
      const text = msg.text();
      consoleMessages.push(text);
    });

    await page.goto('/setup/audio');

    // Wait for Microphone Parts Controls card
    const micCard = page.locator('#mic-parts-controls');
    await expect(micCard).toBeVisible();

    // List container
    const list = page.locator('#mic-parts-list');
    await expect(list).toBeVisible();

    // If parts exist, expect at least one item to render sliders
    const firstSens = page.locator('[id^="mic-sens-"]').first();
    const firstGain = page.locator('[id^="mic-gain-"]').first();

    // It is okay if there are temporarily no microphone parts, but in this repo there should be at least one
    const hasSens = await firstSens.count();

    if (hasSens > 0) {
      await expect(firstSens).toBeVisible();
      await expect(firstGain).toBeVisible();

      // Slide a little to trigger events (do not assert network)
      const sensValue = await firstSens.inputValue().catch(() => '1');
      const newSens = Math.min(3.0, Math.max(0.1, parseFloat(sensValue || '1') + 0.1));
      // Use fixed precision to avoid floating point artifacts like 2.8000000000000003 causing malformed fill
      await firstSens.fill(Number(newSens).toFixed(1));
      await firstSens.dispatchEvent('change');

      const gainValue = await firstGain.inputValue().catch(() => '100');
      const newGain = Math.min(200, Math.max(0, parseInt(gainValue || '100', 10) + 1));
      await firstGain.fill(String(newGain));
      await firstGain.dispatchEvent('change');
    }

    // Allow the page to settle and ensure no massive log flood (heuristic)
    await page.waitForTimeout(1000);
    const chatter = consoleMessages.filter((m) => /VU level detected|Getting level for input device/.test(m));
    expect(chatter.length).toBeLessThan(200); // heuristic bound
  });
});

