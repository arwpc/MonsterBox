import express from 'express';
import { loadCharacters } from '../../services/characterService.js';
import { resolveCharacter } from '../../services/characterContext.js';
import ledController, { LED_STATES, LED_COLORABLE_STATES } from '../../services/ledController.js';
import * as jawAnimationService from '../../services/jawAnimationSuperPowerService.js';
import ledAnimationService from '../../services/ledAnimationService.js';

const router = express.Router();

const isTestMode = () => process.env.MB_TEST_MODE === '1' || process.env.MB_TEST_MODE === 'true';

/**
 * LED Animation Setup Routes
 * The dedicated home for addressable LED-ring animation: per-state colours,
 * palette cross-fade, live colour/brightness, jaw-synced eyes, and a test panel
 * (state buttons, low→high sweep, and "speak & drive eyes" TTS playback).
 *
 * Character comes from the canonical resolver, which honours the :characterId
 * path param in its precedence — so these routes never read req.params directly.
 */

// A refused write carries its own status — a LOCKED character's is 423. Reporting
// that as a 500 tells the caller the server broke when the real answer is
// "refused, deliberately". Anything without a status stays a 500.
const statusFor = (error) => Number(error && error.status) || 500;

async function characterIdFor(req) {
  const ctx = await resolveCharacter(req);
  return ctx && ctx.id != null ? ctx.id : null;
}

// Main LED animation page
router.get('/', async (req, res) => {
  try {
    const characterId = await characterIdFor(req);
    if (characterId == null) {
      return res.renderWithLayout('setup/led-animation', {
        title: 'LED Animation - MonsterBox',
        page: 'setup-led-animation',
        pageTitle: 'LED Animation',
        styles: '/css/jaw-animation.css',
        error: 'No character selected. Please select a character from the navigation menu.',
        currentCharacter: null,
        currentCharacterName: 'No Character'
      });
    }

    const characters = await loadCharacters();
    const character = characters.find(c => c.id === characterId);

    res.renderWithLayout('setup/led-animation', {
      title: 'LED Animation - MonsterBox',
      page: 'setup-led-animation',
      pageTitle: 'LED Animation',
      styles: '/css/jaw-animation.css',
      currentCharacter: characterId,
      currentCharacterName: character ? character.name : 'Unknown',
      character: character || null
    });
  } catch (error) {
    console.error('Error loading LED animation page:', error);
    if (isTestMode()) {
      return res.status(200).send('<!doctype html><html><head><title>LED Animation (Test Mode)</title></head><body><h1>LED Animation</h1></body></html>');
    }
    res.status(500).send('Internal Server Error');
  }
});

// Combined config for the page: colour config + jaw-sync (ledSync) + LED parts.
router.get('/api/config/:characterId', async (req, res) => {
  try {
    const cid = await characterIdFor(req);
    if (cid == null) return res.status(409).json({ success: false, reason: 'no-character' });

    await ledController.initialize(cid).catch(() => {});
    const jaw = await jawAnimationService.readJawConfig(cid).catch(() => ({}));
    const availableLedParts = await jawAnimationService.getAvailableLedParts(cid);

    res.json({
      success: true,
      characterId: cid,
      available: ledController.available,
      config: ledController.colorConfig(),
      geometry: ledController.geometry,
      ledSync: (jaw && jaw.ledSync) || {},
      availableLedParts,
      states: LED_STATES,
      colorable: LED_COLORABLE_STATES
    });
  } catch (error) {
    console.error('Error getting LED animation config:', error);
    res.status(statusFor(error)).json({ success: false, error: error.message });
  }
});

// Save colour config (colors, palette, fade/hold, brightness, defaultState).
router.post('/api/config/:characterId', async (req, res) => {
  try {
    const cid = await characterIdFor(req);
    if (cid == null) return res.status(409).json({ success: false, reason: 'no-character' });
    const result = await ledController.saveColorConfig(req.body || {}, cid);
    if (!result.success) {
      return res.status(result.reason === 'no-led-part' || result.reason === 'no-parts-file' ? 409 : 500)
        .json({ success: false, ...result });
    }
    res.json({ success: true, ...result });
  } catch (error) {
    console.error('Error saving LED config:', error);
    res.status(statusFor(error)).json({ success: false, error: error.message });
  }
});

// Save the jaw-sync block (enabled, partId, colorLow, colorHigh).
router.post('/api/led-sync/:characterId', async (req, res) => {
  try {
    const cid = await characterIdFor(req);
    if (cid == null) return res.status(409).json({ success: false, reason: 'no-character' });
    await jawAnimationService.writeJawConfig(cid, { ledSync: req.body || {} });
    const jaw = await jawAnimationService.readJawConfig(cid);
    res.json({ success: true, ledSync: jaw.ledSync });
  } catch (error) {
    console.error('Error saving LED sync config:', error);
    res.status(statusFor(error)).json({ success: false, error: error.message });
  }
});

// Speak text on the character's speaker and drive the ring from the audio.
router.post('/api/test-tts/:characterId', async (req, res) => {
  try {
    const cid = await characterIdFor(req);
    const { text } = req.body || {};
    if (!text || !String(text).trim()) {
      return res.status(400).json({ success: false, error: 'text is required' });
    }
    if (isTestMode()) return res.json({ success: true, testMode: true, duration: 2000 });
    if (cid == null) return res.status(409).json({ success: false, reason: 'no-character' });

    const result = await ledAnimationService.playTtsWithLed(cid, text, { loop: !!(req.body && req.body.loop) });
    res.status(result.success ? 200 : 400).json(result);
  } catch (error) {
    console.error('Error in LED test-tts:', error);
    res.status(statusFor(error)).json({ success: false, error: error.message });
  }
});

// Preview the low→high gradient with a synthetic open/close sweep.
router.post('/api/sweep/:characterId', async (req, res) => {
  try {
    if (isTestMode()) return res.json({ success: true, testMode: true });
    const cid = await characterIdFor(req);
    if (cid == null) return res.status(409).json({ success: false, reason: 'no-character' });
    const result = await ledAnimationService.sweepLed(cid);
    res.status(result.success ? 200 : 400).json(result);
  } catch (error) {
    console.error('Error in LED sweep:', error);
    res.status(statusFor(error)).json({ success: false, error: error.message });
  }
});

// Stop TTS-driven LED playback and restore the eyes.
router.post('/api/stop/:characterId', async (req, res) => {
  try {
    const cid = await characterIdFor(req);
    if (cid == null) return res.status(409).json({ success: false, reason: 'no-character' });
    const result = await ledAnimationService.stopLedTts(cid);
    res.json(result);
  } catch (error) {
    console.error('Error stopping LED playback:', error);
    res.status(statusFor(error)).json({ success: false, error: error.message });
  }
});

export default router;
