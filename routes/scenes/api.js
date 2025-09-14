/**
 * Scenes API
 */
import express from 'express';
import scenesService from '../../services/scenes/scenesService.js';
import poseEngine from '../../services/poses/poseEngine.js';

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

function delay(ms){ return new Promise(function(r){ setTimeout(r, ms); }); }

router.post('/:id/play', async (req, res) => {
  try {
    const id = parseInt(req.params.id,10);
    const scenes = await scenesService.loadScenes();
    const scene = scenes.find(s => parseInt(s.id,10) === id);
    if (!scene) return res.status(404).json({ success: false, error: 'Scene not found' });
    const characterId = getCurrentCharacterId(req);

    // Fire-and-wait playback
    for (let i = 0; i < (scene.steps || []).length; i++) {
      const step = scene.steps[i] || {};
      if (step.poseId != null) {
        try {
          await poseEngine.executePose({ characterId, poseId: parseInt(step.poseId,10), options: step.options || {} });
        } catch (e) {
          return res.status(500).json({ success: false, error: 'Pose failed at step ' + (i+1) + ': ' + (e && e.message ? e.message : e) });
        }
      }
      const d = parseInt(step.delayMs,10) || 0;
      if (d > 0) { await delay(d); }
    }
    res.json({ success: true, played: id, steps: (scene.steps||[]).length });
  } catch (e) {
    res.status(500).json({ success: false, error: e && e.message });
  }
});

export default router;

