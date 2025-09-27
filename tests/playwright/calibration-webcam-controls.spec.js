import { test, expect } from '@playwright/test';

// Verifies Webcam Controls UI in Setup → Calibration → Controls tab
// Uses route mocking to avoid dependency on actual v4l2/mjpg-streamer

test.describe('Calibration - Webcam Controls (Edit experience in Controls tab)', () => {
  test('shows live preview, zoom, common controls, and calls load/apply endpoints', async ({ page }) => {
    // Mock webcam controls list/apply endpoints for any part id
    await page.route('**/setup/webcam/api/parts/*/controls/list', async (route) => {
      await route.fulfill({
        status: 200, contentType: 'application/json', body: JSON.stringify({
          success: true,
          controls: { brightness: 120, contrast: 130, saturation: 140, ir_cut: 0 }
        })
      });
    });
    await page.route('**/setup/webcam/api/parts/*/controls/set', async (route) => {
      // Echo body back for validation
      const body = route.request().postData() || '{}';
      await route.fulfill({ status: 200, contentType: 'application/json', body: JSON.stringify({ success: true, echoed: JSON.parse(body) }) });
    });

    await page.goto('/setup/calibration');

    // Click first webcam in device list
    const webcamItem = page.locator('.list-group-item').filter({ hasText: /webcam/i }).first();
    await expect(webcamItem).toBeVisible();
    await webcamItem.click();

    // Ensure Controls tab is active
    const controlsTabBtn = page.locator('button[data-bs-target="#tabControls"]');
    if (await controlsTabBtn.count()) await controlsTabBtn.click();

    // Webcam block elements
    const preview = page.locator('#camPreview');
    const zoom = page.locator('#camZoom');
    const loadBtn = page.locator('#loadCamCtrls');
    const applyBtn = page.locator('#applyCamCtrls');

    // Preview <img> may render hidden if the stream is unreachable; assert it's attached with proper src
    await expect(preview).toHaveAttribute('id', 'camPreview');
    await expect(preview).toHaveAttribute('src', /\/setup\/webcam\/api\/parts\/.+\/stream/);

    // The UI control elements should be visible and interactable
    await expect(zoom).toBeVisible();
    await expect(loadBtn).toBeVisible();
    await expect(applyBtn).toBeVisible();

    // Sliders/toggle present
    await expect(page.locator('#ctrl_brightness')).toBeVisible();
    await expect(page.locator('#ctrl_contrast')).toBeVisible();
    await expect(page.locator('#ctrl_saturation')).toBeVisible();
    await expect(page.locator('#ctrl_ir')).toBeVisible();

    // Zoom label reacts
    const zoomVal = page.locator('#zoomVal');
    await zoom.fill('150');
    await expect(zoomVal).toHaveText(/150%/);

    // Load controls triggers GET to list
    const listReq = page.waitForRequest((req) => req.url().includes('/controls/list'));
    await loadBtn.click();
    await listReq;

    // Change one control, then Apply & Save triggers PUT to set
    await page.locator('#ctrl_brightness').fill('200');
    const setReq = page.waitForRequest((req) => req.method() === 'PUT' && req.url().includes('/controls/set'));
    await applyBtn.click();
    const req = await setReq;

    // Verify body minimally well-formed
    const body = req.postDataJSON();
    expect(body).toBeTruthy();
    expect(body.persist).toBeTruthy();
    expect(typeof body.controls).toBe('object');
  });
});

