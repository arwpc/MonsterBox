import express from 'express';
import { loadCharacters } from '../../services/characterService.js';
import { resolveCharacter } from '../../services/characterContext.js';
import * as aiMotionService from '../../services/aiMotionSuperPowerService.js';
import gestureEngineService from '../../services/gestureEngineService.js';
import { inferPartRoles } from '../../services/followOrders/bodyRoles.js';
import { loadPartsSafe } from '../../services/followOrders/followOrdersSuperPowerService.js';

const router = express.Router();

/**
 * AI Motion Setup Routes
 *
 * One page, one toggle and one vocabulary for "the character moves as well as
 * talks", whatever triggered the motion: the agent choosing a capability
 * mid-sentence, a guest asking for one out loud, or the ambient behaviour that
 * used to fire a random pose on every utterance with no settings page at all.
 *
 * Capabilities are stored in gestures.json and edited through the gesture
 * engine, so the editor and the runtime share one store and one validator —
 * a capability that saves is a capability that performs.
 */

const VIEW = 'setup/ai-motion';
const PAGE_DEFAULTS = {
  title: 'Setup AI Motion - MonsterBox',
  page: 'setup-ai-motion',
  pageTitle: 'AI Motion',
  styles: '/css/ai-motion.css'
};

const isTestMode = () => process.env.MB_TEST_MODE === '1' || process.env.MB_TEST_MODE === 'true';

// ─── Super-power catalog participation ───────────────────────────────
router.get('/api/list', async (req, res) => {
  try {
    const ctx = await resolveCharacter(req);
    const characterId = ctx ? ctx.id : null;

    const config = await aiMotionService.readAiMotionConfig(characterId);
    const vocab = characterId != null
      ? await gestureEngineService.listGestures(characterId)
      : { available: [], rejected: [] };

    res.json({
      success: true,
      characterId,
      superpowers: [{
        id: 'ai-motion',
        name: 'AI Motion',
        description: 'Motion that accompanies speech and answers spoken requests, from one vocabulary.',
        enabled: !!config.enabled,
        configurable: true,
        available: characterId != null,
        config,
        stats: {
          capabilities: vocab.available.length,
          rejected: (vocab.rejected || []).length
        }
      }]
    });
  } catch (error) {
    console.error('Error listing AI Motion super power:', error);
    res.status(500).json({ success: false, error: error.message });
  }
});

// ─── Page ────────────────────────────────────────────────────────────
router.get('/', async (req, res) => {
  try {
    const ctx = await resolveCharacter(req);
    const currentCharacter = ctx ? ctx.id : null;

    if (!currentCharacter) {
      return res.renderWithLayout(VIEW, {
        ...PAGE_DEFAULTS,
        error: 'No character selected. Please select a character from the navigation menu.',
        currentCharacter: null,
        currentCharacterName: 'No Character'
      });
    }

    const characters = await loadCharacters();
    const character = characters.find(c => c.id === currentCharacter);

    if (!character) {
      return res.renderWithLayout(VIEW, {
        ...PAGE_DEFAULTS,
        error: 'Selected character not found. Please select a valid character.',
        currentCharacter: null,
        currentCharacterName: 'Character Not Found'
      });
    }

    res.renderWithLayout(VIEW, {
      ...PAGE_DEFAULTS,
      error: null,
      currentCharacter,
      currentCharacterName: character.name,
      character
    });
  } catch (error) {
    console.error('Error loading AI Motion page:', error);
    if (isTestMode()) {
      return res.status(200).send('<!doctype html><html><head><title>AI Motion (Test Mode)</title></head><body><h1>AI Motion</h1><p>Test mode placeholder.</p></body></html>');
    }
    res.status(500).send('Internal Server Error');
  }
});

// ─── Config read/write ───────────────────────────────────────────────
router.get('/api/ai-motion/:charId', async (req, res) => {
  try {
    const { charId } = req.params;
    const config = await aiMotionService.readAiMotionConfig(charId);
    res.json({ success: true, characterId: charId, config, roles: aiMotionService.MOTION_ROLES });
  } catch (error) {
    console.error('Error reading AI Motion config:', error);
    res.status(500).json({ success: false, error: error.message });
  }
});

router.post('/api/ai-motion/:charId', express.json(), async (req, res) => {
  try {
    const { charId } = req.params;
    const body = req.body || {};

    // Partial saves are supported: the page posts only the section it changed.
    // MERGE FIRST, THEN VALIDATE. Validating the raw body defeats every
    // cross-field rule, because the two fields being compared need not arrive in
    // the same request — posting ambientMinAmplitude alone sailed past the
    // min<=max check and wrote an inverted window with a 200. Validating the
    // merged result is what the config will actually BE, so any rule added to
    // validateAiMotionConfig later is enforced on partial saves for free.
    const current = await aiMotionService.readAiMotionConfig(charId);
    const merged = {
      ...current,
      ...body,
      triggers: { ...current.triggers, ...(body.triggers || {}) },
      permissions: { ...current.permissions, ...(body.permissions || {}) }
    };

    const errors = aiMotionService.validateAiMotionConfig(merged);
    if (errors.length) {
      return res.status(400).json({ success: false, error: errors.join('; '), errors });
    }

    const config = await aiMotionService.writeAiMotionConfig(charId, merged);
    res.json({ success: true, config });
  } catch (error) {
    console.error('Error saving AI Motion config:', error);
    res.status(500).json({ success: false, error: error.message });
  }
});

