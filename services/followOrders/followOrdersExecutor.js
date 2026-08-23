/**
 * Follow Orders Executor — turns a matched order into safe hardware motion.
 *
 * Every path goes through the existing bounds-safe layer: poses via
 * poseEngine.executePose, gestures via gestureEngineService.performGesture,
 * raw part commands via controlPart AFTER a getEffectiveWindow pre-flight.
 * A spoken order is an AUTONOMOUS caller by convention: physically-broken
 * parts are skipped (like scenes and poses do), parts fenced with
 * excludeFromAutomatedTests are refused, and calibrationOverride is never set.
 */
import { PRIORITY, claimServo, releaseServo, releaseAll } from '../movement/priorityManager.js';
import { getEffectiveWindow, clampIntoWindow } from '../poses/poseBounds.js';

const OWNER = 'follow-orders';
// A spoken order is a semantic gesture: above idle/jaw/head, below scenes.
const ORDER_PRIORITY = PRIORITY.GESTURE_SEMANTIC;

async function hw() {
  const mod = await import('../hardwareService/index.js');
  return mod.default || mod;
}

// Body awareness: report what an order did, so the conversation layer can
// tell the agent. Fire-and-forget — belief tracking never blocks motion.
async function recordBody(fn) {
  try {
    const bodyState = await import('../bodyStateService.js').then(m => m.default || m);
    fn(bodyState);
  } catch (_) { /* body state unavailable — motion is unaffected */ }
}

async function physicalFault(characterId, partId) {
  try {
    const { getPhysicalFault } = await import('../hardwareService/safetyLimits.js');
    return await getPhysicalFault(characterId, partId);
  } catch (_) {
    return { broken: false };
  }
}

/**
 * Stop every part that can be in motion, then hand back all claims.
 * Exported for the panic path. Never throws; collects per-part outcomes.
 */
export async function stopEverything(characterId, parts) {
  const results = [];
  let partList = parts;
  if (!Array.isArray(partList)) {
    const { loadPartsSafe, CONTROLLABLE_TYPES } = await import('./followOrdersSuperPowerService.js');
    const raw = await loadPartsSafe(characterId);
    partList = raw
      .filter(p => p.enabled !== false && CONTROLLABLE_TYPES.has(String(p.type || '').replace(/-/g, '_')))
      .map(p => ({ partId: String(p.id), type: String(p.type || '').replace(/-/g, '_'), name: p.name || '' }));
  }

  const stoppable = new Set(['servo', 'continuous_servo', 'linear_actuator', 'motor', 'stepper', 'speaker']);
  const hardware = await hw();
  for (const part of partList) {
    if (!stoppable.has(part.type)) continue;
    const fault = await physicalFault(characterId, part.partId);
    if (fault.broken) {
      results.push({ partId: part.partId, skipped: true, reason: 'physical_fault' });
      continue;
    }
    try {
      const r = await hardware.controlPart(String(part.partId), 'stop', {}, { characterId });
      results.push({ partId: part.partId, success: !!(r && r.success !== false) });
    } catch (err) {
      results.push({ partId: part.partId, success: false, error: err.message });
    }
  }
  releaseAll(OWNER);
  console.log(`[FollowOrders] STOP on character ${characterId}: ${results.length} part(s) addressed`);
  return { success: true, kind: 'stop', results };
}

/** Marker named `name` (Min/Mid/Max) from parts.json markers, if present. */
function markerValue(part, name) {
  const m = (part.markers || []).find(mk => mk && mk.name === name && typeof mk.value === 'number');
  return m ? m.value : null;
}

function cappedDuration(requestedMs, cfg, window) {
  const candidates = [
    requestedMs,
    cfg && cfg.defaultDurationMs,
    1200
  ].filter(v => typeof v === 'number' && v > 0);
  let duration = candidates[0];
  const caps = [
    cfg && cfg.maxDurationMs,
    window && window.maxDurationMs
  ].filter(v => typeof v === 'number' && v > 0);
  for (const cap of caps) duration = Math.min(duration, cap);
  return duration;
}

/**
 * One raw part command: pre-flight, then the type-appropriate controlPart call.
 * `verb` is one of open|close|on|off|toggle|quiet|play|stop.
 */
