/**
 * Calibration — LED ring GPIO control
 * Verifies the Edit tab exposes a proper GPIO/geometry control for led_ring
 * parts (instead of JSON-only), and that saving geometry preserves the colours
 * that live in the same part config.
 */

import { test, expect, request } from '@playwright/test';
import { testNavigation } from './framework.js';

const BASE_URL = process.env.BASE_URL || 'http://localhost:3000';

async function findLedRing(rc) {
    const cfg = await (await rc.get(`${BASE_URL}/api/config`)).json();
    const charId = cfg && cfg.config ? cfg.config.selectedCharacter : null;
    if (!charId) return null;
    const parts = await (await rc.get(`${BASE_URL}/api/parts?characterId=${charId}`)).json();
    const list = Array.isArray(parts) ? parts : (parts.parts || []);
    return list.find(p => String(p.type).toLowerCase() === 'led_ring') || null;
}

test.describe('Calibration — LED ring GPIO control', () => {
    let page;

    test.beforeEach(async ({ browser }) => {
        page = await browser.newPage();
        await testNavigation(page, `${BASE_URL}/setup/calibration`, 'Calibration');
        await page.waitForSelector('#deviceList .list-group-item', { timeout: 10000 }).catch(() => {});
    });

    test.afterEach(async () => {
        await page.close();
    });

    async function openLedRingEdit(ledName) {
        const item = page.locator('#deviceList .list-group-item').filter({ hasText: ledName }).first();
        if (await item.count() === 0) return false;
        await item.click();
        await page.waitForTimeout(500);
        // Activate the Edit tab
        await page.locator('[data-bs-target="#tabEdit"]').first().click();
        await page.waitForTimeout(400);
        return true;
    }

    test('shows a GPIO/geometry control for the LED ring (not JSON-only)', async () => {
        const rc = await request.newContext();
        const led = await findLedRing(rc);
        await rc.dispose();
        if (!led) { test.skip(true, 'no led_ring on the selected character'); return; }

        const opened = await openLedRingEdit(led.name);
        if (!opened) { test.skip(true, 'led_ring not in device list'); return; }

        await expect(page.locator('#editLedGpioPin')).toBeVisible();
        await expect(page.locator('#editLedColorOrder')).toBeVisible();
        await expect(page.locator('#editLedPixelCount')).toBeVisible();

        // GPIO field is populated from the part config, not blank.
        const gpio = await page.locator('#editLedGpioPin').inputValue();
        const expected = String((led.config && led.config.gpioPin != null) ? led.config.gpioPin : 18);
        expect(gpio).toBe(expected);
    });

    test('saving geometry preserves the LED colours in the same config', async () => {
        const rc = await request.newContext();
        const led = await findLedRing(rc);
        if (!led) { await rc.dispose(); test.skip(true, 'no led_ring'); return; }
        const hadColors = !!(led.config && led.config.colors);
        if (!hadColors) { await rc.dispose(); test.skip(true, 'led_ring has no saved colours to protect'); return; }

        const opened = await openLedRingEdit(led.name);
        if (!opened) { await rc.dispose(); test.skip(true, 'not in list'); return; }

        // Save with the GPIO unchanged — the merge must keep colours/palette.
        await page.locator('#saveEditBtn').click();
        await page.waitForTimeout(1200);

        const cfg = await (await rc.get(`${BASE_URL}/api/config`)).json();
        const charId = cfg.config.selectedCharacter;
        const after = await (await rc.get(`${BASE_URL}/api/parts?characterId=${charId}`)).json();
        const list = Array.isArray(after) ? after : (after.parts || []);
        const ledAfter = list.find(p => String(p.id) === String(led.id));
        await rc.dispose();

        expect(ledAfter && ledAfter.config && ledAfter.config.colors).toBeTruthy();
        expect(String(ledAfter.config.gpioPin)).toBe(String(led.config.gpioPin != null ? led.config.gpioPin : 18));
    });
});
