/**
 * Scenes API
 */
import express from 'express';
import scenesService from '../../services/scenes/scenesService.js';
import sceneExecutor from '../../services/scenes/sceneExecutor.js';
import sceneQueue from '../../services/scenes/sceneQueue.js';
import queueTemplates from '../../services/scenes/queueTemplates.js';

const router = express.Router();

function getCurrentCharacterId(req){
  return (parseInt(req.app.locals?.config?.selectedCharacter,10)) || 4;
}

router.get('/', async (req, res) => {
  try {
    const scenes = await scenesService.loadScenes();
    res.json({ success: true, scenes });
  } catch (e) {
    res.status(500).json({ success: false, error: e && e.message });
  }
});

router.post('/', express.json(), async (req, res) => {
  try {
    const body = req.body || {};
    if (!body.name) return res.status(400).json({ success: false, error: 'name is required' });
    const scenes = await scenesService.loadScenes();
    const id = await scenesService.nextSceneId();
    const scene = { id, name: String(body.name), steps: Array.isArray(body.steps) ? body.steps : [], created: new Date().toISOString() };
    scenes.push(scene);
    await scenesService.saveScenes(scenes);
    res.json({ success: true, scene });
  } catch (e) {
    res.status(500).json({ success: false, error: e && e.message });
  }
});

router.put('/:id', express.json(), async (req, res) => {
  try {
    const id = parseInt(req.params.id,10);
    const body = req.body || {};
    const scenes = await scenesService.loadScenes();
    const idx = scenes.findIndex(s => parseInt(s.id,10) === id);
    if (idx === -1) return res.status(404).json({ success: false, error: 'Scene not found' });
    const prev = scenes[idx];
    const next = Object.assign({}, prev, { name: body.name != null ? String(body.name) : prev.name, steps: Array.isArray(body.steps) ? body.steps : prev.steps, updated: new Date().toISOString() });
    scenes[idx] = next;
    await scenesService.saveScenes(scenes);
    res.json({ success: true, scene: next });
  } catch (e) {
    res.status(500).json({ success: false, error: e && e.message });
  }
});

router.delete('/:id', async (req, res) => {
  try {
    const id = parseInt(req.params.id,10);
    const scenes = await scenesService.loadScenes();
    const idx = scenes.findIndex(s => parseInt(s.id,10) === id);
    if (idx === -1) return res.status(404).json({ success: false, error: 'Scene not found' });
    const removed = scenes.splice(idx,1)[0];
    await scenesService.saveScenes(scenes);
    res.json({ success: true, removed });
  } catch (e) {
    res.status(500).json({ success: false, error: e && e.message });
  }
});

// Play a scene and return when complete
router.post('/:id/play', async (req, res) => {
  try {
    const id = parseInt(req.params.id,10);
    const scenes = await scenesService.loadScenes();
    const scene = scenes.find(s => parseInt(s.id,10) === id);
    if (!scene) return res.status(404).json({ success: false, error: 'Scene not found' });
    const characterId = getCurrentCharacterId(req);

    const dryRun = (String(req.query?.dryRun||'').toLowerCase() === '1' || String(req.query?.dryRun||'').toLowerCase() === 'true');
    const result = await sceneExecutor.executeScene(scene, characterId, null, { dryRun });
    res.json({ success: true, played: id, steps: (scene.steps||[]).length, result, dryRun });
  } catch (e) {
    res.status(500).json({ success: false, error: e && e.message });
  }
});

// Stream live progress with Server-Sent Events (SSE)
router.get('/:id/play-stream', async (req, res) => {
  try {
    const id = parseInt(req.params.id,10);
    const scenes = await scenesService.loadScenes();
    const scene = scenes.find(s => parseInt(s.id,10) === id);
    if (!scene) return res.status(404).json({ success: false, error: 'Scene not found' });
    const characterId = getCurrentCharacterId(req);

    res.setHeader('Content-Type', 'text/event-stream');
    res.setHeader('Cache-Control', 'no-cache');
    res.setHeader('Connection', 'keep-alive');
    res.flushHeaders && res.flushHeaders();

    const emit = (ev) => {
      try { res.write(`data: ${JSON.stringify(ev)}\n\n`); } catch (_) {}
    };

    emit({ type: 'sse', status: 'open' });

    const dryRun = (String(req.query?.dryRun||'').toLowerCase() === '1' || String(req.query?.dryRun||'').toLowerCase() === 'true');
    sceneExecutor.executeScene(scene, characterId, emit, { dryRun })
      .then((result) => {
        emit({ type: 'scene', status: 'done', success: true, result, dryRun });
        try { res.end(); } catch (_) {}
      })
      .catch((err) => {
        emit({ type: 'scene', status: 'done', success: false, error: err && err.message, dryRun });
        try { res.end(); } catch (_) {}
      });
  } catch (e) {
    res.status(500).json({ success: false, error: e && e.message });
  }
});

