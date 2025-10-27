import { test, expect } from '@playwright/test';

// Helper to capture any HTTP 400/500 responses during a scoped action
async function assertNo400s(page, action, { label = '' } = {}) {
  const bad400 = [];
  const bad500 = [];
  const listener = async (resp) => {
    try {
      const status = resp.status();
      if (status === 400) {
        const url = resp.url();
        let body = '';
        try { body = await resp.text(); } catch { /* ignore */ }
        bad400.push({ url, body: body?.slice(0, 300) });
      } else if (status >= 500 && status < 600) {
        const url = resp.url();
        let body = '';
        try { body = await resp.text(); } catch { /* ignore */ }
        bad500.push({ url, status, body: body?.slice(0, 300) });
      }
    } catch { /* ignore */ }
  };
  page.on('response', listener);
  try {
    await action();
  } finally {
    page.off('response', listener);
  }
  if (bad400.length) console.error('❌ HTTP 400 responses detected', { label, count: bad400.length, bad400 });
  if (bad500.length) console.error('❌ HTTP 5xx responses detected', { label, count: bad500.length, bad500 });
  expect(bad400, `No HTTP 400 responses expected during: ${label || 'action'}`).toHaveLength(0);
  expect(bad500, `No HTTP 5xx responses expected during: ${label || 'action'}`).toHaveLength(0);
}

async function tryClickSomeButtons(page, maxClicks = 6) {
  const candidates = [
    page.getByRole('button'),
    page.locator('button'),
    page.locator('[data-bs-toggle]'),
    page.locator('a.btn, .btn[data-role], .btn[data-action]'),
  ];
  const clicked = new Set();
  for (const loc of candidates) {
    const count = await loc.count().catch(() => 0);
    for (let i = 0; i < Math.min(count, maxClicks); i++) {
      const el = loc.nth(i);
      const text = (await el.innerText().catch(() => '')).trim();
      const key = `${await el.evaluate((n) => n.outerHTML).catch(() => '')}`.slice(0, 200);
      if (clicked.has(key)) continue;
      try {
        await el.scrollIntoViewIfNeeded({ timeout: 1000 }).catch(() => {});
        await el.click({ timeout: 1500 }).catch(() => {});
        clicked.add(key);
        await page.waitForTimeout(150);
      } catch { /* ignore */ }
      if (clicked.size >= maxClicks) return;
    }
    if (clicked.size >= maxClicks) break;
  }
}

const PAGES = [
  '/',
  '/setup',
  '/setup/calibration',
  '/setup/characters',
  '/setup/audio',
  '/setup/webcam',
  '/audio-library',
  '/scenes',
  '/ai-settings',
  '/ai-settings/stt',
  '/ai-settings/tts',
  '/ai-settings/agents',
];

for (const path of PAGES) {
  test(`No HTTP 400s on: ${path}`, async ({ page, baseURL }) => {
    test.setTimeout(45000);
    await assertNo400s(page, async () => {
      await page.goto(path);
      await page.waitForLoadState('domcontentloaded');
      // Try some generic interactions that often trigger API calls
      if (path === '/ai-settings') {
        // Root AI settings page can be heavy; keep it light in CI
        await page.waitForTimeout(200);
      } else {
        await tryClickSomeButtons(page, 6);
        await page.waitForTimeout(300);
      }
    }, { label: `visit ${baseURL}${path}` });
  });
}

