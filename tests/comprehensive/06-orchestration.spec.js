/**
 * Comprehensive Orchestration Tests
 * Tests multi-animatronic control, broadcasting, and coordination
 */

import { test, expect } from '@playwright/test';

test.describe('Orchestration System', () => {
    test('should load orchestration page', async ({ page }) => {
        await page.goto('/orchestration');
        await expect(page.locator('h1, h2')).toContainText(/Orchestration/i);
    });

    test('should get all animatronics status', async ({ request }) => {
        const response = await request.get('/api/orchestration/status');
        expect(response.ok()).toBeTruthy();
        
        const data = await response.json();
        expect(data.success).toBeTruthy();
        expect(Array.isArray(data.animatronics)).toBeTruthy();
        expect(data.animatronics.length).toBeGreaterThan(0);
    });

    test('should have at least one animatronic (Orlok) online', async ({ request }) => {
        const response = await request.get('/api/orchestration/status');
        const data = await response.json();
        
        const onlineCount = data.animatronics.filter(a => a.online).length;
        expect(onlineCount).toBeGreaterThanOrEqual(1);
    });

    test('should broadcast say command to all animatronics', async ({ request }) => {
        const response = await request.post('/api/orchestration/say-all', {
            data: {
                text: 'Comprehensive test broadcast message'
            }
        });
        
        expect(response.ok()).toBeTruthy();
        const data = await response.json();
        expect(data.success).toBeTruthy();
    });

    test('should get goblin status', async ({ request }) => {
        const response = await request.get('/goblin-management/api/goblins');
        expect(response.ok()).toBeTruthy();
        
        const data = await response.json();
        expect(data.success).toBeTruthy();
        expect(Array.isArray(data.goblins)).toBeTruthy();
    });

    test('should start all queue loops', async ({ request }) => {
        const response = await request.post('/api/orchestration/start-all-queue-loops', {
            data: {}
        });
        
        expect(response.ok()).toBeTruthy();
        const data = await response.json();
        expect(data.success).toBeTruthy();
    });

    test('should get auto AI status for all animatronics', async ({ request }) => {
        const response = await request.get('/api/orchestration/auto-ai/status');
        expect(response.ok()).toBeTruthy();
        
        const data = await response.json();
        expect(data.success).toBeTruthy();
        expect(data.animatronics).toBeDefined();
    });

    test('should navigate to goblin management', async ({ page }) => {
        await page.goto('/goblin-management');
        await expect(page.locator('h1, h2')).toContainText(/Goblin/i);
    });
});

test.describe('Multi-Animatronic Coordination', () => {
    test('should enable random poses on all animatronics', async ({ request }) => {
        const response = await request.post('/api/orchestration/enable-random-poses', {
            data: {
                cooldownMs: 15000,
                minAmplitude: 0.3,
                maxAmplitude: 0.7
            }
        });
        
        expect(response.ok()).toBeTruthy();
        const data = await response.json();
        expect(data.success).toBeTruthy();
    });

    test('should disable random poses on all animatronics', async ({ request }) => {
        const response = await request.post('/api/orchestration/disable-random-poses');
        expect(response.ok()).toBeTruthy();
        
        const data = await response.json();
        expect(data.success).toBeTruthy();
    });

    test('should get individual animatronic webcam URL', async ({ request }) => {
        // Get animatronics list
        const statusResponse = await request.get('/api/orchestration/status');
        const statusData = await statusResponse.json();
        
        if (statusData.animatronics && statusData.animatronics.length > 0) {
            const animatronic = statusData.animatronics[0];
            
            const response = await request.get(`/api/orchestration/animatronic/${animatronic.id}/webcam-url`);
            expect(response.ok()).toBeTruthy();
            
            const data = await response.json();
            expect(data.success).toBeTruthy();
        }
    });

    test('should get individual animatronic audio files', async ({ request }) => {
        const statusResponse = await request.get('/api/orchestration/status');
        const statusData = await statusResponse.json();
        
        if (statusData.animatronics && statusData.animatronics.length > 0) {
            const animatronic = statusData.animatronics[0];
            
            const response = await request.get(`/api/orchestration/animatronic/${animatronic.id}/audio-files`);
            expect(response.ok()).toBeTruthy();
            
            const data = await response.json();
            expect(data.success).toBeTruthy();
        }
    });
});
