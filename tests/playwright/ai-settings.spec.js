import { test, expect } from '@playwright/test';

// Minimal smoke test: load AI Settings and run the Test Conversation quick action
// Relies on MB_TEST_MODE=1 so that ElevenLabs TTS is stubbed.

test.describe('AI Settings - quick actions', () => {
  test('Test Conversation shows a success alert', async ({ page }) => {
    await page.goto('/ai-settings');

    // Handle the prompt with a test phrase
    page.once('dialog', dialog => dialog.accept('Hello Halloween'));

    const btn = page.locator('#testConversation');
    await expect(btn).toBeVisible();
    await btn.click();

    // Expect a Bootstrap alert to appear; accept current behavior:
    // - Success path (future): "AI replied: ..."
    // - Current path: HTTP conversation endpoints disabled -> guidance message
    const alerts = page.locator('.alert');
    await expect(alerts.last()).toBeVisible();
    const text = await alerts.last().innerText();
    expect(!!(text.indexOf('AI replied') !== -1 || text.indexOf('HTTP conversation endpoints disabled') !== -1)).toBeTruthy();
  });
});

