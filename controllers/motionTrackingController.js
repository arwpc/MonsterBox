import fs from 'fs/promises';
import path from 'path';
import { fileURLToPath } from 'url';
import { spawn } from 'child_process';
import hardwareService from '../services/hardwareService/index.js';
import { readConfig } from '../services/configService.js';
import { getCalibrationStore } from '../server/calibration/store.js';


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

const MJPG_STREAM_URL = 'http://localhost:8090/?action=stream';

// Default motion tracking configuration — tuned for large-body tracking
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
  confirmFrames: 3
};

// Resolve parts.json using selectedCharacter for correct character isolation
async function getPartsFilePath() {
  const cfg = await readConfig();
  const appRoot = path.resolve(__dirname, '..');
  const charId = cfg && cfg.selectedCharacter;
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

    // Stop existing tracker if running
    if (activeTrackers.has(webcamId)) {
      await stopMotionTrackingInternal(webcamId);
    }

    // Merge params with defaults
    const config = { ...DEFAULT_CONFIG, ...params };
    trackingConfigs.set(webcamId, config);

    // Get webcam device path
    const devicePath = await getWebcamDevicePath(webcamId);
    if (!devicePath) {
      return res.status(404).json({
        success: false,
        error: 'Webcam device not found'
      });
    }

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
      message: 'Motion tracking started',
      webcamId,
      config
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

    res.json({
      success: true,
      message: 'Motion tracking stopped',
      webcamId
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
      '--detection-mode', (config.detectionMode || 'motion')
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
      console.log(`Motion tracking process exited with code ${code}`);
      activeTrackers.delete(webcamId);
      trackingStatus.delete(webcamId);
    });

    // Timeout for initialization
    setTimeout(() => {
      if (!initialized) {
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
async function loadHeadTrackingGuardrails(servoId) {
  try {
    // Check cache first
    if (headTrackingGuardrails.has(servoId)) {
      return headTrackingGuardrails.get(servoId);
    }

    let minAngle = -90;
    let maxAngle = 90;

    // Primary source: calibration_profiles.json via calibration store
    const calibrationStore = getCalibrationStore();
    const profile = await calibrationStore.get(servoId);

    if (profile && profile.bounds) {
      if (typeof profile.bounds.minAngle === 'number') minAngle = profile.bounds.minAngle;
      if (typeof profile.bounds.maxAngle === 'number') maxAngle = profile.bounds.maxAngle;
    } else {
      // Fallback: read markers from parts.json
      try {
        const partsPath = await getPartsFilePath();
        const partsData = await fs.readFile(partsPath, 'utf8');
        const parts = JSON.parse(partsData);
        const part = parts.find(p => String(p.id) === String(servoId));
        if (part && Array.isArray(part.markers)) {
          const minMarker = part.markers.find(m => m.name === 'Min');
          const maxMarker = part.markers.find(m => m.name === 'Max');
          if (minMarker) minAngle = parseFloat(minMarker.value);
          if (maxMarker) maxAngle = parseFloat(maxMarker.value);
        }
      } catch (partsError) {
        console.warn('Could not read parts.json markers for guardrails:', partsError.message);
      }
    }

    const guardrails = { minAngle, maxAngle };

    // Cache for 60 seconds
    headTrackingGuardrails.set(servoId, guardrails);
    setTimeout(() => headTrackingGuardrails.delete(servoId), 60000);

    console.log('Loaded head tracking guardrails for servo ' + servoId + ': ' + minAngle + '°..' + maxAngle + '°');
    return guardrails;
  } catch (error) {
    console.warn('Could not load head tracking guardrails:', error.message);
    return { minAngle: -90, maxAngle: 90 };
  }
}

/**
 * Detect servo type (standard vs continuous) from calibration profile or parts.json.
 * Returns 'continuous' or 'standard'.
 */
async function detectServoType(servoId) {
  try {
    // Primary: calibration_profiles.json capability.kind
    const calibrationStore = getCalibrationStore();
    const profile = await calibrationStore.get(servoId);
    if (profile && profile.capability && profile.capability.kind) {
      if (profile.capability.kind === 'continuous-servo') return 'continuous';
      if (profile.capability.kind === 'absolute-servo') return 'standard';
    }

    // Fallback: parts.json config.servoType
    try {
      const partsPath = await getPartsFilePath();
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
async function maybeDriveHead(webcamId, status) {
  const cfg = headTrackingConfigs.get(webcamId);
  if (!cfg || !cfg.enabled) return;
  if (!status || !status.target_detected) return;

  const now = Date.now();
  const state = headTrackingStates.get(webcamId) || { lastPanDeg: 0, lastCmdAt: 0, servoType: null };
  const minIntervalMs = 50; // faster servo commands for responsive tracking
  if (now - state.lastCmdAt < minIntervalMs) return;

  // Detect servo type dynamically from calibration profile or parts.json
  if (!state.servoType) {
    state.servoType = await detectServoType(cfg.panServoId);
    console.log('Detected servo type: ' + state.servoType + ' for servo ' + cfg.panServoId);
    headTrackingStates.set(webcamId, state);
  }

  // Position to target mapping
  var x = Array.isArray(status.target_position) ? status.target_position[0] : 50;
  if (typeof x !== 'number') x = 50;
  var dead = (typeof cfg.deadzone === 'number' ? cfg.deadzone : 5);
  var err = x - 50; // -50..+50
  if (Math.abs(err) < dead) return; // within deadzone

  var range = (typeof cfg.rangeDeg === 'number' ? cfg.rangeDeg : 60);
  var center = (typeof cfg.centerDeg === 'number' ? cfg.centerDeg : 0);
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
      })
        .then(function (result) {
          if (result && !result.success) {
            console.warn('Head tracking servo failed:', result.message || result.error);
          }
        })
        .catch(function (e) {
          console.warn('Head tracking servo error:', e && e.message);
        });
    } else {
      // Positional servo: move to specific angle with calibration guardrails
      var target = center + ((err / 50) * range * (invert ? -1 : 1));

      // Smooth toward target
      var smooth = (typeof cfg.smoothing === 'number' ? cfg.smoothing : 0.3);
      if (smooth < 0) smooth = 0; if (smooth > 1) smooth = 1;
      var next = state.lastPanDeg + (target - state.lastPanDeg) * smooth;

      // Load and apply calibration guardrails
      loadHeadTrackingGuardrails(cfg.panServoId).then(function (guardrails) {
        // Clamp to calibration limits to prevent over-rotation
        var minLimit = guardrails.minAngle;
        var maxLimit = guardrails.maxAngle;
        if (next > maxLimit) next = maxLimit;
        if (next < minLimit) next = minLimit;

        console.log('Head tracking (positional): target=' + target.toFixed(1) + ', smoothed=' + next.toFixed(1) + ', limits=[' + minLimit + '..' + maxLimit + ']');

        hardwareService.controlPart(cfg.panServoId, 'moveToAngle', { angleDeg: next })
          .then(function (result) {
            if (result && !result.success) {
              console.warn('Head tracking servo failed:', result.message || result.error);
            }
          })
          .catch(function (e) {
            console.warn('Head tracking servo error:', e && e.message);
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
      centerDeg: typeof params.centerDeg === 'number' ? params.centerDeg : 0,
      rangeDeg: typeof params.rangeDeg === 'number' ? params.rangeDeg : 60,
      invertPan: !!params.invertPan,
      smoothing: typeof params.smoothing === 'number' ? params.smoothing : 0.3,
      deadzone: typeof params.deadzone === 'number' ? params.deadzone : 5
    };
    headTrackingConfigs.set(webcamId, cfg);
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
          hasTarget: !!(status.targetX != null || status.target_x != null),
          targetX: status.targetX || status.target_x || null,
          targetY: status.targetY || status.target_y || null,
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
    centerDeg: typeof config.centerDeg === 'number' ? config.centerDeg : 0,
    rangeDeg: typeof config.rangeDeg === 'number' ? config.rangeDeg : 60,
    invertPan: !!config.invertPan,
    smoothing: typeof config.smoothing === 'number' ? config.smoothing : 0.3,
    deadzone: typeof config.deadzone === 'number' ? config.deadzone : 5
  };
  headTrackingConfigs.set(webcamId, cfg);
  return { success: true, webcamId, headTracking: cfg };
}

/**
 * Disable head tracking for a webcam (programmatic, no req/res)
 */
export function disableHeadTrackingForWebcam(webcamId) {
  if (!webcamId) throw new Error('webcamId is required');
  const cfg = headTrackingConfigs.get(webcamId);
  if (cfg) cfg.enabled = false;
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
