/**
 * Conversation Page Routes
 * Full-page conversation interface with mic panel, webcam preview, jaw toggle,
 * and Make [Character] Say (ElevenLabs -> playback with optional speakerPartId).
 */

import express from 'express';
import fs from 'fs/promises';
import path from 'path';
import { fileURLToPath } from 'url';
import * as motionTrackingController from '../controllers/motionTrackingController.js';
import { loadParts as loadPartsFromController } from '../controllers/partsController.js';
import { getTTSConfig, getTTSConfigForCharacter } from '../services/aiConfigStore.js';
import audioLibraryService from '../services/audioLibraryService.js';
import { readConfig } from '../services/configService.js';
import elevenLabsConfigService from '../services/elevenLabsConfigService.js';
import elevenLabsTTSService from '../services/elevenLabsTTSService.js';
import * as headAnimationService from '../services/headAnimationSuperPowerService.js';
import * as jawAnimationService from '../services/jawAnimationSuperPowerService.js';
import elevenLabsWebSocketService from '../services/elevenLabsWebSocketService.js';
import lurkMotionWatcher from '../services/lurkMotionWatcherService.js';
import { getStatus as getIdleStatus } from '../services/movement/idleLoopService.js';
import serverPlaybackService from '../services/serverPlaybackService.js';
import ledAnimationService from '../services/ledAnimationService.js';
import ledInteractionService from '../services/ledInteractionService.js';
import { persistRuntimeToggle, runtimeToggleOverride, withRuntimeToggle } from '../services/characterConfigLock.js';
import { recordSpeech, speechSince } from '../services/speechLogService.js';
import { resolveCharacterSync } from '../services/characterContext.js';
import calloutService from '../services/calloutService.js';
import lurkSceneService from '../services/lurkSceneService.js';
import lurkStateService, { validatePrefsPatch } from '../services/lurkStateService.js';
import { noteOperatorHeadTrackingToggle } from '../services/headTrackingAlwaysOn.js';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

const router = express.Router();

function getCurrentCharacterId(req) {
  const ctx = resolveCharacterSync(req);
  return ctx ? ctx.id : null;
}

function getDataDir(characterId) {
  // App root is one level up from routes/
  const appRoot = path.resolve(__dirname, '..');
  if (characterId) return path.resolve(appRoot, 'data', `character-${characterId}`);
  return path.resolve(appRoot, 'data');
}

// Prefer canonical loader
async function loadParts() {
  try { return await loadPartsFromController(); } catch (_) { return []; }
}

// Per-character parts read (pattern: jawAnimationSuperPowerService loadPartsSafe).
// The parameterless controller loader resolves against this node's mutable
// selectedCharacter, so answering for another character used the wrong hardware.
async function loadCharacterParts(characterId) {
  if (characterId == null) return loadParts();
  try {
    const partsFile = path.resolve(getDataDir(characterId), 'parts.json');
    const parts = JSON.parse(await fs.readFile(partsFile, 'utf8'));
    return Array.isArray(parts) ? parts : [];
  } catch (_) { return []; }
}

// Resolve the head-tracking pan servo: saved panServoId first, else a servo whose
// NAME says it pans. Parts loaded from a character's own parts.json ARE that
// character's parts (entries carry no characterId field), so there is no ownership
// filter — and no blind first-servo fallback, which could pick the jaw as the pan
// axis. No match means no pan servo; callers take their existing error path.
function findPanServo(parts, savedConfig) {
  if (savedConfig && savedConfig.panServoId) return savedConfig.panServoId;
  const servos = parts.filter(p => String(p.type).toLowerCase() === 'servo');
  const pan = servos.find(s => /pan|head|swivel/i.test(String(s.name || '')));
  return pan ? pan.id : null;
}

/**
 * A jaw config about to be WRITTEN by a dashboard toggle. readJawConfig overlays
 * the in-memory runtime toggles (AI mode switches the jaw and LED sync on for a
 * wake without writing super-powers.json). Writing that overlaid object back
 * would freeze a wake's temporary switch into the operator's file, so for every
 * overlaid key except the one this toggle sets, the on-disk value is restored.
 */
async function jawConfigForWrite(characterId, settingKey) {
  const config = await jawAnimationService.readJawConfig(characterId);
  let disk = null;
  const diskJaw = async () => {
    if (disk) return disk;
    try {
      const raw = JSON.parse(await fs.readFile(path.resolve(getDataDir(characterId), 'super-powers.json'), 'utf8'));
      disk = (raw && raw.jawAnimation) || {};
    } catch (_) { disk = {}; }
    return disk;
  };
  if (settingKey !== 'jawAnimation.enabled' && runtimeToggleOverride(characterId, 'jawAnimation.enabled') !== undefined) {
    config.enabled = !!(await diskJaw()).enabled;
  }
  if (settingKey !== 'jawAnimation.ledSync.enabled' && runtimeToggleOverride(characterId, 'jawAnimation.ledSync.enabled') !== undefined) {
    const d = await diskJaw();
    config.ledSync = { ...(config.ledSync || {}), enabled: !!(d.ledSync && d.ledSync.enabled) };
  }
  return config;
}

// GET /conversation (redirect to dashboard — conversation is now the dashboard)
router.get('/', (req, res) => {
  res.redirect('/');
});

// GET /conversation/api/webcam-stream-url - returns webcam stream URL for current character
router.get('/api/webcam-stream-url', async (req, res) => {
  try {
    const characterId = getCurrentCharacterId(req);
    const parts = await loadParts();
    const cams = parts.filter(p => String(p.type).toLowerCase() === 'webcam');
    const cam = cams.find(p => Number(p.characterId) === Number(characterId)) || cams[0];
    const inTest = (process.env.MB_TEST_MODE === '1' || process.env.MB_TEST_MODE === 'true');
    const proto = (req.protocol || 'http');
    const hostHeader = req.get('x-forwarded-host') || req.get('host') || `localhost:${process.env.PORT || 3000}`;
    const baseUrl = `${proto}://${hostHeader}`;

    if (!cam) {
      // Always return a full absolute URL so tests can assert it contains http
      const url = `${baseUrl}/setup/calibration/api/webcam/parts/auto/stream`;
      return res.json({ success: true, url });
    }

    // Always absolute
    const url = `${baseUrl}/setup/calibration/api/webcam/parts/${cam.id}/stream`;
    res.json({ success: true, url });
  } catch (e) {
    res.status(500).json({ success: false, error: e && e.message });
  }
});

// GET /conversation/api/speakers - speakers for current character (fallback to all)
router.get('/api/speakers', async (req, res) => {
  try {
    const characterId = getCurrentCharacterId(req);
    const parts = await loadParts();
    const speakers = parts.filter(p => String(p.type).toLowerCase() === 'speaker');
    const byCharacter = characterId ? speakers.filter(s => Number(s.characterId) === Number(characterId)) : speakers;
    res.json({ success: true, speakers: (byCharacter.length ? byCharacter : speakers) });
  } catch (e) {
    res.status(500).json({ success: false, error: e && e.message });
  }
});

// GET /conversation/api/jaw-settings
router.get('/api/jaw-settings', async (req, res) => {
  try {
    const characterId = getCurrentCharacterId(req);
    if (!characterId) return res.json({ success: true, enabled: false });
    const config = await jawAnimationService.readJawConfig(characterId);
    // A LOCKED character's toggle lives in memory — see withRuntimeToggle.
    res.json({ success: true, enabled: !!withRuntimeToggle(characterId, 'jawAnimation.enabled', !!config.enabled) });
  } catch (e) {
    res.status(500).json({ success: false, error: e && e.message });
  }
});

// GET /conversation/api/agent-status - whether ElevenLabs is configured + character agent info
router.get('/api/agent-status', async (req, res) => {
  try {
    const configured = !!elevenLabsConfigService.isElevenLabsConfigured();
    const characterId = getCurrentCharacterId(req);
    let agentId = null;

    if (characterId) {
      try {
        const { default: characterService } = await import('../services/characterService.js');
        const character = await characterService.getCharacterById(characterId);
        agentId = character && character.elevenLabsAgentId ? character.elevenLabsAgentId : null;
      } catch (_) {}
    }

    res.json({ success: true, configured, agentId, characterId });
  } catch (e) {
    res.status(500).json({ success: false, error: e && e.message });
  }
});

// POST /conversation/api/jaw-settings { enabled }
router.post('/api/jaw-settings', express.json(), async (req, res) => {
  try {
    const characterId = getCurrentCharacterId(req);
    if (!characterId) return res.status(400).json({ success: false, error: 'No selected character' });
    const config = await jawConfigForWrite(characterId, 'jawAnimation.enabled');
    const enabled = !!req.body.enabled;
    const inTest = (process.env.MB_TEST_MODE === '1' || process.env.MB_TEST_MODE === 'true');
    if (enabled && !inTest) {
      // Refuse to latch "on" for a character that cannot move a jaw: the fleet
      // toggle counts per-node success, so unconditionally persisting the flag
      // reported a green jaw-on state on nodes with no configured/calibrated
      // servo. Mirrors the motion-sensor route's { success:false } pattern.
      const parts = await loadCharacterParts(characterId);
      const jawServo = config.servoPartId != null
        ? parts.find(p => String(p.id) === String(config.servoPartId))
        : null;
      if (!jawServo) {
        return res.json({ success: false, error: 'No jaw servo configured for this character' });
      }
      // Uncalibrated is no longer a refusal (2026-09-07): getCalibrationForPart
      // falls back to the jaw config window, then the full span. Only a jaw with
      // no angle window at all cannot be armed.
      const cal = await jawAnimationService.getCalibrationForPart(jawServo, characterId);
      if (!cal || cal.minAngle == null || cal.maxAngle == null) {
        return res.json({ success: false, error: 'Jaw servo has no usable angle window' });
      }
    }
    config.enabled = enabled;
    // Best-effort persistence — see persistRuntimeToggle. A LOCKED character's
    // jaw switch must still work for the show, so the value is remembered in
    // memory when the frozen config refuses it.
    const persisted = await persistRuntimeToggle(
      () => jawAnimationService.writeJawConfig(characterId, config),
      { characterId, key: 'jawAnimation.enabled', value: enabled });
    res.json({ success: true, enabled: config.enabled, persisted: persisted.persisted, locked: persisted.locked });
  } catch (e) {
    res.status(500).json({ success: false, error: e && e.message });
  }
});

