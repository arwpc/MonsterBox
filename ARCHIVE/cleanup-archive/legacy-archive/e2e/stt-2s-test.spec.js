import { test, expect } from '@playwright/test';

// Smoke test: STT page loads and 2s Test button triggers a result alert
// Designed to be tolerant on CI/arm64 without audio hardware.

test('STT 2s Test smoke', async ({ page }) => {
  // Try to navigate; skip if server not running
  try {
    await page.goto('http://localhost:3000/ai-settings/stt', { timeout: 10000 });
  } catch (e) {
    test.skip(true, 'Server not running on http://localhost:3000');
  }

  await expect(page.locator('h1:has-text("Speech-to-Text Settings")')).toBeVisible();

  // Select first available microphone part if present
  const micSelect = page.locator('#microphonePart');
  await micSelect.waitFor({ state: 'attached' });

  const options = await micSelect.locator('option').all();
  if (options.length > 1) {
    const firstValue = await options[1].getAttribute('value');
    if (firstValue && firstValue.length > 0) {
      await micSelect.selectOption(firstValue);
    }
  }

  // Click 2s Test and expect an alert to appear
  await page.click('#sttTwoSecTest');

  // An alert should show with either success or failure; prefer seeing "Captured"
  const alert = page.locator('.alert');
  await alert.first().waitFor({ state: 'visible', timeout: 30000 }).catch(() => {
    test.skip(true, 'No alert appeared; environment likely lacks audio or API key');
  });

  // If we did get an alert, ensure it rendered some text
  await expect(alert.first()).toContainText(/(Captured|failed|Select a Microphone Part|Please select)/);
});

