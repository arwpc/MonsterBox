// Playwright tests for Super Powers (Jaw Animation) UI and APIs
// Focus: No 4xx/5xx during normal UI use; explicit API flows in MB_TEST_MODE without hardware

import { test, expect } from '@playwright/test';

async function waitServerReady(page) {
  const deadline = Date.now() + 60000; // allow more time on fresh server
  while (Date.now() < deadline) {
    try {
      const res = await page.request.get('/');
      if (res && res.status() >= 200) return;
    } catch {}
    await new Promise(r => setTimeout(r, 150));
  }
}
async function resetServerErrors(page) {
  try {
    await waitServerReady(page);
    await page.request.post('/__errors/reset');
  } catch (_) {
    // Early startup: ignore connection errors; tests will navigate soon
  }
}
async function getServerErrorCount(page) {
  const res = await page.request.get('/__errors');
  const json = await res.json();
  return json.count || 0;
}

// Capture 400/5xx during an action (intended for UI interactions only)
async function assertNoHttpErrors(page, action, label = 'action') {
  const bad400 = [];
  const bad500 = [];
  const onResp = async (r) => {
    try {
      const s = r.status();
      if (s === 400) {
        bad400.push({ url: r.url(), status: s, body: (await r.text().catch(()=>'')).slice(0, 200) });
      } else if (s >= 500) {
        bad500.push({ url: r.url(), status: s, body: (await r.text().catch(()=>'')).slice(0, 200) });
      }
    } catch {}
  };
  page.on('response', onResp);
  try {
    await action();
  } finally {
    page.off('response', onResp);
  }
  if (bad400.length) console.error('❌ HTTP 400 during', label, bad400);
  if (bad500.length) console.error('❌ HTTP 5xx during', label, bad500);
  expect(bad400, `No HTTP 400 expected during: ${label}`).toHaveLength(0);
  expect(bad500, `No HTTP 5xx expected during: ${label}`).toHaveLength(0);
}

const characterId = 5; // default from config/app-config.json in repo

 test.describe('Setup Super Powers (Jaw Animation)', () => {
  test.beforeEach(async ({ page }) => {
    await resetServerErrors(page);
    await waitServerReady(page);
    await assertNoHttpErrors(page, async () => {
      await page.goto('/setup/super-powers');
      await page.waitForLoadState('domcontentloaded');
    }, 'visit /setup/super-powers');
    expect(await getServerErrorCount(page)).toBe(0);
  });

  test('UI loads or falls back gracefully; tab switching yields no HTTP errors', async ({ page }) => {
    await assertNoHttpErrors(page, async () => {
      const hasJaw = await page.$('#jawAnimationSection');
      if (hasJaw) {
        await page.waitForSelector('#jawEnabled', { timeout: 5000 });
        await page.waitForSelector('#jawServoSelect', { timeout: 5000 });
        // Switch tabs if present
        if (await page.$('#advanced-servos-tab')) {
          await page.click('#advanced-servos-tab');
          await page.waitForTimeout(150);
        }
        if (await page.$('#audio-library-tab')) {
          await page.click('#audio-library-tab');
          await page.waitForTimeout(150);
        }
        if (await page.$('#ai-chat-tab')) {
          await page.click('#ai-chat-tab');
          await page.waitForTimeout(150);
        }
        if (await page.$('#jaw-animation-tab')) {
          await page.click('#jaw-animation-tab');
          await page.waitForTimeout(100);
        }
      } else {
        // Fallback placeholder in MB_TEST_MODE: just ensure page body exists
        await page.waitForSelector('body', { timeout: 3000 });
      }
    }, 'super-powers UI / tab switching');
    expect(await getServerErrorCount(page)).toBe(0);
  });

  test('Jaw Animation API basic flow (test mode, no hardware)', async ({ page }) => {
    await resetServerErrors(page);

    // 1) Read current config and available servos
    const cfgRes = await page.request.get(`/setup/super-powers/api/jaw-animation/${characterId}`, {
      headers: { Accept: 'application/json' }
    });
    expect(cfgRes.ok()).toBeTruthy();
    const cfgJson = await cfgRes.json();
    expect(cfgJson.success).toBeTruthy();

    // 2) Start monitoring, poll audio levels, drive amplitude, stop monitoring
    const startRes = await page.request.post(`/setup/super-powers/api/jaw-animation/${characterId}/start-monitoring`, {
      headers: { Accept: 'application/json' }, data: {}
    });
    expect(startRes.ok()).toBeTruthy();

    const levelsRes = await page.request.get(`/setup/super-powers/api/jaw-animation/${characterId}/audio-levels`, {
      headers: { Accept: 'application/json' }
    });
    expect(levelsRes.ok()).toBeTruthy();
    const levelsJson = await levelsRes.json();
    expect(levelsJson.success).toBeTruthy();
    expect(levelsJson).toHaveProperty('smoothedAmplitude');

    const driveRes = await page.request.post(`/setup/super-powers/api/jaw-animation/${characterId}/drive`, {
      headers: { Accept: 'application/json' },
      data: { amplitude: 0.5 }
    });
    expect(driveRes.ok()).toBeTruthy();
    const driveJson = await driveRes.json();
    expect(driveJson).toHaveProperty('success');

    const stopRes = await page.request.post(`/setup/super-powers/api/jaw-animation/${characterId}/stop-monitoring`, {
      headers: { Accept: 'application/json' }, data: {}
    });
    expect(stopRes.ok()).toBeTruthy();

    // No server 5xx recorded
    expect(await getServerErrorCount(page)).toBe(0);
  });

  test('Jaw Animation API validation: amplitude must be 0..1', async ({ page }) => {
    await resetServerErrors(page);
    const bad = await page.request.post(`/setup/super-powers/api/jaw-animation/${characterId}/drive`, {
      headers: { Accept: 'application/json' },
      data: { amplitude: -0.1 }
    });
    expect(bad.status()).toBe(400);
    const badJson = await bad.json();
    expect(badJson.success).toBeFalsy();
    expect(String(badJson.error || '')).toMatch(/Amplitude/);
    expect(await getServerErrorCount(page)).toBe(0);
  });

  test('Advanced servo test rejects bad input without server 500', async ({ page }) => {
    await resetServerErrors(page);
    // Missing position
    const res1 = await page.request.post(`/setup/super-powers/api/test-advanced-servo/${characterId}`, {
      headers: { Accept: 'application/json' },
      data: { servoId: 999999 }
    });
    expect(res1.status()).toBe(400);
    const res1Json = await res1.json();
    expect(res1Json.success).toBeFalsy();

    // Out-of-range position
    const res2 = await page.request.post(`/setup/super-powers/api/test-advanced-servo/${characterId}`, {
      headers: { Accept: 'application/json' },
      data: { servoId: 999999, position: 999 }
    });
    expect(res2.status()).toBe(400);
    const res2Json = await res2.json();
    expect(res2Json.success).toBeFalsy();

    // No server 5xx recorded
    expect(await getServerErrorCount(page)).toBe(0);
  });
});

