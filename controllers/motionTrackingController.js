import fs from 'fs/promises';
import path from 'path';
import { fileURLToPath } from 'url';
import { spawn } from 'child_process';
import hardwareService from '../services/hardwareService/index.js';
import { readConfig } from '../services/configService.js';
import { getCalibrationStore } from '../server/calibration/store.js';
import { claimServo, releaseServo, isAvailable, getOwner, PRIORITY } from '../services/movement/priorityManager.js';


const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

// Motion tracking state management
const activeTrackers = new Map(); // webcamId -> tracker process
const trackingConfigs = new Map(); // webcamId -> config
const trackingStatus = new Map(); // webcamId -> status

// Head tracking state/config
const headTrackingConfigs = new Map(); // webcamId -> { enabled, panServoId, tiltServoId, centerDeg, rangeDeg, invertPan, smoothing, deadzone }
const headTrackingStates = new Map(); // webcamId -> { lastPanDeg, lastCmdAt }
const headTrackingGuardrails = new Map(); // servoId -> { minAngle, maxAngle } - cached calibration limits

// Head tracking holds its pan servo through priorityManager while enabled, so
// the idle loop and random poses yield instead of issuing interleaved
// conflicting angles at the same servo. Owner is per-webcam so one webcam's
// disable cannot release another webcam's claim.
function headOwner(webcamId) {
  return 'head-tracking:' + webcamId;
}

const MJPG_STREAM_URL = 'http://localhost:8090/?action=stream';

// Default motion tracking configuration — tuned for person tracking
const DEFAULT_CONFIG = {
  motionThreshold: 25,
  minContourArea: 3000,
  maxContourArea: 100000,
  trackingSmoothing: 0.25,
  trackingDeadzone: 5.0,
  backgroundLearningRate: 0.005,
  noiseReductionKernelSize: 5,
  blurSize: 5,
  dilateSize: 9,
  varThreshold: 25,
  targetLockStrength: 5,
  confirmFrames: 3,
  detectInterval: 5,
  detectionMode: 'person'
};

// Resolve parts.json for correct character isolation. When the caller has a
// pinned characterId it MUST pass it — the selectedCharacter fallback resolves
// against this node's mutable selection, which can differ from the character
// the caller's config was pinned to.
async function getPartsFilePath(characterId) {
  const cfg = await readConfig();
  const appRoot = path.resolve(__dirname, '..');
  const charId = characterId != null ? characterId : (cfg && cfg.selectedCharacter);
  if (charId) {
    const charPath = path.resolve(appRoot, `data/character-${charId}`, 'parts.json');
    try {
      await fs.access(charPath);
      return charPath;
    } catch (_) { /* fall through */ }
  }
  const dataDir = (cfg && cfg.dataPath) ? cfg.dataPath : 'data';
  return path.resolve(appRoot, dataDir, 'parts.json');
}

/**
 * Start motion tracking for a webcam part
 */
export const startMotionTracking = async (req, res) => {
  try {
    const { webcamId, params = {} } = req.body;

    if (!webcamId) {
      return res.status(400).json({
        success: false,
        error: 'webcamId is required'
      });
    }

    // Resolve the device FIRST: a start that is about to 404 must not have
    // already killed head tracking on its way to failing.
    const devicePath = await getWebcamDevicePath(webcamId);
    if (!devicePath) {
      return res.status(404).json({
        success: false,
        error: 'Webcam device not found'
      });
    }

    // ONE camera consumer at a time (operator ruling, 2026-08-23): starting
    // motion tracking SHUTS DOWN head tracking on this webcam, visibly,
    // instead of silently restarting the pipeline underneath it — that silent
    // clobber is what read as "OpenCV was working and just stopped" at the
    // bench. The reverse handover lives in enableHeadTracking. The suspended
    // config is tagged so stopping motion tracking re-arms it.
    let headTrackingShutDown = false;
    const priorHeadCfg = headTrackingConfigs.get(webcamId);
    if (priorHeadCfg && priorHeadCfg.enabled) {
      disableHeadTrackingForWebcam(webcamId);
      priorHeadCfg.suspendedByMotionStart = true;
      headTrackingShutDown = true;
      console.error(`🎥 Motion tracking started on webcam ${webcamId} — head tracking SHUT DOWN (one camera consumer at a time)`);
    }

    // Stop existing tracker if running
    if (activeTrackers.has(webcamId)) {
      await stopMotionTrackingInternal(webcamId);
    }

    // Merge params with defaults
    const config = { ...DEFAULT_CONFIG, ...params };
    trackingConfigs.set(webcamId, config);

    // Start motion tracking process
    const tracker = await startMotionTrackingProcess(webcamId, devicePath, config);
    activeTrackers.set(webcamId, tracker);

    // Initialize status
    trackingStatus.set(webcamId, {
      active: true,
      target_detected: false,
      target_position: [50, 50],
      target_size: 0,
      last_detection_time: null,
      fps: 0,
      frame_count: 0
    });

    res.json({
      success: true,
      message: headTrackingShutDown
        ? 'Motion tracking started — head tracking was shut down (one camera consumer at a time)'
        : 'Motion tracking started',
      webcamId,
      config,
      headTrackingShutDown
    });

  } catch (error) {
    console.error('Motion tracking start error:', error);
    res.status(500).json({
      success: false,
      error: error.message
    });
  }
};

/**
 * Stop motion tracking for a webcam part
 */
export const stopMotionTracking = async (req, res) => {
  try {
    const { webcamId } = req.body;

    if (!webcamId) {
      return res.status(400).json({
        success: false,
        error: 'webcamId is required'
      });
    }

    await stopMotionTrackingInternal(webcamId);

    // If starting motion tracking suspended a head-tracking config (one
    // camera consumer at a time), explicitly stopping motion tracking hands
    // the camera back: re-arm the suspended config instead of losing it.
    let headTrackingRearmed = false;
    const suspendedCfg = headTrackingConfigs.get(webcamId);
    if (suspendedCfg && suspendedCfg.suspendedByMotionStart) {
      delete suspendedCfg.suspendedByMotionStart;
      suspendedCfg.enabled = true;
      headTrackingConfigs.set(webcamId, suspendedCfg);
      headTrackingRearmed = true;
      console.error(`🎥 Motion tracking stopped on webcam ${webcamId} — suspended head tracking RE-ARMED`);
    }

    res.json({
      success: true,
      message: headTrackingRearmed
        ? 'Motion tracking stopped — suspended head tracking re-armed'
        : 'Motion tracking stopped',
      webcamId,
      headTrackingRearmed
    });

  } catch (error) {
    console.error('Motion tracking stop error:', error);
    res.status(500).json({
      success: false,
      error: error.message
    });
  }
};

