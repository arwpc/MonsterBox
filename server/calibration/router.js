import express from 'express';
import AbsoluteServoAdapter from './adapters/AbsoluteServoAdapter.js';
import OpenLoopLinearAdapter from './adapters/OpenLoopLinearAdapter.js';
import { clampP, getGlobalSpeedCap, setGlobalSpeedCap } from './planner.js';
import { getCalibrationStore } from './store.js';

const router = express.Router();
const store = getCalibrationStore();
const adapterCache = new Map();
const positionState = new Map();

router.get('/:partId/profile', async (req, res) => {
  try {
    const partId = parseInt(req.params.partId, 10);
    const profile = await store.get(partId);
    if (!profile) return res.status(404).json({ success: false, error: 'Calibration profile not found' });
    res.json({ success: true, profile });
  } catch (err) { console.error(err); res.status(500).json({ success: false, error: 'Failed to get profile', message: String(err) }); }
});

router.get('/:partId/position', async (req, res) => {
  try {
    const partId = parseInt(req.params.partId, 10);
    const state = positionState.get(partId);
    const currentP = (state && state.currentP != null) ? state.currentP : null;
    res.json({ success: true, currentP, lastUpdated: state ? state.lastUpdated : null });
  } catch (err) { console.error(err); res.status(500).json({ success: false, error: 'Failed to get position', message: String(err) }); }
});

router.post('/:partId/profile', express.json(), async (req, res) => {
  try {
    const partId = parseInt(req.params.partId, 10);
    const profile = Object.assign({}, req.body, { partId, version: 1, lastCalibratedAt: new Date().toISOString() });
    await store.upsert(profile);
    adapterCache.delete(partId);
    res.json({ success: true, message: 'Profile saved', profile });
  } catch (err) { console.error(err); res.status(500).json({ success: false, error: 'Failed to save profile', message: String(err) }); }
});

router.post('/:partId/nudge', express.json(), async (req, res) => {
  try {
    const partId = parseInt(req.params.partId, 10);
    const profile = await store.get(partId);
    if (!profile) return res.status(404).json({ success: false, error: 'Profile not found' });
    const adapter = getOrCreateAdapter(partId, profile);

    // Support both old format (dir, scale) and new format (delta, speedPct, durationMs)
    if (req.body.dir && req.body.scale) {
      // Old format: { dir: 'min'|'max', scale: 'fine'|'med'|'coarse' }
      const { dir, scale } = req.body;
      if (!['min', 'max'].includes(dir) || !['fine', 'med', 'coarse'].includes(scale)) {
        console.error(`Invalid nudge request for part ${partId}:`, { dir, scale, body: req.body });
        return res.status(400).json({ success: false, error: 'Invalid dir or scale' });
      }
      await adapter.nudge(dir, scale);
      const currentP = adapter.currentP !== undefined ? adapter.currentP : 0.5;
      positionState.set(partId, { currentP, lastUpdated: new Date().toISOString() });
      res.json({ success: true, message: `Nudged ${dir} at ${scale}`, currentP });
    } else if (req.body.delta !== undefined) {
      // New format: { delta: number, speedPct?: number, durationMs?: number }
      const { delta, speedPct, durationMs } = req.body;
      if (typeof delta !== 'number') {
        console.error(`Invalid nudge delta for part ${partId}:`, { delta, type: typeof delta, body: req.body });
        return res.status(400).json({ success: false, error: 'Invalid delta - must be a number' });
      }
      const currentP = adapter.currentP !== undefined ? adapter.currentP : 0.5;
      const newP = Math.max(0, Math.min(1, currentP + delta));
      await adapter.gotoNormalized(newP, { speedPct, durationMs });
      positionState.set(partId, { currentP: newP, lastUpdated: new Date().toISOString() });
      res.json({ success: true, message: `Nudged by ${delta}`, currentP: newP });
    } else {
      console.error(`Invalid nudge request for part ${partId} - missing parameters:`, req.body);
      return res.status(400).json({ success: false, error: 'Must provide either (dir, scale) or (delta)' });
    }
  } catch (err) {
    if (String(err).includes('Unsupported capability')) {
      return res.status(400).json({ success: false, error: String(err) });
    }
    console.error(err);
    res.status(500).json({ success: false, error: 'Failed to nudge', message: String(err) });
  }
});

