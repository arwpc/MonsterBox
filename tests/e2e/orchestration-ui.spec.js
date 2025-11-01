/** @core
 * Orchestration UI E2E Tests
 * Tests the complete orchestration control panel UI including:
 * - Command log display
 * - Webcam streaming from each animatronic
 * - Audio library dropdown population and playback controls
 * - AI chat functionality (Say and Ask AI buttons)
 * - Broadcast features
 * - Health check
 */

import { expect, test } from '@playwright/test';
const ORCHESTRATION_URL = `/orchestration`;

test.describe('Orchestration Control Panel', () => {
    test.beforeEach(async ({ page }) => {
        // Navigate to orchestration page
        await page.goto(ORCHESTRATION_URL);
        await page.waitForLoadState('domcontentloaded');
        // Wait for page to initialize on our layout (container-fluid)
        await page.waitForSelector('h1:has-text("Orchestration Control Center")');
        await page.waitForSelector('#animatronicsStatus');
    });

    test('should load orchestration page successfully', async ({ page }) => {
        // Verify page title
        await expect(page).toHaveTitle(/Orchestration Control/);

        // Verify main heading
        const heading = page.locator('h1:has-text("Orchestration Control Center")');
        await expect(heading).toBeVisible();

        // Verify command log section exists
        const commandLog = page.locator('.card .card-header:has-text("Command Log")');
        await expect(commandLog).toBeVisible();

        // Verify system status section exists
        const systemStatus = page.locator('.card .card-header:has-text("System Status")');
        await expect(systemStatus).toBeVisible();
    });

    test('command log should display initialization message', async ({ page }) => {
        // Check for initial log message
        const logMessage = page.locator('.log-entry:has-text("Orchestration Control Center initialized")');
        await expect(logMessage).toBeVisible();
    });

    test('should display online animatronics', async ({ page }) => {
        // Wait for status refresh
        await page.waitForTimeout(2000);

        // Check for online animatronics
        const onlineBadges = page.locator('.badge.bg-success:has-text("ONLINE")');
        const count = await onlineBadges.count();

        expect(count).toBeGreaterThan(0);
        console.log(`Found ${count} online animatronic(s)`);
    });

    test('webcam streams should load for online animatronics', async ({ page }) => {
        const onlineAnimatronics = page.locator('.animatronic-card:has(.status-online)');
        const count = await onlineAnimatronics.count();
        console.log(`Found ${count} online animatronic(s)`);
        expect(count).toBeGreaterThan(0);

        // Click the "Enable All Webcams" button
        await page.click('button:has-text("Enable All Webcams")');

        // Add a small delay to allow for the stream to be initialized
        await page.waitForTimeout(1000);

        // Now check that the webcam image source is set correctly
        const webcamImages = page.locator('.webcam-preview');
        if (await webcamImages.count() > 0) {
            console.log(`Found ${await webcamImages.count()} webcam stream(s)`);
            const firstWebcam = webcamImages.first();
            const src = await firstWebcam.getAttribute('src');
            expect(src).not.toBe('');
            expect(src).toContain('/api/orchestration/animatronic/');
        }
    });

    test('audio dropdowns should populate with files', async ({ page }) => {
        // Wait for audio files to load
        await page.waitForTimeout(3000);

        // Find all audio dropdowns
        const dropdowns = page.locator('select:has(option:has-text("Select audio file..."))');
        const count = await dropdowns.count();

        expect(count).toBeGreaterThan(0);

        // Check first online animatronic's dropdown
        if (count > 0) {
            const firstDropdown = dropdowns.first();
            const options = await firstDropdown.locator('option').count();

            // Should have more than just the "Select audio file..." option
            expect(options).toBeGreaterThan(1);
            console.log(`First dropdown has ${options} audio file(s)`);
        }
    });

    test('say button should trigger speech', async ({ page }) => {
        // Find first online animatronic card
        const onlineCard = page.locator('.card:has(.badge:has-text("ONLINE"))').first();

        // Get animatronic name
        const nameElement = await onlineCard.locator('h5').first();
        const animName = await nameElement.textContent();
        console.log(`Testing Say button on: ${animName}`);

        // Fill in text input
        const textInput = onlineCard.locator('input[type="text"]').first();
        await textInput.fill('Testing orchestration say button');

        // Click Say button
        const sayButton = onlineCard.locator('button:has-text("Say")').first();
        await sayButton.click();

        // Wait for log entry
        await page.waitForTimeout(2000);

        // Verify log message appears
        const logEntry = page.locator('.log-entry:has-text("Making")').first();
        await expect(logEntry).toBeVisible();
    });

    test('ask AI button should trigger AI response', async ({ page }) => {
        // Find first online animatronic card
        const onlineCard = page.locator('.card:has(.badge:has-text("ONLINE"))').first();

        // Get animatronic name
        const nameElement = await onlineCard.locator('h5').first();
        const animName = await nameElement.textContent();
        console.log(`Testing Ask AI button on: ${animName}`);

        // Fill in text input
        const textInput = onlineCard.locator('input[type="text"]').first();
        await textInput.fill('What are you?');

        // Click Ask AI button
        const askButton = onlineCard.locator('button:has-text("Ask AI")').first();
        await askButton.click();

        // Wait for AI response
        await page.waitForTimeout(5000);

        // Verify AI response appears in log with robot emoji
        const aiLogEntry = page.locator('.log-entry:has-text("🤖")').first();
        await expect(aiLogEntry).toBeVisible();
    });

    test('health check button should work', async ({ page }) => {
        // Find and click health check button
        const healthButton = page.locator('button:has-text("Health Check")');
        await healthButton.click();

        // Wait for health check to complete
        await page.waitForTimeout(5000);

        // Verify health check log message
        const healthLog = page.locator('.log-entry:has-text("Health check complete")');
        await expect(healthLog).toBeVisible();
    });

    test('refresh button should update status', async ({ page }) => {
        // Get initial timestamp
        await page.waitForTimeout(2000);
        const initialLogs = await page.locator('.log-entry').count();

        // Click refresh button
        const refreshButton = page.locator('button:has-text("Refresh")').first();
        await refreshButton.click();

        // Wait for refresh
        await page.waitForTimeout(2000);

        // Verify new log entry appeared
        const newLogCount = await page.locator('.log-entry').count();
        expect(newLogCount).toBeGreaterThan(initialLogs);

        // Verify refresh log message
        const refreshLog = page.locator('.log-entry:has-text("Status refreshed successfully")').first();
        await expect(refreshLog).toBeVisible();
    });

    test('audio controls should be visible on online animatronics', async ({ page }) => {
        // Find first online animatronic
        const onlineCard = page.locator('.card:has(.badge:has-text("ONLINE"))').first();

        // Verify Play button
        const playButton = onlineCard.locator(':scope button:has-text("Play")').first();
        await expect(playButton).toBeVisible();

        // Verify Stop button
        const stopButton = onlineCard.locator(':scope button:has-text("Stop")').first();
        await expect(stopButton).toBeVisible();

        // Verify Loop checkbox
        const loopCheckbox = onlineCard.locator(':scope input[type="checkbox"]').first();
        await expect(loopCheckbox).toBeVisible();
    });

    test('AI chat controls should be visible on online animatronics', async ({ page }) => {
        // Find first online animatronic
        const onlineCard = page.locator('.card:has(.badge:has-text("ONLINE"))').first();

        // Verify Ask AI button
        const askButton = onlineCard.locator(':scope button:has-text("Ask AI")').first();
        await expect(askButton).toBeVisible();

        // Verify Say button
        const sayButton = onlineCard.locator(':scope button:has-text("Say")').first();
        await expect(sayButton).toBeVisible();

        // Verify text input
        const textInput = onlineCard.locator(':scope input[type="text"]').first();
        await expect(textInput).toBeVisible();
    });

    test('broadcast controls should be visible', async ({ page }) => {
        // Verify Say to All button
        const sayToAllButton = page.locator('button:has-text("Say to All")');
        await expect(sayToAllButton).toBeVisible();

        // Verify broadcast message textbox
        const broadcastTextbox = page.locator('textarea[placeholder*="Enter message..."]');
        await expect(broadcastTextbox).toBeVisible();

        // Verify Random Poses controls
        const randomPosesCard = page.locator('.card:has-text("Random Poses")');
        const enablePosesButton = randomPosesCard.locator('button:has-text("Enable All")');
        await expect(enablePosesButton).toBeVisible();

        const disablePosesButton = randomPosesCard.locator('button:has-text("Disable All")');
        await expect(disablePosesButton).toBeVisible();
    });

    test('system commands should be visible', async ({ page }) => {
        // Verify Restart All Services button
        const restartButton = page.locator('button:has-text("Restart All Services")');
        await expect(restartButton).toBeVisible();

        // Verify Health Check button
        const healthButton = page.locator('button:has-text("Health Check")');
        await expect(healthButton).toBeVisible();

        // Verify Start All Queue Loops button
        const queueButton = page.locator('button:has-text("Start All Queue Loops")');
        await expect(queueButton).toBeVisible();
    });

    test('command log should auto-scroll to bottom', async ({ page }) => {
        // Get log container
        const logContainer = page.locator('.log-output');

        // Trigger multiple status refreshes to generate log entries
        for (let i = 0; i < 3; i++) {
            const refreshButton = page.locator('button:has-text("Refresh")').first();
            await refreshButton.click();
            await page.waitForTimeout(1000);
        }

        // Check if latest log entry is visible (should auto-scroll)
        const latestLog = page.locator('.log-entry').last();
        await expect(latestLog).toBeInViewport();
    });

    test('clear button should clear command log', async ({ page }) => {
        // Wait for initial logs
        await page.waitForTimeout(2000);

        // Click clear button
        const clearButton = page.locator('button:has-text("Clear")');
        await clearButton.click();

        // Wait briefly
        await page.waitForTimeout(500);

        // Verify only the initialization message remains (or log is empty)
        const logEntries = page.locator('.log-entry');
        const count = await logEntries.count();

        // After clear, should have minimal entries
        expect(count).toBeLessThanOrEqual(2);
    });
});

test.describe('Orchestration API Integration', () => {
    test('status API should return animatronics list', async ({ request }) => {
        const response = await request.get(`/api/orchestration/status`);
        expect(response.ok()).toBeTruthy();

        const data = await response.json();
        expect(data.success).toBe(true);
        expect(data.animatronics).toBeDefined();
        expect(Array.isArray(data.animatronics)).toBe(true);
        expect(data.animatronics.length).toBeGreaterThan(0);
    });

    test('health check API should work', async ({ request }) => {
        const response = await request.post(`/api/orchestration/health-check`);
        expect(response.ok()).toBeTruthy();
        const data = await response.json();
        expect(data.success).toBe(true);
        expect(Array.isArray(data.animatronics)).toBe(true);
    });
});
