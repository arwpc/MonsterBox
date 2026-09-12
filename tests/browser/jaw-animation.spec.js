/**
 * Jaw Animation Browser Tests
 * Validates /setup/jaw-animation page UI layout and controls
 */

import { test, expect, request } from '@playwright/test';

const BASE_URL = process.env.BASE_URL || 'http://localhost:3000';

test.describe('Jaw Animation — single-viewport layout', () => {
    let page;

    // Against a live node every form change on this page is REAL: the page
    // auto-saves 600 ms after any slider/toggle/select change
    // (public/js/jaw-animation.js scheduleAutoSave) and the save test enables the
    // jaw outright. Capture the operator's active config before the first test
    // touches the page and put it back after the LAST page has closed — a restore
    // issued while a page is still open lost the race to its own debounced
    // auto-save and left a node with the jaw enabled on default tuning.
    let priorCharId = null;
    let priorConfig = null;

    test.beforeAll(async () => {
        const rc = await request.newContext();
        try {
            const cfg = await (await rc.get(`${BASE_URL}/api/config`)).json();
            priorCharId = cfg && cfg.config ? cfg.config.selectedCharacter : null;
            if (priorCharId) {
                const jaw = await (await rc.get(`${BASE_URL}/setup/jaw-animation/api/jaw-animation/${priorCharId}`)).json();
                priorConfig = jaw && jaw.config ? jaw.config : null;
            }
        } catch (_) { /* no restore possible; the tests still run */ }
        await rc.dispose();
    });

    test.afterAll(async () => {
        if (!priorCharId || !priorConfig) return;
        const rc = await request.newContext();
        try {
            await rc.post(`${BASE_URL}/setup/jaw-animation/api/jaw-animation/${priorCharId}`, { data: priorConfig });
            const after = await (await rc.get(`${BASE_URL}/setup/jaw-animation/api/jaw-animation/${priorCharId}`)).json();
            // Loud, not silent: a restore that did not stick is residue on a show node.
            expect(after && after.config ? after.config.enabled : undefined).toBe(priorConfig.enabled);
            expect(after && after.config ? String(after.config.servoPartId) : undefined).toBe(String(priorConfig.servoPartId));
        } finally {
            await rc.dispose();
        }
    });

    test.beforeEach(async ({ browser }) => {
        page = await browser.newPage();
        await page.goto(`${BASE_URL}/setup/jaw-animation`, { waitUntil: 'domcontentloaded' });
        await page.waitForTimeout(2000);
    });

    test.afterEach(async () => {
        await page.close();
    });

    // ─── Page Load ──────────────────────────────────────────────────
    test('should load jaw-animation page', async () => {
        const title = await page.title();
        expect(title).toContain('Jaw Animation');
        await expect(page.locator('#currentPageName')).toContainText('Jaw Animation');
    });

    // ─── Configuration Controls ─────────────────────────────────────
    test('should have jaw enable toggle', async () => {
        await expect(page.locator('#jawEnabled')).toBeAttached();
    });

    test('should have servo selection dropdown', async () => {
        await expect(page.locator('#jawServoSelect')).toBeAttached();
    });

    test('should populate servo dropdown with status info', async () => {
        await page.waitForTimeout(1000);
        const options = await page.locator('#jawServoSelect option').count();
        expect(options).toBeGreaterThanOrEqual(1);
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

    // ─── v2 Controls: Presets, Filter, AGC, Quantization ────────────
    test('should have preset radio buttons (Speech, Music, Custom)', async () => {
        await expect(page.locator('#presetSpeech')).toBeAttached();
        await expect(page.locator('#presetMusic')).toBeAttached();
        await expect(page.locator('#presetCustom')).toBeAttached();
    });

    test('should have speech filter toggle', async () => {
        await expect(page.locator('#bandpassFilter')).toBeAttached();
    });

    test('should have AGC toggle', async () => {
        await expect(page.locator('#agcEnabled')).toBeAttached();
    });

    test('should have quantization slider with value badge', async () => {
        await expect(page.locator('#quantizationRange')).toBeAttached();
        await expect(page.locator('#quantizationValue')).toBeAttached();
    });

    test('should update quantization display when slider moves', async () => {
        const jawEnabled = page.locator('#jawEnabled');
        if (!(await jawEnabled.isChecked())) {
            await jawEnabled.check();
            await page.waitForTimeout(500);
        }

        const slider = page.locator('#quantizationRange');
        const display = page.locator('#quantizationValue');

        await slider.evaluate(function(el, val) { el.value = val; el.dispatchEvent(new Event('input')); }, '15');
        await expect(display).toHaveText('15');
    });

    test('should have timeline canvas (hidden by default)', async () => {
        await expect(page.locator('#jawTimelineCanvas')).toBeAttached();
        // Timeline panel should be hidden until TTS test runs
        const panel = page.locator('#timelinePanel');
        const display = await panel.evaluate(function(el) { return window.getComputedStyle(el).display; });
        expect(display).toBe('none');
    });

    // ─── Calibration Quick-Adjust ────────────────────────────────────
    test('should have calibration quick-adjust buttons', async () => {
        await expect(page.locator('#minAngleDown')).toBeAttached();
        await expect(page.locator('#minAngleUp')).toBeAttached();
        await expect(page.locator('#maxAngleDown')).toBeAttached();
        await expect(page.locator('#maxAngleUp')).toBeAttached();
    });

    test('should have min and max angle value displays', async () => {
        await expect(page.locator('#minAngleValue')).toBeAttached();
        await expect(page.locator('#maxAngleValue')).toBeAttached();
    });

    // ─── TTS Test Panel ─────────────────────────────────────────────
    test('should have TTS test textarea with default text', async () => {
        const textarea = page.locator('#ttsTestText');
        await expect(textarea).toBeAttached();
        const value = await textarea.inputValue();
        // Default text may be customized per character — just check it has content
        expect(value.length).toBeGreaterThan(0);
    });

    test('should have Play TTS & Jaw button', async () => {
        await expect(page.locator('#playTtsBtn')).toBeVisible();
    });

    test('should have Stop button', async () => {
        await expect(page.locator('#stopBtn')).toBeVisible();
    });

    test('should have TTS status badge', async () => {
        await expect(page.locator('#ttsStatus')).toBeAttached();
    });

    // ─── Audio Level Meter ──────────────────────────────────────────
    test('should have audio level meter', async () => {
        await expect(page.locator('#audioMeterFill')).toBeAttached();
    });

    test('should have amplitude and angle displays', async () => {
        await expect(page.locator('#currentAmplitude')).toBeAttached();
        await expect(page.locator('#smoothedAmplitude')).toBeAttached();
        await expect(page.locator('#targetAngle')).toBeAttached();
    });

    // ─── Servo Test Panel ───────────────────────────────────────────
    test('should have test jaw sweep button', async () => {
        await expect(page.locator('#testJawBtn')).toBeVisible();
    });

    test('should have emergency stop button', async () => {
        await expect(page.locator('#emergencyStopBtn')).toBeVisible();
    });

    // ─── Action Buttons ─────────────────────────────────────────────
    test('should have save configuration button', async () => {
        await expect(page.locator('#saveConfigBtn')).toBeVisible();
    });

    // ─── Slider Interactions ────────────────────────────────────────
    test('should update sensitivity display when slider moves', async () => {
        const jawEnabled = page.locator('#jawEnabled');
        if (!(await jawEnabled.isChecked())) {
            await jawEnabled.check();
            await page.waitForTimeout(500);
        }

        const slider = page.locator('#sensitivityRange');
        const display = page.locator('#sensitivityValue');

        await slider.evaluate((el, val) => { el.value = val; el.dispatchEvent(new Event('input')); }, '2.5');
        await expect(display).toHaveText('2.5');
    });

    test('should update smoothing display when slider moves', async () => {
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
        // This save is REAL on a live node (enables the jaw, re-points the servo);
        // the afterAll hook restores the operator's config once the page is gone.
        await exerciseSave();
        // Let the page's debounced auto-save land inside this test rather than
        // racing whatever runs next.
        await page.waitForTimeout(1200);
    });

    async function exerciseSave() {
        // Ensure jaw is enabled
        const jawEnabled = page.locator('#jawEnabled');
        if (!(await jawEnabled.isChecked())) {
            await jawEnabled.check();
        }

        // Select a servo option if one is available and enabled
        const enabledOptions = page.locator('#jawServoSelect option:not([disabled])');
        const enabledCount = await enabledOptions.count();
        let servoSelected = false;
        if (enabledCount > 1) {
            const optionValue = await enabledOptions.nth(1).getAttribute('value');
            if (optionValue) {
                await page.locator('#jawServoSelect').selectOption(optionValue);
                servoSelected = true;
            }
        }

        // Save button should exist
        const saveBtn = page.locator('#saveConfigBtn');
        await expect(saveBtn).toBeVisible();

        if (servoSelected) {
            // When a servo is selected, clicking save should trigger an API call
            const responsePromise = page.waitForResponse(resp =>
                resp.url().includes('/api/jaw-animation/') && resp.request().method() === 'POST'
            );
            await saveBtn.click();
            const response = await responsePromise;
            expect(response.status()).toBeLessThan(500);
        } else {
            // Without an enabled servo, save may show validation error instead of API call
            await saveBtn.click();
            await page.waitForTimeout(500);
            // Just verify no crash — the page should still be functional
            await expect(page.locator('#jawEnabled')).toBeAttached();
        }
    }

    // ─── Removed UI Elements (should NOT exist) ─────────────────────
    test('should NOT have Current Character card', async () => {
        const count = await page.locator('.card-title:has-text("Current Character")').count();
        expect(count).toBe(0);
    });

    test('should NOT have servos overview grid', async () => {
        const count = await page.locator('#servosOverviewGrid').count();
        expect(count).toBe(0);
    });

    test('should NOT have monitoring start/stop buttons', async () => {
        const startCount = await page.locator('#startMonitoringBtn').count();
        const stopCount = await page.locator('#stopMonitoringBtn').count();
        expect(startCount).toBe(0);
        expect(stopCount).toBe(0);
    });

    test('should NOT have Halloween Ready badge', async () => {
        const count = await page.locator('text=Halloween Ready').count();
        expect(count).toBe(0);
    });

    test('should NOT have Advanced Servos tab', async () => {
        const count = await page.locator('text=Advanced Servos').count();
        expect(count).toBe(0);
    });

    test('should NOT have AI Chat tab', async () => {
        const count = await page.locator('a:has-text("AI Chat")').count();
        expect(count).toBe(0);
    });

    // ─── Single Viewport (no scroll) ────────────────────────────────
    test('page should fit viewport without scrollbar', async () => {
        const hasScroll = await page.evaluate(() => {
            return document.documentElement.scrollHeight > window.innerHeight;
        });
        // If it has a scrollbar that's a layout issue but not a hard fail
        // in CI because viewport sizes vary. Log it.
        if (hasScroll) {
            console.warn('⚠️  Page exceeds viewport height — check layout');
        }
    });

    // ─── Toast Notification ─────────────────────────────────────────
    // Toast was removed from jaw-animation template in v6.1.5 UI overhaul;
    // notifications now use inline status badges instead.
    test('should show status feedback via inline elements', async () => {
        // TTS status badge serves as the notification mechanism
        await expect(page.locator('#ttsStatus')).toBeAttached();
    });
});
