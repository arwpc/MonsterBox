/**
 * Setup Calibration Tests (Parts integrated into Calibration)
 * Validates functionality on /setup/calibration page
 * Note: /setup/parts was consolidated into /setup/calibration
 */

import { test, expect } from '@playwright/test';
import { testNavigation, testButtonClick, ErrorTracker, getAllInteractiveElements } from './framework.js';

const BASE_URL = process.env.BASE_URL || 'http://localhost:3000';

test.describe('Setup Calibration Page (Parts)', () => {
    let page;
    let tracker;

    test.beforeEach(async ({ browser }) => {
        page = await browser.newPage();
        tracker = await testNavigation(page, `${BASE_URL}/setup/calibration`, 'Calibration');
    });

    test.afterEach(async () => {
        await page.close();
    });

    test('should load calibration setup page without errors', async () => {
        expect(await page.title()).toContain('Calibration');
        await tracker.logErrors();
    });

    test('should display parts list or selector', async () => {
        tracker.clear();
        
        // Calibration page has select elements (model select, type select) and/or parts list
        // These may not be visible until a character is selected, but should be attached to DOM
        const selectCount = await page.locator('select').count();
        const tableCount = await page.locator('table').count();
        const partsCount = await page.locator('.parts-list, [data-parts], #partSelector').count();
        
        expect(selectCount + tableCount + partsCount).toBeGreaterThan(0);
        
        await tracker.logErrors();
    });

    test('should have calibration controls', async () => {
        tracker.clear();
        
        // Look for calibration-related controls
        const calibrationControls = page.locator('button, input[type="range"], .calibration-control, [data-calibration]');
        
        expect(await calibrationControls.count()).toBeGreaterThan(0);
        
        await tracker.logErrors();
    });

    test('should have character selector', async () => {
        tracker.clear();
        
        // Look for character filter/selector
        const charSelector = page.locator('select[name="character"], select[id*="character"], #characterSelector, .character-select').first();
        
        if (await charSelector.count() > 0) {
            const options = await charSelector.locator('option').allTextContents();
            console.log('Characters available:', options);
            expect(options.length).toBeGreaterThan(0);
        }
        
        await tracker.logErrors();
    });

    test('should handle part selection', async () => {
        tracker.clear();
        
        // Look for part type or part selector
        const partSelector = page.locator('select[name="part"], select[id*="part"], #partSelector, .part-select').first();
        
        if (await partSelector.count() > 0) {
            const options = await partSelector.locator('option').allTextContents();
            console.log('Parts available:', options);
        }
        
        await tracker.logErrors();
    });

    test('should handle API errors gracefully', async () => {
        tracker.clear();
        
        // Check for error handling UI elements
        const errorContainer = page.locator('.alert-danger, .error-message, [role="alert"]');
        
        // Should not have visible errors on normal load
        const visibleErrors = await errorContainer.filter({ hasText: /error/i }).count();
        expect(visibleErrors).toBe(0);
        
        await tracker.logErrors();
    });
});