router.post('/:partId/stop', async (req, res) => {
  try {
    const partId = parseInt(req.params.partId, 10);
    const profile = await store.get(partId);
    if (!profile) return res.status(404).json({ success: false, error: 'Profile not found' });
    const adapter = getOrCreateAdapter(partId, profile);
    await adapter.stop();
    res.json({ success: true, message: 'Part stopped' });
  } catch (err) { console.error(err); res.status(500).json({ success: false, error: 'Failed to stop', message: String(err) }); }
});

router.post('/:partId/goto', express.json(), async (req, res) => {
  try {
    const partId = parseInt(req.params.partId, 10);
    const { p, speedPct } = req.body;
    if (typeof p !== 'number' || p < 0 || p > 1) {
      console.error(`Invalid goto request for part ${partId}:`, { p, speedPct, body: req.body });
      return res.status(400).json({ success: false, error: 'Invalid p - must be number between 0 and 1', received: { p, type: typeof p } });
    }
    const profile = await store.get(partId);
    if (!profile) return res.status(404).json({ success: false, error: 'Profile not found' });
    const clampedP = clampP(p, profile.bounds || { minP: 0, maxP: 1 });
    const adapter = getOrCreateAdapter(partId, profile);
    await adapter.gotoNormalized(clampedP, { speedPct });
    positionState.set(partId, { currentP: clampedP, lastUpdated: new Date().toISOString() });
    res.json({ success: true, message: `Moved to ${clampedP}`, targetP: clampedP });
  } catch (err) {
    if (String(err).includes('Unsupported capability')) {
      return res.status(400).json({ success: false, error: String(err) });
    }
    console.error(err);
    res.status(500).json({ success: false, error: 'Failed to move', message: String(err) });
  }
});

router.post('/:partId/set-min', express.json(), async (req, res) => {
  try {
    const partId = parseInt(req.params.partId, 10);
    const profile = await store.get(partId);
    if (!profile) return res.status(404).json({ success: false, error: 'Profile not found' });
    const state = positionState.get(partId);
    const currentP = (state && state.currentP) || 0;
    profile.bounds = Object.assign({}, profile.bounds || { minP: 0, maxP: 1 }, { minP: currentP });
    await store.upsert(profile);
    res.json({ success: true, message: `Min set to ${currentP}`, bounds: profile.bounds });
  } catch (err) { console.error(err); res.status(500).json({ success: false, error: 'Failed to set min', message: String(err) }); }
});

router.post('/:partId/set-max', express.json(), async (req, res) => {
  try {
    const partId = parseInt(req.params.partId, 10);
    const profile = await store.get(partId);
    if (!profile) return res.status(404).json({ success: false, error: 'Profile not found' });
    const state = positionState.get(partId);
    const currentP = (state && state.currentP) || 1;
    profile.bounds = Object.assign({}, profile.bounds || { minP: 0, maxP: 1 }, { maxP: currentP });
    await store.upsert(profile);
    res.json({ success: true, message: `Max set to ${currentP}`, bounds: profile.bounds });
  } catch (err) { console.error(err); res.status(500).json({ success: false, error: 'Failed to set max', message: String(err) }); }
});

router.post('/:partId/learn-openloop', express.json(), async (req, res) => {
  try {
    const partId = parseInt(req.params.partId, 10);
    const { probes } = req.body;
    if (!Array.isArray(probes) || probes.length < 2) return res.status(400).json({ success: false, error: 'Need at least 2 probes' });
    const profile = await store.get(partId);
    if (!profile || profile.motion.type !== 'time-at-speed') return res.status(400).json({ success: false, error: 'Part must have time-at-speed motion model' });
    const bins = probes.map(p => ({ pwmPct: p.pwmPct, unitsPerSec: Math.abs((p.toP - p.fromP)) / (p.msRun / 1000) }));
    profile.motion = Object.assign({}, profile.motion, { bins, settleMs: profile.motion.settleMs || 120 });
    await store.upsert(profile);
    res.json({ success: true, message: 'Motion model learned', motion: profile.motion });
  } catch (err) { console.error(err); res.status(500).json({ success: false, error: 'Failed to learn motion', message: String(err) }); }
});

