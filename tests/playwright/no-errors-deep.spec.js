import { test, expect } from '@playwright/test';

// Capture 400s and 5xx responses during an action
async function assertNoHttpErrors(page, action, { label = '' } = {}) {
  const bad400 = [];
  const bad500 = [];
  const listener = async (resp) => {
    try {
      const status = resp.status();
      if (status === 400) {
        const url = resp.url();
        let body = '';
        try { body = await resp.text(); } catch {}
        bad400.push({ url, body: body?.slice(0, 300) });
      } else if (status >= 500 && status < 600) {
        const url = resp.url();
        let body = '';
        try { body = await resp.text(); } catch {}
        bad500.push({ url, status, body: body?.slice(0, 300) });
      }
    } catch {}
  };
  page.on('response', listener);
  try { await action(); } finally { page.off('response', listener); }
  if (bad400.length) console.error('❌ HTTP 400 responses detected', { label, count: bad400.length, bad400 });
  if (bad500.length) console.error('❌ HTTP 5xx responses detected', { label, count: bad500.length, bad500 });
  expect(bad400, `No HTTP 400 responses expected during: ${label || 'action'}`).toHaveLength(0);
  expect(bad500, `No HTTP 5xx responses expected during: ${label || 'action'}`).toHaveLength(0);
}

async function tryOpenModals(page, max = 3) {
  const modalTriggers = page.locator('[data-bs-toggle="modal"], [data-toggle="modal"]');
  const count = await modalTriggers.count().catch(() => 0);
  for (let i = 0; i < Math.min(count, max); i++) {
    const trigger = modalTriggers.nth(i);
    try {
      await trigger.scrollIntoViewIfNeeded({ timeout: 1000 }).catch(() => {});
      await trigger.click({ timeout: 1500 }).catch(() => {});
      await page.locator('.modal.show').first().waitFor({ timeout: 1500 }).catch(() => {});
      // Close modal
      const closeBtn = page.locator('.modal.show [data-bs-dismiss], .modal.show .btn-close').first();
      if (await closeBtn.count()) {
        await closeBtn.click({ timeout: 1000 }).catch(() => {});
      } else {
        await page.keyboard.press('Escape').catch(() => {});
      }
      await page.waitForTimeout(150);
    } catch {}
  }
}

async function clickSomeLinks(page, max = 6) {
  const anchors = page.locator('a[href^="/"]:not([target="_blank"])');
  const count = await anchors.count().catch(() => 0);
  const visited = new Set();
  for (let i = 0; i < count && visited.size < max; i++) {
    const a = anchors.nth(i);
    const href = (await a.getAttribute('href').catch(() => null)) || '';
    if (!href || visited.has(href)) continue;
    visited.add(href);
    try {
      await a.scrollIntoViewIfNeeded({ timeout: 1000 }).catch(() => {});
      await a.click({ timeout: 1500 }).catch(() => {});
      await page.waitForLoadState('domcontentloaded');
      await tryOpenModals(page, 2);
      await page.waitForTimeout(200);
      // navigate back
      await page.goBack({ waitUntil: 'domcontentloaded' }).catch(() => {});
    } catch {}
  }
}

async function waitServerReady(page) {
  const deadline = Date.now() + 60000; // allow more time on fresh server
  while (Date.now() < deadline) {
    try {
      const res = await page.request.get('/');
      if (res && res.status() >= 200) return;
    } catch {}
    await new Promise(r => setTimeout(r, 150));
  }
}
async function resetServerErrors(page) {
  try {
    await waitServerReady(page);
    await page.request.post('/__errors/reset');
  } catch (_) {
    // Early startup: ignore connection errors; tests will navigate soon
  }
}
async function getServerErrorCount(page) {
  const res = await page.request.get('/__errors');
  const json = await res.json();
  return json.count || 0;
}

const EXTRA_PAGES = [
  '/setup/models',
  '/setup/super-powers',
  '/setup/system',
  '/setup/poses',
  '/setup/parts',
  '/setup/character-audio',
  '/poses',
  // Add non-setup dialog-heavy pages for deeper modal coverage
  '/scenes',
  '/audio-library',
    // deprecated: '/live', '/ai-settings', '/ai-settings/stt', '/ai-settings/tts', '/ai-settings/agents',
  // Conversation deep link
  '/conversation'
];

for (const path of EXTRA_PAGES) {
  test(`Deep page no 400/500: ${path}`, async ({ page, baseURL }) => {
    // Heavier pages can take longer; allow up to 60s for these deep checks
    test.setTimeout(60000);
    await resetServerErrors(page);
    await waitServerReady(page);
    await assertNoHttpErrors(page, async () => {
      await page.goto(path);
      await page.waitForLoadState('domcontentloaded');
      if (path === '/audio-library' || path === '/ai-settings/agents') {
        // Light-touch check for heavy/dynamic pages to avoid flakiness in CI
        await page.waitForTimeout(400);
      } else {
        await tryOpenModals(page, 3);
        await clickSomeLinks(page, 5);
        try { await page.waitForTimeout(200); } catch {}
      }
    }, { label: `visit ${baseURL}${path}` });
    expect(await getServerErrorCount(page), `No server 5xx recorded for ${path}`).toBe(0);
  });
}
