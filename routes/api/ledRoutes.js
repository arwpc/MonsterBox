/**
 * LED Ring API — /api/led
 *
 * Thin HTTP surface over services/ledController.js. Character comes from the
 * canonical resolver, so ?characterId=N works everywhere and a node whose
 * selected character has no LED part answers a clean 409 rather than driving
 * whatever happens to be on GPIO18 there.
 */

import express from 'express';
import { resolveCharacter } from '../../services/characterContext.js';
import ledController, { LED_STATES, LED_COLORABLE_STATES } from '../../services/ledController.js';

const router = express.Router();

async function characterIdFor(req) {
    try {
        const ctx = await resolveCharacter(req);
        return ctx && ctx.id != null ? ctx.id : null;
    } catch (_) {
        return null;
    }
}

/** Map a controller refusal onto an HTTP status the client can act on. */
function statusForReason(reason) {
    switch (reason) {
        case 'unknown-state':
        case 'invalid-brightness':
        case 'invalid-pixels':
            return 400;
        case 'no-character':
        case 'no-led-part':
        case 'no-parts-file':
            return 409;   // the request is well formed; this character has no rings
        case 'write-failed':
            return 500;
        case 'daemon-unreachable':
        case 'unreachable':
            return 503;
        default:
            return 500;
    }
}

/** GET /api/led/status → current state, geometry, and the resolved part */
router.get('/status', async (req, res) => {
    try {
        const characterId = await characterIdFor(req);
        if (characterId != null && characterId !== ledController.activeCharacterId) {
            await ledController.initialize(characterId);
        }
        const status = await ledController.getStatus();
        res.json({ success: true, ...status });
    } catch (error) {
        res.status(500).json({ success: false, error: error.message });
    }
});

/** GET /api/led/states → the vocabulary, for populating UI menus */
router.get('/states', (req, res) => {
    res.json({ success: true, states: LED_STATES, colorable: LED_COLORABLE_STATES });
});

/** GET /api/led/config → the saved colour block for the resolved character */
router.get('/config', async (req, res) => {
    try {
        const characterId = await characterIdFor(req);
        if (characterId == null) {
            return res.status(409).json({ success: false, reason: 'no-character' });
        }
        if (characterId !== ledController.activeCharacterId || !ledController.part) {
            await ledController.initialize(characterId);
        }
        if (!ledController.part) {
            return res.status(409).json({ success: false, reason: 'no-led-part' });
        }
        res.json({ success: true, characterId, config: ledController.colorConfig() });
    } catch (error) {
        res.status(500).json({ success: false, error: error.message });
    }
});

/**
 * POST /api/led/config → persist colours onto the character's led_ring part
 * body: { colors?, palette?, paletteRight?, fadeMs?, holdMs?, brightness?, defaultState? }
 */
router.post('/config', async (req, res) => {
    try {
        const characterId = await characterIdFor(req);
        const result = await ledController.saveColorConfig(req.body || {}, characterId);
        if (!result.success) {
            return res.status(statusForReason(result.reason)).json({ success: false, ...result });
        }
        res.json({ success: true, ...result });
    } catch (error) {
        res.status(500).json({ success: false, error: error.message });
    }
});

/**
 * POST /api/led/state
 * body: { state, color?, colorRight?, speed?, brightness?, target? }
 */
router.post('/state', async (req, res) => {
    try {
        const characterId = await characterIdFor(req);
        const { state, ...options } = req.body || {};
        const result = await ledController.setState(state, { ...options, characterId });
        if (!result.success) {
            return res.status(statusForReason(result.reason)).json({ success: false, ...result });
        }
        res.json({ success: true, ...result });
    } catch (error) {
        res.status(500).json({ success: false, error: error.message });
    }
});

/** POST /api/led/off → blackout */
router.post('/off', async (req, res) => {
    try {
        const characterId = await characterIdFor(req);
        if (characterId != null) await ledController.initialize(characterId);
        const result = await ledController.off();
        res.json({ success: result.success, ...result });
    } catch (error) {
        res.status(500).json({ success: false, error: error.message });
    }
});

/** POST /api/led/brightness  body: { brightness: 0-100 } */
router.post('/brightness', async (req, res) => {
    try {
        const characterId = await characterIdFor(req);
        if (characterId != null && characterId !== ledController.activeCharacterId) {
            await ledController.initialize(characterId);
        }
        const result = await ledController.setBrightness((req.body || {}).brightness);
        if (!result.success) {
            return res.status(statusForReason(result.reason)).json({ success: false, ...result });
        }
        res.json({ success: true, ...result });
    } catch (error) {
        res.status(500).json({ success: false, error: error.message });
    }
});

/**
 * POST /api/led/pixels
 * body: { pixels: [[r,g,b], ...], target?: 'left'|'right'|'both' }
 */
router.post('/pixels', async (req, res) => {
    try {
        const characterId = await characterIdFor(req);
        const { pixels, target } = req.body || {};
        const result = await ledController.setPixels(pixels, { target, characterId });
        if (!result.success) {
            return res.status(statusForReason(result.reason)).json({ success: false, ...result });
        }
        res.json({ success: true, ...result });
    } catch (error) {
        res.status(500).json({ success: false, error: error.message });
    }
});

/**
 * POST /api/led/audio-level  body: { level: 0..1 }
 *
 * Fire-and-forget on purpose — see ledController.pushAudioLevel. Always 200:
 * a dropped sample is not a client error, and the speech pipeline must not
 * branch on it mid-utterance.
 */
router.post('/audio-level', (req, res) => {
    const accepted = ledController.pushAudioLevel((req.body || {}).level);
    res.json({ success: true, accepted });
});

export default router;
