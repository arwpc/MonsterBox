/**
 * Goblin API Endpoint Tests
 * Tests for Goblin video playback API endpoints
 */

import { test, expect } from '@playwright/test';

const GOBLIN_URL = 'http://192.168.8.14:3001';
const TEST_VIDEO = '307 Jb Hd.mp4';

test.describe('Goblin API Endpoints', () => {

  test('health endpoint returns ok status', async ({ request }) => {
    const response = await request.get(`${GOBLIN_URL}/health`);
    expect(response.ok()).toBeTruthy();

    const data = await response.json();
    expect(data.ok).toBe(true);
    expect(data).toHaveProperty('uptime');
    expect(data).toHaveProperty('status');
  });

  test('status endpoint returns playback state', async ({ request }) => {
    const response = await request.get(`${GOBLIN_URL}/api/status`);
    expect(response.ok()).toBeTruthy();

    const data = await response.json();
    expect(data.success).toBe(true);
    expect(data).toHaveProperty('playing');
    expect(data).toHaveProperty('currentVideo');
    expect(data).toHaveProperty('mpvRunning');
    expect(data).toHaveProperty('queue');
    expect(data.queue).toHaveProperty('videos');
    expect(data.queue).toHaveProperty('loopMode');
  });

  test('video scan endpoint returns video metadata', async ({ request }) => {
    test.setTimeout(120000); // 2 minutes for scanning
    const response = await request.get(`${GOBLIN_URL}/api/videos/scan`, {
      timeout: 90000 // 90 seconds for scanning
    });
    expect(response.ok()).toBeTruthy();

    const data = await response.json();
    expect(data.success).toBe(true);
    expect(data.videos).toBeDefined();
    expect(Array.isArray(data.videos)).toBe(true);
    expect(data.videos.length).toBeGreaterThan(0);

    // Check first video has required metadata
    const video = data.videos[0];
    expect(video).toHaveProperty('filename');
    expect(video).toHaveProperty('size');
    expect(video).toHaveProperty('duration');
    expect(video).toHaveProperty('resolution');
    expect(video).toHaveProperty('fps');
    expect(video).toHaveProperty('codec');

    // Verify expected format
    expect(video.resolution).toBe('1280x720');
    expect(video.fps).toBe(30);
    expect(video.codec).toBe('h264');
  });

  test('immediate playback endpoint plays video', async ({ request }) => {
    const response = await request.post(`${GOBLIN_URL}/api/video/play-immediate`, {
      data: {
        filename: TEST_VIDEO,
        returnToQueue: true
      }
    });
    expect(response.ok()).toBeTruthy();

    const data = await response.json();
    expect(data.success).toBe(true);
    expect(data.playing).toBe(TEST_VIDEO);
    expect(data).toHaveProperty('interrupted');
    expect(data).toHaveProperty('willReturnToQueue');
  });

  test('immediate playback without returnToQueue', async ({ request }) => {
    const response = await request.post(`${GOBLIN_URL}/api/video/play-immediate`, {
      data: {
        filename: TEST_VIDEO,
        returnToQueue: false
      }
    });
    expect(response.ok()).toBeTruthy();

    const data = await response.json();
    expect(data.success).toBe(true);
    expect(data.playing).toBe(TEST_VIDEO);
    expect(data.willReturnToQueue).toBe(false);
  });

  test('immediate playback rejects missing filename', async ({ request }) => {
    const response = await request.post(`${GOBLIN_URL}/api/video/play-immediate`, {
      data: {
        returnToQueue: true
      }
    });
    expect(response.status()).toBe(400);

    const data = await response.json();
    expect(data.success).toBe(false);
    expect(data.error).toContain('filename');
  });

  test('queue endpoints work correctly', async ({ request }) => {
    // Clear queue
    let response = await request.post(`${GOBLIN_URL}/queue/clear`);
    expect(response.ok()).toBeTruthy();
    let data = await response.json();
    expect(data.success).toBe(true);

    // Add video to queue
    response = await request.post(`${GOBLIN_URL}/queue/add`, {
      data: { filename: TEST_VIDEO }
    });
    expect(response.ok()).toBeTruthy();
    data = await response.json();
    expect(data.success).toBe(true);

    // Get queue status
    response = await request.get(`${GOBLIN_URL}/queue`);
    expect(response.ok()).toBeTruthy();
    data = await response.json();
    // Queue endpoint returns data directly (videos, currentIndex, loopMode, etc)
    expect(data.videos).toBeDefined();
    expect(data.videos.length).toBeGreaterThan(0);

    // Start queue
    response = await request.post(`${GOBLIN_URL}/queue/start`, {
      data: { loopMode: 'queue' }
    });
    expect(response.ok()).toBeTruthy();
    data = await response.json();
    expect(data.success).toBe(true);

    // Stop queue
    response = await request.post(`${GOBLIN_URL}/queue/stop`);
    expect(response.ok()).toBeTruthy();
    data = await response.json();
    expect(data.success).toBe(true);
  });

  test('queue skip works when playing', async ({ request }) => {
    // Ensure queue is playing with multiple videos
    await request.post(`${GOBLIN_URL}/queue/clear`);
    await request.post(`${GOBLIN_URL}/queue/add`, { data: { filename: '307 Jb Hd.mp4' } });
    await request.post(`${GOBLIN_URL}/queue/add`, { data: { filename: '312 Jb Hd.mp4' } });
    await request.post(`${GOBLIN_URL}/queue/start`, { data: { loopMode: 'queue' } });

    // Skip to next
    const response = await request.post(`${GOBLIN_URL}/queue/skip`);
    expect(response.ok()).toBeTruthy();

    const data = await response.json();
    expect(data.success).toBe(true);
  });

  test('stop-all endpoint stops playback', async ({ request }) => {
    const response = await request.post(`${GOBLIN_URL}/stop-all`);
    expect(response.ok()).toBeTruthy();

    const data = await response.json();
    expect(data.success).toBe(true);
  });
});