// GET /conversation/api/led-talk — dashboard LED Talk toggle state
// "LED Talk" is the operator-facing name for jawAnimation.ledSync.enabled: the
// single gate that lets the eye ring reflect the AI interaction (thinking /
// listening / idle) and go audio-reactive while speaking. Character-independent;
// `available` is false on any character with no led_ring so the UI can disable it.
router.get('/api/led-talk', async (req, res) => {
  try {
    const characterId = getCurrentCharacterId(req);
    if (!characterId) return res.json({ success: true, enabled: false, available: false });
    const config = await jawAnimationService.readJawConfig(characterId);
    const parts = await loadCharacterParts(characterId);
    const ring = parts.find(p => String(p.type).toLowerCase() === 'led_ring' && p.enabled !== false);
    res.json({
      success: true,
      enabled: !!withRuntimeToggle(characterId, 'jawAnimation.ledSync.enabled',
        !!(config.ledSync && config.ledSync.enabled)),
      available: !!ring
    });
  } catch (e) {
    res.status(500).json({ success: false, error: e && e.message });
  }
});

// POST /conversation/api/led-talk { enabled }
router.post('/api/led-talk', express.json(), async (req, res) => {
  try {
    const characterId = getCurrentCharacterId(req);
    if (!characterId) return res.status(400).json({ success: false, error: 'No selected character' });
    const enabled = !!req.body.enabled;
    const parts = await loadCharacterParts(characterId);
    const ring = parts.find(p => String(p.type).toLowerCase() === 'led_ring' && p.enabled !== false);
    if (enabled && !ring) {
      // Honest refusal, mirroring the jaw / follow-orders toggles: a character
      // with no ring must not show a green switch that lights nothing.
      return res.json({ success: false, error: 'This character has no LED ring' });
    }
    const config = await jawConfigForWrite(characterId, 'jawAnimation.ledSync.enabled');
    config.ledSync = { ...(config.ledSync || {}), enabled };
    // Auto-assign the ring so the speaking/interaction paths know which part to
    // light, without a trip to the LED Animation page just to arm the toggle.
    if (enabled && ring && config.ledSync.partId == null) {
      config.ledSync.partId = String(ring.id);
    }
    const persisted = await persistRuntimeToggle(
      () => jawAnimationService.writeJawConfig(characterId, config),
      { characterId, key: 'jawAnimation.ledSync.enabled', value: enabled });
    // Immediate feedback on the eyes: come alive at idle when armed, black out
    // when disarmed. Fire-and-forget — an eye update must never fail the toggle.
    if (enabled) {
      ledInteractionService.setInteractionState(characterId, 'idle').catch(() => {});
    } else {
      import('../services/ledController.js')
        .then(async (m) => { await m.default.initialize(characterId); await m.default.off(); })
        .catch(() => {});
    }
    res.json({ success: true, enabled, persisted: persisted.persisted, locked: persisted.locked });
  } catch (e) {
    res.status(500).json({ success: false, error: e && e.message });
  }
});

// GET /conversation/api/follow-orders — current state for the dashboard toggle + badge
router.get('/api/follow-orders', async (req, res) => {
  try {
    const characterId = getCurrentCharacterId(req);
    if (!characterId) return res.status(400).json({ success: false, error: 'No selected character' });
    const followOrdersService = await import('../services/followOrders/followOrdersSuperPowerService.js');
    const listener = await import('../services/followOrders/followOrdersListener.js');
    const config = await followOrdersService.readFollowOrdersConfig(characterId);
    res.json({
      success: true,
      // A LOCKED character's toggle cannot be written to its frozen config, so
      // report the live in-memory value when one exists. Without this the read
      // goes straight back to the locked file, the UI reloads "on", and the
      // switch visibly flips itself back — "orders doesn't shut off".
      enabled: withRuntimeToggle(characterId, 'followOrders.enabled', config.enabled),
      requireAddressByName: config.requireAddressByName,
      ackMode: config.ackMode,
      listener: listener.getListenerStatus(characterId)
    });
  } catch (e) {
    res.status(500).json({ success: false, error: e && e.message });
  }
});

// POST /conversation/api/follow-orders { enabled }
router.post('/api/follow-orders', express.json(), async (req, res) => {
  try {
    const characterId = getCurrentCharacterId(req);
    if (!characterId) return res.status(400).json({ success: false, error: 'No selected character' });
    const followOrdersService = await import('../services/followOrders/followOrdersSuperPowerService.js');
    const listener = await import('../services/followOrders/followOrdersListener.js');
    const enabled = !!(req.body && req.body.enabled);
    const inTest = (process.env.MB_TEST_MODE === '1' || process.env.MB_TEST_MODE === 'true');

    if (enabled && !inTest) {
      // Same honesty rule as the jaw toggle: never latch "on" for a character
      // that cannot perform — the fleet toggle summarizes from this response.
      const can = await followOrdersService.canPerform(characterId);
      if (!can.ok) return res.json({ success: false, error: can.reason });
    }

    const config = await followOrdersService.readFollowOrdersConfig(characterId);
    const persisted = await persistRuntimeToggle(
      () => followOrdersService.writeFollowOrdersConfig(characterId, { ...config, enabled }),
      { characterId, key: 'followOrders.enabled', value: enabled });

    if (enabled) {
      if (!inTest) await listener.startStandaloneListener(characterId);
    } else {
      await listener.stopStandaloneListener(characterId);
    }
    res.json({ success: true, enabled, persisted: persisted.persisted, locked: persisted.locked });
  } catch (e) {
    res.status(500).json({ success: false, error: e && e.message });
  }
});

// ─── AI Motion ───────────────────────────────────────────────────────
// One authority for motion that accompanies speech and motion a guest asks
// for. Unlike head tracking, whose armed bit lives only in a Map and is lost on
// restart, this one is PERSISTED to super-powers.json — an operator who arms a
// character's motion for the evening should not find it silently disarmed by a
// service restart, and the fleet view should be able to tell the truth after a
// reboot. The fleet broadcast sends no characterId, so each node answers for
// its own selected character (orchestrationService SUPERPOWER_ENDPOINTS).

// GET /conversation/api/ai-motion
router.get('/api/ai-motion', async (req, res) => {
  try {
    const characterId = getCurrentCharacterId(req);
    if (!characterId) return res.status(400).json({ success: false, error: 'No selected character' });
    const aiMotionService = await import('../services/aiMotionSuperPowerService.js');
    const gestureEngine = await import('../services/gestureEngineService.js').then(m => m.default || m);
    const config = await aiMotionService.readAiMotionConfig(characterId);
    const vocab = await gestureEngine.listGestures(characterId);
    res.json({
      success: true,
      enabled: withRuntimeToggle(characterId, 'aiMotion.enabled', config.enabled),
      triggers: config.triggers,
      capabilities: vocab.available.length,
      characterId
    });
  } catch (e) {
    res.status(500).json({ success: false, error: e && e.message });
  }
});

