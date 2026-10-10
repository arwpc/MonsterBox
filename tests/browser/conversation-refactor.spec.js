/**
 * Comprehensive tests for refactored Conversation Control page (now the Dashboard)
 * Tests the v10 Scare Console: stage + one-tap deck + say bar, with the long
 * tail (conversation log, manual controls, audio bridge, console) in a drawer.
 * Note: /conversation redirects to / — conversation IS the dashboard
 */

import { test, expect } from './fixtures.js';

const BASE_URL = process.env.BASE_URL || 'http://localhost:3000';
const TEST_TIMEOUT = 60000;

/**
 * The conversation controls live in a drawer that starts collapsed. Expand it
 * before asserting on them — asserting on a collapsed control passes nothing,
 * and asserting it is "not visible" would let a real regression through.
 */
async function openAiTab(page) {
  // The conversation moved out of the drawer and into the AI deck tab beside
  // the stage; its elements are the same, only their home changed.
  const tab = page.locator('.sc-tab-ai');
  await tab.scrollIntoViewIfNeeded();
  // At phone width the fixed .mb-control-bar (position: fixed, z-index 100,
  // full width, pinned to the bottom of the viewport) lies over the bottom of
  // the deck tablist, so the tab's centre — where a click lands — is hit-tested
  // to the PANIC button instead and the click times out. Scroll the tab clear
  // first, which is what a thumb does before tapping. This is a genuine
  // responsive overlap in the layout, not a test artefact; see notes.
  await tab.evaluate((el) => {
    const bar = document.querySelector('.mb-control-bar');
    const barTop = bar ? bar.getBoundingClientRect().top : window.innerHeight;
    const overlap = el.getBoundingClientRect().bottom - barTop;
    if (overlap > 0) window.scrollBy({ top: overlap + 12, behavior: 'instant' });
  });
  await page.waitForTimeout(200); // let the scroll settle before hit-testing
  await tab.click();
  await expect(page.locator('#chatLog')).toBeVisible();
  await page.waitForTimeout(300);
}

async function openDrawer(page, target) {
  const body = page.locator(target);
  const cls = (await body.getAttribute('class')) || '';
  if (!/\bshow\b/.test(cls)) {
    await page.locator(`[data-bs-target="${target}"]`).click();
  }
  await expect(body).toHaveClass(/show/);
  await page.waitForTimeout(400); // let the collapse transition finish
}

