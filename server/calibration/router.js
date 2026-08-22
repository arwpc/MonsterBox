import express from 'express';
import AbsoluteServoAdapter from './adapters/AbsoluteServoAdapter.js';
import OpenLoopLinearAdapter from './adapters/OpenLoopLinearAdapter.js';
import ContinuousServoAdapter from './adapters/ContinuousServoAdapter.js';
import { clampAngle, clampP } from './planner.js';
import { getCalibrationStore, isDegenerateWindow, calibratedBounds, isCalibrated } from './store.js';
import { loadParts } from '../../controllers/partsController.js';
import actuatorPositionStore from '../../services/actuatorPositionStore.js';
import hardwareService from '../../services/hardwareService/index.js';
import servoDaemonClient from '../../services/hardwareService/servoDaemonClient.js';
import { runWrapper } from '../../services/hardwareService/exec.js';
import { getPartSafety, applySafetyLimits } from '../../services/hardwareService/safetyLimits.js';
import { resolveCharacter } from '../../services/characterContext.js';

const router = express.Router();
const store = getCalibrationStore();
const adapterCache = new Map();
const positionState = new Map();

// On module load: recover persisted positions and detect crash state
try {
  actuatorPositionStore.recoverFromCrash();
  const persisted = actuatorPositionStore.loadAll();
  for (const [key, state] of Object.entries(persisted)) {
    // Keys are namespaced "characterId:partId" (legacy records may be a bare
    // partId). parseInt on "2:4" yields 2 — which filed the actuator's restored
    // position under a different part entirely (part 2, a servo) while the real
    // part 4 booted as "Unknown - Home Required" and got homed into an endstop
    // it was already sitting on. Take the LAST segment as the part id.
    const partId = parseInt(String(key).split(':').pop(), 10);
    if (!Number.isFinite(partId)) continue;
    if (state.currentP != null) {
      positionState.set(partId, {
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

/**
 * Refuse to store an angle window that would pin the servo where it stands.
 *
 * set-min/set-max both record the servo's CURRENT angle, so if the part is not
 * actually moving, an operator ends up setting both at the same spot. Saving that
 * clamps every future command to one value — the part becomes permanently frozen,
 * and it looks exactly like the dead servo the operator was trying to diagnose.
 * Refusing here keeps the previous window intact and says what to check instead.
 *
 * @returns {string|null} operator-facing reason to refuse, or null to proceed.
 */
function rejectDegenerateBounds(bounds, which) {
  if (!isDegenerateWindow(bounds)) return null;
  return `Cannot set ${which}: min and max would both be ${bounds.minAngle}°, ` +
    `which would lock this servo at that angle and stop it moving at all. ` +
    `Move the servo to a genuinely different position before setting ${which} — ` +
    `if it is not moving, fix that first (check the channel, the signal lead and the servo itself).`;
}

/** Check if a profile is an open-loop type (linear actuator or continuous servo) */
function isOpenLoop(profile) {
  if (!profile || !profile.capability) return false;
  return profile.capability.kind === 'openloop-linear' || profile.capability.kind === 'continuous-servo';
}

/** Convert between angle and normalized p */
// A servo's REAL rotation range. 180 unless the part declares a multi-turn
// range (capability.maxAngleDeg, stamped from part.config.rotationRangeDeg).
// Every angle on this router is a real output degree of the part — mapping the
// knight's 900° gearbox onto a fixed 0-180 scale made one UI degree five real
// degrees, and a goto from an unknown position commanded hundreds of degrees
// of travel into the head cabling.
function maxAngleOf(profile) {
  const m = profile && profile.capability && Number(profile.capability.maxAngleDeg);
  return (Number.isFinite(m) && m > 0) ? m : 180;
}
function angleToP(angle, maxDeg = 180) { return Math.max(0, Math.min(1, angle / maxDeg)); }
function pToAngle(p, maxDeg = 180) { return Math.round(Math.max(0, Math.min(1, p)) * maxDeg * 10) / 10; }

/**
 * Describe a finished servo move in terms of what the hardware actually did.
 *
 * An inverted servo is driven to the mirror of the commanded angle, so echoing
 * the request back told the operator "Moved to 60" while the PCA9685 register
 * held 119.6 - on the one page whose job is to measure real travel. Report the
 * driven angle, and name the commanded one when the two differ.
 */
function describeServoMove(verb, commandedAngle, drivenAngle, profile) {
  if (!Number.isFinite(drivenAngle) || Math.abs(drivenAngle - commandedAngle) < 0.05) {
    return `${verb} ${commandedAngle}°`;
  }
  // Say WHY the two differ rather than assuming. Inversion is one cause; a safety
  // clamp is another, and blaming the wrong one sends the operator to check the
  // wrong thing. invert lives on the calibration profile's capability, never on
  // the part record - part.config.invert is undefined for every part.
  const inverted = !!(profile && profile.capability && profile.capability.invert);
  const cause = inverted ? 'inverted servo' : 'clamped by safety limits';
  return `${verb} ${drivenAngle}° (commanded ${commandedAngle}° — ${cause})`;
}

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
  // getRaw, not get: this router is the WRITER (set-min/set-max/set-invert/learn
  // read-modify-write the profile), and it is the page where an operator is shown
  // the span they are about to replace. store.get() withholds a placeholder's
  // bounds from consumers that would mistake them for a measurement; saving that
  // view back would erase the span instead of narrowing it.
  let profile = await store.getRaw(partId);

  if (profile) {
    // Re-typing a part (standard ↔ multi-turn ↔ continuous) never rebuilt its
    // existing profile, so the calibration surface kept driving the OLD kind:
    // at the bench a stray 'continuous' on the knight's head turned its profile
    // continuous-servo, and every angle command fell into the p-branch and was
    // refused. PLACEHOLDER profiles follow the part's declared type; a MEASURED
    // profile is never silently re-typed — re-measuring is the only path.
    if (profile.autoGenerated && profile.capability &&
        (profile.capability.kind === 'continuous-servo' || profile.capability.kind === 'absolute-servo')) {
      try {
        const parts = await loadParts();
        const part = parts.find(p => String(p.id) === String(partId));
        if (part && part.type === 'servo') {
          const st = String((part.config && part.config.servoType) || 'standard');
          const wantKind = st === 'continuous' ? 'continuous-servo' : 'absolute-servo';
          if (profile.capability.kind !== wantKind) {
            console.log(`🔄 Calibration profile for part ${partId}: kind ${profile.capability.kind}→${wantKind} (servoType "${st}"). Rebuilding placeholder.`);
            if (wantKind === 'absolute-servo') {
              const range = Number(part.config && part.config.rotationRangeDeg);
              const maxDeg = (Number.isFinite(range) && range > 0) ? range : 180;
              profile.capability = { kind: 'absolute-servo', usMin: 500, usMax: 2500, ...(maxDeg !== 180 ? { maxAngleDeg: maxDeg } : {}) };
              profile.bounds = { minAngle: 0, maxAngle: maxDeg };
              profile.motion = {};
            } else {
              profile.capability = { kind: 'continuous-servo', channel: (part.config && part.config.channel) || 0, address: (part.config && part.config.address) || 64 };
              profile.motion = { type: 'time-at-speed', bins: [{ pwmPct: 50, unitsPerSec: 0.3 }], settleMs: 100 };
              profile.bounds = null;
            }
            adapterCache.delete(partId);
            await store.upsert(profile);
          }
        }
      } catch (_) { /* fall through with existing profile */ }
    }
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
    // Reconcile a multi-turn range declared after the profile was auto-created
    // (the knight's head carried a 0-180 placeholder profile from before
    // rotationRangeDeg meant anything). PLACEHOLDER profiles only: a MEASURED
    // window's numbers were recorded under whatever unit scale existed at
    // measurement time, and re-uniting them by stamping a new range would
    // silently relabel e.g. a real-15-75° window as a licence for 30-150° —
    // the drive path's conversion would then push the part past the operator's
    // measured stop with `calibrated` still true. A measured profile is only
    // ever re-scoped by the operator re-measuring it (Set Min / Set Max).
    // Gating on autoGenerated also keeps this off the hot path: a calibrated
    // part costs zero extra parts.json reads per position poll.
    if (profile.capability && profile.capability.kind === 'absolute-servo' && profile.autoGenerated) {
      try {
        const parts = await loadParts();
        const part = parts.find(p => String(p.id) === String(partId));
        const range = Number(part && part.config && part.config.rotationRangeDeg);
        const declared = (Number.isFinite(range) && range > 0) ? range : 180;
        const stored = maxAngleOf(profile);
        if (declared !== stored) {
          console.log(`🔄 Calibration profile for part ${partId}: rotation range ${stored}°→${declared}°. Syncing from parts.json.`);
          if (declared !== 180) profile.capability.maxAngleDeg = declared;
          else delete profile.capability.maxAngleDeg;
          profile.bounds = { minAngle: 0, maxAngle: declared };
          adapterCache.delete(partId); // force adapter rebuild with the real range
          await store.upsert(profile);
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
        // A multi-turn gearbox declares its real travel in the part config
        // (rotationRangeDeg, e.g. the knight's 900° Stingray-2). Carry it on
        // the capability so every angle downstream is a real output degree.
        const range = Number(part.config && part.config.rotationRangeDeg);
        const maxDeg = (Number.isFinite(range) && range > 0) ? range : 180;
        capability = { kind: 'absolute-servo', usMin: 500, usMax: 2500, ...(maxDeg !== 180 ? { maxAngleDeg: maxDeg } : {}) };
        motion = {};
        bounds = { minAngle: 0, maxAngle: maxDeg };
      }
    } else if (part.type === 'motor' || part.type === 'stepper') {
      // These drive like open-loop linear parts (time-at-speed, no feedback).
      // Stamping `{kind: part.type}` instead persisted a capability no adapter
      // understands, so every later control on the part 400'd/500'd forever and
      // the auto-created record even blocked the UI's own recovery path.
      capability = { kind: 'openloop-linear' };
      motion = { type: 'time-at-speed', bins: [{ pwmPct: 50, unitsPerSec: 0.2 }, { pwmPct: 90, unitsPerSec: 0.4 }], settleMs: 150 };
      bounds = null;
    } else {
      // No adapter exists for this type (speaker, webcam, sensor, ...) —
      // return null rather than persist an undrivable capability.
      return null;
    }

    // No lastCalibratedAt: an auto-created placeholder has never been
    // calibrated, and stamping it made a never-touched part look freshly
    // measured in every status report (v11 audit F13).
    profile = {
      partId,
      capability,
      bounds,
      presets: [],
      motion,
      version: 1,
      autoGenerated: true
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
    res.json({ success: true, profile, calibrated: isCalibrated(profile) });
  } catch (err) { console.error(err); res.status(500).json({ success: false, error: 'Failed to get profile', message: String(err) }); }
});

router.get('/:partId/position', async (req, res) => {
  try {
    const partId = parseInt(req.params.partId, 10);
    const state = positionState.get(partId);
    const profile = await getOrAutoCreateProfile(partId);

    if (isAbsoluteServo(profile)) {
      const currentAngle = (state && state.currentAngle != null) ? state.currentAngle : null;
      const currentP = currentAngle != null ? angleToP(currentAngle, maxAngleOf(profile)) : null;
      res.json({ success: true, currentAngle, currentP, kind: 'absolute-servo', maxAngleDeg: maxAngleOf(profile), lastUpdated: state ? state.lastUpdated : null });
    } else {
      const currentP = (state && state.currentP != null) ? state.currentP : null;
      const positionKnown = state ? (state.positionKnown !== false) : false;
      const confidence = state ? (state.confidence || 'unknown') : 'unknown';
      res.json({ success: true, currentP, positionKnown, confidence, lastUpdated: state ? state.lastUpdated : null });
    }
  } catch (err) { console.error(err); res.status(500).json({ success: false, error: 'Failed to get position', message: String(err) }); }
});

const KNOWN_CAPABILITY_KINDS = new Set(['absolute-servo', 'openloop-linear', 'continuous-servo']);

router.post('/:partId/profile', express.json(), async (req, res) => {
  try {
    const partId = parseInt(req.params.partId, 10);
    const profile = Object.assign({}, req.body, { partId, version: 1 });
    // lastCalibratedAt moves only when the measured window actually changes.
    // This route also carries preset adds and tweaks, and stamping those made
    // "last calibrated" mean "last touched" (v11 audit F13). The on-disk stamp
    // is the trusted source — never a client echo.
    {
      const existing = await store.getRaw(partId);
      const boundsChanged = JSON.stringify((existing && existing.bounds) || null)
        !== JSON.stringify(profile.bounds || null);
      if (boundsChanged) profile.lastCalibratedAt = new Date().toISOString();
      else if (existing && existing.lastCalibratedAt) profile.lastCalibratedAt = existing.lastCalibratedAt;
      else delete profile.lastCalibratedAt;
    }

    // This is the one bounds writer that used to accept the body verbatim —
    // no capability check, no numeric check, no degenerate-window check — so a
    // stale page (or one bad request) could persist min==max and freeze the
    // part, sidestepping every guard on set-min/set-max.
    if (!profile.capability || !KNOWN_CAPABILITY_KINDS.has(profile.capability.kind)) {
      return res.status(400).json({
        success: false,
        error: `Profile requires capability.kind of: ${[...KNOWN_CAPABILITY_KINDS].join(', ')}`
      });
    }
    if (profile.bounds) {
      for (const key of ['minAngle', 'maxAngle', 'minP', 'maxP']) {
        if (profile.bounds[key] != null && !Number.isFinite(Number(profile.bounds[key]))) {
          return res.status(400).json({ success: false, error: `bounds.${key} must be a finite number` });
        }
      }
      if (isDegenerateWindow(profile.bounds)) {
        return res.status(409).json({
          success: false,
          error: 'Refusing bounds with zero usable span — this would lock the part at one position. ' +
                 'Move the part between captures; if it is not moving, diagnose that first.'
        });
      }
    }

    // Heal the preset field-name drift (v11 audit F15): the calibration panel
    // historically saved {name, position} while the scene executor reads only
    // p/angle — a preset with `position` alone resolved to targetP=undefined
    // at show time. Normalize on the way in so presets already drifted on disk
    // are healed by the next save, without touching the executor.
    if (Array.isArray(profile.presets)) {
      for (const preset of profile.presets) {
        if (preset && preset.position != null && preset.p == null) {
          preset.p = preset.position;
        }
      }
    }

    await store.upsert(profile);
    // Flush adapter but preserve position state
    adapterCache.delete(partId);
    res.json({ success: true, message: 'Profile saved', profile });
  } catch (err) { console.error(err); res.status(500).json({ success: false, error: 'Failed to save profile', message: String(err) }); }
});

/**
 * Stamp a part Calibrated, on or off.
 *
 * Until now "calibrated" was only ever a side effect of set-min/set-max — there was
 * no way for an operator to bless a part they had verified by hand, nor to retire a
 * calibration they no longer trust. Both are real operations and both were missing.
 *
 * Stamping ON refuses a profile with no usable window: claiming a measurement that
 * does not exist is precisely the lie the placeholder and degenerate guards exist to
 * prevent. Stamping OFF destroys nothing — the captured numbers stay in the file —
 * but marks them untrusted, so calibratedBounds() withholds them from every caller
 * that moves hardware.
 */
router.post('/:partId/calibrated', express.json(), async (req, res) => {
  try {
    const partId = parseInt(req.params.partId, 10);
    const body = req.body || {};
    const { calibrated } = body;
    if (typeof calibrated !== 'boolean') {
      return res.status(400).json({ success: false, error: 'calibrated must be true or false' });
    }
    // Part ids are unique only within a character — honour an explicit one.
    const characterId = body.characterId != null ? body.characterId : undefined;

    const profile = await store.getRaw(partId, characterId);
    if (!profile) return res.status(404).json({ success: false, error: 'Calibration profile not found' });

    if (calibrated) {
      if (isDegenerateWindow(profile.bounds)) {
        return res.status(409).json({
          success: false,
          error: 'Cannot stamp Calibrated: the stored window has zero usable span, which would lock ' +
                 'the part at one position. Re-run Set Min / Set Max with the part actually moving.'
        });
      }
    }

    // Bounds are NOT universal. Only absolute-servo profiles carry a window;
    // continuous servos, linear actuators, motors and steppers are all created
    // with bounds:null and calibrate through their motion model instead. An
    // earlier version of this guard demanded bounds and so refused to stamp every
    // part type except a standard servo. The only refusal that protects hardware
    // is the degenerate window above; past that the operator is the authority on
    // whether they have calibrated their own part.
    //
    // One honest caveat, surfaced rather than enforced: an absolute-servo still
    // sitting on the untouched full 0-180 auto-created span has never actually
    // been measured, so say so instead of silently blessing a guess.
    let warning = null;
    if (calibrated && profile.capability && profile.capability.kind === 'absolute-servo') {
      const b = profile.bounds || {};
      const fullSpan = maxAngleOf(profile);
      if (profile.autoGenerated && b.minAngle === 0 && b.maxAngle === fullSpan) {
        warning = `Stamped, but this servo still carries the full 0-${fullSpan} default span — ` +
                  'its real travel has never been measured. Run Set Min / Set Max to record it.';
      }
    }

    profile.calibrated = calibrated;
    // Keep the legacy placeholder marker in step, so every existing consumer —
    // safetyLimits, poseBounds, the jaw and head services — reads the same answer.
    profile.autoGenerated = !calibrated;
    // Blessing is a calibration act; retiring is not — a cleared stamp keeps
    // the old measurement date so nothing reads "calibrated just now" (F13).
    if (calibrated) profile.lastCalibratedAt = new Date().toISOString();

    await store.upsert(profile, characterId);
    adapterCache.delete(partId);

    console.log(`🏷️  Part ${partId} stamped ${calibrated ? 'CALIBRATED' : 'UNCALIBRATED'}`);
    const saved = await store.get(partId, characterId);
    res.json({ success: true, calibrated: isCalibrated(saved), profile: saved, warning });
  } catch (err) {
    console.error(err);
    res.status(500).json({ success: false, error: 'Failed to set calibrated stamp', message: String(err) });
  }
});

router.post('/:partId/nudge', express.json(), async (req, res) => {
  try {
    const partId = parseInt(req.params.partId, 10);
    const profile = await getOrAutoCreateProfile(partId);
    if (!profile) return res.status(404).json({ success: false, error: 'Profile not found' });
    // Nudge is the operator's supervised discovery tool, so it is deliberately not
    // clamped to existing bounds — but a quarantined part must still refuse.
    const guard = await checkSafety(req, partId, {});
    if (!guard.ok) return res.status(403).json(guard);
    const adapter = getOrCreateAdapter(partId, profile);

    // Support both old format (dir, scale) and new format (delta, speedPct, durationMs)
    if (req.body.dir && req.body.scale) {
      // Old format: { dir: 'min'|'max', scale: 'fine'|'med'|'coarse' }
      const { dir, scale } = req.body;
      if (!['min', 'max'].includes(dir) || !['fine', 'med', 'coarse'].includes(scale)) {
        console.error(`Invalid nudge request for part ${partId}:`, { dir, scale, body: req.body });
        return res.status(400).json({ success: false, error: 'Invalid dir or scale' });
      }
      await adapter.nudge(dir, scale, { calibrationOverride: true });

      if (isAbsoluteServo(profile)) {
        // The adapter refuses the nudge outright when it has no starting angle,
        // so by here currentAngle is a real number - no 90° stand-in.
        const currentAngle = adapter.currentAngle;
        const drivenAngle = Number.isFinite(adapter.lastDrivenAngle) ? adapter.lastDrivenAngle : currentAngle;
        positionState.set(partId, { currentAngle, currentP: angleToP(currentAngle, maxAngleOf(profile)), lastUpdated: new Date().toISOString() });
        res.json({ success: true, message: `Nudged ${dir} at ${scale} — ${describeServoMove('now at', currentAngle, drivenAngle, profile)}`, currentAngle, drivenAngle, currentP: angleToP(currentAngle, maxAngleOf(profile)) });
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
        const currentAngle = adapter.currentAngle;
        // A delta is relative as well, and nudge is deliberately bounds-free:
        // started from an invented angle it lands somewhere arbitrary with
        // nothing left to catch it. Refuse instead of guessing.
        if (!Number.isFinite(currentAngle)) {
          return res.status(409).json({ success: false, positionUnknown: true,
            error: 'Servo position is unknown — move to an absolute angle (goto) first, then nudge' });
        }
        // Deliberately NOT clamped to profile.bounds: nudge is the operator's
        // supervised tool for discovering limits at the calibration screen, and
        // set-min/set-max record wherever it lands. Clamping here would make an
        // existing window impossible to widen. The runtime path (goto) is clamped.
        // calibrationOverride carries that intent through controlPart's inner
        // safety clamp too — without it, the configured hardware-safety window
        // silently re-clamped the "unclamped" nudge, and the operator was
        // stopped at the old ceiling while trying to measure past it.
        const newAngle = Math.max(0, Math.min(maxAngleOf(profile), currentAngle + delta));
        const drivenAngle = await adapter.gotoAngle(newAngle, { speedPct, durationMs, calibrationOverride: true });
        positionState.set(partId, { currentAngle: newAngle, currentP: angleToP(newAngle, maxAngleOf(profile)), lastUpdated: new Date().toISOString() });
        res.json({ success: true, message: `Nudged by ${delta}° — ${describeServoMove('now at', newAngle, drivenAngle, profile)}`, currentAngle: newAngle, drivenAngle, currentP: angleToP(newAngle, maxAngleOf(profile)) });
      } else {
        const currentP = adapter.currentP !== undefined ? adapter.currentP : 0.5;
        // FIX: Apply calibration bounds to nudge (was missing before).
        // calibratedBounds() so a degenerate/placeholder window cannot pin it.
        const measuredNudge = calibratedBounds(profile);
        const bounds = (measuredNudge && measuredNudge.minP != null && measuredNudge.maxP != null) ? measuredNudge : null;
        const rawP = currentP + delta;
        const newP = clampP(rawP, bounds);
        if (delta !== 0 && Math.abs(newP - currentP) < 1e-9) {
          // The ESTIMATED position is pinned at the end of its tracked range:
          // the clamp swallowed the whole delta and the adapter would answer
          // "Already at target" without commanding hardware. This used to
          // report success, so five CW presses in a row read "cw complete"
          // while the servo never moved — indistinguishable from a dead servo,
          // and the physical part may be nowhere near its real end (F8). The
          // rail is the TRACKER's, not the hardware's, so say what unblocks:
          // jog-raw ignores the estimate; home re-seats it at a real endstop.
          const rail = delta > 0 ? 'maximum' : 'minimum';
          return res.status(409).json({
            success: false,
            saturated: true,
            currentP,
            error: `Estimated position is already at its ${rail} (${currentP.toFixed(2)}) — the tracker, not the hardware, is at the end of its range. Use raw jog to keep moving, or home to an endstop to reset the estimate.`
          });
        }
        await adapter.gotoNormalized(newP, { speedPct, durationMs, calibrationOverride: true });
        persistPosition(partId, newP);
        const clamped = Math.abs(newP - rawP) > 1e-9;
        res.json({
          success: true,
          message: clamped ? `Nudged by ${delta} — clamped at the end of the tracked range` : `Nudged by ${delta}`,
          currentP: newP,
          clamped
        });
      }
    } else {
      console.error(`Invalid nudge request for part ${partId} - missing parameters:`, req.body);
      return res.status(400).json({ success: false, error: 'Must provide either (dir, scale) or (delta)' });
    }
  } catch (err) {
    if (String(err).includes('Unsupported capability')) {
      return res.status(400).json({ success: false, error: String(err) });
    }
    // An adapter that refuses a relative move it cannot start from is telling
    // the operator what to do next, not failing.
    if (err && err.positionUnknown) {
      return res.status(409).json({ success: false, positionUnknown: true, error: err.message });
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
    // controlPart never throws — a quarantined part (blockAllMotion /
    // noRetractBelowMin, the guards written FOR this bounds-bypassing endpoint)
    // and a failed wrapper both come back as {success:false}. Discarding that
    // told the operator "Done" for a refused jog, hiding the blockReason that
    // explains what to check, exactly when they are judging physical range.
    const ctx = await resolveCharacter(req);
    const result = await hardwareService.controlPart(String(partId), 'jog',
      { direction, speed, duration },
      { calibrationOverride: true, ...(ctx && ctx.id != null ? { characterId: ctx.id } : {}) });
    if (!result || result.success === false) {
      const blocked = !!(result && result.blockedBySafetyLimit);
      return res.status(blocked ? 403 : 502).json({
        success: false,
        blockedBySafetyLimit: blocked,
        error: (result && result.error) || 'Raw jog failed'
      });
    }
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
    // Supervised calibration: homing must reach the physical endstop, so the
    // duration cap does not apply (quarantines and power groups still do).
    await adapter.home(dir, speedPct, { calibrationOverride: true });
    const currentP = adapter.currentP !== undefined ? adapter.currentP : (dir === 'retract' ? 0 : 1);
    // Homing gives us high-confidence position
    actuatorPositionStore.markHomed(partId, currentP);
    positionState.set(partId, { currentP, positionKnown: true, confidence: 'homed', lastUpdated: new Date().toISOString() });
    res.json({ success: true, message: `Homed to ${dir} endstop`, currentP, positionKnown: true, confidence: 'homed' });
  } catch (err) {
    console.error(err);
    // markMoving ran before the drive; a refused/failed home means the motor
    // was never (or no longer) energized. Leaving isMoving set makes the next
    // startup's crash recovery discard a position that never actually changed.
    try { actuatorPositionStore.update(parseInt(req.params.partId, 10), { isMoving: false }); } catch (_) { /* state cleanup is best-effort */ }
    res.status(500).json({ success: false, error: 'Failed to home', message: String(err) });
  }
});


/**
 * Enforce the hardware safety layer on a calibration move.
 *
 * The calibration router drives adapters directly and therefore does NOT pass
 * through controlPart(), where safetyLimits lives. That left the entire
 * /api/calibration surface — goto, nudge, set-min, set-max, sweep — as a hole
 * straight around `blockAllMotion`, the configured angle windows and the
 * fused-rail serialization. It was possible to drive a quarantined, physically
 * dead servo to both extremes and be told `success: true, clamped: false` three
 * times, from the page new operators are steered to first.
 *
 * Returns null when the move may proceed, or a ready-to-send refusal object.
 */
async function checkSafety(req, partId, { angleDeg, direction } = {}) {
  try {
    const ctx = await resolveCharacter(req);
    const characterId = ctx && ctx.id;
    const store = getCalibrationStore();
    const profile = await store.get(partId, characterId);
    const safety = await getPartSafety(characterId, partId, profile);
    const limited = applySafetyLimits({
      type: 'servo',
      action: 'goto',
      params: angleDeg != null ? { angleDeg } : { direction },
      profile,
      safety,
      partId
    });
    if (limited.blocked) {
      console.warn(`🛑 Calibration move refused for part ${partId}: ${limited.blocked}`);
      return {
        success: false,
        error: limited.blocked,
        blockedBySafetyLimit: true,
        partId
      };
    }
    return { ok: true, safety, profile, adjusted: limited.params };
  } catch (err) {
    // A failure to evaluate safety must not silently permit the move.
    console.error(`Safety evaluation failed for part ${partId}:`, err && err.message);
    return { success: false, error: 'Safety check failed; refusing to move', partId };
  }
}

router.post('/:partId/goto', express.json(), async (req, res) => {
  try {
    const partId = parseInt(req.params.partId, 10);
    const profile = await getOrAutoCreateProfile(partId);
    if (!profile) return res.status(404).json({ success: false, error: 'Profile not found' });
    const adapter = getOrCreateAdapter(partId, profile);

    if (isAbsoluteServo(profile) && req.body.angle !== undefined) {
      const { angle, speedPct } = req.body;
      const maxDeg = maxAngleOf(profile);
      if (typeof angle !== 'number' || angle < 0 || angle > maxDeg) {
        return res.status(400).json({ success: false, error: `Invalid angle - must be number between 0 and ${maxDeg}`, received: { angle, type: typeof angle } });
      }
      const guard = await checkSafety(req, partId, { angleDeg: angle });
      if (!guard.ok) return res.status(403).json(guard);
      // Respect the part's calibrated window, not just 0-180 — driving a
      // calibrated servo past its bounds holds it against a mechanical stop —
      // and then the configured safety window on top of it.
      // Explicit supervised-calibration request from the calibration page:
      // skip the calibrated-bounds clamp (measuring real travel is the point)
      // and carry the override through the inner safety layer. checkSafety
      // above has already refused quarantined parts either way. Runtime
      // callers never send this flag and stay fully clamped.
      const calOverride = req.body.calibrationOverride === true;
      const safeAngle = guard.adjusted && guard.adjusted.angleDeg != null ? guard.adjusted.angleDeg : angle;
      // calibratedBounds(), not profile.bounds: the raw record can carry a
      // placeholder span or a degenerate (min==max) window, and clamping with
      // either pins the servo at one angle on the very page whose job is to
      // diagnose why it will not move. The safe accessor withholds both.
      const targetAngle = calOverride ? Math.max(0, Math.min(maxDeg, angle)) : clampAngle(safeAngle, calibratedBounds(profile), maxDeg);
      if (targetAngle !== angle) {
        console.warn(`🛡️  goto clamped part ${partId}: ${angle}° → ${targetAngle}° (calibrated bounds)`);
      }
      const drivenAngle = await adapter.gotoAngle(targetAngle, { speedPct, calibrationOverride: calOverride });
      positionState.set(partId, { currentAngle: targetAngle, currentP: angleToP(targetAngle, maxDeg), lastUpdated: new Date().toISOString() });
      res.json({ success: true, message: describeServoMove('Moved to', targetAngle, drivenAngle, profile), targetAngle, drivenAngle, targetP: angleToP(targetAngle, maxDeg), requestedAngle: angle, clamped: targetAngle !== angle });
    } else {
      const { p, speedPct } = req.body;
      if (typeof p !== 'number' || p < 0 || p > 1) {
        console.error(`Invalid goto request for part ${partId}:`, { p, speedPct, body: req.body });
        return res.status(400).json({ success: false, error: 'Invalid p - must be number between 0 and 1', received: { p, type: typeof p } });
      }
      const guardP = await checkSafety(req, partId, {});
      if (!guardP.ok) return res.status(403).json(guardP);
      const measured = calibratedBounds(profile);
      const bounds = (measured && measured.minP != null && measured.maxP != null) ? measured : null;
      const clampedP = clampP(p, bounds);

      // Mark moving for crash recovery
      if (isOpenLoop(profile)) {
        actuatorPositionStore.markMoving(partId, clampedP > (adapter.currentP || 0.5) ? 'extend' : 'retract');
      }

      const drivenAngle = await adapter.gotoNormalized(clampedP, { speedPct });

      if (isAbsoluteServo(profile)) {
        const targetAngle = pToAngle(clampedP, maxAngleOf(profile));
        positionState.set(partId, { currentAngle: targetAngle, currentP: clampedP, lastUpdated: new Date().toISOString() });
        res.json({ success: true, message: describeServoMove('Moved to', targetAngle, drivenAngle, profile), targetP: clampedP, targetAngle, drivenAngle });
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

// De-energize a part's PCA9685 channel: stop sending pulses so the servo goes
// limp (a gearbox holds by friction). This is the operator's plug/unplug tool:
// a channel HOLDS its last commanded pulse, so plugging a servo lead into a
// live channel slams the servo to wherever that stale pulse points — measured
// on the knight's head, which snapped to an unsafe spot the instant it was
// reconnected and then sat there under power. Release first, plug second.
// The position ESTIMATE is kept (nothing moves an unpowered gearbox); hold
// torque is gone until the next move command re-energizes the channel.
router.post('/:partId/release', express.json(), async (req, res) => {
  try {
    const partId = parseInt(req.params.partId, 10);
    const parts = await loadParts();
    const part = parts.find(p => String(p.id) === String(partId));
    if (!part) return res.status(404).json({ success: false, error: 'Part not found' });
    const cfg = part.config || {};
    const chRaw = cfg.channel != null ? cfg.channel : part.channel;
    const channel = Number(chRaw);
    if (chRaw == null || !Number.isFinite(channel)) {
      return res.status(400).json({ success: false, error: 'Part has no PCA9685 channel to release' });
    }
    const addrRaw = cfg.address != null ? cfg.address : 64;
    const address = (typeof addrRaw === 'string' && String(addrRaw).startsWith('0x'))
      ? parseInt(addrRaw, 16) : Number(addrRaw);

    let via = 'daemon';
    try {
      await servoDaemonClient.ensureDaemon();
      await servoDaemonClient.release(channel, { address });
    } catch (daemonErr) {
      via = 'servo_cli';
      const out = await runWrapper('servo_cli.py', ['release', String(channel), String(address)]);
      let ok = false;
      try { ok = JSON.parse(out).status === 'success'; } catch (_) { ok = false; }
      if (!ok) {
        return res.status(500).json({ success: false, error: `Release failed on channel ${channel}: ${String(out).slice(0, 200)}` });
      }
    }
    console.log(`🔌 Released PCA9685 ch${channel} (${part.name}) via ${via} — de-energized, safe to plug/unplug`);
    res.json({
      success: true, released: true, channel, via,
      message: `Channel ${channel} released — ${part.name} is de-energized (holds by friction only). Safe to plug/unplug; the next move re-energizes it.`
    });
  } catch (err) {
    console.error('Release failed:', err);
    res.status(500).json({ success: false, error: 'Failed to release channel', message: String(err) });
  }
});

router.post('/:partId/set-min', express.json(), async (req, res) => {
  try {
    const partId = parseInt(req.params.partId, 10);
    const profile = await getOrAutoCreateProfile(partId);
    if (!profile) return res.status(404).json({ success: false, error: 'Profile not found' });
    const state = positionState.get(partId);

    if (isAbsoluteServo(profile)) {
      // Refuse rather than substitute an angle the servo was never at. "Set min"
      // records a MEASURED floor and stamps autoGenerated=false, so falling back
      // to 0 wrote a fabricated angle as if an operator had jogged to it — on a
      // part whose real window is {22, 91} that silently widens travel 22 degrees
      // past the mechanical floor, and rejectDegenerateBounds cannot catch it
      // because 0 !== 91.
      if (!state || state.currentAngle == null) {
        return res.status(409).json({ success: false, positionUnknown: true,
          error: 'Servo position is unknown — move to an absolute angle (goto) first, then set min',
          bounds: profile.bounds });
      }
      const currentAngle = state.currentAngle;
      const bounds = Object.assign({}, profile.bounds || {});
      bounds.minAngle = currentAngle;
      if (bounds.maxAngle != null && bounds.minAngle > bounds.maxAngle) {
        const tmp = bounds.minAngle;
        bounds.minAngle = bounds.maxAngle;
        bounds.maxAngle = tmp;
      }
      const refusal = rejectDegenerateBounds(bounds, 'min');
      if (refusal) return res.status(409).json({ success: false, error: refusal, bounds: profile.bounds });
      profile.bounds = bounds;
      profile.autoGenerated = false;
      profile.lastCalibratedAt = new Date().toISOString(); // a real measurement just happened (F13)
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
      profile.lastCalibratedAt = new Date().toISOString(); // a real measurement just happened (F13)
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
      // Same reasoning as set-min: 180 is a guess, and this write claims to be a
      // measurement.
      if (!state || state.currentAngle == null) {
        return res.status(409).json({ success: false, positionUnknown: true,
          error: 'Servo position is unknown — move to an absolute angle (goto) first, then set max',
          bounds: profile.bounds });
      }
      const currentAngle = state.currentAngle;
      const bounds = Object.assign({}, profile.bounds || {});
      bounds.maxAngle = currentAngle;
      if (bounds.minAngle != null && bounds.minAngle > bounds.maxAngle) {
        const tmp = bounds.minAngle;
        bounds.minAngle = bounds.maxAngle;
        bounds.maxAngle = tmp;
      }
      const refusal = rejectDegenerateBounds(bounds, 'max');
      if (refusal) return res.status(409).json({ success: false, error: refusal, bounds: profile.bounds });
      profile.bounds = bounds;
      profile.autoGenerated = false;
      profile.lastCalibratedAt = new Date().toISOString(); // a real measurement just happened (F13)
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
      profile.lastCalibratedAt = new Date().toISOString(); // a real measurement just happened (F13)
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
    // Accept both probe shapes: the unified page posts {pwmPct, msRun,
    // measuredDeltaP}; the documented contract was {pwmPct, msRun, fromP, toP}.
    // Reading only toP/fromP produced unitsPerSec = NaN, which JSON persisted
    // as null — and every consumer that divides by that rate then commanded a
    // duration of Infinity. Validate the rate before it can be stored.
    const bins = probes.map(p => {
      const delta = Math.abs(p.measuredDeltaP != null ? Number(p.measuredDeltaP) : (Number(p.toP) - Number(p.fromP)));
      const secs = Number(p.msRun) / 1000;
      const rate = delta / secs;
      if (!Number.isFinite(rate) || rate <= 0) {
        throw Object.assign(new Error(`Probe at ${p.pwmPct}% did not measure any movement — re-run it with the part actually moving`), { statusCode: 400 });
      }
      return { pwmPct: Number(p.pwmPct), unitsPerSec: rate };
    });
    profile.motion = Object.assign({}, profile.motion, { bins, settleMs: profile.motion.settleMs || 120 });
    await store.upsert(profile);
    // Flush adapter so it picks up the new motion model
    adapterCache.delete(partId);
    res.json({ success: true, message: 'Motion model learned', motion: profile.motion });
  } catch (err) {
    if (err && err.statusCode === 400) {
      return res.status(400).json({ success: false, error: err.message });
    }
    console.error(err); res.status(500).json({ success: false, error: 'Failed to learn motion', message: String(err) });
  }
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

function getOrCreateAdapter(partId, profile) {
  if (adapterCache.has(partId)) return adapterCache.get(partId);
  const cap = profile.capability || { kind: 'absolute-servo' };

  // For open-loop parts: use persisted position as initial position (not 0.5)
  let initialP = 0.5;
  // Absolute servos get null when nothing is stored: an unknown position must
  // stay unknown so a relative nudge refuses instead of starting from a made-up
  // 90° - that stand-in drove a jaw sitting at 131.5° down to 88°, past its
  // calibrated minimum, because nudge is deliberately bounds-free.
  let initialAngle = null;
  const persistedState = actuatorPositionStore.load(partId);
  const memState = positionState.get(partId);
  // Same store, same precedence as the open-loop adapter: disk first, then any
  // position recorded during this session.
  const knownState = (persistedState && persistedState.currentP != null && persistedState.positionKnown !== false)
    ? persistedState
    : ((memState && memState.currentP != null && memState.positionKnown !== false) ? memState : null);
  if (knownState) {
    initialP = knownState.currentP;
    // Servo records carry the angle they were driven to; p is the fallback.
    initialAngle = Number.isFinite(knownState.currentAngle) ? knownState.currentAngle : knownState.currentP * maxAngleOf(profile);
  }

  let adapter;
  if (cap.kind === 'absolute-servo') {
    // profile.bounds is passed so an inverted servo is mirrored the SAME way the
    // runtime mirrors it (within the calibrated window, not across the full span).
    adapter = new AbsoluteServoAdapter(partId, cap.usMin || 500, cap.usMax || 2500, cap.invert || false, initialAngle, profile.bounds, maxAngleOf(profile));
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
    // Same scoping fix clear-all got: profiles are keyed "characterId:partId" and
    // part ids repeat across characters, so an unscoped delete resolves against
    // whatever selectedCharacter happens to be and can erase the wrong character's
    // measurement.
    const ctx = await resolveCharacter(req);
    const characterId = ctx && ctx.id;
    const existing = await store.getRaw(partId, characterId);
    await store.delete(partId, characterId);
    adapterCache.delete(partId);
    // A destructive op must be visible in /var/log/monsterbox.err — the 2026-08-20
    // loss of a hand-measured window on this node was undiagnosable because this
    // endpoint succeeded silently.
    console.warn(`🧹 Calibration profile DELETED for ${characterId}:${partId}` +
      (existing && existing.bounds ? ` (was bounds ${existing.bounds.minAngle}-${existing.bounds.maxAngle}, autoGenerated=${!!existing.autoGenerated})` : ' (no prior bounds)'));
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
    const { partIds } = req.body;
    if (!Array.isArray(partIds) || partIds.length === 0) {
      return res.status(400).json({ success: false, error: 'Must provide array of partIds to clear' });
    }

    // The body's characterId used to be destructured and then never passed on, so
    // a fleet client asking to clear character 3 wiped THIS node's character
    // instead — and reported success. Profiles are keyed "characterId:partId" and
    // part ids repeat across characters, so an unscoped delete is always a delete
    // of the wrong thing on a node serving someone else.
    const ctx = await resolveCharacter(req);
    const characterId = ctx && ctx.id;

    let cleared = 0;
    for (const partId of partIds) {
      try {
        await store.delete(parseInt(partId, 10), characterId);
        // NOTE: the adapter cache is still keyed by bare partId, so it is only
        // correct while a node serves one character. Keying it per character
        // means threading characterId through getOrCreateAdapter and all eight
        // cache sites — tracked in KNOWN-BUGS rather than done untested here.
        adapterCache.delete(parseInt(partId, 10));
        // Preserve position state
        cleared++;
      } catch (err) {
        console.warn(`Failed to clear calibration for part ${partId}:`, err);
      }
    }

    // Destructive op — must be visible in .err (see the single-part DELETE above).
    console.warn(`🧹 clear-all: ${cleared} calibration profile(s) DELETED for character ${characterId}: parts ${partIds.join(', ')}`);
    res.json({ success: true, message: `Cleared ${cleared} calibration profile(s)`, cleared, characterId });
  } catch (err) {
    console.error('Error clearing all calibrations:', err);
    res.status(500).json({ success: false, error: 'Failed to clear calibrations', message: String(err) });
  }
});

export default router;
