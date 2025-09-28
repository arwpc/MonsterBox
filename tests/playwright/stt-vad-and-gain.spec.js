import { test, expect } from '../test.setup';

// Verifies STT page exposes Input Gain + VAD controls and fires the expected network calls

test.describe('AI Settings - STT: VAD + Input Gain', () => {
  test('tunes input gain live and persists VAD settings', async ({ page }) => {
    // Mock input gain apply
    await page.route('**/setup/audio/api/set-input-gain', async (route) => {
      await route.fulfill({ status: 200, contentType: 'application/json', body: JSON.stringify({ success: true }) });
    });
    // Mock STT config persistence
    await page.route('**/api/elevenlabs/stt/config', async (route) => {
      const body = route.request().postDataJSON() || {};
      await route.fulfill({ status: 200, contentType: 'application/json', body: JSON.stringify({ success: true, config: body }) });
    });

    await page.goto('/ai-settings/stt');

    // Wait for microphone dropdown to populate and select first real option
    await page.waitForSelector('#microphonePart');
    await page.waitForFunction(() => document.querySelectorAll('#microphonePart option').length > 0, null, { timeout: 10000 });
    const firstMicValue = await page.$eval('#microphonePart', (sel) => {
      const opts = Array.from(sel.options);
      const item = opts.find(o => o.value !== '' && !/loading|failed/i.test(o.textContent || ''));
      return item ? item.value : '';
    });
    if (firstMicValue) {
      await page.selectOption('#microphonePart', firstMicValue);
    }

    // Controls present
    const gain = page.locator('#inputGain');
    const gainLabel = page.locator('#inputGainLabel');
    const vadToggle = page.locator('#vadEnabled');
    const vadThr = page.locator('#vadThreshold');
    const vadThrLabel = page.locator('#vadThresholdLabel');

    await expect(gain).toBeVisible();
    await expect(gainLabel).toBeVisible();
    await expect(vadToggle).toBeVisible();
    await expect(vadThr).toBeVisible();
    await expect(vadThrLabel).toBeVisible();

    // Adjust Input Gain -> expect POST to /setup/audio/api/set-input-gain
    const gainReq = page.waitForRequest((req) => req.method() === 'POST' && req.url().includes('/setup/audio/api/set-input-gain'));
    await gain.fill('135');
    await gain.dispatchEvent('input');
    await expect(gainLabel).toHaveText(/135%/);
    await gainReq;

    // Toggle VAD on -> expect config POST
    const configReq1 = page.waitForRequest((req) => req.method() === 'POST' && req.url().includes('/api/elevenlabs/stt/config'));
    await vadToggle.check();
    await configReq1;

    // Move threshold to 5% -> expect another config POST and label update
    const configReq2 = page.waitForRequest((req) => req.method() === 'POST' && req.url().includes('/api/elevenlabs/stt/config'));
    await vadThr.fill('5');
    await vadThr.dispatchEvent('input');
    await expect(vadThrLabel).toHaveText('5%');
    await configReq2;
  });
});