/**
 * Update motion tracking parameters
 */
export const updateMotionTrackingParams = async (req, res) => {
  try {
    const { webcamId, params } = req.body;

    if (!webcamId || !params) {
      return res.status(400).json({
        success: false,
        error: 'webcamId and params are required'
      });
    }

    // Update config
    const currentConfig = trackingConfigs.get(webcamId) || DEFAULT_CONFIG;
    const newConfig = { ...currentConfig, ...params };
    trackingConfigs.set(webcamId, newConfig);

    // Send config update to active tracker
    const tracker = activeTrackers.get(webcamId);
    if (tracker && tracker.stdin && !tracker.killed) {
      const configMessage = JSON.stringify({
        type: 'update_config',
        config: newConfig
      }) + '\n';

      try {
        tracker.stdin.write(configMessage);
      } catch (writeError) {
        console.warn('Failed to update tracker config:', writeError.message);
      }
    }

    res.json({
      success: true,
      message: 'Motion tracking parameters updated',
      webcamId,
      config: newConfig
    });

  } catch (error) {
    console.error('Motion tracking params update error:', error);
    res.status(500).json({
      success: false,
      error: error.message
    });
  }
};

/**
 * Get motion tracking status
 */
export const getMotionTrackingStatus = async (req, res) => {
  try {
    const { webcamId } = req.query;

    if (!webcamId) {
      return res.status(400).json({
        success: false,
        error: 'webcamId is required'
      });
    }

    const status = trackingStatus.get(webcamId);
    const isActive = activeTrackers.has(webcamId);

    res.json({
      success: true,
      webcamId,
      active: isActive,
      status: status || null
    });

  } catch (error) {
    console.error('Motion tracking status error:', error);
    res.status(500).json({
      success: false,
      error: error.message
    });
  }
};

/**
 * Check head tracking requirements for a webcam part
 */
export const checkHeadTrackingRequirements = async (req, res) => {
  try {
    const { webcamId } = req.query;

    if (!webcamId) {
      return res.status(400).json({
        success: false,
        error: 'webcamId is required'
      });
    }

    // Check if webcam part exists
    const webcamPart = await getWebcamPart(webcamId);
    if (!webcamPart) {
      return res.json({
        success: true,
        canEnableHeadTracking: false,
        reason: 'Webcam part not found',
        requirements: {
          webcamPart: false,
          servoPart: false,
          mjpgStreamer: false
        }
      });
    }

    // Check for available servo parts
    const servoParts = await getAvailableServoParts();
    const hasServo = servoParts.length > 0;

    // Check mjpg-streamer health
    const mjpgHealthy = await checkMjpgStreamerHealth();

    const canEnable = hasServo && mjpgHealthy;

    res.json({
      success: true,
      canEnableHeadTracking: canEnable,
      reason: canEnable ? 'All requirements met' : 'Missing requirements',
      requirements: {
        webcamPart: true,
        servoPart: hasServo,
        mjpgStreamer: mjpgHealthy
      },
      availableServos: servoParts
    });

  } catch (error) {
    console.error('Head tracking requirements check error:', error);
    res.status(500).json({
      success: false,
      error: error.message
    });
  }
};

/**
 * Internal function to stop motion tracking
 */
async function stopMotionTrackingInternal(webcamId) {
  const tracker = activeTrackers.get(webcamId);
  if (tracker) {
    try {
      if (!tracker.killed && tracker.exitCode == null) {
        tracker._mbRequestedStop = true; // requested stop — the exit handler stays quiet
        tracker.kill('SIGTERM');

        // Wait briefly for clean exit
        const exited = await new Promise(function (resolve) {
          var resolved = false;
          function done(ok) { if (!resolved) { resolved = true; resolve(ok); } }
          tracker.once('exit', function () { done(true); });
          setTimeout(function () { done(false); }, 2000);
        });

        // Escalate if still alive
        if (!exited && tracker.exitCode == null) {
          try { tracker.kill('SIGKILL'); } catch (e) { /* ignore */ }
        }
      }
    } catch (killError) {
      console.warn('Error killing tracker process:', killError.message);
    }

    activeTrackers.delete(webcamId);
  }

  trackingStatus.delete(webcamId);
  trackingConfigs.delete(webcamId);

  // The pan claim is only meaningful while frames are arriving: maybeDriveHead
  // is driven by tracker stdout, so with the tracker dead nothing can drive the
  // servo OR release the claim. Left held, the pan servo was frozen out of all
  // idle/ambient motion (plus a DENIED log line every idle cycle) until head
  // tracking was explicitly disabled or the server restarted.
  //
  // cfg.enabled deliberately stays TRUE: it means "head tracking is armed", and
  // the operator only stopped the camera. maybeDriveHead re-claims on the first
  // frame after tracking restarts, so re-enable behaves correctly without the
  // UI toggle silently flipping itself off under the operator.
  // releaseServo is owner-checked, so this can only ever free this webcam's own
  // claim, and a later disableHeadTracking release is a harmless no-op.
  const headCfg = headTrackingConfigs.get(webcamId);
  if (headCfg && headCfg.panServoId != null) {
    releaseServo(headCfg.panServoId, headOwner(webcamId));
  }
}

/**
 * Start motion tracking Python process
 */
