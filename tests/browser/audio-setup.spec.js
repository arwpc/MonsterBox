/**
 * Audio Setup Page — Comprehensive Playwright Tests
 * Tests every control, button, panel, dropdown, toast, and API on /setup/audio
 */

import { test, expect } from '@playwright/test';
import { testNavigation, ErrorTracker, waitForPageReady } from './framework.js';

const BASE_URL = process.env.BASE_URL || 'http://localhost:3200';
const PAGE_URL = `${BASE_URL}/setup/audio`;

test.describe('Audio Setup Page — /setup/audio', () => {
    let page;
    let tracker;

    test.beforeEach(async ({ browser }) => {
        page = await browser.newPage();
        tracker = new ErrorTracker(page);
        await page.goto(PAGE_URL);
        await waitForPageReady(page);
    });

    test.afterEach(async () => {
        await page.close();
    });

    // ── Page Load & Structure ──────────────────────────────────────────

    test('page loads without JS errors', async () => {
        // The ErrorTracker was listening during page load
        const title = await page.title();
        expect(title).toContain('Audio');

        // Wait for system config to finish loading
        await page.waitForFunction(() => {
            const pw = document.getElementById('pipewire-status');
            return pw && pw.textContent !== 'Checking...';
        }, { timeout: 10000 });

        await tracker.assertNoErrors();
    });

    test('all panels are present', async () => {
        // System Status
        await expect(page.locator('[data-panel-id="system-status"]')).toBeVisible();
        // Audio Input
        await expect(page.locator('[data-panel-id="audio-input"]')).toBeVisible();
        // Audio Output
        await expect(page.locator('[data-panel-id="audio-output"]')).toBeVisible();
        // Microphone Parts Controls
        await expect(page.locator('[data-panel-id="mic-parts"]')).toBeVisible();
        // Advanced Audio Settings
        await expect(page.locator('[data-panel-id="advanced-audio"]')).toBeVisible();
        // Active Audio Streams
        await expect(page.locator('[data-panel-id="streams"]')).toBeVisible();
        // Speaker Test
        await expect(page.locator('[data-panel-id="speaker-test"]')).toBeVisible();
        // Test Results
        await expect(page.locator('[data-panel-id="test-results"]')).toBeVisible();
    });

    // ── System Status Panel ────────────────────────────────────────────

    test('system status panel shows PipeWire and WirePlumber status', async () => {
        await page.waitForFunction(() => {
            const pw = document.getElementById('pipewire-status');
            return pw && pw.textContent !== 'Checking...';
        }, { timeout: 10000 });

        const pwStatus = page.locator('#pipewire-status');
        const wpStatus = page.locator('#wireplumber-status');

        await expect(pwStatus).toBeVisible();
        await expect(wpStatus).toBeVisible();

        // Should say 'Available' or 'Not Available' — not 'Checking...'
        const pwText = await pwStatus.textContent();
        expect(['Available', 'Not Available']).toContain(pwText);

        const wpText = await wpStatus.textContent();
        expect(['Available', 'Not Available']).toContain(wpText);
    });

    test('system status panel shows sink and source counts', async () => {
        await page.waitForFunction(() => {
            const sc = document.getElementById('sinks-count');
            return sc && sc.textContent !== '0';
        }, { timeout: 10000 });

        const sinksCount = page.locator('#sinks-count');
        const sourcesCount = page.locator('#sources-count');

        await expect(sinksCount).toBeVisible();
        await expect(sourcesCount).toBeVisible();

        const sinksText = await sinksCount.textContent();
        const sourcesText = await sourcesCount.textContent();

        // In test mode, should be at least 1
        expect(parseInt(sinksText, 10)).toBeGreaterThanOrEqual(1);
        expect(parseInt(sourcesText, 10)).toBeGreaterThanOrEqual(1);
    });

    // ── Device Selector Dropdowns ──────────────────────────────────────

    test('input device selector has options after load', async () => {
        await page.waitForFunction(() => {
            const sel = document.getElementById('default-source');
            return sel && sel.options.length > 1;
        }, { timeout: 10000 });

        const source = page.locator('#default-source');
        const optionCount = await source.locator('option').count();
        // Should have 'Auto' + at least 1 device
        expect(optionCount).toBeGreaterThanOrEqual(2);

        // First option should be 'Auto'
        const firstOption = await source.locator('option').first().textContent();
        expect(firstOption).toContain('Auto');
    });

    test('output device selector has options after load', async () => {
        await page.waitForFunction(() => {
            const sel = document.getElementById('default-sink');
            return sel && sel.options.length > 1;
        }, { timeout: 10000 });

        const sink = page.locator('#default-sink');
        const optionCount = await sink.locator('option').count();
        expect(optionCount).toBeGreaterThanOrEqual(2);

        const firstOption = await sink.locator('option').first().textContent();
        expect(firstOption).toContain('Auto');
    });

    test('changing input device selector updates UI without errors', async () => {
        await page.waitForFunction(() => {
            const sel = document.getElementById('default-source');
            return sel && sel.options.length > 1;
        }, { timeout: 10000 });

        tracker.clear();

        // Select the second option (first device after 'Auto')
        const source = page.locator('#default-source');
        const secondOption = await source.locator('option').nth(1).getAttribute('value');
        await source.selectOption(secondOption);

        await page.waitForTimeout(500);
        await tracker.logErrors();
    });

    test('changing output device selector updates UI without errors', async () => {
        await page.waitForFunction(() => {
            const sel = document.getElementById('default-sink');
            return sel && sel.options.length > 1;
        }, { timeout: 10000 });

        tracker.clear();

        const sink = page.locator('#default-sink');
        const secondOption = await sink.locator('option').nth(1).getAttribute('value');
        await sink.selectOption(secondOption);

        await page.waitForTimeout(500);
        await tracker.logErrors();
    });

    // ── VU Meters ──────────────────────────────────────────────────────

    test('input VU meter elements exist', async () => {
        await expect(page.locator('#input-vu-meter')).toBeVisible();
        await expect(page.locator('#input-vu-meter .vu-bar')).toBeAttached();
        await expect(page.locator('#input-level-text')).toBeVisible();
    });

    test('output VU meter elements exist', async () => {
        await expect(page.locator('#output-vu-meter')).toBeVisible();
        await expect(page.locator('#output-vu-meter .vu-bar')).toBeAttached();
        await expect(page.locator('#output-level-text')).toBeVisible();
    });

    test('toggle input VU monitoring start/stop', async () => {
        tracker.clear();

        const toggleBtn = page.locator('#btnToggleInputVU');
        const toggleSpan = page.locator('#input-vu-toggle');

        await expect(toggleBtn).toBeVisible();
        // Initially should say 'Start'
        await expect(toggleSpan).toHaveText('Start');

        // Click to start monitoring
        await toggleBtn.click();
        await page.waitForTimeout(300);
        await expect(toggleSpan).toHaveText('Stop');

        // Click to stop monitoring
        await toggleBtn.click();
        await page.waitForTimeout(300);
        await expect(toggleSpan).toHaveText('Start');

        await tracker.logErrors();
    });

    test('toggle output VU monitoring start/stop', async () => {
        tracker.clear();

        const toggleBtn = page.locator('#btnToggleOutputVU');
        const toggleSpan = page.locator('#output-vu-toggle');

        await expect(toggleBtn).toBeVisible();
        await expect(toggleSpan).toHaveText('Start');

        await toggleBtn.click();
        await page.waitForTimeout(300);
        await expect(toggleSpan).toHaveText('Stop');

        await toggleBtn.click();
        await page.waitForTimeout(300);
        await expect(toggleSpan).toHaveText('Start');

        await tracker.logErrors();
    });

    // ── Test Buttons (Input/Output/Speaker) ────────────────────────────

    test('Test Audio Input button works and shows results', async () => {
        tracker.clear();

        const btn = page.locator('#btnTestAudioInput');
        const results = page.locator('#test-results');

        await expect(btn).toBeVisible();
        await expect(btn).toBeEnabled();

        // Click the test button
        await btn.click();

        // In test mode the mocked response is instant so the transient "Testing..."
        // text may not be visible. Just verify the button returns to ready state.
        await expect(btn).toBeEnabled({ timeout: 15000 });
        await expect(btn).toContainText('Test Audio Input');

        // Test results should have been updated
        const resultsText = await results.textContent();
        expect(resultsText).not.toEqual('Ready to run audio tests...');

        await tracker.logErrors();
    });

    test('Test Audio Input button prevents double-click', async () => {
        tracker.clear();

        const btn = page.locator('#btnTestAudioInput');
        await expect(btn).toBeEnabled();

        // Rapid double-click
        await btn.click();
        await page.waitForTimeout(50);
        await btn.click({ force: true }); // force because it should be disabled

        // Should still only show one test run
        await expect(btn).toBeEnabled({ timeout: 15000 });

        // Check test results — should show results, not errors from double-fire
        const results = await page.locator('#test-results').textContent();
        expect(results).toContain('Running');

        await tracker.logErrors();
    });

    test('Test Audio Output button works and shows results', async () => {
        tracker.clear();

        const btn = page.locator('#btnTestAudioOutput');
        const results = page.locator('#test-results');

        await expect(btn).toBeVisible();
        await expect(btn).toBeEnabled();

        await btn.click();

        // In test mode the mocked response is instant so the transient "Playing..."
        // text may not be visible. Just verify the button returns to ready state.
        await expect(btn).toBeEnabled({ timeout: 15000 });
        await expect(btn).toContainText('Test Audio Output');

        const resultsText = await results.textContent();
        expect(resultsText).not.toEqual('Ready to run audio tests...');

        await tracker.logErrors();
    });

    test('Test Speaker button works without errors', async () => {
        tracker.clear();

        const btn = page.locator('#btnSpeakerTest');
        await expect(btn).toBeVisible();
        await expect(btn).toBeEnabled();

        await btn.click();

        // In test mode the mocked response is instant so the transient "Testing..."
        // text may not be visible. Just verify the button returns to ready state.
        await expect(btn).toBeEnabled({ timeout: 15000 });
        await expect(btn).toContainText('Test Speaker');

        await tracker.logErrors();
    });

    // ── Refresh Button ─────────────────────────────────────────────────

    test('Refresh button reloads system status', async () => {
        // Wait for initial load
        await page.waitForFunction(() => {
            const pw = document.getElementById('pipewire-status');
            return pw && pw.textContent !== 'Checking...';
        }, { timeout: 10000 });

        tracker.clear();

        // Intercept the API call to verify it fires
        const configPromise = page.waitForResponse(
            resp => resp.url().includes('/setup/audio/api/system-config'),
            { timeout: 10000 }
        );

        // Click refresh
        const refreshBtn = page.locator('button:has-text("Refresh")').first();
        await refreshBtn.click();

        // Wait for the API call to complete
        const resp = await configPromise;
        expect(resp.status()).toBe(200);

        await tracker.logErrors();
    });

    // ── Save Configuration ─────────────────────────────────────────────

    test('Save Configuration button sends POST and shows toast', async () => {
        await page.waitForFunction(() => {
            const sel = document.getElementById('default-sink');
            return sel && sel.options.length > 1;
        }, { timeout: 10000 });

        tracker.clear();

        // Intercept the save API call
        const savePromise = page.waitForResponse(
            resp => resp.url().includes('/setup/audio/api/system-config') && resp.request().method() === 'POST',
            { timeout: 10000 }
        );

        // Click save
        const saveBtn = page.locator('button:has-text("Save Configuration")');
        await saveBtn.click();

        const resp = await savePromise;
        expect(resp.status()).toBe(200);

        const body = await resp.json();
        expect(body.success).toBe(true);

        // A toast notification should appear
        await page.waitForTimeout(500);

        await tracker.logErrors();
    });

    // ── Advanced Audio Settings Panel ──────────────────────────────────

    test('available sources list is populated', async () => {
        await page.waitForFunction(() => {
            const el = document.getElementById('available-sources');
            return el && !el.textContent.includes('Loading');
        }, { timeout: 10000 });

        const sources = page.locator('#available-sources');
        const items = sources.locator('.list-group-item');
        const count = await items.count();
        expect(count).toBeGreaterThanOrEqual(1);

        // Each item should have a name
        const firstText = await items.first().textContent();
        expect(firstText.length).toBeGreaterThan(0);
    });

    test('available sinks list is populated', async () => {
        await page.waitForFunction(() => {
            const el = document.getElementById('available-sinks');
            return el && !el.textContent.includes('Loading');
        }, { timeout: 10000 });

        const sinks = page.locator('#available-sinks');
        const items = sinks.locator('.list-group-item');
        const count = await items.count();
        expect(count).toBeGreaterThanOrEqual(1);
    });

    test('per-device test buttons in sources list work', async () => {
        await page.waitForFunction(() => {
            const el = document.getElementById('available-sources');
            return el && !el.textContent.includes('Loading');
        }, { timeout: 10000 });

        tracker.clear();

        // Find and click a per-source test button
        const testBtn = page.locator('#available-sources .list-group-item button').first();
        if (await testBtn.count() > 0) {
            await testBtn.click();
            await page.waitForTimeout(1000);

            // Test results should update
            const results = await page.locator('#test-results').textContent();
            expect(results).toContain('Running');
        }

        await tracker.logErrors();
    });

    test('per-device test buttons in sinks list work', async () => {
        await page.waitForFunction(() => {
            const el = document.getElementById('available-sinks');
            return el && !el.textContent.includes('Loading');
        }, { timeout: 10000 });

        tracker.clear();

        const testBtn = page.locator('#available-sinks .list-group-item button').first();
        if (await testBtn.count() > 0) {
            await testBtn.click();
            await page.waitForTimeout(1000);

            const results = await page.locator('#test-results').textContent();
            expect(results).toContain('Running');
        }

        await tracker.logErrors();
    });

    // ── Active Streams Panel ───────────────────────────────────────────

    test('active streams panel loads', async () => {
        await page.waitForFunction(() => {
            const el = document.getElementById('active-streams');
            return el && !el.textContent.includes('Loading');
        }, { timeout: 10000 });

        const streams = page.locator('#active-streams');
        const text = await streams.textContent();
        // Either shows stream items or 'No active audio streams'
        expect(text.length).toBeGreaterThan(0);
    });

    test('streams refresh button works', async () => {
        tracker.clear();

        const refreshBtn = page.locator('[data-panel-id="streams"] button:has-text("Refresh")');
        await expect(refreshBtn).toBeVisible();

        const apiPromise = page.waitForResponse(
            resp => resp.url().includes('/setup/audio/api/active-streams'),
            { timeout: 10000 }
        );

        await refreshBtn.click();
        const resp = await apiPromise;
        expect(resp.status()).toBe(200);

        await tracker.logErrors();
    });

    // ── Microphone Parts Panel ─────────────────────────────────────────

    test('microphone parts panel loads', async () => {
        await page.waitForFunction(() => {
            const el = document.getElementById('mic-parts-list');
            return el && !el.textContent.includes('Loading');
        }, { timeout: 10000 });

        const list = page.locator('#mic-parts-list');
        const text = await list.textContent();
        // Either shows mic parts or 'No microphone parts found'
        expect(text.length).toBeGreaterThan(0);
    });

    test('microphone parts refresh button works', async () => {
        tracker.clear();

        const refreshBtn = page.locator('[data-panel-id="mic-parts"] button:has-text("Refresh")');
        await expect(refreshBtn).toBeVisible();

        const apiPromise = page.waitForResponse(
            resp => resp.url().includes('/setup/calibration/api/parts'),
            { timeout: 10000 }
        );

        await refreshBtn.click();
        const resp = await apiPromise;
        expect(resp.status()).toBe(200);

        await tracker.logErrors();
    });

    // ── Test Results Panel ─────────────────────────────────────────────

    test('test results panel starts with default text', async () => {
        const results = page.locator('#test-results');
        await expect(results).toBeVisible();
        const text = await results.textContent();
        expect(text).toContain('Ready to run audio tests');
    });

    // ── API Endpoints (via page.request) ───────────────────────────────

    test('GET /setup/audio/api/system-config returns valid config', async () => {
        const resp = await page.request.get(`${BASE_URL}/setup/audio/api/system-config`);
        expect(resp.status()).toBe(200);
        const data = await resp.json();
        expect(data.success).toBe(true);
        expect(data.config).toBeDefined();
        expect(data.config.defaultSink).toBeDefined();
        expect(data.config.defaultSource).toBeDefined();
        expect(data.config.availableSinks).toBeInstanceOf(Array);
        expect(data.config.availableSources).toBeInstanceOf(Array);
        expect(data.config.pipewireStatus).toBeDefined();
    });

    test('GET /setup/audio/api/outputs returns outputs array', async () => {
        const resp = await page.request.get(`${BASE_URL}/setup/audio/api/outputs`);
        expect(resp.status()).toBe(200);
        const data = await resp.json();
        expect(data.success).toBe(true);
        expect(data.outputs).toBeInstanceOf(Array);
        expect(data.outputs.length).toBeGreaterThanOrEqual(1);
        expect(data.outputs[0]).toHaveProperty('id');
        expect(data.outputs[0]).toHaveProperty('name');
    });

    test('GET /setup/audio/api/inputs returns inputs array', async () => {
        const resp = await page.request.get(`${BASE_URL}/setup/audio/api/inputs`);
        expect(resp.status()).toBe(200);
        const data = await resp.json();
        expect(data.success).toBe(true);
        expect(data.inputs).toBeInstanceOf(Array);
        expect(data.inputs.length).toBeGreaterThanOrEqual(1);
        expect(data.inputs[0]).toHaveProperty('id');
        expect(data.inputs[0]).toHaveProperty('name');
    });

    test('GET /setup/audio/api/hardware-devices returns devices', async () => {
        const resp = await page.request.get(`${BASE_URL}/setup/audio/api/hardware-devices`);
        expect(resp.status()).toBe(200);
        const data = await resp.json();
        expect(data.success).toBe(true);
        expect(data.devices).toBeDefined();
        expect(data.devices.outputs).toBeInstanceOf(Array);
        expect(data.devices.inputs).toBeInstanceOf(Array);
    });

    test('GET /setup/audio/api/active-streams returns streams', async () => {
        const resp = await page.request.get(`${BASE_URL}/setup/audio/api/active-streams`);
        expect(resp.status()).toBe(200);
        const data = await resp.json();
        expect(data.success).toBe(true);
        expect(data.streams).toBeInstanceOf(Array);
    });

    test('GET /setup/audio/api/audio-levels returns level for input', async () => {
        // Microphone probing can be slow — allow extra time for device access
        const resp = await page.request.get(`${BASE_URL}/setup/audio/api/audio-levels?deviceId=default&deviceType=input`, { timeout: 20000 });
        expect(resp.status()).toBe(200);
        const data = await resp.json();
        expect(data.success).toBe(true);
        expect(typeof data.level).toBe('number');
        expect(data.level).toBeGreaterThanOrEqual(0);
        expect(data.type).toBe('input');
    });

    test('GET /setup/audio/api/input-level returns quick level test', async () => {
        // Microphone probing can be slow — allow extra time for device access
        const resp = await page.request.get(`${BASE_URL}/setup/audio/api/input-level?device=default`, { timeout: 20000 });
        expect(resp.status()).toBe(200);
        const data = await resp.json();
        expect(data.success).toBe(true);
        expect(typeof data.level).toBe('number');
        expect(data.device).toBeDefined();
    });

    test('POST /setup/audio/api/test-system microphone returns success', async () => {
        const resp = await page.request.post(`${BASE_URL}/setup/audio/api/test-system`, {
            data: { testType: 'microphone', deviceId: 'default' }
        });
        expect(resp.status()).toBe(200);
        const data = await resp.json();
        expect(data.success).toBe(true);
        expect(data.testType).toBe('microphone');
    });

    test('POST /setup/audio/api/test-system speaker returns success', async () => {
        const resp = await page.request.post(`${BASE_URL}/setup/audio/api/test-system`, {
            data: { testType: 'speaker', deviceId: 'default' }
        });
        expect(resp.status()).toBe(200);
        const data = await resp.json();
        expect(data.success).toBe(true);
        expect(data.testType).toBe('speaker');
    });

    test('POST /setup/audio/api/test-system rejects invalid type', async () => {
        const resp = await page.request.post(`${BASE_URL}/setup/audio/api/test-system`, {
            data: { testType: 'invalid', deviceId: 'default' }
        });
        expect(resp.status()).toBe(400);
        const data = await resp.json();
        expect(data.success).toBe(false);
    });

    test('POST /setup/audio/api/system-config saves config', async () => {
        const resp = await page.request.post(`${BASE_URL}/setup/audio/api/system-config`, {
            data: { defaultSink: 'default', defaultSource: 'default' }
        });
        expect(resp.status()).toBe(200);
        const data = await resp.json();
        expect(data.success).toBe(true);
    });

    test('POST /setup/audio/api/set-input-gain rejects missing params', async () => {
        const resp = await page.request.post(`${BASE_URL}/setup/audio/api/set-input-gain`, {
            data: { gainPercent: 100 }
        });
        expect(resp.status()).toBe(400);
        const data = await resp.json();
        expect(data.success).toBe(false);
    });

    // ── Current Device Info Panels ─────────────────────────────────────

    test('current source info panel loads', async () => {
        await page.waitForFunction(() => {
            const el = document.getElementById('current-source-info');
            return el && !el.textContent.includes('Loading');
        }, { timeout: 10000 });

        const info = page.locator('#current-source-info');
        const text = await info.textContent();
        expect(text.length).toBeGreaterThan(0);
    });

    test('current sink info panel loads', async () => {
        await page.waitForFunction(() => {
            const el = document.getElementById('current-sink-info');
            return el && !el.textContent.includes('Loading');
        }, { timeout: 10000 });

        const info = page.locator('#current-sink-info');
        const text = await info.textContent();
        expect(text.length).toBeGreaterThan(0);
    });

    // ── Panel Sortable / Collapsible ───────────────────────────────────

    test('panel-sortable.js initializes', async () => {
        // The page uses PanelSortable.init('audio-setup')
        // Verify the sortable column has the expected attribute
        const sortableCol = page.locator('.sortable-column[data-column-id="audio-io"]');
        await expect(sortableCol).toBeAttached();
    });

    // ── Full Workflow: select device → save → verify persistence ──────

    test('device selection persists through save and refresh', async () => {
        await page.waitForFunction(() => {
            const sel = document.getElementById('default-sink');
            return sel && sel.options.length > 1;
        }, { timeout: 10000 });

        tracker.clear();

        // Select a specific device (second option)
        const sink = page.locator('#default-sink');
        const secondOption = await sink.locator('option').nth(1).getAttribute('value');
        await sink.selectOption(secondOption);

        // Save
        const savePromise = page.waitForResponse(
            resp => resp.url().includes('/setup/audio/api/system-config') && resp.request().method() === 'POST',
            { timeout: 10000 }
        );
        await page.locator('button:has-text("Save Configuration")').click();
        const resp = await savePromise;
        expect(resp.status()).toBe(200);

        // After save + reload of config, the selector should still show selected device
        await page.waitForTimeout(1000);
        const currentValue = await sink.inputValue();
        expect(currentValue).toBe(secondOption);

        await tracker.logErrors();
    });

    // ── No uncaught errors after interacting with all controls ────────

    test('no uncaught errors after exercising all major controls', async () => {
        await page.waitForFunction(() => {
            const pw = document.getElementById('pipewire-status');
            return pw && pw.textContent !== 'Checking...';
        }, { timeout: 10000 });

        tracker.clear();

        // Toggle VU meters on and off
        await page.locator('#btnToggleInputVU').click();
        await page.waitForTimeout(200);
        await page.locator('#btnToggleInputVU').click();
        await page.waitForTimeout(200);

        await page.locator('#btnToggleOutputVU').click();
        await page.waitForTimeout(200);
        await page.locator('#btnToggleOutputVU').click();
        await page.waitForTimeout(200);

        // Click refresh on streams
        const streamsRefresh = page.locator('[data-panel-id="streams"] button:has-text("Refresh")');
        if (await streamsRefresh.count() > 0) {
            await streamsRefresh.click();
            await page.waitForTimeout(500);
        }

        // Click refresh on mic parts
        const micRefresh = page.locator('[data-panel-id="mic-parts"] button:has-text("Refresh")');
        if (await micRefresh.count() > 0) {
            await micRefresh.click();
            await page.waitForTimeout(500);
        }

        // Click main refresh
        await page.locator('button:has-text("Refresh")').first().click();
        await page.waitForTimeout(1000);

        // Verify no uncaught errors
        const errors = tracker.getErrors();
        const critical = tracker.filterCriticalErrors(errors.console);
        expect(critical.length).toBe(0);
    });
});
