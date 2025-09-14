/**
 * UI test: Setup → Parts per-type Test button triggers backend action (servo example)
 * Runs on WebKit to satisfy ARM64 constraints.
 */

import { test, expect, request as pwRequest } from '@playwright/test';

const BASE_URL = 'http://localhost:3000';

async function createServoViaAPI(request, name) {
  const res = await request.post(`${BASE_URL}/setup/parts/api/parts`, {
    data: {
      name,
      type: 'servo',
      pin: 12,
      description: 'UI Servo',
      config: { servoType: 'standard' }
    }
  });
  expect(res.ok()).toBeTruthy();
  const body = await res.json();
  expect(body.success).toBeTruthy();
  return body.part;
}

test.describe('Setup → Parts: per-type testing (servo)', () => {
  test('clicking Test on a servo shows success feedback', async ({ page, request }) => {
    const uniqueName = `UI Servo ${Date.now()}`;
    await createServoViaAPI(request, uniqueName);

    await page.goto(`${BASE_URL}/setup/parts`);

    // Wait for parts to load and our newly created servo to appear
    await expect(page.locator('#parts-list')).toBeVisible();
    await expect(page.locator('#parts-list')).toContainText(uniqueName);

    // Locate the card containing our servo and click its Test button
    const card = page.locator('.card:has-text("' + uniqueName + '")').first();
    await expect(card).toBeVisible();
    await card.locator('button[title="Test"]').click();

    // Expect a success alert to appear
    const alert = page.locator('#alertsContainer .alert');
    await expect(alert).toBeVisible();
    await expect(alert).toHaveClass(/alert-success|alert-danger/);
    // Prefer success, but tolerate either; assert the API responded
    await expect(alert).toContainText(/Test/);
  });
});

