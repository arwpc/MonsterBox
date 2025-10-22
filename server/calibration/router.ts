/**
 * Unified Calibration API Router (v1.5)
 * MonsterBox 5.3
 */

import express from 'express';
import { AbsoluteServoAdapter } from './adapters/AbsoluteServoAdapter.js';
import { OpenLoopLinearAdapter } from './adapters/OpenLoopLinearAdapter.js';
import type { CalibrationProfile, MotionModel } from './models.js';
import { clampP, getGlobalSpeedCap, setGlobalSpeedCap } from './planner.js';
import { getCalibrationStore } from './store.js';

const router = express.Router();
const store = getCalibrationStore();

// In-memory adapter cache
const adapterCache = new Map();

// In-memory position state
const positionState = new Map();

/**
 * GET /:partId/profile - Get calibration profile
 */
router.get('/:partId/profile', async (req, res) => {
  try {
    const partId = parseInt(req.params.partId, 10);
    const profile = await store.get(partId);

    if (!profile) {
      return res.status(404).json({ success: false, error: 'Calibration profile not found' });
    }

    res.json({ success: true, profile });
  } catch (err: any) {
    console.error('Error getting profile:', err);
    res.status(500).json({ success: false, error: 'Failed to get profile', message: err.message });
  }
});

/**
 * POST /:partId/profile - Upsert calibration profile
 */
router.post('/:partId/profile', express.json(), async (req, res) => {
  try {
    const partId = parseInt(req.params.partId, 10);
    const profile: CalibrationProfile = {
      ...req.body,
      partId,
      version: 1,
      lastCalibratedAt: new Date().toISOString()
    };

    await store.upsert(profile);

    // Clear adapter cache for this part
    adapterCache.delete(partId);

    res.json({ success: true, message: 'Profile saved', profile });
  } catch (err: any) {
    console.error('Error saving profile:', err);
    res.status(500).json({ success: false, error: 'Failed to save profile', message: err.message });
  }
});

/**
 * POST /:partId/nudge - Nudge part in direction
 */
router.post('/:partId/nudge', express.json(), async (req, res) => {
  try {
    const partId = parseInt(req.params.partId, 10);
    const { dir, scale } = req.body;

    if (!['min', 'max'].includes(dir) || !['fine', 'med', 'coarse'].includes(scale)) {
      return res.status(400).json({ success: false, error: 'Invalid dir or scale' });
    }

    const profile = await store.get(partId);
    if (!profile) {
      return res.status(404).json({ success: false, error: 'Profile not found' });
    }

    const adapter = getOrCreateAdapter(partId, profile);
    await adapter.nudge(dir, scale);

    res.json({ success: true, message: `Nudged ${dir} at ${scale} scale` });
  } catch (err: any) {
    console.error('Error nudging:', err);
    res.status(500).json({ success: false, error: 'Failed to nudge', message: err.message });
  }
});

/**
 * POST /:partId/stop - Emergency stop
 */
router.post('/:partId/stop', express.json(), async (req, res) => {
  try {
    const partId = parseInt(req.params.partId, 10);
    const profile = await store.get(partId);

    if (!profile) {
      return res.status(404).json({ success: false, error: 'Profile not found' });
    }

    const adapter = getOrCreateAdapter(partId, profile);
    await adapter.stop();

    res.json({ success: true, message: 'Part stopped' });
  } catch (err: any) {
    console.error('Error stopping:', err);
    res.status(500).json({ success: false, error: 'Failed to stop', message: err.message });
  }
});

/**
 * POST /:partId/goto - Move to normalized position
 */
router.post('/:partId/goto', express.json(), async (req, res) => {
  try {
    const partId = parseInt(req.params.partId, 10);
    const { p, speedPct } = req.body;

    if (typeof p !== 'number' || p < 0 || p > 1) {
      return res.status(400).json({ success: false, error: 'Invalid p (must be 0..1)' });
    }

    const profile = await store.get(partId);
    if (!profile) {
      return res.status(404).json({ success: false, error: 'Profile not found' });
    }

    const clampedP = clampP(p, profile.bounds);
    const adapter = getOrCreateAdapter(partId, profile);

    await adapter.gotoNormalized(clampedP, { speedPct });

    // Update position state
    positionState.set(partId, { currentP: clampedP, lastUpdated: new Date().toISOString() });

    res.json({ success: true, message: `Moved to ${clampedP.toFixed(3)}`, targetP: clampedP });
  } catch (err: any) {
    console.error('Error going to position:', err);
    res.status(500).json({ success: false, error: 'Failed to move', message: err.message });
  }
});

/**
 * POST /:partId/set-min - Set current position as min bound
 */
