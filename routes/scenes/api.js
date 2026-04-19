/**
 * Scenes API
 */
import express from 'express';
import queueLibrary from '../../services/scenes/queueLibrary.js';
import queueTemplates from '../../services/scenes/queueTemplates.js';
import sceneAnalytics from '../../services/scenes/sceneAnalyticsService.js';
import sceneExecutor from '../../services/scenes/sceneExecutor.js';
import sceneQueue from '../../services/scenes/sceneQueue.js';
import scenesService from '../../services/scenes/scenesService.js';
import armedModeRoutes from './armed-mode.js';
import { resolveCharacterSync } from '../../services/characterContext.js';

const router = express.Router();

function getCurrentCharacterId(req) {
  const ctx = resolveCharacterSync(req);
  return ctx ? ctx.id : null;
}

async function respondWithScenes(req, res) {
  try {
    const scenes = await scenesService.loadScenes();
    res.json({ success: true, scenes });
  } catch (e) {
    res.status(500).json({ success: false, error: e && e.message });
  }
}

router.get('/', respondWithScenes);
router.get('/scenes', respondWithScenes);

// === Queue Endpoints (MUST BE BEFORE /:id routes) ===
async function respondWithQueueStatus(req, res) {
  try {
    const characterId = getCurrentCharacterId(req);
    const status = sceneQueue.getStatus(characterId);
    res.json({ success: true, status });
  } catch (e) {
    res.status(500).json({ success: false, error: e && e.message });
  }
}

router.get('/queue', respondWithQueueStatus);
router.get('/queue/status', respondWithQueueStatus);

