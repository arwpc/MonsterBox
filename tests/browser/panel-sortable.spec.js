/**
 * Dashboard Drawer / Deck Tests
 * Validates the Scare Console (v10) surface at `/`:
 *   - the always-visible one-tap deck (scenes / poses / sounds tabs)
 *   - the drawer accordion (#dashboardAccordion) expand/collapse behavior
 *
 * v10 note: scenes and poses are no longer accordion drawers — they are deck
 * tabs on the stage. The surviving drawers are Conversation, Manual Controls,
 * Audio Bridge and Live Console. The classic accordion lives on at
 * /dashboard/classic.
 * (Replaces old panel-sortable drag-and-drop tests)
 */

import { test, expect } from '@playwright/test';
import { testNavigation, ErrorTracker } from './framework.js';

const BASE_URL = process.env.BASE_URL || 'http://localhost:3000';

test.describe('Dashboard Accordion', () => {
    let page;
    let tracker;

    test.beforeEach(async ({ browser }) => {
        page = await browser.newPage();
        tracker = await testNavigation(page, `${BASE_URL}/`, 'MonsterBox');
    });

    test.afterEach(async () => {
        await page.close();
    });

    test('should load accordion container', async () => {
        tracker.clear();
        await page.waitForLoadState('domcontentloaded');
        // The dashboard holds an EventSource, a WebSocket and 1s/1.5s/3s polls,
        // so 'networkidle' is unreachable there by design — tolerate the timeout
        // instead of failing the test on it. Same pattern as actual-usage-testing.spec.js.
        await page.waitForLoadState('networkidle').catch(() => {});

        const accordion = page.locator('#dashboardAccordion');
        await expect(accordion).toBeVisible();

        // Accordion should have multiple items
        const items = await accordion.locator('.accordion-item[data-panel-id]').count();
        expect(items).toBeGreaterThan(0);

        await tracker.logErrors();
    });

    test('should have accordion buttons for each panel', async () => {
        tracker.clear();
        await page.waitForLoadState('domcontentloaded');
        // The dashboard holds an EventSource, a WebSocket and 1s/1.5s/3s polls,
        // so 'networkidle' is unreachable there by design — tolerate the timeout
        // instead of failing the test on it. Same pattern as actual-usage-testing.spec.js.
        await page.waitForLoadState('networkidle').catch(() => {});

        // Check that accordion buttons exist for key drawers (v10 drawer set)
        const expectedTargets = ['#collapseManual', '#collapseAudioBridge', '#collapseConsole'];
        for (const target of expectedTargets) {
            const btn = page.locator(`[data-bs-target="${target}"]`);
            const count = await btn.count();
            expect(count).toBeGreaterThan(0);
        }

        await tracker.logErrors();
    });

    test('should expand and collapse an accordion panel', async () => {
        tracker.clear();
        await page.waitForLoadState('domcontentloaded');
        // The dashboard holds an EventSource, a WebSocket and 1s/1.5s/3s polls,
        // so 'networkidle' is unreachable there by design — tolerate the timeout
        // instead of failing the test on it. Same pattern as actual-usage-testing.spec.js.
        await page.waitForLoadState('networkidle').catch(() => {});

        // Manual Controls stands in for the Conversation drawer, which left the
        // accordion for the AI deck tab in v10.
        const chatButton = page.locator('[data-bs-target="#collapseManual"]');
        await expect(chatButton).toBeVisible();

        const collapseBody = page.locator('#collapseManual');

        // Initially collapsed
        await expect(collapseBody).not.toHaveClass(/show/);

        // Click to expand
        await chatButton.click();
        await page.waitForTimeout(500);

        // Should now be expanded
        await expect(collapseBody).toHaveClass(/show/);

        // Click to collapse
        await chatButton.click();
        await page.waitForTimeout(500);

        // Should be collapsed again
        await expect(collapseBody).not.toHaveClass(/show/);

        await tracker.logErrors();
    });

    test('should show content when accordion panel is expanded', async () => {
        tracker.clear();
        await page.waitForLoadState('domcontentloaded');
        // The dashboard holds an EventSource, a WebSocket and 1s/1.5s/3s polls,
        // so 'networkidle' is unreachable there by design — tolerate the timeout
        // instead of failing the test on it. Same pattern as actual-usage-testing.spec.js.
        await page.waitForLoadState('networkidle').catch(() => {});

        // Expand the Manual Controls drawer
        await page.locator('[data-bs-target="#collapseManual"]').click();
        await page.waitForTimeout(500);

        // The body map should be visible inside
        await expect(page.locator('#mcBodyMap')).toBeVisible();

        await tracker.logErrors();
    });

    test('should only have one accordion panel open at a time', async () => {
        tracker.clear();
        await page.waitForLoadState('domcontentloaded');
        // The dashboard holds an EventSource, a WebSocket and 1s/1.5s/3s polls,
        // so 'networkidle' is unreachable there by design — tolerate the timeout
        // instead of failing the test on it. Same pattern as actual-usage-testing.spec.js.
        await page.waitForLoadState('networkidle').catch(() => {});

        // Open Manual Controls
        await page.locator('[data-bs-target="#collapseManual"]').click();
        await page.waitForTimeout(500);
        await expect(page.locator('#collapseManual')).toHaveClass(/show/);

        // Open Audio Bridge — should close Manual Controls (data-bs-parent behavior)
        await page.locator('[data-bs-target="#collapseAudioBridge"]').click();
        await page.waitForTimeout(700);
        await expect(page.locator('#collapseAudioBridge')).toHaveClass(/show/);
        await expect(page.locator('#collapseManual')).not.toHaveClass(/show/);

        await tracker.logErrors();
    });

    // v10: scenes and poses left the accordion for the always-visible deck.
    // This is the coverage that used to live in the "Scenes panel" accordion
    // tests — the operator must still be able to reach scenes and poses from
    // the dashboard without opening anything.
    test('should show the one-tap deck without expanding a drawer', async () => {
        tracker.clear();
        await page.waitForLoadState('domcontentloaded');
        // The dashboard holds an EventSource, a WebSocket and 1s/1.5s/3s polls,
        // so 'networkidle' is unreachable there by design — tolerate the timeout
        // instead of failing the test on it. Same pattern as actual-usage-testing.spec.js.
        await page.waitForLoadState('networkidle').catch(() => {});

        const grid = page.locator('#scDeckGrid');
        await expect(grid).toBeVisible();

        for (const deck of ['scenes', 'poses', 'sounds']) {
            await expect(page.locator(`.sc-tab[data-deck="${deck}"]`)).toBeVisible();
        }

        await tracker.logErrors();
    });

    test('should switch the deck between scenes and poses', async () => {
        tracker.clear();
        await page.waitForLoadState('domcontentloaded');
        // The dashboard holds an EventSource, a WebSocket and 1s/1.5s/3s polls,
        // so 'networkidle' is unreachable there by design — tolerate the timeout
        // instead of failing the test on it. Same pattern as actual-usage-testing.spec.js.
        await page.waitForLoadState('networkidle').catch(() => {});

        const grid = page.locator('#scDeckGrid');
        const scenesTab = page.locator('.sc-tab[data-deck="scenes"]');
        const posesTab = page.locator('.sc-tab[data-deck="poses"]');

        // Scenes is the default deck
        await expect(scenesTab).toHaveClass(/active/);
        await expect(grid).toBeVisible();

        await posesTab.click();
        await page.waitForTimeout(500);
        await expect(posesTab).toHaveClass(/active/);
        await expect(scenesTab).not.toHaveClass(/active/);

        // Grid re-renders for the new deck: either pose tiles or an honest empty state
        const poseTiles = await grid.locator('.sc-tile-poses').count();
        const empty = await grid.locator('.sc-deck-empty').count();
        expect(poseTiles + empty).toBeGreaterThan(0);

        await scenesTab.click();
        await page.waitForTimeout(500);
        await expect(scenesTab).toHaveClass(/active/);

        await tracker.logErrors();
    });
});

