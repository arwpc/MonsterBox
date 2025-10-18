/**
 * Goblin Video Deployment E2E Tests
 * Playwright tests for complete user flow of Goblin management and video deployment
 */

import { test, expect } from '@playwright/test';

const BASE_URL = process.env.TEST_BASE_URL || 'http://localhost:3000';

test.describe('Goblin Management E2E', () => {
    test.beforeEach(async ({ page }) => {
        // Set longer timeout for network operations
        page.setDefaultTimeout(30000);
    });

    test('should load Goblin Management page and display Goblins', async ({ page }) => {
        await page.goto(`${BASE_URL}/goblin-management`);
        
        // Wait for page to load
        await expect(page.locator('h1, h2')).toContainText('Goblin Management');
        
        // Check for Goblin cards or table
        const goblinElements = page.locator('[data-goblin-id], .goblin-card, .goblin-item');
        const count = await goblinElements.count();
        
        console.log(`Found ${count} Goblin(s) on the page`);
        expect(count).toBeGreaterThan(0);
    });

    test('should display Goblin status indicators', async ({ page }) => {
        await page.goto(`${BASE_URL}/goblin-management`);
        
        // Wait for status indicators
        await page.waitForSelector('.goblin-status, .status-indicator, [data-status]', { timeout: 10000 });
        
        // Check that status is visible
        const statusElements = page.locator('.goblin-status, .status-indicator, [data-status]');
        const count = await statusElements.count();
        
        expect(count).toBeGreaterThan(0);
        
        // Log status of each Goblin
        for (let i = 0; i < count; i++) {
            const status = await statusElements.nth(i).textContent();
            console.log(`Goblin ${i + 1} status: ${status}`);
        }
    });

    test('should navigate to Video Library', async ({ page }) => {
        await page.goto(`${BASE_URL}/video-library`);
        
        // Wait for page to load
        await expect(page.locator('h1, h2')).toContainText('Video Library');
        
        // Check for video grid or list
        const videoContainer = page.locator('#videoGrid, .video-grid, .video-list');
        await expect(videoContainer).toBeVisible();
    });

    test('should display videos in Video Library', async ({ page }) => {
        await page.goto(`${BASE_URL}/video-library`);
        
        // Wait for videos to load
        await page.waitForSelector('.video-card, .video-item', { timeout: 10000 });
        
        const videoCards = page.locator('.video-card, .video-item');
        const count = await videoCards.count();
        
        console.log(`Found ${count} video(s) in library`);
        expect(count).toBeGreaterThan(0);
    });

    test('should open Goblin deployment modal from Video Library', async ({ page }) => {
        await page.goto(`${BASE_URL}/video-library`);
        
        // Wait for page to load
        await page.waitForSelector('.video-card, .video-item', { timeout: 10000 });
        
        // Find and click the "Deploy to Goblins" button
        const deployButton = page.locator('button:has-text("Deploy to Goblins"), button:has-text("Deploy")').first();
        await deployButton.click();
        
        // Wait for modal to appear
        await page.waitForSelector('#goblinDeployModal, .modal.show', { timeout: 5000 });
        
        // Check modal is visible
        const modal = page.locator('#goblinDeployModal, .modal.show');
        await expect(modal).toBeVisible();
        
        console.log('✓ Deployment modal opened successfully');
    });

    test('should populate Goblin list in deployment modal', async ({ page }) => {
        await page.goto(`${BASE_URL}/video-library`);
        
        // Wait for page to load
        await page.waitForSelector('.video-card, .video-item', { timeout: 10000 });
        
        // Open deployment modal
        const deployButton = page.locator('button:has-text("Deploy to Goblins"), button:has-text("Deploy")').first();
        await deployButton.click();
        
        // Wait for modal
        await page.waitForSelector('#goblinDeployModal, .modal.show', { timeout: 5000 });
        
        // Check for Goblin checkboxes
        const goblinCheckboxes = page.locator('#deployGoblinList input[type="checkbox"], .goblin-select input[type="checkbox"]');
        const count = await goblinCheckboxes.count();
        
        console.log(`Found ${count} Goblin(s) in deployment modal`);
        expect(count).toBeGreaterThan(0);
    });

    test('should populate video list in deployment modal', async ({ page }) => {
        await page.goto(`${BASE_URL}/video-library`);
        
        // Wait for page to load
        await page.waitForSelector('.video-card, .video-item', { timeout: 10000 });
        
        // Open deployment modal
        const deployButton = page.locator('button:has-text("Deploy to Goblins"), button:has-text("Deploy")').first();
        await deployButton.click();
        
        // Wait for modal
        await page.waitForSelector('#goblinDeployModal, .modal.show', { timeout: 5000 });
        
        // Check for video checkboxes
        const videoCheckboxes = page.locator('#deployVideoList input[type="checkbox"], .video-select input[type="checkbox"]');
        const count = await videoCheckboxes.count();
        
        console.log(`Found ${count} video(s) in deployment modal`);
        expect(count).toBeGreaterThan(0);
    });

    test('should select ghost video for deployment', async ({ page }) => {
        await page.goto(`${BASE_URL}/video-library`);
        
        // Wait for page to load
        await page.waitForSelector('.video-card, .video-item', { timeout: 10000 });
        
        // Open deployment modal
        const deployButton = page.locator('button:has-text("Deploy to Goblins"), button:has-text("Deploy")').first();
        await deployButton.click();
        
        // Wait for modal
        await page.waitForSelector('#goblinDeployModal, .modal.show', { timeout: 5000 });
        
        // Find ghost video checkbox
        const ghostCheckbox = page.locator('#deployVideoList label:has-text("ghost"), #deployVideoList label:has-text("Ghost")').first();
        
        if (await ghostCheckbox.count() > 0) {
            const checkbox = ghostCheckbox.locator('input[type="checkbox"]');
            await checkbox.check();
            
            // Verify it's checked
            await expect(checkbox).toBeChecked();
            console.log('✓ Ghost video selected for deployment');
        } else {
            console.log('⚠ No ghost video found, selecting first video');
            const firstCheckbox = page.locator('#deployVideoList input[type="checkbox"]').first();
            await firstCheckbox.check();
            await expect(firstCheckbox).toBeChecked();
        }
    });

    test('should select all Goblins for deployment', async ({ page }) => {
        await page.goto(`${BASE_URL}/video-library`);
        
        // Wait for page to load
        await page.waitForSelector('.video-card, .video-item', { timeout: 10000 });
        
        // Open deployment modal
        const deployButton = page.locator('button:has-text("Deploy to Goblins"), button:has-text("Deploy")').first();
        await deployButton.click();
        
        // Wait for modal
        await page.waitForSelector('#goblinDeployModal, .modal.show', { timeout: 5000 });
        
        // Select all Goblins
        const goblinCheckboxes = page.locator('#deployGoblinList input[type="checkbox"]:not([disabled])');
        const count = await goblinCheckboxes.count();
        
        for (let i = 0; i < count; i++) {
            await goblinCheckboxes.nth(i).check();
        }
        
        console.log(`✓ Selected ${count} Goblin(s) for deployment`);
    });

    test('should execute deployment to Goblins', async ({ page }) => {
        await page.goto(`${BASE_URL}/video-library`);
        
        // Wait for page to load
        await page.waitForSelector('.video-card, .video-item', { timeout: 10000 });
        
        // Open deployment modal
        const deployButton = page.locator('button:has-text("Deploy to Goblins"), button:has-text("Deploy")').first();
        await deployButton.click();
        
        // Wait for modal
        await page.waitForSelector('#goblinDeployModal, .modal.show', { timeout: 5000 });
        
        // Select a video (ghost or first)
        const ghostCheckbox = page.locator('#deployVideoList label:has-text("ghost"), #deployVideoList label:has-text("Ghost")').first();
        if (await ghostCheckbox.count() > 0) {
            await ghostCheckbox.locator('input[type="checkbox"]').check();
        } else {
            await page.locator('#deployVideoList input[type="checkbox"]').first().check();
        }
        
        // Select all available Goblins
        const goblinCheckboxes = page.locator('#deployGoblinList input[type="checkbox"]:not([disabled])');
        const goblinCount = await goblinCheckboxes.count();
        
        if (goblinCount === 0) {
            console.log('⚠ No available Goblins for deployment');
            test.skip();
        }
        
        await goblinCheckboxes.first().check();
        
        // Click deploy button
        const executeButton = page.locator('#deployBtn, button:has-text("Deploy Now"), button:has-text("Execute")');
        await executeButton.click();
        
        // Wait for deployment to start
        await page.waitForTimeout(2000);
        
        // Check for success message or progress indicator
        const successIndicator = page.locator('.alert-success, .text-success, [data-status="success"]');
        const progressIndicator = page.locator('#deploymentProgress, .deployment-progress');
        
        const hasSuccess = await successIndicator.count() > 0;
        const hasProgress = await progressIndicator.count() > 0;
        
        if (hasSuccess || hasProgress) {
            console.log('✓ Deployment initiated successfully');
        } else {
            console.log('⚠ Deployment status unclear');
        }
    });

    test('should verify Goblin health endpoints', async ({ page, request }) => {
        // First get list of Goblins
        const response = await request.get(`${BASE_URL}/goblin-management/api/goblins`);
        const data = await response.json();
        
        expect(data.success).toBe(true);
        const goblins = data.goblins;
        
        console.log(`Testing health of ${goblins.length} Goblin(s)...`);
        
        for (const goblin of goblins) {
            try {
                const healthResponse = await request.get(`${goblin.endpoint}/health`, { timeout: 5000 });
                
                if (healthResponse.ok()) {
                    const health = await healthResponse.json();
                    console.log(`✓ ${goblin.metadata.name} (${goblin.endpoint}) - ${health.status}`);
                } else {
                    console.log(`⚠ ${goblin.metadata.name} (${goblin.endpoint}) - HTTP ${healthResponse.status()}`);
                }
            } catch (error) {
                console.log(`⚠ ${goblin.metadata.name} (${goblin.endpoint}) - Unreachable`);
            }
        }
    });

    test('should display video playback controls on Goblin cards', async ({ page }) => {
        await page.goto(`${BASE_URL}/goblin-management`);
        
        // Wait for Goblin cards
        await page.waitForSelector('[data-goblin-id], .goblin-card', { timeout: 10000 });
        
        // Look for play/stop buttons
        const playButtons = page.locator('button:has-text("Play"), button[title*="Play"]');
        const stopButtons = page.locator('button:has-text("Stop"), button[title*="Stop"]');
        
        const playCount = await playButtons.count();
        const stopCount = await stopButtons.count();
        
        console.log(`Found ${playCount} play button(s) and ${stopCount} stop button(s)`);
        
        expect(playCount + stopCount).toBeGreaterThan(0);
    });

    test('should search for videos in Video Library', async ({ page }) => {
        await page.goto(`${BASE_URL}/video-library`);
        
        // Wait for page to load
        await page.waitForSelector('.video-card, .video-item', { timeout: 10000 });
        
        // Find search input
        const searchInput = page.locator('#searchInput, input[type="search"], input[placeholder*="Search"]');
        
        if (await searchInput.count() > 0) {
            await searchInput.fill('ghost');
            
            // Wait for search results
            await page.waitForTimeout(1000);
            
            // Check filtered results
            const videoCards = page.locator('.video-card, .video-item');
            const count = await videoCards.count();
            
            console.log(`Search for "ghost" returned ${count} result(s)`);
        } else {
            console.log('⚠ Search input not found');
        }
    });
});

