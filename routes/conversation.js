/**
 * Conversation Page Routes
 * Full-page conversation interface with mic panel, webcam preview, jaw toggle,
 * and Make [Character] Say (ElevenLabs -> playback with optional speakerPartId).
 */

import express from 'express';
import fs from 'fs/promises';
import path from 'path';
import { fileURLToPath } from 'url';
import { readConfig } from '../services/configService.js';
import elevenLabsTTSService from '../services/elevenLabsTTSService.js';
import serverPlaybackService from '../services/serverPlaybackService.js';
import { getTTSConfig } from '../services/aiConfigStore.js';
import { loadParts as loadPartsFromController } from '../controllers/partsController.js';
import jawAnimationService from '../services/jawAnimationService.js';
import * as motionTrackingController from '../controllers/motionTrackingController.js';
import elevenLabsConfigService from '../services/elevenLabsConfigService.js';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

const router = express.Router();

function getCurrentCharacterId(req) {
  return (parseInt(req.app.locals?.config?.selectedCharacter, 10)) || null;
}

async function getDataDir() {
  const cfg = await readConfig();
  // App root is repository app folder two levels up from routes/
  const appRoot = path.resolve(__dirname, '..', '..');
  return path.resolve(appRoot, cfg && cfg.dataPath ? cfg.dataPath : 'data');
}

// Prefer canonical loader
async function loadParts() {
  try { return await loadPartsFromController(); } catch (_) { return []; }
}

async function readJawSettings() {
  try { const p = await getDataDir(); const f = path.resolve(p, 'jaw_settings.json'); const txt = await fs.readFile(f, 'utf8'); return JSON.parse(txt) || {}; } catch (_) { return {}; }
}
async function writeJawSettings(obj) {
  const p = await getDataDir();
  const f = path.resolve(p, 'jaw_settings.json');
  await fs.mkdir(path.dirname(f), { recursive: true });
  await fs.writeFile(f, JSON.stringify(obj, null, 2), 'utf8');
}

// GET /conversation (page)
router.get('/', async (req, res) => {
  res.render('conversation/index', {
    title: 'Conversation - MonsterBox 5.0',
    page: 'conversation'
  });
});

// GET /conversation/api/webcam-stream-url - same logic as /live
router.get('/api/webcam-stream-url', async (req, res) => {
  try {
    const characterId = getCurrentCharacterId(req);
    const parts = await loadParts();
    const cams = parts.filter(p => String(p.type).toLowerCase() === 'webcam');
    const cam = cams.find(p => Number(p.characterId) === Number(characterId)) || cams[0];
    if (!cam) return res.json({ success: true, url: null });
    const url = `/setup/webcam/api/parts/${cam.id}/stream`;
    res.json({ success: true, url });
  } catch (e) {
    res.status(500).json({ success: false, error: e && e.message });
  }
});

// GET /conversation/api/speakers - speakers for current character (fallback to all)
router.get('/api/speakers', async (req, res) => {
  try {
    const characterId = getCurrentCharacterId(req);
    const parts = await loadParts();
    const speakers = parts.filter(p => String(p.type).toLowerCase() === 'speaker');
    const byCharacter = characterId ? speakers.filter(s => Number(s.characterId) === Number(characterId)) : speakers;
    res.json({ success: true, speakers: (byCharacter.length ? byCharacter : speakers) });
  } catch (e) {
    res.status(500).json({ success: false, error: e && e.message });
  }
});

// GET /conversation/api/jaw-settings
router.get('/api/jaw-settings', async (req, res) => {
  try {
    const characterId = getCurrentCharacterId(req);
    const settings = await readJawSettings();
    const enabled = characterId ? !!settings[String(characterId)]?.enabled : false;
    res.json({ success: true, enabled });
  } catch (e) {
    res.status(500).json({ success: false, error: e && e.message });
  }
});

// GET /conversation/api/agent-status - whether ElevenLabs is configured
router.get('/api/agent-status', async (req, res) => {
  try {
    const configured = !!elevenLabsConfigService.isElevenLabsConfigured();
    res.json({ success: true, configured });
  } catch (e) {
    res.status(500).json({ success: false, error: e && e.message });
  }
});

// POST /conversation/api/jaw-settings { enabled }
router.post('/api/jaw-settings', express.json(), async (req, res) => {
  try {
    const characterId = getCurrentCharacterId(req);
    if (!characterId) return res.status(400).json({ success: false, error: 'No selected character' });
    const settings = await readJawSettings();
    const cur = settings[String(characterId)] || {};
    cur.enabled = !!req.body.enabled;
    settings[String(characterId)] = cur;
    await writeJawSettings(settings);
    res.json({ success: true, enabled: cur.enabled });
  } catch (e) {
    res.status(500).json({ success: false, error: e && e.message });
  }
  });

