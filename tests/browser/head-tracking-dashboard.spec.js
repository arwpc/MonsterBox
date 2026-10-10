/**
 * Head Tracking Dashboard Tests
 * Validates head tracking toggle, status badge, polling, and click-to-track on Dashboard
 */

import { test, expect } from './fixtures.js';
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

    // v10.7.0: the lurk state machine runs head tracking from boot on a node with a
    // webcam and a pan servo, so "hidden by default" no longer holds. The badge must
    // agree with the server: hidden when tracking is off, shown when it is on.
    test('status badge agrees with head-tracking-status', async () => {
        const badge = page.locator('#headTrackStatusBadge');
        await expect(badge).toBeAttached();
        const st = await (await page.request.get(`${BASE_URL}/conversation/api/head-tracking-status`)).json();
        const enabled = !!(st && st.headTracking && st.headTracking.enabled);
        if (enabled) {
            await expect(badge).not.toHaveClass(/d-none/, { timeout: 10000 });
            await expect(badge).toHaveText(/Active|Searching/);
        } else {
            await expect(badge).toHaveClass(/d-none/, { timeout: 10000 });
        }
    });

    test('should display click-to-track countdown element', async () => {
        const countdown = page.locator('#clickTrackCountdown');
        await expect(countdown).toBeAttached();
    });

    test('should have tooltips on all monster feature toggles', async () => {
        const toggles = ['jawToggle', 'headTrackToggle', 'speakerMuteToggle'];
        for (const id of toggles) {
            // What matters is that hovering the control explains it. The Scare
            // Console carries the Bootstrap tooltip on the .mb-switch label that
            // wraps the input, so asserting the attribute sits on the input
            // itself tested one particular markup shape, not the coverage.
            const covered = await page.evaluate((toggleId) => {
                const input = document.getElementById(toggleId);
                if (!input) return { found: false };
                const host = input.closest('[data-bs-toggle="tooltip"]') || input;
                return {
                    found: true,
                    hasTooltip: host.getAttribute('data-bs-toggle') === 'tooltip' && !!host.getAttribute('title'),
                    hasTitle: !!input.getAttribute('title') || !!input.getAttribute('aria-label'),
                };
            }, id);
            expect(covered.found, `${id} should exist`).toBe(true);
            expect(covered.hasTooltip || covered.hasTitle, `${id} should explain itself on hover`).toBe(true);
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
        const waitForPost = () => page.waitForResponse(resp =>
            resp.url().includes('/conversation/api/head-tracking') && resp.request().method() === 'POST'
        );
        // Against a live node this click ARMS (or disarms) real head tracking and the
        // test used to walk away from it. Put the toggle back where it was found.
        const wasChecked = await toggle.isChecked();
        const responsePromise = waitForPost();
        await toggle.click();
        const response = await responsePromise;
        expect(response.status()).toBeLessThan(500);

        if ((await toggle.isChecked()) !== wasChecked) {
            const restorePromise = waitForPost();
            await toggle.click();
            await restorePromise;
        }
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
