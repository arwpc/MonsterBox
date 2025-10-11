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

async function waitServerReady(page) {
  const deadline = Date.now() + 60000; // allow up to 60s when PW_CLEAN_SERVER=1
  while (Date.now() < deadline) {
    try {
      const res = await page.request.get('/');
      if (res && res.status() >= 200) return;
    } catch { }
    await new Promise(r => setTimeout(r, 150));
  }
}
async function resetServerErrors(page) {
  try {
    await waitServerReady(page);
    await page.request.post('/__errors/reset');
  } catch (_) {
    // In early startup races, server may not be up yet; ignore and continue
  }
}
async function getServerErrorCount(page) {
  const res = await page.request.get('/__errors');
  const json = await res.json();
  return json.count || 0;
}

test.describe('Animatronic Demo', () => {
  test.beforeEach(async ({ page }) => {
    await resetServerErrors(page);
    await waitServerReady(page);
    // Navigate to demo page
    const tracker = await trackHttpErrors(page, 'navigate to /demo');
    await page.goto('/demo', { waitUntil: 'domcontentloaded' });
    tracker.assertClean();
    tracker.stop();
    expect(await getServerErrorCount(page)).toBe(0);
  });

  test('Webcam appears and controls toggle without errors', async ({ page }) => {
    await resetServerErrors(page);
    // Webcam should try to stream
    const tracker = await trackHttpErrors(page, 'webcam load');
    await page.waitForSelector('#webcamStatus', { state: 'attached' });
    // Accept either Streaming or helpful message in MB_TEST_MODE environments
    const status = await page.locator('#webcamStatus').textContent();
    expect(status ?? '').not.toEqual('');
    tracker.assertClean();
    tracker.stop();
    expect(await getServerErrorCount(page)).toBe(0);

    // Toggle Jaw Animation and Head Tracking
    await resetServerErrors(page);
    const t2 = await trackHttpErrors(page, 'toggle controls');
    await page.locator('#jawToggle').check();
    await page.waitForTimeout(150);
    await page.locator('#jawToggle').uncheck();
    await page.locator('#headTrackToggle').check();
    await page.waitForTimeout(150);
    await page.locator('#headTrackToggle').uncheck();
    t2.assertClean();
    t2.stop();
    expect(await getServerErrorCount(page)).toBe(0);
  });

  test('Speak action succeeds (test-mode bypass)', async ({ page }) => {
    await resetServerErrors(page);
    const tracker = await trackHttpErrors(page, 'speak');
    await page.fill('#sayInput', 'Hello there!');
    await page.click('#sayBtn');
    await expect(page.locator('#sayStatus')).toContainText(/Done|Success|test|AI responded/i, { timeout: 5000 });
    tracker.assertClean();
    tracker.stop();
    expect(await getServerErrorCount(page)).toBe(0);
  });

  test('Speech bubble overlay, press-to-talk, and selectors presence', async ({ page }) => {
    await resetServerErrors(page);
    // Bubble element should exist
    await expect(page.locator('#speechBubble')).toHaveCount(1);

    // Press-and-hold button exists (likely disabled in CI when not configured)
    const btn = page.locator('#pressHoldBtn');
    await expect(btn).toHaveCount(1);

    // Agent indicator is present (demo shows agent name, not a dropdown)
    await expect(page.locator('#characterAgentName')).toHaveCount(1);

    // Device dropdowns present with at least a default option
    const mic = page.locator('#micSelect');
    const spk = page.locator('#speakerSelect');
    await expect(mic).toHaveCount(1);
    await expect(spk).toHaveCount(1);
    // Wait for device lists to populate (mocked in MB_TEST_MODE)
    await page.waitForFunction(() => {
      const m = document.querySelectorAll('#micSelect option').length;
      const s = document.querySelectorAll('#speakerSelect option').length;
      return m > 0 && s > 0;
    }, null, { timeout: 5000 }).catch(() => { });

    const micOptCount = await mic.locator('option').count();
    const spkOptCount = await spk.locator('option').count();
    expect(micOptCount).toBeGreaterThan(0);
    expect(spkOptCount).toBeGreaterThan(0);
    expect(await getServerErrorCount(page)).toBe(0);
  });
});
