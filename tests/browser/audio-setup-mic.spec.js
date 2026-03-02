/**
 * Audio Setup Microphone Tests
 * Validates VU meter visibility, mic detection, and audio configuration
 */

import { test, expect } from '@playwright/test';
import { testNavigation } from './framework.js';

const BASE_URL = process.env.BASE_URL || 'http://localhost:3000';

test.describe('Audio Setup Page - Microphone', () => {
    let page;

    test.beforeEach(async ({ browser }) => {
        page = await browser.newPage();
        await testNavigation(page, `${BASE_URL}/setup/audio`, 'Audio');
    });

    test.afterEach(async () => {
        await page.close();
    });

    test('should load audio setup page without errors', async () => {
        const title = await page.title();
        expect(title.toLowerCase()).toContain('audio');
    });

    test('should fetch audio inputs', async ({ request }) => {
        const response = await request.get(`${BASE_URL}/setup/audio/api/inputs`);
        expect(response.ok()).toBeTruthy();
        const data = await response.json();
        expect(data.success).toBe(true);
        expect(Array.isArray(data.inputs)).toBe(true);
        expect(data.inputs.length).toBeGreaterThan(0);
    });

    test('should fetch audio outputs', async ({ request }) => {
        const response = await request.get(`${BASE_URL}/setup/audio/api/outputs`);
        expect(response.ok()).toBeTruthy();
        const data = await response.json();
        expect(data.success).toBe(true);
        expect(Array.isArray(data.outputs)).toBe(true);
    });

    test('should get input level (mocked in test mode)', async ({ request }) => {
        const response = await request.get(`${BASE_URL}/setup/audio/api/input-level?device=default`);
        expect(response.ok()).toBeTruthy();
        const data = await response.json();
        expect(data.success).toBe(true);
        expect(typeof data.level).toBe('number');
    });

    test('should get audio levels (mocked in test mode)', async ({ request }) => {
        const response = await request.get(`${BASE_URL}/setup/audio/api/audio-levels?deviceId=default&deviceType=input`);
        expect(response.ok()).toBeTruthy();
        const data = await response.json();
        expect(data.success).toBe(true);
        expect(typeof data.level).toBe('number');
    });

    test('should get system audio config', async ({ request }) => {
        const response = await request.get(`${BASE_URL}/setup/audio/api/system-config`);
        expect(response.ok()).toBeTruthy();
        const data = await response.json();
        expect(data.success).toBe(true);
        expect(data.config).toBeTruthy();
        expect(data.config.defaultSink).toBeTruthy();
        expect(data.config.defaultSource).toBeTruthy();
    });

    test('should get hardware devices', async ({ request }) => {
        const response = await request.get(`${BASE_URL}/setup/audio/api/hardware-devices`);
        expect(response.ok()).toBeTruthy();
        const data = await response.json();
        expect(data.success).toBe(true);
        expect(data.devices).toBeTruthy();
        expect(Array.isArray(data.devices.inputs)).toBe(true);
        expect(Array.isArray(data.devices.outputs)).toBe(true);
    });
});
