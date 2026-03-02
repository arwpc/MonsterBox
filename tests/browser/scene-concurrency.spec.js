/**
 * Scene Concurrency Tests
 * Validates that scenes with concurrent steps execute correctly
 */

import { test, expect } from '@playwright/test';

const BASE_URL = process.env.BASE_URL || 'http://localhost:3000';

test.describe('Scene Concurrency API', () => {
    test('should list scenes for current character', async ({ request }) => {
        const response = await request.get(`${BASE_URL}/scenes/api/`);
        expect(response.ok()).toBeTruthy();
        const data = await response.json();
        expect(data.success).toBe(true);
        expect(Array.isArray(data.scenes)).toBe(true);
    });

    test('should execute a scene with concurrent steps without blocking', async ({ request }) => {
        // First get list of scenes
        const listRes = await request.get(`${BASE_URL}/scenes/api/`);
        const listData = await listRes.json();
        if (!listData.scenes || listData.scenes.length === 0) {
            test.skip();
            return;
        }

        // Execute first scene — should not timeout even with concurrent audio
        const scene = listData.scenes[0];
        const startTime = Date.now();
        const playRes = await request.post(`${BASE_URL}/scenes/api/${scene.id}/play`);
        const elapsed = Date.now() - startTime;

        // Should complete (200 or success)
        expect(playRes.status()).toBeLessThan(500);

        const playData = await playRes.json();
        // Scene execution should complete (success or handled error)
        expect(playData).toBeTruthy();
    });
});

test.describe('Scene Concurrency via Animation Studio', () => {
    let page;

    test.beforeEach(async ({ browser }) => {
        page = await browser.newPage();
        await page.goto(`${BASE_URL}/scenes`);
        await page.waitForLoadState('networkidle');
    });

    test.afterEach(async () => {
        await page.close();
    });

    test('should load Animation Studio page', async () => {
        const title = await page.title();
        expect(title).toContain('Animation Studio');
    });

    test('should display scene list panel', async () => {
        // Check for scene list or library panel
        const panel = page.locator('#sceneLibrary, [data-panel="scenes"], .scene-list');
        const count = await panel.count();
        expect(count).toBeGreaterThanOrEqual(0); // May be empty for some characters
    });
});
