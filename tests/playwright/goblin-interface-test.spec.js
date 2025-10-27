import { test, expect } from '@playwright/test';

test.describe('Goblin Management Interface - Full Integration Test', () => {
    test.beforeEach(async ({ page }) => {
    await page.goto('/goblin-management');
        await page.waitForLoadState('networkidle');
    });

    test('should test Goblin1 - play video and verify playback', async ({ page }) => {
        console.log('Testing Goblin1 (192.168.8.40)...');
        
        // Double-click Goblin1 card
        await page.locator('.goblin-card').filter({ hasText: 'Goblin One' }).dblclick();
        
        // Wait for modal to open
        await page.waitForSelector('#videoQueueModal.show', { timeout: 5000 });
        
        // Wait for videos to load
        await page.waitForSelector('.video-item', { timeout: 10000 });
        
        // Verify modal title
        const modalTitle = await page.locator('#videoQueueModalLabel').textContent();
        expect(modalTitle).toContain('Goblin One');
        
        // Count available videos
        const videoCount = await page.locator('.video-item').count();
        console.log(`Goblin1: Found ${videoCount} videos`);
        expect(videoCount).toBeGreaterThan(0);
        
        // Find a test video and play it
        const firstVideo = page.locator('.video-item').first();
        const videoName = await firstVideo.locator('.video-filename').textContent();
        console.log(`Goblin1: Playing video: ${videoName}`);
        
        // Click Play button
        await firstVideo.locator('button:has-text("Play")').click();
        
        // Wait for success message
        await page.waitForSelector('.alert-success', { timeout: 5000 });
        
        // Verify playback status updates
        await page.waitForTimeout(3000); // Wait for status to update
        const playbackStatus = await page.locator('#playbackStatus').textContent();
        console.log(`Goblin1: Playback status: ${playbackStatus}`);
        expect(playbackStatus).toContain('Playing');
        
        // Stop playback
        await page.locator('button:has-text("Stop Queue")').click();
        await page.waitForTimeout(2000);
        
        // Close modal
        await page.locator('#videoQueueModal .btn-close').click();
        await page.waitForTimeout(1000);
        
        console.log('Goblin1: Test completed successfully ✓');
    });

    test('should test Goblin2 - add to queue and start playback', async ({ page }) => {
        console.log('Testing Goblin2 (192.168.8.106)...');
        
        // Double-click Goblin2 card
        await page.locator('.goblin-card').filter({ hasText: 'Goblin Two' }).dblclick();
        
        // Wait for modal to open
        await page.waitForSelector('#videoQueueModal.show', { timeout: 5000 });
        
        // Wait for videos to load
        await page.waitForSelector('.video-item', { timeout: 10000 });
        
        // Verify modal title
        const modalTitle = await page.locator('#videoQueueModalLabel').textContent();
        expect(modalTitle).toContain('Goblin Two');
        
        // Add first 3 videos to queue
        const videos = page.locator('.video-item');
        for (let i = 0; i < 3; i++) {
            const video = videos.nth(i);
            const videoName = await video.locator('.video-filename').textContent();
            console.log(`Goblin2: Adding to queue: ${videoName}`);
            await video.locator('button:has-text("Add")').click();
            await page.waitForTimeout(500);
        }
        
        // Verify queue has 3 videos
        await page.waitForTimeout(1000);
        const queueItems = await page.locator('#currentQueue .list-group-item').count();
        console.log(`Goblin2: Queue has ${queueItems} videos`);
        expect(queueItems).toBe(3);
        
        // Start queue playback
        console.log('Goblin2: Starting queue playback...');
        await page.locator('button:has-text("Start Queue")').click();
        
        // Wait for playback to start
        await page.waitForTimeout(3000);
        const playbackStatus = await page.locator('#playbackStatus').textContent();
        console.log(`Goblin2: Playback status: ${playbackStatus}`);
        
        // Stop and clear queue
        await page.locator('button:has-text("Stop Queue")').click();
        await page.waitForTimeout(1000);
        
        page.on('dialog', dialog => dialog.accept());
        await page.locator('button:has-text("Clear Queue")').click();
        await page.waitForTimeout(1000);
        
        // Close modal
        await page.locator('#videoQueueModal .btn-close').click();
        await page.waitForTimeout(1000);
        
        console.log('Goblin2: Test completed successfully ✓');
    });

    test('should test Goblin3 - search and play specific video', async ({ page }) => {
        console.log('Testing Goblin3 (192.168.8.14)...');
        
        // Double-click Goblin3 card
        await page.locator('.goblin-card').filter({ hasText: 'Goblin Three' }).dblclick();
        
        // Wait for modal to open
        await page.waitForSelector('#videoQueueModal.show', { timeout: 5000 });
        
        // Wait for videos to load
        await page.waitForSelector('.video-item', { timeout: 10000 });
        
        // Verify modal title
        const modalTitle = await page.locator('#videoQueueModalLabel').textContent();
        expect(modalTitle).toContain('Goblin Three');
        
        // Use search to filter videos
        console.log('Goblin3: Searching for videos...');
        await page.locator('#videoSearch').fill('5');
        await page.waitForTimeout(500);
        
        // Count filtered videos
        const filteredCount = await page.locator('.video-item:visible').count();
        console.log(`Goblin3: Found ${filteredCount} videos matching search`);
        
        // Play first filtered video
        const firstVideo = page.locator('.video-item:visible').first();
        const videoName = await firstVideo.locator('.video-filename').textContent();
        console.log(`Goblin3: Playing video: ${videoName}`);
        
        await firstVideo.locator('button:has-text("Play")').click();
        
        // Wait for playback
        await page.waitForTimeout(3000);
        const playbackStatus = await page.locator('#playbackStatus').textContent();
        console.log(`Goblin3: Playback status: ${playbackStatus}`);
        
        // Stop playback
        await page.locator('button:has-text("Stop Queue")').click();
        await page.waitForTimeout(1000);
        
        // Clear search
        await page.locator('#videoSearch').clear();
        
        // Close modal
        await page.locator('#videoQueueModal .btn-close').click();
        await page.waitForTimeout(1000);
        
        console.log('Goblin3: Test completed successfully ✓');
    });

    test('should create Spinster playlist on Goblin1', async ({ page }) => {
        console.log('Creating Spinster playlist...');
        
        // Open Goblin1 modal
        await page.locator('.goblin-card').filter({ hasText: 'Goblin One' }).dblclick();
        await page.waitForSelector('#videoQueueModal.show', { timeout: 5000 });
        await page.waitForSelector('.video-item', { timeout: 10000 });
        
        // Search for Spinster videos
        await page.locator('#videoSearch').fill('Spinster');
        await page.waitForTimeout(500);
        
        // Add all Spinster videos to queue
        const spinsterVideos = page.locator('.video-item:visible');
        const count = await spinsterVideos.count();
        console.log(`Found ${count} Spinster videos`);
        
        for (let i = 0; i < count; i++) {
            const video = spinsterVideos.nth(i);
            const videoName = await video.locator('.video-filename').textContent();
            console.log(`Adding: ${videoName}`);
            await video.locator('button:has-text("Add")').click();
            await page.waitForTimeout(300);
        }
        
        // Save playlist
        await page.locator('button:has-text("Save Playlist")').click();
        await page.waitForSelector('#playlistNameInput', { timeout: 2000 });
        await page.locator('#playlistNameInput').fill('Spinster');
        await page.locator('#savePlaylistModal button:has-text("Save")').click();
        
        await page.waitForTimeout(1000);
        console.log('Spinster playlist created ✓');
        
        // Close modal
        await page.locator('#videoQueueModal .btn-close').click();
    });

    test('should create Fire playlist on Goblin2', async ({ page }) => {
        console.log('Creating Fire playlist...');
        
        // Open Goblin2 modal
        await page.locator('.goblin-card').filter({ hasText: 'Goblin Two' }).dblclick();
        await page.waitForSelector('#videoQueueModal.show', { timeout: 5000 });
        await page.waitForSelector('.video-item', { timeout: 10000 });
        
        // Search for Fire videos (5XX prefix)
        await page.locator('#videoSearch').fill('5');
        await page.waitForTimeout(500);
        
        // Add Fire videos to queue
        const fireVideos = page.locator('.video-item:visible');
        const count = await fireVideos.count();
        console.log(`Found ${count} Fire videos`);
        
        for (let i = 0; i < Math.min(count, 20); i++) { // Limit to 20 videos
            const video = fireVideos.nth(i);
            const videoName = await video.locator('.video-filename').textContent();
            console.log(`Adding: ${videoName}`);
            await video.locator('button:has-text("Add")').click();
            await page.waitForTimeout(300);
        }
        
        // Save playlist
        await page.locator('button:has-text("Save Playlist")').click();
        await page.waitForSelector('#playlistNameInput', { timeout: 2000 });
        await page.locator('#playlistNameInput').fill('Fire');
        await page.locator('#savePlaylistModal button:has-text("Save")').click();
        
        await page.waitForTimeout(1000);
        console.log('Fire playlist created ✓');
        
        // Close modal
        await page.locator('#videoQueueModal .btn-close').click();
    });

    test('should create Poltergeist playlist on Goblin3', async ({ page }) => {
        console.log('Creating Poltergeist playlist...');
        
        // Open Goblin3 modal
        await page.locator('.goblin-card').filter({ hasText: 'Goblin Three' }).dblclick();
        await page.waitForSelector('#videoQueueModal.show', { timeout: 5000 });
        await page.waitForSelector('.video-item', { timeout: 10000 });
        
        // Search for Poltergeist videos
        await page.locator('#videoSearch').fill('Poltergeist');
        await page.waitForTimeout(500);
        
        // Add all Poltergeist videos to queue
        const poltergeistVideos = page.locator('.video-item:visible');
        const count = await poltergeistVideos.count();
        console.log(`Found ${count} Poltergeist videos`);
        
        for (let i = 0; i < count; i++) {
            const video = poltergeistVideos.nth(i);
            const videoName = await video.locator('.video-filename').textContent();
            console.log(`Adding: ${videoName}`);
            await video.locator('button:has-text("Add")').click();
            await page.waitForTimeout(300);
        }
        
        // Save playlist
        await page.locator('button:has-text("Save Playlist")').click();
        await page.waitForSelector('#playlistNameInput', { timeout: 2000 });
        await page.locator('#playlistNameInput').fill('Poltergeist');
        await page.locator('#savePlaylistModal button:has-text("Save")').click();
        
        await page.waitForTimeout(1000);
        console.log('Poltergeist playlist created ✓');
        
        // Close modal
        await page.locator('#videoQueueModal .btn-close').click();
    });
});

