/**
 * Relay Toggle Browser Tests
 * Verifies the ACEIRMC 3V relay module (Hand of Azura, part 8) toggles on/off
 * via the Calibration page toggle button
 */

import { test, expect } from '@playwright/test';

const BASE_URL = process.env.BASE_URL || 'http://localhost:3200';
const RELAY_PART_ID = '8';

// These tests require Orlok (char_id=3) with specific hardware parts
// Skip in CI where MB_TEST_MODE defaults to char_id=1
test.skip(!!process.env.MB_TEST_MODE, 'Requires Orlok hardware (char_id=3)');

test.describe('Relay Toggle — ACEIRMC 3V 1-Channel', () => {
  let page;

  test.beforeEach(async ({ browser }) => {
    page = await browser.newPage();
  });

  test.afterEach(async () => {
    await page.close();
  });

  test('should have relay model in light models', async () => {
    await page.goto(BASE_URL + '/setup/calibration', { waitUntil: 'domcontentloaded' });
    const res = await page.evaluate(async () => {
      var r = await fetch('/setup/models/api/light');
      return r.json();
    });
    expect(res.success).toBe(true);
    var relay = res.models.find(function (m) { return m.id === 'relay_aceirmc_3v_1ch'; });
    expect(relay).toBeTruthy();
    expect(relay.name).toContain('ACEIRMC');
    expect(relay.meta.coilVoltage).toBe('3VDC (operates on 3.3-5V supply)');
    expect(relay.meta.triggerMode).toContain('HIGH');
  });

  test('should have Hand of Azura part with relay model on GPIO 16', async () => {
    await page.goto(BASE_URL + '/setup/calibration', { waitUntil: 'domcontentloaded' });
    const res = await page.evaluate(async (partId) => {
      var r = await fetch('/api/parts/' + partId);
      return r.json();
    }, RELAY_PART_ID);
    expect(res.success).toBe(true);
    expect(res.part.name).toBe('Hand of Azura');
    expect(res.part.type).toBe('light');
    expect(res.part.pin).toBe(16);
    expect(res.part.modelId).toBe('relay_aceirmc_3v_1ch');
  });

  test('should turn relay on via API', async () => {
    await page.goto(BASE_URL + '/setup/calibration', { waitUntil: 'domcontentloaded' });
    const res = await page.evaluate(async (partId) => {
      var r = await fetch('/api/parts/' + partId + '/test', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ action: 'turnOn' })
      });
      return { status: r.status, body: await r.json() };
    }, RELAY_PART_ID);
    expect(res.status).toBe(200);
    expect(res.body.success).toBe(true);
  });

  test('should turn relay off via API', async () => {
    await page.goto(BASE_URL + '/setup/calibration', { waitUntil: 'domcontentloaded' });
    const res = await page.evaluate(async (partId) => {
      var r = await fetch('/api/parts/' + partId + '/test', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ action: 'turnOff' })
      });
      return { status: r.status, body: await r.json() };
    }, RELAY_PART_ID);
    expect(res.status).toBe(200);
    expect(res.body.success).toBe(true);
  });

  test('should toggle relay on and off from calibration page', async () => {
    await page.goto(BASE_URL + '/setup/calibration', { waitUntil: 'domcontentloaded' });
    await page.waitForSelector('#deviceList', { state: 'attached', timeout: 10000 });
    await page.waitForTimeout(2000);

    // Select the Hand of Azura light part
    var lightItem = page.locator('#deviceList .list-group-item').filter({ hasText: /Hand of Azura/i }).first();
    var count = await lightItem.count();
    expect(count).toBe(1);
    await lightItem.click();
    await page.waitForTimeout(500);

    // The Toggle button should be visible in the controls area
    var toggleBtn = page.locator('#lightToggle');
    await expect(toggleBtn).toBeVisible();

    // Intercept the toggle API call
    var toggleResponse = page.waitForResponse(function (resp) {
      return resp.url().includes('/api/parts/8/test') && resp.request().method() === 'POST';
    });

    // Click Toggle
    await toggleBtn.click();
    var resp = await toggleResponse;
    var body = await resp.json();
    expect(body.success).toBe(true);
  });
});
