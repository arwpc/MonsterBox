/**
 * Live Dashboard Routes
 * Routes for live mode dashboard interface
 */

import express from 'express';
import posesController from '../../controllers/posesController.js';
import elevenLabsTTSService from '../../services/elevenLabsTTSService.js';
import serverPlaybackService from '../../services/serverPlaybackService.js';
import { getTTSConfig } from '../../services/aiConfigStore.js';
import fs from 'fs/promises';
import path from 'path';
import { fileURLToPath } from 'url';
import { readConfig } from '../../services/configService.js';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

const router = express.Router();

function getCurrentCharacterId(req) {
  return (parseInt(req.app.locals?.config?.selectedCharacter, 10)) || 4;
}

async function getDataDir() {
  const cfg = await readConfig();
  const appRoot = path.resolve(__dirname, '..', '..');
  return path.resolve(appRoot, cfg && cfg.dataPath ? cfg.dataPath : 'data');
}

async function loadParts() {
  try { const p = await getDataDir(); const txt = await fs.readFile(path.resolve(p, 'parts.json'), 'utf8'); return JSON.parse(txt) || []; } catch (_) { return []; }
}

// Live dashboard page
router.get('/', async (req, res) => {
  try {
    res.renderWithLayout('live/dashboard', {
      title: 'Live Dashboard - MonsterBox 4.0',
      page: 'live',
      config: { theme: 'dark' },
      scripts: ['/js/mic-panel.js']
    });
  } catch (error) {
    console.error('Error rendering live dashboard page:', error);
    res.status(500).render('error', {
      title: 'Error',
      page: 'error',
      config: { theme: 'dark' },
      error: 'Failed to load live dashboard page',
      message: error.message
    });
  }
});

// API endpoints for live dashboard
router.get('/api/poses', posesController.getAllPoses);
router.post('/api/poses/:id/execute', posesController.executePose);

// Say This (TTS -> playback) for current character
router.post('/api/say-this', express.json(), async (req, res) => {
  try {
    const text = (req.body && req.body.text ? String(req.body.text) : '').trim();
    if (!text) return res.status(400).json({ success: false, error: 'text is required' });
    const characterId = getCurrentCharacterId(req);
    const ttsCfg = await getTTSConfig();
    const gen = await elevenLabsTTSService.generateSpeech(text, ttsCfg.voice_id, ttsCfg);
    if (!gen.success) return res.status(500).json({ success: false, error: gen.error || 'TTS generation failed' });
    const play = await serverPlaybackService.playBufferOnCharacterSpeaker(gen.audioBuffer, { contentType: gen.contentType, characterId });
    if (!play.success) return res.status(500).json({ success: false, error: play.error || 'Playback failed' });
    res.json({ success: true });
  } catch (e) {
    res.status(500).json({ success: false, error: e && e.message });
  }
});

// Determine webcam stream URL for current character (first webcam part)
router.get('/api/webcam-stream-url', async (req, res) => {
  try {
    const characterId = getCurrentCharacterId(req);
    const parts = await loadParts();
    const cam = parts.find(p => String(p.type).toLowerCase() === 'webcam' && Number(p.characterId) === Number(characterId));
    if (!cam) return res.json({ success: true, url: null });
    const url = `/setup/webcam/api/parts/${cam.id}/stream`;
    res.json({ success: true, url });
  } catch (e) {
    res.status(500).json({ success: false, error: e && e.message });
  }
});

export default router;