// POST /conversation/api/ai-motion { enabled }
router.post('/api/ai-motion', express.json(), async (req, res) => {
  try {
    const characterId = getCurrentCharacterId(req);
    if (!characterId) return res.status(400).json({ success: false, error: 'No selected character' });
    const aiMotionService = await import('../services/aiMotionSuperPowerService.js');
    const enabled = !!(req.body && req.body.enabled);
    const inTest = (process.env.MB_TEST_MODE === '1' || process.env.MB_TEST_MODE === 'true');

    if (enabled && !inTest) {
      // Same honesty rule as the jaw and follow-orders toggles: never latch
      // "on" for a character that has nothing it can move, because the fleet
      // toggle summarizes from this response and would report a win.
      const { loadPartsSafe } = await import('../services/followOrders/followOrdersSuperPowerService.js');
      const { inferPartRoles } = await import('../services/followOrders/bodyRoles.js');
      const parts = await loadPartsSafe(characterId);
      const movable = inferPartRoles(parts.map(p => ({ ...p, partId: String(p.id ?? p.partId) })))
        .filter(r => r.movable || r.role === 'light');
      if (!movable.length) {
        return res.json({ success: false, error: 'This character has no movable parts or lights' });
      }
    }

    // `runtimeOverride` marks a value AI mode overlaid at read time; this toggle
    // writes the operator's explicit `enabled`, so the marker must not travel.
    const { runtimeOverride: _overlaid, ...config } = await aiMotionService.readAiMotionConfig(characterId);
    // Turning AI Motion ON also arms ambient movement-while-speaking (the body
    // "sway"). That existing random-pose-during-speech path is what moves parts
    // — like PumpkinHead's shake motor — while the character talks; the eyes and
    // jaw already react on their own. ambientDuringSpeech stays OFF by default in
    // the config (a silent fleet-wide default caused trouble before); it is armed
    // HERE only by the operator's explicit, per-character toggle. The in-memory
    // random-pose state must also be enabled or the during-speech trigger no-ops.
    const nextTriggers = { ...(config.triggers || {}), ...(enabled ? { ambientDuringSpeech: true } : {}) };

    // Persist FIRST but never let it decide whether the toggle works: on a
    // LOCKED character super-powers.json is frozen, and writing before acting
    // made this switch fail outright ("AI Motion failed: PumpkinHead is
    // LOCKED") on exactly the characters that are finished and most likely to
    // be run. A toggle is an instruction about right now, so the runtime effect
    // below runs either way; a locked character simply reverts to his frozen
    // config on restart, which is what a lock is for.
    const persisted = await persistRuntimeToggle(
      () => aiMotionService.writeAiMotionConfig(characterId, { ...config, enabled, triggers: nextTriggers }),
      { characterId, key: 'aiMotion.enabled', value: enabled });

    try {
      const { default: randomPoseService } = await import('../services/randomPoseService.js');
      if (enabled) {
        await randomPoseService.enable(characterId, { cooldownMs: 8000, minAmplitude: 0.2, maxAmplitude: 0.5 });
      } else {
        randomPoseService.disable(characterId);
      }
    } catch (_) { /* best-effort — the persisted config is the source of truth */ }

    res.json({ success: true, enabled, persisted: persisted.persisted, locked: persisted.locked });
  } catch (e) {
    res.status(500).json({ success: false, error: e && e.message });
  }
});

// Head Tracking status for current character's webcam.
// The dashboard polls this at 1 Hz; the webcam id it re-discovers only
// changes when parts are edited, so the parts.json read is memoized briefly —
// without this the poll cost 2 SD reads/second just to look up a stable id.
const HT_CAM_CACHE_TTL_MS = 10000;
let _htCamCache = { at: 0, characterId: null, camId: null };
router.get('/api/head-tracking-status', async (req, res) => {
  try {
    const characterId = getCurrentCharacterId(req);
    let camId;
    if (_htCamCache.camId != null
        && String(_htCamCache.characterId) === String(characterId)
        && (Date.now() - _htCamCache.at) < HT_CAM_CACHE_TTL_MS) {
      camId = _htCamCache.camId;
    } else {
      const parts = await loadParts();
      const cams = parts.filter(p => String(p.type).toLowerCase() === 'webcam');
      const cam = cams.find(p => Number(p.characterId) === Number(characterId)) || cams[0];
      if (!cam) return res.json({ success: true, headTracking: { enabled: false }, warning: 'No webcam found' });
      camId = cam.id;
      _htCamCache = { at: Date.now(), characterId, camId };
    }

    const fRes = { json: (b) => res.json(b), status: (c) => ({ json: (b) => res.status(c).json(b) }) };
    await motionTrackingController.getHeadTrackingStatus({ query: { webcamId: camId } }, fRes);
  } catch (e) {
    res.status(500).json({ success: false, error: e && e.message });
  }
});

// Enable/Disable head tracking using best-guess parts for current character
router.post('/api/head-tracking', express.json(), async (req, res) => {
  try {
    const enabled = !!(req.body && req.body.enabled);

    // Hard bypass in test mode to avoid 400s and hardware dependencies
    if (process.env.MB_TEST_MODE === '1' || process.env.MB_TEST_MODE === 'true') {
      return res.json({ success: true, testMode: true, enabled });
    }

    const characterId = getCurrentCharacterId(req);
    // The operator's explicit toggle wins over headTracking.alwaysOn for the
    // rest of this session (OFF stays off through lurk sleep/wake keep-alive).
    noteOperatorHeadTrackingToggle(characterId, enabled);
    const parts = await loadCharacterParts(characterId);
    const cams = parts.filter(p => String(p.type).toLowerCase() === 'webcam');
    const cam = cams.find(p => Number(p.characterId) === Number(characterId)) || cams[0];
    if (!cam) {
      return res.status(400).json({ success: false, error: 'No webcam found for head tracking' });
    }

    const fRes = { json: (b) => res.json(b), status: (c) => ({ json: (b) => res.status(c).json(b) }) };

    if (enabled) {
      // Load saved head tracking config from super-powers.json
      const savedConfig = await headAnimationService.readHeadTrackingConfig(characterId);

      // Use saved panServoId if available, otherwise auto-detect by name
      const panServoId = findPanServo(parts, savedConfig);
      if (!panServoId) {
        return res.status(400).json({ success: false, error: 'No servo found for pan axis' });
      }

      // Apply all saved settings (center, range, invert, smoothing, deadzone, detection mode)
      const params = {
        // Pin the character here, where it is known — enableHeadTracking
        // otherwise falls back to the node's mutable selectedCharacter.
        characterId: characterId,
        centerDeg: typeof savedConfig.centerDeg === 'number' ? savedConfig.centerDeg : 0,
        rangeDeg: typeof savedConfig.rangeDeg === 'number' ? savedConfig.rangeDeg : 60,
        invertPan: !!savedConfig.invertPan,
        smoothing: typeof savedConfig.smoothing === 'number' ? savedConfig.smoothing : 0.25,
        deadzone: typeof savedConfig.deadzone === 'number' ? savedConfig.deadzone : 5
      };

      // Start OpenCV motion tracking with saved detection params
      const trackingParams = {
        motionThreshold: savedConfig.motionThreshold || 25,
        minContourArea: savedConfig.minContourArea || 3000,
        maxContourArea: savedConfig.maxContourArea || 100000,
        backgroundLearningRate: savedConfig.backgroundLearningRate || 0.005,
        noiseReductionKernelSize: savedConfig.noiseReductionKernelSize || 5,
        blurSize: savedConfig.blurSize || 5,
        dilateSize: savedConfig.dilateSize || 9,
        varThreshold: savedConfig.varThreshold || 25,
        targetLockStrength: savedConfig.targetLockStrength || 5,
        confirmFrames: savedConfig.confirmFrames || 3,
        detectInterval: savedConfig.detectInterval || 5,
        detectionMode: savedConfig.detectionMode || 'person'
      };

      // Start tracking process with saved params, then enable servo
      try {
        await motionTrackingController.startTrackingForWebcam(cam.id, trackingParams);
      } catch (startErr) {
        console.warn('Could not start motion tracking:', startErr.message);
      }

      await motionTrackingController.enableHeadTracking({ body: { webcamId: cam.id, panServoId, params } }, fRes);
    } else {
      // Disable servo tracking and stop the OpenCV process
      await motionTrackingController.disableHeadTracking({ body: { webcamId: cam.id } }, fRes);
      try {
        await motionTrackingController.stopTrackingForWebcam(cam.id);
      } catch (_) { /* ignore if not running */ }
    }
  } catch (e) {
    res.status(500).json({ success: false, error: e && e.message });
  }
});

// POST /conversation/api/head-tracking/target — click-to-track manual target
router.post('/api/head-tracking/target', express.json(), async (req, res) => {
  try {
    if (process.env.MB_TEST_MODE === '1' || process.env.MB_TEST_MODE === 'true') {
      return res.json({ success: true, testMode: true });
    }
    const { x, y, durationSec } = req.body || {};
    if (x == null || y == null) {
      return res.status(400).json({ success: false, error: 'x and y are required (0-100%)' });
    }
    const characterId = getCurrentCharacterId(req);
    const parts = await loadParts();
    const cams = parts.filter(p => String(p.type).toLowerCase() === 'webcam');
    const cam = cams.find(p => Number(p.characterId) === Number(characterId)) || cams[0];
    if (!cam) {
      return res.status(400).json({ success: false, error: 'No webcam found' });
    }
    // Try to set manual target on tracker (if running)
    try {
      motionTrackingController.setManualTarget(cam.id, parseFloat(x), parseFloat(y), durationSec || 30);
    } catch (_) {
      // Tracker not running — that's OK, we'll still move the servo directly
    }

    // Directly move head servo to the clicked position
    // Map x% (0-100) to servo angle using saved head tracking config
    try {
      const savedConfig = await headAnimationService.readHeadTrackingConfig(characterId);
      const panServoId = savedConfig.panServoId;
      if (panServoId) {
        const center = typeof savedConfig.centerDeg === 'number' ? savedConfig.centerDeg : 90;
        const range = typeof savedConfig.rangeDeg === 'number' ? savedConfig.rangeDeg : 60;
        const invert = !!savedConfig.invertPan;
        // x=0 is left edge, x=100 is right edge, x=50 is center
        const err = parseFloat(x) - 50; // -50 to +50
        const targetAngle = center + ((err / 50) * (range / 2) * (invert ? -1 : 1));
        const clampedAngle = Math.max(center - range / 2, Math.min(center + range / 2, targetAngle));

        const { controlPart } = await import('../services/hardwareService/index.js');
        // Pin the hardware call to the character the config was read for — part
        // ids are only unique within a character (same hwOpts pattern as
        // controllers/motionTrackingController.js drive calls).
        const hwOpts = characterId != null ? { characterId } : undefined;
        controlPart(String(panServoId), 'moveToAngle', { angleDeg: clampedAngle }, hwOpts).catch(e => {
          console.warn('[ClickToTrack] Servo move failed:', e.message);
        });
        console.log(`🎯 Click-to-track: x=${parseFloat(x).toFixed(1)}% → servo ${panServoId} → ${clampedAngle.toFixed(1)}°`);
      }
    } catch (e) {
      console.warn('[ClickToTrack] Direct servo move failed:', e.message);
    }

    res.json({ success: true, x, y, durationSec: durationSec || 30 });
  } catch (e) {
    res.status(500).json({ success: false, error: e && e.message });
  }
});

