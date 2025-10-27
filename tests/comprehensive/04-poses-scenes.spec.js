/**
 * Comprehensive Poses & Scenes Tests
 * Tests pose execution, scene management, and queue systems
 */

import { test, expect } from '@playwright/test';

test.describe('Poses System', () => {
    test('should load poses list', async ({ request }) => {
        const response = await request.get('/poses/api/poses');
        expect(response.ok()).toBeTruthy();
        
        const data = await response.json();
        expect(data.success).toBeTruthy();
        expect(Array.isArray(data.poses)).toBeTruthy();
    });

    test('should navigate to poses page', async ({ page }) => {
        await page.goto('/poses');
        await expect(page.locator('h1, h2')).toContainText(/Poses/i);
    });

    test('should execute a pose', async ({ request }) => {
        // Get available poses
        const posesResponse = await request.get('/poses/api/poses');
        const posesData = await posesResponse.json();
        
        if (posesData.poses && posesData.poses.length > 0) {
            const pose = posesData.poses[0];
            
            // Execute the pose
            const response = await request.post(`/poses/api/poses/${pose.id}/execute`, {
                data: {
                    duration: 1000
                }
            });
            
            expect(response.ok()).toBeTruthy();
            const data = await response.json();
            expect(data.success).toBeTruthy();
        }
    });

    test('should get random pose settings', async ({ request }) => {
        const response = await request.get('/api/random-poses/settings');
        expect(response.ok()).toBeTruthy();
        
        const data = await response.json();
        expect(data.success).toBeTruthy();
        expect(data.enabled).toBeDefined();
    });

    test('should enable random poses', async ({ request }) => {
        const response = await request.post('/api/random-poses/enable', {
            data: {
                cooldownMs: 10000,
                minAmplitude: 0.3,
                maxAmplitude: 0.8
            }
        });
        
        expect(response.ok()).toBeTruthy();
        const data = await response.json();
        expect(data.success).toBeTruthy();
    });

    test('should disable random poses', async ({ request }) => {
        const response = await request.post('/api/random-poses/disable');
        expect(response.ok()).toBeTruthy();
        
        const data = await response.json();
        expect(data.success).toBeTruthy();
    });
});

test.describe('Scenes System', () => {
    test('should load scenes list', async ({ request }) => {
        const response = await request.get('/scenes/api/scenes');
        expect(response.ok()).toBeTruthy();
        
        const data = await response.json();
        expect(data.success).toBeTruthy();
        expect(Array.isArray(data.scenes)).toBeTruthy();
    });

    test('should navigate to scenes page', async ({ page }) => {
        await page.goto('/scenes');
        await expect(page.locator('h1, h2')).toContainText(/Scenes/i);
    });

    test('should get scene queue status', async ({ request }) => {
        const response = await request.get('/scenes/api/queue/status');
        expect(response.ok()).toBeTruthy();
        
        const data = await response.json();
        expect(data.success).toBeTruthy();
        expect(data.status).toBeDefined();
    });

    test('should start scene queue', async ({ request }) => {
        const response = await request.post('/scenes/api/queue/start', {
            data: {}
        });
        
        expect(response.ok()).toBeTruthy();
        const data = await response.json();
        expect(data.success).toBeTruthy();
    });

    test('should stop scene queue', async ({ request }) => {
        const response = await request.post('/scenes/api/queue/stop');
        expect(response.ok()).toBeTruthy();
        
        const data = await response.json();
        expect(data.success).toBeTruthy();
    });

    test('should navigate to scene editor', async ({ page }) => {
        await page.goto('/scenes/editor');
        await expect(page.locator('h1, h2, .page-title')).toBeVisible();
    });
});
