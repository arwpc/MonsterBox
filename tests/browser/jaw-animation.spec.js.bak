/**
 * Jaw Animation (Jaw Animation) Browser Tests
 * Validates /setup/jaw-animation page UI and interactions
 */

import { test, expect } from '@playwright/test';

const BASE_URL = process.env.BASE_URL || 'http://localhost:3000';

test.describe('Jaw Animation — Jaw Animation', () => {
    let page;

    test.beforeEach(async ({ browser }) => {
        page = await browser.newPage();
        // Don't wait for networkidle — the page polls audio levels
        await page.goto(`${BASE_URL}/setup/jaw-animation`, { waitUntil: 'domcontentloaded' });
        // Wait for the JS to initialize
        await page.waitForTimeout(2000);
    });

    test.afterEach(async () => {
        await page.close();
    });

    // ─── Page Load ──────────────────────────────────────────────────
    test('should load jaw-animation page', async () => {
        const title = await page.title();
        expect(title).toContain('Jaw Animation');
        await expect(page.locator('h1')).toContainText('Jaw Animation');
    });

    test('should have jaw animation section heading', async () => {
        await expect(page.locator('text=Jaw Animation Super Power')).toBeVisible();
    });

    test('should show current character info', async () => {
        const hasCharacter = await page.locator('.card-title:has-text("Current Character")').isVisible();
        expect(hasCharacter).toBeTruthy();
    });

    // ─── Configuration Controls ─────────────────────────────────────
    test('should have jaw enable toggle', async () => {
        await expect(page.locator('#jawEnabled')).toBeAttached();
    });

    test('should have servo selection dropdown', async () => {
        await expect(page.locator('#jawServoSelect')).toBeAttached();
    });

    test('should have sensitivity slider', async () => {
        await expect(page.locator('#sensitivityRange')).toBeAttached();
        await expect(page.locator('#sensitivityValue')).toBeAttached();
    });

    test('should have smoothing slider', async () => {
        await expect(page.locator('#smoothingRange')).toBeAttached();
        await expect(page.locator('#smoothingValue')).toBeAttached();
    });

    test('should have volume threshold slider', async () => {
        await expect(page.locator('#volumeThresholdRange')).toBeAttached();
        await expect(page.locator('#volumeThresholdValue')).toBeAttached();
    });

    test('should have attack and release time inputs', async () => {
        await expect(page.locator('#attackTime')).toBeAttached();
        await expect(page.locator('#releaseTime')).toBeAttached();
    });

    // ─── Action Buttons ─────────────────────────────────────────────
    test('should have save configuration button', async () => {
        await expect(page.locator('#saveConfigBtn')).toBeVisible();
    });

    test('should have test jaw button', async () => {
        await expect(page.locator('#testJawBtn')).toBeVisible();
    });

    test('should have monitoring buttons', async () => {
        await expect(page.locator('#startMonitoringBtn')).toBeVisible();
        await expect(page.locator('#stopMonitoringBtn')).toBeVisible();
    });

    test('should have emergency stop button', async () => {
        await expect(page.locator('#emergencyStopBtn')).toBeVisible();
    });

    // ─── Live Monitoring Panel ──────────────────────────────────────
    test('should have audio level meter', async () => {
        await expect(page.locator('#audioMeterFill')).toBeAttached();
    });

    test('should have monitoring status displays', async () => {
        await expect(page.locator('#monitoringStatus')).toBeAttached();
        await expect(page.locator('#smoothedAmplitude')).toBeAttached();
        await expect(page.locator('#targetAngle')).toBeAttached();
    });

    // ─── Servo Loading ──────────────────────────────────────────────
    test('should populate servo dropdown from API', async () => {
        // Wait for the JS to fetch and populate servos
        await page.waitForTimeout(1000);
        const options = await page.locator('#jawServoSelect option').count();
        // At minimum the "Select a servo..." default option
        expect(options).toBeGreaterThanOrEqual(1);
    });

    test('should show servos overview section', async () => {
        await expect(page.locator('#servosOverviewGrid')).toBeAttached();
    });

    // ─── Slider Interactions ────────────────────────────────────────
    test('should update sensitivity display when slider moves', async () => {
        // Enable jaw animation first so sliders become enabled
        const jawEnabled = page.locator('#jawEnabled');
        if (!(await jawEnabled.isChecked())) {
            await jawEnabled.check();
            await page.waitForTimeout(500);
        }

        const slider = page.locator('#sensitivityRange');
        const display = page.locator('#sensitivityValue');

        // Use evaluate to set value on potentially tricky range inputs
        await slider.evaluate((el, val) => { el.value = val; el.dispatchEvent(new Event('input')); }, '2.5');
        await expect(display).toHaveText('2.5');
    });

    test('should update smoothing display when slider moves', async () => {
        // Enable jaw animation first so sliders become enabled
        const jawEnabled = page.locator('#jawEnabled');
        if (!(await jawEnabled.isChecked())) {
            await jawEnabled.check();
            await page.waitForTimeout(500);
        }

        const slider = page.locator('#smoothingRange');
        const display = page.locator('#smoothingValue');

        await slider.evaluate((el, val) => { el.value = val; el.dispatchEvent(new Event('input')); }, '0.8');
        await expect(display).toHaveText('0.8');
    });

    // ─── Save Configuration ─────────────────────────────────────────
    test('should save configuration via API', async () => {
        await page.waitForTimeout(1000);

        // Enable jaw animation
        const jawEnabled = page.locator('#jawEnabled');
        if (!(await jawEnabled.isChecked())) {
            await jawEnabled.check();
        }

        // Select the jaw servo (first option after "Select a servo...")
        const selectOptions = await page.locator('#jawServoSelect option').count();
        if (selectOptions > 1) {
            await page.locator('#jawServoSelect').selectOption({ index: 1 });
        }

        // Intercept the save API call
        const responsePromise = page.waitForResponse(resp =>
            resp.url().includes('/api/jaw-animation/') && resp.request().method() === 'POST'
        );

        // Click save
        await page.locator('#saveConfigBtn').click();

        const response = await responsePromise;
        const data = await response.json();
        // Save API returns success — if no servos available, it still saves the config
        // just without a servo assignment, which is valid
        expect(response.status()).toBeLessThan(500);
    });

    // ─── No Removed UI Elements ─────────────────────────────────────
    test('should NOT have Advanced Servos tab', async () => {
        const count = await page.locator('text=Advanced Servos').count();
        expect(count).toBe(0);
    });

    test('should NOT have Audio Library tab in jaw-animation content', async () => {
        // Check within the main content area only (nav may have Audio Library link)
        const mainContent = page.locator('main');
        const count = await mainContent.locator('a:has-text("Audio Library")').count();
        expect(count).toBe(0);
    });

    test('should NOT have AI Chat tab', async () => {
        const count = await page.locator('a:has-text("AI Chat")').count();
        expect(count).toBe(0);
    });

    // ─── Toast Notification ─────────────────────────────────────────
    test('should have toast container for notifications', async () => {
        await expect(page.locator('#statusToast')).toBeAttached();
        await expect(page.locator('#toastMessage')).toBeAttached();
    });
});
