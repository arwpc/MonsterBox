/**
 * LED Animation Browser Tests
 * Validates /setup/led-animation page UI and its read-only config API.
 *
 * Deliberately does NOT click Sweep / Speak / per-state Test: against a live node
 * (port 3100 runs NODE_ENV=production with MB_TEST_MODE unset) those drive the
 * REAL ring. Presence checks and the read-only config GET are safe.
 */

import { test, expect, request } from '@playwright/test';

const BASE_URL = process.env.BASE_URL || 'http://localhost:3000';

test.describe('LED Animation page', () => {
    let page;

    test.beforeEach(async ({ browser }) => {
        page = await browser.newPage();
        await page.goto(`${BASE_URL}/setup/led-animation`, { waitUntil: 'domcontentloaded' });
        await page.waitForTimeout(1500);
    });

    test.afterEach(async () => {
        await page.close();
    });

    test('loads with the Speak & Drive Eyes test panel', async () => {
        // Unique to this page and visible when the page has loaded (avoids the
        // ambiguous "LED Animation" text that also appears in the nav dropdown).
        await expect(page.locator('#ledSpeakBtn')).toBeVisible();
    });

    test('has the live colour controls', async () => {
        await expect(page.locator('#ledLeftColor')).toBeAttached();
        await expect(page.locator('#ledRightColor')).toBeAttached();
        await expect(page.locator('#ledBrightness')).toBeAttached();
        await expect(page.locator('#ledLinkEyes')).toBeAttached();
    });

    test('has the colour-per-state and palette sections', async () => {
        await expect(page.locator('#ledStateRows')).toBeAttached();
        await expect(page.locator('#ledPaletteSwatches')).toBeAttached();
        await expect(page.locator('#ledFadeMs')).toBeAttached();
        await expect(page.locator('#ledHoldMs')).toBeAttached();
    });

    test('has the jaw/speech sync controls', async () => {
        await expect(page.locator('#ledSyncEnabled')).toBeAttached();
        await expect(page.locator('#ledSyncPartSelect')).toBeAttached();
        await expect(page.locator('#ledSyncColorLow')).toBeAttached();
        await expect(page.locator('#ledSyncColorHigh')).toBeAttached();
    });

    test('has the test panel (speak, sweep, state buttons, level meter)', async () => {
        await expect(page.locator('#ledTtsText')).toBeAttached();
        await expect(page.locator('#ledSpeakBtn')).toBeAttached();
        await expect(page.locator('#ledStopBtn')).toBeAttached();
        await expect(page.locator('#ledSweepBtn')).toBeAttached();
        await expect(page.locator('#ledStateTestButtons')).toBeAttached();
        await expect(page.locator('#ledLevelFill')).toBeAttached();
    });

    test('has Save and Off actions', async () => {
        await expect(page.locator('#ledSaveConfigBtn')).toBeAttached();
        await expect(page.locator('#ledAllOffBtn')).toBeAttached();
    });
});

test.describe('LED Animation API', () => {
    test('combined config endpoint returns config, ledSync, and LED parts', async () => {
        const rc = await request.newContext();
        try {
            const cfg = await (await rc.get(`${BASE_URL}/api/config`)).json();
            const charId = cfg && cfg.config ? cfg.config.selectedCharacter : null;
            test.skip(!charId, 'no character selected');

            const res = await rc.get(`${BASE_URL}/setup/led-animation/api/config/${charId}`);
            expect(res.ok()).toBeTruthy();
            const data = await res.json();
            expect(data.success).toBe(true);
            expect(Array.isArray(data.availableLedParts)).toBe(true);
            expect(Array.isArray(data.colorable)).toBe(true);
            expect(data.config).toBeTruthy();
            // ledSync is always present (normalised through defaultLedSync)
            expect(data.ledSync).toBeTruthy();
        } finally {
            await rc.dispose();
        }
    });
});
