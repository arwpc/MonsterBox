import { test, expect } from '../test.setup';

// Conversational AI e2e: Agents page Chat modal, streamed text, interruption, and speaker playback routing
// This test is gated to run only when MB_E2E=1 (and ideally a valid ElevenLabs agent + key are configured)
const E2E_ENABLED = process.env.MB_E2E === '1';

const PAGE = '/ai-settings/agents';

// Utility: wait for an agent Chat button or skip
async function getFirstChatButton(page) {
  const chatBtn = page.locator('#agentsList .btn-outline-info:has-text("Chat")').first();
  if (await chatBtn.count() === 0) return null;
  return chatBtn;
}

// Utility: collect console logs
function collectConsole(page) {
  const messages = [];
  page.on('console', (msg) => messages.push({ type: msg.type(), text: msg.text() }));
  return messages;
}

// Only run when explicitly enabled
(E2E_ENABLED ? test.describe : test.describe.skip)('ConvAI - Agents Chat modal', () => {
  test('Modal opens, WS connects, agent streams text, interruption may arrive', async ({ page }) => {
    const logs = collectConsole(page);

    await page.goto(PAGE);

    // Require at least one agent to be present
    const chatBtn = await getFirstChatButton(page);
    test.skip(!chatBtn, 'No agents configured; skipping ConvAI chat test');

    await chatBtn.click();

    // Modal visible
    const modal = page.locator('#agentChatModal.show');
    await expect(modal).toBeVisible();

    // WS badge transitions to Connected
    const wsBadge = page.locator('#wsConnectionStatus');
    await expect(wsBadge).toBeVisible();
    await expect(wsBadge).toContainText('WebSocket');

    // Send a first message
    const input = page.locator('#chatInput');
    await input.fill('Hello from Playwright!');
    await page.click('#agentChatModal .btn.btn-primary:has-text("Send")');

    // Wait for an Agent reply to appear in the chat log (text streaming path)
    const chatLog = page.locator('#chatLog');
    await expect(chatLog).toBeVisible();
    await expect.poll(async () => (await chatLog.innerText()).includes('Agent:')).toBeTruthy({
      message: 'Expected streamed agent text in chatLog',
      timeout: 60_000,
    });

    // Try to induce barge-in by sending another message immediately
    await input.fill('Interrupt with another question quickly!');
    await page.click('#agentChatModal .btn.btn-primary:has-text("Send")');

    // Soft-assert that we observed an interruption indication in console
    await page.waitForTimeout(1500);
    const interrupted = logs.some((m) => /Conversation interrupted|interruption/i.test(m.text));
    test.info().annotations.push({ type: 'note', description: 'Interruption observed: ' + String(interrupted) });
  });

  test('Speaker mode triggers server playback API call', async ({ page }) => {
    await page.goto(PAGE);

    const chatBtn = await getFirstChatButton(page);
    test.skip(!chatBtn, 'No agents configured; skipping speaker routing test');

    await chatBtn.click();

    const modal = page.locator('#agentChatModal.show');
    await expect(modal).toBeVisible();

    // Switch audio output to Speaker (server)
    await page.check('#audioSpeaker');

    // Badge should reflect Character Speaker
    const wsBadge = page.locator('#wsConnectionStatus');
    await expect(wsBadge).toContainText('Character Speaker');

    // Send a message and observe server playback API call
    const reqPromise = page.waitForRequest((req) => req.url().endsWith('/api/elevenlabs/play-audio') && req.method() === 'POST', { timeout: 60_000 });

    const input = page.locator('#chatInput');
    await input.fill('Please speak via the character speaker.');
    await page.click('#agentChatModal .btn.btn-primary:has-text("Send")');

    const req = await reqPromise.catch(() => null);
    expect(!!req).toBeTruthy();
  });
});