// ─── Capabilities (the motion vocabulary) — full CRUD ────────────────

/**
 * List every authored capability, including ones the runtime currently refuses.
 * A refused capability is a thing the operator needs to see and fix, not a thing
 * to hide — the same posture GET /api/gestures already takes.
 */
router.get('/api/ai-motion/:charId/capabilities', async (req, res) => {
  try {
    const { charId } = req.params;
    const [vocab, live] = await Promise.all([
      gestureEngineService.readVocabulary(charId),
      gestureEngineService.listGestures(charId)
    ]);
    const performable = new Set(live.available.map(g => g.id));
    res.json({
      success: true,
      characterId: charId,
      absent: vocab.absent,
      capabilities: vocab.gestures.map(g => ({ ...g, performable: performable.has(g.id) })),
      rejected: live.rejected || []
    });
  } catch (error) {
    console.error('Error listing AI Motion capabilities:', error);
    res.status(500).json({ success: false, error: error.message });
  }
});

router.get('/api/ai-motion/:charId/capabilities/:id', async (req, res) => {
  try {
    const { charId, id } = req.params;
    const vocab = await gestureEngineService.readVocabulary(charId);
    const capability = vocab.gestures.find(g => g.id === id);
    if (!capability) return res.status(404).json({ success: false, error: `No capability "${id}"` });
    res.json({ success: true, capability });
  } catch (error) {
    res.status(500).json({ success: false, error: error.message });
  }
});

/** Create or replace. Refuses exactly what the runtime would refuse. */
router.post('/api/ai-motion/:charId/capabilities', express.json(), async (req, res) => {
  try {
    const { charId } = req.params;
    const result = await gestureEngineService.saveGesture(charId, req.body || {});
    if (!result.ok) {
      return res.status(400).json({ success: false, error: result.errors.join('; '), errors: result.errors });
    }
    res.status(result.created ? 201 : 200).json({ success: true, capability: result.gesture, created: result.created });
  } catch (error) {
    console.error('Error saving AI Motion capability:', error);
    res.status(500).json({ success: false, error: error.message });
  }
});

router.put('/api/ai-motion/:charId/capabilities/:id', express.json(), async (req, res) => {
  try {
    const { charId, id } = req.params;
    const capability = { ...(req.body || {}), id };
    const result = await gestureEngineService.saveGesture(charId, capability);
    if (!result.ok) {
      return res.status(400).json({ success: false, error: result.errors.join('; '), errors: result.errors });
    }
    res.json({ success: true, capability: result.gesture });
  } catch (error) {
    res.status(500).json({ success: false, error: error.message });
  }
});

router.delete('/api/ai-motion/:charId/capabilities/:id', async (req, res) => {
  try {
    const { charId, id } = req.params;
    const result = await gestureEngineService.deleteGesture(charId, id);
    if (!result.ok) return res.status(404).json({ success: false, error: result.errors.join('; ') });
    res.json({ success: true, deleted: result.deleted });
  } catch (error) {
    res.status(500).json({ success: false, error: error.message });
  }
});

/** Dry-run a draft so the editor can explain a refusal before saving it. */
router.post('/api/ai-motion/:charId/capabilities/validate', express.json(), async (req, res) => {
  try {
    const { charId } = req.params;
    const result = await gestureEngineService.validateGestureDraft(charId, req.body || {});
    res.json({ success: true, ...result });
  } catch (error) {
    res.status(500).json({ success: false, error: error.message });
  }
});

// ─── Permission surface: what this character actually has to move ────
router.get('/api/ai-motion/:charId/roles', async (req, res) => {
  try {
    const { charId } = req.params;
    const parts = await loadPartsSafe(charId);
    const roles = inferPartRoles(parts.map(p => ({ ...p, partId: String(p.id ?? p.partId) })));

    // Group by role so the page can present "this character's head is called
    // <whatever the operator called it>" rather than a flat part list.
    const byRole = {};
    for (const r of roles) {
      if (!r.movable && r.role !== 'light') continue;
      (byRole[r.role] = byRole[r.role] || []).push({
        partId: r.part.partId, name: r.part.name, type: r.part.type, side: r.side, primary: r.primary
      });
    }
    res.json({ success: true, characterId: charId, allRoles: aiMotionService.MOTION_ROLES, roles: byRole });
  } catch (error) {
    console.error('Error reading AI Motion roles:', error);
    res.status(500).json({ success: false, error: error.message });
  }
});

export default router;