async function startMotionTrackingProcess(webcamId, devicePath, config) {
  return new Promise((resolve, reject) => {
    const scriptPath = path.join(__dirname, '../scripts/motion_tracking_service.py');

    const args = [
      scriptPath,
      '--device', devicePath,
      '--stream-url', MJPG_STREAM_URL,
      '--motion-threshold', (config.motionThreshold || 25).toString(),
      '--min-contour-area', (config.minContourArea || 3000).toString(),
      '--max-contour-area', (config.maxContourArea || 100000).toString(),
      '--tracking-smoothing', (config.trackingSmoothing || 0.25).toString(),
      '--tracking-deadzone', (config.trackingDeadzone || 5.0).toString(),
      '--background-learning-rate', (config.backgroundLearningRate || 0.005).toString(),
      '--noise-kernel-size', (config.noiseReductionKernelSize || 5).toString(),
      '--blur-size', (config.blurSize || 5).toString(),
      '--dilate-size', (config.dilateSize || 9).toString(),
      '--var-threshold', (config.varThreshold || 25).toString(),
      '--target-lock-strength', (config.targetLockStrength || 5).toString(),
      '--confirm-frames', (config.confirmFrames || 3).toString(),
      '--detect-interval', (config.detectInterval || 5).toString(),
      '--detection-mode', (config.detectionMode || 'person')
    ];

    const tracker = spawn('python3', args, {
      stdio: ['pipe', 'pipe', 'pipe']
    });

    let initialized = false;

    // Handle process output
    tracker.stdout.on('data', (data) => {
      try {
        const lines = data.toString().split('\n').filter(line => line.trim());

        for (const line of lines) {
          if (line.startsWith('{')) {
            const status = JSON.parse(line);
            trackingStatus.set(webcamId, status);

            // Drive head tracking (if enabled for this webcam)
            try { maybeDriveHead(webcamId, status).catch(e => { /* ignore async errors */ }); } catch (e) { /* ignore */ }

            if (!initialized && status.initialized) {
              initialized = true;
              resolve(tracker);
            }
          }
        }
      } catch (parseError) {
        console.warn('Motion tracking output parse error:', parseError.message);
      }
    });

    // Handle process errors
    tracker.stderr.on('data', (data) => {
      console.warn('Motion tracking stderr:', data.toString());
    });

    tracker.on('error', (error) => {
      console.error('Motion tracking process error:', error);
      if (!initialized) {
        reject(error);
      }
    });

    tracker.on('exit', (code) => {
      // An UNEXPECTED tracker death must be loud and diagnosable. This used to
      // log to stdout and delete ALL state, so head tracking stayed "enabled"
      // pointing at nothing while the status endpoint reported that nothing
      // had ever run — at the bench that read as "OpenCV was working and just
      // stopped, settings perfect". A requested stop stays quiet; a crash goes
      // to .err with its exit code and leaves an inspectable tombstone status.
      const requested = tracker._mbRequestedStop === true;
      const isCurrent = activeTrackers.get(webcamId) === tracker;
      if (isCurrent) activeTrackers.delete(webcamId);
      // Death BEFORE initialization fails the start call itself (the caller
      // gets an error instead of a resolved tracker that is already a corpse).
      if (!initialized) {
        reject(new Error(`Motion tracking process exited during startup (code ${code})`));
      }
      if (requested || !isCurrent) {
        if (isCurrent) trackingStatus.delete(webcamId);
        console.log(`Motion tracking process exited with code ${code}`);
        return;
      }
      console.error(`🎥 Motion tracking process for webcam ${webcamId} EXITED unexpectedly (code ${code}) — no stop was requested. Head tracking on this webcam is idle until tracking restarts.`);
      trackingStatus.set(webcamId, {
        active: false,
        exited: true,
        exit_code: code,
        exited_at: new Date().toISOString()
      });
    });

    // Timeout for initialization
    setTimeout(() => {
      if (!initialized) {
        tracker._mbRequestedStop = true; // our own kill — not an unexpected death
        tracker.kill('SIGTERM');
        reject(new Error('Motion tracking initialization timeout'));
      }
    }, 10000);
  });
}

/**
 * Get webcam device path from webcam part ID
 */
async function getWebcamDevicePath(webcamId) {
  try {
    const partsPath = await getPartsFilePath();
    let parts = [];
    try {
      const partsData = await fs.readFile(partsPath, 'utf8');
      parts = JSON.parse(partsData);
    } catch (e) {
      if (e && e.code !== 'ENOENT') throw e; // surface unexpected errors
      parts = [];
    }

    const webcamPart = parts.find(p => String(p.id) === String(webcamId) && p.type === 'webcam');
    if (!webcamPart) return null;

    const config = webcamPart.config || {};
    return config.devicePath || config.device || '/dev/video0';
  } catch (error) {
    console.error('Error getting webcam device path:', error);
    return null;
  }
}

/**
 * Check if mjpg-streamer service is available
 */
async function checkMjpgStreamerHealth() {
  try {
    const response = await fetch('http://localhost:8090/', {
      method: 'GET',
      signal: AbortSignal.timeout(3000)
    });
    return response.status !== 0;
  } catch (error) {
    return false;
  }
}

/**
 * Get webcam part by ID
 */
async function getWebcamPart(webcamId) {
  try {
    const partsPath = await getPartsFilePath();
    let parts = [];
    try {
      const partsData = await fs.readFile(partsPath, 'utf8');
      parts = JSON.parse(partsData);
    } catch (e) {
      if (e && e.code !== 'ENOENT') throw e;
      parts = [];
    }
    return parts.find(p => String(p.id) === String(webcamId) && p.type === 'webcam') || null;
  } catch (error) {
    console.error('Error getting webcam part:', error);
    return null;
  }
}

/**
 * Get available servo parts for head tracking
 */
async function getAvailableServoParts() {
  try {
    const partsPath = await getPartsFilePath();
    let parts = [];
    try {
      const partsData = await fs.readFile(partsPath, 'utf8');
      parts = JSON.parse(partsData);
    } catch (e) {
      if (e && e.code !== 'ENOENT') throw e;
      parts = [];
    }

    return parts.filter(p => p.type === 'servo').map(servo => ({
      id: servo.id,
      name: servo.name || `Servo #${servo.id}`,
      config: servo.config || {}
    }));
  } catch (error) {
    console.error('Error getting servo parts:', error);
    return [];
  }
}

