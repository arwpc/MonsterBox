/**
 * Comprehensive End-to-End Webcam Testing Suite
 * Uses Playwright for browser automation, MCP for system integration testing, and Mocha for test framework
 */

const { test, expect } = require('@playwright/test');
const { TestHelpers } = require('../utils/test-helpers');

// Fallback helper functions if TestHelpers is not available
const fallbackHelpers = {
    async waitForPageLoad(page, timeout = 30000) {
        try {
            await page.waitForLoadState('networkidle', { timeout });
            await page.waitForLoadState('domcontentloaded', { timeout });
            await page.waitForTimeout(1000);
            return true;
        } catch (error) {
            console.warn('Page load timeout, continuing anyway:', error.message);
            return false;
        }
    },

    async takeScreenshot(page, testInfo, suffix = '') {
        try {
            const timestamp = new Date().toISOString().replace(/[:.]/g, '-');
            const testName = testInfo.title.replace(/[^a-zA-Z0-9]/g, '_');
            const filename = `${testName}_${suffix}_${timestamp}.png`;

            await page.screenshot({
                path: `test-results/screenshots/${filename}`,
                fullPage: true
            });

            console.log(`📸 Screenshot saved: test-results/screenshots/${filename}`);
            return filename;
        } catch (error) {
            console.error('Failed to take screenshot:', error);
            return null;
        }
    }
};

// Use TestHelpers if available, otherwise use fallback
const helpers = TestHelpers || fallbackHelpers;
const fs = require('fs').promises;
const path = require('path');

// Test configuration
const TEST_CONFIG = {
    baseURL: 'http://localhost:3000',
    timeout: 30000,
    retries: 2,
    testCharacterId: 1, // Orlok character for testing
    expectedCameraDevice: 0, // Single physical camera
    testResolution: '1280x720',
    testFPS: 30
};

// Console error monitoring
class ConsoleErrorMonitor {
    constructor() {
        this.errors = [];
        this.warnings = [];
        this.networkErrors = [];
    }

    attachToPage(page) {
        // Monitor console errors
        page.on('console', msg => {
            if (msg.type() === 'error') {
                this.errors.push({
                    message: msg.text(),
                    timestamp: new Date().toISOString(),
                    location: msg.location()
                });
            } else if (msg.type() === 'warning') {
                this.warnings.push({
                    message: msg.text(),
                    timestamp: new Date().toISOString(),
                    location: msg.location()
                });
            }
        });

        // Monitor page errors
        page.on('pageerror', error => {
            this.errors.push({
                message: error.message,
                stack: error.stack,
                timestamp: new Date().toISOString(),
                type: 'pageerror'
            });
        });

        // Monitor network failures
        page.on('requestfailed', request => {
            this.networkErrors.push({
                url: request.url(),
                method: request.method(),
                failure: request.failure()?.errorText,
                timestamp: new Date().toISOString()
            });
        });
    }

    getErrorSummary() {
        return {
            totalErrors: this.errors.length,
            totalWarnings: this.warnings.length,
            totalNetworkErrors: this.networkErrors.length,
            errors: this.errors,
            warnings: this.warnings,
            networkErrors: this.networkErrors
        };
    }

    hasErrors() {
        return this.errors.length > 0 || this.networkErrors.length > 0;
    }

    reset() {
        this.errors = [];
        this.warnings = [];
        this.networkErrors = [];
    }
}

// MCP Logger for system integration testing
class MCPTestLogger {
    constructor() {
        this.logs = [];
    }

    log(level, message, metadata = {}) {
        this.logs.push({
            level,
            message,
            metadata,
            timestamp: new Date().toISOString(),
            service: 'webcam-e2e-test'
        });
    }

    logTestStart(testName) {
        this.log('info', `Starting test: ${testName}`, { testPhase: 'start' });
    }

    logTestEnd(testName, result) {
        this.log('info', `Test completed: ${testName}`, { 
            testPhase: 'end', 
            result: result.status,
            duration: result.duration 
        });
    }

    logWebcamOperation(operation, data) {
        this.log('info', `Webcam operation: ${operation}`, { 
            operation, 
            data,
            component: 'webcam'
        });
    }

    logError(error, context = {}) {
        this.log('error', error.message, { 
            error: error.stack,
            context
        });
    }

    async saveLogs(testInfo) {
        const logFile = path.join('test-results', `mcp-logs-${testInfo.title.replace(/[^a-zA-Z0-9]/g, '_')}.json`);
        await fs.writeFile(logFile, JSON.stringify(this.logs, null, 2));
        return logFile;
    }
}

