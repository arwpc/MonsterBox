import express from 'express';
import AbsoluteServoAdapter from './adapters/AbsoluteServoAdapter.js';
import OpenLoopLinearAdapter from './adapters/OpenLoopLinearAdapter.js';
import ContinuousServoAdapter from './adapters/ContinuousServoAdapter.js';
import { clampP, getGlobalSpeedCap, setGlobalSpeedCap } from './planner.js';
import { getCalibrationStore } from './store.js';
import { loadParts } from '../../controllers/partsController.js';
import actuatorPositionStore from '../../services/actuatorPositionStore.js';
import hardwareService from '../../services/hardwareService/index.js';

const router = express.Router();
const store = getCalibrationStore();
const adapterCache = new Map();
const positionState = new Map();

// On module load: recover persisted positions and detect crash state
try {
  actuatorPositionStore.recoverFromCrash();
  const persisted = actuatorPositionStore.loadAll();
  for (const [partId, state] of Object.entries(persisted)) {
    if (state.currentP != null) {
      positionState.set(parseInt(partId, 10), {
        currentP: state.currentP,
        positionKnown: state.positionKnown !== false,
        confidence: state.confidence || 'tracked',
        lastUpdated: state.lastUpdatedAt || new Date().toISOString()
      });
    }
  }
} catch (e) {
  console.warn('[Calibration] Failed to recover persisted positions:', e.message);
}

/** Check if a profile represents an absolute servo */
function isAbsoluteServo(profile) {
  return profile && profile.capability && profile.capability.kind === 'absolute-servo';
}

/** Check if a profile is an open-loop type (linear actuator or continuous servo) */
function isOpenLoop(profile) {
  if (!profile || !profile.capability) return false;
  return profile.capability.kind === 'openloop-linear' || profile.capability.kind === 'continuous-servo';
}

/** Convert between angle and normalized p */
function angleToP(angle) { return Math.max(0, Math.min(1, angle / 180)); }
function pToAngle(p) { return Math.round(Math.max(0, Math.min(1, p)) * 180 * 10) / 10; }

/** Persist position for open-loop parts to disk */
function persistPosition(partId, currentP, extra = {}) {
  const key = parseInt(partId, 10);
  const state = {
    currentP,
    positionKnown: extra.positionKnown !== false,
    confidence: extra.confidence || 'tracked',
    lastUpdated: new Date().toISOString(),
    ...extra
  };
  positionState.set(key, state);
  // Persist to disk for open-loop parts
  actuatorPositionStore.markStopped(key, currentP);
}

// Auto-create a default calibration profile based on part type.
// Also reconciles channel/address with parts.json on every load — parts.json
// is the source of truth, and stale cap.channel from a prior auto-create
// would cause continuous-servo commands to drive the wrong PCA channel.
async function getOrAutoCreateProfile(partId) {
  let profile = await store.get(partId);

  if (profile) {
    // Reconcile cached channel/address against current parts.json (continuous-servo only —
    // absolute-servo doesn't store channel in cap, openloop-linear has no channel concept).
    if (profile.capability && profile.capability.kind === 'continuous-servo') {
      try {
        const parts = await loadParts();
        const part = parts.find(p => String(p.id) === String(partId));
        if (part && part.config) {
          const partChannel = part.config.channel != null ? part.config.channel : 0;
          const partAddress = part.config.address != null ? part.config.address : 64;
          if (profile.capability.channel !== partChannel || profile.capability.address !== partAddress) {
            console.log(`🔄 Calibration profile for part ${partId} stale: ch ${profile.capability.channel}→${partChannel}, addr ${profile.capability.address}→${partAddress}. Syncing from parts.json.`);
            profile.capability.channel = partChannel;
            profile.capability.address = partAddress;
            adapterCache.delete(partId); // force adapter rebuild with new channel
            await store.upsert(profile);
          }
        }
      } catch (_) { /* fall through with existing profile */ }
    }
    return profile;
  }

  // Look up part data to determine capability
  try {
    const parts = await loadParts();
    const part = parts.find(p => String(p.id) === String(partId));
    if (!part) return null;

    let capability, motion, bounds;
    if (part.type === 'linear_actuator') {
      capability = { kind: 'openloop-linear' };
      motion = { type: 'time-at-speed', bins: [{ pwmPct: 50, unitsPerSec: 0.2 }, { pwmPct: 90, unitsPerSec: 0.4 }], settleMs: 150 };
      bounds = null;
    } else if (part.type === 'servo') {
      const servoType = part.config && part.config.servoType;
      if (servoType === 'continuous') {
        capability = { kind: 'continuous-servo', channel: part.config.channel || 0, address: part.config.address || 64 };
        motion = { type: 'time-at-speed', bins: [{ pwmPct: 50, unitsPerSec: 0.3 }], settleMs: 100 };
        bounds = null;
      } else {
        capability = { kind: 'absolute-servo', usMin: 500, usMax: 2500 };
        motion = {};
        bounds = { minAngle: 0, maxAngle: 180 };
      }
    } else {
      capability = { kind: part.type };
      motion = {};
      bounds = {};
    }

    profile = {
      partId,
      capability,
      bounds,
      presets: [],
      motion,
      version: 1,
      autoGenerated: true,
      lastCalibratedAt: new Date().toISOString()
    };
    await store.upsert(profile);
    console.log(`✅ Auto-created calibration profile for part ${partId} (${part.name}, ${part.type})`);
    return profile;
  } catch (err) {
    console.error(`Failed to auto-create calibration profile for part ${partId}:`, err);
    return null;
  }
}