test.describe('Conversation Control - Accordion Layout', () => {
  test.beforeEach(async ({ page }) => {
    await page.goto(`${BASE_URL}/`);
    await page.waitForLoadState('networkidle').catch(() => {});
  });

  test('should render page with accordion and panel elements', async ({ page }) => {
    // Check page title is shown in navbar (headers removed in v6.1.2)
    await expect(page.locator('#currentPageName')).toContainText('Dashboard');

    // Verify accordion container exists
    const accordion = page.locator('#dashboardAccordion');
    await expect(accordion).toBeVisible();

    // Verify accordion items exist
    const accordionItems = accordion.locator('.accordion-item[data-panel-id]');
    const accordionCount = await accordionItems.count();
    expect(accordionCount).toBeGreaterThan(0);

    // Verify top-level panel elements exist (webcam, chat, monster-features are outside accordion)
    const topPanels = page.locator('[data-panel-id]');
    const totalCount = await topPanels.count();
    expect(totalCount).toBeGreaterThanOrEqual(7);
  });

  test('should have Chat panel', async ({ page }) => {
    // v10: the chat log and audio routing live in the Conversation drawer
    await openAiTab(page);

    // Chat log area
    await expect(page.locator('#chatLog')).toBeVisible();

    // AI On toggle
    const aiToggle = page.locator('#chatAiOnToggle');
    await expect(aiToggle).toBeVisible();
    await expect(aiToggle).toHaveAttribute('type', 'checkbox');

    // Unified chat input and send button (handles both Ask AI and Say This modes)
    await expect(page.locator('#chatInput')).toBeVisible();
    await expect(page.locator('#chatSendBtn')).toBeVisible();

    // VU meter (label badge is always visible; bar itself starts at 0% width)
    await expect(page.locator('#chatVULabel')).toBeVisible();

    // Audio controls — mute is in superpowers strip, browser spk/mic in chat panel
    await expect(page.locator('#speakerMuteToggle')).toBeVisible();
    await expect(page.locator('#chatBrowserSpeaker')).toBeVisible();
    await expect(page.locator('#chatBrowserMic')).toBeVisible();

    // Speaker select
    await expect(page.locator('#chatSpeakerSelect')).toBeVisible();
  });

  test('should have unified input with Ask AI / Say This modes', async ({ page }) => {
    // Unified input replaces separate Chat and Say panels
    // The AI toggle switches between Ask AI (on) and Say This (off) modes
    const aiToggle = page.locator('#chatAiOnToggle');
    await expect(aiToggle).toBeVisible();

    // Chat input serves both modes
    await expect(page.locator('#chatInput')).toBeVisible();
    await expect(page.locator('#chatSendBtn')).toBeVisible();
  });

  test('should have Monster Features panel', async ({ page }) => {
    const monsterFeatures = page.locator('[data-panel-id="monster-features"]');
    await expect(monsterFeatures).toBeVisible();

    // Check for Jaw Animation toggle
    const jawToggle = page.locator('#jawToggle');
    await expect(jawToggle).toBeVisible();
    await expect(jawToggle).toHaveAttribute('type', 'checkbox');

    // Check for Head Tracking toggle
    const headTrackToggle = page.locator('#headTrackToggle');
    await expect(headTrackToggle).toBeVisible();
    await expect(headTrackToggle).toHaveAttribute('type', 'checkbox');
  });

  // v10: scenes/poses moved out of the accordion and onto the always-visible
  // one-tap deck. Same intent as the old accordion tests — the operator can
  // reach scenes and poses from the dashboard — proved through the new path.
  test('should reach Scenes from the one-tap deck', async ({ page }) => {
    const scenesTab = page.locator('.sc-tab[data-deck="scenes"]');
    await expect(scenesTab).toBeVisible();
    // The AI tab is the default deck (v10.6.0); one tap reaches Scenes.
    await expect(page.locator('.sc-tab[data-deck="ai"]')).toHaveClass(/active/);
    await scenesTab.click();
    await expect(scenesTab).toHaveClass(/active/);

    const grid = page.locator('#scDeckGrid');
    await expect(grid).toBeVisible();

    // Either scene tiles rendered, or the honest empty state — never a spinner
    // left behind (that would mean the deck never loaded).
    await expect
      .poll(async () => (await grid.locator('.sc-tile-scenes').count())
        + (await grid.locator('.sc-deck-empty').count()), { timeout: 10000 })
      .toBeGreaterThan(0);
  });

  test('should reach Poses from the one-tap deck', async ({ page }) => {
    const posesTab = page.locator('.sc-tab[data-deck="poses"]');
    await expect(posesTab).toBeVisible();
    await posesTab.click();
    await page.waitForTimeout(500);
    await expect(posesTab).toHaveClass(/active/);

    const grid = page.locator('#scDeckGrid');
    await expect(grid).toBeVisible();

    await expect
      .poll(async () => (await grid.locator('.sc-tile-poses').count())
        + (await grid.locator('.sc-deck-empty').count()), { timeout: 10000 })
      .toBeGreaterThan(0);

    // The Pose Editor shortcut swaps in when the poses deck is active
    await expect(page.locator('#scPoseEditorLink')).toBeVisible();
  });

  test('should have Webcam panel', async ({ page }) => {
    // Check for webcam image and status directly
    await expect(page.locator('#webcamImg')).toBeVisible();

    // Check for status text
    await expect(page.locator('#webcamStatus')).toBeVisible();
  });
});

test.describe('Conversation Control - Unified Input (Say This mode)', () => {
  test.beforeEach(async ({ page }) => {
    await page.goto(`${BASE_URL}/conversation`);
    // The dashboard holds an EventSource and polls: networkidle may never come.
    await page.waitForLoadState('networkidle').catch(() => {});
  });

  test('should send text via unified input in Say This mode', async ({ page }) => {
    // Say This is the unified input's own MODE (#chatModeToggle: Ask AI <-> Say
    // This), independent of the AI switch. Put the input in Say This mode.
    const modeToggle = page.locator('#chatModeToggle');
    await expect(modeToggle).toBeVisible();
    if (!/Say This/.test(await modeToggle.innerText())) await modeToggle.click();
    await expect(modeToggle).toContainText('Say This');

    const input = page.locator('#chatInput');
    const button = page.locator('#chatSendBtn');

    // Type test message
    await input.fill('Test message from Playwright');

    // Click Send button. The guard answers /conversation/api/say, so the node
    // stays silent; what is proven is the request the page sends.
    const sayReq = page.waitForRequest(r => r.method() === 'POST' && /\/conversation\/api\/say(\?|$)/.test(r.url()),
      { timeout: 5000 }).catch(() => null);
    await button.click();
    const req = await sayReq;
    expect(req, 'Say This mode must POST /conversation/api/say').not.toBeNull();
    expect(JSON.stringify(req.postDataJSON())).toContain('Test message from Playwright');
  });

  test('should handle empty text without crashing', async ({ page }) => {
    const button = page.locator('#chatSendBtn');

    // Click without entering text - just verify it doesn't crash
    await button.click();
    await page.waitForTimeout(500);
  });
});


