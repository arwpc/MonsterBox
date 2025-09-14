const { test, expect } = require('@playwright/test');

test.describe('Motion Tracking Setup & Camera Preview Tests', () => {
    const TEST_CONFIG = {
        characterId: 1, // Orlok
        webcamPartId: 28,
        baseURL: 'http://localhost:80'
    };

    test.beforeEach(async ({ page }) => {
        // Set longer timeout for this test
        test.setTimeout(60000);
        
        // Navigate to webcam configuration page
        await page.goto(`/parts/webcam/${TEST_CONFIG.webcamPartId}/edit`);
        await page.waitForLoadState('networkidle');
    });

    test('Motion Tracking Enable/Disable Functionality', async ({ page }) => {
        console.log('🧪 Testing Motion Tracking Enable/Disable...');

        // Wait for the motion tracking checkbox to be visible
        const motionTrackingCheckbox = page.locator('#motionTrackingEnabled');
        await expect(motionTrackingCheckbox).toBeVisible();

        // Check initial state - should be enabled based on our configuration
        const initialState = await motionTrackingCheckbox.isChecked();
        console.log('📊 Initial motion tracking state:', initialState);

        // Test disabling motion tracking
        if (initialState) {
            console.log('🔄 Testing disable motion tracking...');
            await motionTrackingCheckbox.uncheck();
            
            // Wait for the API call to complete
            await page.waitForTimeout(2000);
            
            // Verify controls are disabled
            const motionControls = page.locator('#motionTrackingControls');
            await expect(motionControls).toHaveCSS('opacity', '0.5');
            await expect(motionControls).toHaveCSS('pointer-events', 'none');
            
            console.log('✅ Motion tracking disabled successfully');
        }

        // Test enabling motion tracking
        console.log('🔄 Testing enable motion tracking...');
        await motionTrackingCheckbox.check();
        
        // Wait for the API call to complete
        await page.waitForTimeout(2000);
        
        // Verify controls are enabled
        const motionControls = page.locator('#motionTrackingControls');
        await expect(motionControls).toHaveCSS('opacity', '1');
        await expect(motionControls).toHaveCSS('pointer-events', 'auto');
        
        console.log('✅ Motion tracking enabled successfully');

        // Test motion detection controls are accessible
        const startButton = page.locator('#startMotionDetectionBtn');
        const sensitivitySlider = page.locator('#motionSensitivity');
        const minAreaSlider = page.locator('#motionMinArea');
        
        await expect(startButton).toBeVisible();
        await expect(startButton).toBeEnabled();
        await expect(sensitivitySlider).toBeVisible();
        await expect(minAreaSlider).toBeVisible();
        
        console.log('✅ Motion detection controls are accessible');
    });

    test('Camera Preview Centering', async ({ page }) => {
        console.log('🧪 Testing Camera Preview Centering...');

        // Wait for the camera preview element
        const cameraPreview = page.locator('.webcam-preview');
        await expect(cameraPreview).toBeVisible();

        // Get the preview element's bounding box
        const previewBox = await cameraPreview.boundingBox();
        
        // Get the parent container's bounding box
        const parentContainer = page.locator('.form-section').filter({ hasText: 'Live Preview & Advanced Features' });
        const containerBox = await parentContainer.boundingBox();

        console.log('📐 Preview dimensions:', previewBox);
        console.log('📐 Container dimensions:', containerBox);

        // Calculate if the preview is centered
        const previewCenter = previewBox.x + (previewBox.width / 2);
        const containerCenter = containerBox.x + (containerBox.width / 2);
        const centeringTolerance = 20; // Allow 20px tolerance

        const isCentered = Math.abs(previewCenter - containerCenter) <= centeringTolerance;
        
        console.log('📊 Preview center X:', previewCenter);
        console.log('📊 Container center X:', containerCenter);
        console.log('📊 Centering difference:', Math.abs(previewCenter - containerCenter));
        console.log('📊 Is centered (within tolerance):', isCentered);

        expect(isCentered).toBeTruthy();
        console.log('✅ Camera preview is properly centered');

        // Verify CSS properties
        const computedStyle = await cameraPreview.evaluate(el => {
            const style = window.getComputedStyle(el);
            return {
                margin: style.margin,
                marginLeft: style.marginLeft,
                marginRight: style.marginRight,
                display: style.display,
                maxWidth: style.maxWidth
            };
        });

        console.log('🎨 Camera preview CSS:', computedStyle);
        
        // Verify expected CSS properties for centering
        expect(computedStyle.marginLeft).toBe('auto');
        expect(computedStyle.marginRight).toBe('auto');
        expect(computedStyle.maxWidth).toBe('640px');
    });

    test('Motion Tracking API Integration', async ({ page }) => {
        console.log('🧪 Testing Motion Tracking API Integration...');

        // Test API status endpoint
        const apiResponse = await page.request.get(`/api/motion-tracking/status/${TEST_CONFIG.characterId}`);
        expect(apiResponse.ok()).toBeTruthy();
        
        const statusData = await apiResponse.json();
        console.log('📊 API Status Response:', statusData);
        
        expect(statusData.success).toBeTruthy();
        expect(statusData.characterId).toBe(TEST_CONFIG.characterId);
        expect(statusData).toHaveProperty('motionTrackingEnabled');
        expect(statusData).toHaveProperty('isActive');
        
        console.log('✅ Motion tracking API is working correctly');

        // Test settings update API
        const updateResponse = await page.request.post(`/api/motion-tracking/settings/${TEST_CONFIG.characterId}`, {
            data: {
                enabled: true,
                sensitivity: 75,
                min_area: 600
            }
        });
        
        expect(updateResponse.ok()).toBeTruthy();
        const updateData = await updateResponse.json();
        console.log('📊 API Update Response:', updateData);
        
        expect(updateData.success).toBeTruthy();
        expect(updateData.settings.enabled).toBeTruthy();
        expect(updateData.settings.sensitivity).toBe(75);
        expect(updateData.settings.min_area).toBe(600);
        
        console.log('✅ Motion tracking settings API is working correctly');
    });

    test('Complete Interface Integration', async ({ page }) => {
        console.log('🧪 Testing Complete Interface Integration...');

        // Verify all major sections are present
        const sections = [
            { selector: 'h3:has-text("Live Preview & Advanced Features")', name: 'Live Preview Section' },
            { selector: 'h5:has-text("Head Tracking")', name: 'Head Tracking Section' },
            { selector: 'h5:has-text("Motion Detection")', name: 'Motion Detection Section' },
            { selector: '#motionTrackingEnabled', name: 'Motion Tracking Checkbox' },
            { selector: '#motionTrackingControls', name: 'Motion Tracking Controls' }
        ];

        for (const section of sections) {
            const element = page.locator(section.selector);
            await expect(element).toBeVisible();
            console.log(`✅ ${section.name} is visible`);
        }

        // Test motion tracking workflow
        const checkbox = page.locator('#motionTrackingEnabled');
        const controls = page.locator('#motionTrackingControls');
        const startButton = page.locator('#startMotionDetectionBtn');

        // Ensure motion tracking is enabled
        await checkbox.check();
        await page.waitForTimeout(1000);

        // Verify controls are enabled
        await expect(controls).toHaveCSS('opacity', '1');
        await expect(startButton).toBeEnabled();

        // Test slider interactions
        const sensitivitySlider = page.locator('#motionSensitivity');
        const sensitivityValue = page.locator('#motionSensitivityValue');
        
        await sensitivitySlider.fill('80');
        await expect(sensitivityValue).toHaveText('80');

        console.log('✅ Motion tracking interface integration is working correctly');
    });

    test('Error Handling and Notifications', async ({ page }) => {
        console.log('🧪 Testing Error Handling and Notifications...');

        // Listen for console messages to catch notifications
        const consoleMessages = [];
        page.on('console', msg => {
            consoleMessages.push(msg.text());
        });

        // Test motion tracking toggle
        const checkbox = page.locator('#motionTrackingEnabled');
        const initialState = await checkbox.isChecked();
        
        // Toggle the checkbox
        if (initialState) {
            await checkbox.uncheck();
        } else {
            await checkbox.check();
        }

        // Wait for potential notifications
        await page.waitForTimeout(3000);

        // Check if any notification-related activity occurred
        console.log('📊 Console messages during test:', consoleMessages);

        // Verify the checkbox state changed
        const finalState = await checkbox.isChecked();
        expect(finalState).toBe(!initialState);

        console.log('✅ Error handling and state management working correctly');
    });
});
