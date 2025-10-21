import { test, expect } from '@playwright/test';

test.describe('Goblin Management - Full Functionality Test', () => {
    test.beforeEach(async ({ page }) => {
        await page.goto('http://localhost:3000/goblin-management');
        await page.waitForLoadState('networkidle');
        // Wait for Goblin cards to load
        await page.waitForSelector('.goblin-card', { timeout: 10000 });
    });

    test('should display all three Goblins as online', async ({ page }) => {
        // Check that all three Goblin cards are present
        const goblinCards = await page.locator('.goblin-card').count();
        expect(goblinCards).toBe(3);

        // Check that all Goblins show as online
        const onlineBadges = await page.locator('.badge.bg-success:has-text("Online")').count();
        expect(onlineBadges).toBe(3);

        // Verify Goblin names
        await expect(page.locator('.goblin-card:has-text("Goblin One")')).toBeVisible();
        await expect(page.locator('.goblin-card:has-text("Goblin Two")')).toBeVisible();
        await expect(page.locator('.goblin-card:has-text("Goblin Three")')).toBeVisible();
    });

    test('should open video queue modal and display videos', async ({ page }) => {
        // Double-click on Goblin One card to open queue modal
        await page.locator('.goblin-card:has-text("Goblin One")').dblclick();

        // Wait for modal to open
        await page.waitForSelector('#videoQueueModal.show', { timeout: 5000 });

        // Check that modal title is correct
        await expect(page.locator('#videoQueueModal .modal-title')).toContainText('Goblin One');

        // Check that available videos are loaded
        const videoItems = await page.locator('#availableVideos .list-group-item').count();
        expect(videoItems).toBeGreaterThan(0);

        // Verify first video is displayed
        await expect(page.locator('#availableVideos .list-group-item').first()).toBeVisible();
    });

    test('should add video to queue', async ({ page }) => {
        // Open queue modal for Goblin One
        await page.locator('.goblin-card:has-text("Goblin One")').dblclick();
        await page.waitForSelector('#videoQueueModal.show', { timeout: 5000 });

        // Clear queue first
        const clearBtn = page.locator('button:has-text("Clear Queue")');
        if (await clearBtn.isVisible()) {
            await clearBtn.click();
            await page.waitForTimeout(1000);
        }

        // Get initial queue count
        const initialQueueCount = await page.locator('#currentQueue .list-group-item').count();

        // Click "Add to Queue" on first available video
        await page.locator('#availableVideos .list-group-item').first().click();
        await page.locator('button:has-text("Add to Queue")').click();

        // Wait for queue to update
        await page.waitForTimeout(1000);

        // Verify queue count increased
        const newQueueCount = await page.locator('#currentQueue .list-group-item').count();
        expect(newQueueCount).toBe(initialQueueCount + 1);
    });

    test('should start and stop queue playback', async ({ page }) => {
        // Open queue modal for Goblin One
        await page.locator('.goblin-card:has-text("Goblin One")').dblclick();
        await page.waitForSelector('#videoQueueModal.show', { timeout: 5000 });

        // Add a video to queue if empty
        const queueCount = await page.locator('#currentQueue .list-group-item').count();
        if (queueCount === 0) {
            await page.locator('#availableVideos .list-group-item').first().click();
            await page.locator('button:has-text("Add to Queue")').click();
            await page.waitForTimeout(1000);
        }

        // Start playback
        await page.locator('button:has-text("Start Queue")').click();
        await page.waitForTimeout(2000);

        // Verify playback started (check for "Stop Queue" button)
        await expect(page.locator('button:has-text("Stop Queue")')).toBeVisible();

        // Stop playback
        await page.locator('button:has-text("Stop Queue")').click();
        await page.waitForTimeout(1000);

        // Verify playback stopped (check for "Start Queue" button)
        await expect(page.locator('button:has-text("Start Queue")')).toBeVisible();
    });

    test('should clear queue', async ({ page }) => {
        // Open queue modal for Goblin One
        await page.locator('.goblin-card:has-text("Goblin One")').dblclick();
        await page.waitForSelector('#videoQueueModal.show', { timeout: 5000 });

        // Add videos to queue
        await page.locator('#availableVideos .list-group-item').first().click();
        await page.locator('button:has-text("Add to Queue")').click();
        await page.waitForTimeout(500);
        await page.locator('#availableVideos .list-group-item').nth(1).click();
        await page.locator('button:has-text("Add to Queue")').click();
        await page.waitForTimeout(1000);

        // Verify queue has videos
        let queueCount = await page.locator('#currentQueue .list-group-item').count();
        expect(queueCount).toBeGreaterThan(0);

        // Clear queue
        await page.locator('button:has-text("Clear Queue")').click();
        await page.waitForTimeout(1000);

        // Verify queue is empty
        queueCount = await page.locator('#currentQueue .list-group-item').count();
        expect(queueCount).toBe(0);
    });

    test('should save and load playlist', async ({ page }) => {
        const playlistName = 'Test-' + Date.now();

        // Open queue modal for Goblin One
        await page.locator('.goblin-card:has-text("Goblin One")').dblclick();
        await page.waitForSelector('#videoQueueModal.show', { timeout: 5000 });

        // Clear queue and add videos
        const clearBtn = page.locator('button:has-text("Clear Queue")');
        if (await clearBtn.isVisible()) {
            await clearBtn.click();
            await page.waitForTimeout(1000);
        }

        await page.locator('#availableVideos .list-group-item').first().click();
        await page.locator('button:has-text("Add to Queue")').click();
        await page.waitForTimeout(500);
        await page.locator('#availableVideos .list-group-item').nth(1).click();
        await page.locator('button:has-text("Add to Queue")').click();
        await page.waitForTimeout(1000);

        // Save playlist
        await page.locator('button:has-text("Save Playlist")').click();
        await page.waitForSelector('#playlistNameInput', { timeout: 2000 });
        await page.fill('#playlistNameInput', playlistName);
        await page.locator('#savePlaylistModal button:has-text("Save")').click();
        await page.waitForTimeout(1000);

        // Clear queue
        await page.locator('button:has-text("Clear Queue")').click();
        await page.waitForTimeout(1000);

        // Load playlist
        await page.locator('button:has-text("Load Playlist")').click();
        await page.waitForSelector('#playlistSelect', { timeout: 2000 });
        await page.selectOption('#playlistSelect', playlistName);
        await page.locator('#loadPlaylistModal button:has-text("Load")').click();
        await page.waitForTimeout(1000);

        // Verify queue has 2 videos
        const queueCount = await page.locator('#currentQueue .list-group-item').count();
        expect(queueCount).toBe(2);
    });

    test('should distribute playlist to all Goblins', async ({ page }) => {
        const playlistName = 'Fire'; // Use existing Fire playlist

        // Open queue modal for Goblin One
        await page.locator('.goblin-card:has-text("Goblin One")').dblclick();
        await page.waitForSelector('#videoQueueModal.show', { timeout: 5000 });

        // Load Fire playlist
        await page.locator('button:has-text("Load Playlist")').click();
        await page.waitForSelector('#playlistSelect', { timeout: 2000 });
        await page.selectOption('#playlistSelect', playlistName);
        await page.locator('#loadPlaylistModal button:has-text("Load")').click();
        await page.waitForTimeout(1000);

        // Distribute to all Goblins
        await page.locator('button:has-text("Distribute to All")').click();
        await page.waitForTimeout(3000);

        // Close modal
        await page.locator('#videoQueueModal .btn-close').click();
        await page.waitForTimeout(500);

        // Verify all Goblins have the playlist
        // Open Goblin Two queue
        await page.locator('.goblin-card:has-text("Goblin Two")').dblclick();
        await page.waitForSelector('#videoQueueModal.show', { timeout: 5000 });

        let queueCount = await page.locator('#currentQueue .list-group-item').count();
        expect(queueCount).toBeGreaterThan(0);

        await page.locator('#videoQueueModal .btn-close').click();
        await page.waitForTimeout(500);

        // Open Goblin Three queue
        await page.locator('.goblin-card:has-text("Goblin Three")').dblclick();
        await page.waitForSelector('#videoQueueModal.show', { timeout: 5000 });

        queueCount = await page.locator('#currentQueue .list-group-item').count();
        expect(queueCount).toBeGreaterThan(0);
    });

    test('should filter available videos by search', async ({ page }) => {
        // Open queue modal for Goblin One
        await page.locator('.goblin-card:has-text("Goblin One")').dblclick();
        await page.waitForSelector('#videoQueueModal.show', { timeout: 5000 });

        // Get initial video count
        const initialCount = await page.locator('#availableVideos .list-group-item').count();

        // Search for specific video
        await page.fill('#videoSearch', '541');
        await page.waitForTimeout(500);

        // Verify filtered count is less than initial
        const filteredCount = await page.locator('#availableVideos .list-group-item').count();
        expect(filteredCount).toBeLessThan(initialCount);
        expect(filteredCount).toBeGreaterThan(0);

        // Clear search
        await page.fill('#videoSearch', '');
        await page.waitForTimeout(500);

        // Verify count is back to initial
        const finalCount = await page.locator('#availableVideos .list-group-item').count();
        expect(finalCount).toBe(initialCount);
    });

    test('should display playback status', async ({ page }) => {
        // Open queue modal for Goblin One
        await page.locator('.goblin-card:has-text("Goblin One")').dblclick();
        await page.waitForSelector('#videoQueueModal.show', { timeout: 5000 });

        // Check that playback status section exists
        await expect(page.locator('#playbackStatus')).toBeVisible();

        // Verify status elements are present
        await expect(page.locator('#currentlyPlaying')).toBeVisible();
    });
});

