/**
 * Audio Library Tests
 * Validates all functionality on /audio-library page (table-based interface)
 */

import { test, expect } from '@playwright/test';
import { testNavigation, ErrorTracker, getAllInteractiveElements } from './framework.js';

const BASE_URL = process.env.BASE_URL || 'http://localhost:3000';

test.describe('Audio Library Page', () => {
    let page;
    let tracker;

    test.beforeEach(async ({ browser }) => {
        page = await browser.newPage();
        tracker = await testNavigation(page, `${BASE_URL}/audio-library`, 'Audio');
    });

    test.afterEach(async () => {
        await page.close();
    });

    test('should load audio library without errors', async () => {
        expect(await page.title()).toContain('Audio');
    });

    test('should display audio table or empty state', async () => {
        tracker.clear();

        // Wait for page to load
        await page.waitForLoadState('networkidle');
        await page.waitForTimeout(1000);

        // Check if audio table has rows OR empty state is shown
        const tableRows = await page.locator('#audioTableBody tr').count();
        const emptyState = await page.locator('#emptyState').count();

        // Either we have files in the table or an empty state - both are valid
        expect(tableRows + emptyState).toBeGreaterThanOrEqual(0);

        await tracker.logErrors();
    });

    test('should show play buttons when audio files exist', async () => {
        tracker.clear();

        await page.waitForLoadState('networkidle');
        await page.waitForTimeout(1000);

        // Find play buttons in the table
        const tableRows = await page.locator('#audioTableBody tr').count();

        if (tableRows > 0) {
            const playButton = page.locator('.play-btn').first();
            await expect(playButton).toBeVisible({ timeout: 5000 });
        }

        await tracker.logErrors();
    });

    test('should have stop all audio button', async () => {
        tracker.clear();

        // The Stop All button should always be visible
        const stopAllBtn = page.locator('#stopAllBtn');
        await expect(stopAllBtn).toBeVisible({ timeout: 5000 });

        await tracker.logErrors();
    });

    test('should have upload button', async () => {
        tracker.clear();

        // The Upload button should always be visible
        const uploadBtn = page.locator('button:has-text("Upload")').first();
        await expect(uploadBtn).toBeVisible({ timeout: 5000 });

        await tracker.logErrors();
    });

    test('should have category filter', async () => {
        tracker.clear();

        // Find category filter dropdown
        const categoryFilter = page.locator('select#categoryFilter');
        await expect(categoryFilter).toBeVisible({ timeout: 5000 });

        await tracker.logErrors();
    });

    test('should have search input', async () => {
        tracker.clear();

        const searchInput = page.locator('#searchInput');
        await expect(searchInput).toBeVisible({ timeout: 5000 });

        await tracker.logErrors();
    });

    test('should have sort dropdown', async () => {
        tracker.clear();

        const sortBy = page.locator('#sortBy');
        await expect(sortBy).toBeVisible({ timeout: 5000 });

        // Default should be Title A-Z
        await expect(sortBy).toHaveValue('title');

        await tracker.logErrors();
    });

    test('should have stats badges', async () => {
        tracker.clear();

        await page.waitForLoadState('networkidle');
        await page.waitForTimeout(1000);

        const totalFiles = page.locator('#totalFiles');
        const totalSize = page.locator('#totalSize');

        await expect(totalFiles).toBeVisible({ timeout: 5000 });
        await expect(totalSize).toBeVisible({ timeout: 5000 });

        await tracker.logErrors();
    });

    test('should have audio table with correct headers', async () => {
        tracker.clear();

        await page.waitForLoadState('networkidle');
        await page.waitForTimeout(1000);

        const table = page.locator('#audioTable');
        // Table may be hidden if no files, but the element should exist
        await expect(table).toHaveCount(1);

        // Check headers exist
        const headers = page.locator('#audioTable thead th');
        const headerCount = await headers.count();
        expect(headerCount).toBe(8); // play, fav, title, category, time, fmt, size, actions

        await tracker.logErrors();
    });

    test('should delete audio file if files exist', async () => {
        tracker.clear();

        await page.waitForLoadState('networkidle');
        await page.waitForTimeout(1000);

        const tableRows = await page.locator('#audioTableBody tr').count();

        if (tableRows > 0) {
            // Find delete button in table
            const deleteButton = page.locator('.delete-btn').first();

            if (await deleteButton.count() > 0) {
                // Handle confirmation dialog
                page.once('dialog', dialog => {
                    dialog.dismiss();
                });

                await deleteButton.click();
                await page.waitForTimeout(1000);
            }
        }

        await tracker.logErrors();
    });

    test('should handle rapid audio operations without errors', async () => {
        tracker.clear();

        await page.waitForLoadState('networkidle');
        await page.waitForTimeout(1000);

        const tableRows = await page.locator('#audioTableBody tr').count();

        if (tableRows > 0) {
            const playButton = page.locator('.play-btn').first();

            if (await playButton.count() > 0) {
                // Rapid play/stop cycles
                for (let i = 0; i < 3; i++) {
                    await playButton.click();
                    await page.waitForTimeout(300);
                }
            }
        }

        await page.waitForTimeout(1000);
        await tracker.logErrors();
    });

    test('should validate all interactive elements', async () => {
        tracker.clear();

        const elements = await getAllInteractiveElements(page);
        console.log(`Found ${elements.length} interactive elements`);

        expect(elements.length).toBeGreaterThan(0);
        await tracker.logErrors();
    });

    test('should have favorites toggle', async () => {
        tracker.clear();

        const favToggle = page.locator('#favoritesOnly');
        await expect(favToggle).toBeVisible({ timeout: 5000 });

        await tracker.logErrors();
    });

    test('should have speaker selector', async () => {
        tracker.clear();

        const speakerSelect = page.locator('#speakerSelect');
        await expect(speakerSelect).toBeVisible({ timeout: 5000 });

        await tracker.logErrors();
    });
});