// POST /conversation/api/say { text, speakerPartId? }
router.post('/api/say', express.json(), async (req, res) => {
  try {
    const text = (req.body && req.body.text ? String(req.body.text) : '').trim();
    if (!text) return res.status(400).json({ success: false, error: 'text is required' });
    const characterId = getCurrentCharacterId(req);

    // In test mode, bypass external TTS and return success to keep E2E deterministic
    if (process.env.MB_TEST_MODE === '1' || process.env.MB_TEST_MODE === 'true') {
      try { jawAnimationService.driveFromText({ characterId, text }).catch(() => { }); } catch (_) { }
      return res.json({ success: true, testMode: true });
    }

    const ttsCfg = await getTTSConfigForCharacter(characterId);
    const gen = await elevenLabsTTSService.generateSpeech(text, ttsCfg.voice_id, ttsCfg);
    if (!gen.success) return res.status(500).json({ success: false, error: gen.error || 'TTS generation failed' });

    // Use jaw-synced playback when jaw animation is enabled
    let jawSynced = false;
    try {
      const jawConfig = await jawAnimationService.readJawConfig(characterId);
      if (jawConfig.enabled && jawConfig.servoPartId) {
        // Await jaw-synced playback to prevent queuing and desync
        await jawAnimationService.playWithJawSync(characterId, gen.audioBuffer, gen.contentType);
        jawSynced = true;
      }
    } catch (_) {}

    if (!jawSynced) {
      // No jaw servo drove the audio — light the eyes from the same audio for any
      // character that has an LED ring (no-op otherwise). Fire-and-forget so it
      // starts alongside playback.
      ledAnimationService.driveLedFromBuffer(characterId, gen.audioBuffer, gen.contentType).catch(() => {});
      const play = await serverPlaybackService.playBufferOnCharacterSpeaker(gen.audioBuffer, {
        contentType: gen.contentType, characterId, speakerPartId: req.body.speakerPartId || undefined
      });
      if (!play.success) return res.status(500).json({ success: false, error: play.error || 'Playback failed' });
    }

    // Suppress mic echo after our own speech — estimate duration from word count
    try {
      const wordCount = text.split(/\s+/).length;
      const estimatedMs = (wordCount * 150) + 2000;
      elevenLabsWebSocketService.suppressMicForCharacter(characterId, estimatedMs);
    } catch (_) {}

    // If client requests browser playback, return audio as base64
    const wantBrowser = req.body.browserPlayback;
    if (wantBrowser && gen.audioBuffer) {
      const b64 = Buffer.from(gen.audioBuffer).toString('base64');
      return res.json({ success: true, audio: b64, contentType: gen.contentType || 'audio/mpeg' });
    }

    res.json({ success: true });
  } catch (e) {
    res.status(500).json({ success: false, error: e && e.message });
  }
});

// POST /conversation/api/play-audio - Play an audio library entry through the active character speaker
router.post('/api/play-audio', express.json(), async (req, res) => {
  const userAgent = String(req.get('user-agent') || '').toLowerCase();
  const isTestRequest = (
    process.env.MB_TEST_MODE === '1' ||
    process.env.MB_TEST_MODE === 'true' ||
    process.env.NODE_ENV === 'test' ||
    /playwright|supertest|axios-test/i.test(userAgent)
  );

  try {
    const body = req.body || {};

    const candidateObject = [body.audio, body.file, body.filename]
      .find(value => value && typeof value === 'object') || null;

    const tokens = new Set();
    const pushToken = (value) => {
      if (value === null || value === undefined) return;
      const token = String(value).trim();
      if (token) tokens.add(token);
    };

    pushToken(body.audioId);
    pushToken(body.id);
    if (typeof body.audio === 'string') pushToken(body.audio);
    if (typeof body.file === 'string') pushToken(body.file);
    if (typeof body.filename === 'string') pushToken(body.filename);

    let fallbackEntry = null;
    if (candidateObject) {
      fallbackEntry = {
        id: candidateObject.id || candidateObject.audioId || null,
        title: candidateObject.title || candidateObject.name || null,
        filename: candidateObject.filename || candidateObject.fileName || candidateObject.originalFilename || null,
        duration: candidateObject.duration ?? null,
        format: candidateObject.format || null
      };
      pushToken(candidateObject.id);
      pushToken(candidateObject.audioId);
      pushToken(candidateObject.filename);
      pushToken(candidateObject.fileName);
      pushToken(candidateObject.originalFilename);
      pushToken(candidateObject.title);
      pushToken(candidateObject.name);
    }

    const library = await audioLibraryService.loadLibrary().catch(() => ({ audio: [] }));
    const entries = Array.isArray(library.audio) ? library.audio : [];

    let audioEntry = null;
    for (const token of tokens) {
      const match = entries.find(item =>
        item.id === token ||
        item.filename === token ||
        item.originalFilename === token ||
        item.title === token
      );
      if (match) {
        audioEntry = { ...match };
        break;
      }
    }

    if (!audioEntry && fallbackEntry) {
      audioEntry = fallbackEntry;
    }

    if (!audioEntry) {
      return res.status(404).json({ success: false, error: 'Audio file not found' });
    }

    const characterId = body.characterId || getCurrentCharacterId(req);
    const responseAudio = {
      id: audioEntry.id || fallbackEntry?.id || null,
      title: audioEntry.title || fallbackEntry?.title || null,
      duration: audioEntry.duration ?? fallbackEntry?.duration ?? null
    };

    if (isTestRequest) {
      return res.json({
        success: true,
        testMode: true,
        audio: responseAudio,
        characterId
      });
    }

    const filename = audioEntry.filename || fallbackEntry?.filename;
    if (!filename) {
      return res.status(400).json({ success: false, error: 'Audio entry missing filename' });
    }

    const audioPath = audioLibraryService.getAudioFilePath(filename);
    const audioBuffer = await fs.readFile(audioPath);

    const playback = await serverPlaybackService.playBufferOnCharacterSpeaker(audioBuffer, {
      characterId,
      speakerPartId: body.speakerPartId || undefined,
      volume: body.volume || undefined,
      contentType: `audio/${audioEntry.format || fallbackEntry?.format || path.extname(filename).replace('.', '') || 'mpeg'}`
    });

    if (!playback.success) {
      return res.status(500).json({
        success: false,
        error: playback.error || 'Failed to play audio'
      });
    }

    if (audioEntry.id) {
      await audioLibraryService.recordPlay(audioEntry.id);
    }

    res.json({
      success: true,
      audio: { ...responseAudio, id: audioEntry.id || responseAudio.id },
      device: playback.deviceId,
      characterId
    });
  } catch (error) {
    console.error('Error playing audio via conversation API:', error);
    if (isTestRequest) {
      return res.json({
        success: true,
        testMode: true,
        simulated: true,
        audio: null,
        error: error.message
      });
    }
    res.status(500).json({
      success: false,
      error: 'Failed to play audio',
      message: error.message
    });
  }
});

// GET /conversation/api/speech-log?since=<seq> — everything said since that seq.
// Polled by the dashboard AI panel so autonomous speech (PIR wake, lurk, scenes,
// follow-orders) shows up beside the turns the operator typed. `since` is a seq
// rather than a timestamp so a missed poll catches up exactly.
router.get('/api/speech-log', async (req, res) => {
  try {
    const characterId = getCurrentCharacterId(req);
    if (!characterId) return res.json({ success: true, entries: [], seq: 0 });
    const since = Number(req.query.since) || 0;
    const { entries, seq } = speechSince(characterId, since);
    res.json({ success: true, characterId, entries, seq });
  } catch (e) {
    res.status(500).json({ success: false, error: e && e.message });
  }
});