router.get('/:partId/profile', async (req, res) => {
  try {
    const partId = parseInt(req.params.partId, 10);
    const profile = await getOrAutoCreateProfile(partId);
    if (!profile) return res.status(404).json({ success: false, error: 'Calibration profile not found' });
    res.json({ success: true, profile });
  } catch (err) { console.error(err); res.status(500).json({ success: false, error: 'Failed to get profile', message: String(err) }); }
});

router.get('/:partId/position', async (req, res) => {
  try {
    const partId = parseInt(req.params.partId, 10);
    const state = positionState.get(partId);
    const profile = await getOrAutoCreateProfile(partId);

    if (isAbsoluteServo(profile)) {
      const currentAngle = (state && state.currentAngle != null) ? state.currentAngle : null;
      const currentP = currentAngle != null ? angleToP(currentAngle) : null;
      res.json({ success: true, currentAngle, currentP, kind: 'absolute-servo', lastUpdated: state ? state.lastUpdated : null });
    } else {
      const currentP = (state && state.currentP != null) ? state.currentP : null;
      const positionKnown = state ? (state.positionKnown !== false) : false;
      const confidence = state ? (state.confidence || 'unknown') : 'unknown';
      res.json({ success: true, currentP, positionKnown, confidence, lastUpdated: state ? state.lastUpdated : null });
    }
  } catch (err) { console.error(err); res.status(500).json({ success: false, error: 'Failed to get position', message: String(err) }); }
});

router.post('/:partId/profile', express.json(), async (req, res) => {
  try {
    const partId = parseInt(req.params.partId, 10);
    const profile = Object.assign({}, req.body, { partId, version: 1, lastCalibratedAt: new Date().toISOString() });
    await store.upsert(profile);
    // Flush adapter but preserve position state
    adapterCache.delete(partId);
    res.json({ success: true, message: 'Profile saved', profile });
  } catch (err) { console.error(err); res.status(500).json({ success: false, error: 'Failed to save profile', message: String(err) }); }
});