/**
 * Load calibration guardrails (Min/Max) from calibration profile for head tracking servo.
 * Uses calibration_profiles.json bounds (minAngle/maxAngle) for absolute-servo parts.
 * Falls back to parts.json markers if no calibration profile exists.
 */
async function loadHeadTrackingGuardrails(servoId, characterId) {
  // Part ids repeat across characters, so both the store lookup and the cache
  // must be character-scoped — an unscoped cache handed one character's window
  // to another character's servo of the same id.
  const cacheKey = `${characterId != null ? characterId : 'sel'}:${servoId}`;
  try {
    // Check cache first
    if (headTrackingGuardrails.has(cacheKey)) {
      return headTrackingGuardrails.get(cacheKey);
    }

    let minAngle = null;
    let maxAngle = null;

    // Primary source: calibration_profiles.json via calibration store
    const calibrationStore = getCalibrationStore();
    const profile = await calibrationStore.get(servoId, characterId);

    if (profile && profile.bounds) {
      if (typeof profile.bounds.minAngle === 'number') minAngle = profile.bounds.minAngle;
      if (typeof profile.bounds.maxAngle === 'number') maxAngle = profile.bounds.maxAngle;
    } else {
      // Legacy `part.markers` are NO LONGER a guardrail source (retired 2026-08-21,
      // same as in jawAnimationSuperPowerService). The marker EDITOR does not exist
      // — every DOM id its code targets is absent from every view — so the values
      // are invisible and uncorrectable, and one part on this fleet still carries
      // Min 63 / Max 131 against a measured window of 33-98, i.e. past its
      // mechanical stops. Autonomously sweeping a servo between numbers nobody can
      // see or fix is not a fallback, it is a hazard. Naming them keeps the refusal
      // honest instead of silent.
      try {
        const partsPath = await getPartsFilePath();
        const partsData = await fs.readFile(partsPath, 'utf8');
        const parts = JSON.parse(partsData);
        const part = parts.find(p => String(p.id) === String(servoId));
        const markers = part && Array.isArray(part.markers) ? part.markers : [];
        const minMarker = markers.find(m => m.name === 'Min');
        const maxMarker = markers.find(m => m.name === 'Max');
        if (minMarker && maxMarker) {
          console.warn('Head tracking: servo ' + servoId + ' has legacy markers Min '
            + minMarker.value + ' / Max ' + maxMarker.value + ' — NOT used as guardrails. '
            + 'Calibrate the part instead.');
        }
      } catch (partsError) {
        console.warn('Could not read parts.json while checking legacy markers:', partsError.message);
      }
    }

    // No measured window (or a nonsense one) means "do not autonomously drive
    // this servo" — NOT "assume -90..90". Every absolute servo here is 0-180,
    // so the old -90..90 default mapped half the camera frame to negative
    // angles that the daemon floor-clamped to 0: the head sat pinned at 0°
    // while the UI showed it "tracking". A pinned window (min==max) is the
    // frozen-neck failure and is equally unusable.
    let guardrails = null;
    if (Number.isFinite(minAngle) && Number.isFinite(maxAngle) && (maxAngle - minAngle) >= 1) {
      guardrails = { minAngle, maxAngle };
    }

    // Cache for 60 seconds (null too — a missing calibration should not be
    // re-fetched 20x/second)
    headTrackingGuardrails.set(cacheKey, guardrails);
    setTimeout(() => headTrackingGuardrails.delete(cacheKey), 60000);

    if (guardrails) {
      console.log('Loaded head tracking guardrails for servo ' + servoId + ': ' + minAngle + '°..' + maxAngle + '°');
    } else {
      console.warn('Head tracking: servo ' + servoId + ' has no usable calibrated window — refusing to drive it until it is calibrated');
    }
    return guardrails;
  } catch (error) {
    console.warn('Could not load head tracking guardrails:', error.message);
    return null;
  }
}

/**
 * Detect servo type (standard vs continuous) from calibration profile or parts.json.
 * Returns 'continuous' or 'standard'.
 */
async function detectServoType(servoId, characterId) {
  try {
    // Primary: calibration_profiles.json capability.kind — character-scoped,
    // because part ids are only unique within a character.
    const calibrationStore = getCalibrationStore();
    const profile = await calibrationStore.get(servoId, characterId);
    if (profile && profile.capability && profile.capability.kind) {
      if (profile.capability.kind === 'continuous-servo') return 'continuous';
      if (profile.capability.kind === 'absolute-servo') return 'standard';
    }

    // Fallback: parts.json config.servoType (the pinned character's file when known)
    try {
      const partsPath = await getPartsFilePath(characterId);
      const partsData = await fs.readFile(partsPath, 'utf8');
      const parts = JSON.parse(partsData);
      const part = parts.find(p => String(p.id) === String(servoId));
      if (part && part.config && part.config.servoType === 'continuous') return 'continuous';
    } catch (e) {
      // ignore
    }

    return 'standard';
  } catch (e) {
    console.warn('Could not detect servo type for servo ' + servoId + ':', e.message);
    return 'standard';
  }
}

/**
 * Internal: Map motion position to servo control and command hardware
 * Supports both positional and continuous rotation servos with calibration guardrails
 */
// Consecutive-failure back-off per webcam. Without it a mis-resolved servo
// ("Part 2 not found") was retried and logged 20x/second — 10,409 identical
// error lines in one night on one node, all written to an SD card.
const HEAD_DRIVE_BACKOFF_MS = 60000;
const HEAD_DRIVE_MAX_FAILURES = 5;

function recordHeadDriveResult(state, webcamId, ok, detail) {
  if (ok) {
    state.failCount = 0;
    return;
  }
  state.failCount = (state.failCount || 0) + 1;
  if (state.failCount === HEAD_DRIVE_MAX_FAILURES) {
    state.backoffUntil = Date.now() + HEAD_DRIVE_BACKOFF_MS;
    console.warn('Head tracking: ' + HEAD_DRIVE_MAX_FAILURES + ' consecutive servo failures for webcam '
      + webcamId + (detail ? ' (' + detail + ')' : '') + ' — pausing drive for ' + (HEAD_DRIVE_BACKOFF_MS / 1000) + 's');
  }
}

