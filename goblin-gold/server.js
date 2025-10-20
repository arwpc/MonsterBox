#!/usr/bin/env node

const express = require('express');
const path = require('path');
const MPVController = require('./src/mpvController');
const QueueManager = require('./src/queueManager');

const PORT = process.env.GOBLIN_PORT || 3001;

(async () => {
  const app = express();

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

      await mpv.play(filename, { loop });
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
  app.get('/queue', (_req, res) => res.json(status()));

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

  app.listen(PORT, () => console.log('Goblin Gold API listening on ' + PORT));

  const cleanExit = async () => {
    try { await mpv.stop(); } catch (_e) {}
    process.exit(0);
  };
  process.on('SIGINT', cleanExit);
  process.on('SIGTERM', cleanExit);
})();

