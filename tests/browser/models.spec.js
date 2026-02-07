/**
 * Models Page Browser Tests
 * Validates /setup/models page UI and interactions
 */

import { test, expect } from '@playwright/test';
import { testNavigation, ErrorTracker } from './framework.js';

const BASE_URL = process.env.BASE_URL || 'http://localhost:3000';

test.describe('Models Page', () => {
    let page;
    let tracker;

    test.beforeEach(async ({ browser }) => {
        page = await browser.newPage();
        tracker = await testNavigation(page, `${BASE_URL}/setup/models`, 'Models');
    });

    test.afterEach(async () => {
        await page.close();
    });

    test('should load models page without errors', async () => {
        expect(await page.title()).toContain('Models');
        await expect(page.locator('#typeSelect')).toBeVisible();
        await expect(page.locator('#modelsTable')).toBeVisible();
        await tracker.logErrors();
    });

    test('should have type selector with all part types', async () => {
        const options = await page.locator('#typeSelect option').allTextContents();
        expect(options).toContain('Servo');
        expect(options).toContain('Linear Actuator');
        expect(options).toContain('Motor (DC)');
        expect(options).toContain('Stepper Motor');
        expect(options).toContain('LED');
        expect(options).toContain('Light');
        expect(options).toContain('Microphone');
        expect(options).toContain('Speaker');
        expect(options).toContain('WebCam');
        expect(options).toContain('Head Tracking');
        await tracker.logErrors();
    });

    test('should auto-load models on initial page load', async () => {
        // Default type is servo - should have loaded automatically
        await page.waitForSelector('#modelsTable tbody tr', { timeout: 5000 });
        const rows = await page.locator('#modelsTable tbody tr').count();
        expect(rows).toBeGreaterThan(0);
        await tracker.logErrors();
    });

    test('should auto-refresh list when type changes', async () => {
        // Switch to linear_actuator
        await page.selectOption('#typeSelect', 'linear_actuator');
        await page.waitForTimeout(500);

        // List title should update
        const listTitle = await page.locator('#listTitle').textContent();
        expect(listTitle).toContain('Linear Actuator');

        // Should have loaded models (at least the generic ones)
        await page.waitForSelector('#modelsTable tbody tr', { timeout: 5000 });
        await tracker.logErrors();
    });

    test('should render default fields appropriate to type', async () => {
        // Servo should show servo-specific fields
        await page.selectOption('#typeSelect', 'servo');
        await page.waitForTimeout(300);

        const fieldsArea = page.locator('#defaultsFieldsArea');
        await expect(fieldsArea).toBeVisible();

        // Should have servo-specific fields
        const fieldLabels = await fieldsArea.locator('.form-label').allTextContents();
        const labels = fieldLabels.join(' ');
        expect(labels).toContain('Min Pulse');
        expect(labels).toContain('Max Pulse');
        expect(labels).toContain('Servo Type');

        // Switch to LED and fields should change
        await page.selectOption('#typeSelect', 'led');
        await page.waitForTimeout(300);

        const ledLabels = await fieldsArea.locator('.form-label').allTextContents();
        const ledText = ledLabels.join(' ');
        expect(ledText).toContain('Brightness');
        expect(ledText).toContain('PWM Frequency');

        await tracker.logErrors();
    });

    test('should create, edit, and delete a model via UI', async () => {
        tracker.clear();

        // Select LED type (simplest)
        await page.selectOption('#typeSelect', 'led');
        await page.waitForTimeout(300);

        // Fill in model name
        await page.fill('#modelName', 'Playwright Test LED');
        await page.fill('#modelDesc', 'Created by Playwright');

        // Fill in a defaults field
        const brightnessField = page.locator('.defaults-field[data-key="brightness"]');
        if (await brightnessField.count() > 0) {
            await brightnessField.fill('75');
        }

        // Save
        await page.click('#btnSaveModel');
        await page.waitForTimeout(500);

        // Should appear in list
        const tableText = await page.locator('#modelsTable').textContent();
        expect(tableText).toContain('Playwright Test LED');

        // Click the row to edit
        const row = page.locator('.model-row', { hasText: 'Playwright Test LED' });
        await row.click();
        await page.waitForTimeout(300);

        // Editor should show the model name
        const nameVal = await page.inputValue('#modelName');
        expect(nameVal).toBe('Playwright Test LED');

        // Update the name
        await page.fill('#modelName', 'Playwright Updated LED');
        await page.click('#btnSaveModel');
        await page.waitForTimeout(500);

        const updatedText = await page.locator('#modelsTable').textContent();
        expect(updatedText).toContain('Playwright Updated LED');

        // Delete it - click row first to select, then delete
        const updatedRow = page.locator('.model-row', { hasText: 'Playwright Updated LED' });
        await updatedRow.click();
        await page.waitForTimeout(200);

        // Accept the confirm dialog
        page.once('dialog', dialog => dialog.accept());
        await page.click('#btnDeleteModel');
        await page.waitForTimeout(500);

        // Should be gone
        const finalText = await page.locator('#modelsTable').textContent();
        expect(finalText).not.toContain('Playwright Updated LED');

        await tracker.logErrors();
    });

    test('should have Back to Calibration link', async () => {
        const backLink = page.locator('a.btn[href="/setup/calibration"]');
        await expect(backLink).toBeVisible();
        expect(await backLink.textContent()).toContain('Back to Calibration');
        await tracker.logErrors();
    });

    test('should show bulk delete when models are selected', async () => {
        // Ensure we're on servo (has multiple models)
        await page.selectOption('#typeSelect', 'servo');
        await page.waitForTimeout(300);

        // Bulk delete button should be hidden initially
        const bulkBtn = page.locator('#btnDeleteSelected');
        await expect(bulkBtn).toBeHidden();

        // Check a model checkbox
        const checkbox = page.locator('.model-checkbox').first();
        if (await checkbox.count() > 0) {
            await checkbox.check();
            await page.waitForTimeout(200);
            await expect(bulkBtn).toBeVisible();

            // Uncheck
            await checkbox.uncheck();
            await page.waitForTimeout(200);
            await expect(bulkBtn).toBeHidden();
        }

        await tracker.logErrors();
    });

    test('should have raw JSON toggle for advanced editing', async () => {
        const rawToggle = page.locator('a[href="#rawDefaultsCollapse"]');
        await expect(rawToggle).toBeVisible();

        // Click to expand
        await rawToggle.click();
        await page.waitForTimeout(300);

        const rawTextarea = page.locator('#modelDefaults');
        await expect(rawTextarea).toBeVisible();

        await tracker.logErrors();
    });

    test('should show key settings badges in table', async () => {
        await page.selectOption('#typeSelect', 'servo');
        await page.waitForTimeout(500);

        // Check that table rows have badge elements
        const badges = page.locator('#modelsTable .badge');
        const badgeCount = await badges.count();
        // Real servo models should have settings badges
        expect(badgeCount).toBeGreaterThan(0);

        await tracker.logErrors();
    });
});