test.describe('Conversation Control - Monster Features', () => {
  test.beforeEach(async ({ page }) => {
    await page.goto(`${BASE_URL}/conversation`);
    // The dashboard holds an EventSource and polls: networkidle may never come.
    await page.waitForLoadState('networkidle').catch(() => {});
  });

  test('should toggle Jaw Animation', async ({ page }) => {
    const toggle = page.locator('#jawToggle');

    // Get initial state
    const initialChecked = await toggle.isChecked();

    // Toggle it
    await toggle.click();

    // Wait for save
    await page.waitForTimeout(500);

    // Should be opposite of initial
    const newChecked = await toggle.isChecked();
    expect(newChecked).toBe(!initialChecked);

    // Put the node back: this is the LIVE jaw switch of the node under test.
    await toggle.click();
    await page.waitForTimeout(500);
    expect(await toggle.isChecked()).toBe(initialChecked);
  });

  test('should toggle Head Tracking', async ({ page, request }) => {
    const toggle = page.locator('#headTrackToggle');

    // Head tracking needs a webcam AND a pan servo. On a character with neither,
    // POST /conversation/api/head-tracking answers 400 ("No servo found for pan
    // axis") and the dashboard reverts the checkbox — so asserting a flip here
    // asserted something the contract forbids. Ask the server what this
    // character can actually do; the capabilities endpoint uses the very same
    // webcam + findPanServo predicate as the enable handler.
    const capRes = await request.get(`${BASE_URL}/conversation/api/lurk-mode/capabilities`);
    const caps = capRes.ok() ? ((await capRes.json()).capabilities || {}) : {};

    if (!caps.headTracking && await toggle.isDisabled()) {
      // The honest UI for a character that cannot track: offer no live control.
      await expect(toggle).toBeDisabled();
      return;
    }

    // Get initial state
    const initialChecked = await toggle.isChecked();

    // Toggle it
    await toggle.click();

    // Wait for save
    await page.waitForTimeout(500);

    const newChecked = await toggle.isChecked();
    if (caps.headTracking) {
      // Capable character: the toggle must flip and stick
      expect(newChecked).toBe(!initialChecked);
      // Put the node back (live head tracking of the node under test).
      await toggle.click();
      await page.waitForTimeout(500);
      expect(await toggle.isChecked()).toBe(initialChecked);
    } else {
      // No pan servo: the toggle must not claim a capability the node lacks
      expect(newChecked).toBe(initialChecked);
    }
  });
});

test.describe('Conversation Control - Chat Panel', () => {
  test.beforeEach(async ({ page }) => {
    await page.goto(`${BASE_URL}/conversation`);
    // The dashboard holds an EventSource and polls: networkidle may never come.
    await page.waitForLoadState('networkidle').catch(() => {});
  });

  test('should have Chat panel inline (no modal)', async ({ page }) => {
    await openAiTab(page);
    const chatLog = page.locator('#chatLog');

    // Chat log should be visible inline
    await expect(chatLog).toBeVisible();

    // Should NOT be in a modal
    const modal = page.locator('.modal');
    await expect(modal).toHaveCount(0);
  });

  // v10.7.0: AI mode is the SERVER's (lurk state machine). The switch reflects
  // /conversation/api/ai-status and a click posts /conversation/api/ai-on; the
  // hazard guard (fixtures.js) answers that post, so the node never wakes here.
  test('AI switch reflects the server and posts ai-on with the wanted state', async ({ page, request, hazards }) => {
    const toggle = page.locator('#chatAiOnToggle');
    const status = await (await request.get(`${BASE_URL}/conversation/api/ai-status`)).json();
    expect(status.success).toBe(true);
    const serverOn = !!status.enabled;
    await expect.poll(async () => toggle.isChecked(), { timeout: 8000 }).toBe(serverOn);

    const reqPromise = page.waitForRequest(r => r.method() === 'POST' && /\/conversation\/api\/ai-on(\?|$)/.test(r.url()));
    await toggle.click({ force: true });
    const req = await reqPromise;
    expect(req.postDataJSON()).toEqual({ enabled: !serverOn });
    expect(hazards.some(h => h.path === '/conversation/api/ai-on' && h.action === 'intercepted')).toBe(true);
  });

  test('should have chat input with send button', async ({ page }) => {
    const input = page.locator('#chatInput');
    const sendBtn = page.locator('#chatSendBtn');

    await expect(input).toBeVisible();
    await expect(sendBtn).toBeVisible();

    // Type a test message
    await input.fill('Hello from Playwright');
    const val = await input.inputValue();
    expect(val).toBe('Hello from Playwright');
  });
});

