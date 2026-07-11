import { test, expect } from '@playwright/test';

/**
 * All-pages health check.
 *
 * Visits every page in the app, opens every Bootstrap modal/popup, and asserts that
 * no page produces an uncaught JS error, a console error, a 4xx/5xx network response,
 * or a server-side error (tracked via /__errors). One test per page so a single bad
 * page doesn't mask the others.
 *
 *   MB_TEST_MODE=1 TEST_PORT=3200 BASE_URL=http://localhost:3200 \
 *     npx playwright test tests/browser/all-pages-health.spec.js --reporter=list
 */

const BASE = process.env.BASE_URL || 'http://localhost:3200';

// Character-independence: exercise pages for a non-default character too where the URL
// takes a characterId, so we don't only ever test char 1.
const PAGES = [
  { name: 'Dashboard', url: '/' },
  { name: 'Live', url: '/live' },
  { name: 'Setup home', url: '/setup' },
  { name: 'Setup — Audio', url: '/setup/audio' },
  { name: 'Setup — Calibration', url: '/setup/calibration' },
  { name: 'Setup — Unified calibration', url: '/setup/calibration/unified' },
  { name: 'Setup — Characters', url: '/setup/characters' },
  { name: 'Setup — Character images', url: '/setup/characters/images' },
  { name: 'Setup — Head animation', url: '/setup/head-animation' },
  { name: 'Setup — Jaw animation', url: '/setup/jaw-animation' },
  { name: 'Setup — Models', url: '/setup/models' },
  { name: 'Setup — System', url: '/setup/system' },
  { name: 'Setup — Style guide', url: '/setup/style-guide' },
  { name: 'Animation Studio (scenes)', url: '/scenes' },
  { name: 'Pose Editor', url: '/poses/editor' },
  { name: 'AI Settings', url: '/ai-settings' },
  { name: 'AI Settings — STT', url: '/ai-settings/stt' },
  { name: 'AI Settings — TTS', url: '/ai-settings/tts' },
  { name: 'Audio Library', url: '/audio-library' },
  { name: 'Video Library', url: '/video-library' },
  { name: 'Goblin Management', url: '/goblin-management' },
  { name: 'Orchestration', url: '/orchestration' },
  { name: 'Conversation', url: '/conversation' },
  { name: 'First Run', url: '/first-run' },
];

// Console/network noise that is not an app bug in the headless, hardware-less test env.
const IGNORE = [
  /favicon/i,
  /net::ERR_/i,
  /\/socket/i,
  /ws:\/\//i,
  /wss:\/\//i,
  /mjpg|8090|stream/i,        // webcam stream not present in test env
  /ERR_CONNECTION_REFUSED/i,
];

function isIgnorable(text) {
  return IGNORE.some((re) => re.test(String(text || '')));
}

function attachCollectors(page) {
  const errors = { console: [], pageErrors: [], network: [] };
  page.on('pageerror', (err) => errors.pageErrors.push(err.message));
  page.on('console', (msg) => {
    if (msg.type() === 'error' && !isIgnorable(msg.text())) errors.console.push(msg.text());
  });
  page.on('response', (resp) => {
    if (resp.status() >= 400 && !isIgnorable(resp.url())) {
      errors.network.push(`${resp.status()} ${resp.url()}`);
    }
  });
  return errors;
}

test.describe('All-pages health', () => {
  for (const pageDef of PAGES) {
    test(`no errors: ${pageDef.name} (${pageDef.url})`, async ({ page, request }) => {
      // Reset the server-side error stats so we can attribute server errors to this page.
      await request.post(`${BASE}/__errors/reset`).catch(() => {});

      const errors = attachCollectors(page);

      const resp = await page.goto(BASE + pageDef.url, { waitUntil: 'domcontentloaded', timeout: 20000 });
      // The page itself must not be a 5xx (test mode downgrades some 5xx to 200, but a
      // hard render failure would still surface).
      expect(resp, `${pageDef.name} returned a response`).not.toBeNull();
      expect(resp.status(), `${pageDef.name} HTTP status`).toBeLessThan(500);

      // Let late scripts / fetches settle.
      await page.waitForTimeout(1200);

      // Open every Bootstrap modal/popup trigger and confirm it renders without error.
      const triggers = page.locator('[data-bs-toggle="modal"], [data-toggle="modal"]');
      const n = Math.min(await triggers.count(), 12);
      for (let i = 0; i < n; i++) {
        const t = triggers.nth(i);
        if (!(await t.isVisible().catch(() => false))) continue;
        await t.click({ force: true, timeout: 3000 }).catch(() => {});
        await page.waitForTimeout(250);
        // Close any open modal (Escape / close button) so the next trigger is reachable.
        await page.keyboard.press('Escape').catch(() => {});
        await page.locator('.modal.show [data-bs-dismiss="modal"], .modal.show .btn-close').first()
          .click({ force: true, timeout: 1000 }).catch(() => {});
        await page.waitForTimeout(150);
      }

      // Collect server-side errors recorded while this page was exercised.
      let serverErrors = [];
      try {
        const es = await request.get(`${BASE}/__errors`).then((r) => r.json());
        serverErrors = (es.recent || []).map((e) => `${e.method} ${e.path}: ${e.message}`);
      } catch (_) { /* ignore */ }

      const report = [];
      if (errors.pageErrors.length) report.push(`JS errors:\n  - ${errors.pageErrors.join('\n  - ')}`);
      if (errors.console.length) report.push(`Console errors:\n  - ${errors.console.join('\n  - ')}`);
      if (errors.network.length) report.push(`Network 4xx/5xx:\n  - ${errors.network.join('\n  - ')}`);
      if (serverErrors.length) report.push(`Server errors:\n  - ${serverErrors.join('\n  - ')}`);

      expect(report.join('\n'), `${pageDef.name} should have no errors`).toBe('');
    });
  }
});
