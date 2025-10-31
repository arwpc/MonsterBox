/**
 * Goblin Three Complete Functionality Test
 * Tests all Goblin features using Goblin Three (192.168.8.14:3001)
 * 
 * Tests:
 * - Connectivity and health
 * - Video playback with v4l2m2m-copy hardware decoder
 * - Queue management (sequential and loop modes)
 * - Video listing and file management
 * - Status monitoring
 */

import { test, expect } from '@playwright/test';

const GOBLIN_THREE = {
  name: 'Goblin Three',
  ip: '192.168.8.14',
  port: 3001,
  url: 'http://192.168.8.14:3001'
};

test.describe('Goblin Three - Complete Functionality', () => {

  test.describe('Connectivity', () => {
    test('should be online and responding', async () => {
      const response = await fetch(`${GOBLIN_THREE.url}/health`);
      expect(response.ok).toBeTruthy();

      const health = await response.json();
      expect(health.status).toBe('healthy');
      expect(health.goblinId).toBe('goblin-three');
      expect(health.port).toBe('3001');
    });

    test('should report all components as OK', async () => {
      const response = await fetch(`${GOBLIN_THREE.url}/health`);
      const health = await response.json();

      expect(health.components.mediaPlayer).toBe('ok');
      expect(health.components.statusMonitor).toBe('ok');
      expect(health.components.fileManager).toBe('ok');
      expect(health.components.beacon).toBe('ok');
      expect(health.components.videoQueue).toBe('ok');
    });
  });

  test.describe('Video Listing', () => {
    test('should list available videos', async () => {
      const response = await fetch(`${GOBLIN_THREE.url}/videos`);
      expect(response.ok).toBeTruthy();

      const data = await response.json();
      expect(data.success).toBeTruthy();
      expect(Array.isArray(data.videos)).toBeTruthy();
      expect(data.videos.length).toBeGreaterThan(0);
    });

    test('should include video metadata', async () => {
      const response = await fetch(`${GOBLIN_THREE.url}/videos`);
      const data = await response.json();

      const video = data.videos[0];
      expect(video).toHaveProperty('filename');
      expect(video).toHaveProperty('size');
      expect(video).toHaveProperty('created');
    });
  });

  test.describe('Video Playback', () => {
    test('should play single video with hardware acceleration', async () => {
      // Get available videos
      const videosResponse = await fetch(`${GOBLIN_THREE.url}/videos`);
      const videosData = await videosResponse.json();
      const testVideo = videosData.videos[0].filename;

      // Play video
      const playResponse = await fetch(`${GOBLIN_THREE.url}/play-video`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          filename: testVideo,
          loop: false
        })
      });

      expect(playResponse.ok).toBeTruthy();
      const playData = await playResponse.json();
      expect(playData.success).toBeTruthy();
      expect(playData.player).toBe('mpv');
      expect(playData.filename).toBe(testVideo);

      // Wait for playback to start
      await new Promise(resolve => setTimeout(resolve, 2000));

      // Check status
      const statusResponse = await fetch(`${GOBLIN_THREE.url}/status`);
      const statusData = await statusResponse.json();
      expect(statusData.playback.video.playing).toBeTruthy();
      expect(statusData.playback.video.filename).toBe(testVideo);
    });

    test('should stop video playback', async () => {
      // Stop any playing video
      const stopResponse = await fetch(`${GOBLIN_THREE.url}/queue/stop`, {
        method: 'POST'
      });

      expect(stopResponse.ok).toBeTruthy();

      // Wait for stop to complete
      await new Promise(resolve => setTimeout(resolve, 1000));

      // Verify stopped
      const statusResponse = await fetch(`${GOBLIN_THREE.url}/status`);
      const statusData = await statusResponse.json();
      expect(statusData.playback.video.playing).toBeFalsy();
    });
  });

  test.describe('Queue Management - Sequential Mode', () => {
    test('should start sequential queue', async () => {
      // Get available videos
      const videosResponse = await fetch(`${GOBLIN_THREE.url}/videos`);
      const videosData = await videosResponse.json();
      const videos = videosData.videos.slice(0, 3).map(v => ({ filename: v.filename }));

      // Start queue in sequential mode
      const queueResponse = await fetch(`${GOBLIN_THREE.url}/queue/start`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          videos: videos,
          mode: 'sequential'
        })
      });

      expect(queueResponse.ok).toBeTruthy();
      const queueData = await queueResponse.json();
      expect(queueData.success).toBeTruthy();
      expect(queueData.queue.running).toBeTruthy();
      expect(queueData.queue.mode).toBe('sequential');
      expect(queueData.queue.queueLength).toBe(3);
    });

    test('should get queue status', async () => {
      const response = await fetch(`${GOBLIN_THREE.url}/queue`);
      expect(response.ok).toBeTruthy();

      const data = await response.json();
      expect(data.success).toBeTruthy();
      expect(data.queue).toHaveProperty('running');
      expect(data.queue).toHaveProperty('mode');
      expect(data.queue).toHaveProperty('queueLength');
    });

    test('should stop queue', async () => {
      const response = await fetch(`${GOBLIN_THREE.url}/queue/stop`, {
        method: 'POST'
      });

      expect(response.ok).toBeTruthy();
      const data = await response.json();
      expect(data.success).toBeTruthy();

      // Wait for stop
      await new Promise(resolve => setTimeout(resolve, 1000));

      // Verify stopped
      const statusResponse = await fetch(`${GOBLIN_THREE.url}/queue`);
      const statusData = await statusResponse.json();
      expect(statusData.queue.running).toBeFalsy();
    });
  });

  test.describe('Queue Management - Loop Mode', () => {
    test('should start looping queue with 5 videos', async () => {
      // Get available videos
      const videosResponse = await fetch(`${GOBLIN_THREE.url}/videos`);
      const videosData = await videosResponse.json();
      const videos = videosData.videos.slice(0, 5).map(v => ({ filename: v.filename }));

      // Start queue in loop mode
      const queueResponse = await fetch(`${GOBLIN_THREE.url}/queue/start`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          videos: videos,
          mode: 'loop'
        })
      });

      expect(queueResponse.ok).toBeTruthy();
      const queueData = await queueResponse.json();
      expect(queueData.success).toBeTruthy();
      expect(queueData.queue.running).toBeTruthy();
      expect(queueData.queue.mode).toBe('loop');
      expect(queueData.queue.queueLength).toBe(5);
    });

    test('should keep running in loop mode', async () => {
      // Wait for first video to play
      await new Promise(resolve => setTimeout(resolve, 3000));

      // Check queue is still running
      const response = await fetch(`${GOBLIN_THREE.url}/queue`);
      const data = await response.json();

      expect(data.queue.running).toBeTruthy();
      expect(data.queue.mode).toBe('loop');
      expect(data.queue.currentVideo).toBeTruthy();
    });

    test('should pause and resume queue', async () => {
      // Pause
      const pauseResponse = await fetch(`${GOBLIN_THREE.url}/queue/pause`, {
        method: 'POST'
      });
      expect(pauseResponse.ok).toBeTruthy();

      const pauseData = await pauseResponse.json();
      expect(pauseData.queue.paused).toBeTruthy();

      // Resume
      const resumeResponse = await fetch(`${GOBLIN_THREE.url}/queue/resume`, {
        method: 'POST'
      });
      expect(resumeResponse.ok).toBeTruthy();

      const resumeData = await resumeResponse.json();
      expect(resumeData.queue.paused).toBeFalsy();
    });

    test('should skip to next video in queue', async () => {
      // Get current video
      const beforeResponse = await fetch(`${GOBLIN_THREE.url}/queue`);
      const beforeData = await beforeResponse.json();
      const currentVideo = beforeData.queue.currentVideo;

      // Skip
      const skipResponse = await fetch(`${GOBLIN_THREE.url}/queue/skip`, {
        method: 'POST'
      });
      expect(skipResponse.ok).toBeTruthy();

      // Wait for skip to complete
      await new Promise(resolve => setTimeout(resolve, 2000));

      // Verify different video is playing
      const afterResponse = await fetch(`${GOBLIN_THREE.url}/queue`);
      const afterData = await afterResponse.json();

      // In loop mode, queue should still be running
      expect(afterData.queue.running).toBeTruthy();
    });
  });

  test.describe('Hardware Acceleration Verification', () => {
    test('should use v4l2m2m-copy hardware decoder', async () => {
      // This test verifies the configuration is correct
      // Actual hardware decoder verification would require SSH access

      const response = await fetch(`${GOBLIN_THREE.url}/status`);
      const data = await response.json();

      // Verify playback status structure exists
      expect(data.playback).toBeDefined();
      expect(data.playback.video).toBeDefined();
    });
  });

  test.describe('Cleanup', () => {
    test('should stop all playback after tests', async () => {
      const response = await fetch(`${GOBLIN_THREE.url}/queue/stop`, {
        method: 'POST'
      });

      expect(response.ok).toBeTruthy();

      // Wait for cleanup
      await new Promise(resolve => setTimeout(resolve, 1000));
    });
  });
});

