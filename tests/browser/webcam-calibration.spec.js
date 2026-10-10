/**
 * Webcam Calibration Browser Tests
 * Validates webcam functionality within the /setup/calibration page
 * Tests Controls, Edit, Model/Overrides, Safety, and Advanced tabs for webcam parts
 */

import { test, expect } from './fixtures.js';

const BASE_URL = process.env.BASE_URL || 'http://localhost:3000';

test.describe('Webcam in Calibration Page', () => {
  let page;

  test.beforeEach(async ({ browser }) => {
    page = await browser.newPage();
    await page.goto(BASE_URL + '/setup/calibration', { waitUntil: 'domcontentloaded' });
    // Wait for device list to populate
    await page.waitForSelector('#deviceList', { state: 'attached', timeout: 10000 });
    // Wait for parts to load
    await page.waitForTimeout(2000);
  });

  test.afterEach(async () => {
    await page.close();
  });

  // ── Navigation ───────────────────────────────────────────────────────
  test('should load calibration page without errors', async () => {
    expect(await page.title()).toContain('Calibration');
  });

  test('should NOT have webcam nav item', async () => {
    const webcamLink = page.locator('a.dropdown-item[href="/setup/webcam"]');
    expect(await webcamLink.count()).toBe(0);
  });

  test('/setup/webcam should return 404', async () => {
    const response = await page.goto(BASE_URL + '/setup/webcam');
    expect(response.status()).toBe(404);
  });

  // ── Webcam Part Selection ────────────────────────────────────────────
  test('should display webcam part in device list', async () => {
    // Look for any webcam-type part in the device list
    const webcamItem = page.locator('#deviceList .list-group-item').filter({ hasText: /webcam/i });
    const count = await webcamItem.count();
    expect(count).toBeGreaterThan(0);
  });

  test('should select webcam part and show controls tab', async () => {
    // Click on a webcam part
    const webcamItem = page.locator('#deviceList .list-group-item').filter({ hasText: /webcam/i }).first();
    await webcamItem.click();

    // Controls tab should be active
    const controlsTab = page.locator('button[data-bs-target="#tabControls"]');
    await expect(controlsTab).toBeVisible();
  });

  // ── Controls Tab ─────────────────────────────────────────────────────
  test('should show webcam controls when webcam selected', async () => {
    const webcamItem = page.locator('#deviceList .list-group-item').filter({ hasText: /webcam/i }).first();
    await webcamItem.click();
    await page.waitForTimeout(500);

    // Should have stream preview or controls area content
    const controlsArea = page.locator('#controlsArea');
    await expect(controlsArea).not.toHaveText('Select a device to show controls.');
  });

  test('should have dynamic controls area for webcam', async () => {
    const webcamItem = page.locator('#deviceList .list-group-item').filter({ hasText: /webcam/i }).first();
    await webcamItem.click();
    // Wait for async control loading
    await page.waitForTimeout(2000);

    const dynControls = page.locator('#dynamicControls');
    await expect(dynControls).toBeVisible();
    // Controls require real hardware — skip assertion in CI where no webcam exists
    const controlInputs = dynControls.locator('[id^="ctrl_"]');
    const count = await controlInputs.count();
    if (count === 0) {
      test.skip(true, 'No webcam controls available (no hardware in CI)');
    }
    expect(count).toBeGreaterThan(0);
  });

  test('should have brightness control for webcam', async () => {
    const webcamItem = page.locator('#deviceList .list-group-item').filter({ hasText: /webcam/i }).first();
    await webcamItem.click();
    await page.waitForTimeout(2000);

    const brightnessCtrl = page.locator('#ctrl_brightness');
    // Brightness control requires real webcam hardware
    if (!(await brightnessCtrl.isVisible().catch(() => false))) {
      test.skip(true, 'No brightness control available (no hardware in CI)');
    }
    await expect(brightnessCtrl).toBeVisible();
  });

  test('should have Night Mode toggle for webcam', async () => {
    const webcamItem = page.locator('#deviceList .list-group-item').filter({ hasText: /webcam/i }).first();
    await webcamItem.click();
    await page.waitForTimeout(1000);

    const nightToggle = page.locator('#ctrl_nightMode');
    await expect(nightToggle).toBeVisible();
  });

  test('should have zoom slider for webcam', async () => {
    const webcamItem = page.locator('#deviceList .list-group-item').filter({ hasText: /webcam/i }).first();
    await webcamItem.click();
    await page.waitForTimeout(500);

    const zoomSlider = page.locator('#camZoom');
    await expect(zoomSlider).toBeVisible();
  });

  test('should have capture button for webcam', async () => {
    const webcamItem = page.locator('#deviceList .list-group-item').filter({ hasText: /webcam/i }).first();
    await webcamItem.click();
    await page.waitForTimeout(500);

    const captureBtn = page.locator('#camSnap');
    await expect(captureBtn).toBeVisible();
  });

  test('should have stream image element', async () => {
    const webcamItem = page.locator('#deviceList .list-group-item').filter({ hasText: /webcam/i }).first();
    await webcamItem.click();
    await page.waitForTimeout(500);

    const camPreview = page.locator('#camPreview');
    await expect(camPreview).toBeAttached();
  });

  // ── Edit Tab ─────────────────────────────────────────────────────────
  test('should show webcam edit fields when Edit tab clicked', async () => {
    const webcamItem = page.locator('#deviceList .list-group-item').filter({ hasText: /webcam/i }).first();
    await webcamItem.click();
    await page.waitForTimeout(500);

    // Click Edit tab
    const editTab = page.locator('button[data-bs-target="#tabEdit"]');
    await editTab.click();
    await page.waitForTimeout(300);

    // Name field should be visible
    const nameField = page.locator('#editName');
    await expect(nameField).toBeVisible();
  });

  test('should show Apply to mjpg-streamer button for webcam', async () => {
    const webcamItem = page.locator('#deviceList .list-group-item').filter({ hasText: /webcam/i }).first();
    await webcamItem.click();
    await page.waitForTimeout(500);

    const editTab = page.locator('button[data-bs-target="#tabEdit"]');
    await editTab.click();
    await page.waitForTimeout(300);

    const applyBtn = page.locator('#applyMjpgBtn');
    await expect(applyBtn).toBeVisible();
  });

  // ── Model/Overrides Tab ──────────────────────────────────────────────
  test('should show model dropdown on Model tab', async () => {
    const webcamItem = page.locator('#deviceList .list-group-item').filter({ hasText: /webcam/i }).first();
    await webcamItem.click();
    await page.waitForTimeout(500);

    const modelTab = page.locator('button[data-bs-target="#tabModel"]');
    await modelTab.click();
    await page.waitForTimeout(300);

    const modelSelect = page.locator('#modelSelect');
    await expect(modelSelect).toBeVisible();
  });

  // ── Safety Tab: REMOVED (v11 audit F4) ───────────────────────────────
  // The tab's inputs were never loaded, never saved, and read by nothing;
  // per the 2026-08-20 operator ruling no current cap exists in software.
  // The tab must NOT come back — a control that looks like protection but
  // enforces nothing is worse than none.
  test('the dead Safety tab stays deleted', async () => {
    const webcamItem = page.locator('#deviceList .list-group-item').filter({ hasText: /webcam/i }).first();
    await webcamItem.click();
    await page.waitForTimeout(500);

    await expect(page.locator('button[data-bs-target="#tabSafety"]')).toHaveCount(0);
    await expect(page.locator('#safetyCurrent')).toHaveCount(0);
  });

  // ── Advanced Tab (Motion & Head Tracking) ────────────────────────────
  test('should show motion tracking controls in Advanced tab for webcam', async () => {
    const webcamItem = page.locator('#deviceList .list-group-item').filter({ hasText: /webcam/i }).first();
    await webcamItem.click();
    await page.waitForTimeout(500);

    const advTab = page.locator('button[data-bs-target="#tabAdvanced"]');
    await advTab.click();
    await page.waitForTimeout(300);

    // Motion tracking section should be visible
    const motionDiv = page.locator('#advancedMotionTracking');
    await expect(motionDiv).toBeVisible();

    // Enable motion tracking checkbox should exist
    const enableCb = page.locator('#calEnableMotionTracking');
    await expect(enableCb).toBeVisible();
  });

  test('should show motion tracking sliders when enabled', async () => {
    const webcamItem = page.locator('#deviceList .list-group-item').filter({ hasText: /webcam/i }).first();
    await webcamItem.click();
    await page.waitForTimeout(500);

    const advTab = page.locator('button[data-bs-target="#tabAdvanced"]');
    await advTab.click();
    await page.waitForTimeout(300);

    // Enable motion tracking
    const enableCb = page.locator('#calEnableMotionTracking');
    await enableCb.check();
    await page.waitForTimeout(500);

    // Sliders should now be visible
    const thresholdSlider = page.locator('#calMotionThreshold');
    await expect(thresholdSlider).toBeVisible();

    const contourSlider = page.locator('#calMinContourArea');
    await expect(contourSlider).toBeVisible();

    const smoothingSlider = page.locator('#calTrackingSmoothing');
    await expect(smoothingSlider).toBeVisible();

    const deadzoneSlider = page.locator('#calTrackingDeadzone');
    await expect(deadzoneSlider).toBeVisible();
  });

  test('should show head tracking controls in Advanced tab', async () => {
    const webcamItem = page.locator('#deviceList .list-group-item').filter({ hasText: /webcam/i }).first();
    await webcamItem.click();
    await page.waitForTimeout(500);

    const advTab = page.locator('button[data-bs-target="#tabAdvanced"]');
    await advTab.click();
    await page.waitForTimeout(300);

    // Pan servo selector should be visible
    const panServo = page.locator('#calPanServoSelect');
    await expect(panServo).toBeVisible();

    // Head tracking range slider
    const rangeSlider = page.locator('#calHeadTrackingRange');
    await expect(rangeSlider).toBeVisible();

    // Head tracking smoothing slider
    const smoothSlider = page.locator('#calHeadTrackingSmoothing');
    await expect(smoothSlider).toBeVisible();

    // Enable head tracking button (should be disabled initially)
    const htBtn = page.locator('#calEnableHeadTracking');
    await expect(htBtn).toBeVisible();
    await expect(htBtn).toBeDisabled();
  });

  test('should show emergency stop button in Advanced tab', async () => {
    const webcamItem = page.locator('#deviceList .list-group-item').filter({ hasText: /webcam/i }).first();
    await webcamItem.click();
    await page.waitForTimeout(500);

    const advTab = page.locator('button[data-bs-target="#tabAdvanced"]');
    await advTab.click();
    await page.waitForTimeout(300);

    const eStopBtn = page.locator('#calEmergencyStopBtn');
    await expect(eStopBtn).toBeVisible();
  });

  test('should hide motion tracking for non-webcam parts', async () => {
    // Find a non-webcam part (servo, actuator, etc.) if available
    const servoItem = page.locator('#deviceList .list-group-item').filter({ hasText: /servo/i }).first();
    const count = await servoItem.count();

    if (count > 0) {
      await servoItem.click();
      await page.waitForTimeout(500);

      const advTab = page.locator('button[data-bs-target="#tabAdvanced"]');
      await advTab.click();
      await page.waitForTimeout(300);

      const motionDiv = page.locator('#advancedMotionTracking');
      await expect(motionDiv).toBeHidden();

      const advDefault = page.locator('#advancedDefault');
      await expect(advDefault).toBeVisible();
    }
  });

  // ── Webcam Model CRUD via API ────────────────────────────────────────
  test('should CRUD webcam models via API', async () => {
    // Create
    const createRes = await page.evaluate(async () => {
      var r = await fetch('/setup/calibration/api/webcam/models', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ name: 'PW-Test-Model', manufacturer: 'TestCo', defaults: { width: 320, height: 240 } })
      });
      return r.json();
    });
    expect(createRes.success).toBe(true);
    const modelId = createRes.model.id;

    // Read
    const readRes = await page.evaluate(async (id) => {
      var r = await fetch('/setup/calibration/api/webcam/models/' + id);
      return r.json();
    }, modelId);
    expect(readRes.success).toBe(true);
    expect(readRes.model.name).toBe('PW-Test-Model');

    // Update
    const updateRes = await page.evaluate(async (id) => {
      var r = await fetch('/setup/calibration/api/webcam/models/' + id, {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ name: 'PW-Test-Model-Updated' })
      });
      return r.json();
    }, modelId);
    expect(updateRes.success).toBe(true);

    // Delete
    const deleteRes = await page.evaluate(async (id) => {
      var r = await fetch('/setup/calibration/api/webcam/models/' + id, { method: 'DELETE' });
      return r.json();
    }, modelId);
    expect(deleteRes.success).toBe(true);

    // Verify deleted
    const verifyRes = await page.evaluate(async (id) => {
      var r = await fetch('/setup/calibration/api/webcam/models/' + id);
      return r.status;
    }, modelId);
    expect(verifyRes).toBe(404);
  });

  // ── Zoom slider changes value ────────────────────────────────────────
  test('zoom slider should change value display', async () => {
    const webcamItem = page.locator('#deviceList .list-group-item').filter({ hasText: /webcam/i }).first();
    await webcamItem.click();
    await page.waitForTimeout(500);

    const zoomSlider = page.locator('#camZoom');
    const zoomVal = page.locator('#zoomVal');

    // Change zoom to 200
    await zoomSlider.fill('200');
    await zoomSlider.dispatchEvent('input');
    await page.waitForTimeout(100);

    const text = await zoomVal.textContent();
    expect(text).toContain('200');
  });

  // ── Save Tracking Settings ───────────────────────────────────────────
  test('should have Save Tracking Settings button in Advanced tab', async () => {
    const webcamItem = page.locator('#deviceList .list-group-item').filter({ hasText: /webcam/i }).first();
    await webcamItem.click();
    await page.waitForTimeout(500);

    const advTab = page.locator('button[data-bs-target="#tabAdvanced"]');
    await advTab.click();
    await page.waitForTimeout(300);

    const saveBtn = page.locator('#calSaveAdvancedBtn');
    await expect(saveBtn).toBeVisible();
    await expect(saveBtn).toContainText('Save Tracking Settings');
  });

  // :3100 is the live node, and this used to PUT 42/8/90 into its real webcam
  // part and never put them back (the node's webcam part still carries them). The save is
  // now answered in-page and its payload asserted; the reload half proves the page
  // shows what the SERVER stores, whatever that is.
  test('should save and reload tracking settings', async () => {
    const webcamItem = page.locator('#deviceList .list-group-item').filter({ hasText: /webcam/i }).first();
    await webcamItem.click();
    await page.waitForTimeout(500);

    const advTab = page.locator('button[data-bs-target="#tabAdvanced"]');
    await advTab.click();
    await page.waitForTimeout(300);

    await page.evaluate(() => {
      var t = document.getElementById('calMotionThreshold'); if (t) { t.value = '42'; t.dispatchEvent(new Event('input')); }
      var d = document.getElementById('calTrackingDeadzone'); if (d) { d.value = '8'; d.dispatchEvent(new Event('input')); }
      var r = document.getElementById('calHeadTrackingRange'); if (r) { r.value = '90'; r.dispatchEvent(new Event('input')); }
    });

    let saved = null;
    await page.route(/\/api\/parts\/[^/?]+(\?|$)/, async (route) => {
      if (route.request().method() !== 'PUT') return route.fallback();
      saved = route.request().postDataJSON();
      return route.fulfill({ json: { success: true, intercepted: true } });
    });
    await page.locator('#calSaveAdvancedBtn').click();
    await expect.poll(() => saved, { timeout: 5000 }).not.toBeNull();
    const cfg = saved.config || saved;
    expect(cfg.motionTracking.motionThreshold).toBe(42);
    expect(cfg.motionTracking.trackingDeadzone).toBe(8);
    expect(cfg.headTracking.rangeDeg).toBe(90);
    await page.unroute(/\/api\/parts\/[^/?]+(\?|$)/);

    // Reload: the page must show what the server stores.
    const id = await webcamItem.getAttribute('data-part-id').catch(() => null);
    await page.goto(BASE_URL + '/setup/calibration', { waitUntil: 'domcontentloaded' });
    await page.waitForSelector('#deviceList', { state: 'attached', timeout: 10000 });
    await page.waitForTimeout(2000);
    const webcamItem2 = page.locator('#deviceList .list-group-item').filter({ hasText: /webcam/i }).first();
    await webcamItem2.click();
    await page.waitForTimeout(500);
    await page.locator('button[data-bs-target="#tabAdvanced"]').click();
    await page.waitForTimeout(300);
    const parts = await (await page.request.get(`${BASE_URL}/api/parts`)).json();
    const list = Array.isArray(parts) ? parts : (parts.parts || []);
    const webcam = list.find(p => (id ? String(p.id) === String(id) : p.type === 'webcam'));
    const mt = (webcam && webcam.config && webcam.config.motionTracking) || {};
    if (mt.motionThreshold != null) expect(await page.locator('#calMotionThreshold').inputValue()).toBe(String(mt.motionThreshold));
    if (mt.trackingDeadzone != null) expect(await page.locator('#calTrackingDeadzone').inputValue()).toBe(String(mt.trackingDeadzone));
  });

  test('should show stream preview in Advanced tab', async () => {
    const webcamItem = page.locator('#deviceList .list-group-item').filter({ hasText: /webcam/i }).first();
    await webcamItem.click();
    await page.waitForTimeout(500);

    const advTab = page.locator('button[data-bs-target="#tabAdvanced"]');
    await advTab.click();
    await page.waitForTimeout(300);

    // Stream container should exist
    const streamContainer = page.locator('#advStreamContainer');
    await expect(streamContainer).toBeVisible();

    // Stream image element should exist (hidden until tracking enabled)
    const streamImg = page.locator('#advStreamImg');
    await expect(streamImg).toBeAttached();
  });
});