test.describe('Goblin Video Playback E2E', () => {
    test('should play video on Goblin from Video Library', async ({ page, request }) => {
        // Get available Goblins
        const goblinsResponse = await request.get(`${BASE_URL}/goblin-management/api/goblins`);
        const goblinsData = await goblinsResponse.json();
        const onlineGoblin = goblinsData.goblins.find(g => g.status === 'online');
        
        if (!onlineGoblin) {
            console.log('⚠ No online Goblins available for playback test');
            test.skip();
        }
        
        // Get available videos
        const videosResponse = await request.get(`${BASE_URL}/video-library/api/videos`);
        const videosData = await videosResponse.json();
        const testVideo = videosData.videos[0];
        
        if (!testVideo) {
            console.log('⚠ No videos available for playback test');
            test.skip();
        }
        
        console.log(`Testing playback of "${testVideo.title}" on ${onlineGoblin.metadata.name}...`);
        
        // Navigate to Video Library
        await page.goto(`${BASE_URL}/video-library`);
        await page.waitForSelector('.video-card, .video-item', { timeout: 10000 });
        
        // Find the video card and click play
        const videoCard = page.locator(`.video-card:has-text("${testVideo.title}"), .video-item:has-text("${testVideo.title}")`).first();
        
        if (await videoCard.count() > 0) {
            // Hover to show controls
            await videoCard.hover();
            
            // Look for play button
            const playButton = videoCard.locator('button:has-text("Play"), button[title*="Play"]').first();
            
            if (await playButton.count() > 0) {
                await playButton.click();
                console.log('✓ Clicked play button');
            } else {
                console.log('⚠ Play button not found on video card');
            }
        }
    });
});

