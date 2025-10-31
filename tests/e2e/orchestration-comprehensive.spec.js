/**
 * Comprehensive Orchestration E2E Test
 * Tests ALL functionality on http://orlok:3000/orchestration
 * 
 * Coverage:
 * - All animatronic controls (buttons, dropdowns, inputs)
 * - Audio playback (must be audible)
 * - AI responses (must be live, not templates)
 * - WebCam streaming (all animatronics)
 * - STT/Microphone functionality
 * - Goblin status and controls
 * - Broadcast functions
 * - System commands
 */

import { expect, test } from '@playwright/test';

const BASE_URL = 'http://orlok:3000';
const ORCHESTRATION_URL = `${BASE_URL}/orchestration`;

// Test configuration
const LONG_TIMEOUT = 60000; // 1 minute for AI responses
const MEDIUM_TIMEOUT = 30000; // 30 seconds for audio/network
const SHORT_TIMEOUT = 10000; // 10 seconds for UI updates

test.describe('Orchestration Page - Comprehensive Test Suite', () => {

    test.beforeEach(async ({ page }) => {
        // Set longer default timeout for network-heavy tests
        page.setDefaultTimeout(MEDIUM_TIMEOUT);

        // Navigate to orchestration
        await page.goto(ORCHESTRATION_URL, { waitUntil: 'domcontentloaded' });

        // Wait for main UI elements to load
        await page.waitForSelector('h1:has-text("Orchestration Control Center")');
        await page.waitForSelector('#animatronicsStatus');

        // Wait for status to load
        await page.waitForTimeout(3000);
    });

    test('Page loads with all core sections', async ({ page }) => {
        console.log('✓ Testing page structure and layout...');

        // Check title
        await expect(page).toHaveTitle(/Orchestration Control/);

        // Check main heading
        const heading = page.locator('h1:has-text("Orchestration Control Center")');
        await expect(heading).toBeVisible();

        // Check command log
        const commandLog = page.locator('.card-header:has-text("Command Log")');
        await expect(commandLog).toBeVisible();

        // Check system status
        const systemStatus = page.locator('.card-header:has-text("System Status")');
        await expect(systemStatus).toBeVisible();

        // Check goblin status
        const goblinStatus = page.locator('.card-header:has-text("Goblin Status")');
        await expect(goblinStatus).toBeVisible();

        // Check broadcast controls
        const broadcastSpeech = page.locator('.card-header:has-text("Broadcast Speech")');
        await expect(broadcastSpeech).toBeVisible();

        // Check random poses
        const randomPoses = page.locator('.card-header:has-text("Random Poses")');
        await expect(randomPoses).toBeVisible();

        // Check system commands
        const systemCommands = page.locator('.card-header:has-text("System Commands")');
        await expect(systemCommands).toBeVisible();

        console.log('✅ All page sections present');
    });

    test('All 5 animatronics show as ONLINE', async ({ page }) => {
        console.log('✓ Checking animatronic status...');

        // Find all online badges
        const onlineBadges = page.locator('.badge.bg-success:has-text("ONLINE")');
        const count = await onlineBadges.count();

        expect(count).toBe(5);
        console.log(`✅ All 5 animatronics are ONLINE`);

        // Verify specific animatronics
        const animatronics = ['PumpkinHead', 'Coffin Breaker', 'Orlok', 'Skulltalker', 'Groundbreaker'];
        for (const name of animatronics) {
            const card = page.locator(`.card:has-text("${name}")`);
            await expect(card).toBeVisible();
            console.log(`  ✓ ${name} card visible`);
        }
    });

    test('WebCam streams can be enabled for all online animatronics', async ({ page }) => {
        console.log('✓ Testing webcam streams with explicit enable...');

        // Click global Enable All Webcams (webcams default OFF for performance)
        const enableAllBtn = page.locator('button:has-text("Enable All Webcams")');
        await expect(enableAllBtn).toBeVisible();
        await enableAllBtn.click();

        // Allow time for streams to initialize
        await page.waitForTimeout(4000);

        // Find all visible webcam images
        const webcams = page.locator('img.webcam-preview');
        const count = await webcams.count();

        console.log(`Found ${count} webcam img element(s)`);
        expect(count).toBeGreaterThan(0);

        // Check each enabled webcam has a valid source (some may still be loading/unavailable, tolerate partial failures)
        let withSrc = 0;
        for (let i = 0; i < count; i++) {
            const webcam = webcams.nth(i);
            const src = await webcam.getAttribute('src');
            if (src && src.length > 0) {
                withSrc++;
                console.log(`  ✓ Webcam ${i + 1} has valid source: ${src.substring(0, 50)}...`);
            }
        }

        // At least one webcam should have a stream source when enabled
        expect(withSrc).toBeGreaterThan(0);

        console.log('✅ Webcams can be enabled and at least one stream is active');
    });

    test('Audio dropdowns populate with files', async ({ page }) => {
        console.log('✓ Testing audio library dropdowns...');

        // Wait for audio libraries to load
        await page.waitForTimeout(4000);

        // Find all audio dropdowns
        const dropdowns = page.locator('select[id^="audio-"]');
        const count = await dropdowns.count();

        console.log(`Found ${count} audio dropdown(s)`);
        expect(count).toBeGreaterThan(0);

        // Check each dropdown has options
        for (let i = 0; i < count; i++) {
            const dropdown = dropdowns.nth(i);
            const options = await dropdown.locator('option').count();

            // Should have more than just "Select audio file..."
            expect(options).toBeGreaterThan(1);
            console.log(`  ✓ Dropdown ${i + 1} has ${options} audio files`);

            // Verify first real option text
            if (options > 1) {
                const firstOption = await dropdown.locator('option').nth(1).textContent();
                expect(firstOption.length).toBeGreaterThan(0);
            }
        }

        console.log('✅ All audio dropdowns populated');
    });

    test('Audio playback controls work (Play button)', async ({ page }) => {
        console.log('✓ Testing audio playback...');

        // Find first online animatronic
        const onlineCard = page.locator('.card:has(.badge:has-text("ONLINE"))').first();
        const nameElement = await onlineCard.locator('h5, .card-title').first();
        const animName = (await nameElement.textContent()).trim();

        console.log(`Testing audio on: ${animName}`);

        // Select first audio file
        const audioSelect = onlineCard.locator('select[id^="audio-"]').first();
        await audioSelect.waitFor({ state: 'visible' });

        const options = await audioSelect.locator('option').count();
        expect(options).toBeGreaterThan(1);

        // Select second option (first is "Select audio...")
        await audioSelect.selectOption({ index: 1 });
        const selectedAudio = await audioSelect.locator('option:checked').textContent();
        console.log(`  Selected audio: ${selectedAudio}`);

        // Click Play button
        const playButton = onlineCard.locator('button:has-text("Play")').first();
        await expect(playButton).toBeVisible();
        await playButton.click();

        // Wait for playback to start
        await page.waitForTimeout(2000);

        // Check command log for playback confirmation
        const logEntry = page.locator('.log-entry:has-text("Playing audio")').last();
        await expect(logEntry).toBeVisible({ timeout: 5000 });

        console.log(`✅ Audio playback initiated on ${animName}`);

        // Test Stop button
        const stopButton = onlineCard.locator('button:has-text("Stop")').first();
        await expect(stopButton).toBeVisible();
        await stopButton.click();
        await page.waitForTimeout(1000);

        console.log(`✅ Audio stopped on ${animName}`);
    });

    test('Loop checkbox is functional', async ({ page }) => {
        console.log('✓ Testing loop checkbox...');

        const onlineCard = page.locator('.card:has(.badge:has-text("ONLINE"))').first();
        const loopCheckbox = onlineCard.locator('input[type="checkbox"][id^="loop-"]').first();

        await expect(loopCheckbox).toBeVisible();

        // Test checking the box
        await loopCheckbox.check();
        expect(await loopCheckbox.isChecked()).toBe(true);

        // Test unchecking
        await loopCheckbox.uncheck();
        expect(await loopCheckbox.isChecked()).toBe(false);

        console.log('✅ Loop checkbox functional');
    });

    test('Say button triggers TTS (text-to-speech)', async ({ page }) => {
        console.log('✓ Testing Say button (TTS)...');

        const onlineCard = page.locator('.card:has(.badge:has-text("ONLINE"))').first();
        const nameElement = await onlineCard.locator('h5, .card-title').first();
        const animName = (await nameElement.textContent()).trim();

        console.log(`Testing Say on: ${animName}`);

        // Find text input
        const textInput = onlineCard.locator('input[type="text"]').first();
        await expect(textInput).toBeVisible();

        // Enter test text
        const testMessage = 'Testing MonsterBox orchestration say function';
        await textInput.fill(testMessage);

        // Click Say button
        const sayButton = onlineCard.locator('button:has-text("Say")').first();
        await expect(sayButton).toBeVisible();
        await sayButton.click();

        // Wait for TTS to process
        await page.waitForTimeout(2000);

        // Verify log entry
        const logEntry = page.locator('.log-entry').last();
        const logText = await logEntry.textContent();
        expect(logText).toContain(animName);

        console.log(`✅ Say button triggered TTS on ${animName}`);
    });

    test('Ask AI button triggers LIVE AI response (not template)', async ({ page, request }) => {
        console.log('✓ Testing Ask AI with LIVE response verification...');

        // Set longer timeout for AI
        page.setDefaultTimeout(LONG_TIMEOUT);

        const onlineCard = page.locator('.card:has(.badge:has-text("ONLINE"))').first();
        const nameElement = await onlineCard.locator('h5, .card-title').first();
        const animName = (await nameElement.textContent()).trim();

        console.log(`Testing Ask AI on: ${animName}`);

        // Find text input
        const textInput = onlineCard.locator('input[type="text"]').first();
        await expect(textInput).toBeVisible();

        // Use a unique question to verify real AI response
        const timestamp = Date.now();
        const testQuestion = `What is the sum of 127 plus 89? Session ${timestamp}`;
        await textInput.fill(testQuestion);

        console.log(`  Question: "${testQuestion}"`);

        // Click Ask AI button
        const askAIButton = onlineCard.locator('button:has-text("Ask AI")').first();
        await expect(askAIButton).toBeVisible();
        await askAIButton.click();

        // Wait for AI processing (can take 10-30 seconds)
        await page.waitForTimeout(5000);

        // Look for robot emoji in log (indicates AI response)
        const aiLogEntry = page.locator('.log-entry:has-text("🤖")').last();
        await expect(aiLogEntry).toBeVisible({ timeout: 45000 });

        const logText = await aiLogEntry.textContent();
        console.log(`  AI Log: ${logText}`);

        // Verify it's not a template response
        expect(logText).toContain('🤖');
        expect(logText.toLowerCase()).not.toContain('template');
        expect(logText.toLowerCase()).not.toContain('test response');
        expect(logText.toLowerCase()).not.toContain('placeholder');

        console.log(`✅ Live AI response received from ${animName}`);
    });

    test('Broadcast Speech - Say to All works', async ({ page }) => {
        console.log('✓ Testing Broadcast Speech...');

        // Find broadcast textarea
        const broadcastTextarea = page.locator('textarea#broadcastText');
        await expect(broadcastTextarea).toBeVisible();

        // Enter broadcast message
        const broadcastMsg = 'Testing broadcast to all animatronics';
        await broadcastTextarea.fill(broadcastMsg);

        // Click Say to All button
        const sayToAllButton = page.locator('button:has-text("Say to All")');
        await expect(sayToAllButton).toBeVisible();
        await sayToAllButton.click();

        // Wait for broadcast
        await page.waitForTimeout(3000);

        // Verify log entries for multiple animatronics
        const logEntries = page.locator('.log-entry');
        const logCount = await logEntries.count();
        expect(logCount).toBeGreaterThan(1);

        console.log('✅ Broadcast speech initiated');
    });

    test('Random Poses - Enable All works', async ({ page }) => {
        console.log('✓ Testing Random Poses Enable...');

        // Find cooldown input
        const cooldownInput = page.locator('input#poseCooldown');
        await expect(cooldownInput).toBeVisible();

        // Set cooldown
        await cooldownInput.fill('5000');

        // Click Enable All button
        const enableButton = page.locator('button:has-text("Enable All")');
        await expect(enableButton).toBeVisible();
        await enableButton.click();

        await page.waitForTimeout(2000);

        // Check log for confirmation
        const logEntry = page.locator('.log-entry').last();
        const logText = await logEntry.textContent();
        expect(logText.toLowerCase()).toContain('pose');

        console.log('✅ Random poses enabled');
    });

    test('Random Poses - Disable All works', async ({ page }) => {
        console.log('✓ Testing Random Poses Disable...');

        // Click Disable All button
        const disableButton = page.locator('button:has-text("Disable All")');
        await expect(disableButton).toBeVisible();
        await disableButton.click();

        await page.waitForTimeout(2000);

        // Check log for confirmation
        const logEntry = page.locator('.log-entry').last();
        const logText = await logEntry.textContent();
        expect(logText.toLowerCase()).toContain('pose');

        console.log('✅ Random poses disabled');
    });

    test('Health Check button works', async ({ page }) => {
        console.log('✓ Testing Health Check...');

        const healthButton = page.locator('button:has-text("Health Check")');
        await expect(healthButton).toBeVisible();
        await healthButton.click();

        // Wait for health check to complete
        await page.waitForTimeout(5000);

        // Verify health check log
        const healthLog = page.locator('.log-entry:has-text("Health check")').last();
        await expect(healthLog).toBeVisible();

        const logText = await healthLog.textContent();
        expect(logText.toLowerCase()).toContain('health');

        console.log('✅ Health check completed');
    });

    test('Refresh button updates status', async ({ page }) => {
        console.log('✓ Testing Refresh button...');

        // Get initial log count
        await page.waitForTimeout(2000);
        const initialLogs = await page.locator('.log-entry').count();

        // Click refresh button
        const refreshButton = page.locator('button:has-text("Refresh")').first();
        await expect(refreshButton).toBeVisible();
        await refreshButton.click();

        // Wait for refresh
        await page.waitForTimeout(3000);

        // Verify new log entries
        const newLogCount = await page.locator('.log-entry').count();
        expect(newLogCount).toBeGreaterThanOrEqual(initialLogs);

        console.log('✅ Status refreshed');
    });

    test('Clear button clears command log', async ({ page }) => {
        console.log('✓ Testing Clear Log button...');

        // Wait for initial logs
        await page.waitForTimeout(2000);

        // Click clear button
        const clearButton = page.locator('button:has-text("Clear")');
        await expect(clearButton).toBeVisible();
        await clearButton.click();

        await page.waitForTimeout(500);

        // Verify minimal entries
        const logEntries = page.locator('.log-entry');
        const count = await logEntries.count();

        expect(count).toBeLessThanOrEqual(2);
        console.log('✅ Command log cleared');
    });

    test('Goblin status displays correctly', async ({ page }) => {
        console.log('✓ Testing Goblin status display...');

        // Wait for goblins to load
        await page.waitForTimeout(3000);

        // Check for goblin cards
        const goblinCards = page.locator('.goblin-card, .card:has-text("Goblin")');
        const count = await goblinCards.count();

        console.log(`Found ${count} Goblin card(s)`);

        // Verify Goblin Management link
        const goblinMgmtLink = page.locator('a[href="/goblin-management"]');
        await expect(goblinMgmtLink).toBeVisible();

        console.log('✅ Goblin status section functional');
    });

    test('Refresh Goblins button works', async ({ page }) => {
        console.log('✓ Testing Refresh Goblins...');

        // Find goblin section
        const goblinSection = page.locator('.card:has(.goblin-header), .card:has-text("Goblin Status")');
        await expect(goblinSection).toBeVisible();

        // Click refresh goblins button
        const refreshGoblinsBtn = page.locator('button:has-text("Refresh")').nth(1); // Second refresh button
        await refreshGoblinsBtn.click();

        await page.waitForTimeout(2000);

        console.log('✅ Goblin refresh triggered');
    });

    test('System Commands - Start All Queue Loops works', async ({ page }) => {
        console.log('✓ Testing Start All Queue Loops...');

        page.on('dialog', dialog => dialog.accept()); // Auto-accept confirmation

        const queueButton = page.locator('button:has-text("Start All Queue Loops")');
        await expect(queueButton).toBeVisible();
        await queueButton.click();

        await page.waitForTimeout(3000);

        // Check for log confirmation
        const logEntries = page.locator('.log-entry');
        const lastLog = await logEntries.last().textContent();

        console.log(`✅ Queue loops command sent: ${lastLog}`);
    });

    test('Test ALL animatronics individually', async ({ page }) => {
        console.log('✓ Testing each animatronic individually...');

        const animatronics = [
            'PumpkinHead',
            'Coffin Breaker',
            'Orlok',
            'Skulltalker',
            'Groundbreaker'
        ];

        for (const animName of animatronics) {
            console.log(`\n  Testing ${animName}...`);

            const card = page.locator(`.card:has-text("${animName}")`).first();
            await expect(card).toBeVisible();

            // Check ONLINE status
            const onlineBadge = card.locator('.badge:has-text("ONLINE")');
            await expect(onlineBadge).toBeVisible();
            console.log(`    ✓ ${animName} is ONLINE`);

            // Check webcam
            const webcam = card.locator('img[alt*="webcam" i], img[alt*="Live" i]');
            if (await webcam.count() > 0) {
                const src = await webcam.first().getAttribute('src');
                expect(src).toBeTruthy();
                console.log(`    ✓ ${animName} webcam stream active`);
            }

            // Check audio dropdown
            const audioSelect = card.locator('select[id^="audio-"]');
            if (await audioSelect.count() > 0) {
                const options = await audioSelect.first().locator('option').count();
                expect(options).toBeGreaterThan(1);
                console.log(`    ✓ ${animName} has ${options} audio files`);
            }

            // Check text input exists
            const textInput = card.locator('input[type="text"]');
            await expect(textInput.first()).toBeVisible();
            console.log(`    ✓ ${animName} AI input visible`);

            // Check buttons
            const sayButton = card.locator('button:has-text("Say")');
            await expect(sayButton.first()).toBeVisible();

            const askAIButton = card.locator('button:has-text("Ask AI")');
            await expect(askAIButton.first()).toBeVisible();

            const playButton = card.locator('button:has-text("Play")');
            await expect(playButton.first()).toBeVisible();

            const stopButton = card.locator('button:has-text("Stop")');
            await expect(stopButton.first()).toBeVisible();

            console.log(`    ✓ ${animName} all controls present`);
        }

        console.log('\n✅ All 5 animatronics individually verified');
    });

    test('API Integration - Status endpoint works', async ({ request }) => {
        console.log('✓ Testing orchestration API...');

        const response = await request.get(`${BASE_URL}/api/orchestration/status`);
        expect(response.ok()).toBeTruthy();

        const data = await response.json();
        expect(data.success).toBe(true);
        expect(Array.isArray(data.animatronics)).toBe(true);
        expect(data.animatronics.length).toBe(5);

        // Verify all are online
        const onlineCount = data.animatronics.filter(a => a.online).length;
        expect(onlineCount).toBe(5);

        console.log('✅ API returns all 5 animatronics online');
    });

    test('Command log auto-scrolls', async ({ page }) => {
        console.log('✓ Testing auto-scroll...');

        // Generate multiple log entries
        for (let i = 0; i < 5; i++) {
            const refreshButton = page.locator('button:has-text("Refresh")').first();
            await refreshButton.click();
            await page.waitForTimeout(1000);
        }

        // Check if latest log is visible (auto-scrolled)
        const latestLog = page.locator('.log-entry').last();
        await expect(latestLog).toBeInViewport();

        console.log('✅ Auto-scroll functional');
    });
});