/**
 * Reconcile the configured drive window (centerDeg ± rangeDeg) with the
 * measured calibration window. A configured window that does not touch the
 * measured one is stale — saved before the servo was calibrated in real
 * degrees (the knight's head: config center 90 vs a 323–491 window) — and
 * clamping every command into a disjoint window pins the head at one endstop.
 * In that case snap to the measured window instead of pinning.
 * Exported for unit tests.
 */
export function effectiveDriveWindow(centerDeg, rangeDeg, guardrails) {
  var range = (typeof rangeDeg === 'number' && rangeDeg > 0) ? rangeDeg : 60;
  var center = (typeof centerDeg === 'number') ? centerDeg : 0;
  var min = Math.max(center - range / 2, guardrails.minAngle);
  var max = Math.min(center + range / 2, guardrails.maxAngle);
  if (min > max) {
    return {
      center: (guardrails.minAngle + guardrails.maxAngle) / 2,
      min: guardrails.minAngle,
      max: guardrails.maxAngle,
      range: (guardrails.maxAngle - guardrails.minAngle) / 2,
      snapped: true
    };
  }
  return { center: center, min: min, max: max, range: range, snapped: false };
}

async function maybeDriveHead(webcamId, status) {
  const cfg = headTrackingConfigs.get(webcamId);
  if (!cfg || !cfg.enabled) return;

  // Pin the character BEFORE anything reads calibration, because the guardrail
  // lookup below is character-scoped. controlPart falls back to the node's
  // selectedCharacter when no characterId is given, so a selection change (or a
  // test flipping it) mid-session re-resolved the servo id against a different
  // character's parts — the source of the "Part 2 not found" flood and, worse, of
  // driving another character's channel.
  if (cfg.characterId == null) {
    try {
      const appCfg = await readConfig();
      cfg.characterId = appCfg && appCfg.selectedCharacter != null ? appCfg.selectedCharacter : null;
    } catch (_) { /* keep null — controlPart falls back as before */ }
  }

  // NEVER hold a claim we cannot use.
  //
  // This used to claim the pan servo FIRST and only discover further down that the
  // servo has no usable calibrated window and must not be driven. The claim is at
  // PRIORITY.HEAD_TRACKING (80) and the idle loop is 30, so the result was a servo
  // locked to an owner that would never move it: one node logged 239 "no usable
  // calibrated window" refusals while the idle loop reported "All servos preempted
  // by higher priority, pausing..." for the whole session. The head sat still and
  // the idle motion it was starving never ran either — worst of both.
  //
  // So resolve the guardrails first, and if there is no window, actively give the
  // servo back rather than sitting on it. releaseServo is owner-checked, so this
  // can only free our own claim.
  if (cfg.panServoId != null) {
    const gate = await loadHeadTrackingGuardrails(cfg.panServoId, cfg.characterId);
    if (!gate) {
      const owner = getOwner(cfg.panServoId);
      if (owner && owner.owner === headOwner(webcamId)) {
        releaseServo(cfg.panServoId, headOwner(webcamId));
        console.warn('Head tracking: released the claim on servo ' + cfg.panServoId
          + ' — it has no usable calibrated window, so holding it only starves lower-priority motion');
      }
      return;
    }
  }

  // A higher-priority owner (scene, semantic gesture) preempts our claim
  // silently, and its release deletes the claim entirely — so re-claim whenever
  // the servo is no longer ours. isAvailable() first keeps the "still held by a
  // scene" path silent instead of logging a DENIED line up to 20x/second.
  if (cfg.panServoId != null) {
    const claimOwner = headOwner(webcamId);
    const currentOwner = getOwner(cfg.panServoId);
    if (!currentOwner || currentOwner.owner !== claimOwner) {
      if (!isAvailable(cfg.panServoId, PRIORITY.HEAD_TRACKING)) return;
      claimServo(cfg.panServoId, claimOwner, PRIORITY.HEAD_TRACKING);
    }
  }

  const now = Date.now();
  const state = headTrackingStates.get(webcamId) || { lastPanDeg: 0, lastCmdAt: 0, servoType: null, scanDir: 1, lastTargetAt: 0 };
  const minIntervalMs = 50;
  if (now - state.lastCmdAt < minIntervalMs) return;
  if (state.backoffUntil && now < state.backoffUntil) return;
  if (state.backoffUntil && now >= state.backoffUntil) { state.backoffUntil = 0; state.failCount = 0; }

  // Pin the character the moment tracking first drives. controlPart falls back
  // to the node's selectedCharacter when no characterId is given, so a
  // selection change (or a test flipping it) mid-session re-resolved the servo
  // id against a different character's parts — the source of the
  // "Part 2 not found" flood and, worse, of driving another character's channel.
  if (cfg.characterId == null) {
    try {
      const appCfg = await readConfig();
      cfg.characterId = appCfg && appCfg.selectedCharacter != null ? appCfg.selectedCharacter : null;
    } catch (_) { /* keep null — controlPart falls back as before */ }
  }
  const hwOpts = cfg.characterId != null ? { characterId: cfg.characterId } : undefined;

  // If no target detected, enter scanning sweep mode
  if (!status || !status.target_detected) {
    // Record when we last had a target
    if (!state.lastTargetAt) state.lastTargetAt = now;

    // Wait 3 seconds of no target before scanning
    if (now - state.lastTargetAt < 3000) return;

    // The scan sweep drives the servo with no operator watching, so it gets the
    // same guardrails as target tracking. It used to command raw center±range/2
    // (default -30..+30 with centerDeg 0!) with no clamp at all — parking an
    // absolute servo hard against its 0° floor and re-commanding it 20x/sec.
    const guardrails = await loadHeadTrackingGuardrails(cfg.panServoId, cfg.characterId);
    if (!guardrails) {
      state.lastCmdAt = now; // still rate-limit the (cached) refusal path
      headTrackingStates.set(webcamId, state);
      return;
    }

    // Scanning sweep: slowly pan left-to-right within the reconciled window
    // (a stale configured window snaps to the measured one instead of
    // refusing the sweep entirely).
    var scanWin = effectiveDriveWindow(cfg.centerDeg, cfg.rangeDeg, guardrails);
    if (scanWin.snapped && !state.windowSnapWarned) {
      state.windowSnapWarned = true;
      console.error('Head tracking: configured window (center ' + cfg.centerDeg + '°, range ' + cfg.rangeDeg
        + '°) does not touch the calibrated window [' + guardrails.minAngle + '..' + guardrails.maxAngle
        + '°] — driving within the calibrated window instead. Re-save head tracking settings to clear this.');
    }
    var scanSpeed = 0.5; // degrees per step
    var scanDir = state.scanDir || 1;
    var next = state.lastPanDeg + (scanSpeed * scanDir);
    var minLimit = scanWin.min;
    var maxLimit = scanWin.max;
    if (next >= maxLimit) { next = maxLimit; state.scanDir = -1; }
    if (next <= minLimit) { next = minLimit; state.scanDir = 1; }

    if (cfg.panServoId != null) {
      hardwareService.controlPart(cfg.panServoId, 'moveToAngle', { angleDeg: next }, hwOpts)
        .then(function (result) {
          recordHeadDriveResult(state, webcamId, !(result && result.success === false), result && result.error);
        })
        .catch(function (e) {
          recordHeadDriveResult(state, webcamId, false, e && e.message);
        });
    }
    state.lastPanDeg = next;
    state.lastCmdAt = now;
    headTrackingStates.set(webcamId, state);
    return;
  }

  // Target detected — reset scan state
  state.lastTargetAt = now;
  state.scanDir = state.scanDir || 1;

  // Detect servo type dynamically from calibration profile or parts.json.
  // The cached kind is keyed to the character it was detected for: state
  // survives disable/re-enable, so a re-enable pinned to a different character
  // must re-detect rather than reuse another character's servo kind.
  if (!state.servoType || state.servoTypeCharacterId !== cfg.characterId) {
    state.servoType = await detectServoType(cfg.panServoId, cfg.characterId);
    state.servoTypeCharacterId = cfg.characterId;
    console.log('Detected servo type: ' + state.servoType + ' for servo ' + cfg.panServoId);
    headTrackingStates.set(webcamId, state);
  }

  // Position to target mapping
  var x = Array.isArray(status.target_position) ? status.target_position[0] : 50;
  if (typeof x !== 'number') x = 50;
  var dead = (typeof cfg.deadzone === 'number' ? cfg.deadzone : 5);
  var err = x - 50; // -50..+50
  if (Math.abs(err) < dead) return; // within deadzone

  var invert = !!cfg.invertPan;

  if (cfg.panServoId != null) {
    // Servo type already logged on first detection
    if (state.servoType === 'continuous') {
      // Continuous servo: rotate in direction of target with proportional control
      var direction = err > 0 ? (invert ? 'ccw' : 'cw') : (invert ? 'cw' : 'ccw');
      var speed = Math.round(Math.min(100, Math.max(15, Math.abs(err) * 1.5))); // Integer speed 15-100
      var duration = Math.round(Math.min(300, Math.max(50, Math.abs(err) * 5))); // Integer duration 50-300ms

      console.log('Head tracking (continuous): err=' + err.toFixed(1) + ', dir=' + direction + ', speed=' + speed + ', duration=' + duration + 'ms');

      hardwareService.controlPart(cfg.panServoId, 'rotateContinuous', {
        direction: direction,
        speed: speed,
        duration: duration
      }, hwOpts)
        .then(function (result) {
          if (result && !result.success) {
            console.warn('Head tracking servo failed:', result.message || result.error);
          }
          recordHeadDriveResult(state, webcamId, !(result && result.success === false), result && (result.message || result.error));
        })
        .catch(function (e) {
          console.warn('Head tracking servo error:', e && e.message);
          recordHeadDriveResult(state, webcamId, false, e && e.message);
        });
    } else {
      // Positional servo: move to a target angle within the calibrated window.
      // The target is computed AFTER the window is reconciled: computing it
      // from a stale configured center first (e.g. 90° against a 323–491°
      // window) made every command clamp to one endstop — the head "moved"
      // once to 323° and pinned there.
      loadHeadTrackingGuardrails(cfg.panServoId, cfg.characterId).then(function (guardrails) {
        if (!guardrails) {
          // No measured window — refuse to drive (warned once by the loader).
          state.lastCmdAt = now;
          headTrackingStates.set(webcamId, state);
          return;
        }
        var win = effectiveDriveWindow(cfg.centerDeg, cfg.rangeDeg, guardrails);
        if (win.snapped && !state.windowSnapWarned) {
          state.windowSnapWarned = true;
          console.error('Head tracking: configured window (center ' + cfg.centerDeg + '°, range ' + cfg.rangeDeg
            + '°) does not touch the calibrated window [' + guardrails.minAngle + '..' + guardrails.maxAngle
            + '°] — driving within the calibrated window instead. Re-save head tracking settings to clear this.');
        }
        var target = win.center + ((err / 50) * win.range * (invert ? -1 : 1));

        // Smooth toward target — this is the "slowly, smoothly follows" knob
        var smooth = (typeof cfg.smoothing === 'number' ? cfg.smoothing : 0.3);
        if (smooth < 0) smooth = 0; if (smooth > 1) smooth = 1;
        // A fresh state starts lastPanDeg at 0; smoothing from 0 toward a
        // 300+° window walks the head through angles it was never meant to
        // visit. Seed from the window center instead.
        if (!state.panSeeded) {
          state.lastPanDeg = win.center;
          state.panSeeded = true;
        }
        var next = state.lastPanDeg + (target - state.lastPanDeg) * smooth;

        // Clamp to calibration limits to prevent over-rotation
        var minLimit = win.min;
        var maxLimit = win.max;
        if (next > maxLimit) next = maxLimit;
        if (next < minLimit) next = minLimit;

        console.log('Head tracking (positional): target=' + target.toFixed(1) + ', smoothed=' + next.toFixed(1) + ', limits=[' + minLimit + '..' + maxLimit + ']');

        hardwareService.controlPart(cfg.panServoId, 'moveToAngle', { angleDeg: next }, hwOpts)
          .then(function (result) {
            if (result && !result.success) {
              console.warn('Head tracking servo failed:', result.message || result.error);
            }
            recordHeadDriveResult(state, webcamId, !(result && result.success === false), result && (result.message || result.error));
          })
          .catch(function (e) {
            console.warn('Head tracking servo error:', e && e.message);
            recordHeadDriveResult(state, webcamId, false, e && e.message);
          });

        state.lastPanDeg = next;
        state.lastCmdAt = now;
        headTrackingStates.set(webcamId, state);
      }).catch(function (e) {
        console.warn('Head tracking guardrail load error:', e && e.message);
      });

      // Early return since we're handling state update in the promise
      return;
    }
  }

  state.lastCmdAt = now;
  headTrackingStates.set(webcamId, state);
}

