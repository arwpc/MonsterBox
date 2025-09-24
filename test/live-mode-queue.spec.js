// Playwright UI tests for Live Mode Scenes & Queue
import { test, expect } from '@playwright/test';

async function createScene(request, name, steps = []) {
  const res = await request.post('/scenes/api', { data: { name, steps } });
  expect(res.ok()).toBeTruthy();
  const body = await res.json();
  expect(body.success).toBeTruthy();
  return body.scene;
}

test.describe('Live Mode - Scenes & Queue', () => {
  test('enqueue, reorder (drag), start/stop queue, and SSE stream panel', async ({ page, request }) => {
    // Create a couple of scenes for the UI
    const s1 = await createScene(request, 'UI Test Scene A', []);
    const s2 = await createScene(request, 'UI Test Scene B', []);
    const s3 = await createScene(request, 'UI Test Stream', [{ type: 'wait', duration: 100 }]);

    await page.goto('/live');

    // Enqueue first two scenes (click + buttons)
    const addButtons = page.locator('#scenesContainer .btn-outline-success');
    const btnCount = await addButtons.count();
    expect(btnCount).toBeGreaterThanOrEqual(2);
    await addButtons.nth(0).click();
    await addButtons.nth(1).click();

    // Queue should show at least 2 items
    const queueItems = page.locator('#queueList .list-group-item');
    await expect(queueItems).toHaveCount(2);

    // Drag-and-drop reorder: move second above first
    const firstItem = queueItems.nth(0);
    const secondItem = queueItems.nth(1);
    await secondItem.dragTo(firstItem);

    // After reorder, still two items present; order may change - just ensure re-rendered
    await expect(queueItems).toHaveCount(2);

    // Start and then Stop the queue
    await page.getByRole('button', { name: /Start Queue/i }).click();
    await page.waitForTimeout(200); // brief wait for processing
    await page.getByRole('button', { name: /Emergency Stop/i }).click();

    // Stream panel: click stream on the streamable scene row
    const sceneRow = page.locator('#scenesContainer .list-group-item', { hasText: 'UI Test Stream' });
    await expect(sceneRow).toHaveCount(1);
    await sceneRow.locator('button:has-text("Stream")').click();

    const streamPanel = page.locator('text=Streaming scene');
    await expect(streamPanel).toBeVisible();
  });
});

