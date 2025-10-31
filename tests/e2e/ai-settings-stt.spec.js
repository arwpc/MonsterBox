import { test, expect } from '../test.setup';

// Verifies STT page populates dropdowns and does not spam console

test.describe('AI Settings STT page - populate and stability', () => {
  test('dropdowns populate and console not flooded', async ({ page }) => {
    const messages = [];
    page.on('console', (msg) => messages.push({ type: msg.type(), text: msg.text() }));

    await page.goto('/ai-settings/stt');

    const sttModel = page.locator('#sttModel');
    const micSelect = page.locator('#microphonePart');

    await expect(sttModel).toBeVisible();
    await expect(micSelect).toBeVisible();

    // Wait for STT models to populate
    await page.waitForFunction(() => document.querySelectorAll('#sttModel option').length > 0);

    // Wait briefly for microphone parts to load (allow empty if none configured, but not stuck on placeholder)
    await page.waitForTimeout(2000);
    const micOptions = await page.locator('#microphonePart option').allTextContents();
    // Either more than 1 option or the first option is not a loading/error placeholder
    const first = micOptions[0] || '';
    const isPlaceholder = /Loading|Failed/i.test(first);
    expect(micOptions.length > 1 || !isPlaceholder).toBeTruthy();

    // Give it a few seconds and ensure console is not flooded by repeated logs
    const startCount = messages.length;
    await page.waitForTimeout(4000);
    const added = messages.length - startCount;
    // Tolerate a few logs but not dozens per second
    expect(added).toBeLessThan(30);
  });
});