router.post('/:partId/nudge', express.json(), async (req, res) => {
  try {
    const partId = parseInt(req.params.partId, 10);
    const profile = await getOrAutoCreateProfile(partId);
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

      if (isAbsoluteServo(profile)) {
        const currentAngle = adapter.currentAngle !== undefined ? adapter.currentAngle : 90;
        positionState.set(partId, { currentAngle, currentP: angleToP(currentAngle), lastUpdated: new Date().toISOString() });
        res.json({ success: true, message: `Nudged ${dir} at ${scale}`, currentAngle, currentP: angleToP(currentAngle) });
      } else {
        const currentP = adapter.currentP !== undefined ? adapter.currentP : 0.5;
        persistPosition(partId, currentP);
        res.json({ success: true, message: `Nudged ${dir} at ${scale}`, currentP });
      }
    } else if (req.body.delta !== undefined) {
      // New format: { delta: number, speedPct?: number, durationMs?: number }
      const { delta, speedPct, durationMs } = req.body;
      if (typeof delta !== 'number') {
        console.error(`Invalid nudge delta for part ${partId}:`, { delta, type: typeof delta, body: req.body });
        return res.status(400).json({ success: false, error: 'Invalid delta - must be a number' });
      }

      if (isAbsoluteServo(profile)) {
        const currentAngle = adapter.currentAngle !== undefined ? adapter.currentAngle : 90;
        const newAngle = Math.max(0, Math.min(180, currentAngle + delta));
        await adapter.gotoAngle(newAngle, { speedPct, durationMs });
        positionState.set(partId, { currentAngle: newAngle, currentP: angleToP(newAngle), lastUpdated: new Date().toISOString() });
        res.json({ success: true, message: `Nudged by ${delta}°`, currentAngle: newAngle, currentP: angleToP(newAngle) });
      } else {
        const currentP = adapter.currentP !== undefined ? adapter.currentP : 0.5;
        // FIX: Apply calibration bounds to nudge (was missing before)
        const bounds = (profile.bounds && profile.bounds.minP != null && profile.bounds.maxP != null) ? profile.bounds : null;
        const rawP = currentP + delta;
        const newP = clampP(rawP, bounds);
        await adapter.gotoNormalized(newP, { speedPct, durationMs });
        persistPosition(partId, newP);
        res.json({ success: true, message: `Nudged by ${delta}`, currentP: newP });
      }
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
    const profile = await getOrAutoCreateProfile(partId);
    if (!profile) return res.status(404).json({ success: false, error: 'Profile not found' });
    const adapter = getOrCreateAdapter(partId, profile);
    await adapter.stop();
    // Emergency stop mid-move: position is now uncertain for open-loop parts
    if (isOpenLoop(profile)) {
      actuatorPositionStore.markUnknown(partId);
      const state = positionState.get(partId) || {};
      positionState.set(partId, { ...state, positionKnown: false, confidence: 'unknown', lastUpdated: new Date().toISOString() });
    }
    res.json({ success: true, message: 'Part stopped' });
  } catch (err) { console.error(err); res.status(500).json({ success: false, error: 'Failed to stop', message: String(err) }); }
});

// Raw jog — drive the motor directly with NO position limits.
// Used during calibration to find the true physical range of a linear actuator.
// Does NOT update position tracking — caller should use set-min/set-max after.
router.post('/:partId/jog-raw', express.json(), async (req, res) => {
  try {
    const partId = parseInt(req.params.partId, 10);
    const { direction, speedPct, durationMs } = req.body || {};
    if (!['extend', 'retract'].includes(direction)) {
      return res.status(400).json({ success: false, error: 'direction must be "extend" or "retract"' });
    }
    const speed = (typeof speedPct === 'number' && speedPct > 0 && speedPct <= 100) ? speedPct : 50;
    const duration = (typeof durationMs === 'number' && durationMs > 0) ? Math.min(durationMs, 30000) : 1500;
    console.log(`🔓 jog-raw: partId=${partId}, dir=${direction}, speed=${speed}%, duration=${duration}ms (NO LIMITS)`);
    await hardwareService.controlPart(String(partId), 'jog', { direction, speed, duration });
    res.json({ success: true, message: `Raw jog ${direction} for ${duration}ms at ${speed}%` });
  } catch (err) {
    console.error('jog-raw failed:', err);
    res.status(500).json({ success: false, error: 'Raw jog failed', message: String(err) });
  }
});

// Drive to a physical endstop to reset accumulated open-loop drift.
// After homing, the position tracker is reset to the exact endpoint (0 or 1).
router.post('/:partId/home', express.json(), async (req, res) => {
  try {
    const partId = parseInt(req.params.partId, 10);
    const { direction, speedPct } = req.body || {};
    const dir = direction === 'extend' ? 'extend' : 'retract';
    const profile = await getOrAutoCreateProfile(partId);
    if (!profile) return res.status(404).json({ success: false, error: 'Profile not found' });
    const adapter = getOrCreateAdapter(partId, profile);
    if (typeof adapter.home !== 'function') {
      return res.status(400).json({ success: false, error: 'Part type does not support homing' });
    }
    actuatorPositionStore.markMoving(partId, dir);
    await adapter.home(dir, speedPct);
    const currentP = adapter.currentP !== undefined ? adapter.currentP : (dir === 'retract' ? 0 : 1);
    // Homing gives us high-confidence position
    actuatorPositionStore.markHomed(partId, currentP);
    positionState.set(partId, { currentP, positionKnown: true, confidence: 'homed', lastUpdated: new Date().toISOString() });
    res.json({ success: true, message: `Homed to ${dir} endstop`, currentP, positionKnown: true, confidence: 'homed' });
  } catch (err) {
    console.error(err);
    res.status(500).json({ success: false, error: 'Failed to home', message: String(err) });
  }
});

