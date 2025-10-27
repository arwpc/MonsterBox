// Playwright tests for Conversation and Live unified components
import { test, expect } from '../test.setup';

function expectStatusEventually(locator, timeout = 3000) {
  return Promise.race([
    locator.waitFor({ state: 'visible', timeout }),
    new Promise(resolve => setTimeout(resolve, timeout))
  ]);
}

test.describe('Conversation/Live unified components', () => {
  test('Conversation: speaker selector and webcam status present', async ({ page }) => {
    await page.goto('/conversation');
    const sel = page.locator('#convSpeakerSelect');
    await expect(sel).toBeVisible();
    // At least one option or default option
    const count = await sel.locator('option').count();
    expect(count).toBeGreaterThan(0);

    const webcamStatus = page.locator('#webcamStatus');
    await expect(webcamStatus).toBeVisible();
  });

  test('Conversation: mic start/stop UI and jaw toggle persistence', async ({ page }) => {
    await page.goto('/conversation');
    const status = page.locator('#micStatus');
    const start = page.locator('#micStart');
    const stop = page.locator('#micStop');
    await expect(start).toBeVisible();
    await expect(stop).toBeVisible();

    await start.click();
    // Allow either Listening..., Mic error, or Stopped depending on environment permissions
    await page.waitForTimeout(300);
    const text1 = await status.textContent();
    expect(text1 === null ? '' : text1).toMatch(/Listening|Mic error|Stopped/i);

    await stop.click();
    await page.waitForTimeout(150);
    const text2 = await status.textContent();
    expect(text2 === null ? '' : text2).toMatch(/Stopped/i);

    // Jaw toggle persistence ON
    const jaw = page.locator('#jawToggle');
    await expect(jaw).toBeVisible();
    const wasChecked = await jaw.isChecked();
    if (!wasChecked) { await jaw.check(); }
    await page.reload();
    const jaw2 = page.locator('#jawToggle');
    await expect(jaw2).toBeVisible();
    await expect(jaw2).toBeChecked();
  });

  // Removed deprecated Live page checks
});
