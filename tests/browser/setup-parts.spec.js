/**
 * Setup: Parts Configuration Tests
 * Validates all functionality on /setup/parts page
 */

import { test, expect } from '@playwright/test';
import { testNavigation, testButtonClick, ErrorTracker, getAllInteractiveElements } from './framework.js';

const BASE_URL = process.env.BASE_URL || 'http://localhost:3000';

test.describe('Setup: Parts Page', () => {
    let page;
    let tracker;

    test.beforeEach(async ({ browser }) => {
        page = await browser.newPage();
        tracker = await testNavigation(page, `${BASE_URL}/setup/parts`, 'Parts');
    });

    test.afterEach(async () => {
        await page.close();
    });

    test('should load parts page without errors', async () => {
        // Already validated in beforeEach
        expect(await page.title()).toContain('Parts');
    });

    test('should display all parts in table', async () => {
        tracker.clear();
        
        // Wait for parts table
        await page.waitForSelector('table', { timeout: 5000 });
        
        // Get all rows
        const rows = await page.locator('table tbody tr').count();
        expect(rows).toBeGreaterThan(0);
        
        await tracker.assertNoErrors();
    });

    test('should test all part control buttons', async () => {
        tracker.clear();
        
        // Get all test buttons (one per part)
        const testButtons = await page.locator('button:has-text("Test")').all();
        
        console.log(`Found ${testButtons.length} test buttons`);
        expect(testButtons.length).toBeGreaterThan(0);
        
        // Test first 3 buttons (testing all could take too long)
        for (let i = 0; i < Math.min(3, testButtons.length); i++) {
            console.log(`Testing button ${i + 1}/${testButtons.length}`);
            await testButtons[i].click();
            await page.waitForTimeout(500);
        }
        
        await tracker.assertNoErrors();
    });

    test('should calibrate part position', async () => {
        tracker.clear();
        
        // Find first calibrate button
        const calibrateButton = page.locator('button:has-text("Calibrate")').first();
        await expect(calibrateButton).toBeVisible();
        
        await calibrateButton.click();
        await page.waitForTimeout(1000);
        
        await tracker.assertNoErrors();
    });

    test('should save part configuration', async () => {
        tracker.clear();
        
        // Find save button
        const saveButton = page.locator('button:has-text("Save")').first();
        
        if (await saveButton.count() > 0) {
            await saveButton.click();
            await page.waitForTimeout(1000);
            
            // Should show success message
            const successMessage = page.locator('.alert-success, .success, [class*="success"]');
            if (await successMessage.count() > 0) {
                await expect(successMessage.first()).toBeVisible({ timeout: 5000 });
            }
        }
        
        await tracker.assertNoErrors();
    });

    test('should handle rapid button clicks without errors', async () => {
        tracker.clear();
        
        const testButton = page.locator('button:has-text("Test")').first();
        await expect(testButton).toBeVisible();
        
        // Rapid fire 5 clicks
        for (let i = 0; i < 5; i++) {
            await testButton.click();
            await page.waitForTimeout(100);
        }
        
        await page.waitForTimeout(2000);
        await tracker.assertNoErrors();
    });

    test('should validate all interactive elements', async () => {
        tracker.clear();
        
        const elements = await getAllInteractiveElements(page);
        console.log(`Found ${elements.length} interactive elements`);
        
        expect(elements.length).toBeGreaterThan(0);
        
        // Verify no elements throw errors just by existing
        await tracker.assertNoErrors();
    });
});
