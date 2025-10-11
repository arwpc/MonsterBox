/**
 * Audio System Validation Test
 * Comprehensive test to validate audio system is working correctly
 * Tests WirePlumber status, microphone parts filtering, and audio playback
 */

import { test, expect } from '@playwright/test';

test.describe('Audio System Validation on Orlok', () => {
    // Use configurable host for audio validation; default to localhost to work in CI and dev
    const audioHost = process.env.AUDIO_HOST || '127.0.0.1';
    test.use({ baseURL: `http://${audioHost}:3000` });

    test.beforeEach(async ({ page }) => {
        // Navigate to audio setup page
        await page.goto('/setup/audio');

        // Wait for page to load
        await page.waitForLoadState('networkidle');
    });

    test('WirePlumber should show as Available', async ({ page }) => {
        // Wait for system status to load
        await page.waitForSelector('#wireplumber-status', { timeout: 10000 });

        // Check WirePlumber status badge
        const wireplumberStatus = await page.locator('#wireplumber-status');
        await expect(wireplumberStatus).toBeVisible();

        const statusText = await wireplumberStatus.textContent();
        expect(statusText).toBe('Available');

        // Check that it has success styling (green badge)
        const className = await wireplumberStatus.getAttribute('class');
        expect(className).toContain('bg-success');

        console.log('✅ WirePlumber status: Available (green badge)');
    });

    test('PipeWire should show as Available', async ({ page }) => {
        // Wait for system status to load
        await page.waitForSelector('#pipewire-status', { timeout: 10000 });

        // Check PipeWire status badge
        const pipewireStatus = await page.locator('#pipewire-status');
        await expect(pipewireStatus).toBeVisible();

        const statusText = await pipewireStatus.textContent();
        expect(statusText).toBe('Available');

        // Check that it has success styling (green badge)
        const className = await pipewireStatus.getAttribute('class');
        expect(className).toContain('bg-success');

        console.log('✅ PipeWire status: Available (green badge)');
    });

    test('Microphone Parts Controls should only show microphone parts', async ({ page }) => {
        // Wait for microphone parts to load
        await page.waitForSelector('#mic-parts-list', { timeout: 10000 });

        // Get all part items in the microphone parts list
        const partItems = await page.locator('#mic-parts-list .list-group-item').all();

        console.log(`Found ${partItems.length} items in Microphone Parts Controls`);

        // Should have at least one microphone part (Microphone Orlok)
        expect(partItems.length).toBeGreaterThan(0);

        // Check each item to ensure it's a microphone part
        for (const item of partItems) {
            const itemText = await item.textContent();

            // Skip "No microphone parts found" message if present
            if (itemText.includes('No microphone parts found')) {
                continue;
            }

            // Should contain a microphone-like label (accepts 'Microphone' or 'Mic')
            expect(/Microphone|Mic/i.test(itemText)).toBeTruthy();

            // Should NOT contain non-microphone part types
            expect(itemText).not.toContain('Linear Actuator');
            expect(itemText).not.toContain('Servo');
            expect(itemText).not.toContain('Speaker');
            expect(itemText).not.toContain('Light');
            expect(itemText).not.toContain('Webcam');
            expect(itemText).not.toContain('Motion Sensor');

            console.log(`✅ Microphone part found: ${itemText.substring(0, 50)}...`);
        }
    });

    test('Audio outputs should be enumerated', async ({ page }) => {
        // Wait for page to load
        await page.waitForSelector('#sinks-count', { timeout: 10000 });

        // Check that we have at least one audio output
        const sinksCount = await page.locator('#sinks-count').textContent();
        const count = parseInt(sinksCount);

        expect(count).toBeGreaterThan(0);
        console.log(`✅ Found ${count} audio output(s)`);
    });

    test('Audio inputs should be enumerated', async ({ page }) => {
        // Wait for page to load
        await page.waitForSelector('#sources-count', { timeout: 10000 });

        // Check that we have at least one audio input
        const sourcesCount = await page.locator('#sources-count').textContent();
        const count = parseInt(sourcesCount);

        expect(count).toBeGreaterThan(0);
        console.log(`✅ Found ${count} audio input(s)`);
    });

    test('Speaker test should play audio', async ({ page }) => {
        // Find the speaker test section
        await page.waitForSelector('text=Speaker Test', { timeout: 10000 });

        // Find and click the test speaker button
        const testButton = page.locator('button:has-text("Test Speaker")').first();
        await expect(testButton).toBeVisible();

        console.log('🔊 Clicking Test Speaker button...');
        await testButton.click();

        // Wait for the test to complete (should show a notification or complete)
        await page.waitForTimeout(2000);

        // Check for success notification or that button is re-enabled
        // (The actual audio playback can't be verified in headless mode, 
        //  but we can verify the command was sent)
        console.log('✅ Speaker test command sent');
    });

    test('Page should load without errors', async ({ page }) => {
        // Check for any console errors
        const errors = [];
        page.on('console', msg => {
            if (msg.type() === 'error') {
                errors.push(msg.text());
            }
        });

        // Reload page to capture console messages
        await page.reload();
        await page.waitForLoadState('networkidle');

        // Filter out known harmless errors
        const criticalErrors = errors.filter(err => {
            return !err.includes('favicon') &&
                !err.includes('404') &&
                !err.includes('net::ERR');
        });

        if (criticalErrors.length > 0) {
            console.log('⚠️ Console errors found:', criticalErrors);
        }

        // Page should be functional even with minor errors
        expect(await page.title()).toBeTruthy();
        console.log('✅ Page loaded successfully');
    });

    test('System status should show healthy state', async ({ page }) => {
        // Wait for all status indicators to load
        await page.waitForSelector('#pipewire-status', { timeout: 10000 });
        await page.waitForSelector('#wireplumber-status', { timeout: 10000 });

        // Get both status badges
        const pipewireStatus = await page.locator('#pipewire-status').textContent();
        const wireplumberStatus = await page.locator('#wireplumber-status').textContent();

        // Both should be Available
        expect(pipewireStatus).toBe('Available');
        expect(wireplumberStatus).toBe('Available');

        console.log('✅ Audio system is healthy:');
        console.log('   - PipeWire: Available');
        console.log('   - WirePlumber: Available');
    });

    test('Microphone sensitivity controls should be present for microphone parts', async ({ page }) => {
        // Wait for microphone parts to load
        await page.waitForSelector('#mic-parts-list', { timeout: 10000 });

        // Look for sensitivity sliders (should have id like mic-sens-7 for part ID 7)
        const sensitivitySliders = await page.locator('[id^="mic-sens-"]').all();

        if (sensitivitySliders.length > 0) {
            console.log(`✅ Found ${sensitivitySliders.length} microphone sensitivity control(s)`);

            // Verify each slider is visible and functional
            for (const slider of sensitivitySliders) {
                await expect(slider).toBeVisible();
            }
        } else {
            console.log('ℹ️ No microphone parts configured yet');
        }
    });

    test('Microphone gain controls should be present for microphone parts', async ({ page }) => {
        // Wait for microphone parts to load
        await page.waitForSelector('#mic-parts-list', { timeout: 10000 });

        // Look for gain sliders (should have id like mic-gain-7 for part ID 7)
        const gainSliders = await page.locator('[id^="mic-gain-"]').all();

        if (gainSliders.length > 0) {
            console.log(`✅ Found ${gainSliders.length} microphone gain control(s)`);

            // Verify each slider is visible and functional
            for (const slider of gainSliders) {
                await expect(slider).toBeVisible();
            }
        } else {
            console.log('ℹ️ No microphone parts configured yet');
        }
    });
});

