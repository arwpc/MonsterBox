import { test, expect } from '../test.setup';

// Representative per-form workflow: Setup → Models
// Creates a simple Servo model via the form and verifies it appears in the table

test.describe('Form Workflow - Setup/Models', () => {
  test('create Servo model and see it listed', async ({ page }) => {
    await page.goto('/setup/models');

    // Select type and fill fields
    await page.selectOption('#typeSelect', 'servo');
    const name = `PW Servo Model ${Date.now()}`;
    await page.fill('#modelName', name);
    await page.fill('#modelDesc', 'Servo defaults created by Playwright');
    await page.fill('#modelDefaults', JSON.stringify({ minPulse: 500, maxPulse: 2500, neutral: 1500, rotationRangeDeg: 180 }));

    // Save and wait for table refresh
    await page.click('#btnSaveModel');
    await expect(page.locator('#modelsTable tbody')).toBeVisible();
    await expect(page.locator('#modelsTable')).toContainText(name);
  });
});

