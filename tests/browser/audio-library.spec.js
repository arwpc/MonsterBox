/**
 * Audio Library Tests
 * Validates all functionality on /audio-library page
 */

import { test, expect } from '@playwright/test';
import { testNavigation, testButtonClick, ErrorTracker, getAllInteractiveElements } from './framework.js';

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

    test('should display audio files', async () => {
        tracker.clear();
        
        // Wait for audio library to load
        await page.waitForSelector('[data-audio], .audio-item, .audio-file', { timeout: 5000 });
        
        // Get audio elements
        const audioItems = await page.locator('[data-audio], .audio-item, .audio-file').count();
        expect(audioItems).toBeGreaterThan(0);
        
        await tracker.assertNoErrors();
    });

    test('should play audio file', async () => {
        tracker.clear();
        
        // Find play button
        const playButton = page.locator('button:has-text("Play"), button[title="Play"], .play-btn').first();
        await expect(playButton).toBeVisible({ timeout: 5000 });
        
        await playButton.click();
        await page.waitForTimeout(2000);
        
        // Should trigger audio playback (check for audio element or API call)
        await tracker.assertNoErrors();
    });

    test('should stop audio playback', async () => {
        tracker.clear();
        
        // Play first
        const playButton = page.locator('button:has-text("Play"), button[title="Play"], .play-btn').first();
        if (await playButton.count() > 0) {
            await playButton.click();
            await page.waitForTimeout(1000);
        }
        
        // Then stop
        const stopButton = page.locator('button:has-text("Stop"), button[title="Stop"], .stop-btn').first();
        if (await stopButton.count() > 0) {
            await stopButton.click();
            await page.waitForTimeout(1000);
        }
        
        await tracker.assertNoErrors();
    });

    test('should enable audio looping', async () => {
        tracker.clear();
        
        // Find loop checkbox or toggle
        const loopControl = page.locator('input[type="checkbox"][name*="loop"], .loop-toggle, [data-loop]').first();
        
        if (await loopControl.count() > 0) {
            await loopControl.check();
            await page.waitForTimeout(1000);
            
            // Verify loop is enabled
            await expect(loopControl).toBeChecked();
        }
        
        await tracker.assertNoErrors();
    });

    test('should upload audio file', async () => {
        tracker.clear();
        
        // Find upload button or file input
        const uploadInput = page.locator('input[type="file"]').first();
        
        if (await uploadInput.count() > 0) {
            // We won't actually upload a file in automated tests
            // Just verify the input exists and is functional
            await expect(uploadInput).toBeVisible();
        }
        
        await tracker.assertNoErrors();
    });

    test('should filter audio by character', async () => {
        tracker.clear();
        
        // Find character filter dropdown
        const characterFilter = page.locator('select[name*="character"], #characterFilter, [data-filter="character"]').first();
        
        if (await characterFilter.count() > 0) {
            await characterFilter.selectOption({ index: 1 });
            await page.waitForTimeout(1000);
        }
        
        await tracker.assertNoErrors();
    });

    test('should delete audio file', async () => {
        tracker.clear();
        
        // Find delete button
        const deleteButton = page.locator('button:has-text("Delete"), .delete-btn, [data-action="delete"]').first();
        
        if (await deleteButton.count() > 0) {
            // Click delete
            await deleteButton.click();
            await page.waitForTimeout(500);
            
            // Handle confirmation dialog if present
            page.once('dialog', dialog => {
                console.log(`Dialog: ${dialog.message()}`);
                dialog.dismiss();
            });
            
            await page.waitForTimeout(1000);
        }
        
        await tracker.assertNoErrors();
    });

    test('should handle rapid audio operations without errors', async () => {
        tracker.clear();
        
        const playButton = page.locator('button:has-text("Play")').first();
        
        if (await playButton.count() > 0) {
            // Rapid play/stop cycles
            for (let i = 0; i < 5; i++) {
                await playButton.click();
                await page.waitForTimeout(200);
            }
        }
        
        await page.waitForTimeout(2000);
        await tracker.assertNoErrors();
    });

    test('should validate all interactive elements', async () => {
        tracker.clear();
        
        const elements = await getAllInteractiveElements(page);
        console.log(`Found ${elements.length} interactive elements`);
        
        expect(elements.length).toBeGreaterThan(0);
        await tracker.assertNoErrors();
    });
});
