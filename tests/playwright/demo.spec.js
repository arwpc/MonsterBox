// Playwright tests for the kid-friendly Animatronic Demo page
// Validates: see webcam, talk to robot (HTTP success), toggle jaw/head without 400/500s

import { test, expect } from '@playwright/test';

async function trackHttpErrors(page, label) {
  const bad400 = [];
  const bad500 = [];
  const onResponse = (resp) => {
    const url = resp.url();
    const status = resp.status();
    if (status >= 400 && status < 500) bad400.push({ url, status });
    if (status >= 500) bad500.push({ url, status });
  };
  page.on('response', onResponse);
  return {
    stop: () => page.off('response', onResponse),
    assertClean: () => {
      if (bad400.length) console.error('HTTP 4xx during', label, bad400);
      if (bad500.length) console.error('HTTP 5xx during', label, bad500);
      expect(bad400, `No HTTP 400 during: ${label}`).toHaveLength(0);
      expect(bad500, `No HTTP 5xx during: ${label}`).toHaveLength(0);
    }
  };
}

test.describe('Animatronic Demo', () => {
  test.beforeEach(async ({ page }) => {
    // Navigate to demo page
    const tracker = await trackHttpErrors(page, 'navigate to /demo');
    await page.goto('/demo', { waitUntil: 'domcontentloaded' });
    tracker.assertClean();
    tracker.stop();
  });

  test('Webcam appears and controls toggle without errors', async ({ page }) => {
    // Webcam should try to stream
    const tracker = await trackHttpErrors(page, 'webcam load');
    await page.waitForSelector('#webcamStatus', { state: 'attached' });
    // Accept either Streaming or helpful message in MB_TEST_MODE environments
    const status = await page.locator('#webcamStatus').textContent();
    expect(status ?? '').not.toEqual('');
    tracker.assertClean();
    tracker.stop();

    // Toggle Jaw Animation and Head Tracking
    const t2 = await trackHttpErrors(page, 'toggle controls');
    await page.locator('#jawToggle').check();
    await page.waitForTimeout(150);
    await page.locator('#jawToggle').uncheck();
    await page.locator('#headTrackToggle').check();
    await page.waitForTimeout(150);
    await page.locator('#headTrackToggle').uncheck();
    t2.assertClean();
    t2.stop();
  });

  test('Speak action succeeds (test-mode bypass)', async ({ page }) => {
    const tracker = await trackHttpErrors(page, 'speak');
    await page.fill('#sayInput', 'Hello there!');
    await page.click('#sayBtn');
    await expect(page.locator('#sayStatus')).toContainText(/Done|Success|test/i, { timeout: 5000 });
    tracker.assertClean();
    tracker.stop();
  });

  test('Speech bubble overlay and press-to-talk presence', async ({ page }) => {
    // Bubble element should exist
    await expect(page.locator('#speechBubble')).toHaveCount(1);
    // Press-and-hold button exists and is disabled by default when ElevenLabs not configured in CI
    const btn = page.locator('#pressHoldBtn');
    await expect(btn).toHaveCount(1);
    await expect(btn).toBeDisabled();
  });
});

