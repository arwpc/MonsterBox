/**
 * Gesture Engine API Routes
 *
 * Read the vocabulary a character can currently perform, and fire one by hand for
 * rehearsal. The agent normally drives gestures over the conversation WebSocket
 * (client tool `gesture`); these endpoints exist so the vocabulary is visible and
 * testable without standing in front of the animatronic talking to it.
 */
import express from 'express';
import { resolveCharacter } from '../../services/characterContext.js';
import gestureEngineService from '../../services/gestureEngineService.js';

const router = express.Router();

/**
 * GET /api/gestures — the current character's gesture vocabulary.
 * Returns rejected recipes too: a gesture that failed validation is a thing the
 * operator needs to see, not a thing to hide.
 */
router.get('/', async (req, res) => {
    try {
        const ctx = await resolveCharacter(req);
        const charId = ctx ? ctx.id : null;
        const result = await gestureEngineService.listGestures(charId);
        res.json({ success: true, characterId: charId, ...result });
    } catch (error) {
        console.error('Error listing gestures:', error.message);
        res.status(500).json({ success: false, error: 'Failed to list gestures', message: error.message });
    }
});

/**
 * POST /api/gestures/:gestureId/perform — rehearse one gesture.
 * Body: { kidMode?: boolean }
 *
 * Unlike the agent path this DOES await, so an operator pressing the button gets
 * a real result instead of an empty 200.
 */
router.post('/:gestureId/perform', express.json(), async (req, res) => {
    try {
        const ctx = await resolveCharacter(req);
        const charId = ctx ? ctx.id : null;
        const result = await gestureEngineService.performGesture(
            charId,
            req.params.gestureId,
            { kidMode: req.body?.kidMode === true }
        );
        // A refusal (unknown gesture, cooling down, cap reached, suppressed in kid
        // mode) is a legitimate answer, not a server error — report it as one.
        res.json({ success: true, characterId: charId, ...result });
    } catch (error) {
        console.error('Error performing gesture:', error.message);
        res.status(500).json({ success: false, error: 'Failed to perform gesture', message: error.message });
    }
});

/** POST /api/gestures/conversation/start|end — reset cooldowns and caps. */
router.post('/conversation/:action', express.json(), async (req, res) => {
    try {
        const ctx = await resolveCharacter(req);
        const charId = ctx ? ctx.id : null;
        const { action } = req.params;
        if (action === 'start') gestureEngineService.startConversation(charId);
        else if (action === 'end') gestureEngineService.endConversation(charId);
        else return res.status(400).json({ success: false, error: 'action must be start or end' });
        res.json({ success: true, characterId: charId, action });
    } catch (error) {
        res.status(500).json({ success: false, error: 'Failed', message: error.message });
    }
});

export default router;