router.post('/:partId/set-min', express.json(), async (req, res) => {
  try {
    const partId = parseInt(req.params.partId, 10);
    const profile = await store.get(partId);

    if (!profile) {
      return res.status(404).json({ success: false, error: 'Profile not found' });
    }

    const state = positionState.get(partId);
    const currentP = state?.currentP || 0;

    profile.bounds.minP = currentP;
    await store.upsert(profile);

    res.json({ success: true, message: `Min set to ${currentP.toFixed(3)}`, bounds: profile.bounds });
  } catch (err: any) {
    console.error('Error setting min:', err);
    res.status(500).json({ success: false, error: 'Failed to set min', message: err.message });
  }
});

/**
 * POST /:partId/set-max - Set current position as max bound
 */
router.post('/:partId/set-max', express.json(), async (req, res) => {
  try {
    const partId = parseInt(req.params.partId, 10);
    const profile = await store.get(partId);

    if (!profile) {
      return res.status(404).json({ success: false, error: 'Profile not found' });
    }

    const state = positionState.get(partId);
    const currentP = state?.currentP || 1;

    profile.bounds.maxP = currentP;
    await store.upsert(profile);

    res.json({ success: true, message: `Max set to ${currentP.toFixed(3)}`, bounds: profile.bounds });
  } catch (err: any) {
    console.error('Error setting max:', err);
    res.status(500).json({ success: false, error: 'Failed to set max', message: err.message });
  }
});

/**
 * POST /:partId/learn-openloop - Learn motion bins for open-loop parts
 */
router.post('/:partId/learn-openloop', express.json(), async (req, res) => {
  try {
    const partId = parseInt(req.params.partId, 10);
    const { probes } = req.body;

    if (!Array.isArray(probes) || probes.length < 2) {
      return res.status(400).json({ success: false, error: 'Need at least 2 probes' });
    }

    const profile = await store.get(partId);
    if (!profile || profile.motion.type !== 'time-at-speed') {
      return res.status(400).json({ success: false, error: 'Part must have time-at-speed motion model' });
    }

    // Fit bins from probes
    const bins = probes.map((probe: any) => ({
      pwmPct: probe.pwmPct,
      unitsPerSec: probe.measuredDeltaP / (probe.msRun / 1000)
    }));

    const motion: Extract<MotionModel, { type: 'time-at-speed' }> = {
      type: 'time-at-speed',
      bins,
      settleMs: profile.motion.settleMs || 120
    };

    profile.motion = motion;
    await store.upsert(profile);

    res.json({ success: true, message: 'Motion model learned', motion });
  } catch (err: any) {
    console.error('Error learning motion:', err);
    res.status(500).json({ success: false, error: 'Failed to learn motion', message: err.message });
  }
});

/**
 * GET /:partId/sensors - Read sensor feedback
 */
router.get('/:partId/sensors', async (req, res) => {
  try {
    const partId = parseInt(req.params.partId, 10);
    const profile = await store.get(partId);

    if (!profile) {
      return res.status(404).json({ success: false, error: 'Profile not found' });
    }

    const adapter = getOrCreateAdapter(partId, profile);
    const sensors = adapter.readSensors ? await adapter.readSensors() : {};

    res.json({ success: true, sensors });
  } catch (err: any) {
    console.error('Error reading sensors:', err);
    res.status(500).json({ success: false, error: 'Failed to read sensors', message: err.message });
  }
});

/**
 * POST /global-speed-cap - Set global speed limit
 */
router.post('/global-speed-cap', express.json(), async (req, res) => {
  try {
    const { speedPct } = req.body;

    if (typeof speedPct !== 'number' || speedPct < 0 || speedPct > 100) {
      return res.status(400).json({ success: false, error: 'speedPct must be 0..100' });
    }

    setGlobalSpeedCap(speedPct);
    res.json({ success: true, message: `Global speed cap set to ${speedPct}%`, speedPct });
  } catch (err: any) {
    console.error('Error setting speed cap:', err);
    res.status(500).json({ success: false, error: 'Failed to set speed cap', message: err.message });
  }
});

/**
 * GET /global-speed-cap - Get current global speed limit
 */
router.get('/global-speed-cap', (req, res) => {
  const speedPct = getGlobalSpeedCap();
  res.json({ success: true, speedPct });
});

/**
 * Helper: Get or create adapter for a part
 */
function getOrCreateAdapter(partId: number, profile: CalibrationProfile): any {
  if (adapterCache.has(partId)) {
    return adapterCache.get(partId);
  }

  let adapter;
  const cap = profile.capability;

  if (cap.kind === 'absolute-servo') {
    adapter = new AbsoluteServoAdapter(
      partId,
      cap.usMin || 500,
      cap.usMax || 2500,
      cap.invert || false
    );
  } else if (cap.kind === 'openloop-linear' && profile.motion.type === 'time-at-speed') {
    adapter = new OpenLoopLinearAdapter(
      partId,
      profile.motion,
      cap.invert || false
    );
  } else {
    throw new Error(`Unsupported capability: ${cap.kind}`);
  }

  adapterCache.set(partId, adapter);
  return adapter;
}

export default router;