router.get('/:partId/sensors', async (req, res) => {
  try {
    const partId = parseInt(req.params.partId, 10);
    const profile = await store.get(partId);
    if (!profile) return res.status(404).json({ success: false, error: 'Profile not found' });
    const adapter = getOrCreateAdapter(partId, profile);
    const sensors = adapter.readSensors ? await adapter.readSensors() : {};
    res.json({ success: true, sensors });
  } catch (err) { console.error(err); res.status(500).json({ success: false, error: 'Failed to read sensors', message: String(err) }); }
});

router.post('/global-speed-cap', express.json(), (req, res) => {
  try {
    const { speedPct } = req.body;
    if (typeof speedPct !== 'number' || speedPct < 0 || speedPct > 100) return res.status(400).json({ success: false, error: 'speedPct must be 0..100' });
    setGlobalSpeedCap(speedPct);
    res.json({ success: true, message: `Global speed cap set to ${speedPct}%`, speedPct });
  } catch (err) { console.error(err); res.status(500).json({ success: false, error: 'Failed to set speed cap', message: String(err) }); }
});

router.get('/global-speed-cap', (req, res) => { res.json({ success: true, speedPct: getGlobalSpeedCap() }); });

function getOrCreateAdapter(partId, profile) {
  if (adapterCache.has(partId)) return adapterCache.get(partId);
  const cap = profile.capability || { kind: 'absolute-servo' };
  let adapter;
  if (cap.kind === 'absolute-servo') adapter = new AbsoluteServoAdapter(partId, cap.usMin || 500, cap.usMax || 2500, cap.invert || false);
  else if (cap.kind === 'openloop-linear' && profile.motion && profile.motion.type === 'time-at-speed') adapter = new OpenLoopLinearAdapter(partId, profile.motion, cap.invert || false);
  else throw new Error(`Unsupported capability: ${cap.kind}`);
  adapterCache.set(partId, adapter);
  return adapter;
}

// Get all calibration profiles for scene editor
router.get('/profiles', async (req, res) => {
  try {
    const profiles = await store.load();
    res.json(profiles || {});
  } catch (err) {
    console.error('Error loading calibration profiles:', err);
    res.status(500).json({ success: false, error: 'Failed to load calibration profiles', message: String(err) });
  }
});

// Clear calibration profile for a specific part
router.delete('/:partId/profile', async (req, res) => {
  try {
    const partId = parseInt(req.params.partId, 10);
    await store.delete(partId);
    adapterCache.delete(partId);
    positionState.delete(partId);
    res.json({ success: true, message: 'Calibration cleared' });
  } catch (err) {
    console.error('Error clearing calibration profile:', err);
    res.status(500).json({ success: false, error: 'Failed to clear calibration', message: String(err) });
  }
});

// Clear all calibration profiles for current character
router.post('/clear-all', express.json(), async (req, res) => {
  try {
    const { characterId, partIds } = req.body;
    if (!Array.isArray(partIds) || partIds.length === 0) {
      return res.status(400).json({ success: false, error: 'Must provide array of partIds to clear' });
    }

    let cleared = 0;
    for (const partId of partIds) {
      try {
        await store.delete(parseInt(partId, 10));
        adapterCache.delete(parseInt(partId, 10));
        positionState.delete(parseInt(partId, 10));
        cleared++;
      } catch (err) {
        console.warn(`Failed to clear calibration for part ${partId}:`, err);
      }
    }

    res.json({ success: true, message: `Cleared ${cleared} calibration profile(s)`, cleared });
  } catch (err) {
    console.error('Error clearing all calibrations:', err);
    res.status(500).json({ success: false, error: 'Failed to clear calibrations', message: String(err) });
  }
});

export default router;