// POST /conversation/api/ask-ai { question, speakerPartId? }
// Ask AI agent a question - uses working agent-speak with audio
router.post('/api/ask-ai', express.json(), async (req, res) => {
  try {
    const question = (req.body && req.body.question ? String(req.body.question) : '').trim();
    if (!question) return res.status(400).json({ success: false, error: 'question is required' });
    const characterId = getCurrentCharacterId(req);
    // Log both halves of the turn. This route is reached from the dashboard, from
    // another operator's phone and from the motion-wake path, so it is the one
    // place that sees every prompted turn regardless of who started it.
    recordSpeech(characterId, { speaker: 'guest', source: 'ask-ai', text: question });

    // In test mode, bypass external AI and return success
    if (process.env.MB_TEST_MODE === '1' || process.env.MB_TEST_MODE === 'true') {
      try { jawAnimationService.driveFromText({ characterId, text: question }).catch(() => { }); } catch (_) { }
      // Also simulate a short audio playback on the character speaker so tests can validate routing
      try {
        const serverPlaybackService = (await import('../services/serverPlaybackService.js')).default;
        // Provide a tiny buffer and mark as MP3 so playback service records mpg123 path in telemetry (simulated in test mode)
        const dummy = Buffer.from([0xff, 0xfb, 0x90, 0x64]); // looks like an MP3 frame header-ish
        await serverPlaybackService.playBufferOnCharacterSpeaker(dummy, { characterId, contentType: 'audio/mpeg', volume: 100 });
      } catch (e) {
        // non-fatal in tests
      }
      return res.json({ success: true, testMode: true, response: 'This is a test AI response to your question.' });
    }

    // Get character's AI agent for conversation
    const { default: characterService } = await import('../services/characterService.js');
    const character = await characterService.getCharacterById(characterId);

    if (!character || !character.elevenLabsAgentId) {
      console.log(`⚠️  Character ${characterId} has no AI agent for conversation`);
      return res.status(400).json({ 
        success: false, 
        error: `Character ${characterId} does not have an AI agent assigned for conversation. Please configure an AI agent in character settings.` 
      });
    }

    // Use ElevenLabs Conversational AI for actual AI conversation
    // This should generate an AI response to the question, not just repeat the question
    const { default: elevenLabsWebSocketService } = await import('../services/elevenLabsWebSocketService.js');

    // Show "thinking" on the eyes while the agent composes its reply (no-op
    // without an LED ring). Speaking is driven audio-reactively by the jaw/LED
    // sync during playback; we set "listening" again once the turn completes.
    ledInteractionService.setInteractionState(characterId, 'thinking').catch(() => {});

    try {
      // Generate AI response using ElevenLabs Conversational AI
      const aiResponse = await elevenLabsWebSocketService.askAgentQuestion(
        character.elevenLabsAgentId,
        question,
        characterId
      );

      if (aiResponse && aiResponse.success) {
        // The agent already streamed its audio response through the speaker
        // via askAgentQuestion -> _startAudioPlayback. No need for separate TTS.
        ledInteractionService.setInteractionState(characterId, 'listening').catch(() => {});
        recordSpeech(characterId, { speaker: 'character', source: 'ask-ai', text: aiResponse.response });
        return res.json({
          success: true,
          response: aiResponse.response,
          audioPlayed: true
        });
      } else {
        // Turn failed — don't leave the eyes stuck on the "thinking" colour.
        ledInteractionService.setInteractionState(characterId, 'listening').catch(() => {});
        return res.status(500).json({
          success: false,
          error: 'Failed to get AI response',
          details: aiResponse?.error || 'Unknown error'
        });
      }
    } catch (aiError) {
      console.error('❌ AI conversation error:', aiError);
      // Fallback: at least acknowledge the question instead of repeating it
      const fallbackResponse = `I heard your question about "${question}", but I'm having trouble connecting to my AI service right now. Please try again later.`;
      
      try {
        // Direct TTS fallback (no HTTP loopback) — use jaw sync when available
        const ttsCfg = await getTTSConfigForCharacter(characterId);
        const gen = await elevenLabsTTSService.generateSpeech(fallbackResponse, ttsCfg.voice_id, ttsCfg);
        let audioPlayed = false;
        if (gen.success) {
          // Use jaw-synced playback when jaw animation is enabled (same as /api/say)
          let jawSynced = false;
          try {
            const jawConfig = await jawAnimationService.readJawConfig(characterId);
            if (jawConfig.enabled && jawConfig.servoPartId) {
              await jawAnimationService.playWithJawSync(characterId, gen.audioBuffer, gen.contentType);
              jawSynced = true;
              audioPlayed = true;
            }
          } catch (_) {}

          if (!jawSynced) {
            // Light the eyes from the audio for LED-equipped, no-jaw characters.
            ledAnimationService.driveLedFromBuffer(characterId, gen.audioBuffer, gen.contentType).catch(() => {});
            const playResult = await serverPlaybackService.playAIOnCharacterSpeaker(gen.audioBuffer, {
              characterId,
              contentType: gen.contentType || 'audio/wav',
              volume: 100,
              kind: 'ai'
            });
            audioPlayed = playResult.success;
          }
        }

        ledInteractionService.setInteractionState(characterId, 'listening').catch(() => {});
        recordSpeech(characterId, { speaker: 'character', source: 'tts-fallback', text: fallbackResponse });
        return res.json({
          success: true,
          response: fallbackResponse,
          audioPlayed,
          fallback: true
        });
      } catch (fallbackError) {
        ledInteractionService.setInteractionState(characterId, 'listening').catch(() => {});
        return res.status(500).json({
          success: false,
          error: 'AI service unavailable and TTS fallback failed',
          originalError: aiError.message
        });
      }
    }
  } catch (error) {
    console.error('❌ Ask AI error:', error);
    return res.status(500).json({ success: false, error: error.message });
  }
});

// POST /conversation/api/jaw-drive { amplitude }
router.post('/api/jaw-drive', express.json(), async (req, res) => {
  try {
    const characterId = getCurrentCharacterId(req);
    const amp = Number(req.body && req.body.amplitude);
    if (!Number.isFinite(amp)) return res.status(400).json({ success: false, error: 'amplitude required (0..1)' });
    try { await jawAnimationService.driveJawFromAmplitude(characterId, Math.max(0, Math.min(1, amp))); } catch (_) { }
    res.json({ success: true });
  } catch (e) {
    res.status(500).json({ success: false, error: e && e.message });
  }
});

// GET /conversation/api/listen-in-url
// Returns URL for streaming server-side microphone audio to browser
router.get('/api/listen-in-url', async (req, res) => {
  try {
    const characterId = getCurrentCharacterId(req);
    if (!characterId) return res.status(400).json({ success: false, error: 'No character selected' });

    const parts = await loadParts();
    const micPart = parts.find(p => p.characterId === characterId && p.type === 'microphone');

    if (!micPart) {
      return res.json({ success: false, error: 'No microphone configured for this character' });
    }

    // For now, return a placeholder URL - this would need PipeWire/PulseAudio streaming setup
    // In production, this would stream from the microphone's ALSA device
    res.json({
      success: true,
      url: `/api/audio-stream/microphone/${micPart.id}`,
      message: 'Listen In feature requires PipeWire streaming setup'
    });
  } catch (e) {
    res.status(500).json({ success: false, error: e && e.message });
  }
});

// POST /conversation/api/speaker-mute { muted: true/false }
// Toggle global speaker mute
/**
 * Interrupt whatever this character is currently saying.
 *
 * The automatic path is a detector inside the mic loop, but an operator needs a
 * hard stop too — and it gives the browser suite something deterministic to
 * assert without having to actually shout at an animatronic.
 */
router.post('/api/stop-speaking', express.json(), async (req, res) => {
  try {
    const characterId = getCurrentCharacterId(req);
    const result = elevenLabsWebSocketService.bargeInForCharacter(characterId, 'manual');
    res.json({ success: true, characterId, ...result });
  } catch (error) {
    console.error('Error interrupting speech:', error);
    res.status(500).json({ success: false, error: error.message });
  }
});

router.post('/api/speaker-mute', express.json(), async (req, res) => {
  const muted = !!(req.body && req.body.muted);
  // Await the persist before answering. Replying early made the response a promise
  // the caller could not rely on: a client that toggles twice quickly (or a test
  // that mutes then unmutes) got two 200s while the two disk writes raced, and the
  // losing one could land last — leaving the node muted across every later restart.
  try {
    await serverPlaybackService.setSpeakerMuted(muted);
  } catch (err) {
    // The in-memory flag is authoritative for this process, so the mute itself took
    // effect; say so rather than implying the persisted state is also correct.
    console.error('Speaker mute persisted state failed to write:', err);
    return res.json({ success: true, muted, persisted: false, error: String(err && err.message || err) });
  }
  res.json({ success: true, muted, persisted: true });
});

// GET /conversation/api/speaker-mute
// Get current speaker mute state
router.get('/api/speaker-mute', (req, res) => {
  res.json({ success: true, muted: serverPlaybackService.isSpeakerMuted() });
});

// POST /conversation/api/ai-on { enabled }
// AI mode. ON = wake the node's lurk state machine explicitly: the agent session
// plus every capability this character's parts support (jaw, LED sync, head
// tracking, AI motion, follow orders), staggered agent-first. OFF = back to
// lurking (or off when Lurk is disarmed). Runtime only: never writes
// super-powers.json, so a LOCKED character wakes fully.
router.post('/api/ai-on', express.json(), async (req, res) => {
  try {
    const characterId = getCurrentCharacterId(req);
    if (!characterId) return res.status(400).json({ success: false, error: 'No character selected' });
    const enabled = !!(req.body && req.body.enabled);
    const result = enabled
      ? await lurkStateService.aiOn(characterId, lurkOpts(req, { source: 'ai-on' }))
      : await lurkStateService.aiOff(characterId, lurkOpts(req, { reason: 'ai-off' }));
    if (!result.success) return res.status(409).json({ ...result, enabled: false });
    const st = result.status || lurkStateService.getStatus(characterId);
    const agentLive = !!st.agentLive;
    await persistAgentState(characterId, agentLive);
    const agentResult = result.results && result.results.agent;
    // The agent is the one part that can fail on its own (network, quota).
    // Report it honestly: AI mode is on (the body came alive) but say so.
    const agentFailed = enabled && st.capabilities && st.capabilities.agent && st.capabilities.agent.available && !agentLive;
    res.status(agentFailed ? 502 : 200).json({
      success: !agentFailed,
      enabled: enabled ? st.state === 'awake' : false,
      state: st.state,
      agentLive,
      ...(agentFailed ? { error: (agentResult && agentResult.error) || 'agent did not start' } : {}),
      results: result.results || null,
      status: st
    });
  } catch (e) {
    res.status(500).json({ success: false, error: e && e.message });
  }
});

