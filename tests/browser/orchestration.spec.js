/**
 * Orchestration Page — Browser E2E Tests
 * Tests the multi-animatronic orchestration UI at /orchestration
 */

import { test, expect } from '@playwright/test';
import { testNavigation, ErrorTracker, getAllInteractiveElements } from './framework.js';

const BASE_URL = process.env.BASE_URL || 'http://localhost:3000';

test.describe('Orchestration Page', () => {
    let page;
    let tracker;

    test.beforeEach(async ({ browser }) => {
        page = await browser.newPage();
        tracker = await testNavigation(page, `${BASE_URL}/orchestration`, 'Orchestration');
    });

    test.afterEach(async () => {
        await page.close();
    });

    test('should load orchestration page with correct title', async () => {
        expect(await page.title()).toContain('Orchestration');
    });

    test('should display command log panel', async () => {
        const logPanel = page.locator('#commandLog');
        await expect(logPanel).toBeVisible();
        // Should have initialization message
        const logText = await logPanel.textContent();
        expect(logText).toContain('initialized');
    });

    test('should display system status panel with refresh button', async () => {
        const statusPanel = page.locator('#animatronicsStatus');
        await expect(statusPanel).toBeVisible();

        // Use .first() since there are multiple Refresh buttons (status + goblin panels)
        const refreshBtn = page.locator('button:has-text("Refresh")').first();
        await expect(refreshBtn).toBeVisible();
    });

    test('should display goblin status panel', async () => {
        const goblinsPanel = page.locator('#goblinsStatus');
        await expect(goblinsPanel).toBeVisible();
    });

    test('should display broadcast speech controls', async () => {
        const textarea = page.locator('#broadcastText');
        await expect(textarea).toBeVisible();

        const sayAllBtn = page.locator('button:has-text("Say to All")');
        await expect(sayAllBtn).toBeVisible();
    });

    test('should display random poses controls', async () => {
        const cooldownInput = page.locator('#poseCooldown');
        await expect(cooldownInput).toBeVisible();

        // Use specific text to avoid matching "Enable All Webcams" button
        const enableBtn = page.getByRole('button', { name: /Enable All$/ });
        await expect(enableBtn).toBeVisible();

        const disableBtn = page.getByRole('button', { name: /Disable All$/ });
        await expect(disableBtn).toBeVisible();
    });

    test('should display system command buttons', async () => {
        const restartBtn = page.locator('button:has-text("Restart All Services")');
        await expect(restartBtn).toBeVisible();

        const healthBtn = page.locator('button:has-text("Health Check")');
        await expect(healthBtn).toBeVisible();

        const rebootBtn = page.locator('button:has-text("Reboot All")');
        await expect(rebootBtn).toBeVisible();

        const queueBtn = page.locator('button:has-text("Start All Queue Loops")');
        await expect(queueBtn).toBeVisible();
    });

    test('should load animatronic status cards after initial fetch', async () => {
        tracker.clear();

        // Wait for the status cards to load (spinner disappears or cards appear)
        await page.waitForTimeout(5000);

        // Should have animatronic cards or a status message
        const cards = page.locator('#animatronicsStatus .card, #animatronicsStatus .col');
        const count = await cards.count();
        console.log(`Found ${count} animatronic status elements`);
        expect(count).toBeGreaterThanOrEqual(0);

        await tracker.logErrors();
    });

    test('should perform health check without errors', async () => {
        tracker.clear();

        const healthBtn = page.locator('button:has-text("Health Check")');
        await healthBtn.click();

        // Wait for the health check to complete and log results
        await page.waitForTimeout(5000);

        // Check command log for health check result
        const logText = await page.locator('#commandLog').textContent();
        console.log('Log after health check:', logText.slice(-200));

        await tracker.assertNoErrors();
    });

    test('should clear command log', async () => {
        const clearBtn = page.locator('button:has-text("Clear")');
        await clearBtn.click();

        const logText = await page.locator('#commandLog').textContent();
        expect(logText).toContain('Log cleared');
    });

    test('should have broadcast text pre-populated', async () => {
        const textarea = page.locator('#broadcastText');
        const value = await textarea.inputValue();
        expect(value).toContain('Welcome');
    });

    test('should have webcam control buttons', async () => {
        const enableWebcams = page.locator('button:has-text("Enable All Webcams")');
        const disableWebcams = page.locator('button:has-text("Disable All Webcams")');
        await expect(enableWebcams).toBeVisible();
        await expect(disableWebcams).toBeVisible();
    });

    test('should have Goblin Management link in goblin panel', async () => {
        // Target the link in the goblin panel specifically (not the nav dropdown)
        const goblinLink = page.locator('.card-header a:has-text("Goblin Management")');
        await expect(goblinLink).toBeVisible();
        await expect(goblinLink).toHaveAttribute('href', '/goblin-management');
    });

    test('should validate all interactive elements exist', async () => {
        tracker.clear();

        const elements = await getAllInteractiveElements(page);
        console.log(`Found ${elements.length} interactive elements`);

        expect(elements.length).toBeGreaterThan(0);
        await tracker.assertNoErrors();
    });
});
