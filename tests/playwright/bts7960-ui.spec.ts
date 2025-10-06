import { test, expect } from '@playwright/test';

// Helper: open Add Part modal and ensure it is visible
async function openAddPartModal(page) {
  await page.goto('/setup/calibration');
  await page.getByRole('button', { name: 'Add Part' }).click();
  await expect(page.locator('#addPartModal')).toBeVisible();
}

test.describe('Setup Calibration UI - Motor/Actuator/Servo basic controls', () => {
  test('Add Motor (BTS7960), Edit, and Run', async ({ page }) => {
    await openAddPartModal(page);

    // Fill Add Part form for Motor using BTS7960
    await page.fill('#addPartName', 'Test Motor BTS7960');
    await page.selectOption('#addPartType', 'motor');

    // Control board BTS7960 -> shows RPWM/LPWM fields
    await page.selectOption('#addControlBoard', 'BTS7960');
    await page.fill('#addRpwmPin', '19');
    await page.fill('#addLpwmPin', '21');
    await page.fill('#addRenPin', '5');
    await page.fill('#addLenPin', '22');

    // Create
    await page.getByRole('button', { name: 'Add Part', exact: true }).click();
    await expect(page.locator('#addPartModal')).toBeHidden({ timeout: 10000 });

    // Select created part in the list
    await page.getByText('Test Motor BTS7960', { exact: true }).click();

    // Run control forward
    await page.selectOption('#motDir', 'forward');
    await page.fill('#motSpd', '50');
    await page.fill('#motDur', '400');
    await page.getByRole('button', { name: 'Run' }).click();
    await expect(page.locator('#ctrlStatus')).toContainText(/Done|moved|success|Stopped|complete/i, { timeout: 10000 });

    // Switch to Edit tab and toggle control boards, then save
    await page.getByRole('tab', { name: 'Edit' }).click();

    // Switch to MDD10A and set pins, save
    await page.selectOption('select#editControlBoard', 'MDD10A');
    await page.fill('#editDirectionPin', '23');
    await page.fill('#editPwmPin', '24');
    await page.click('#saveEditBtn');

    // Switch back to BTS7960 and set pins again, save
    await page.selectOption('select#editControlBoard', 'BTS7960');
    await page.fill('#editRpwmPin', '19');
    await page.fill('#editLpwmPin', '21');
    await page.fill('#editRenPin', '5');
    await page.fill('#editLenPin', '22');
    await page.click('#saveEditBtn');

    // Back to Controls and run again
    await page.getByRole('tab', { name: 'Controls' }).click();
    await page.getByRole('button', { name: 'Run' }).click();
    await expect(page.locator('#ctrlStatus')).toContainText(/Done|moved|success|Stopped|complete/i, { timeout: 10000 });
  });

  test('Add Linear Actuator (BTS7960) and Extend/Stop/Retract', async ({ page }) => {
    await openAddPartModal(page);

    await page.fill('#addPartName', 'Test Actuator BTS7960');
    await page.selectOption('#addPartType', 'linear_actuator');
    await page.selectOption('#addControlBoard', 'BTS7960');
    await page.fill('#addRpwmPin', '12');
    await page.fill('#addLpwmPin', '13');

    await page.getByRole('button', { name: 'Add Part', exact: true }).click();
    await expect(page.locator('#addPartModal')).toBeHidden({ timeout: 10000 });

    await page.getByText('Test Actuator BTS7960', { exact: true }).click();

    // Extend
    await page.getByRole('button', { name: /Extend/i }).click();
    await expect(page.locator('#ctrlStatus')).toContainText(/Extending|Done|complete/i, { timeout: 10000 });

    // Stop
    await page.getByRole('button', { name: /Stop/i }).click();
    await expect(page.locator('#ctrlStatus')).toContainText(/Stopped|Done/i, { timeout: 10000 });

    // Retract
    await page.getByRole('button', { name: /Retract/i }).click();
    await expect(page.locator('#ctrlStatus')).toContainText(/Retracting|Done|complete/i, { timeout: 10000 });
  });

  test('Use default Servo and Move', async ({ page }) => {
    await page.goto('/setup/calibration');

    // Default seed servo should exist as "Default Servo"
    await page.getByText('Default Servo', { exact: true }).click();

    // Move to 90°
    await page.fill('#angNum', '90');
    await page.getByRole('button', { name: /Move/ }).click();
    await expect(page.locator('#ctrlStatus')).toContainText(/moved|Done|success/i, { timeout: 10000 });
  });
});

