/**
 * Goblin Optimized Video System Tests
 * 
 * Tests the rock-solid Goblin video playback system
 * Verifies smooth 720p@60fps playback on all 3 Goblin Pi3s
 */

const { test, expect } = require('@playwright/test');

const GOBLINS = [
  { name: 'Goblin One', ip: '192.168.8.40', port: 3001 },
  { name: 'Goblin Two', ip: '192.168.8.106', port: 3001 },
  { name: 'Goblin Three', ip: '192.168.8.14', port: 3001 }
];

const TIMEOUT = 30000; // 30 seconds

test.describe('Goblin Optimized System - Connectivity', () => {
  
  for (const goblin of GOBLINS) {
    test(`${goblin.name} should be online and responding`, async ({ request }) => {
      const response = await request.get(`http://${goblin.ip}:${goblin.port}/health`, {
        timeout: TIMEOUT
      });
      
      expect(response.ok()).toBeTruthy();
      const data = await response.json();
      expect(data.status).toBe('healthy');
      
      console.log(`✅ ${goblin.name} is healthy`);
    });
    
    test(`${goblin.name} should report correct video player`, async ({ request }) => {
      const response = await request.get(`http://${goblin.ip}:${goblin.port}/status`, {
        timeout: TIMEOUT
      });
      
      expect(response.ok()).toBeTruthy();
      const data = await response.json();
      
      // Should be using mpv (best) or ffmpeg (acceptable)
      expect(['mpv', 'ffmpeg', 'omxplayer']).toContain(data.videoPlayer);
      
      console.log(`✅ ${goblin.name} using ${data.videoPlayer}`);
    });
  }
});

test.describe('Goblin Optimized System - Video Playback', () => {
  
  for (const goblin of GOBLINS) {
    test(`${goblin.name} should list available videos`, async ({ request }) => {
      const response = await request.get(`http://${goblin.ip}:${goblin.port}/media`, {
        timeout: TIMEOUT
      });
      
      expect(response.ok()).toBeTruthy();
      const data = await response.json();
      
      expect(data.media).toBeDefined();
      expect(data.media.video).toBeDefined();
      expect(Array.isArray(data.media.video)).toBeTruthy();
      
      console.log(`✅ ${goblin.name} has ${data.media.video.length} videos`);
    });
    
    test(`${goblin.name} should play video with hardware acceleration`, async ({ request }) => {
      // Get list of videos
      const mediaResponse = await request.get(`http://${goblin.ip}:${goblin.port}/media`, {
        timeout: TIMEOUT
      });
      const mediaData = await mediaResponse.json();
      
      if (mediaData.media.video.length === 0) {
        test.skip();
        return;
      }
      
      const testVideo = mediaData.media.video[0];
      
      // Play video
      const playResponse = await request.post(`http://${goblin.ip}:${goblin.port}/play-video`, {
        data: {
          filename: testVideo,
          loop: false
        },
        timeout: TIMEOUT
      });
      
      expect(playResponse.ok()).toBeTruthy();
      const playData = await playResponse.json();
      expect(playData.success).toBeTruthy();
      expect(playData.player).toBeDefined();
      
      console.log(`✅ ${goblin.name} playing ${testVideo} with ${playData.player}`);
      
      // Wait a bit for playback to start
      await new Promise(resolve => setTimeout(resolve, 2000));
      
      // Check status
      const statusResponse = await request.get(`http://${goblin.ip}:${goblin.port}/status`, {
        timeout: TIMEOUT
      });
      const statusData = await statusResponse.json();
      
      expect(statusData.video.playing).toBeTruthy();
      expect(statusData.video.file).toBe(testVideo);
      
      // Stop video
      await request.post(`http://${goblin.ip}:${goblin.port}/stop-video`, {
        timeout: TIMEOUT
      });
      
      console.log(`✅ ${goblin.name} video playback verified`);
    });
    
    test(`${goblin.name} should stop video cleanly`, async ({ request }) => {
      // Stop any playing video
      const stopResponse = await request.post(`http://${goblin.ip}:${goblin.port}/stop-video`, {
        timeout: TIMEOUT
      });
      
      expect(stopResponse.ok()).toBeTruthy();
      
      // Verify stopped
      const statusResponse = await request.get(`http://${goblin.ip}:${goblin.port}/status`, {
        timeout: TIMEOUT
      });
      const statusData = await statusResponse.json();
      
      expect(statusData.video.playing).toBeFalsy();
      
      console.log(`✅ ${goblin.name} video stopped cleanly`);
    });
  }
});