test.describe('Conversation Control - Responsive Layout', () => {
  test.beforeEach(async ({ page }) => {
    await page.goto(`${BASE_URL}/conversation`);
    // The dashboard holds an EventSource and polls: networkidle may never come.
    await page.waitForLoadState('networkidle').catch(() => {});
  });

  test('should adapt to mobile viewport', async ({ page }) => {
    // Set mobile viewport
    await page.setViewportSize({ width: 375, height: 667 });

    // Drawer accordion is inherently responsive
    await expect(page.locator('#dashboardAccordion')).toBeVisible();

    // Core operator surface stays reachable at phone width (the deck grid
    // shows once a non-AI tab is chosen; AI is the default deck).
    await expect(page.locator('#chatInput')).toBeVisible();
    // DOM click: at phone width the fixed control bar (PANIC) overlaps the tab
    // row, and a coordinate click would land on PANIC.
    await page.locator('.sc-tab[data-deck="scenes"]').evaluate(el => el.click());
    await expect(page.locator('#scDeckGrid')).toBeVisible();

    // And the conversation log is still reachable via the drawer
    await openAiTab(page);
    await expect(page.locator('#chatLog')).toBeVisible();
  });

  test('should adapt to tablet viewport', async ({ page }) => {
    // Set tablet viewport
    await page.setViewportSize({ width: 768, height: 1024 });

    // Core panels should still be visible
    await expect(page.locator('#chatAiOnToggle')).toBeVisible();
    await expect(page.locator('#webcamImg')).toBeVisible();
  });
});

test.describe('Conversation Control - No Errors', () => {
  test.beforeEach(async ({ page }) => {
    await page.goto(`${BASE_URL}/conversation`);
    // The dashboard holds an EventSource and polls: networkidle may never come.
    await page.waitForLoadState('networkidle').catch(() => {});
  });

  test('should not have critical console errors on load', async ({ page }) => {
    const criticalErrors = [];
    const ignoredPatterns = [
      /ResizeObserver/i,
      /net::ERR_/i,
      /WebSocket/i,
      /fetch.*failed/i
    ];

    page.on('console', msg => {
      if (msg.type() === 'error') {
        const text = msg.text();
        if (!ignoredPatterns.some(p => p.test(text))) {
          criticalErrors.push(text);
        }
      }
    });

    // Wait for page to fully load
    await page.waitForTimeout(2000);

    // Should have no critical console errors
    expect(criticalErrors.length).toBe(0);
  });
});

// v10.7.0 server-driven contracts the dashboard reads (GET only: no state changes).
test.describe('Conversation Control - server-driven lurk/AI contracts', () => {
  test('GET /conversation/api/ai-status carries state, latency and conversationMode', async ({ request }) => {
    const res = await request.get(`${BASE_URL}/conversation/api/ai-status`);
    expect(res.ok()).toBe(true);
    const j = await res.json();
    expect(j.success).toBe(true);
    expect(['off', 'lurking', 'awake']).toContain(j.state);
    expect(typeof j.enabled).toBe('boolean');
    expect(j).toHaveProperty('latency');
    expect(j).toHaveProperty('conversationMode');
    if (j.conversationMode) expect(['full', 'half']).toContain(j.conversationMode.mode);
  });

  test('GET /conversation/api/lurk-state is bound to the node\'s character', async ({ request }) => {
    const res = await request.get(`${BASE_URL}/conversation/api/lurk-state`);
    expect(res.ok()).toBe(true);
    const j = await res.json();
    expect(j.success).toBe(true);
    expect(['off', 'lurking', 'awake']).toContain(j.state);
    expect(typeof j.armed).toBe('boolean');
    expect(j.characterId).toBeTruthy();
    expect(j.prefs).toBeTruthy();
  });

  test('the Lurk switch mirrors lurk-state.armed and posts lurk-mode', async ({ page, request }) => {
    await page.goto(`${BASE_URL}/`);
    await page.waitForLoadState('networkidle').catch(() => {});
    const st = await (await request.get(`${BASE_URL}/conversation/api/lurk-state`)).json();
    const toggle = page.locator('#lurkToggle');
    await expect.poll(async () => toggle.isChecked(), { timeout: 8000 }).toBe(!!st.armed);
    const reqPromise = page.waitForRequest(r => r.method() === 'POST' && /\/conversation\/api\/lurk-mode(\?|$)/.test(r.url()));
    await toggle.click({ force: true });
    expect((await reqPromise).postDataJSON()).toEqual({ enabled: !st.armed });
  });

  test('callouts and lurk scenes read back as configured (off unless the operator turned them on)', async ({ request }) => {
    for (const p of ['/conversation/api/callouts', '/conversation/api/lurk-scenes']) {
      const res = await request.get(`${BASE_URL}${p}`);
      if (res.status() === 404) continue; // older node
      expect(res.ok(), p).toBe(true);
      const j = await res.json();
      expect(j.success, p).not.toBe(false);
      expect(typeof (j.state && j.state.enabled), `${p} state.enabled`).toBe('boolean');
    }
  });
});