/** Enable head tracking for a webcam */
export const enableHeadTracking = async (req, res) => {
  try {
    const { webcamId, panServoId, tiltServoId, params = {} } = req.body || {};
    if (!webcamId || panServoId == null) {
      return res.status(400).json({ success: false, error: 'webcamId and panServoId are required' });
    }
    const cfg = {
      enabled: true,
      panServoId: panServoId,
      tiltServoId: tiltServoId,
      // Pin the character at enable time so a later selection change cannot
      // re-resolve the servo id against a different character's parts.
      characterId: params.characterId != null ? params.characterId : (req.body && req.body.characterId != null ? req.body.characterId : null),
      centerDeg: typeof params.centerDeg === 'number' ? params.centerDeg : 0,
      rangeDeg: typeof params.rangeDeg === 'number' ? params.rangeDeg : 60,
      invertPan: !!params.invertPan,
      smoothing: typeof params.smoothing === 'number' ? params.smoothing : 0.3,
      deadzone: typeof params.deadzone === 'number' ? params.deadzone : 5
    };
    // Reverse handover of the one-consumer rule (operator ruling 2026-08-23):
    // enabling head tracking takes the camera; a motion-only tracking session
    // on this webcam is finished business, not a co-owner. Say so in .err so
    // "OpenCV just stopped" always has a named cause.
    if (activeTrackers.has(webcamId) && !(headTrackingConfigs.get(webcamId) || {}).enabled) {
      console.error(`🎥 Head tracking enabled on webcam ${webcamId} — the motion-only tracking session is TAKEN OVER (one camera consumer at a time)`);
    }
    // Re-enabling on a different servo must not leave the old claim dangling.
    const prior = headTrackingConfigs.get(webcamId);
    if (prior && prior.panServoId != null && String(prior.panServoId) !== String(cfg.panServoId)) {
      releaseServo(prior.panServoId, headOwner(webcamId));
    }
    headTrackingConfigs.set(webcamId, cfg);
    // Best-effort claim now; maybeDriveHead re-claims once any higher-priority
    // owner lets go, so a denied claim here must not fail the enable.
    if (isAvailable(cfg.panServoId, PRIORITY.HEAD_TRACKING)) {
      claimServo(cfg.panServoId, headOwner(webcamId), PRIORITY.HEAD_TRACKING);
    }
    return res.json({ success: true, webcamId, headTracking: cfg });
  } catch (e) {
    console.error('Enable head tracking error:', e);
    return res.status(500).json({ success: false, error: e.message });
  }
};

