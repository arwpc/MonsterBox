/**
 * Panel Sortable Tests
 * Validates drag-and-drop panel reordering and collapse on key pages
 */

import { test, expect } from '@playwright/test';
import { testNavigation, ErrorTracker } from './framework.js';

const BASE_URL = process.env.BASE_URL || 'http://localhost:3000';

test.describe('Panel Sortable - Dashboard', () => {
    let page;
    let tracker;

    test.beforeEach(async ({ browser }) => {
        page = await browser.newPage();
        tracker = await testNavigation(page, `${BASE_URL}/`, 'MonsterBox');
    });

    test.afterEach(async () => {
        await page.close();
    });

    test('should load panel-sortable script', async () => {
        tracker.clear();
        await page.waitForLoadState('networkidle');

        const hasPanelSortable = await page.evaluate(function () {
            return typeof window.PanelSortable !== 'undefined' &&
                   typeof window.PanelSortable.init === 'function';
        });

        expect(hasPanelSortable).toBe(true);
        await tracker.logErrors();
    });

    test('should add collapse toggles to panels', async () => {
        tracker.clear();
        await page.waitForLoadState('networkidle');
        await page.waitForTimeout(1000);

        // Dashboard panels with data-panel-id should have collapse toggles
        const toggles = await page.locator('.panel-collapse-toggle').count();
        expect(toggles).toBeGreaterThan(0);

        await tracker.logErrors();
    });

    test('should add drag handles to sortable columns', async () => {
        tracker.clear();
        await page.waitForLoadState('networkidle');
        await page.waitForTimeout(1000);

        // Sortable column panels should have drag handles
        const handles = await page.locator('.panel-drag-handle').count();
        expect(handles).toBeGreaterThan(0);

        await tracker.logErrors();
    });

    test('should collapse and expand a panel', async () => {
        tracker.clear();
        await page.waitForLoadState('networkidle');
        await page.waitForTimeout(1000);

        // Find the first collapse toggle
        const toggle = page.locator('.panel-collapse-toggle').first();
        await expect(toggle).toBeVisible();

        // Find the associated card body
        const card = page.locator('[data-panel-id]').first();
        const cardBody = card.locator('.card-body').first();

        // Card body should be visible initially
        await expect(cardBody).toBeVisible();

        // Click toggle to collapse
        await toggle.click();
        await page.waitForTimeout(300);

        // Card body should be hidden
        await expect(cardBody).toBeHidden();

        // Toggle should have collapsed class
        await expect(toggle).toHaveClass(/collapsed/);

        // Click toggle to expand
        await toggle.click();
        await page.waitForTimeout(300);

        // Card body should be visible again
        await expect(cardBody).toBeVisible();

        await tracker.logErrors();
    });

    test('should persist collapsed state across reload', async () => {
        tracker.clear();
        await page.waitForLoadState('networkidle');
        await page.waitForTimeout(1000);

        // Collapse first panel
        const toggle = page.locator('.panel-collapse-toggle').first();
        await toggle.click();
        await page.waitForTimeout(300);

        // Get the panel ID for verification
        const panelId = await page.locator('[data-panel-id]').first().getAttribute('data-panel-id');

        // Reload the page
        await page.reload();
        await page.waitForLoadState('networkidle');
        await page.waitForTimeout(1000);

        // Panel should still be collapsed
        const panel = page.locator('[data-panel-id="' + panelId + '"]');
        const cardBody = panel.locator('.card-body').first();
        await expect(cardBody).toBeHidden();

        // Clean up: expand the panel and clear localStorage
        const toggleAfter = panel.locator('.panel-collapse-toggle').first();
        await toggleAfter.click();
        await page.waitForTimeout(300);

        await tracker.logErrors();
    });
});

test.describe('Panel Sortable - AI Settings', () => {
    let page;
    let tracker;

    test.beforeEach(async ({ browser }) => {
        page = await browser.newPage();
        tracker = await testNavigation(page, `${BASE_URL}/ai-settings`, 'AI');
    });

    test.afterEach(async () => {
        await page.close();
    });

    test('should have collapsible panels on AI Settings', async () => {
        tracker.clear();
        await page.waitForLoadState('networkidle');
        await page.waitForTimeout(1000);

        // AI Settings has panel-collapsible panels
        const collapsible = await page.locator('.panel-collapsible[data-panel-id]').count();
        expect(collapsible).toBeGreaterThan(0);

        await tracker.logErrors();
    });

    test('should have sortable sidebar panels', async () => {
        tracker.clear();
        await page.waitForLoadState('networkidle');
        await page.waitForTimeout(1000);

        // AI Settings sidebar has sortable-column
        const sortableCol = page.locator('.sortable-column[data-column-id="ai-sidebar"]');
        await expect(sortableCol).toBeVisible();

        // Should have drag handles in the sidebar
        const handles = await sortableCol.locator('.panel-drag-handle').count();
        expect(handles).toBeGreaterThan(0);

        await tracker.logErrors();
    });
});

test.describe('Panel Sortable - Audio Setup', () => {
    let page;
    let tracker;

    test.beforeEach(async ({ browser }) => {
        page = await browser.newPage();
        tracker = await testNavigation(page, `${BASE_URL}/setup/audio`, 'Audio');
    });

    test.afterEach(async () => {
        await page.close();
    });

    test('should have collapsible panels on Audio Setup', async () => {
        tracker.clear();
        // Audio setup page has long-running ALSA queries; use domcontentloaded + timeout
        await page.waitForTimeout(2000);

        const collapsible = await page.locator('.panel-collapsible[data-panel-id]').count();
        expect(collapsible).toBeGreaterThan(0);

        await tracker.logErrors();
    });

    test('should have sortable audio IO panels', async () => {
        tracker.clear();
        await page.waitForTimeout(2000);

        const sortableCol = page.locator('.sortable-column[data-column-id="audio-io"]');
        await expect(sortableCol).toBeVisible();

        const handles = await sortableCol.locator('.panel-drag-handle').count();
        expect(handles).toBeGreaterThanOrEqual(2);

        await tracker.logErrors();
    });
});
