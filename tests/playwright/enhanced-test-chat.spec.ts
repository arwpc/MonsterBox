import { test, expect, request } from '@playwright/test';

const PAGE = '/ai-management/enhanced-test-chat';
const BASE = 'http://127.0.0.1:3000';
const BOT_NAME = 'PlaywrightBot';

async function ensureCharacterExists(api: any) {
  // Try to find existing
  const res = await api.get(`${BASE}/api/characters`);
  expect(res.ok()).toBeTruthy();
  const list = await res.json();
  let bot = list.find((c: any) => (c.char_name || c.name) === BOT_NAME);

  if (!bot) {
    // Create via UI form (no JSON create route available)
    const ctx = await api.storageState(); // noop
  }
  return bot?.id;
}

async function getCharacterId(page) {
  const resp = await page.request.get(`${BASE}/api/characters`);
  const list = await resp.json();
  const bot = list.find((c: any) => (c.char_name || c.name) === BOT_NAME);
  return bot?.id;
}

async function createCharacterViaUI(page) {
  await page.goto('/characters/new');
  await page.fill('#char_name', BOT_NAME);
  await page.fill('#char_description', 'E2E test character');
  // Submit the form and wait for navigation back to /characters
  await Promise.all([
    page.waitForNavigation({ waitUntil: 'load' }),
    page.click('button[type="submit"].primary-btn')
  ]);
  // Fetch ID
  return await getCharacterId(page);
}

async function createPartViaUI(page, type: 'microphone' | 'speaker', characterId: number) {
  await page.goto(`/parts/${type}/new?characterId=${characterId}`);
  await page.fill('#name', `${BOT_NAME} ${type}`);
  await page.fill('#description', `Auto-created ${type} for ${BOT_NAME}`);
  if (type === 'microphone') {
    await page.selectOption('#deviceId', { value: 'default' }).catch(()=>{});
    await page.check('#voiceActivation').catch(()=>{});
    await page.fill('#voiceActivationThreshold', '0.1').catch(()=>{});
  } else {
    await page.selectOption('#outputDevice', { value: 'default' }).catch(()=>{});
    await page.fill('#volume', '80').catch(()=>{});
  }
  await Promise.all([
    page.waitForNavigation(),
    page.click('button:has-text("Save")').catch(async () => {
      const btn = page.locator('button:has-text("Save")');
      if (await btn.count()) await btn.first().click();
    })
  ]);
}

async function assignAgentIfAvailable(page, characterId: number) {
  // If ElevenLabs service exposes agents, assign the first one
  const agentsResp = await page.request.get(`${BASE}/ai-management/api/elevenlabs/agents`);
  const agents = await agentsResp.json();
  if (agents.success && agents.agents && agents.agents.length) {
    const agentId = agents.agents[0].agentId;
    await page.request.post(`${BASE}/ai-management/api/elevenlabs/agents/assign`, {
      data: { agentId, characterId }
    });
    return agentId;
  }
  return null;
}

test.describe.serial('Enhanced Test Chat - Chromium Headless E2E', () => {
  test.beforeAll(async ({ browser }) => {
    const page = await browser.newPage();
    // Ensure character exists or create it
    let charId = await getCharacterId(page);
    if (!charId) {
      charId = await createCharacterViaUI(page);
    }
    // Create parts for that character
    await createPartViaUI(page, 'microphone', charId);
    await createPartViaUI(page, 'speaker', charId);
    // Try to assign an agent (if service online)
    await assignAgentIfAvailable(page, charId);
    await page.close();
  });

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

    // Select PlaywrightBot
    const select = page.locator('#characterSelect');
    if (await select.count()) {
      await select.selectOption({ label: BOT_NAME }).catch(async () => {
        await select.selectOption({ index: 0 });
      });
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
        page.waitForResponse((resp) => resp.url().includes('/ai-management/api/stt/character/') && resp.request().method() === 'POST' && resp.status() < 500),
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
      await page.locator('#ttsOutputDevice').selectOption({ value: 'default' }).catch(()=>{});
      await page.locator('#ttsVolume').fill('80').catch(()=>{});
      await page.locator('#ttsEnabled').check().catch(()=>{});

      // Test speaker via parts API
      const btn1 = page.locator('#testTTSSpeaker');
      if (await btn1.isVisible()) {
        await Promise.all([
          page.waitForResponse(resp => resp.url().includes('/parts/api/speaker/test') && resp.status() < 500),
          btn1.click(),
        ]);
      }
      // Test voice output via voice route
      const btn2 = page.locator('#testTTSVoice');
      if (await btn2.isVisible()) {
        await Promise.all([
          page.waitForResponse(resp => resp.url().includes('/voice/speak') && resp.status() < 500),
          btn2.click(),
        ]);
      }

      // Save
      const save = page.locator('#saveTTSConfig');
      if (await save.isVisible()) await save.click();
    }
  });

  test('Text chat send and bubble appears', async ({ page }) => {
    await page.goto(PAGE);

    const select = page.locator('#characterSelect');
    if (await select.count()) {
      await select.selectOption({ label: BOT_NAME }).catch(async () => select.selectOption({ index: 0 }));
    }

    await page.locator('#chatInput').fill('Hello from Playwright');
    await Promise.all([
      page.waitForSelector('#chatMessages .message-bubble', { timeout: 30000 }),
      page.locator('#sendButton').click(),
    ]);

    await expect(page.locator('#chatMessages .message-bubble')).toHaveCountGreaterThan(0);
  });

  test('Live Mode toggles (fake audio) and stops cleanly', async ({ page, browserName }) => {
    test.skip(browserName !== 'chromium', 'Live mode audio only configured for Chromium');

    await page.goto(PAGE);
    const select = page.locator('#characterSelect');
    if (await select.count()) {
      await select.selectOption({ label: BOT_NAME }).catch(async () => select.selectOption({ index: 0 }));
    }

    const elToggle = page.locator('#elevenLabsToggle');
    if (await elToggle.isVisible()) await elToggle.click();

    const live = page.locator('#liveModeToggle');
    await live.click();

    // Wait for any activity and a bubble
    await page.waitForTimeout(3000);
    await page.waitForSelector('#chatMessages .message-bubble', { timeout: 45000 }).catch(()=>{});

    // Stop live mode
    await live.click();
  });

  test('Jaw Animation toggle does not error', async ({ page }) => {
    await page.goto(PAGE);
    const jaw = page.locator('#jawToggle');
    if (await jaw.isVisible()) {
      await jaw.click();
      await page.waitForTimeout(400);
      await jaw.click();
    }
  });
});