/** Disable head tracking for a webcam */
export const disableHeadTracking = async (req, res) => {
  try {
    const { webcamId } = req.body || {};
    if (!webcamId) return res.status(400).json({ success: false, error: 'webcamId is required' });
    const cfg = headTrackingConfigs.get(webcamId);
    if (cfg) cfg.enabled = false;
    if (cfg && cfg.suspendedByMotionStart) delete cfg.suspendedByMotionStart;
    if (cfg && cfg.panServoId != null) {
      releaseServo(cfg.panServoId, headOwner(webcamId));
    }
    headTrackingConfigs.set(webcamId, cfg || { enabled: false });
    return res.json({ success: true, webcamId, headTracking: headTrackingConfigs.get(webcamId) });
  } catch (e) {
    console.error('Disable head tracking error:', e);
    return res.status(500).json({ success: false, error: e.message });
  }
};

/** Get head tracking status */
export const getHeadTrackingStatus = async (req, res) => {
  try {
    const { webcamId } = req.query || {};
    if (!webcamId) return res.status(400).json({ success: false, error: 'webcamId is required' });
    const config = headTrackingConfigs.get(webcamId) || { enabled: false };
    const status = trackingStatus.get(webcamId) || {};
    const state = headTrackingStates.get(webcamId) || {};
    const isActive = activeTrackers.has(webcamId);
    return res.json({
      success: true,
      webcamId,
      headTracking: {
        ...config,
        tracking: {
          active: isActive,
          // The tracker emits target_detected/target_position (snake_case
          // arrays) — the old targetX/target_x fields never existed, so
          // hasTarget was permanently false for every consumer.
          hasTarget: !!status.target_detected,
          targetX: Array.isArray(status.target_position) ? status.target_position[0] : null,
          targetY: Array.isArray(status.target_position) ? status.target_position[1] : null,
          fps: status.fps || null,
          lastPanDeg: state.lastPanDeg || 0
        }
      }
    });
  } catch (e) {
    return res.status(500).json({ success: false, error: e.message });
  }
};


/**
 * Set a manual target position for tracking (click-to-track).
 * Writes a JSON command to the Python process stdin.
 */
export function setManualTarget(webcamId, x, y, durationSec = 30) {
  const tracker = activeTrackers.get(webcamId);
  if (!tracker || !tracker.stdin || tracker.stdin.destroyed) {
    throw new Error('No active tracker for webcam ' + webcamId);
  }
  const msg = JSON.stringify({ type: 'set_manual_target', x, y, durationSec }) + '\n';
  tracker.stdin.write(msg);
  console.log(`🎯 Manual target set for webcam ${webcamId}: (${x.toFixed(1)}%, ${y.toFixed(1)}%) for ${durationSec}s`);
}