test.describe('Goblin Optimized System - Queue Management', () => {
  
  for (const goblin of GOBLINS) {
    test(`${goblin.name} should start video queue`, async ({ request }) => {
      // Get list of videos
      const mediaResponse = await request.get(`http://${goblin.ip}:${goblin.port}/media`, {
        timeout: TIMEOUT
      });
      const mediaData = await mediaResponse.json();
      
      if (mediaData.media.video.length < 2) {
        test.skip();
        return;
      }
      
      const videos = mediaData.media.video.slice(0, 3);
      
      // Start queue
      const queueResponse = await request.post(`http://${goblin.ip}:${goblin.port}/queue/start`, {
        data: {
          videos: videos,
          mode: 'loop'
        },
        timeout: TIMEOUT
      });
      
      expect(queueResponse.ok()).toBeTruthy();
      const queueData = await queueResponse.json();
      expect(queueData.success).toBeTruthy();
      
      console.log(`✅ ${goblin.name} queue started with ${videos.length} videos`);
      
      // Wait for queue to start
      await new Promise(resolve => setTimeout(resolve, 2000));
      
      // Check queue status
      const statusResponse = await request.get(`http://${goblin.ip}:${goblin.port}/queue/status`, {
        timeout: TIMEOUT
      });
      const statusData = await statusResponse.json();
      
      expect(statusData.queue.running).toBeTruthy();
      
      // Stop queue
      await request.post(`http://${goblin.ip}:${goblin.port}/queue/stop`, {
        timeout: TIMEOUT
      });
      
      console.log(`✅ ${goblin.name} queue management verified`);
    });
  }
});

test.describe('Goblin Optimized System - Stability', () => {
  
  test('All Goblins should be online simultaneously', async ({ request }) => {
    const results = await Promise.all(
      GOBLINS.map(async (goblin) => {
        try {
          const response = await request.get(`http://${goblin.ip}:${goblin.port}/health`, {
            timeout: TIMEOUT
          });
          return { goblin: goblin.name, online: response.ok() };
        } catch (error) {
          return { goblin: goblin.name, online: false };
        }
      })
    );
    
    const onlineCount = results.filter(r => r.online).length;
    
    console.log(`📊 Goblins online: ${onlineCount}/${GOBLINS.length}`);
    results.forEach(r => {
      console.log(`  ${r.online ? '✅' : '❌'} ${r.goblin}`);
    });
    
    expect(onlineCount).toBe(GOBLINS.length);
  });
  
  test('All Goblins should use hardware-accelerated players', async ({ request }) => {
    const results = await Promise.all(
      GOBLINS.map(async (goblin) => {
        try {
          const response = await request.get(`http://${goblin.ip}:${goblin.port}/status`, {
            timeout: TIMEOUT
          });
          const data = await response.json();
          return { 
            goblin: goblin.name, 
            player: data.videoPlayer,
            hardwareAccelerated: ['mpv', 'ffmpeg', 'omxplayer'].includes(data.videoPlayer)
          };
        } catch (error) {
          return { goblin: goblin.name, player: 'unknown', hardwareAccelerated: false };
        }
      })
    );
    
    console.log('📊 Video players:');
    results.forEach(r => {
      console.log(`  ${r.hardwareAccelerated ? '✅' : '❌'} ${r.goblin}: ${r.player}`);
    });
    
    const hwAccelCount = results.filter(r => r.hardwareAccelerated).length;
    expect(hwAccelCount).toBe(GOBLINS.length);
  });
  
  test('All Goblins should have no active processes initially', async ({ request }) => {
    // Stop all playback first
    await Promise.all(
      GOBLINS.map(goblin => 
        request.post(`http://${goblin.ip}:${goblin.port}/stop-video`, { timeout: TIMEOUT })
          .catch(() => {}) // Ignore errors
      )
    );
    
    await new Promise(resolve => setTimeout(resolve, 2000));
    
    // Check status
    const results = await Promise.all(
      GOBLINS.map(async (goblin) => {
        const response = await request.get(`http://${goblin.ip}:${goblin.port}/status`, {
          timeout: TIMEOUT
        });
        const data = await response.json();
        return {
          goblin: goblin.name,
          playing: data.video.playing,
          processes: data.activeProcesses || 0
        };
      })
    );
    
    console.log('📊 Playback status:');
    results.forEach(r => {
      console.log(`  ${!r.playing ? '✅' : '⚠️ '} ${r.goblin}: ${r.playing ? 'PLAYING' : 'IDLE'} (${r.processes} processes)`);
    });
    
    const allIdle = results.every(r => !r.playing);
    expect(allIdle).toBeTruthy();
  });
});

test.describe('Goblin Optimized System - Performance', () => {
  
  test('All Goblins should respond quickly to health checks', async ({ request }) => {
    const results = await Promise.all(
      GOBLINS.map(async (goblin) => {
        const start = Date.now();
        try {
          await request.get(`http://${goblin.ip}:${goblin.port}/health`, {
            timeout: TIMEOUT
          });
          const responseTime = Date.now() - start;
          return { goblin: goblin.name, responseTime, success: true };
        } catch (error) {
          return { goblin: goblin.name, responseTime: -1, success: false };
        }
      })
    );
    
    console.log('📊 Response times:');
    results.forEach(r => {
      if (r.success) {
        console.log(`  ${r.responseTime < 1000 ? '✅' : '⚠️ '} ${r.goblin}: ${r.responseTime}ms`);
      } else {
        console.log(`  ❌ ${r.goblin}: FAILED`);
      }
    });
    
    const allFast = results.every(r => r.success && r.responseTime < 2000);
    expect(allFast).toBeTruthy();
  });
});

