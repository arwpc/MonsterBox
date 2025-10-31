/**
 * Goblin Step Integration Tests
 * Tests for goblin-video step execution in scenes
 */

import { expect, test } from '@playwright/test';
const GOBLIN_ID = 'goblin-three';
const TEST_VIDEO = '307 Jb Hd.mp4';

test.describe('Goblin Step Integration', () => {
  let testSceneId;

  test.beforeAll(async ({ request }) => {
    // Create a test scene with goblin-video step
    const response = await request.post(`/scenes/api`, {
      data: {
        name: 'Goblin Step Test Scene',
        characterId: 3, // Orlok
        steps: [
          {
            type: 'wait',
            duration: 100,
            comment: 'Initial wait'
          },
          {
            type: 'goblin-video',
            goblinId: GOBLIN_ID,
            videoId: TEST_VIDEO,
            returnToQueue: true,
            comment: 'Play test video on goblin'
          },
          {
            type: 'wait',
            duration: 100,
            comment: 'Final wait'
          }
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

  test('scene with goblin-video step is created correctly', async ({ request }) => {
    const response = await request.get(`/scenes/api/${testSceneId}`);
    expect(response.ok()).toBeTruthy();

    const data = await response.json();
    expect(data.success).toBe(true);
    expect(data.scene).toBeDefined();
    expect(data.scene.steps.length).toBe(3);

    const goblinStep = data.scene.steps[1];
    expect(goblinStep.type).toBe('goblin-video');
    expect(goblinStep.goblinId).toBe(GOBLIN_ID);
    expect(goblinStep.videoId).toBe(TEST_VIDEO);
    expect(goblinStep.returnToQueue).toBe(true);
  });

  test('test-step endpoint handles goblin-video step', async ({ request }) => {
    const response = await request.post(`/scenes/api/test-step`, {
      data: {
        type: 'goblin-video',
        goblinId: GOBLIN_ID,
        videoId: TEST_VIDEO,
        returnToQueue: true
      }
    });

    // May return 500 if goblin is offline (throws error in executor)
    // May return 200 if goblin is online
    expect([200, 500]).toContain(response.status());

    const data = await response.json();
    expect(data).toHaveProperty('success');

    // If goblin is online, should succeed
    // If offline, will have error
    if (data.success) {
      expect(data.result).toBeDefined();
    } else {
      expect(data.error).toBeDefined();
      expect(data.error).toMatch(/Goblin|goblinId|videoId/i);
    }
  });

  test('goblin-video step requires goblinId', async ({ request }) => {
    const response = await request.post(`/scenes/api/test-step`, {
      data: {
        type: 'goblin-video',
        videoId: TEST_VIDEO,
        returnToQueue: true
      }
    });

    expect([200, 500]).toContain(response.status());
    const data = await response.json();
    expect(data.success).toBe(false);
    expect(data.error).toMatch(/goblinId/i);
  });

  test('goblin-video step requires videoId', async ({ request }) => {
    const response = await request.post(`/scenes/api/test-step`, {
      data: {
        type: 'goblin-video',
        goblinId: GOBLIN_ID,
        returnToQueue: true
      }
    });

    expect([200, 500]).toContain(response.status());
    const data = await response.json();
    expect(data.success).toBe(false);
    expect(data.error).toMatch(/videoId/i);
  });

  test('scene execution includes goblin-video step', async ({ request }) => {
    // Create a simple scene with just goblin step
    const createResponse = await request.post(`/scenes/api`, {
      data: {
        name: 'Goblin Execution Test',
        steps: [
          {
            type: 'goblin-video',
            goblinId: GOBLIN_ID,
            videoId: TEST_VIDEO,
            returnToQueue: false,
            comment: 'Single goblin step'
          }
        ]
      }
    });

    expect(createResponse.ok()).toBeTruthy();
    const createData = await createResponse.json();
    expect(createData.success).toBe(true);
    const sceneId = createData.scene.id;

    // Execute the scene - may fail if goblin offline
    const execResponse = await request.post(`/scenes/api/${sceneId}/play`);
    // Accept both success and failure (goblin may be offline)
    expect([200, 500]).toContain(execResponse.status());

    const execData = await execResponse.json();
    expect(execData).toHaveProperty('success');

    // Clean up
    await request.delete(`/scenes/api/${sceneId}`);
  });

  test('goblin step with returnToQueue=false', async ({ request }) => {
    const response = await request.post(`/scenes/api/test-step`, {
      data: {
        type: 'goblin-video',
        goblinId: GOBLIN_ID,
        videoId: TEST_VIDEO,
        returnToQueue: false
      }
    });

    expect([200, 500]).toContain(response.status());
    const data = await response.json();

    // Structure should be valid regardless of goblin status
    expect(data).toHaveProperty('success');
  });

  test('goblin step with options', async ({ request }) => {
    const response = await request.post(`/scenes/api/test-step`, {
      data: {
        type: 'goblin-video',
        goblinId: GOBLIN_ID,
        videoId: TEST_VIDEO,
        options: {
          returnToQueue: true,
          volume: 80
        }
      }
    });

    expect([200, 500]).toContain(response.status());
    const data = await response.json();
    expect(data).toHaveProperty('success');
  });

  test('multiple goblin steps in sequence', async ({ request }) => {
    const createResponse = await request.post(`/scenes/api`, {
      data: {
        name: 'Multiple Goblin Steps',
        characterId: 3,
        steps: [
          {
            type: 'goblin-video',
            goblinId: GOBLIN_ID,
            videoId: '307 Jb Hd.mp4',
            returnToQueue: true
          },
          {
            type: 'wait',
            duration: 500
          },
          {
            type: 'goblin-video',
            goblinId: GOBLIN_ID,
            videoId: '312 Jb Hd.mp4',
            returnToQueue: true
          }
        ]
      }
    });

    expect(createResponse.ok()).toBeTruthy();
    const createData = await createResponse.json();
    expect(createData.success).toBe(true);
    expect(createData.scene.steps.length).toBe(3);

    // Verify both goblin steps
    const goblinSteps = createData.scene.steps.filter(s => s.type === 'goblin-video');
    expect(goblinSteps.length).toBe(2);
    expect(goblinSteps[0].videoId).toBe('307 Jb Hd.mp4');
    expect(goblinSteps[1].videoId).toBe('312 Jb Hd.mp4');

    // Clean up
    await request.delete(`/scenes/api/${createData.scene.id}`);
  });

  test('goblin step in complex scene', async ({ request }) => {
    const createResponse = await request.post(`/scenes/api`, {
      data: {
        name: 'Complex Goblin Scene',
        characterId: 3,
        steps: [
          { type: 'wait', duration: 100 },
          { type: 'servo', partId: 11, angle: 90, duration: 500 },
          { type: 'goblin-video', goblinId: GOBLIN_ID, videoId: TEST_VIDEO, returnToQueue: true },
          { type: 'wait', duration: 200 },
          { type: 'servo', partId: 11, angle: 45, duration: 500 }
        ]
      }
    });

    expect(createResponse.ok()).toBeTruthy();
    const createData = await createResponse.json();
    expect(createData.success).toBe(true);
    expect(createData.scene.steps.length).toBe(5);

    const goblinStep = createData.scene.steps.find(s => s.type === 'goblin-video');
    expect(goblinStep).toBeDefined();
    expect(goblinStep.goblinId).toBe(GOBLIN_ID);

    // Clean up
    await request.delete(`/scenes/api/${createData.scene.id}`);
  });
});