// Head Tracking status for current character's webcam
router.get('/api/head-tracking-status', async (req, res) => {
  try {
    const characterId = getCurrentCharacterId(req);
    const parts = await loadParts();
    const cams = parts.filter(p => String(p.type).toLowerCase() === 'webcam');
    const cam = cams.find(p => Number(p.characterId) === Number(characterId)) || cams[0];
    if (!cam) return res.json({ success: true, headTracking: { enabled: false }, warning: 'No webcam found' });

    const fRes = { json: (b) => res.json(b), status: (c) => ({ json: (b) => res.status(c).json(b) }) };
    await motionTrackingController.getHeadTrackingStatus({ query: { webcamId: cam.id } }, fRes);
  } catch (e) {
    res.status(500).json({ success: false, error: e && e.message });
  }
});

// Enable/Disable head tracking using best-guess parts for current character
router.post('/api/head-tracking', express.json(), async (req, res) => {
  try {
    const enabled = !!(req.body && req.body.enabled);

    // Hard bypass in test mode to avoid 400s and hardware dependencies
    if (process.env.MB_TEST_MODE === '1' || process.env.MB_TEST_MODE === 'true') {
      return res.json({ success: true, testMode: true, enabled });
    }

    const characterId = getCurrentCharacterId(req);
    const parts = await loadParts();
    const cams = parts.filter(p => String(p.type).toLowerCase() === 'webcam');
    const cam = cams.find(p => Number(p.characterId) === Number(characterId)) || cams[0];
    if (!cam) {
      return res.status(400).json({ success: false, error: 'No webcam found for head tracking' });
    }

    const fRes = { json: (b) => res.json(b), status: (c) => ({ json: (b) => res.status(c).json(b) }) };

    if (enabled) {
      const servos = parts.filter(p => String(p.type).toLowerCase() === 'servo');
      const byChar = characterId ? servos.filter(s => Number(s.characterId) === Number(characterId)) : servos;
      const pan = byChar.find(s => /pan|head|swivel/i.test(String(s.name || ''))) || byChar[0];
      if (!pan) {
        return res.status(400).json({ success: false, error: 'No servo found for pan axis' });
      }
      await motionTrackingController.enableHeadTracking({ body: { webcamId: cam.id, panServoId: pan.id, params: { rangeDeg: 60, smoothing: 0.3, deadzone: 6 } } }, fRes);
    } else {
      await motionTrackingController.disableHeadTracking({ body: { webcamId: cam.id } }, fRes);
    }
  } catch (e) {
    res.status(500).json({ success: false, error: e && e.message });
  }
});

// POST /conversation/api/say { text, speakerPartId? }
router.post('/api/say', express.json(), async (req, res) => {
  try {
    const text = (req.body && req.body.text ? String(req.body.text) : '').trim();
    if (!text) return res.status(400).json({ success: false, error: 'text is required' });
    const characterId = getCurrentCharacterId(req);

    // In test mode, bypass external TTS and return success to keep E2E deterministic
    if (process.env.MB_TEST_MODE === '1' || process.env.MB_TEST_MODE === 'true') {
      try { jawAnimationService.driveFromText({ characterId, text }).catch(() => {}); } catch (_) {}
      return res.json({ success: true, testMode: true });
    }

    const ttsCfg = await getTTSConfig();
    const gen = await elevenLabsTTSService.generateSpeech(text, ttsCfg.voice_id, ttsCfg);
    if (!gen.success) return res.status(500).json({ success: false, error: gen.error || 'TTS generation failed' });

    const play = await serverPlaybackService.playBufferOnCharacterSpeaker(gen.audioBuffer, {
      contentType: gen.contentType, characterId, speakerPartId: req.body.speakerPartId || undefined
    });
    if (!play.success) return res.status(500).json({ success: false, error: play.error || 'Playback failed' });

    // Fire-and-forget rudimentary jaw animation driven by text amplitude heuristic
    try { jawAnimationService.driveFromText({ characterId, text }).catch(() => {}); } catch (_) {}

    res.json({ success: true, device: play.deviceId });
  } catch (e) {
    res.status(500).json({ success: false, error: e && e.message });
  }
});

// POST /conversation/api/jaw-drive { amplitude }
router.post('/api/jaw-drive', express.json(), async (req, res) => {
  try {
    const characterId = getCurrentCharacterId(req);
    const amp = Number(req.body && req.body.amplitude);
    if (!Number.isFinite(amp)) return res.status(400).json({ success: false, error: 'amplitude required (0..1)' });
    try { await jawAnimationService.driveFromAmplitude({ characterId, amplitude: Math.max(0, Math.min(1, amp)) }); } catch (_) {}
    res.json({ success: true });
  } catch (e) {
    res.status(500).json({ success: false, error: e && e.message });
  }
});

export default router;

