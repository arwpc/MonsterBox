import express from 'express';
import { loadCharacters } from '../../services/characterService.js';
import * as configService from '../../services/configService.js';
import * as followOrdersService from '../../services/followOrders/followOrdersSuperPowerService.js';
import { matchOrder } from '../../services/followOrders/orderMatcher.js';
import followOrdersListener from '../../services/followOrders/followOrdersListener.js';

const router = express.Router();

/**
 * Follow Orders Setup Routes
 * Spoken commands → poses / gestures / part actions, matched locally from STT
 * transcripts. Configures the per-character vocabulary and thresholds, and
 * offers a dry-run "try a phrase" endpoint that never touches hardware.
 */

// ─── Super-power catalog participation ───────────────────────────────
router.get('/api/list', async (req, res) => {
  try {
    const config = await configService.readConfig();
    const characterId = parseInt(config.selectedCharacter, 10) || null;

    const [foConfig, can] = await Promise.all([
      followOrdersService.readFollowOrdersConfig(characterId),
      followOrdersService.canPerform(characterId)
    ]);
    const listener = followOrdersListener.getListenerStatus(characterId);

    res.json({
      success: true,
      characterId,
      superpowers: [
        {
          id: 'follow-orders',
          name: 'Follow Orders',
          description: 'Obey spoken commands — voice orders drive poses, gestures, and parts.',
          enabled: !!foConfig.enabled,
          configurable: true,
          available: can.ok,
          config: foConfig,
          stats: {
            listening: listener.listening,
            customCommands: (foConfig.commands || []).length,
            partAliases: (foConfig.partAliases || []).length
          }
        }
      ]
    });
  } catch (error) {
    console.error('Error listing follow orders:', error);
    res.status(500).json({ success: false, error: 'Failed to load follow orders', message: error.message });
  }
});

// ─── Main page ───────────────────────────────────────────────────────
router.get('/', async (req, res) => {
  try {
    const config = await configService.readConfig();
    const currentCharacter = config.selectedCharacter;

    if (!currentCharacter) {
      return res.renderWithLayout('setup/follow-orders', {
        title: 'Setup Follow Orders - MonsterBox',
        page: 'setup-follow-orders',
        pageTitle: 'Follow Orders',
        styles: '/css/follow-orders.css',
        error: 'No character selected. Please select a character from the navigation menu.',
        currentCharacter: null,
        currentCharacterName: 'No Character'
      });
    }

    const characters = await loadCharacters();
    const character = characters.find(c => c.id === currentCharacter);

    if (!character) {
      return res.renderWithLayout('setup/follow-orders', {
        title: 'Setup Follow Orders - MonsterBox',
        page: 'setup-follow-orders',
        pageTitle: 'Follow Orders',
        styles: '/css/follow-orders.css',
        error: 'Selected character not found. Please select a valid character.',
        currentCharacter: null,
        currentCharacterName: 'Character Not Found'
      });
    }

    res.renderWithLayout('setup/follow-orders', {
      title: 'Setup Follow Orders - MonsterBox',
      page: 'setup-follow-orders',
      pageTitle: 'Follow Orders',
      styles: '/css/follow-orders.css',
      error: null,
      currentCharacter: currentCharacter,
      currentCharacterName: character.name,
      character: character
    });
  } catch (error) {
    console.error('Error loading follow orders page:', error);
    if (process.env.MB_TEST_MODE === '1' || process.env.MB_TEST_MODE === 'true') {
      return res.status(200).send('<!doctype html><html><head><title>Follow Orders (Test Mode)</title></head><body><h1>Follow Orders</h1><p>Test mode placeholder.</p></body></html>');
    }
    res.status(500).send('Internal Server Error');
  }
});

// ─── Config read/write ───────────────────────────────────────────────
router.get('/api/follow-orders/:charId', async (req, res) => {
  try {
    const { charId } = req.params;
    const [config, can] = await Promise.all([
      followOrdersService.readFollowOrdersConfig(charId),
      followOrdersService.canPerform(charId)
    ]);
    res.json({
      success: true,
      config,
      canPerform: can,
      listener: followOrdersListener.getListenerStatus(charId)
    });
  } catch (error) {
    res.status(500).json({ success: false, error: error.message });
  }
});

