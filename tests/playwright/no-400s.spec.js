import { test, expect } from '@playwright/test';

// Helper to capture any HTTP 400 responses during a scoped action
async function assertNo400s(page, action, { label = '' } = {}) {
  const bad = [];
  const listener = async (resp) => {
    try {
      if (resp.status() === 400) {
        const url = resp.url();
        let body = '';
        try { body = await resp.text(); } catch { /* ignore */ }
        bad.push({ url, body: body?.slice(0, 300) });
      }
    } catch { /* ignore */ }
  };
  page.on('response', listener);
  try {
    await action();
  } finally {
    page.off('response', listener);
  }
  if (bad.length) {
    console.error('❌ HTTP 400 responses detected', { label, count: bad.length, bad });
  }
  expect(bad, `No HTTP 400 responses expected during: ${label || 'action'}`).toHaveLength(0);
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
  '/live',
  '/scenes',
  '/ai-settings',
  '/ai-settings/stt',
  '/ai-settings/tts',
  '/ai-settings/agents',
];

for (const path of PAGES) {
  test(`No HTTP 400s on: ${path}`, async ({ page, baseURL }) => {
    await assertNo400s(page, async () => {
      await page.goto(path);
      await page.waitForLoadState('networkidle');
      // Try some generic interactions that often trigger API calls
      await tryClickSomeButtons(page, 6);
      await page.waitForLoadState('networkidle');
    }, { label: `visit ${baseURL}${path}` });
  });
}

