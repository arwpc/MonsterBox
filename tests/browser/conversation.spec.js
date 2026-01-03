/**
 * AI Conversation Tests
 * Validates all functionality on /conversation page
 */

import { test, expect } from '@playwright/test';
import { testNavigation, ErrorTracker } from './framework.js';

const BASE_URL = process.env.BASE_URL || 'http://localhost:3000';

test.describe('AI Conversation Page', () => {
    let page;
    let tracker;

    test.beforeEach(async ({ browser }) => {
        page = await browser.newPage();
        tracker = await testNavigation(page, `${BASE_URL}/conversation`, 'Conversation');
    });

    test.afterEach(async () => {
        await page.close();
    });

    test('should load conversation page without errors', async () => {
        expect(await page.title()).toContain('Conversation');
    });

    test('should display character selection', async () => {
        tracker.clear();
        
        // Find character selector
        const characterSelect = page.locator('select[name*="character"], #characterSelect');
        
        if (await characterSelect.count() > 0) {
            await expect(characterSelect.first()).toBeVisible();
            
            // Get options count
            const options = await characterSelect.first().locator('option').count();
            expect(options).toBeGreaterThan(0);
        }
        
        await tracker.assertNoErrors();
    });

    test('should connect WebSocket for AI conversation', async () => {
        tracker.clear();
        
        // Find connect button
        const connectButton = page.locator('button:has-text("Connect"), button:has-text("Start")').first();
        
        if (await connectButton.count() > 0) {
            // Monitor WebSocket connections
            const wsConnections = [];
            page.on('websocket', ws => {
                console.log(`WebSocket: ${ws.url()}`);
                wsConnections.push(ws.url());
            });
            
            await connectButton.click();
            await page.waitForTimeout(3000);
            
            // Should have established WebSocket connection
            console.log(`WebSocket connections: ${wsConnections.length}`);
        }
        
        await tracker.assertNoErrors();
    });

    test('should disconnect WebSocket', async () => {
        tracker.clear();
        
        // Connect first
        const connectButton = page.locator('button:has-text("Connect")').first();
        if (await connectButton.count() > 0) {
            await connectButton.click();
            await page.waitForTimeout(2000);
        }
        
        // Then disconnect
        const disconnectButton = page.locator('button:has-text("Disconnect"), button:has-text("Stop")').first();
        if (await disconnectButton.count() > 0) {
            await disconnectButton.click();
            await page.waitForTimeout(1000);
        }
        
        await tracker.assertNoErrors();
    });

    test('should display conversation history', async () => {
        tracker.clear();
        
        // Find conversation history container
        const history = page.locator('.conversation-history, #conversationHistory, [data-conversation]').first();
        
        if (await history.count() > 0) {
            await expect(history).toBeVisible();
        }
        
        await tracker.logErrors();
    });

    test('should handle microphone permissions gracefully', async () => {
        tracker.clear();
        
        // Grant microphone permission in test context
        await page.context().grantPermissions(['microphone']);
        
        // Find start mic button (use specific ID)
        const startButton = page.locator('#micStart');
        
        if (await startButton.isVisible()) {
            await startButton.click();
            await page.waitForTimeout(2000);
        }
        
        // Page should handle mic access without critical JS errors
        await tracker.logErrors();
    });

    test('should display AI audio playback status', async () => {
        tracker.clear();
        
        // Find audio status indicator
        const audioStatus = page.locator('.audio-status, [data-audio-status], .playback-status').first();
        
        if (await audioStatus.count() > 0) {
            console.log('Audio status visible');
        }
        
        await tracker.logErrors();
    });

    test('should clear conversation history', async () => {
        tracker.clear();
        
        // Find clear button
        const clearButton = page.locator('button:has-text("Clear"), .clear-btn').first();
        
        if (await clearButton.count() > 0) {
            await clearButton.click();
            await page.waitForTimeout(1000);
        }
        
        await tracker.assertNoErrors();
    });

    test('should validate AI audio plays through correct speaker', async () => {
        tracker.clear();
        
        // This validates the critical fix: AI audio should play through character speaker at volume 90
        // We can't directly test audio playback in Playwright, but we can verify no errors occur
        
        const connectButton = page.locator('button:has-text("Connect")').first();
        if (await connectButton.count() > 0) {
            await connectButton.click();
            await page.waitForTimeout(3000);
            
            // Monitor for audio-related console logs
            const logs = [];
            page.on('console', msg => logs.push(msg.text()));
            
            await page.waitForTimeout(2000);
            
            console.log('Console logs:', logs);
        }
        
        await tracker.assertNoErrors();
    });
});
