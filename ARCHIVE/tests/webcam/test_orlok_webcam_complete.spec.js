const { test, expect } = require('@playwright/test');

/**
 * Comprehensive Orlok Webcam System Test
 * Tests all webcam functionality including streaming, motion tracking, and head tracking
 */

const TEST_CONFIG = {
    baseURL: 'http://localhost:3000',
    timeout: 30000,
    orlokCharacterId: 1,
    orlokWebcamPartId: 28,
    expectedCameraDevice: 0, // Updated: Orlok now uses camera 0
    testResolution: '1280x720',
    testFPS: 30
};

test.describe('Orlok Webcam System - Complete Functionality', () => {
    test.beforeEach(async ({ page }) => {
        // Set longer timeout for webcam operations
        page.setDefaultTimeout(TEST_CONFIG.timeout);
        
        // Navigate to Orlok's webcam edit page
        await page.goto(`${TEST_CONFIG.baseURL}/parts/webcam/${TEST_CONFIG.orlokWebcamPartId}/edit`);
        
        // Wait for page to load completely
        await page.waitForLoadState('networkidle');
        
        // Verify we're on the correct page
        await expect(page.locator('h1')).toContainText('Edit Webcam');
        await expect(page.locator('input[name="name"]')).toHaveValue('Orlok\'s Gaze');
    });

    test('should have correct camera device configuration', async ({ page }) => {
        // Verify camera device is set to 0 (working camera)
        const deviceSelect = page.locator('#deviceId');
        await expect(deviceSelect).toHaveValue('0');
        
        // Verify device path is correct
        const devicePath = page.locator('#devicePath');
        await expect(devicePath).toHaveValue('/dev/video0');
        
        // Verify character is Orlok
        const characterSelect = page.locator('#characterId');
        await expect(characterSelect).toHaveValue('1');
    });

    test('should detect cameras successfully', async ({ page }) => {
        // Click detect cameras button
        const detectBtn = page.locator('#detectCamerasBtn');
        await detectBtn.click();
        
        // Wait for detection to complete
        await page.waitForTimeout(3000);
        
        // Verify camera options are populated
        const deviceSelect = page.locator('#deviceId');
        const options = await deviceSelect.locator('option').count();
        expect(options).toBeGreaterThan(1); // Should have at least the placeholder + detected cameras
        
        // Verify camera 0 is available
        await expect(deviceSelect.locator('option[value="0"]')).toBeVisible();
    });

    test('should start webcam stream successfully', async ({ page }) => {
        // Ensure camera 0 is selected
        await page.locator('#deviceId').selectOption('0');
        
        // Click webcam toggle button
        const toggleBtn = page.locator('#webcamToggleBtn');
        await expect(toggleBtn).toContainText('Webcam On');
        await toggleBtn.click();
        
        // Wait for stream to start
        await page.waitForTimeout(5000);
        
        // Verify button text changed
        await expect(toggleBtn).toContainText('Webcam Off');
        
        // Verify preview shows stream
        const preview = page.locator('#webcamPreview');
        const streamImg = preview.locator('img');
        await expect(streamImg).toBeVisible();
        
        // Verify stream URL is correct
        const src = await streamImg.getAttribute('src');
        expect(src).toContain('/camera/stream');
        expect(src).toContain('characterId=1');
    });

    test('should have motion tracking controls', async ({ page }) => {
        // Verify motion tracking checkbox exists
        const motionCheckbox = page.locator('#motionTrackingEnabled');
        await expect(motionCheckbox).toBeVisible();
        
        // Verify motion tracking controls exist
        await expect(page.locator('#motionTrackingControls')).toBeVisible();
        await expect(page.locator('#motionSensitivity')).toBeVisible();
        await expect(page.locator('#motionMinArea')).toBeVisible();
        await expect(page.locator('#startMotionDetectionBtn')).toBeVisible();
        await expect(page.locator('#stopMotionDetectionBtn')).toBeVisible();
    });

    test('should enable motion tracking successfully', async ({ page }) => {
        // Enable motion tracking
        const motionCheckbox = page.locator('#motionTrackingEnabled');
        await motionCheckbox.check();
        
        // Wait for API call to complete
        await page.waitForTimeout(2000);
        
        // Verify controls are enabled
        const controls = page.locator('#motionTrackingControls');
        await expect(controls).toHaveCSS('opacity', '1');
        
        // Verify sensitivity and min area controls work
        const sensitivity = page.locator('#motionSensitivity');
        await sensitivity.fill('75');
        
        const minArea = page.locator('#motionMinArea');
        await minArea.fill('800');
        
        // Start motion detection
        const startBtn = page.locator('#startMotionDetectionBtn');
        await startBtn.click();
        
        // Wait for motion detection to start
        await page.waitForTimeout(3000);
        
        // Verify status updated
        const status = page.locator('#motionDetectionStatus');
        await expect(status).toContainText('Active');
    });

    test('should have head tracking controls', async ({ page }) => {
        // Verify head tracking section exists
        await expect(page.locator('h5:has-text("Head Tracking")')).toBeVisible();
        
        // Verify head tracking controls
        await expect(page.locator('#headTrackingEnabled')).toBeVisible();
        await expect(page.locator('#startHeadTrackingBtn')).toBeVisible();
        await expect(page.locator('#stopHeadTrackingBtn')).toBeVisible();
        await expect(page.locator('#headTrackingStatus')).toBeVisible();
    });

    test('should save webcam configuration successfully', async ({ page }) => {
        // Modify some settings
        await page.locator('#name').fill('Orlok\'s Updated Gaze');
        await page.locator('#resolution').selectOption('1920x1080');
        await page.locator('#fps').selectOption('60');
        
        // Save the form
        const saveBtn = page.locator('button[type="submit"]:has-text("Save Webcam")');
        await saveBtn.click();
        
        // Wait for redirect or success message
        await page.waitForTimeout(3000);
        
        // Should redirect to parts list or show success
        const currentUrl = page.url();
        expect(currentUrl).toMatch(/\/parts/);
    });

    test('should handle camera preview centering', async ({ page }) => {
        // Verify preview container is centered
        const previewContainer = page.locator('.webcam-preview').first();
        await expect(previewContainer).toBeVisible();
        
        // Check parent container has centering styles
        const parentContainer = page.locator('div:has(> .webcam-preview)').first();
        const styles = await parentContainer.evaluate(el => {
            const computed = window.getComputedStyle(el);
            return {
                display: computed.display,
                justifyContent: computed.justifyContent
            };
        });
        
        expect(styles.display).toBe('flex');
        expect(styles.justifyContent).toBe('center');
    });

    test('should handle errors gracefully', async ({ page }) => {
        // Test with invalid camera device
        await page.locator('#deviceId').selectOption('99'); // Non-existent camera
        
        const toggleBtn = page.locator('#webcamToggleBtn');
        await toggleBtn.click();
        
        // Wait for error handling
        await page.waitForTimeout(5000);
        
        // Should show error state
        const preview = page.locator('#webcamPreview');
        const errorContent = await preview.textContent();
        expect(errorContent).toMatch(/failed|error|unavailable/i);
        
        // Button should return to original state
        await expect(toggleBtn).toContainText('Webcam On');
    });

    test('should have all required form elements', async ({ page }) => {
        // Verify all essential form elements exist
        await expect(page.locator('#name')).toBeVisible();
        await expect(page.locator('#characterId')).toBeVisible();
        await expect(page.locator('#deviceId')).toBeVisible();
        await expect(page.locator('#devicePath')).toBeVisible();
        await expect(page.locator('#resolution')).toBeVisible();
        await expect(page.locator('#fps')).toBeVisible();
        
        // Verify camera controls exist
        await expect(page.locator('#detectCamerasBtn')).toBeVisible();
        await expect(page.locator('#webcamToggleBtn')).toBeVisible();
        
        // Verify form buttons exist
        await expect(page.locator('button[type="submit"]:has-text("Save Webcam")')).toBeVisible();
        await expect(page.locator('a:has-text("Cancel")')).toBeVisible();
    });

    test.afterEach(async ({ page }) => {
        // Clean up: stop any active streams
        try {
            const toggleBtn = page.locator('#webcamToggleBtn');
            const btnText = await toggleBtn.textContent();
            if (btnText && btnText.includes('Off')) {
                await toggleBtn.click();
                await page.waitForTimeout(2000);
            }
        } catch (error) {
            console.log('Cleanup: Could not stop webcam stream');
        }
    });
});
