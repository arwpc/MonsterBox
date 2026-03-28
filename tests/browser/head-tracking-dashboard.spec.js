/**
 * Head Tracking Dashboard Tests
 * Validates head tracking toggle, status badge, polling, and click-to-track on Dashboard
 */

import { test, expect } from '@playwright/test';
import { testNavigation } from './framework.js';

const BASE_URL = process.env.BASE_URL || 'http://localhost:3000';

test.describe('Head Tracking Dashboard', () => {
    let page;
    let tracker;

    test.beforeEach(async ({ browser }) => {
        page = await browser.newPage();
        tracker = await testNavigation(page, `${BASE_URL}/`, 'Dashboard');
    });

    test.afterEach(async () => {
        await page.close();
    });

    test('should display head tracking toggle', async () => {
        const toggle = page.locator('#headTrackToggle');
        await expect(toggle).toBeVisible();
    });

    test('should have tooltip on head tracking toggle', async () => {
        const toggle = page.locator('#headTrackToggle');
        // Bootstrap 5 moves title to data-bs-original-title after init
        const title = await toggle.getAttribute('title') || await toggle.getAttribute('data-bs-original-title');
        expect(title).toBeTruthy();
        expect(title.toLowerCase()).toContain('track');
    });

    test('should display status badge element (hidden by default)', async () => {
        const badge = page.locator('#headTrackStatusBadge');
        await expect(badge).toBeAttached();
        // Badge should have d-none class initially
        const classes = await badge.getAttribute('class');
        expect(classes).toContain('d-none');
    });

    test('should display click-to-track countdown element', async () => {
        const countdown = page.locator('#clickTrackCountdown');
        await expect(countdown).toBeAttached();
    });

    test('should have tooltips on all monster feature toggles', async () => {
        const toggles = ['jawToggle', 'parrotToggle', 'headTrackToggle', 'speakerMuteToggle'];
        for (const id of toggles) {
            const toggle = page.locator(`#${id}`);
            const attr = await toggle.getAttribute('data-bs-toggle');
            expect(attr).toBe('tooltip');
        }
    });

    test('should fetch head tracking status on page load', async () => {
        // Check that the status API is called
        const [response] = await Promise.all([
            page.waitForResponse(resp => resp.url().includes('/conversation/api/head-tracking-status')),
            page.reload()
        ]);
        expect(response.status()).toBeLessThan(500);
    });

    test('head tracking toggle should POST to API', async () => {
        const toggle = page.locator('#headTrackToggle');
        const responsePromise = page.waitForResponse(resp =>
            resp.url().includes('/conversation/api/head-tracking') && resp.request().method() === 'POST'
        );
        await toggle.click();
        const response = await responsePromise;
        expect(response.status()).toBeLessThan(500);
    });

    test('webcam image should be present', async () => {
        const img = page.locator('#webcamImg');
        await expect(img).toBeAttached();
        const cursor = await img.evaluate(el => getComputedStyle(el).cursor);
        expect(cursor).toBe('crosshair');
    });

    test('click-to-track API should accept target POST', async ({ request }) => {
        // Test the API endpoint directly — UI click is unreliable in headless mode
        // because the webcam image has no real dimensions
        const response = await request.post(`${BASE_URL}/conversation/api/head-tracking/target`, {
            data: { x: 50, y: 50, durationSec: 30 }
        });
        expect(response.status()).toBeLessThan(500);
        const data = await response.json();
        expect(data).toBeTruthy();
    });
});