async function executePartOrder(characterId, part, verb, cfg, extras = {}) {
  const partId = String(part.partId);

  const fault = await physicalFault(characterId, partId);
  if (fault.broken) {
    return { success: false, refused: true, reason: 'physical_fault', detail: fault.reason, partId, partName: part.name };
  }

  const window = await getEffectiveWindow(characterId, partId).catch(() => null);
  if (window && window.blocked) {
    return { success: false, refused: true, reason: 'blocked', detail: window.blockReason, partId, partName: part.name };
  }
  if (window && window.excludeFromAutomatedTests) {
    // The operator fenced this part off from autonomous callers (multi-turn
    // neck, fused rail). A voice order counts as autonomous. Never relax.
    return { success: false, refused: true, reason: 'excluded_from_automated_control', partId, partName: part.name };
  }

  const hardware = await hw();
  const duration = cappedDuration(extras.durationMs, cfg, window);

  try {
    switch (part.type) {
      case 'servo':
      case 'continuous_servo': {
        if (verb === 'stop') {
          const r = await hardware.controlPart(partId, 'stop', {}, { characterId });
          return { ...summarize(r), partId, partName: part.name };
        }
        if (verb !== 'open' && verb !== 'close') {
          return { success: false, refused: true, reason: 'verb_object_mismatch', partId, partName: part.name };
        }
        let target = typeof extras.angle === 'number'
          ? extras.angle
          : (verb === 'open' ? markerValue(part, 'Max') : markerValue(part, 'Min'));
        const lo = window && typeof window.lo === 'number' ? window.lo : null;
        const hi = window && typeof window.hi === 'number' ? window.hi : null;
        if (target == null) target = verb === 'open' ? hi : lo;
        if (target == null || lo == null || hi == null || !(window && window.calibrated)) {
          // Inventing bounds for unmeasured hardware is how a part ends up
          // looking calibrated when it never was — refuse instead.
          return { success: false, refused: true, reason: 'uncalibrated', partId, partName: part.name };
        }
        target = clampIntoWindow(target, lo, hi);
        const claim = claimServo(partId, OWNER, ORDER_PRIORITY);
        if (!claim.granted) {
          return { success: false, refused: true, reason: 'servo_busy', detail: `held by ${claim.previousOwner || 'another owner'}`, partId, partName: part.name };
        }
        try {
          const r = await hardware.controlPart(partId, 'moveToAngle', { angleDeg: target, duration }, { characterId });
          return { ...summarize(r), partId, partName: part.name, target };
        } finally {
          setTimeout(() => releaseServo(partId, OWNER), duration + 250);
        }
      }

      case 'linear_actuator': {
        if (verb === 'stop') {
          const r = await hardware.controlPart(partId, 'stop', {}, { characterId });
          return { ...summarize(r), partId, partName: part.name };
        }
        if (verb !== 'open' && verb !== 'close') {
          return { success: false, refused: true, reason: 'verb_object_mismatch', partId, partName: part.name };
        }
        const direction = verb === 'open' ? 'extend' : 'retract';
        if (direction === 'retract' && window && window.noRetractBelowMin) {
          return { success: false, refused: true, reason: 'no_retract_below_min', partId, partName: part.name };
        }
        const speed = typeof extras.speed === 'number' ? extras.speed : 60;
        const r = await hardware.controlPart(partId, direction, { speed, duration }, { characterId });
        return { ...summarize(r), partId, partName: part.name, direction };
      }

      case 'motor':
      case 'stepper': {
        if (verb === 'stop') {
          const r = await hardware.controlPart(partId, 'stop', {}, { characterId });
          return { ...summarize(r), partId, partName: part.name };
        }
        if (verb !== 'open' && verb !== 'close') {
          return { success: false, refused: true, reason: 'verb_object_mismatch', partId, partName: part.name };
        }
        const direction = verb === 'open' ? 'forward' : 'backward';
        const speed = typeof extras.speed === 'number' ? extras.speed : 50;
        const r = await hardware.controlPart(partId, 'control', { direction, speed, duration }, { characterId });
        // Belt and braces: a duration-capped motor must never run away even if
        // the wrapper's own timer dies with it.
        setTimeout(() => {
          hardware.controlPart(partId, 'stop', {}, { characterId }).catch(() => { });
        }, duration + 500);
        return { ...summarize(r), partId, partName: part.name, direction };
      }

      case 'light':
      case 'led': {
        let action;
        if (verb === 'on') action = 'turnOn';
        else if (verb === 'off') action = 'turnOff';
        else if (verb === 'toggle') action = 'toggle';
        else return { success: false, refused: true, reason: 'verb_object_mismatch', partId, partName: part.name };
        const params = action === 'turnOn' ? { brightness: extras.brightness ?? 100, duration: 0 } : {};
        const r = await hardware.controlPart(partId, action, params, { characterId });
        return { ...summarize(r), partId, partName: part.name, action };
      }

      case 'speaker': {
        if (verb === 'quiet' || verb === 'stop') {
          const r = await hardware.controlPart(partId, 'stop', {}, { characterId });
          return { ...summarize(r), partId, partName: part.name };
        }
        if (verb === 'play') {
          if (!extras.sound) {
            return { success: false, refused: true, reason: 'no_sound_configured', partId, partName: part.name };
          }
          const r = await hardware.controlPart(partId, 'play', { filename: extras.sound }, { characterId });
          return { ...summarize(r), partId, partName: part.name, sound: extras.sound };
        }
        return { success: false, refused: true, reason: 'verb_object_mismatch', partId, partName: part.name };
      }

      default:
        return { success: false, refused: true, reason: 'unsupported_part_type', partId, partName: part.name };
    }
  } catch (err) {
    return { success: false, error: err.message, partId, partName: part.name };
  }
}

