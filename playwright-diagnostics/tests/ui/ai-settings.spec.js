import { test, expect } from '@playwright/test';
import { spawn } from 'child_process';
import axios from 'axios';

const BASE_URL = 'http://localhost:3000';
let child = null;

async function waitForServer(timeoutMs = 10000) {
  const start = Date.now();
  while (Date.now() - start < timeoutMs) {
    try {
      const res = await axios.get(BASE_URL);
      if (res && res.status >= 200 && res.status < 500) return true;
    } catch (_) {}
    await new Promise(r => setTimeout(r, 200));
  }
  return false;
}

test.beforeAll(async () => {
  const up = await waitForServer(1000);
  if (up) return;
  const env = { ...process.env, MB_TEST_MODE: '1' };
  child = spawn('node', ['server.js'], { cwd: process.cwd(), stdio: 'inherit', env });
  const ok = await waitForServer(15000);
  if (!ok) throw new Error('Server did not start in time');
});

test.afterAll(async () => {
  if (process.env.KILL_SERVER_AFTER_TESTS === '1' && child) {
    try { child.kill('SIGTERM'); } catch (_) {}
    child = null;
  }
});

// Minimal smoke test: load AI Settings and run the Test Conversation quick action
// This relies on MB_TEST_MODE so that ElevenLabs TTS is stubbed out.
test.describe('AI Settings - quick actions', () => {
  test('Test Conversation shows a success alert', async ({ page }) => {
    await page.goto(`${BASE_URL}/ai-settings`);

    // Handle the prompt with a test phrase
    page.once('dialog', dialog => dialog.accept('Hello Halloween'));

    const btn = page.locator('#testConversation');
    await expect(btn).toBeVisible();
    await btn.click();

    // Expect a Bootstrap alert to appear with the AI reply text
    const alert = page.locator('.alert');
    await expect(alert.first()).toBeVisible();
    await expect(alert.first()).toContainText('AI replied');
  });
});