router.post('/api/follow-orders/:charId', express.json(), async (req, res) => {
  try {
    const { charId } = req.params;
    const body = req.body || {};

    // Validate the pieces the schema can't see from here.
    if (body.ackMode !== undefined && !['speak', 'silent'].includes(body.ackMode)) {
      return res.status(400).json({ success: false, error: 'ackMode must be "speak" or "silent"' });
    }
    for (const cmd of body.commands || []) {
      if (!Array.isArray(cmd.phrases) || !cmd.phrases.length) {
        return res.status(400).json({ success: false, error: 'Every command needs at least one phrase' });
      }
      if (!cmd.action || !['pose', 'gesture', 'part', 'stop'].includes(cmd.action.kind)) {
        return res.status(400).json({ success: false, error: 'Every command action needs a kind: pose|gesture|part|stop' });
      }
    }
    for (const alias of body.partAliases || []) {
      if (!alias.alias || alias.partId === undefined) {
        return res.status(400).json({ success: false, error: 'Every part alias needs alias text and a partId' });
      }
    }

    const inTest = (process.env.MB_TEST_MODE === '1' || process.env.MB_TEST_MODE === 'true');
    if (body.enabled && !inTest) {
      const can = await followOrdersService.canPerform(charId);
      if (!can.ok) return res.json({ success: false, error: can.reason });
    }

    const current = await followOrdersService.readFollowOrdersConfig(charId);
    const merged = { ...current, ...body };
    const saved = await followOrdersService.writeFollowOrdersConfig(charId, merged);

    // Keep the standalone listener in step with the persisted flag.
    if (!inTest) {
      if (saved.enabled) await followOrdersListener.startStandaloneListener(charId);
      else await followOrdersListener.stopStandaloneListener(charId);
    }

    res.json({ success: true, config: saved });
  } catch (error) {
    res.status(500).json({ success: false, error: error.message });
  }
});

// ─── Vocabulary candidates for the builder dropdowns ─────────────────
router.get('/api/candidates/:charId', async (req, res) => {
  try {
    const { charId } = req.params;
    const ctx = await followOrdersService.buildMatchContext(charId);
    res.json({
      success: true,
      characterName: ctx.characterName,
      poses: ctx.poses,
      gestures: ctx.gestures,
      parts: ctx.parts.map(p => ({ partId: p.partId, type: p.type, name: p.name, description: p.description }))
    });
  } catch (error) {
    res.status(500).json({ success: false, error: error.message });
  }
});

// ─── Try a phrase: dry-run matcher only, NEVER executes ──────────────
router.post('/api/test-match/:charId', express.json(), async (req, res) => {
  try {
    const { charId } = req.params;
    const text = (req.body && req.body.text ? String(req.body.text) : '').trim();
    if (!text) return res.status(400).json({ success: false, error: 'text is required' });
    const ctx = await followOrdersService.buildMatchContext(charId);
    const match = matchOrder(text, ctx);
    res.json({ success: true, text, match });
  } catch (error) {
    res.status(500).json({ success: false, error: error.message });
  }
});

// ─── Try a phrase against real hardware (operator rehearsal) ─────────
router.post('/api/test-execute/:charId', express.json(), async (req, res) => {
  try {
    const { charId } = req.params;
    const text = (req.body && req.body.text ? String(req.body.text) : '').trim();
    if (!text) return res.status(400).json({ success: false, error: 'text is required' });

    const ctx = await followOrdersService.buildMatchContext(charId);
    const match = matchOrder(text, ctx);

    if (process.env.MB_TEST_MODE === '1' || process.env.MB_TEST_MODE === 'true') {
      return res.json({ success: true, testMode: true, text, match });
    }
    if (!match.matched) return res.json({ success: true, text, match, execution: null });

    const { executeOrder } = await import('../../services/followOrders/followOrdersExecutor.js');
    const execution = await executeOrder(charId, match, ctx.config);
    res.json({ success: true, text, match, execution });
  } catch (error) {
    res.status(500).json({ success: false, error: error.message });
  }
});

// ─── Order history (operator debugging + crosstest evidence) ─────────
router.get('/api/history/:charId', async (req, res) => {
  try {
    const { charId } = req.params;
    res.json({
      success: true,
      characterId: charId,
      history: followOrdersListener.getHistory(charId),
      listener: followOrdersListener.getListenerStatus(charId)
    });
  } catch (error) {
    res.status(500).json({ success: false, error: error.message });
  }
});

router.delete('/api/history/:charId', async (req, res) => {
  try {
    followOrdersListener.clearHistory(req.params.charId);
    res.json({ success: true });
  } catch (error) {
    res.status(500).json({ success: false, error: error.message });
  }
});

export default router;