/**
 * Clear manual target for a webcam.
 */
export function clearManualTarget(webcamId) {
  const tracker = activeTrackers.get(webcamId);
  if (!tracker || !tracker.stdin || tracker.stdin.destroyed) return;
  const msg = JSON.stringify({ type: 'clear_manual_target' }) + '\n';
  tracker.stdin.write(msg);
}

/**
 * Cleanup function for graceful shutdown
 */
export const cleanup = async () => {
  console.log('Cleaning up motion tracking processes...');

  const cleanupPromises = Array.from(activeTrackers.keys()).map(webcamId =>
    stopMotionTrackingInternal(webcamId)
  );

  await Promise.all(cleanupPromises);
  console.log('Motion tracking cleanup complete');
};

// Note: Signal handlers removed to prevent conflicts with main server cleanup
// The main server should call cleanup() during its shutdown process

// ─── Named exports for head-animation route ─────────────────────────────
// These allow the head-animation route to call tracking logic directly
// without constructing mock req/res objects.

/**
 * Start motion tracking for a webcam (programmatic, no req/res)
 */
export async function startTrackingForWebcam(webcamId, params = {}) {
  if (!webcamId) throw new Error('webcamId is required');

  // Stop existing tracker if running
  if (activeTrackers.has(webcamId)) {
    await stopMotionTrackingInternal(webcamId);
  }

  const config = { ...DEFAULT_CONFIG, ...params };
  trackingConfigs.set(webcamId, config);

  const devicePath = await getWebcamDevicePath(webcamId);
  if (!devicePath) throw new Error('Webcam device not found');

  const tracker = await startMotionTrackingProcess(webcamId, devicePath, config);
  activeTrackers.set(webcamId, tracker);

  trackingStatus.set(webcamId, {
    active: true,
    target_detected: false,
    target_position: [50, 50],
    target_size: 0,
    last_detection_time: null,
    fps: 0,
    frame_count: 0
  });

  return { success: true, webcamId, config };
}

/**
 * Stop motion tracking for a webcam (programmatic, no req/res)
 */
export async function stopTrackingForWebcam(webcamId) {
  if (!webcamId) throw new Error('webcamId is required');
  await stopMotionTrackingInternal(webcamId);
  return { success: true, webcamId };
}

/**
 * Enable head tracking for a webcam (programmatic, no req/res)
 */
export function enableHeadTrackingForWebcam(webcamId, config) {
  if (!webcamId || config.panServoId == null) {
    throw new Error('webcamId and panServoId are required');
  }
  const cfg = {
    enabled: true,
    panServoId: config.panServoId,
    tiltServoId: config.tiltServoId || null,
    // Pin the character at enable time (see enableHeadTracking above).
    characterId: config.characterId != null ? config.characterId : null,
    centerDeg: typeof config.centerDeg === 'number' ? config.centerDeg : 0,
    rangeDeg: typeof config.rangeDeg === 'number' ? config.rangeDeg : 60,
    invertPan: !!config.invertPan,
    smoothing: typeof config.smoothing === 'number' ? config.smoothing : 0.3,
    deadzone: typeof config.deadzone === 'number' ? config.deadzone : 5
  };
  // Same claim discipline as the req/res enable above.
  const prior = headTrackingConfigs.get(webcamId);
  if (prior && prior.panServoId != null && String(prior.panServoId) !== String(cfg.panServoId)) {
    releaseServo(prior.panServoId, headOwner(webcamId));
  }
  headTrackingConfigs.set(webcamId, cfg);
  if (isAvailable(cfg.panServoId, PRIORITY.HEAD_TRACKING)) {
    claimServo(cfg.panServoId, headOwner(webcamId), PRIORITY.HEAD_TRACKING);
  }
  return { success: true, webcamId, headTracking: cfg };
}

/**
 * Disable head tracking for a webcam (programmatic, no req/res)
 */
export function disableHeadTrackingForWebcam(webcamId) {
  if (!webcamId) throw new Error('webcamId is required');
  const cfg = headTrackingConfigs.get(webcamId);
  if (cfg) cfg.enabled = false;
  // An explicit disable overrides any pending motion-start suspension —
  // stopping motion tracking later must not resurrect what the user turned
  // off. (startMotionTracking tags the suspension AFTER calling this, so the
  // exclusivity handover itself is unaffected.)
  if (cfg && cfg.suspendedByMotionStart) delete cfg.suspendedByMotionStart;
  if (cfg && cfg.panServoId != null) {
    releaseServo(cfg.panServoId, headOwner(webcamId));
  }
  headTrackingConfigs.set(webcamId, cfg || { enabled: false });
  return { success: true, webcamId };
}

/**
 * Get motion tracking status for a webcam (programmatic, no req/res)
 */
export function getTrackingStatusForWebcam(webcamId) {
  const status = trackingStatus.get(webcamId);
  const isActive = activeTrackers.has(webcamId);
  return {
    active: isActive,
    status: status || null
  };
}

/**
 * Get head tracking state for a webcam (programmatic, no req/res)
 */
export function getHeadTrackingStateForWebcam(webcamId) {
  return headTrackingConfigs.get(webcamId) || { enabled: false };
}

/**
 * Update tracking params for a running tracker (programmatic, no req/res)
 */
export function updateTrackingParamsForWebcam(webcamId, params) {
  if (!webcamId || !params) throw new Error('webcamId and params are required');

  const currentConfig = trackingConfigs.get(webcamId) || DEFAULT_CONFIG;
  const newConfig = { ...currentConfig, ...params };
  trackingConfigs.set(webcamId, newConfig);

  const tracker = activeTrackers.get(webcamId);
  if (tracker && tracker.stdin && !tracker.killed) {
    try {
      tracker.stdin.write(JSON.stringify({ type: 'update_config', config: newConfig }) + '\n');
    } catch (writeError) {
      console.warn('Failed to update tracker config:', writeError.message);
    }
  }

  return { success: true, webcamId, config: newConfig };
}