// --- Queue Endpoints ---
router.get('/queue', async (req,res) => {
  try {
    const characterId = getCurrentCharacterId(req);
    const status = sceneQueue.getStatus(characterId);
    res.json({ success: true, status });
  } catch (e) {
    res.status(500).json({ success: false, error: e && e.message });
  }
});

router.post('/queue/enqueue', express.json(), async (req,res) => {
  try {
    const characterId = getCurrentCharacterId(req);
    const sceneId = parseInt(req.body && req.body.sceneId, 10);
    if (!sceneId) return res.status(400).json({ success: false, error: 'sceneId required' });
    const status = await sceneQueue.enqueue(characterId, sceneId);
    res.json({ success: true, status });
  } catch (e) {
    res.status(500).json({ success: false, error: e && e.message });
  }
});

router.post('/queue/start', async (req,res) => {
  try {
    const characterId = getCurrentCharacterId(req);
    const status = await sceneQueue.start(characterId);
    res.json({ success: true, status });
  } catch (e) {
    res.status(500).json({ success: false, error: e && e.message });
  }
});

router.post('/queue/stop', async (req,res) => {
  try {
    const characterId = getCurrentCharacterId(req);
    const status = sceneQueue.stop(characterId);
    res.json({ success: true, status });
  } catch (e) {
    res.status(500).json({ success: false, error: e && e.message });
  }
});

router.post('/queue/clear', async (req,res) => {
  try {
    const characterId = getCurrentCharacterId(req);
    const status = sceneQueue.clear(characterId);
    res.json({ success: true, status });
  } catch (e) {
    res.status(500).json({ success: false, error: e && e.message });
  }
});

router.post('/queue/reorder', express.json(), async (req,res) => {
  try {
    const characterId = getCurrentCharacterId(req);
    const fromIndex = parseInt(req.body && req.body.fromIndex, 10);
    const toIndex = parseInt(req.body && req.body.toIndex, 10);
    if (isNaN(fromIndex) || isNaN(toIndex)) return res.status(400).json({ success: false, error: 'fromIndex and toIndex required' });
    const status = sceneQueue.reorder(characterId, fromIndex, toIndex);
    res.json({ success: true, status });
  } catch (e) {
    res.status(500).json({ success: false, error: e && e.message });
  }
});

// Queue Templates
router.get('/queue/templates', async (req,res) => {
  try {
    const characterId = getCurrentCharacterId(req);
    const templates = await queueTemplates.loadTemplates(characterId);
    res.json({ success: true, templates });
  } catch (e) {
    res.status(500).json({ success: false, error: e && e.message });
  }
});

router.post('/queue/templates/save', express.json(), async (req,res) => {
  try {
    const characterId = getCurrentCharacterId(req);
    const status = sceneQueue.getStatus(characterId);
    const name = (req.body && req.body.name) || '';
    const tpl = await queueTemplates.saveCurrentQueueAsTemplate(characterId, status.items || [], name);
    const templates = await queueTemplates.loadTemplates(characterId);
    res.json({ success: true, template: tpl, templates });
  } catch (e) {
    res.status(500).json({ success: false, error: e && e.message });
  }
});

router.post('/queue/templates/enqueue', express.json(), async (req,res) => {
  try {
    const characterId = getCurrentCharacterId(req);
    const id = req.body && req.body.id;
    if (!id) return res.status(400).json({ success: false, error: 'id required' });
    const status = await queueTemplates.enqueueTemplate(characterId, id, sceneQueue);
    res.json({ success: true, status });
  } catch (e) {
    res.status(500).json({ success: false, error: e && e.message });
  }
});

export default router;

