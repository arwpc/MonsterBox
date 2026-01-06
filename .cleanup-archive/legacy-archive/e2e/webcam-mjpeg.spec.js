// Playwright e2e test to verify MJPEG stream renders on /setup/webcam
// Requires on Raspberry Pi (arm64):
//   npm install -D @playwright/test
//   npx playwright install firefox
//   sudo npx playwright install-deps firefox
const { test, expect } = require('@playwright/test');

// Helper: wait for an <img> to render at least one frame
async function waitForImageToRender(page, selector, timeoutMs) {
  const start = Date.now();
  while (Date.now() - start < (timeoutMs || 10000)) {
    const size = await page.evaluate((sel) => {
      const img = document.querySelector(sel);
      if (!img) return { w: 0, h: 0, disp: false };
      return { w: img.naturalWidth || 0, h: img.naturalHeight || 0, disp: !!(img.offsetParent) };
    }, selector);
    if (size && size.w > 0 && size.h > 0) return true;
    await page.waitForTimeout(200);
  }
  return false;
}

test('MJPEG stream starts and first frame renders', async ({ page }) => {
  // Go to Setup Webcam
  await page.goto('http://localhost:3000/setup/webcam', { waitUntil: 'domcontentloaded' });

  // Ensure webcam parts loaded; pick the first available option (if any)
  await page.waitForSelector('#webcamPart');
  // Wait for options to populate
  await page.waitForFunction(() => {
    const sel = document.querySelector('#webcamPart');
    return sel && sel.options && sel.options.length > 0 && sel.options[0].value !== '';
  }, null, { timeout: 5000 });

  // Select first webcam part
  const firstValue = await page.$eval('#webcamPart', (sel) => sel.options[0].value);
  await page.selectOption('#webcamPart', firstValue);

  // Start stream
  await page.click('#startStream');

  // Wait for the stream <img> to be visible
  await page.waitForSelector('#webcamStream', { state: 'visible', timeout: 5000 });

  // Validate that at least one frame rendered (naturalWidth/Height > 0)
  const rendered = await waitForImageToRender(page, '#webcamStream', 30000);
  expect(rendered).toBeTruthy();
});