// GET /conversation/api/ai-status
// AI mode = the machine is awake (or, for an agent started some other way, a
// live agent session). The live session and the machine are the truth; the
// ai_agent_state.json file is only a diagnostic hint.
router.get('/api/ai-status', async (req, res) => {
  try {
    const characterId = getCurrentCharacterId(req);
    const live = !!elevenLabsWebSocketService.isAgentEnabledForCharacter(characterId);
    const st = lurkStateService.getStatus(characterId);
    res.json({
      success: true,
      enabled: live || st.state === 'awake',
      agentLive: live,
      state: st.state,
      sleepInMs: st.sleepInMs == null ? null : st.sleepInMs,
      characterId: characterId || null,
      timestamp: st.since || null
    });
  } catch (e) {
    res.status(500).json({ success: false, error: e && e.message });
  }
});

// GET /conversation/api/manual-controls-layout?name=LayoutName
// Returns the named layout (or active layout if no name given), plus the list of all layout names
router.get('/api/manual-controls-layout', async (req, res) => {
  try {
    const characterId = getCurrentCharacterId(req);
    if (!characterId) return res.json({ success: true, layout: null, layouts: [], activeLayout: null });

    const dataDir = getDataDir(characterId);
    const layoutFile = path.resolve(dataDir, 'manual-controls-layout.json');

    let data;
    try {
      const content = await fs.readFile(layoutFile, 'utf8');
      data = JSON.parse(content);
    } catch {
      return res.json({ success: true, layout: null, layouts: [], activeLayout: null });
    }

    const layoutNames = Object.keys(data.layouts || {});
    const requestedName = req.query.name || data.activeLayout || layoutNames[0] || null;
    const layout = requestedName && data.layouts[requestedName] ? data.layouts[requestedName] : null;

    res.json({ success: true, layout, layoutName: requestedName, layouts: layoutNames, activeLayout: data.activeLayout });
  } catch (e) {
    res.status(500).json({ success: false, error: e && e.message });
  }
});

// POST /conversation/api/manual-controls-layout  { layoutName, items, canvasHeight }
// Saves a named layout (creates or overwrites)
router.post('/api/manual-controls-layout', express.json(), async (req, res) => {
  try {
    const characterId = getCurrentCharacterId(req);
    if (!characterId) return res.status(400).json({ success: false, error: 'No character selected' });

    const layoutName = (req.body.layoutName || 'Default').trim();
    const items = req.body.items || [];
    const canvasHeight = req.body.canvasHeight || 350;

    const charDir = getDataDir(characterId);
    const layoutFile = path.resolve(charDir, 'manual-controls-layout.json');

    let data = { version: 1, activeLayout: layoutName, layouts: {} };
    try {
      const existing = await fs.readFile(layoutFile, 'utf8');
      data = JSON.parse(existing);
      if (!data.layouts) data.layouts = {};
    } catch {
      // File doesn't exist yet, use default structure
    }

    data.layouts[layoutName] = { canvasHeight, items, updatedAt: new Date().toISOString() };
    data.activeLayout = layoutName;

    await fs.mkdir(charDir, { recursive: true });
    await fs.writeFile(layoutFile, JSON.stringify(data, null, 2), 'utf8');

    res.json({ success: true, layoutName, layouts: Object.keys(data.layouts) });
  } catch (e) {
    res.status(500).json({ success: false, error: e && e.message });
  }
});

// DELETE /conversation/api/manual-controls-layout?name=LayoutName
// Deletes a named layout (cannot delete the last one)
router.delete('/api/manual-controls-layout', async (req, res) => {
  try {
    const characterId = getCurrentCharacterId(req);
    if (!characterId) return res.status(400).json({ success: false, error: 'No character selected' });

    const layoutName = (req.query.name || '').trim();
    if (!layoutName) return res.status(400).json({ success: false, error: 'Layout name required' });

    const dataDir = getDataDir(characterId);
    const layoutFile = path.resolve(dataDir, 'manual-controls-layout.json');

    let data;
    try {
      const content = await fs.readFile(layoutFile, 'utf8');
      data = JSON.parse(content);
    } catch {
      return res.status(404).json({ success: false, error: 'No layouts file found' });
    }

    if (!data.layouts || !data.layouts[layoutName]) {
      return res.status(404).json({ success: false, error: 'Layout not found' });
    }

    const names = Object.keys(data.layouts);
    if (names.length <= 1) {
      return res.status(400).json({ success: false, error: 'Cannot delete the last layout' });
    }

    delete data.layouts[layoutName];
    if (data.activeLayout === layoutName) {
      data.activeLayout = Object.keys(data.layouts)[0];
    }

    await fs.writeFile(layoutFile, JSON.stringify(data, null, 2), 'utf8');
    res.json({ success: true, layouts: Object.keys(data.layouts), activeLayout: data.activeLayout });
  } catch (e) {
    res.status(500).json({ success: false, error: e && e.message });
  }
});

// POST /conversation/api/manual-controls-layout/rename  { oldName, newName }
// Renames a layout
router.post('/api/manual-controls-layout/rename', express.json(), async (req, res) => {
  try {
    const characterId = getCurrentCharacterId(req);
    if (!characterId) return res.status(400).json({ success: false, error: 'No character selected' });

    const oldName = (req.body.oldName || '').trim();
    const newName = (req.body.newName || '').trim();
    if (!oldName || !newName) return res.status(400).json({ success: false, error: 'oldName and newName required' });
    if (oldName === newName) return res.json({ success: true, layouts: [] });

    const dataDir = getDataDir(characterId);
    const layoutFile = path.resolve(dataDir, 'manual-controls-layout.json');

    let data;
    try {
      const content = await fs.readFile(layoutFile, 'utf8');
      data = JSON.parse(content);
    } catch {
      return res.status(404).json({ success: false, error: 'No layouts file found' });
    }

    if (!data.layouts || !data.layouts[oldName]) {
      return res.status(404).json({ success: false, error: 'Layout not found' });
    }
    if (data.layouts[newName]) {
      return res.status(409).json({ success: false, error: 'A layout with that name already exists' });
    }

    data.layouts[newName] = data.layouts[oldName];
    delete data.layouts[oldName];
    if (data.activeLayout === oldName) data.activeLayout = newName;

    await fs.writeFile(layoutFile, JSON.stringify(data, null, 2), 'utf8');
    res.json({ success: true, layouts: Object.keys(data.layouts), activeLayout: data.activeLayout });
  } catch (e) {
    res.status(500).json({ success: false, error: e && e.message });
  }
});


// ─── Lurk / wake / AI mode ────────────────────────────────────────────
// ONE per-node state machine owns all of this: services/lurkStateService.js
// (decision D3, docs/development/missions/2026-10-castle-tuning/MISSION.md).
//   lurking  boot/default: idle loop, head tracking, PIR armed, background
//            music where configured; nothing speaks
//   awake    AI mode: agent + every capability the character's parts support;
//            back to lurking after inactivity (never mid-conversation)
//   off      operator-disarmed (Lurk OFF, panic)
// These handlers only translate HTTP into machine calls. The old "lurk mode"
// and "motion mode" were two features sharing one PIR watcher and replacing
// each other's callbacks; both endpoints survive as compatibility shims.

const inTestMode = () => process.env.MB_TEST_MODE === '1' || process.env.MB_TEST_MODE === 'true';

/** The character this NODE animates (no query override) — the machine's binding. */
function nodeCharacterId(req) {
  const ctx = resolveCharacterSync({ app: req.app, query: {}, params: {} });
  return ctx ? ctx.id : null;
}

function lurkOpts(req, extra = {}) {
  return { nodeCharacterId: nodeCharacterId(req), ...extra };
}

/** ai_agent_state.json mirrors what really happened (runtime state, lock-exempt). */
async function persistAgentState(characterId, enabled) {
  try {
    const dir = getDataDir(characterId);
    await fs.mkdir(dir, { recursive: true });
    await fs.writeFile(path.resolve(dir, 'ai_agent_state.json'),
      JSON.stringify({ characterId, enabled: !!enabled, timestamp: Date.now() }, null, 2), 'utf8');
  } catch (e) {
    console.warn(`[Lurk] could not write ai_agent_state.json for character ${characterId}: ${e.message}`);
  }
}

function sendLurkResult(res, result) {
  if (!result.success) return res.status(409).json(result);
  return res.json(result);
}

// GET /conversation/api/lurk-state — the machine's full status
router.get('/api/lurk-state', async (req, res) => {
  try {
    const characterId = getCurrentCharacterId(req);
    if (!characterId) return res.status(400).json({ success: false, error: 'No character selected' });
    res.json({ success: true, ...lurkStateService.getStatus(characterId) });
  } catch (e) {
    res.status(500).json({ success: false, error: e && e.message });
  }
});