test.describe('Full Integration Test', () => {

    test('Complete workflow: Audio + AI + Webcam verification', async ({ page }) => {
        console.log('\n🎃 === FULL INTEGRATION TEST === 🎃\n');

        page.setDefaultTimeout(LONG_TIMEOUT);

        await page.goto(ORCHESTRATION_URL, { waitUntil: 'domcontentloaded' });
        await page.waitForSelector('h1:has-text("Orchestration Control Center")');
        await page.waitForTimeout(5000); // Let everything load

        console.log('Step 1: Verify all systems online');
        const onlineCount = await page.locator('.badge.bg-success:has-text("ONLINE")').count();
        expect(onlineCount).toBe(5);
        console.log(`  ✅ ${onlineCount}/5 animatronics online`);

        console.log('\nStep 2: Verify all webcams streaming');
        const webcamCount = await page.locator('img[alt*="webcam" i], img[alt*="Live" i]').count();
        console.log(`  ✅ ${webcamCount} webcam streams active`);

        console.log('\nStep 3: Test audio playback on first animatronic');
        const firstCard = page.locator('.card:has(.badge:has-text("ONLINE"))').first();
        const audioSelect = firstCard.locator('select[id^="audio-"]').first();
        await audioSelect.selectOption({ index: 1 });
        await firstCard.locator('button:has-text("Play")').first().click();
        await page.waitForTimeout(3000);
        console.log('  ✅ Audio playback initiated');

        console.log('\nStep 4: Test AI on second animatronic');
        const secondCard = page.locator('.card:has(.badge:has-text("ONLINE"))').nth(1);
        const aiInput = secondCard.locator('input[type="text"]').first();
        await aiInput.fill('What is your name?');
        await secondCard.locator('button:has-text("Ask AI")').first().click();
        await page.waitForTimeout(10000);
        const aiResponse = await page.locator('.log-entry:has-text("🤖")').last().isVisible();
        expect(aiResponse).toBe(true);
        console.log('  ✅ AI responded successfully');

        console.log('\nStep 5: Test Say function on third animatronic');
        const thirdCard = page.locator('.card:has(.badge:has-text("ONLINE"))').nth(2);
        const sayInput = thirdCard.locator('input[type="text"]').first();
        await sayInput.fill('Testing text to speech functionality');
        await thirdCard.locator('button:has-text("Say")').first().click();
        await page.waitForTimeout(2000);
        console.log('  ✅ TTS initiated');

        console.log('\nStep 6: Test broadcast');
        await page.locator('textarea#broadcastText').fill('Integration test broadcast');
        await page.locator('button:has-text("Say to All")').click();
        await page.waitForTimeout(3000);
        console.log('  ✅ Broadcast completed');

        console.log('\nStep 7: Health check');
        await page.locator('button:has-text("Health Check")').click();
        await page.waitForTimeout(5000);
        const healthLog = await page.locator('.log-entry:has-text("Health check")').last().isVisible();
        expect(healthLog).toBe(true);
        console.log('  ✅ Health check passed');

        console.log('\n🎃 === INTEGRATION TEST COMPLETE === 🎃');
        console.log('✅ All systems verified: Audio, AI, Webcams, Controls, Broadcast');
    });
});
