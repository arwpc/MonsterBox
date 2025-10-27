/**
 * Scene Step Play Button Tests
 * Tests the Play button functionality for individual step testing in the Scene Editor
 * 
 * Tests:
 * - Scene editor page loads correctly
 * - Play buttons appear for each step
 * - Clicking Play button executes the step
 * - Different step types execute correctly
 * - Error handling (400, 500 errors)
 * - Visual feedback (loading, success, error states)
 */

import { test, expect } from '../test.setup';

// Use Playwright baseURL

test.describe('Scene Step Play Button', () => {
  let testSceneId;

  test.beforeAll(async ({ request }) => {
    // Create a test scene with multiple step types
  const response = await request.post(`/scenes/api`, {
      data: {
        name: 'Step Play Test Scene',
        steps: [
          { type: 'wait', duration: 100, comment: 'Wait step' },
          { type: 'servo', partId: 11, angle: 90, duration: 500, comment: 'Servo step' },
          { type: 'light', partId: 8, state: 'on', brightness: 100, comment: 'Light step' },
          { type: 'pose', poseId: 1, comment: 'Pose step' }
        ]
      }
    });

    expect(response.ok()).toBeTruthy();
    const data = await response.json();
    expect(data.success).toBeTruthy();
    testSceneId = data.scene.id;
  });

  test.afterAll(async ({ request }) => {
    // Clean up test scene
    if (testSceneId) {
  await request.delete(`/scenes/api/${testSceneId}`);
    }
  });

  test('Scene editor page loads with Play buttons', async ({ page }) => {
    await page.goto(`/scenes/edit/${testSceneId}`);

    // Wait for page to load
    await expect(page.locator('h1, h2')).toContainText(/edit scene/i);

    // Check that Play buttons exist
    const playButtons = page.locator('.btn-play-step');
    const count = await playButtons.count();

    expect(count).toBeGreaterThan(0);
    console.log(`✅ Found ${count} Play buttons`);

    // Verify button has correct icon and styling
    const firstButton = playButtons.first();
    await expect(firstButton).toBeVisible();
    await expect(firstButton).toHaveClass(/btn-outline-success/);

    // Check for play icon
    const icon = firstButton.locator('i.bi-play-fill');
    await expect(icon).toBeVisible();
  });

  test('Play button executes wait step successfully', async ({ page }) => {
    await page.goto(`/scenes/edit/${testSceneId}`);

    // Find the first Play button (wait step)
    const playButton = page.locator('.btn-play-step').first();
    await expect(playButton).toBeVisible();

    // Click the Play button
    await playButton.click();

    // Wait for loading state (hourglass icon)
    await expect(playButton.locator('i.bi-hourglass-split')).toBeVisible({ timeout: 1000 });

    // Wait for success state (checkmark icon)
    await expect(playButton.locator('i.bi-check-circle-fill')).toBeVisible({ timeout: 3000 });

    // Verify button turns green
    await expect(playButton).toHaveClass(/btn-success/);

    // Wait for button to reset
    await page.waitForTimeout(2500);

    // Verify button returns to normal state
    await expect(playButton).toHaveClass(/btn-outline-success/);
    await expect(playButton.locator('i.bi-play-fill')).toBeVisible();

    console.log('✅ Wait step executed successfully with visual feedback');
  });

  test('API endpoint /scenes/api/test-step returns 200 for valid step', async ({ request }) => {
  const response = await request.post(`/scenes/api/test-step`, {
      data: {
        type: 'wait',
        duration: 100
      }
    });

    expect(response.status()).toBe(200);

    const data = await response.json();
    expect(data.success).toBeTruthy();
    expect(data.result).toBeDefined();
    expect(data.result.success).toBeTruthy();

    console.log('✅ API endpoint returns 200 for valid step');
  });

  test('API endpoint returns 400 for invalid step (missing type)', async ({ request }) => {
  const response = await request.post(`/scenes/api/test-step`, {
      data: {
        duration: 100
        // Missing 'type' field
      }
    });

    expect(response.status()).toBe(400);

    const data = await response.json();
    expect(data.success).toBeFalsy();
    expect(data.error).toContain('type is required');

    console.log('✅ API endpoint returns 400 for invalid step');
  });

  test('API endpoint handles different step types', async ({ request }) => {
    const stepTypes = [
      { type: 'wait', duration: 100 },
      { type: 'servo', partId: 11, angle: 90, duration: 500 },
      { type: 'motor', partId: 33, direction: 'forward', speed: 50, duration: 500 },
      { type: 'linear-actuator', partId: 1, direction: 'extend', speed: 50, duration: 500 },
      { type: 'light', partId: 8, state: 'on', brightness: 100 }
    ];

    for (const step of stepTypes) {
  const response = await request.post(`/scenes/api/test-step`, {
        data: step
      });

      expect(response.status()).toBe(200);

      const data = await response.json();
      expect(data.success).toBeTruthy();

      console.log(`✅ ${step.type} step executed successfully`);
    }
  });

  test('Dry-run mode works correctly', async ({ request }) => {
  const response = await request.post(`/scenes/api/test-step?dryRun=true`, {
      data: {
        type: 'servo',
        partId: 11,
        angle: 90,
        duration: 500
      }
    });

    expect(response.status()).toBe(200);

    const data = await response.json();
    expect(data.success).toBeTruthy();
    expect(data.dryRun).toBe(true);
    expect(data.result.dryRun).toBe(true);

    console.log('✅ Dry-run mode works correctly');
  });

  test('Multiple Play buttons exist and are clickable', async ({ page }) => {
    await page.goto(`/scenes/edit/${testSceneId}`);

    // Wait for steps to render
    await page.waitForSelector('.step-card', { timeout: 5000 });

    const playButtons = page.locator('.btn-play-step');
    const count = await playButtons.count();

    expect(count).toBeGreaterThanOrEqual(2);

    // Verify all buttons are visible and enabled
    for (let i = 0; i < count; i++) {
      await expect(playButtons.nth(i)).toBeVisible();
      await expect(playButtons.nth(i)).toBeEnabled();
      await expect(playButtons.nth(i).locator('i.bi-play-fill')).toBeVisible();
    }

    console.log(`✅ Multiple Play buttons (${count}) exist and are clickable`);
  });

  test('Play button is disabled during execution', async ({ page }) => {
    await page.goto(`/scenes/edit/${testSceneId}`);

    const playButton = page.locator('.btn-play-step').first();

    // Click the button
    await playButton.click();

    // Verify button is disabled during execution
    await expect(playButton).toBeDisabled({ timeout: 1000 });

    // Wait for execution to complete
    await page.waitForTimeout(2500);

    // Verify button is enabled again
    await expect(playButton).toBeEnabled();

    console.log('✅ Play button is disabled during execution');
  });

  test('API endpoint validates step type requirement', async ({ request }) => {
    // Test that the API properly validates required fields
  const response = await request.post(`/scenes/api/test-step`, {
      data: {
        duration: 100
        // Missing required 'type' field
      }
    });

    // Should return 400 for missing type
    expect(response.status()).toBe(400);

    const data = await response.json();
    expect(data.success).toBeFalsy();
    expect(data.error).toBeDefined();
    expect(data.error).toContain('type');

    console.log('✅ API endpoint validates step type requirement');
  });

  test('Scene editor form remains functional after step execution', async ({ page }) => {
    await page.goto(`/scenes/edit/${testSceneId}`);

    // Execute a step
    const playButton = page.locator('.btn-play-step').first();
    await playButton.click();

    // Wait for execution to complete
    await page.waitForTimeout(3000);

    // Verify form is still functional
    const saveButton = page.locator('button:has-text("Save")');
    await expect(saveButton).toBeVisible();
    await expect(saveButton).toBeEnabled();

    // Verify other buttons still work
    const duplicateButton = page.locator('.btn-duplicate').first();
    await expect(duplicateButton).toBeVisible();
    await expect(duplicateButton).toBeEnabled();

    console.log('✅ Scene editor form remains functional after step execution');
  });
});

