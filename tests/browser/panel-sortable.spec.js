/**
 * Dashboard Accordion Tests
 * Validates accordion-based panel expand/collapse on the Dashboard
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
        await page.waitForLoadState('networkidle');

        const accordion = page.locator('#dashboardAccordion');
        await expect(accordion).toBeVisible();

        // Accordion should have multiple items
        const items = await accordion.locator('.accordion-item[data-panel-id]').count();
        expect(items).toBeGreaterThan(0);

        await tracker.logErrors();
    });

    test('should have accordion buttons for each panel', async () => {
        tracker.clear();
        await page.waitForLoadState('networkidle');

        // Check that accordion buttons exist for key panels
        const expectedTargets = ['#collapseScenes', '#collapsePoses', '#collapseManual', '#collapseConsole'];
        for (const target of expectedTargets) {
            const btn = page.locator(`[data-bs-target="${target}"]`);
            const count = await btn.count();
            expect(count).toBeGreaterThan(0);
        }

        await tracker.logErrors();
    });

    test('should expand and collapse an accordion panel', async () => {
        tracker.clear();
        await page.waitForLoadState('networkidle');

        // Click the Scenes accordion button to expand
        const scenesButton = page.locator('[data-bs-target="#collapseScenes"]');
        await expect(scenesButton).toBeVisible();

        const collapseBody = page.locator('#collapseScenes');

        // Initially collapsed
        await expect(collapseBody).not.toHaveClass(/show/);

        // Click to expand
        await scenesButton.click();
        await page.waitForTimeout(500);

        // Should now be expanded
        await expect(collapseBody).toHaveClass(/show/);

        // Click to collapse
        await scenesButton.click();
        await page.waitForTimeout(500);

        // Should be collapsed again
        await expect(collapseBody).not.toHaveClass(/show/);

        await tracker.logErrors();
    });

    test('should show content when accordion panel is expanded', async () => {
        tracker.clear();
        await page.waitForLoadState('networkidle');

        // Expand the Scenes panel
        await page.locator('[data-bs-target="#collapseScenes"]').click();
        await page.waitForTimeout(500);

        // Scenes container should be visible inside
        await expect(page.locator('#scenesContainer')).toBeVisible();

        await tracker.logErrors();
    });

    test('should only have one accordion panel open at a time', async () => {
        tracker.clear();
        await page.waitForLoadState('networkidle');

        // Open Scenes
        await page.locator('[data-bs-target="#collapseScenes"]').click();
        await page.waitForTimeout(500);
        await expect(page.locator('#collapseScenes')).toHaveClass(/show/);

        // Open Poses — should close Scenes (data-bs-parent accordion behavior)
        await page.locator('[data-bs-target="#collapsePoses"]').click();
        await page.waitForTimeout(500);
        await expect(page.locator('#collapsePoses')).toHaveClass(/show/);
        await expect(page.locator('#collapseScenes')).not.toHaveClass(/show/);

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
        await page.waitForLoadState('networkidle');
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
