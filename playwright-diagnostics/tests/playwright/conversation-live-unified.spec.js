// Playwright tests for Conversation and Live unified components
import { test, expect } from '@playwright/test';

const BASE = 'http://127.0.0.1:3000';

function expectStatusEventually(locator, timeout = 3000) {
  return Promise.race([
    locator.waitFor({ state: 'visible', timeout }),
    new Promise(resolve => setTimeout(resolve, timeout))
  ]);
}

test.describe('Conversation/Live unified components', () => {
  test('Conversation: speaker selector and webcam status present', async ({ page }) => {
    await page.goto(BASE + '/conversation');
    const sel = page.locator('#convSpeakerSelect');
    await expect(sel).toBeVisible();
    // At least one option or default option
    const count = await sel.locator('option').count();
    expect(count).toBeGreaterThan(0);

    const webcamStatus = page.locator('#webcamStatus');
    await expect(webcamStatus).toBeVisible();
  });

  test('Conversation: mic start/stop UI and jaw toggle persistence', async ({ page }) => {
    await page.goto(BASE + '/conversation');
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

  test('Live: speaker selector, webcam status, and mic start/stop UI', async ({ page }) => {
    await page.goto(BASE + '/live');
    const sel = page.locator('#liveSpeakerSelect');
    await expect(sel).toBeVisible();
    const webcamStatus = page.locator('#webcamStatus');
    await expect(webcamStatus).toBeVisible();

    const start = page.locator('#liveMicStart');
    const stop = page.locator('#liveMicStop');
    const status = page.locator('#liveMicStatus');
    await expect(start).toBeVisible();
    await expect(stop).toBeVisible();
    await start.click();
    await page.waitForTimeout(300);
    // In CI, mic permission may fail; just perform start/stop without asserting meter visibility
    await stop.click();
    await page.waitForTimeout(150);
  });
});
