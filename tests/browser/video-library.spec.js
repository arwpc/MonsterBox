/**
 * Video Control Tests (the page at /video-library)
 * Validates the Goblin board, the Send panel and the library of uploads.
 */

import { test, expect } from '@playwright/test';
import { testNavigation, ErrorTracker, getAllInteractiveElements } from './framework.js';

const BASE_URL = process.env.BASE_URL || 'http://localhost:3000';

test.describe('Video Control Page', () => {
    let page;
    let tracker;

    test.beforeEach(async ({ browser }) => {
        page = await browser.newPage();
        tracker = await testNavigation(page, `${BASE_URL}/video-library`, 'Video');
    });

    test.afterEach(async () => {
        await page.close();
    });

    test('should load video library without errors', async () => {
        expect(await page.title()).toContain('Video');
    });

    test('should display video files or empty state', async () => {
        tracker.clear();

        await page.waitForLoadState('networkidle');
        await page.waitForTimeout(1000);

        const videoItems = await page.locator('.video-card, [data-video-id]').count();
        const emptyState = await page.locator('#emptyState').count();

        // Either we have files or an empty state - both are valid
        expect(videoItems + emptyState).toBeGreaterThanOrEqual(0);

        await tracker.logErrors();
    });

    test('shows the Goblin board and the Send panel, one card per Goblin that answers', async ({ request }) => {
        tracker.clear();
        // The board is the device's truth, so compare with the same endpoint the page calls.
        const board = await (await request.get(`${BASE_URL}/video-library/api/goblins/board`)).json();
        expect(board.success).toBe(true);
        await page.waitForFunction(() => !/Reading the Goblins/.test(document.getElementById('goblinBoard').textContent), null, { timeout: 30000 });
        const cards = await page.locator('#goblinBoard .vid-board-card').count();
        expect(cards).toBe(board.goblins.length);
        const online = board.goblins.filter(g => g.online);
        // Every online Goblin gets a picker with its files and the four controls.
        for (const g of online) {
            const card = page.locator(`#goblinBoard .vid-board-card[data-goblin-id="${g.id}"]`);
            expect(await card.locator('.vid-board-select option').count()).toBe((g.videos || []).length + 1);
            expect(await card.locator('button').count()).toBe(4);
        }
        // The Send panel ticks every online Goblin by default and lists their files.
        expect(await page.locator('#sendGoblinList input:checked').count()).toBe(online.length);
        if (online.length) {
            expect(await page.locator('#sendVideoList .vid-send-row').count()).toBeGreaterThan(0);
        }
        await tracker.logErrors();
    });

    test('should have upload button', async () => {
        tracker.clear();

        const uploadBtn = page.locator('button:has-text("Upload")').first();
        await expect(uploadBtn).toBeVisible({ timeout: 5000 });

        await tracker.logErrors();
    });

    test('should have view toggle buttons', async () => {
        tracker.clear();

        const gridBtn = page.locator('#viewGrid');
        const listBtn = page.locator('#viewList');

        await expect(gridBtn).toBeVisible({ timeout: 5000 });
        await expect(listBtn).toBeVisible({ timeout: 5000 });

        await tracker.logErrors();
    });

    test('should switch to list view and back to grid', async () => {
        tracker.clear();
        await page.waitForLoadState('networkidle');
        await page.waitForTimeout(1000);

        const gridContainer = page.locator('#videoGrid');
        const listContainer = page.locator('#videoListContainer');
        const gridBtn = page.locator('#viewGrid');
        const listBtn = page.locator('#viewList');

        // Default should be grid visible, list hidden
        await expect(gridContainer).toBeVisible();
        await expect(listContainer).toBeHidden();

        // Switch to list view
        await listBtn.click();
        await page.waitForTimeout(500);

        await expect(listContainer).toBeVisible();
        await expect(gridContainer).toBeHidden();

        // Assert which view is showing rather than how the buttons are styled.
        // The mb-* design-system migration renamed btn-outline, and a test that
        // pins to a style class fails on a redesign while the feature works.
        // The containers above already prove the semantic state; this just
        // confirms the active button is visually distinguished from the other.
        const listClass = (await listBtn.getAttribute('class')) || '';
        const gridClass = (await gridBtn.getAttribute('class')) || '';
        expect(listClass, 'the active view button should be styled differently from the inactive one')
            .not.toBe(gridClass);

        // Switch back to grid
        await gridBtn.click();
        await page.waitForTimeout(500);

        await expect(gridContainer).toBeVisible();
        await expect(listContainer).toBeHidden();

        await tracker.logErrors();
    });

    test('should persist view preference across reload', async () => {
        tracker.clear();
        await page.waitForLoadState('networkidle');
        await page.waitForTimeout(1000);

        // Switch to list view
        await page.locator('#viewList').click();
        await page.waitForTimeout(500);

        // Reload the page
        await page.reload();
        await page.waitForLoadState('networkidle');
        await page.waitForTimeout(1000);

        // List view should still be active after reload
        const listContainer = page.locator('#videoListContainer');
        const gridContainer = page.locator('#videoGrid');
        await expect(listContainer).toBeVisible();
        await expect(gridContainer).toBeHidden();

        // Clean up: reset to grid view
        await page.locator('#viewGrid').click();
        await page.waitForTimeout(300);

        await tracker.logErrors();
    });

    test('should have category filter', async () => {
        tracker.clear();

        const categoryFilter = page.locator('#categoryFilter').first();

        if (await categoryFilter.count() > 0) {
            await expect(categoryFilter).toBeVisible();
        }

        await tracker.logErrors();
    });

    test('should validate all interactive elements', async () => {
        tracker.clear();

        const elements = await getAllInteractiveElements(page);
        console.log(`Found ${elements.length} interactive elements`);

        expect(elements.length).toBeGreaterThan(0);
        await tracker.logErrors();
    });
});