router.post('/queue/enqueue', express.json(), async (req, res) => {
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

router.post('/queue/start', async (req, res) => {
  try {
    const characterId = getCurrentCharacterId(req);
    const status = await sceneQueue.start(characterId);
    res.json({ success: true, status });
  } catch (e) {
    res.status(500).json({ success: false, error: e && e.message });
  }
});

router.post('/queue/stop', async (req, res) => {
  try {
    const characterId = getCurrentCharacterId(req);
    const status = sceneQueue.stop(characterId);
    res.json({ success: true, status });
  } catch (e) {
    res.status(500).json({ success: false, error: e && e.message });
  }
});

router.post('/queue/clear', async (req, res) => {
  try {
    const characterId = getCurrentCharacterId(req);
    const status = sceneQueue.clear(characterId);
    res.json({ success: true, status });
  } catch (e) {
    res.status(500).json({ success: false, error: e && e.message });
  }
});

router.post('/queue/reorder', express.json(), async (req, res) => {
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

router.post('/queue/pause', async (req, res) => {
  try {
    const characterId = getCurrentCharacterId(req);
    const status = sceneQueue.pause(characterId);
    res.json({ success: true, status });
  } catch (e) {
    res.status(500).json({ success: false, error: e && e.message });
  }
});

router.post('/queue/resume', async (req, res) => {
  try {
    const characterId = getCurrentCharacterId(req);
    const status = sceneQueue.resume(characterId);
    res.json({ success: true, status });
  } catch (e) {
    res.status(500).json({ success: false, error: e && e.message });
  }
});

router.post('/queue/skip', async (req, res) => {
  try {
    const characterId = getCurrentCharacterId(req);
    const status = sceneQueue.skip(characterId);
    res.json({ success: true, status });
  } catch (e) {
    res.status(500).json({ success: false, error: e && e.message });
  }
});

router.post('/queue/insert', express.json(), async (req, res) => {
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

router.post('/queue/emergency-stop', async (req, res) => {
  try {
    const characterId = getCurrentCharacterId(req);
    const status = sceneQueue.emergencyStop(characterId);
    res.json({ success: true, status });
  } catch (e) {
    res.status(500).json({ success: false, error: e && e.message });
  }
});

router.post('/queue/start-config', express.json(), async (req, res) => {
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
router.get('/queue/library', async (req, res) => {
  try {
    const characterId = getCurrentCharacterId(req);
    const queues = await queueLibrary.loadQueues(characterId);
    res.json({ success: true, queues });
  } catch (e) {
    res.status(500).json({ success: false, error: e && e.message });
  }
});

router.post('/queue/library', express.json(), async (req, res) => {
  try {
    const characterId = getCurrentCharacterId(req);
    const q = await queueLibrary.createQueue(characterId, req.body || {});
    res.json({ success: true, queue: q });
  } catch (e) {
    res.status(400).json({ success: false, error: e && e.message });
  }
});

router.get('/queue/library/:id', async (req, res) => {
  try {
    const characterId = getCurrentCharacterId(req);
    const q = await queueLibrary.getQueue(characterId, req.params.id);
    if (!q) return res.status(404).json({ success: false, error: 'Queue not found' });
    res.json({ success: true, queue: q });
  } catch (e) {
    res.status(500).json({ success: false, error: e && e.message });
  }
});

router.put('/queue/library/:id', express.json(), async (req, res) => {
  try {
    const characterId = getCurrentCharacterId(req);
    const q = await queueLibrary.updateQueue(characterId, req.params.id, req.body || {});
    res.json({ success: true, queue: q });
  } catch (e) {
    res.status(400).json({ success: false, error: e && e.message });
  }
});

router.delete('/queue/library/:id', async (req, res) => {
  try {
    const characterId = getCurrentCharacterId(req);
    const removed = await queueLibrary.deleteQueue(characterId, req.params.id);
    res.json({ success: true, removed });
  } catch (e) {
    res.status(400).json({ success: false, error: e && e.message });
  }
});

router.post('/queue/library/:id/export', async (req, res) => {
  try {
    const characterId = getCurrentCharacterId(req);
    const json = await queueLibrary.exportQueue(characterId, req.params.id);
    res.setHeader('Content-Type', 'application/json');
    res.send(json);
  } catch (e) {
    res.status(400).json({ success: false, error: e && e.message });
  }
});

router.post('/queue/library/import', express.json(), async (req, res) => {
  try {
    const characterId = getCurrentCharacterId(req);
    const q = await queueLibrary.importQueue(characterId, req.body || {});
    res.json({ success: true, queue: q });
  } catch (e) {
    res.status(400).json({ success: false, error: e && e.message });
  }
});

// Queue Templates
router.get('/queue/templates', async (req, res) => {
  try {
    const characterId = getCurrentCharacterId(req);
    const templates = await queueTemplates.loadTemplates(characterId);
    res.json({ success: true, templates });
  } catch (e) {
    res.status(500).json({ success: false, error: e && e.message });
  }
});

router.post('/queue/templates/save', express.json(), async (req, res) => {
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

router.post('/queue/templates/enqueue', express.json(), async (req, res) => {
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

// === Scene Library Reorder (persist order in scenes.json) ===
router.post('/reorder', express.json(), async (req, res) => {
  try {
    const orderedIds = req.body && req.body.orderedIds;
    if (!Array.isArray(orderedIds)) return res.status(400).json({ success: false, error: 'orderedIds array required' });
    const scenes = await scenesService.loadScenes();
    const byId = {};
    scenes.forEach(s => { byId[parseInt(s.id, 10)] = s; });
    const reordered = [];
    orderedIds.forEach(id => {
      const scene = byId[parseInt(id, 10)];
      if (scene) { reordered.push(scene); delete byId[parseInt(id, 10)]; }
    });
    // Append any scenes not in orderedIds (safety)
    Object.values(byId).forEach(s => reordered.push(s));
    await scenesService.saveScenes(reordered);
    res.json({ success: true });
  } catch (e) {
    res.status(500).json({ success: false, error: e && e.message });
  }
});

// === Standard Scene CRUD (after queue routes) ===
router.get('/:id', async (req, res) => {
  try {
    const id = parseInt(req.params.id, 10);
    const scenes = await scenesService.loadScenes();
    const scene = scenes.find(s => parseInt(s.id, 10) === id);
    if (!scene) return res.status(404).json({ success: false, error: 'Scene not found' });
    res.json({ success: true, scene });
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
    const id = parseInt(req.params.id, 10);
    const body = req.body || {};
    const scenes = await scenesService.loadScenes();
    const idx = scenes.findIndex(s => parseInt(s.id, 10) === id);
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
    const id = parseInt(req.params.id, 10);
    const scenes = await scenesService.loadScenes();
    const idx = scenes.findIndex(s => parseInt(s.id, 10) === id);
    if (idx === -1) return res.status(404).json({ success: false, error: 'Scene not found' });
    const removed = scenes.splice(idx, 1)[0];
    await scenesService.saveScenes(scenes);
    res.json({ success: true, removed });
  } catch (e) {
    res.status(500).json({ success: false, error: e && e.message });
  }
});

// Test a single step
router.post('/test-step', express.json(), async (req, res) => {
  try {
    const step = req.body;
    if (!step || !step.type) {
      return res.status(400).json({ success: false, error: 'Step object with type is required' });
    }

    const characterId = getCurrentCharacterId(req);
    const dryRun = (String(req.query?.dryRun || '').toLowerCase() === '1' || String(req.query?.dryRun || '').toLowerCase() === 'true');

    // Execute the single step
    const result = await sceneExecutor.executeStep(step, characterId, null, { dryRun });

    res.json({ success: true, result, dryRun });
  } catch (e) {
    res.status(500).json({ success: false, error: e && e.message });
  }
});

// Play a scene and return when complete
router.post('/:id/play', async (req, res) => {
  try {
    const id = parseInt(req.params.id, 10);
    const scenes = await scenesService.loadScenes();
    const scene = scenes.find(s => parseInt(s.id, 10) === id);
    if (!scene) return res.status(404).json({ success: false, error: 'Scene not found' });
    const characterId = getCurrentCharacterId(req);

    // In test mode, run with dryRun to avoid hardware but still log analytics
    const inTest = (process.env.MB_TEST_MODE === '1' || process.env.MB_TEST_MODE === 'true');
    const dryRun = inTest || (String(req.query?.dryRun || '').toLowerCase() === '1' || String(req.query?.dryRun || '').toLowerCase() === 'true');
    const result = await sceneExecutor.executeScene(scene, characterId, null, { dryRun });
    res.json({ success: true, played: id, steps: (scene.steps || []).length, result, dryRun });
  } catch (e) {
    const msg = (e && e.message) ? e.message : String(e);
    const inTest = (process.env.MB_TEST_MODE === '1' || process.env.MB_TEST_MODE === 'true');
    // Avoid 5xx for missing pose/data cases or under test mode; surface as success:false 200
    if (inTest || (/pose/i.test(msg) && /not found/i.test(msg))) {
      return res.json({ success: false, error: msg, dryRun: !!inTest });
    }
    return res.status(500).json({ success: false, error: msg });
  }
});

// Stream live progress with Server-Sent Events (SSE)
router.get('/:id/play-stream', async (req, res) => {
  try {
    const id = parseInt(req.params.id, 10);
    const scenes = await scenesService.loadScenes();
    const scene = scenes.find(s => parseInt(s.id, 10) === id);
    if (!scene) return res.status(404).json({ success: false, error: 'Scene not found' });
    const characterId = getCurrentCharacterId(req);

    res.setHeader('Content-Type', 'text/event-stream');
    res.setHeader('Cache-Control', 'no-cache');
    res.setHeader('Connection', 'keep-alive');
    res.flushHeaders && res.flushHeaders();

    const emit = (ev) => {
      try { res.write(`data: ${JSON.stringify(ev)}\n\n`); } catch (_) { }
    };

    emit({ type: 'sse', status: 'open' });

    const dryRun = (String(req.query?.dryRun || '').toLowerCase() === '1' || String(req.query?.dryRun || '').toLowerCase() === 'true');
    sceneExecutor.executeScene(scene, characterId, emit, { dryRun })
      .then((result) => {
        emit({ type: 'scene', status: 'done', success: true, result, dryRun });
        try { res.end(); } catch (_) { }
      })
      .catch((err) => {
        emit({ type: 'scene', status: 'done', success: false, error: err && err.message, dryRun });
        try { res.end(); } catch (_) { }
      });
  } catch (e) {
    res.status(500).json({ success: false, error: e && e.message });
  }
});

// --- Scene Templates ---
router.get('/templates', async (req, res) => {
  try {
    const templates = await scenesService.loadTemplates();
    res.json({ success: true, templates });
  } catch (e) {
    res.status(500).json({ success: false, error: e && e.message });
  }
});

router.post('/from-template', express.json(), async (req, res) => {
  try {
    const templateId = req.body && req.body.templateId;
    const name = req.body && req.body.name;
    if (!templateId) return res.status(400).json({ success: false, error: 'templateId required' });

    const templates = await scenesService.loadTemplates();
    const template = templates.find(t => t.id === templateId);
    if (!template) return res.status(404).json({ success: false, error: 'Template not found' });

    const scenes = await scenesService.loadScenes();
    const id = await scenesService.nextSceneId();
    const scene = {
      id,
      name: name || template.name,
      description: template.description || '',
      steps: JSON.parse(JSON.stringify(template.steps || [])), // Deep copy
      created: new Date().toISOString(),
      fromTemplate: templateId
    };
    scenes.push(scene);
    await scenesService.saveScenes(scenes);
    res.json({ success: true, scene });
  } catch (e) {
    res.status(500).json({ success: false, error: e && e.message });
  }
});

// --- Scene Duplication ---
router.post('/:id/duplicate', express.json(), async (req, res) => {
  try {
    const id = parseInt(req.params.id, 10);
    const newName = req.body && req.body.name;

    const scenes = await scenesService.loadScenes();
    const source = scenes.find(s => parseInt(s.id, 10) === id);
    if (!source) return res.status(404).json({ success: false, error: 'Scene not found' });

    const newId = await scenesService.nextSceneId();
    const duplicate = {
      id: newId,
      name: newName || `${source.name} (Copy)`,
      description: source.description || '',
      steps: JSON.parse(JSON.stringify(source.steps || [])), // Deep copy
      created: new Date().toISOString(),
      duplicatedFrom: id
    };
    scenes.push(duplicate);
    await scenesService.saveScenes(scenes);
    res.json({ success: true, scene: duplicate });
  } catch (e) {
    res.status(500).json({ success: false, error: e && e.message });
  }
});

// --- Scene Import/Export ---
router.get('/export', async (req, res) => {
  try {
    const scenes = await scenesService.loadScenes();
    const exportData = {
      version: '5.0',
      exported: new Date().toISOString(),
      scenes: scenes
    };

    const filename = `scenes_export_${new Date().toISOString().split('T')[0]}.json`;
    res.setHeader('Content-Type', 'application/json');
    res.setHeader('Content-Disposition', `attachment; filename="${filename}"`);
    res.json(exportData);
  } catch (e) {
    res.status(500).json({ success: false, error: e && e.message });
  }
});

router.post('/import', express.json(), async (req, res) => {
  try {
    const importData = req.body || {};
    const overwrite = req.body.overwrite === true || req.body.overwrite === 'true';

    if (!importData.scenes || !Array.isArray(importData.scenes)) {
      return res.status(400).json({ success: false, error: 'Invalid import data: scenes array required' });
    }

    const scenes = await scenesService.loadScenes();
    let imported = 0;
    let updated = 0;
    let skipped = 0;

    for (const importScene of importData.scenes) {
      const existingIdx = scenes.findIndex(s => parseInt(s.id, 10) === parseInt(importScene.id, 10));

      if (existingIdx !== -1) {
        if (overwrite) {
          scenes[existingIdx] = { ...importScene, updated: new Date().toISOString() };
          updated++;
        } else {
          skipped++;
        }
      } else {
        scenes.push({ ...importScene, imported: new Date().toISOString() });
        imported++;
      }
    }

    await scenesService.saveScenes(scenes);
    res.json({ success: true, imported, updated, skipped, total: importData.scenes.length });
  } catch (e) {
    res.status(500).json({ success: false, error: e && e.message });
  }
});

// --- Scene Analytics ---
router.get('/analytics', async (req, res) => {
  try {
    const sceneId = req.query.sceneId ? parseInt(req.query.sceneId, 10) : null;
    const characterId = req.query.characterId ? parseInt(req.query.characterId, 10) : null;
    const analytics = await sceneAnalytics.getSceneAnalytics(sceneId, characterId);
    res.json({ success: true, analytics });
  } catch (e) {
    res.status(500).json({ success: false, error: e && e.message });
  }
});

router.get('/analytics/popular', async (req, res) => {
  try {
    const characterId = req.query.characterId ? parseInt(req.query.characterId, 10) : null;
    const limit = req.query.limit ? parseInt(req.query.limit, 10) : 10;
    const popular = await sceneAnalytics.getPopularScenes(characterId, limit);
    res.json({ success: true, popular });
  } catch (e) {
    res.status(500).json({ success: false, error: e && e.message });
  }
});

router.get('/analytics/:sceneId', async (req, res) => {
  try {
    const sceneId = parseInt(req.params.sceneId, 10);
    const characterId = req.query.characterId ? parseInt(req.query.characterId, 10) : getCurrentCharacterId(req);
    const metrics = await sceneAnalytics.getScenePerformanceMetrics(sceneId, characterId);
    if (!metrics) {
      return res.status(404).json({ success: false, error: 'No analytics data found for this scene' });
    }
    res.json({ success: true, metrics });
  } catch (e) {
    res.status(500).json({ success: false, error: e && e.message });
  }
});

// Mount armed mode routes
router.use('/armed-mode', armedModeRoutes);

export default router;
