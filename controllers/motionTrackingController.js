import fs from 'fs/promises';
import path from 'path';
import { fileURLToPath } from 'url';
import { spawn } from 'child_process';
import hardwareService from '../services/hardwareService/index.js';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

// Motion tracking state management
const activeTrackers = new Map(); // webcamId -> tracker process
const trackingConfigs = new Map(); // webcamId -> config
const trackingStatus = new Map(); // webcamId -> status

// Head tracking state/config
const headTrackingConfigs = new Map(); // webcamId -> { enabled, panServoId, tiltServoId, centerDeg, rangeDeg, invertPan, smoothing, deadzone }
const headTrackingStates = new Map(); // webcamId -> { lastPanDeg, lastCmdAt }

const MJPG_STREAM_URL = 'http://localhost:8090/?action=stream';

// Default motion tracking configuration - optimized for speed
const DEFAULT_CONFIG = {
  motionThreshold: 30,
  minContourArea: 300,
  maxContourArea: 30000,
  trackingSmoothing: 0.2,
  trackingDeadzone: 3.0,
  backgroundLearningRate: 0.02,
  noiseReductionKernelSize: 3
};

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
      '--motion-threshold', config.motionThreshold.toString(),
      '--min-contour-area', config.minContourArea.toString(),
      '--max-contour-area', config.maxContourArea.toString(),
      '--tracking-smoothing', config.trackingSmoothing.toString(),
      '--tracking-deadzone', config.trackingDeadzone.toString(),
      '--background-learning-rate', config.backgroundLearningRate.toString(),
      '--noise-kernel-size', config.noiseReductionKernelSize.toString()
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
    const partsPath = path.join(__dirname, '../data/parts.json');
    const partsData = await fs.readFile(partsPath, 'utf8');
    const parts = JSON.parse(partsData);

    const webcamPart = parts.find(p => String(p.id) === String(webcamId) && p.type === 'webcam');
    if (!webcamPart) {
      return null;
    }

    // Get device path from part config
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
    const partsPath = path.join(__dirname, '../data/parts.json');
    const partsData = await fs.readFile(partsPath, 'utf8');
    const parts = JSON.parse(partsData);

    return parts.find(p => String(p.id) === String(webcamId) && p.type === 'webcam');
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
    const partsPath = path.join(__dirname, '../data/parts.json');
    const partsData = await fs.readFile(partsPath, 'utf8');
    const parts = JSON.parse(partsData);

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
 * Internal: Map motion position to servo control and command hardware
 * Supports both positional and continuous rotation servos
 */
async function maybeDriveHead(webcamId, status) {
  const cfg = headTrackingConfigs.get(webcamId);
  if (!cfg || !cfg.enabled) return;
  if (!status || !status.target_detected) return;

  const now = Date.now();
  const state = headTrackingStates.get(webcamId) || { lastPanDeg: 0, lastCmdAt: 0, servoType: null };
  const minIntervalMs = 50; // faster servo commands for responsive tracking
  if (now - state.lastCmdAt < minIntervalMs) return;

  // Get servo configuration to determine type FIRST
  if (!state.servoType) {
    // For now, hardcode servo 4 as continuous since we know it from parts.json
    // TODO: Make this dynamic by reading parts.json properly
    if (String(cfg.panServoId) === '4') {
      state.servoType = 'continuous';
      console.log('🔧 Hardcoded servo type: continuous for servo 4');
    } else {
      state.servoType = 'standard';
      console.log('🔧 Default servo type: standard for servo ' + cfg.panServoId);
    }

    // Store the updated state immediately
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
    console.log('🔍 Debug: servoType=' + state.servoType + ', panServoId=' + cfg.panServoId);
    if (state.servoType === 'continuous') {
      // Continuous servo: rotate in direction of target with proportional control
      var direction = err > 0 ? (invert ? 'ccw' : 'cw') : (invert ? 'cw' : 'ccw');
      var speed = Math.round(Math.min(100, Math.max(15, Math.abs(err) * 1.5))); // Integer speed 15-100
      var duration = Math.round(Math.min(300, Math.max(50, Math.abs(err) * 5))); // Integer duration 50-300ms

      console.log('🎯 Head tracking (continuous): target_x=' + x.toFixed(1) + ', error=' + err.toFixed(1) + ', direction=' + direction + ', speed=' + speed + ', duration=' + duration + 'ms, servo=' + cfg.panServoId);

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
      // Positional servo: move to specific angle
      var target = center + ((err / 50) * range * (invert ? -1 : 1));

      // Smooth toward target
      var smooth = (typeof cfg.smoothing === 'number' ? cfg.smoothing : 0.3);
      if (smooth < 0) smooth = 0; if (smooth > 1) smooth = 1;
      var next = state.lastPanDeg + (target - state.lastPanDeg) * smooth;

      // Clamp to reasonable safe range (-90..+90); servo layer will clamp further via calibration
      if (next > 90) next = 90; if (next < -90) next = -90;

      console.log('🎯 Head tracking (positional): target=' + target.toFixed(1) + '°, smoothed=' + next.toFixed(1) + '°, servo=' + cfg.panServoId);

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
    return res.json({ success: true, webcamId, headTracking: headTrackingConfigs.get(webcamId) || { enabled: false } });
  } catch (e) {
    return res.status(500).json({ success: false, error: e.message });
  }
};


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