function summarize(r) {
  if (!r) return { success: false, error: 'no result from hardware layer' };
  return {
    success: r.success !== false,
    error: r.error,
    safetyAdjustments: r.safetyAdjustments,
    clamped: r.clamped
  };
}

/**
 * Execute one matched order. Returns a result object for the history log and
 * the spoken acknowledgment. Never throws.
 */
export async function executeOrder(characterId, match, cfg = {}) {
  try {
    switch (match.kind) {
      case 'stop':
        return await stopEverything(characterId);

      case 'command': {
        const action = (match.command && match.command.action) || {};
        if (action.kind === 'stop') return await stopEverything(characterId);
        if (action.kind === 'pose') {
          return await executePoseOrder(characterId, action.poseId);
        }
        if (action.kind === 'gesture') {
          return await executeGestureOrder(characterId, action.gestureId);
        }
        if (action.kind === 'part') {
          const { loadPartsSafe } = await import('./followOrdersSuperPowerService.js');
          const raw = await loadPartsSafe(characterId);
          const p = raw.find(x => String(x.id) === String(action.partId));
          if (!p) return { success: false, refused: true, reason: 'unknown_part', detail: String(action.partId) };
          const part = {
            partId: String(p.id),
            type: String(p.type || '').replace(/-/g, '_'),
            name: p.name || '',
            markers: Array.isArray(p.markers) ? p.markers : []
          };
          const result = await executePartOrder(characterId, part, action.verb || 'open', cfg, {
            durationMs: action.durationMs, angle: action.angle, sound: action.sound
          });
          if (result.success) {
            recordBody(b => b.recordPartAction(characterId, part, { verb: action.verb || 'open', source: 'follow-orders' }));
          }
          return result;
        }
        return { success: false, refused: true, reason: 'unknown_command_kind', detail: action.kind };
      }

      case 'pose':
        return await executePoseOrder(characterId, match.poseId, match.poseName);

      case 'gesture':
        return await executeGestureOrder(characterId, match.gestureId);

      case 'part': {
        const result = await executePartOrder(characterId, match.part, match.verb, cfg, {});
        if (result.success) {
          recordBody(b => b.recordPartAction(characterId, match.part, { verb: match.verb, source: 'follow-orders' }));
        }
        return result;
      }

      default:
        return { success: false, refused: true, reason: 'unknown_match_kind', detail: match.kind };
    }
  } catch (err) {
    console.warn(`[FollowOrders] execute failed on character ${characterId}: ${err.message}`);
    return { success: false, error: err.message };
  }
}

async function executePoseOrder(characterId, poseId, poseName) {
  const { executePose } = await import('../poses/poseEngine.js');
  const result = await executePose({ characterId, poseId, options: {} });
  const success = result && result.success !== false;
  if (success) {
    recordBody(b => b.recordPose(characterId, poseName || `#${poseId}`, { source: 'follow-orders' }));
  }
  return { success, kind: 'pose', poseId, detail: result };
}

async function executeGestureOrder(characterId, gestureId) {
  const gestureEngine = await import('../gestureEngineService.js').then(m => m.default || m);
  const result = await gestureEngine.performGesture(characterId, gestureId);
  const success = !!(result && result.performed);
  if (success) {
    recordBody(b => b.recordGesture(characterId, gestureId, { source: 'follow-orders' }));
  }
  return { success, kind: 'gesture', gestureId, detail: result };
}

export default { executeOrder, stopEverything, OWNER, ORDER_PRIORITY };
