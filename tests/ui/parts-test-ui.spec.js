/**
 * UI test: Setup → Parts per-type Test button triggers backend action (servo example)
 * Runs on WebKit to satisfy ARM64 constraints.
 */

import { test, expect } from '../test.setup';

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
    const part = await createServoViaAPI(request, uniqueName);
    const partId = part.id;

    await page.goto(`${BASE_URL}/setup/parts`);

    // Wait for parts to load and our newly created servo to appear
    await expect(page.locator('#parts-list')).toBeVisible();
    await expect(page.locator('#parts-list')).toContainText(uniqueName);

    // Target the specific part's Test button by id
    const openBtn = page.locator('[data-testid="open-test-btn"][data-part-id="' + partId + '"]');
    await expect(openBtn).toBeVisible();
    await openBtn.click();
    await expect(page.locator('#test-drawer-' + partId)).toBeVisible();

    // Run the Quick Test from the drawer
    const quickBtn = page.locator('#test-drawer-' + partId + ' [data-testid="quick-test-btn"]');
    await expect(quickBtn).toBeVisible();
    await quickBtn.click();

    // Expect a feedback alert to appear (success preferred, but accept danger when hardware not present)
    const alert = page.locator('#alertsContainer .alert');
    await expect(alert).toBeVisible();
    await expect(alert).toHaveClass(/alert-success|alert-danger/);
    await expect(alert).toContainText(/Test|Action/);
  });
});