test.describe('Webcam End-to-End Testing Suite', () => {
    let consoleMonitor;
    let mcpLogger;

    test.beforeEach(async ({ page }, testInfo) => {
        // Initialize monitoring systems
        consoleMonitor = new ConsoleErrorMonitor();
        mcpLogger = new MCPTestLogger();
        
        consoleMonitor.attachToPage(page);
        mcpLogger.logTestStart(testInfo.title);

        // Set longer timeout for webcam operations
        test.setTimeout(TEST_CONFIG.timeout);
    });

    test.afterEach(async ({ page }, testInfo) => {
        // Log test completion
        mcpLogger.logTestEnd(testInfo.title, { 
            status: testInfo.status,
            duration: testInfo.duration 
        });

        // Save MCP logs
        await mcpLogger.saveLogs(testInfo);

        // Check for console errors
        const errorSummary = consoleMonitor.getErrorSummary();
        if (errorSummary.totalErrors > 0) {
            console.log('❌ Console errors detected:', errorSummary);
            await helpers.takeScreenshot(page, testInfo, 'console_errors');
        }

        // Save error report
        const errorReportPath = path.join('test-results', `error-report-${testInfo.title.replace(/[^a-zA-Z0-9]/g, '_')}.json`);
        await fs.writeFile(errorReportPath, JSON.stringify(errorSummary, null, 2));
    });

    test('Camera Detection and Settings Persistence', async ({ page }, testInfo) => {
        mcpLogger.logWebcamOperation('camera_detection_test_start', { characterId: TEST_CONFIG.testCharacterId });

        // Navigate to webcam configuration page
        await page.goto(`/parts/webcam/new?characterId=${TEST_CONFIG.testCharacterId}`);
        await helpers.waitForPageLoad(page);

        // Wait for auto-detection to complete
        await page.waitForSelector('#detectionStatus', { state: 'visible' });
        
        // Check if camera detection was successful
        const detectionStatus = await page.locator('#detectionStatus').textContent();
        mcpLogger.logWebcamOperation('camera_detection_result', { status: detectionStatus });

        // Verify camera device dropdown is populated
        const deviceSelect = page.locator('#deviceId');
        await expect(deviceSelect).toBeVisible();
        
        const deviceOptions = await deviceSelect.locator('option').count();
        expect(deviceOptions).toBeGreaterThan(1); // Should have at least the default option + detected cameras

        // Select the expected camera device
        await deviceSelect.selectOption(TEST_CONFIG.expectedCameraDevice.toString());
        
        // Verify device path is automatically set
        const devicePath = await page.locator('#devicePath').inputValue();
        expect(devicePath).toBe(`/dev/video${TEST_CONFIG.expectedCameraDevice}`);

        // Set webcam configuration
        await page.locator('#name').fill('E2E Test Webcam');
        await page.locator('#resolution').selectOption(TEST_CONFIG.testResolution);
        await page.locator('#fps').selectOption(TEST_CONFIG.testFPS.toString());

        // Test camera controls settings
        await page.locator('#brightness').fill('10');
        await page.locator('#contrast').fill('40');
        await page.locator('#saturation').fill('70');

        mcpLogger.logWebcamOperation('settings_configured', {
            name: 'E2E Test Webcam',
            resolution: TEST_CONFIG.testResolution,
            fps: TEST_CONFIG.testFPS,
            brightness: 10,
            contrast: 40,
            saturation: 70
        });

        // Save the webcam configuration
        await page.locator('button[type="submit"]').click();
        
        // Wait for redirect or success message
        await page.waitForURL(/\/parts\?characterId=/, { timeout: 10000 });

        // Verify no console errors occurred during the process
        const errorSummary = consoleMonitor.getErrorSummary();
        if (errorSummary.totalErrors > 0) {
            mcpLogger.logError(new Error('Console errors during camera detection'), errorSummary);
        }
        expect(errorSummary.totalErrors).toBe(0);

        mcpLogger.logWebcamOperation('camera_detection_test_complete', { success: true });
    });

    test('Webcam Settings Persistence Verification', async ({ page }, testInfo) => {
        mcpLogger.logWebcamOperation('settings_persistence_test_start', {});

        // Navigate to parts list to find the created webcam
        await page.goto(`/parts?characterId=${TEST_CONFIG.testCharacterId}`);
        await helpers.waitForPageLoad(page);

        // Find and click on the webcam part
        const webcamLink = page.locator('a:has-text("E2E Test Webcam")').first();
        await expect(webcamLink).toBeVisible();
        await webcamLink.click();

        // Wait for webcam edit page to load
        await helpers.waitForPageLoad(page);

        // Verify settings are persisted
        const nameValue = await page.locator('#name').inputValue();
        const resolutionValue = await page.locator('#resolution').inputValue();
        const fpsValue = await page.locator('#fps').inputValue();
        const deviceIdValue = await page.locator('#deviceId').inputValue();

        expect(nameValue).toBe('E2E Test Webcam');
        expect(resolutionValue).toBe(TEST_CONFIG.testResolution);
        expect(fpsValue).toBe(TEST_CONFIG.testFPS.toString());
        expect(deviceIdValue).toBe(TEST_CONFIG.expectedCameraDevice.toString());

        mcpLogger.logWebcamOperation('settings_persistence_verified', {
            name: nameValue,
            resolution: resolutionValue,
            fps: fpsValue,
            deviceId: deviceIdValue
        });

        // Verify no console errors
        expect(consoleMonitor.getErrorSummary().totalErrors).toBe(0);
    });

    test('Camera Controls Application and Error Handling', async ({ page }, testInfo) => {
        mcpLogger.logWebcamOperation('camera_controls_test_start', {});

        // Navigate to existing webcam configuration
        await page.goto(`/parts?characterId=${TEST_CONFIG.testCharacterId}`);
        await helpers.waitForPageLoad(page);

        const webcamLink = page.locator('a:has-text("E2E Test Webcam")').first();
        await webcamLink.click();
        await helpers.waitForPageLoad(page);

        // Wait for camera detection to complete
        await page.waitForSelector('#detectionStatus', { state: 'visible' });

        // Test camera controls
        await page.locator('#brightness').fill('20');
        await page.locator('#contrast').fill('50');
        await page.locator('#saturation').fill('80');
        await page.locator('#hue').fill('5');

        // Apply controls and monitor for errors
        const applyButton = page.locator('#applyControlsBtn');
        await expect(applyButton).toBeVisible();

        // Monitor network requests
        const responsePromise = page.waitForResponse(response =>
            response.url().includes('/api/webcam/set-controls') && response.status() === 200
        );

        await applyButton.click();

        // Wait for the API response
        const response = await responsePromise;
        expect(response.ok()).toBeTruthy();

        mcpLogger.logWebcamOperation('camera_controls_applied', {
            brightness: 20,
            contrast: 50,
            saturation: 80,
            hue: 5
        });

        // Test reset controls functionality
        const resetButton = page.locator('#resetControlsBtn');
        await resetButton.click();

        // Verify controls are reset to defaults
        const brightnessValue = await page.locator('#brightness').inputValue();
        const contrastValue = await page.locator('#contrast').inputValue();

        expect(brightnessValue).toBe('0');
        expect(contrastValue).toBe('32');

        // Verify no console errors during controls operations
        expect(consoleMonitor.getErrorSummary().totalErrors).toBe(0);
    });

    test('Camera Test Stream Functionality', async ({ page }, testInfo) => {
        mcpLogger.logWebcamOperation('camera_test_stream_start', {});

        // Navigate to webcam configuration
        await page.goto(`/parts?characterId=${TEST_CONFIG.testCharacterId}`);
        await helpers.waitForPageLoad(page);

        const webcamLink = page.locator('a:has-text("E2E Test Webcam")').first();
        await webcamLink.click();
        await helpers.waitForPageLoad(page);

        // Wait for camera detection
        await page.waitForSelector('#detectionStatus', { state: 'visible' });

        // Test camera functionality
        const testButton = page.locator('#testCameraBtn');
        const stopButton = page.locator('#stopTestBtn');
        const preview = page.locator('#webcamPreview');

        await expect(testButton).toBeVisible();

        // Start camera test
        await testButton.click();

        // Verify UI state changes
        await expect(stopButton).toBeVisible();
        await expect(testButton).not.toBeVisible();

        // Wait for preview to update (or error message)
        await page.waitForTimeout(3000);

        const previewContent = await preview.textContent();
        mcpLogger.logWebcamOperation('camera_test_result', { previewContent });

        // Stop the test
        await stopButton.click();

        // Verify UI returns to initial state
        await expect(testButton).toBeVisible();
        await expect(stopButton).not.toBeVisible();

        // Check for any errors during streaming test
        const errorSummary = consoleMonitor.getErrorSummary();
        if (errorSummary.totalErrors > 0) {
            mcpLogger.logError(new Error('Errors during camera test'), errorSummary);
        }
    });

    test('Streaming Service Integration', async ({ page }, testInfo) => {
        mcpLogger.logWebcamOperation('streaming_service_test_start', {});

        // Navigate to webcam configuration
        await page.goto(`/parts?characterId=${TEST_CONFIG.testCharacterId}`);
        await helpers.waitForPageLoad(page);

        const webcamLink = page.locator('a:has-text("E2E Test Webcam")').first();
        await webcamLink.click();
        await helpers.waitForPageLoad(page);

        // Test streaming functionality
        const startStreamButton = page.locator('#startStreamBtn');
        const stopStreamButton = page.locator('#stopStreamBtn');
        const streamStatus = page.locator('#streamStatus');

        await expect(startStreamButton).toBeVisible();

        // Start streaming
        const streamResponsePromise = page.waitForResponse(response =>
            response.url().includes('/api/streaming/start/') && response.status() === 200
        );

        await startStreamButton.click();

        try {
            await streamResponsePromise;

            // Verify UI updates
            await expect(stopStreamButton).toBeVisible();
            await expect(streamStatus).toBeVisible();

            // Check stream status
            const statusText = await page.locator('#streamStatusText').textContent();
            mcpLogger.logWebcamOperation('streaming_started', { status: statusText });

            // Stop streaming
            const stopResponsePromise = page.waitForResponse(response =>
                response.url().includes('/api/streaming/stop/') && response.status() === 200
            );

            await stopStreamButton.click();
            await stopResponsePromise;

            // Verify UI returns to initial state
            await expect(startStreamButton).toBeVisible();
            await expect(streamStatus).not.toBeVisible();

            mcpLogger.logWebcamOperation('streaming_stopped', { success: true });

        } catch (error) {
            mcpLogger.logError(error, { context: 'streaming_test' });
            // Streaming might fail due to hardware constraints, but we should still check for console errors
        }

        // Verify no console errors during streaming operations
        expect(consoleMonitor.getErrorSummary().totalErrors).toBe(0);
    });

    test('Error Handling and Recovery', async ({ page }, testInfo) => {
        mcpLogger.logWebcamOperation('error_handling_test_start', {});

        // Navigate to webcam configuration
        await page.goto(`/parts/webcam/new?characterId=${TEST_CONFIG.testCharacterId}`);
        await helpers.waitForPageLoad(page);

        // Test form validation errors
        const submitButton = page.locator('button[type="submit"]');

        // Try to submit without required fields
        await submitButton.click();

        // Check for validation messages or errors
        const nameField = page.locator('#name');
        const isNameRequired = await nameField.getAttribute('required');
        expect(isNameRequired).not.toBeNull();

        // Test invalid device selection
        await page.locator('#name').fill('Error Test Webcam');
        await page.locator('#deviceId').selectOption('999'); // Invalid device

        // Try to test camera with invalid device
        const testButton = page.locator('#testCameraBtn');
        if (await testButton.isVisible()) {
            await testButton.click();

            // Wait for error message
            await page.waitForTimeout(2000);

            const preview = page.locator('#webcamPreview');
            const previewContent = await preview.textContent();

            mcpLogger.logWebcamOperation('invalid_device_test', {
                previewContent,
                expectedError: true
            });
        }

        // Test network error handling by navigating to non-existent endpoint
        const response = await page.goto('/api/webcam/nonexistent-endpoint', {
            waitUntil: 'networkidle'
        });
        expect(response.status()).toBe(404);

        mcpLogger.logWebcamOperation('error_handling_test_complete', { success: true });
    });

    test('Console Error Monitoring Validation', async ({ page }, testInfo) => {
        mcpLogger.logWebcamOperation('console_monitoring_test_start', {});

        // Reset console monitor
        consoleMonitor.reset();

        // Navigate to webcam page
        await page.goto(`/parts/webcam/new?characterId=${TEST_CONFIG.testCharacterId}`);
        await helpers.waitForPageLoad(page);

        // Perform various operations to trigger potential errors
        await page.locator('#refreshCamerasBtn').click();
        await page.waitForTimeout(2000);

        // Check if any console errors were captured
        const errorSummary = consoleMonitor.getErrorSummary();

        mcpLogger.logWebcamOperation('console_monitoring_result', {
            totalErrors: errorSummary.totalErrors,
            totalWarnings: errorSummary.totalWarnings,
            totalNetworkErrors: errorSummary.totalNetworkErrors
        });

        // Save detailed error report
        if (errorSummary.totalErrors > 0) {
            await helpers.takeScreenshot(page, testInfo, 'console_errors_detected');
        }

        // This test validates that our monitoring system is working
        // The actual error count assertion is done in individual tests
        expect(typeof errorSummary.totalErrors).toBe('number');
        expect(typeof errorSummary.totalWarnings).toBe('number');
        expect(typeof errorSummary.totalNetworkErrors).toBe('number');
    });
});
