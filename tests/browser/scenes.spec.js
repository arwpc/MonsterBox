/**
 * Scene Editor Tests
 * Validates all functionality on /scenes page
 */

import { test, expect } from '@playwright/test';
import { testNavigation, testButtonClick, ErrorTracker, getAllInteractiveElements } from './framework.js';

const BASE_URL = process.env.BASE_URL || 'http://localhost:3000';

test.describe('Scene Editor Page', () => {
    let page;
    let tracker;

    test.beforeEach(async ({ browser }) => {
        page = await browser.newPage();
        tracker = await testNavigation(page, `${BASE_URL}/scenes`, 'Scene');
    });

    test.afterEach(async () => {
        await page.close();
    });

    test('should load scenes page without errors', async () => {
        expect(await page.title()).toContain('Scene');
    });

    test('should display scene list', async () => {
        tracker.clear();
        
        // Wait for scenes to load
        await page.waitForSelector('.scene-list, [data-scenes], #scenes', { timeout: 5000 });
        
        await tracker.assertNoErrors();
    });

    test('should execute a scene', async () => {
        tracker.clear();
        
        // Find execute/play button
        const executeButton = page.locator('button:has-text("Execute"), button:has-text("Play"), .execute-btn').first();
        
        if (await executeButton.count() > 0) {
            await executeButton.click();
            
            // Wait for scene execution (scenes can take time)
            await page.waitForTimeout(3000);
            
            // Check for success message or completion indicator
            const statusIndicator = page.locator('.scene-status, [data-status], .status-message');
            if (await statusIndicator.count() > 0) {
                console.log('Scene status:', await statusIndicator.first().textContent());
            }
        }
        
        await tracker.assertNoErrors();
    });

    test('should stop scene execution', async () => {
        tracker.clear();
        
        // Start a scene first
        const executeButton = page.locator('button:has-text("Execute")').first();
        if (await executeButton.count() > 0) {
            await executeButton.click();
            await page.waitForTimeout(1000);
        }
        
        // Stop the scene
        const stopButton = page.locator('button:has-text("Stop"), .stop-btn').first();
        if (await stopButton.count() > 0) {
            await stopButton.click();
            await page.waitForTimeout(1000);
        }
        
        await tracker.assertNoErrors();
    });

    test('should create new scene', async () => {
        tracker.clear();
        
        // Find create/new button
        const createButton = page.locator('button:has-text("New"), button:has-text("Create"), .new-scene-btn').first();
        
        if (await createButton.count() > 0) {
            await createButton.click();
            await page.waitForTimeout(1000);
            
            // Should show scene editor or form
            const editor = page.locator('.scene-editor, form[name="scene"], #sceneEditor');
            if (await editor.count() > 0) {
                await expect(editor.first()).toBeVisible();
            }
        }
        
        await tracker.assertNoErrors();
    });

    test('should save scene', async () => {
        tracker.clear();
        
        // Find save button
        const saveButton = page.locator('button:has-text("Save"), .save-btn').first();
        
        if (await saveButton.count() > 0) {
            await saveButton.click();
            await page.waitForTimeout(2000);
            
            // Check for success message
            const successMessage = page.locator('.alert-success, .success');
            if (await successMessage.count() > 0) {
                console.log('Save message:', await successMessage.first().textContent());
            }
        }
        
        await tracker.assertNoErrors();
    });

    test('should delete scene', async () => {
        tracker.clear();
        
        // Find delete button
        const deleteButton = page.locator('button:has-text("Delete"), .delete-btn').first();
        
        if (await deleteButton.count() > 0) {
            // Handle confirmation dialog
            page.once('dialog', dialog => {
                console.log(`Delete confirmation: ${dialog.message()}`);
                dialog.dismiss(); // Don't actually delete in tests
            });
            
            await deleteButton.click();
            await page.waitForTimeout(1000);
        }
        
        await tracker.assertNoErrors();
    });

    test('should add step to scene', async () => {
        tracker.clear();
        
        // Find add step button
        const addStepButton = page.locator('button:has-text("Add Step"), .add-step-btn').first();
        
        if (await addStepButton.count() > 0) {
            await addStepButton.click();
            await page.waitForTimeout(1000);
        }
        
        await tracker.assertNoErrors();
    });

    test('should handle scene execution errors gracefully', async () => {
        tracker.clear();
        
        // Execute a scene
        const executeButton = page.locator('button:has-text("Execute")').first();
        if (await executeButton.count() > 0) {
            await executeButton.click();
            await page.waitForTimeout(5000);
            
            // Even if scene fails, page shouldn't have JS errors
            // Network errors (500) during execution are tracked by bulletproofExecutor
        }
        
        // Allow network errors from scene execution (they're handled)
        // Only check for console JS errors
        const errors = tracker.getErrors();
        expect(errors.console.length, 'Console errors found').toBe(0);
    });

    test('should validate all interactive elements', async () => {
        tracker.clear();
        
        const elements = await getAllInteractiveElements(page);
        console.log(`Found ${elements.length} interactive elements`);
        
        expect(elements.length).toBeGreaterThan(0);
        await tracker.assertNoErrors();
    });
});
