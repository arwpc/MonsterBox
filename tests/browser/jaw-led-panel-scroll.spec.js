/**
 * Regression: the LED Animation and Jaw Animation panels must never be clipped
 * out of reach.
 *
 * Both pages share `.jaw-page` in public/css/jaw-animation.css, which caps the
 * page to one viewport on desktop. That cap used to be `overflow: hidden` with
 * nothing able to scroll, so any content past the fold was simply thrown away:
 * at 1024x768 the LED page hid 268px and the Jaw page 161px — the bottom panel
 * on each, reachable by nothing. The document scrollbar does not help, because
 * the clipping happens inside `.jaw-page`, not at the document.
 *
 * The cap stays (an operator console that fits one screen is the point); the two
 * columns carry the overflow instead. These tests assert the outcome, not the
 * technique: nothing is clipped, and the last panel in each column can actually
 * be scrolled to inside its own container.
 *
 * Read-only — navigation and geometry only, so this is safe against the live
 * node on port 3100 (NODE_ENV=production, MB_TEST_MODE unset).
 */

import { test, expect } from '@playwright/test';

const BASE_URL = process.env.BASE_URL || 'http://localhost:3000';

const PAGES = [
    ['LED Animation', '/setup/led-animation'],
    ['Jaw Animation', '/setup/jaw-animation'],
];

// 1024x768 is the tightest desktop that still gets the capped layout, so it is
// where the clipping was worst. 1440x900 is the common laptop.
const VIEWPORTS = [
    { width: 1440, height: 900 },
    { width: 1024, height: 768 },
];

for (const [name, path] of PAGES) {
    test.describe(`${name} — panels stay reachable`, () => {
        for (const viewport of VIEWPORTS) {
            const size = `${viewport.width}x${viewport.height}`;

            test(`${size}: nothing is clipped out of reach`, async ({ browser }) => {
                const page = await browser.newPage({ viewport });
                try {
                    await page.goto(`${BASE_URL}${path}`, { waitUntil: 'domcontentloaded' });
                    await page.waitForSelector('.jaw-page', { timeout: 15000 });
                    await page.waitForTimeout(1200);

                    const clipped = await page.evaluate(() => {
                        const el = document.querySelector('.jaw-page');
                        return el.scrollHeight - el.clientHeight;
                    });
                    expect(clipped, `${name} clips ${clipped}px that nothing can scroll to`).toBe(0);
                } finally {
                    await page.close();
                }
            });

            test(`${size}: the last panel in every column can be scrolled to`, async ({ browser }) => {
                const page = await browser.newPage({ viewport });
                try {
                    await page.goto(`${BASE_URL}${path}`, { waitUntil: 'domcontentloaded' });
                    await page.waitForSelector('.jaw-page .row', { timeout: 15000 });
                    await page.waitForTimeout(1200);

                    const columns = await page.evaluate(() => {
                        const cols = [...document.querySelectorAll('.jaw-page > .row > [class*="col-"]')];
                        return cols.map(col => {
                            const last = [...col.children].reverse().find(child =>
                                child.getBoundingClientRect().height > 0 &&
                                getComputedStyle(child).display !== 'none');
                            if (!last) return { empty: true };
                            // Scroll this column as far as it goes, then ask whether the
                            // last panel has come inside it.
                            col.scrollTop = col.scrollHeight;
                            const colBox = col.getBoundingClientRect();
                            const lastBox = last.getBoundingClientRect();
                            return {
                                empty: false,
                                label: (last.textContent || '').trim().slice(0, 40).replace(/\s+/g, ' '),
                                overhang: Math.round(lastBox.bottom - colBox.bottom),
                            };
                        });
                    });

                    expect(columns.length, 'expected the two-column layout').toBeGreaterThan(0);
                    for (const col of columns) {
                        if (col.empty) continue;
                        expect(col.overhang,
                            `"${col.label}" stays ${col.overhang}px below its column after scrolling`)
                            .toBeLessThanOrEqual(2);
                    }
                } finally {
                    await page.close();
                }
            });
        }
    });
}