test.describe('Calibration Model/Overrides Tab', () => {
    let page;
    let tracker;

    test.beforeEach(async ({ browser }) => {
        page = await browser.newPage();
        tracker = await testNavigation(page, `${BASE_URL}/setup/calibration`, 'Calibration');
    });

    test.afterEach(async () => {
        await page.close();
    });

    test('should have Model/Overrides tab', async () => {
        const modelTab = page.locator('button[data-bs-target="#tabModel"]');
        await expect(modelTab).toBeVisible();
        expect(await modelTab.textContent()).toContain('Model/Overrides');
        await tracker.logErrors();
    });

    test('should have Manage Models link in Model/Overrides tab', async () => {
        // Click Model/Overrides tab
        await page.click('button[data-bs-target="#tabModel"]');
        await page.waitForTimeout(300);

        const manageLink = page.locator('#tabModel a[href="/setup/models"]');
        await expect(manageLink).toBeVisible();
        expect(await manageLink.textContent()).toContain('Manage Models');
        await tracker.logErrors();
    });

    test('should have model selector inside Model/Overrides tab', async () => {
        await page.click('button[data-bs-target="#tabModel"]');
        await page.waitForTimeout(300);

        const modelSelect = page.locator('#tabModel #modelSelect');
        await expect(modelSelect).toBeVisible();

        const assignBtn = page.locator('#tabModel #assignModelBtn');
        await expect(assignBtn).toBeVisible();

        await tracker.logErrors();
    });

    test('should have override fields area', async () => {
        await page.click('button[data-bs-target="#tabModel"]');
        await page.waitForTimeout(300);

        const overrideArea = page.locator('#overrideFieldsArea');
        await expect(overrideArea).toBeVisible();

        await tracker.logErrors();
    });

    test('should have save and revert override buttons', async () => {
        await page.click('button[data-bs-target="#tabModel"]');
        await page.waitForTimeout(300);

        await expect(page.locator('#saveOverridesBtn')).toBeVisible();
        await expect(page.locator('#revertOverridesBtn')).toBeVisible();

        await tracker.logErrors();
    });
});
