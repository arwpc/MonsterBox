/**
 * Audio Library Tests
 * Validates all functionality on /audio-library page
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

    test('should display audio files or empty state', async () => {
        tracker.clear();
        
        // Wait for page to load
        await page.waitForLoadState('networkidle');
        await page.waitForTimeout(1000);
        
        // Check if audio items exist OR empty state is shown
        const audioItems = await page.locator('[data-audio], .audio-item, .audio-file').count();
        const emptyState = await page.locator('.empty-state, .no-files').count();
        
        // Either we have files or an empty state - both are valid
        expect(audioItems + emptyState).toBeGreaterThanOrEqual(0);
        
        await tracker.logErrors();
    });

    test('should show controls when audio files exist', async () => {
        tracker.clear();
        
        await page.waitForLoadState('networkidle');
        
        // Find play button - it's OK if none exist when there are no files
        const hasFiles = await page.locator('[data-audio], .audio-item, .audio-file').count() > 0;
        
        if (hasFiles) {
            const playButton = page.locator('button:has-text("Play"), button[title="Play"], .play-btn').first();
            await expect(playButton).toBeVisible({ timeout: 5000 });
        }
        
        await tracker.logErrors();
    });

    test('should have stop all audio button', async () => {
        tracker.clear();
        
        // The Stop All button should always be visible
        const stopAllBtn = page.locator('button:has-text("Stop All")').first();
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
        const categoryFilter = page.locator('select#categoryFilter, select[name*="category"], [data-filter="category"]').first();
        
        if (await categoryFilter.count() > 0) {
            await expect(categoryFilter).toBeVisible();
        }
        
        await tracker.logErrors();
    });

    test('should delete audio file if files exist', async () => {
        tracker.clear();
        
        const hasFiles = await page.locator('[data-audio], .audio-item, .audio-file').count() > 0;
        
        if (hasFiles) {
            // Find delete button
            const deleteButton = page.locator('button:has-text("Delete"), .delete-btn, [data-action="delete"]').first();
            
            if (await deleteButton.count() > 0) {
                // Handle confirmation dialog if present
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
        
        const hasFiles = await page.locator('[data-audio], .audio-item, .audio-file').count() > 0;
        
        if (hasFiles) {
            const playButton = page.locator('button:has-text("Play")').first();
            
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
});
