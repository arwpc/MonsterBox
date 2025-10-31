// Playwright test to ensure no browser-visible links point to localhost or 127.0.0.1
// Runs against the web server started by playwright.config.ts
// Checks a representative set of pages for any elements with href/src/action attributes that include localhost/127.0.0.1

import { expect, test } from '@playwright/test';

const PATHS = [
  '/',
  '/setup',
  '/setup/calibration',
  '/setup/webcam',
  '/conversation'
];

async function findBadLinks(page) {
  return await page.evaluate(() => {
    const bad = [];
    const attrNames = ['href', 'src', 'action'];
    const els = Array.from(document.querySelectorAll('[href], [src], form[action]'));
    for (const el of els) {
      for (const a of attrNames) {
        const v = el.getAttribute(a);
        if (!v) continue;
        const lower = v.toLowerCase();
        if (lower.includes('://localhost') || lower.includes('://127.0.0.1')) {
          bad.push({ tag: el.tagName.toLowerCase(), attr: a, value: v });
        }
      }
    }
    return bad;
  });
}

for (const p of PATHS) {
  test(`No hardcoded localhost links on ${p}`, async ({ page, baseURL }) => {
    await page.goto(`${baseURL}${p}`, { waitUntil: 'domcontentloaded' });
    const bad = await findBadLinks(page);
    if (bad.length) {
      console.warn(`Found ${bad.length} localhost links on ${p}:`, bad);
    }
    expect(bad, `No localhost/127.0.0.1 links should be present on ${p}`).toHaveLength(0);
  });
}

