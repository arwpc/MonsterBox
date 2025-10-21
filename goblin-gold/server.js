#!/usr/bin/env node

const express = require('express');
const path = require('path');
const fs = require('fs').promises;
const { spawn } = require('child_process');
const MPVController = require('./src/mpvController');
const QueueManager = require('./src/queueManager');

const PORT = process.env.GOBLIN_PORT || 3001;

// Helper function to get video metadata using ffprobe
async function getVideoMetadata(filePath) {
  return new Promise((resolve) => {
    const ffprobe = spawn('ffprobe', [
      '-v', 'error',
      '-select_streams', 'v:0',
      '-show_entries', 'stream=codec_name,width,height,r_frame_rate,duration',
      '-of', 'json',
      filePath
    ]);

    let stdout = '';
    ffprobe.stdout.on('data', (data) => { stdout += data; });

    ffprobe.on('close', () => {
      try {
        const data = JSON.parse(stdout);
        const stream = data.streams && data.streams[0];

        if (stream) {
          const fps = stream.r_frame_rate ? eval(stream.r_frame_rate) : 0;
          resolve({
            duration: parseFloat(stream.duration) || 0,
            resolution: stream.width && stream.height ? `${stream.width}x${stream.height}` : 'unknown',
            fps: Math.round(fps),
            codec: stream.codec_name || 'unknown'
          });
        } else {
          resolve({ duration: 0, resolution: 'unknown', fps: 0, codec: 'unknown' });
        }
      } catch (err) {
        resolve({ duration: 0, resolution: 'unknown', fps: 0, codec: 'unknown' });
      }
    });

    ffprobe.on('error', () => {
      resolve({ duration: 0, resolution: 'unknown', fps: 0, codec: 'unknown' });
    });
  });
}

