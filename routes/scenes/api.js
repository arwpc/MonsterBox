/**
 * Scenes API
 */
import express from 'express';
import scenesService from '../../services/scenes/scenesService.js';
import sceneExecutor from '../../services/scenes/sceneExecutor.js';
import sceneQueue from '../../services/scenes/sceneQueue.js';
import queueTemplates from '../../services/scenes/queueTemplates.js';
import queueLibrary from '../../services/scenes/queueLibrary.js';

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

// Advanced Queue Controls
router.post('/queue/pause', async (req,res) => {
  try {
    const characterId = getCurrentCharacterId(req);
    const status = sceneQueue.pause(characterId);
    res.json({ success: true, status });
  } catch (e) {
    res.status(500).json({ success: false, error: e && e.message });
  }
});

router.post('/queue/resume', async (req,res) => {
  try {
    const characterId = getCurrentCharacterId(req);
    const status = sceneQueue.resume(characterId);
    res.json({ success: true, status });
  } catch (e) {
    res.status(500).json({ success: false, error: e && e.message });
  }
});

router.post('/queue/skip', async (req,res) => {
  try {
    const characterId = getCurrentCharacterId(req);
    const status = sceneQueue.skip(characterId);
    res.json({ success: true, status });
  } catch (e) {
    res.status(500).json({ success: false, error: e && e.message });
  }
});

router.post('/queue/insert', express.json(), async (req,res) => {
  try {
    const characterId = getCurrentCharacterId(req);
    const sceneId = parseInt(req.body && req.body.sceneId, 10);
    if (!sceneId) return res.status(400).json({ success: false, error: 'sceneId required' });
    const status = await sceneQueue.insertPriority(characterId, sceneId);
    res.json({ success: true, status });
  } catch (e) {
    res.status(500).json({ success: false, error: e && e.message });
  }
});

router.post('/queue/emergency-stop', async (req,res) => {
  try {
    const characterId = getCurrentCharacterId(req);
    const status = sceneQueue.emergencyStop(characterId);
    res.json({ success: true, status });
  } catch (e) {
    res.status(500).json({ success: false, error: e && e.message });
  }
});

router.post('/queue/start-config', express.json(), async (req,res) => {
  try {
    const characterId = getCurrentCharacterId(req);
    const def = queueLibrary.validateQueueDefinition(req.body || {});
    const status = await sceneQueue.startWithConfig(characterId, def);
    res.json({ success: true, status });
  } catch (e) {
    res.status(400).json({ success: false, error: e && e.message });
  }
});

// Queue Library
router.get('/queue/library', async (req,res) => {
  try {
    const characterId = getCurrentCharacterId(req);
    const queues = await queueLibrary.loadQueues(characterId);
    res.json({ success: true, queues });
  } catch (e) {
    res.status(500).json({ success: false, error: e && e.message });
  }
});

router.post('/queue/library', express.json(), async (req,res) => {
  try {
    const characterId = getCurrentCharacterId(req);
    const q = await queueLibrary.createQueue(characterId, req.body || {});
    res.json({ success: true, queue: q });
  } catch (e) {
    res.status(400).json({ success: false, error: e && e.message });
  }
});

router.get('/queue/library/:id', async (req,res) => {
  try {
    const characterId = getCurrentCharacterId(req);
    const q = await queueLibrary.getQueue(characterId, req.params.id);
    if (!q) return res.status(404).json({ success: false, error: 'Queue not found' });
    res.json({ success: true, queue: q });
  } catch (e) {
    res.status(500).json({ success: false, error: e && e.message });
  }
});

router.put('/queue/library/:id', express.json(), async (req,res) => {
  try {
    const characterId = getCurrentCharacterId(req);
    const q = await queueLibrary.updateQueue(characterId, req.params.id, req.body || {});
    res.json({ success: true, queue: q });
  } catch (e) {
    res.status(400).json({ success: false, error: e && e.message });
  }
});

router.delete('/queue/library/:id', async (req,res) => {
  try {
    const characterId = getCurrentCharacterId(req);
    const removed = await queueLibrary.deleteQueue(characterId, req.params.id);
    res.json({ success: true, removed });
  } catch (e) {
    res.status(400).json({ success: false, error: e && e.message });
  }
});

router.post('/queue/library/:id/export', async (req,res) => {
  try {
    const characterId = getCurrentCharacterId(req);
    const json = await queueLibrary.exportQueue(characterId, req.params.id);
    res.setHeader('Content-Type', 'application/json');
    res.send(json);
  } catch (e) {
    res.status(400).json({ success: false, error: e && e.message });
  }
});

router.post('/queue/library/import', express.json(), async (req,res) => {
  try {
    const characterId = getCurrentCharacterId(req);
    const q = await queueLibrary.importQueue(characterId, req.body || {});
    res.json({ success: true, queue: q });
  } catch (e) {
    res.status(400).json({ success: false, error: e && e.message });
  }
});

export default router;
