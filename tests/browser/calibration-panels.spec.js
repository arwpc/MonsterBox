/**
 * Calibration Panel Visibility Tests
 * Verifies that calibration panels show only for movement parts
 * and are hidden for non-movement parts (webcam, microphone, speaker, etc.)
 */

import { test, expect } from '@playwright/test';
import { testNavigation } from './framework.js';

const BASE_URL = process.env.BASE_URL || 'http://localhost:3000';

test.describe('Calibration Panel Visibility', () => {
    let page;
    let tracker;

    test.beforeEach(async ({ browser }) => {
        page = await browser.newPage();
        tracker = await testNavigation(page, `${BASE_URL}/setup/calibration`, 'Calibration');
        // Wait for device list to populate
        await page.waitForSelector('#deviceList .list-group-item', { timeout: 10000 }).catch(() => {});
    });

    test.afterEach(async () => {
        await page.close();
    });

    test('should have rightPanelCol and centerPanelCol IDs', async () => {
        const rightPanel = page.locator('#rightPanelCol');
        const centerPanel = page.locator('#centerPanelCol');
        expect(await rightPanel.count()).toBe(1);
        expect(await centerPanel.count()).toBe(1);
    });

    test('should show calibration panel when selecting a servo part', async () => {
        // Find a servo part in the list
        const servoPart = page.locator('#deviceList .list-group-item').filter({ hasText: /servo/i }).first();
        if (await servoPart.count() === 0) {
            // Try clicking any part and check — might be named differently
            const anyPart = page.locator('#deviceList .list-group-item').first();
            if (await anyPart.count() === 0) { test.skip(); return; }
        }

        await servoPart.click();
        await page.waitForTimeout(500);

        const rightPanel = page.locator('#rightPanelCol');
        const isVisible = await rightPanel.evaluate(el => el.style.display !== 'none');

        // Servo is a movement part — calibration should be visible
        expect(isVisible).toBe(true);
    });

    test('should hide calibration panel when selecting a webcam part', async () => {
        const webcamPart = page.locator('#deviceList .list-group-item').filter({ hasText: /webcam|cam/i }).first();
        if (await webcamPart.count() === 0) { test.skip(); return; }

        await webcamPart.click();
        await page.waitForTimeout(500);

        const rightPanel = page.locator('#rightPanelCol');
        const isHidden = await rightPanel.evaluate(el => el.style.display === 'none');
        expect(isHidden).toBe(true);

        // Center panel should expand
        const centerPanel = page.locator('#centerPanelCol');
        const hasExpanded = await centerPanel.evaluate(el => el.classList.contains('col-xl-9'));
        expect(hasExpanded).toBe(true);
    });

    test('should hide calibration panel when selecting a speaker part', async () => {
        const speakerPart = page.locator('#deviceList .list-group-item').filter({ hasText: /speaker/i }).first();
        if (await speakerPart.count() === 0) { test.skip(); return; }

        await speakerPart.click();
        await page.waitForTimeout(500);

        const rightPanel = page.locator('#rightPanelCol');
        const isHidden = await rightPanel.evaluate(el => el.style.display === 'none');
        expect(isHidden).toBe(true);
    });

    test('should hide calibration panel when selecting a microphone part', async () => {
        const micPart = page.locator('#deviceList .list-group-item').filter({ hasText: /microphone|mic/i }).first();
        if (await micPart.count() === 0) { test.skip(); return; }

        await micPart.click();
        await page.waitForTimeout(500);

        const rightPanel = page.locator('#rightPanelCol');
        const isHidden = await rightPanel.evaluate(el => el.style.display === 'none');
        expect(isHidden).toBe(true);
    });

    test('should hide simple calibration card for non-movement parts', async () => {
        const webcamPart = page.locator('#deviceList .list-group-item').filter({ hasText: /webcam|cam/i }).first();
        if (await webcamPart.count() === 0) { test.skip(); return; }

        await webcamPart.click();
        await page.waitForTimeout(500);

        // Switch to Edit tab to check simple calibration card
        const editTab = page.locator('button[data-bs-target="#tabEdit"]');
        if (await editTab.count() > 0) {
            await editTab.click();
            await page.waitForTimeout(300);
        }

        const simpleCalCard = page.locator('#simpleCalCard');
        if (await simpleCalCard.count() > 0) {
            const isHidden = await simpleCalCard.evaluate(el => el.style.display === 'none');
            expect(isHidden).toBe(true);
        }
    });

    test('should hide sweep test button for non-movement parts', async () => {
        const webcamPart = page.locator('#deviceList .list-group-item').filter({ hasText: /webcam|cam/i }).first();
        if (await webcamPart.count() === 0) { test.skip(); return; }

        await webcamPart.click();
        await page.waitForTimeout(500);

        // Sweep button lives inside the right calibration panel, which is hidden for non-movement parts
        const sweepBtn = page.locator('#btnTestSweep');
        if (await sweepBtn.count() > 0) {
            const isNotVisible = await sweepBtn.evaluate(el => {
                if (el.style.display === 'none') return true;
                // Check if parent panel is hidden
                var parent = el.closest('#rightPanelCol');
                return parent && parent.style.display === 'none';
            });
            expect(isNotVisible).toBe(true);
        }
    });

    test('should toggle calibration visibility when switching between part types', async () => {
        // Click a non-movement part first
        const webcamPart = page.locator('#deviceList .list-group-item').filter({ hasText: /webcam|cam/i }).first();
        const servoPart = page.locator('#deviceList .list-group-item').filter({ hasText: /servo/i }).first();

        if (await webcamPart.count() === 0 || await servoPart.count() === 0) { test.skip(); return; }

        // Select webcam — calibration should hide
        await webcamPart.click();
        await page.waitForTimeout(500);
        const rightPanel = page.locator('#rightPanelCol');
        expect(await rightPanel.evaluate(el => el.style.display === 'none')).toBe(true);

        // Select servo — calibration should show
        await servoPart.click();
        await page.waitForTimeout(500);
        expect(await rightPanel.evaluate(el => el.style.display !== 'none')).toBe(true);

        // Center should shrink back
        const centerPanel = page.locator('#centerPanelCol');
        expect(await centerPanel.evaluate(el => el.classList.contains('col-xl-6'))).toBe(true);
    });
});