(async () => {
  const app = express();

  // CORS middleware - allow requests from MonsterBox
  app.use((req, res, next) => {
    res.header('Access-Control-Allow-Origin', '*');
    res.header('Access-Control-Allow-Methods', 'GET, POST, PUT, DELETE, OPTIONS');
    res.header('Access-Control-Allow-Headers', 'Content-Type, Authorization');
    if (req.method === 'OPTIONS') {
      return res.sendStatus(200);
    }
    next();
  });

  // JSON body for normal clients
  app.use(express.json({ limit: '1mb' }));

  // Core components
  const mpv = new MPVController({});
  const queue = new QueueManager(mpv, {});
  await queue.load();

  // Helpers
  const status = () => ({ ...queue.getStatus(), mpvRunning: !!mpv.process });

  // Health
  app.get('/health', (_req, res) => {
    res.json({ ok: true, uptime: process.uptime(), status: status() });
  });

  // Immediate playback (bypass queue)
  app.post('/play-video', async (req, res) => {
    try {
      let filename;
      let loop = false;

      if (req.body && typeof req.body === 'object' && !Array.isArray(req.body)) {
        filename = req.body.filename;
        loop = !!req.body.loop;
      }
      if (!filename && req.query && req.query.filename) {
        filename = req.query.filename;
        if (typeof req.query.loop !== 'undefined') loop = req.query.loop === 'true';
      }

      if (!filename || typeof filename !== 'string') {
        return res.status(400).json({ success: false, error: 'Missing filename' });
      }

      // Infer display FPS and DRM mode from cached filename pattern for smoother pacing
      let displayFps = null;
      let mode = null;
      if (/720p59\.94\.mp4$/.test(filename)) { displayFps = '59.94'; mode = '1280x720@59.94'; }
      else if (/720p60\.mp4$/.test(filename)) { displayFps = '60'; mode = '1280x720@60'; }

      await mpv.play(filename, { loop, displayFps, mode });
      res.json({ success: true, nowPlaying: filename });
    } catch (e) {
      res.status(500).json({ success: false, error: e.message });
    }
  });

  // Stop everything
  app.post('/stop-all', async (_req, res) => {
    try { await mpv.stop(); await queue.stop(); res.json({ success: true }); }
    catch (e) { res.status(500).json({ success: false, error: e.message }); }
  });

  // Queue endpoints
  app.get('/queue', (_req, res) => {
    const queueStatus = status();
    res.json({
      success: true,
      queue: {
        videos: queueStatus.videos,
        currentIndex: queueStatus.currentIndex,
        loopMode: queueStatus.loopMode,
        playing: queueStatus.playing
      },
      currentVideo: queueStatus.currentVideo,
      mpvRunning: queueStatus.mpvRunning
    });
  });

  app.post('/queue/add', async (req, res) => {
    try {
      let filename; let position = 'end';
      if (req.body && typeof req.body === 'object' && !Array.isArray(req.body)) {
        filename = req.body.filename;
        if (req.body.position) position = req.body.position;
      }
      if (!filename && req.query && req.query.filename) {
        filename = req.query.filename;
        if (req.query.position) position = req.query.position;
      }
      if (!filename || typeof filename !== 'string' || filename.length === 0) {
        return res.status(400).json({ success: false, error: 'Missing filename' });
      }
      const video = await queue.add(filename, position);
      res.json({ success: true, video });
    } catch (e) {
      res.status(500).json({ success: false, error: e.message });
    }
  });

  // Enqueue endpoint (alias for add)
  app.post('/queue/enqueue', async (req, res) => {
    try {
      const { filename } = req.body;
      if (!filename || typeof filename !== 'string' || filename.length === 0) {
        return res.status(400).json({ success: false, error: 'Missing filename' });
      }
      const video = await queue.add(filename, 'end');
      res.json({ success: true, video });
    } catch (e) {
      res.status(500).json({ success: false, error: e.message });
    }
  });

  // Enqueue priority endpoint (add to front and start playing)
  app.post('/queue/enqueue-priority', async (req, res) => {
    try {
      const { filename } = req.body;
      if (!filename || typeof filename !== 'string' || filename.length === 0) {
        return res.status(400).json({ success: false, error: 'Missing filename' });
      }

      // Add to front of queue
      const video = await queue.add(filename, 'start');

      // Start playing if not already playing
      if (!queue.queue.playing) {
        await queue.start({ loopMode: 'none' });
      }

      res.json({ success: true, video, playing: true });
    } catch (e) {
      res.status(500).json({ success: false, error: e.message });
    }
  });

  app.delete('/queue/remove/:id', async (req, res) => {
    try { const removed = await queue.remove(req.params.id); res.json({ success: true, removed }); }
    catch (e) { res.status(500).json({ success: false, error: e.message }); }
  });

  app.post('/queue/clear', async (_req, res) => {
    try { await queue.clear(); res.json({ success: true }); }
    catch (e) { res.status(500).json({ success: false, error: e.message }); }
  });

  app.post('/queue/start', async (req, res) => {
    try {
      let loopMode = 'none';
      if (req.body && typeof req.body === 'object' && !Array.isArray(req.body) && req.body.loopMode) {
        loopMode = req.body.loopMode;
      }
      if (req.query && req.query.loopMode) {
        loopMode = req.query.loopMode;
      }
      await queue.start({ loopMode });
      res.json({ success: true, status: status() });
    } catch (e) {
      res.status(500).json({ success: false, error: e.message });
    }
  });

  app.post('/queue/stop', async (_req, res) => {
    try { await queue.stop(); res.json({ success: true }); }
    catch (e) { res.status(500).json({ success: false, error: e.message }); }
  });

  app.post('/queue/skip', async (_req, res) => {
    try { await queue.skip(); res.json({ success: true }); }
    catch (e) { res.status(500).json({ success: false, error: e.message }); }
  });

  app.post('/queue/pause', async (_req, res) => {
    try {
      // MPV doesn't support pause/resume in our current implementation
      // Stop the queue instead
      await queue.stop();
      res.json({ success: true, paused: true });
    }
    catch (e) { res.status(500).json({ success: false, error: e.message }); }
  });

  app.post('/queue/resume', async (_req, res) => {
    try {
      // Resume by starting the queue again
      await queue.start({ loopMode: queue.queue.loopMode || 'none' });
      res.json({ success: true, resumed: true });
    }
    catch (e) { res.status(500).json({ success: false, error: e.message }); }
  });

  // New API endpoints for MonsterBox integration

  // Scan local video directory (legacy endpoint for compatibility)
  app.get('/media', async (_req, res) => {
    try {
      const videoDir = '/home/remote/media/video';
      const files = await fs.readdir(videoDir);
      const videos = [];

      for (const file of files) {
        if (!/\.(mp4|mov|avi|mkv)$/i.test(file)) continue;

        try {
          const filePath = path.join(videoDir, file);
          const stats = await fs.stat(filePath);

          // Get video metadata using ffprobe
          const metadata = await getVideoMetadata(filePath);

          videos.push({
            filename: file,
            path: file,  // Add path field for compatibility
            size: stats.size,
            duration: metadata.duration || 0,
            resolution: metadata.resolution || 'unknown',
            fps: metadata.fps || 0,
            codec: metadata.codec || 'unknown'
          });
        } catch (err) {
          console.error(`Error scanning ${file}:`, err);
        }
      }

      res.json({ success: true, media: { video: videos } });
    } catch (e) {
      res.status(500).json({ success: false, error: e.message });
    }
  });

  // Scan local video directory
  app.get('/api/videos/scan', async (_req, res) => {
    try {
      const videoDir = '/home/remote/media/video';
      const files = await fs.readdir(videoDir);
      const videos = [];

      for (const file of files) {
        if (!/\.(mp4|mov|avi|mkv)$/i.test(file)) continue;

        try {
          const filePath = path.join(videoDir, file);
          const stats = await fs.stat(filePath);

          // Get video metadata using ffprobe
          const metadata = await getVideoMetadata(filePath);

          videos.push({
            filename: file,
            size: stats.size,
            duration: metadata.duration || 0,
            resolution: metadata.resolution || 'unknown',
            fps: metadata.fps || 0,
            codec: metadata.codec || 'unknown'
          });
        } catch (err) {
          console.error(`Error scanning ${file}:`, err);
        }
      }

      res.json({ success: true, videos });
    } catch (e) {
      res.status(500).json({ success: false, error: e.message });
    }
  });

  // Play video immediately with queue interruption support
  app.post('/api/video/play-immediate', async (req, res) => {
    try {
      const { filename, returnToQueue = false } = req.body;

      if (!filename || typeof filename !== 'string') {
        return res.status(400).json({ success: false, error: 'Missing filename' });
      }

      // Save current queue state if we need to return to it
      const interrupted = mpv.currentVideo;
      const wasPlaying = queue.queue.playing;

      if (returnToQueue && wasPlaying) {
        // Pause queue but don't stop it
        queue.queue.playing = false;
        await queue.save();
      }

      // Play the immediate video
      await mpv.play(filename, { loop: false });

      // If returnToQueue, set up callback to resume queue
      if (returnToQueue && wasPlaying) {
        const originalOnEnd = mpv.onEnd;
        mpv.onEnd = async (finishedVideo) => {
          if (finishedVideo === filename) {
            // Resume queue
            queue.queue.playing = true;
            await queue.save();
            await queue.playNext();
            // Restore original callback
            mpv.onEnd = originalOnEnd;
          }
        };
      }

      res.json({
        success: true,
        playing: filename,
        interrupted: interrupted || null,
        willReturnToQueue: returnToQueue && wasPlaying
      });
    } catch (e) {
      res.status(500).json({ success: false, error: e.message });
    }
  });

  // Get playback status (legacy endpoint for compatibility)
  app.get('/playback-status', (_req, res) => {
    res.json({
      success: true,
      playing: !!mpv.currentVideo,
      currentVideo: mpv.currentVideo,
      mpvRunning: !!mpv.process,
      queue: {
        videos: queue.queue.videos,
        currentIndex: queue.queue.currentIndex,
        loopMode: queue.queue.loopMode,
        playing: queue.queue.playing
      }
    });
  });

  // Get detailed playback status
  app.get('/api/status', (_req, res) => {
    res.json({
      success: true,
      playing: !!mpv.currentVideo,
      currentVideo: mpv.currentVideo,
      mpvRunning: !!mpv.process,
      queue: {
        videos: queue.queue.videos,
        currentIndex: queue.queue.currentIndex,
        loopMode: queue.queue.loopMode,
        playing: queue.queue.playing
      }
    });
  });

  app.listen(PORT, () => console.log('Goblin API listening on ' + PORT));

  const cleanExit = async () => {
    try { await mpv.stop(); } catch (_e) { }
    process.exit(0);
  };
  process.on('SIGINT', cleanExit);
  process.on('SIGTERM', cleanExit);
})();

