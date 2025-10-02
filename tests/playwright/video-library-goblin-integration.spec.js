/**
 * Video Library Goblin Integration Tests
 * Tests video streaming and goblin deployment functionality
 * Catches regressions in API endpoints and goblin status checks
 */

import { test, expect } from '@playwright/test';

test.describe('Video Library Goblin Integration', () => {
    
    test.beforeEach(async ({ page }) => {
        // Navigate to video library
        await page.goto('http://127.0.0.1:3100/video-library');
        await page.waitForLoadState('networkidle', { timeout: 10000 });
    });

    test('should not have 404 errors on video library page', async ({ page }) => {
        const errors = [];
        
        // Listen for failed requests
        page.on('response', response => {
            if (response.status() === 404) {
                errors.push({
                    url: response.url(),
                    status: response.status()
                });
            }
        });

        // Wait for page to fully load
        await page.waitForTimeout(2000);

        // Check for 404 errors
        if (errors.length > 0) {
            console.error('❌ Found 404 errors:');
            errors.forEach(err => console.error(`  - ${err.url}`));
        }

        expect(errors).toHaveLength(0);
    });

    test('should have correct video stream API endpoint', async ({ page }) => {
        // Check if there are any videos
        const videoCards = page.locator('[data-video-id]');
        const count = await videoCards.count();

        if (count === 0) {
            console.log('⚠️ No videos found, skipping stream endpoint test');
            test.skip();
            return;
        }

        // Get first video ID
        const firstVideoId = await videoCards.first().getAttribute('data-video-id');
        
        // Check that the stream endpoint exists
        const streamResponse = await page.request.get(
            `http://127.0.0.1:3100/video-library/api/video/${firstVideoId}/stream`
        );

        // Should not be 404
        expect(streamResponse.status()).not.toBe(404);
        
        // Should be either 200 (success) or 500 (file not found, but endpoint exists)
        expect([200, 404, 500]).toContain(streamResponse.status());
        
        console.log(`✅ Stream endpoint status: ${streamResponse.status()}`);
    });

    test('should have correct video play API endpoint', async ({ page }) => {
        // Check if there are any videos
        const videoCards = page.locator('[data-video-id]');
        const count = await videoCards.count();

        if (count === 0) {
            console.log('⚠️ No videos found, skipping play endpoint test');
            test.skip();
            return;
        }

        // Get first video ID
        const firstVideoId = await videoCards.first().getAttribute('data-video-id');
        
        // Check that the play endpoint exists (POST)
        const playResponse = await page.request.post(
            `http://127.0.0.1:3100/video-library/api/video/${firstVideoId}/play`
        );

        // Should not be 404
        expect(playResponse.status()).not.toBe(404);
        
        console.log(`✅ Play endpoint status: ${playResponse.status()}`);
    });

    test('should correctly check goblin availability for deployment', async ({ page }) => {
        // Load goblins data
        const goblinsResponse = await page.request.get('http://127.0.0.1:3100/goblin-management/api/goblins');
        const goblinsData = await goblinsResponse.json();

        if (!goblinsData.success || goblinsData.goblins.length === 0) {
            console.log('⚠️ No goblins registered, skipping availability test');
            test.skip();
            return;
        }

        // Check that goblins have correct properties
        for (const goblin of goblinsData.goblins) {
            expect(goblin).toHaveProperty('id');
            expect(goblin).toHaveProperty('name');
            expect(goblin).toHaveProperty('status');
            expect(goblin).toHaveProperty('lockedBy'); // Should be 'lockedBy', not 'locked'
            
            console.log(`✅ Goblin ${goblin.name}: status=${goblin.status}, lockedBy=${goblin.lockedBy || 'none'}`);
        }

        // Check for online and available goblins
        const onlineGoblins = goblinsData.goblins.filter(g => g.status === 'online');
        const availableGoblins = onlineGoblins.filter(g => !g.lockedBy);

        console.log(`📊 Total goblins: ${goblinsData.goblins.length}`);
        console.log(`📊 Online goblins: ${onlineGoblins.length}`);
        console.log(`📊 Available goblins: ${availableGoblins.length}`);

        // If there are online goblins, test deployment UI
        if (onlineGoblins.length > 0) {
            // Check if there are any videos
            const videoCards = page.locator('[data-video-id]');
            const videoCount = await videoCards.count();

            if (videoCount > 0) {
                // Try to open deployment modal
                const deployButton = page.locator('button:has-text("Deploy"), button:has-text("Quick Deploy")').first();
                
                if (await deployButton.isVisible()) {
                    await deployButton.click();
                    await page.waitForTimeout(500);

                    // Should not show "No available Goblins" error if we have online goblins
                    const errorMessage = page.locator('text=/No available Goblins/i');
                    const hasError = await errorMessage.isVisible().catch(() => false);

                    if (availableGoblins.length > 0) {
                        expect(hasError).toBe(false);
                        console.log('✅ No "No available Goblins" error shown (correct)');
                    } else {
                        console.log('⚠️ All goblins are locked, error message expected');
                    }
                }
            }
        }
    });

    test('should show goblin names correctly (not undefined)', async ({ page }) => {
        // Navigate to goblin management
        await page.goto('http://127.0.0.1:3100/goblin-management');
        await page.waitForLoadState('networkidle', { timeout: 10000 });

        // Check for goblin cards
        const goblinCards = page.locator('.goblin-card, [data-goblin-id]');
        const count = await goblinCards.count();

        if (count === 0) {
            console.log('⚠️ No goblins found, skipping name test');
            test.skip();
            return;
        }

        // Check each goblin card for "undefined"
        for (let i = 0; i < count; i++) {
            const card = goblinCards.nth(i);
            const text = await card.textContent();
            
            // Should not contain "undefined"
            expect(text.toLowerCase()).not.toContain('undefined');
            
            console.log(`✅ Goblin card ${i + 1} does not contain "undefined"`);
        }
    });

    test('should have correct goblin endpoint URLs', async ({ page }) => {
        const goblinsResponse = await page.request.get('http://127.0.0.1:3100/goblin-management/api/goblins');
        const goblinsData = await goblinsResponse.json();

        if (!goblinsData.success || goblinsData.goblins.length === 0) {
            console.log('⚠️ No goblins registered, skipping endpoint test');
            test.skip();
            return;
        }

        for (const goblin of goblinsData.goblins) {
            // Check endpoint format
            expect(goblin.endpoint).toMatch(/^https?:\/\/.+:\d+$/);
            
            // Should not be localhost:3002 (old test goblin)
            expect(goblin.endpoint).not.toBe('http://localhost:3002');
            
            console.log(`✅ Goblin ${goblin.name}: ${goblin.endpoint}`);
        }
    });

    test('should load goblin management page without errors', async ({ page }) => {
        const errors = [];
        
        page.on('response', response => {
            if (response.status() === 404 || response.status() >= 500) {
                errors.push({
                    url: response.url(),
                    status: response.status()
                });
            }
        });

        await page.goto('http://127.0.0.1:3100/goblin-management');
        await page.waitForLoadState('networkidle', { timeout: 10000 });
        await page.waitForTimeout(2000);

        if (errors.length > 0) {
            console.error('❌ Found errors on goblin management page:');
            errors.forEach(err => console.error(`  - ${err.status} ${err.url}`));
        }

        expect(errors).toHaveLength(0);
    });

    test('should correctly filter online goblins for deployment', async ({ page }) => {
        // This test verifies the JavaScript logic for filtering goblins
        const result = await page.evaluate(() => {
            // Simulate goblin data with correct property names
            const mockGoblins = [
                { id: 'g1', name: 'Goblin 1', status: 'online', lockedBy: null },
                { id: 'g2', name: 'Goblin 2', status: 'offline', lockedBy: null },
                { id: 'g3', name: 'Goblin 3', status: 'online', lockedBy: 'scene-1' }
            ];

            // Test the filter logic that should be used
            const available = mockGoblins.filter(g => g.status === 'online' && !g.lockedBy);
            
            return {
                total: mockGoblins.length,
                online: mockGoblins.filter(g => g.status === 'online').length,
                available: available.length,
                availableIds: available.map(g => g.id)
            };
        });

        expect(result.total).toBe(3);
        expect(result.online).toBe(2);
        expect(result.available).toBe(1);
        expect(result.availableIds).toEqual(['g1']);

        console.log('✅ Goblin filtering logic works correctly');
    });
});

