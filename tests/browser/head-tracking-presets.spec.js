/**
 * Head Tracking Presets Tests
 * Validates preset CRUD via API and UI elements on head-animation setup page
 */

import { test, expect } from '@playwright/test';
import { testNavigation } from './framework.js';

const BASE_URL = process.env.BASE_URL || 'http://localhost:3000';

test.describe('Head Tracking Presets API', () => {
    test('should list presets including built-in ones', async ({ request }) => {
        // Use character 1 as test character
        const response = await request.get(`${BASE_URL}/setup/head-animation/api/head-tracking/1/presets`);
        expect(response.ok()).toBeTruthy();
        const data = await response.json();
        expect(data.success).toBe(true);
        expect(Array.isArray(data.presets)).toBe(true);
        // Should have at least 5 built-in presets
        const builtins = data.presets.filter(p => p.builtin);
        expect(builtins.length).toBeGreaterThanOrEqual(5);
        // Should include person-hog, person-hybrid, upperbody, noisy, sensitive
        const ids = builtins.map(p => p.id);
        expect(ids).toContain('person-hog');
        expect(ids).toContain('noisy');
        expect(ids).toContain('sensitive');
    });

    test('should save a custom preset', async ({ request }) => {
        const preset = {
            name: 'Test Preset',
            params: {
                motionThreshold: 30,
                minContourArea: 4000,
                maxContourArea: 80000
            }
        };
        const response = await request.post(`${BASE_URL}/setup/head-animation/api/head-tracking/1/presets`, {
            data: preset
        });
        expect(response.ok()).toBeTruthy();
        const data = await response.json();
        expect(data.success).toBe(true);
        expect(data.preset).toBeTruthy();
        expect(data.preset.name).toBe('Test Preset');
        expect(data.preset.id).toBeTruthy();

        // Verify it appears in list
        const listRes = await request.get(`${BASE_URL}/setup/head-animation/api/head-tracking/1/presets`);
        const listData = await listRes.json();
        const custom = listData.presets.find(p => p.name === 'Test Preset');
        expect(custom).toBeTruthy();

        // Clean up — delete the test preset
        if (custom && custom.id) {
            await request.delete(`${BASE_URL}/setup/head-animation/api/head-tracking/1/presets/${custom.id}`);
        }
    });

    test('should not delete built-in presets', async ({ request }) => {
        const response = await request.delete(`${BASE_URL}/setup/head-animation/api/head-tracking/1/presets/person-hog`);
        const data = await response.json();
        expect(data.success).toBe(false);
        expect(data.error).toContain('built-in');
    });

    test('should delete custom presets', async ({ request }) => {
        // Create a preset first
        const createRes = await request.post(`${BASE_URL}/setup/head-animation/api/head-tracking/1/presets`, {
            data: { name: 'Delete Me', params: { motionThreshold: 15 } }
        });
        const createData = await createRes.json();
        const presetId = createData.preset.id;

        // Delete it
        const deleteRes = await request.delete(`${BASE_URL}/setup/head-animation/api/head-tracking/1/presets/${presetId}`);
        const deleteData = await deleteRes.json();
        expect(deleteData.success).toBe(true);

        // Verify it's gone
        const listRes = await request.get(`${BASE_URL}/setup/head-animation/api/head-tracking/1/presets`);
        const listData = await listRes.json();
        const found = listData.presets.find(p => p.id === presetId);
        expect(found).toBeFalsy();
    });
});

test.describe('Head Tracking Setup Page', () => {
    let page;

    test.beforeEach(async ({ browser }) => {
        page = await browser.newPage();
        await testNavigation(page, `${BASE_URL}/setup/head-animation`, 'Head Animation');
    });

    test.afterEach(async () => {
        await page.close();
    });

    test('should display preset buttons', async () => {
        await expect(page.locator('#presetPerson')).toBeVisible();
        await expect(page.locator('#presetNoisy')).toBeVisible();
        await expect(page.locator('#presetSensitive')).toBeVisible();
    });

    test('should display save preset button', async () => {
        await expect(page.locator('#savePresetBtn')).toBeVisible();
    });

    test('should display detection mode dropdown', async () => {
        const select = page.locator('#detectionMode');
        await expect(select).toBeVisible();
        // Should have 7 detection mode options
        const options = await select.locator('option').count();
        expect(options).toBe(7);
    });

    test('should display OpenCV and head tracking toggles', async () => {
        await expect(page.locator('#ocvEnabled')).toBeVisible();
        await expect(page.locator('#htEnabled')).toBeVisible();
    });
});