router.post('/:partId/goto', express.json(), async (req, res) => {
  try {
    const partId = parseInt(req.params.partId, 10);
    const profile = await getOrAutoCreateProfile(partId);
    if (!profile) return res.status(404).json({ success: false, error: 'Profile not found' });
    const adapter = getOrCreateAdapter(partId, profile);

    if (isAbsoluteServo(profile) && req.body.angle !== undefined) {
      const { angle, speedPct } = req.body;
      if (typeof angle !== 'number' || angle < 0 || angle > 180) {
        return res.status(400).json({ success: false, error: 'Invalid angle - must be number between 0 and 180', received: { angle, type: typeof angle } });
      }
      await adapter.gotoAngle(angle, { speedPct });
      positionState.set(partId, { currentAngle: angle, currentP: angleToP(angle), lastUpdated: new Date().toISOString() });
      res.json({ success: true, message: `Moved to ${angle}°`, targetAngle: angle, targetP: angleToP(angle) });
    } else {
      const { p, speedPct } = req.body;
      if (typeof p !== 'number' || p < 0 || p > 1) {
        console.error(`Invalid goto request for part ${partId}:`, { p, speedPct, body: req.body });
        return res.status(400).json({ success: false, error: 'Invalid p - must be number between 0 and 1', received: { p, type: typeof p } });
      }
      const bounds = (profile.bounds && profile.bounds.minP != null && profile.bounds.maxP != null) ? profile.bounds : null;
      const clampedP = clampP(p, bounds);

      // Mark moving for crash recovery
      if (isOpenLoop(profile)) {
        actuatorPositionStore.markMoving(partId, clampedP > (adapter.currentP || 0.5) ? 'extend' : 'retract');
      }

      await adapter.gotoNormalized(clampedP, { speedPct });

      if (isAbsoluteServo(profile)) {
        const targetAngle = pToAngle(clampedP);
        positionState.set(partId, { currentAngle: targetAngle, currentP: clampedP, lastUpdated: new Date().toISOString() });
        res.json({ success: true, message: `Moved to ${targetAngle}°`, targetP: clampedP, targetAngle });
      } else {
        persistPosition(partId, clampedP);
        res.json({ success: true, message: `Moved to ${clampedP}`, targetP: clampedP });
      }
    }
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
    const profile = await getOrAutoCreateProfile(partId);
    if (!profile) return res.status(404).json({ success: false, error: 'Profile not found' });
    const state = positionState.get(partId);

    if (isAbsoluteServo(profile)) {
      const currentAngle = (state && state.currentAngle != null) ? state.currentAngle : 0;
      const bounds = Object.assign({}, profile.bounds || {});
      bounds.minAngle = currentAngle;
      if (bounds.maxAngle != null && bounds.minAngle > bounds.maxAngle) {
        const tmp = bounds.minAngle;
        bounds.minAngle = bounds.maxAngle;
        bounds.maxAngle = tmp;
      }
      profile.bounds = bounds;
      profile.autoGenerated = false;
      await store.upsert(profile);
      res.json({ success: true, message: `Min set to ${bounds.minAngle}°`, bounds: profile.bounds });
    } else {
      // For open-loop parts (linear actuators): reset position tracker to 0.
      // The physical position IS the min — reset tracker to reflect that.
      const adapter = getOrCreateAdapter(partId, profile);
      adapter.currentP = 0;
      persistPosition(partId, 0, { confidence: 'calibrated' });
      profile.bounds = Object.assign({}, profile.bounds || {}, { minP: 0 });
      profile.autoGenerated = false;
      await store.upsert(profile);
      res.json({ success: true, message: 'Min set — position reset to 0', bounds: profile.bounds });
    }
  } catch (err) { console.error(err); res.status(500).json({ success: false, error: 'Failed to set min', message: String(err) }); }
});