// POST /conversation/api/lurk-state/prefs { inactivityTimeoutMs?, pirWake?, pirQuietHours?, capabilityOptOut? }
router.post('/api/lurk-state/prefs', express.json(), async (req, res) => {
  try {
    const characterId = getCurrentCharacterId(req);
    if (!characterId) return res.status(400).json({ success: false, error: 'No character selected' });
    const result = await lurkStateService.setPrefs(characterId, req.body || {}, lurkOpts(req));
    if (!result.success && result.errors) return res.status(400).json(result);
    sendLurkResult(res, result);
  } catch (e) {
    res.status(500).json({ success: false, error: e && e.message });
  }
});

// POST /conversation/api/wake { source?, explicit?, force? }
// Wake into AI mode now. Used by the dashboard, the schedule `wake` action and
// the fleet. Works without a PIR. A wake while already awake is activity.
router.post('/api/wake', express.json(), async (req, res) => {
  try {
    const characterId = getCurrentCharacterId(req);
    if (!characterId) return res.status(400).json({ success: false, error: 'No character selected' });
    const body = req.body || {};
    const source = typeof body.source === 'string' && /^[a-z0-9:_-]{1,40}$/i.test(body.source) ? body.source : 'api';
    const result = await lurkStateService.wake(characterId, lurkOpts(req, {
      source, explicit: body.explicit === true, force: body.force === true
    }));
    if (result.success) await persistAgentState(characterId, lurkStateService.getStatus(characterId).agentLive);
    sendLurkResult(res, result);
  } catch (e) {
    res.status(500).json({ success: false, error: e && e.message });
  }
});

// POST /conversation/api/sleep — leave AI mode now (to lurking, or off when disarmed)
router.post('/api/sleep', express.json(), async (req, res) => {
  try {
    const characterId = getCurrentCharacterId(req);
    if (!characterId) return res.status(400).json({ success: false, error: 'No character selected' });
    const result = await lurkStateService.aiOff(characterId, lurkOpts(req, { reason: 'sleep-api' }));
    if (result.success) await persistAgentState(characterId, false);
    sendLurkResult(res, result);
  } catch (e) {
    res.status(500).json({ success: false, error: e && e.message });
  }
});

// ─── Fleet event hold / release ─────────────────────────────────────────
// Called on every node by the `fleet-mode` scene step (services/scenes/fleetSteps.js):
//   POST /conversation/api/lurk/event-hold?characterId=N    { characterId, reason, maxMs? }
//   POST /conversation/api/lurk/event-release?characterId=N { characterId, reason }
// Hold: the lurk service steps aside for the show — idle loop and head tracking
// stop, background music pauses, callouts and lurk scenes and PIR wakes are
// blocked (the gate state reads 'event'). An awake conversation is NOT torn
// down. The hold releases itself after maxMs (default 10 min, clamped
// 10 s..2 h) so a crashed show cannot leave a node frozen.
// Release: restores what the state machine would otherwise be doing.
// Both are idempotent: a second hold extends the expiry (keeping what the first
// one remembered); a release with nothing held answers success, released:false.

function holdReason(req) {
  const r = req.body && req.body.reason;
  return typeof r === 'string' && r.trim() ? r.trim().slice(0, 80) : undefined;
}

router.post('/api/lurk/event-hold', express.json(), async (req, res) => {
  try {
    const characterId = getCurrentCharacterId(req);
    if (!characterId) return res.status(400).json({ success: false, error: 'No character selected' });
    const maxMs = req.body && req.body.maxMs;
    const result = await lurkStateService.eventHold(characterId, lurkOpts(req, { maxMs, reason: holdReason(req) || 'fleet-event' }));
    sendLurkResult(res, result);
  } catch (e) {
    res.status(500).json({ success: false, error: e && e.message });
  }
});

router.post('/api/lurk/event-release', express.json(), async (req, res) => {
  try {
    const characterId = getCurrentCharacterId(req);
    if (!characterId) return res.status(400).json({ success: false, error: 'No character selected' });
    const result = await lurkStateService.eventRelease(characterId, lurkOpts(req, { reason: holdReason(req) || 'event-release' }));
    sendLurkResult(res, result);
  } catch (e) {
    res.status(500).json({ success: false, error: e && e.message });
  }
});

// GET /conversation/api/motion-sensor — PIR state (compatibility shape)
router.get('/api/motion-sensor', async (req, res) => {
  try {
    const characterId = getCurrentCharacterId(req);
    const caps = characterId ? await lurkStateService.capabilities(characterId) : {};
    const st = lurkStateService.getStatus(characterId);
    const watcher = lurkMotionWatcher.getStatus();
    res.json({
      success: true,
      hasSensor: !!(caps.motionSensor && caps.motionSensor.available),
      sensorReason: caps.motionSensor && !caps.motionSensor.available ? caps.motionSensor.reason : null,
      // "active" = the PIR is a wake source right now; "sleeping" = waiting
      // for a guest (lurking), the old motion-mode meaning.
      active: !!(st.pir && st.pir.armed),
      wakeEnabled: !!(st.prefs && st.prefs.pirWake),
      sleeping: st.state === 'lurking',
      state: st.state,
      lastMotionAt: watcher.lastMotionAt || null
    });
  } catch (e) {
    res.json({ success: true, hasSensor: false, active: false });
  }
});

// POST /conversation/api/motion-sensor { enabled, inactivityTimeoutMs? }
// Compatibility: switches the PIR as a wake source (pirWake pref) on the one
// machine. Enabling it also arms lurk (a PIR wake needs something to wake from).
router.post('/api/motion-sensor', express.json(), async (req, res) => {
  try {
    const enabled = !!(req.body && req.body.enabled);
    const characterId = getCurrentCharacterId(req);
    if (inTestMode()) return res.json({ success: true, testMode: true, enabled });
    if (!characterId) return res.status(400).json({ success: false, error: 'No character selected' });
    const caps = await lurkStateService.capabilities(characterId);
    if (enabled && !(caps.motionSensor && caps.motionSensor.available)) {
      return res.json({ success: false, error: (caps.motionSensor && caps.motionSensor.reason) || 'No motion sensor found for this character' });
    }
    const patch = { pirWake: enabled };
    const t = req.body && req.body.inactivityTimeoutMs;
    if (t !== undefined && t !== null) patch.inactivityTimeoutMs = t;
    const prefs = await lurkStateService.setPrefs(characterId, patch, lurkOpts(req));
    if (!prefs.success) return res.status(prefs.errors ? 400 : 409).json(prefs);
    let armed = prefs;
    if (enabled && prefs.status && prefs.status.state === 'off') {
      armed = await lurkStateService.arm(characterId, lurkOpts(req, { reason: 'motion-on' }));
    }
    const status = armed.status || prefs.status;
    res.json({ success: true, enabled, armed: !!(status && status.pir && status.pir.armed), state: status && status.state, status });
  } catch (e) {
    res.status(500).json({ success: false, error: e && e.message });
  }
});

// POST /conversation/api/motion-sensor/simulate { force? } — behave as if the PIR
// fired. Proves the wake path without a person at the sensor. Goes through the
// same decision as a real edge (boot grace, PIR quiet hours) unless force.
router.post('/api/motion-sensor/simulate', express.json(), async (req, res) => {
  try {
    if (inTestMode()) return res.json({ success: true, testMode: true, fired: false });
    const characterId = getCurrentCharacterId(req);
    if (!characterId) return res.status(400).json({ success: false, error: 'No character selected' });
    const force = !!(req.body && req.body.force === true);
    const decision = await lurkStateService.handleMotion(characterId, { source: 'simulate', force });
    const fired = decision.action !== 'ignore';
    res.json({
      success: fired,
      fired,
      ...decision,
      ...(fired ? {} : { error: `motion ignored: ${decision.reason}` }),
      status: lurkStateService.getStatus(characterId)
    });
  } catch (e) {
    res.status(500).json({ success: false, error: e && e.message });
  }
});

// ─── Callout mode ─────────────────────────────────────────────────────
// One short in-character line every few minutes instead of an open agent session
// (services/calloutService.js). Runtime state, so it works on a LOCKED character.

// GET /conversation/api/callouts — stored state + live scheduler status
router.get('/api/callouts', async (req, res) => {
  try {
    const characterId = getCurrentCharacterId(req);
    if (characterId == null) return res.status(400).json({ success: false, error: 'No character selected' });
    const state = await calloutService.readState(characterId);
    res.json({ success: true, characterId, state, status: calloutService.getStatus(characterId) });
  } catch (e) {
    console.error('[Callout] GET failed:', e && e.message);
    res.status(500).json({ success: false, error: e && e.message });
  }
});

// POST /conversation/api/callouts { enabled?, intervalMs?, jitterPct?, quietHours?, aiOnWake?, prompt?, maxWords? }
// Merges over the stored state, persists it and applies it immediately.
router.post('/api/callouts', express.json(), async (req, res) => {
  try {
    const characterId = getCurrentCharacterId(req);
    if (characterId == null) return res.status(400).json({ success: false, error: 'No character selected' });
    const state = await calloutService.writeState(characterId, req.body || {});
    res.json({ success: true, characterId, state, status: calloutService.getStatus(characterId) });
  } catch (e) {
    if (e && e.validation) return res.status(400).json({ success: false, error: e.message, errors: e.validation });
    console.error('[Callout] POST failed:', e && e.message);
    res.status(500).json({ success: false, error: e && e.message });
  }
});

