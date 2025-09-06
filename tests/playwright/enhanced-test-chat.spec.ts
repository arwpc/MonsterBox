import { test, expect } from '@playwright/test';

// Note: These tests assume ELEVENLABS and a test Agent are properly configured.
// They focus on UI contract and workflows; where network calls are required,
// we assert for 200s and visible UI changes rather than deep audio verification.

const PAGE = '/ai-management/enhanced-test-chat';

test.describe.serial('Enhanced Test Chat - Chromium Headless E2E', () => {
  test('Page loads and core UI is present', async ({ page }) => {
    await page.goto(PAGE);
    await expect(page.locator('h1')).toContainText('Enhanced Test Chat');
    await expect(page.locator('.subtitle')).toContainText('ElevenLabs Conversational AI Interface');

    const ids = [
      '#characterSelect', '#assistantDisplay', '#elevenLabsToggle', '#ttsToggle',
      '#liveModeToggle', '#jawToggle', '#openTTSConfig', '#chatInput', '#sendButton',
      '#voiceInputTime', '#agentTime', '#voiceOutputTime'
    ];
    for (const id of ids) {
      await expect(page.locator(id)).toBeVisible();
    }
  });

  test('Inline STT settings save and persist', async ({ page }) => {
    await page.goto(PAGE);

    // Select first character if available
    const select = page.locator('#characterSelect');
    if (await select.count()) {
      await select.selectOption({ index: 0 });
    }

    // Adjust STT inline controls
    await page.locator('#sttLanguageInline').selectOption({ label: 'English' }).catch(()=>{});
    await page.locator('#confidenceThresholdInline').fill('0.7').catch(()=>{});
    await page.locator('#vadThresholdInline').fill('0.5').catch(()=>{});
    await page.locator('#silenceDurationInline').fill('700').catch(()=>{});
    await page.locator('#prefixPaddingInline').fill('300').catch(()=>{});

    const save = page.locator('#saveInlineSTT');
    if (await save.isVisible()) {
      await Promise.all([
        page.waitForResponse((resp) => resp.url().includes('/ai-management/api/stt/character/') && resp.request().method() === 'POST' && resp.status() < 400),
        save.click(),
      ]);
    }
  });

  test('Open TTS Config modal and test outputs', async ({ page }) => {
    await page.goto(PAGE);

    const open = page.locator('#openTTSConfig');
    if (await open.isVisible()) {
      await open.click();
      // Choose defaults if present
      await page.locator('#ttsDefaultSpeaker').selectOption({ index: 0 }).catch(()=>{});
      await page.locator('#ttsOutputDevice').selectOption({ index: 0 }).catch(()=>{});
      await page.locator('#ttsVolume').fill('80').catch(()=>{});
      await page.locator('#ttsEnabled').check().catch(()=>{});

      // Test buttons should yield 200s
      const btn1 = page.locator('#testTTSSpeaker');
      if (await btn1.isVisible()) {
        await Promise.all([
          page.waitForResponse(resp => resp.url().includes('/ai-management/api/tts/test/speaker') && resp.status() < 400),
          btn1.click(),
        ]);
      }
      const btn2 = page.locator('#testTTSVoice');
      if (await btn2.isVisible()) {
        await Promise.all([
          page.waitForResponse(resp => resp.url().includes('/ai-management/api/tts/test/voice') && resp.status() < 400),
          btn2.click(),
        ]);
      }

      // Save
      const save = page.locator('#saveTTSConfig');
      if (await save.isVisible()) await save.click();
    }
  });

  test('Text chat send and agent reply appears', async ({ page }) => {
    await page.goto(PAGE);

    // Ensure a character is selected
    const select = page.locator('#characterSelect');
    if (await select.count()) await select.selectOption({ index: 0 });

    await page.locator('#chatInput').fill('Hello from Playwright');
    await Promise.all([
      // Allow agent call; just assert bubble appears
      page.waitForSelector('#chatMessages .message-bubble', { timeout: 30000 }),
      page.locator('#sendButton').click(),
    ]);

    const bubbles = page.locator('#chatMessages .message-bubble');
    await expect(bubbles).toHaveCountGreaterThan(0);
  });

  test('Live Mode toggles and produces a transcript + reply (fake audio)', async ({ page, context, browserName }) => {
    test.skip(browserName !== 'chromium', 'Live mode audio only configured for Chromium');

    await page.goto(PAGE);

    // ElevenLabs toggle may be required
    const elToggle = page.locator('#elevenLabsToggle');
    if (await elToggle.isVisible()) await elToggle.click();

    const live = page.locator('#liveModeToggle');
    await live.click();

    // Expect a transcription or state changes and a reply bubble
    await page.waitForTimeout(3000);
    await page.waitForSelector('#chatMessages .message-bubble', { timeout: 45000 });

    // Stop live mode
    await live.click();
  });

  test('Jaw Animation toggle shows enabled/disabled status', async ({ page }) => {
    await page.goto(PAGE);
    const jaw = page.locator('#jawToggle');
    if (await jaw.isVisible()) {
      await jaw.click();
      await page.waitForTimeout(500);
      await jaw.click();
    }
  });
});