test.describe('Dashboard Accordion - AI Settings', () => {
    let page;
    let tracker;

    test.beforeEach(async ({ browser }) => {
        page = await browser.newPage();
        tracker = await testNavigation(page, `${BASE_URL}/ai-settings`, 'AI');
    });

    test.afterEach(async () => {
        await page.close();
    });

    test('should have panel elements on AI Settings', async () => {
        tracker.clear();
        await page.waitForLoadState('domcontentloaded');
        // The dashboard holds an EventSource, a WebSocket and 1s/1.5s/3s polls,
        // so 'networkidle' is unreachable there by design — tolerate the timeout
        // instead of failing the test on it. Same pattern as actual-usage-testing.spec.js.
        await page.waitForLoadState('networkidle').catch(() => {});
        await page.waitForTimeout(1000);

        // AI Settings page should have panel elements with data-panel-id
        const panels = await page.locator('[data-panel-id]').count();
        expect(panels).toBeGreaterThan(0);

        await tracker.logErrors();
    });
});

test.describe('Dashboard Accordion - Audio Setup', () => {
    let page;
    let tracker;

    test.beforeEach(async ({ browser }) => {
        page = await browser.newPage();
        tracker = await testNavigation(page, `${BASE_URL}/setup/audio`, 'Audio');
    });

    test.afterEach(async () => {
        await page.close();
    });

    test('should have panel elements on Audio Setup', async () => {
        tracker.clear();
        // Audio setup page has long-running ALSA queries; use domcontentloaded + timeout
        await page.waitForTimeout(2000);

        const panels = await page.locator('[data-panel-id]').count();
        expect(panels).toBeGreaterThan(0);

        await tracker.logErrors();
    });
});