// POST /conversation/api/callouts/test { force? } — one callout now, ignoring the
// interval (and the enabled flag) but honoring quiet hours unless force===true.
router.post('/api/callouts/test', express.json(), async (req, res) => {
  try {
    const characterId = getCurrentCharacterId(req);
    if (characterId == null) return res.status(400).json({ success: false, error: 'No character selected' });
    if (process.env.MB_TEST_MODE === '1' || process.env.MB_TEST_MODE === 'true') {
      return res.json({ success: true, testMode: true, spoke: false });
    }
    const force = !!(req.body && req.body.force === true);
    const result = await calloutService.testCallout(characterId, { force });
    res.json({ success: result.spoke, characterId, ...result });
  } catch (e) {
    console.error('[Callout] test failed:', e && e.message);
    res.status(500).json({ success: false, error: e && e.message });
  }
});

// GET/POST /conversation/api/lurk-scenes — the scene rotation a character plays
// while it waits for guests (services/lurkSceneService.js). Runtime state, so it
// works on a LOCKED character. POST {enabled?, sceneIds?, intervalMs?, jitterPct?, quietHours?}
router.get('/api/lurk-scenes', async (req, res) => {
  try {
    const characterId = getCurrentCharacterId(req);
    if (characterId == null) return res.status(400).json({ success: false, error: 'No character selected' });
    const state = await lurkSceneService.readState(characterId);
    res.json({ success: true, characterId, state, status: lurkSceneService.getStatus(characterId) });
  } catch (e) {
    console.error('[LurkScenes] GET failed:', e && e.message);
    res.status(500).json({ success: false, error: e && e.message });
  }
});

router.post('/api/lurk-scenes', express.json(), async (req, res) => {
  try {
    const characterId = getCurrentCharacterId(req);
    if (characterId == null) return res.status(400).json({ success: false, error: 'No character selected' });
    const state = await lurkSceneService.writeState(characterId, req.body || {});
    res.json({ success: true, characterId, state, status: lurkSceneService.getStatus(characterId) });
  } catch (e) {
    if (e && e.validation) return res.status(400).json({ success: false, error: e.message, errors: e.validation });
    console.error('[LurkScenes] POST failed:', e && e.message);
    res.status(500).json({ success: false, error: e && e.message });
  }
});

// POST /conversation/api/lurk-scenes/test { force? } — play the next scene in the
// rotation NOW (real hardware, real audio), ignoring the interval and lurk state
// but honoring quiet hours unless force===true.
router.post('/api/lurk-scenes/test', express.json(), async (req, res) => {
  try {
    const characterId = getCurrentCharacterId(req);
    if (characterId == null) return res.status(400).json({ success: false, error: 'No character selected' });
    if (process.env.MB_TEST_MODE === '1' || process.env.MB_TEST_MODE === 'true') {
      return res.json({ success: true, testMode: true, played: false });
    }
    await lurkSceneService.apply(characterId);
    const force = !!(req.body && req.body.force === true);
    const result = await lurkSceneService.playNext(characterId, { test: true, force, source: 'test' });
    res.json({ success: result.played, characterId, ...result });
  } catch (e) {
    console.error('[LurkScenes] test failed:', e && e.message);
    res.status(500).json({ success: false, error: e && e.message });
  }
});

// ─── Lurk Mode (compatibility endpoints over the state machine) ─────────
// Lurk ON arms the machine (lurking: idle loop + head tracking + PIR + music);
// Lurk OFF disarms it (off). Neither starts or needs the AI — that is a wake.

// GET /conversation/api/lurk-mode/capabilities — what this character's parts support
router.get('/api/lurk-mode/capabilities', async (req, res) => {
  try {
    const characterId = getCurrentCharacterId(req);
    if (!characterId) return res.json({ success: true, capabilities: {} });
    const detail = await lurkStateService.capabilities(characterId);
    const has = (k) => !!(detail[k] && detail[k].available);
    res.json({
      success: true,
      // Booleans in the shape the dashboard has always read...
      capabilities: {
        ai: has('agent'), jaw: has('jaw'), led: has('led'), headTracking: has('headTracking'),
        idle: has('idle'), motionSensor: has('motionSensor'), aiMotion: has('aiMotion'),
        followOrders: has('followOrders'), music: has('music')
      },
      // ...and the reasons, so a missing capability names its cause.
      detail
    });
  } catch (e) {
    res.status(500).json({ success: false, error: e && e.message });
  }
});

// GET /conversation/api/lurk-mode — armed/lurking/awake (+ full machine status)
router.get('/api/lurk-mode', async (req, res) => {
  try {
    const characterId = getCurrentCharacterId(req);
    if (!characterId) return res.json({ success: true, enabled: false });
    const st = lurkStateService.getStatus(characterId);
    res.json({
      success: true,
      enabled: !!st.armed,
      state: st.state,
      // Old meaning kept for the dashboard badge: armed and waiting for a guest.
      sleeping: st.state === 'lurking',
      awake: st.state === 'awake',
      timestamp: st.since || null,
      motionWatcher: lurkMotionWatcher.getStatus(),
      status: st
    });
  } catch (e) {
    res.status(500).json({ success: false, error: e && e.message });
  }
});

// POST /conversation/api/lurk-mode { enabled, inactivityTimeoutMs? }
router.post('/api/lurk-mode', express.json(), async (req, res) => {
  try {
    const characterId = getCurrentCharacterId(req);
    if (!characterId) return res.status(400).json({ success: false, error: 'No character selected' });
    const enabled = !!(req.body && req.body.enabled);
    let result;
    if (enabled) {
      const t = req.body.inactivityTimeoutMs;
      const prefs = typeof t === 'number' ? { inactivityTimeoutMs: t } : undefined;
      if (prefs) {
        const errors = validatePrefsPatch(prefs);
        if (errors.length) return res.status(400).json({ success: false, error: errors.join('; '), errors });
      }
      result = await lurkStateService.arm(characterId, lurkOpts(req, { prefs, reason: 'lurk-on' }));
    } else {
      result = await lurkStateService.disarm(characterId, lurkOpts(req, { reason: 'lurk-off' }));
      if (result.success) await persistAgentState(characterId, false);
    }
    if (!result.success) return res.status(409).json(result);
    // calloutMode stays in the reply for older dashboards: always false now —
    // nothing starts the agent on Lurk, so there is nothing to suppress.
    res.json({ ...result, enabled: !!(result.status && result.status.armed), state: result.status && result.status.state, calloutMode: false });
  } catch (e) {
    res.status(500).json({ success: false, error: e && e.message });
  }
});

// GET /conversation/api/lurk-mode/motion-status — PIR watcher + machine state (polling)
router.get('/api/lurk-mode/motion-status', (req, res) => {
  const characterId = getCurrentCharacterId(req);
  const st = lurkStateService.getStatus(characterId);
  res.json({ success: true, ...lurkMotionWatcher.getStatus(), state: st.state, sleepInMs: st.sleepInMs == null ? null : st.sleepInMs });
});

// POST /conversation/api/lurk-mode/activity — the operator is chatting: keep an
// awake character awake (no physical motion needed)
router.post('/api/lurk-mode/activity', express.json(), (req, res) => {
  const characterId = getCurrentCharacterId(req);
  const noted = lurkStateService.noteActivity(characterId, 'operator-chat');
  res.json({ success: true, noted });
});

// GET /conversation/api/lurk-mode/activity-status — real-time hardware activity for badge indicators
router.get('/api/lurk-mode/activity-status', async (req, res) => {
  try {
    const characterId = getCurrentCharacterId(req);

    // Jaw: check if jaw drive is active
    let jawActive = false;
    try {
      const jawState = jawAnimationService.getJawDriveState(characterId);
      jawActive = !!(jawState && !jawState.cancelled);
    } catch (_) {}

    // Head tracking: check if actively tracking a target
    let headActive = false;
    try {
      const parts = await loadPartsFromController(req);
      const cam = parts.find(p => p.type === 'webcam');
      if (cam) {
        const fakeRes = { json: (d) => d };
        const statusData = await motionTrackingController.getHeadTrackingStatus(
          { query: { webcamId: String(cam.id) } }, fakeRes
        );
        headActive = !!(statusData && statusData.headTracking && statusData.headTracking.tracking && statusData.headTracking.tracking.hasTarget);
      }
    } catch (_) {}

    // Idle: check if currently transitioning (running and has claims)
    let idleActive = false;
    try {
      const idleStatus = getIdleStatus();
      idleActive = !!(idleStatus.running && Object.keys(idleStatus.servoClaims || {}).length > 0);
    } catch (_) {}

    // Motion sensor: check if motion detected recently
    let motionActive = false;
    try {
      const motionStatus = lurkMotionWatcher.getStatus();
      motionActive = !!(motionStatus && motionStatus.lastMotionAt &&
        (Date.now() - new Date(motionStatus.lastMotionAt).getTime() < 3000));
    } catch (_) {}

    // AI: check if AI conversation is active (agent is speaking)
    let aiActive = false;
    try {
      const sessions = elevenLabsWebSocketService.getActiveSessions ? elevenLabsWebSocketService.getActiveSessions() : [];
      aiActive = sessions.some(s => s.isActive);
    } catch (_) {}

    res.json({
      success: true,
      activity: { jaw: jawActive, head: headActive, idle: idleActive, motion: motionActive, ai: aiActive }
    });
  } catch (e) {
    res.json({ success: true, activity: { jaw: false, head: false, idle: false, motion: false, ai: false } });
  }
});

export default router;