router.post('/:partId/set-max', express.json(), async (req, res) => {
  try {
    const partId = parseInt(req.params.partId, 10);
    const profile = await getOrAutoCreateProfile(partId);
    if (!profile) return res.status(404).json({ success: false, error: 'Profile not found' });
    const state = positionState.get(partId);

    if (isAbsoluteServo(profile)) {
      const currentAngle = (state && state.currentAngle != null) ? state.currentAngle : 180;
      const bounds = Object.assign({}, profile.bounds || {});
      bounds.maxAngle = currentAngle;
      if (bounds.minAngle != null && bounds.minAngle > bounds.maxAngle) {
        const tmp = bounds.minAngle;
        bounds.minAngle = bounds.maxAngle;
        bounds.maxAngle = tmp;
      }
      profile.bounds = bounds;
      profile.autoGenerated = false;
      await store.upsert(profile);
      res.json({ success: true, message: `Max set to ${bounds.maxAngle}°`, bounds: profile.bounds });
    } else {
      // For open-loop parts (linear actuators): reset position tracker to 1.
      // The physical position IS the max — reset tracker to reflect that.
      const adapter = getOrCreateAdapter(partId, profile);
      adapter.currentP = 1;
      persistPosition(partId, 1, { confidence: 'calibrated' });
      profile.bounds = Object.assign({}, profile.bounds || {}, { maxP: 1 });
      profile.autoGenerated = false;
      await store.upsert(profile);
      res.json({ success: true, message: 'Max set — position reset to 1', bounds: profile.bounds });
    }
  } catch (err) { console.error(err); res.status(500).json({ success: false, error: 'Failed to set max', message: String(err) }); }
});

router.post('/:partId/set-invert', express.json(), async (req, res) => {
  try {
    const partId = parseInt(req.params.partId, 10);
    const profile = await getOrAutoCreateProfile(partId);
    if (!profile) return res.status(404).json({ success: false, error: 'Profile not found' });
    const invert = !!req.body.invert;
    profile.capability = Object.assign({}, profile.capability || {}, { invert });
    profile.autoGenerated = false;
    await store.upsert(profile);
    // Flush cached adapter but preserve position state
    adapterCache.delete(partId);
    res.json({ success: true, message: `Invert set to ${invert}`, invert });
  } catch (err) { console.error(err); res.status(500).json({ success: false, error: 'Failed to set invert', message: String(err) }); }
});

router.post('/:partId/learn-openloop', express.json(), async (req, res) => {
  try {
    const partId = parseInt(req.params.partId, 10);
    const { probes } = req.body;
    if (!Array.isArray(probes) || probes.length < 2) return res.status(400).json({ success: false, error: 'Need at least 2 probes' });
    const profile = await getOrAutoCreateProfile(partId);
    if (!profile || !profile.motion || profile.motion.type !== 'time-at-speed') return res.status(400).json({ success: false, error: 'Part must have time-at-speed motion model' });
    const bins = probes.map(p => ({ pwmPct: p.pwmPct, unitsPerSec: Math.abs((p.toP - p.fromP)) / (p.msRun / 1000) }));
    profile.motion = Object.assign({}, profile.motion, { bins, settleMs: profile.motion.settleMs || 120 });
    await store.upsert(profile);
    // Flush adapter so it picks up the new motion model
    adapterCache.delete(partId);
    res.json({ success: true, message: 'Motion model learned', motion: profile.motion });
  } catch (err) { console.error(err); res.status(500).json({ success: false, error: 'Failed to learn motion', message: String(err) }); }
});

router.get('/:partId/sensors', async (req, res) => {
  try {
    const partId = parseInt(req.params.partId, 10);
    const profile = await getOrAutoCreateProfile(partId);
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

  // For open-loop parts: use persisted position as initial position (not 0.5)
  let initialP = 0.5;
  const persistedState = actuatorPositionStore.load(partId);
  if (persistedState && persistedState.currentP != null && persistedState.positionKnown !== false) {
    initialP = persistedState.currentP;
  } else {
    // Also check in-memory state (may have been set during this session)
    const memState = positionState.get(partId);
    if (memState && memState.currentP != null) {
      initialP = memState.currentP;
    }
  }

  let adapter;
  if (cap.kind === 'absolute-servo') {
    adapter = new AbsoluteServoAdapter(partId, cap.usMin || 500, cap.usMax || 2500, cap.invert || false);
  } else if (cap.kind === 'openloop-linear' && profile.motion && profile.motion.type === 'time-at-speed') {
    adapter = new OpenLoopLinearAdapter(partId, profile.motion, cap.invert || false, initialP);
  } else if (cap.kind === 'continuous-servo') {
    const channel = profile.channel || cap.channel || 0;
    const address = profile.address || cap.address || 64;
    adapter = new ContinuousServoAdapter(partId, profile.motion, cap.invert || false, channel, address);
    // Set initial position for continuous servo too
    if (adapter.currentP !== undefined) adapter.currentP = initialP;
  } else {
    throw new Error(`Unsupported capability: ${cap.kind}`);
  }
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
    // Don't delete position state — preserving last known position is safer
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
        // Preserve position state
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
