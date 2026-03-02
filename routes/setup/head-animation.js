import express from 'express';
import { loadCharacters } from '../../services/characterService.js';
import * as configService from '../../services/configService.js';
import * as headAnimationService from '../../services/headAnimationSuperPowerService.js';
import * as motionTrackingController from '../../controllers/motionTrackingController.js';
const {
  startTrackingForWebcam,
  stopTrackingForWebcam,
  enableHeadTrackingForWebcam,
  disableHeadTrackingForWebcam,
  getTrackingStatusForWebcam,
  getHeadTrackingStateForWebcam,
  updateTrackingParamsForWebcam
} = motionTrackingController;
import hardwareService from '../../services/hardwareService/index.js';

const router = express.Router();

/**
 * Head Animation Setup Routes
 * Configures and tests OpenCV-based motion detection and head tracking servo mapping.
 * OpenCV detection and head tracking are independent — OpenCV can run without servos.
 */

// In-memory cache for status polling — avoids reading super-powers.json from disk every 60ms
const _statusCache = new Map(); // charId → { webcamId, timestamp }
const STATUS_CACHE_TTL = 5000;  // 5 seconds

function getCachedWebcamId(charId) {
  const entry = _statusCache.get(String(charId));
  if (entry && (Date.now() - entry.timestamp) < STATUS_CACHE_TTL) {
    return entry.webcamId;
  }
  return undefined; // cache miss
}

function setCachedWebcamId(charId, webcamId) {
  _statusCache.set(String(charId), { webcamId, timestamp: Date.now() });
}

// ─── Main page ───────────────────────────────────────────────────────
router.get('/', async (req, res) => {
  try {
    const config = await configService.readConfig();
    const currentCharacter = config.selectedCharacter;

    if (!currentCharacter) {
      return res.renderWithLayout('setup/head-animation', {
        title: 'Setup Head Animation - MonsterBox',
        page: 'setup-head-animation',
        pageTitle: 'Head Animation',
        error: 'No character selected. Please select a character from the navigation menu.',
        currentCharacter: null,
        currentCharacterName: 'No Character'
      });
    }

    const characters = await loadCharacters();
    const character = characters.find(c => c.id === currentCharacter);

    if (!character) {
      return res.renderWithLayout('setup/head-animation', {
        title: 'Setup Head Animation - MonsterBox',
        page: 'setup-head-animation',
        pageTitle: 'Head Animation',
        error: 'Selected character not found. Please select a valid character.',
        currentCharacter: null,
        currentCharacterName: 'Character Not Found'
      });
    }

    res.renderWithLayout('setup/head-animation', {
      title: 'Setup Head Animation - MonsterBox',
      page: 'setup-head-animation',
      pageTitle: 'Head Animation',
      currentCharacter: currentCharacter,
      currentCharacterName: character.name,
      character: character
    });
  } catch (error) {
    console.error('Error loading head animation page:', error);
    if (process.env.MB_TEST_MODE === '1' || process.env.MB_TEST_MODE === 'true') {
      return res.status(200).send('<!doctype html><html><head><title>Head Animation (Test Mode)</title></head><body><h1>Head Animation</h1><p>Test mode placeholder.</p></body></html>');
    }
    res.status(500).send('Internal Server Error');
  }
});

// ─── Load config + servos + webcams + status ─────────────────────────
router.get('/api/head-tracking/:charId', async (req, res) => {
  try {
    const { charId } = req.params;

    const [config, servos, webcams] = await Promise.all([
      headAnimationService.readHeadTrackingConfig(charId),
      headAnimationService.getAvailableServos(charId),
      headAnimationService.getAvailableWebcams(charId)
    ]);

    // Get tracking status if a webcam is configured
    let trackingActive = false;
    let trackingStatus = null;
    let headTrackingEnabled = false;
    if (config.webcamPartId) {
      const status = getTrackingStatusForWebcam(String(config.webcamPartId));
      trackingActive = status.active;
      trackingStatus = status.status;
      const htState = getHeadTrackingStateForWebcam(String(config.webcamPartId));
      headTrackingEnabled = htState.enabled || false;
    }

    res.json({
      success: true,
      config,
      availableServos: servos,
      availableWebcams: webcams,
      trackingActive,
      trackingStatus,
      headTrackingEnabled
    });
  } catch (error) {
    console.error('Error getting head tracking config:', error);
    res.status(500).json({ success: false, error: error.message });
  }
});

// ─── Save config ─────────────────────────────────────────────────────
router.post('/api/head-tracking/:charId', async (req, res) => {
  try {
    const { charId } = req.params;
    const htConfig = req.body;

    // Only require servo when head tracking (servo mapping) is explicitly enabled
    if (htConfig.enabled && !htConfig.panServoId) {
      return res.status(400).json({
        success: false,
        error: 'Pan servo is required when head tracking is enabled'
      });
    }

    // OpenCV requires a webcam
    if (htConfig.opencvEnabled !== false && !htConfig.webcamPartId) {
      return res.status(400).json({
        success: false,
        error: 'Webcam is required when OpenCV detection is enabled'
      });
    }

    await headAnimationService.writeHeadTrackingConfig(charId, htConfig);
    // Invalidate status cache so polling picks up new webcamPartId
    _statusCache.delete(String(charId));
    res.json({ success: true, message: 'Head tracking configuration saved' });
  } catch (error) {
    console.error('Error saving head tracking config:', error);
    res.status(500).json({ success: false, error: error.message });
  }
});

// ─── Polled status (60ms from client) ────────────────────────────────
router.get('/api/head-tracking/:charId/status', async (req, res) => {
  try {
    const { charId } = req.params;

    // Use cached webcamId to avoid reading super-powers.json from disk every 60ms
    let webcamId = getCachedWebcamId(charId);
    if (webcamId === undefined) {
      const config = await headAnimationService.readHeadTrackingConfig(charId);
      webcamId = config.webcamPartId ? String(config.webcamPartId) : null;
      setCachedWebcamId(charId, webcamId);
    }

    if (!webcamId) {
      return res.json({
        success: true,
        active: false,
        targetDetected: false,
        targetPosition: [50, 50],
        targetSize: 0,
        servoAngle: 0,
        fps: 0,
        headTrackingEnabled: false
      });
    }

    const motionStatus = getTrackingStatusForWebcam(webcamId);
    const htState = getHeadTrackingStateForWebcam(webcamId);
    const status = motionStatus.status || {};

    res.json({
      success: true,
      active: motionStatus.active,
      targetDetected: status.target_detected || false,
      targetPosition: status.target_position || [50, 50],
      targetSize: status.target_size || 0,
      bbox: status.bbox || null,
      fps: status.fps || 0,
      frameCount: status.frame_count || 0,
      headTrackingEnabled: htState.enabled || false,
      timestamp: Date.now()
    });
  } catch (error) {
    console.error('Error getting head tracking status:', error);
    res.status(500).json({ success: false, error: error.message });
  }
});

// ─── Start OpenCV motion tracking (no servo required) ────────────────
router.post('/api/head-tracking/:charId/start', async (req, res) => {
  try {
    const { charId } = req.params;
    const config = await headAnimationService.readHeadTrackingConfig(charId);

    if (!config.webcamPartId) {
      return res.status(400).json({ success: false, error: 'No webcam configured' });
    }

    const webcamId = String(config.webcamPartId);

    // Start motion tracking Python process (OpenCV only — no servo mapping here)
    const motionParams = {
      motionThreshold: config.motionThreshold,
      minContourArea: config.minContourArea,
      maxContourArea: config.maxContourArea,
      trackingSmoothing: config.smoothing,
      trackingDeadzone: config.deadzone,
      backgroundLearningRate: config.backgroundLearningRate,
      noiseReductionKernelSize: config.noiseReductionKernelSize,
      blurSize: config.blurSize,
      dilateSize: config.dilateSize,
      varThreshold: config.varThreshold
    };

    const startResult = await startTrackingForWebcam(webcamId, motionParams);

    res.json({
      success: true,
      message: 'OpenCV motion detection started',
      webcamId,
      config: startResult.config
    });
  } catch (error) {
    console.error('Error starting OpenCV tracking:', error);
    res.status(500).json({ success: false, error: error.message });
  }
});

// ─── Stop OpenCV + head tracking ─────────────────────────────────────
router.post('/api/head-tracking/:charId/stop', async (req, res) => {
  try {
    const { charId } = req.params;
    const config = await headAnimationService.readHeadTrackingConfig(charId);
    const webcamId = config.webcamPartId ? String(config.webcamPartId) : null;

    if (webcamId) {
      disableHeadTrackingForWebcam(webcamId);
      await stopTrackingForWebcam(webcamId);
    }

    res.json({ success: true, message: 'OpenCV and head tracking stopped' });
  } catch (error) {
    console.error('Error stopping head tracking:', error);
    res.status(500).json({ success: false, error: error.message });
  }
});

// ─── Enable head tracking servo mapping (while OpenCV is running) ────
router.post('/api/head-tracking/:charId/enable-servo', async (req, res) => {
  try {
    const { charId } = req.params;
    const { panServoId, centerDeg, rangeDeg, invertPan, smoothing, deadzone } = req.body;

    if (!panServoId) {
      return res.status(400).json({ success: false, error: 'panServoId is required' });
    }

    const config = await headAnimationService.readHeadTrackingConfig(charId);
    const webcamId = config.webcamPartId ? String(config.webcamPartId) : null;

    if (!webcamId) {
      return res.status(400).json({ success: false, error: 'No webcam configured' });
    }

    // Check that OpenCV is actually running
    const motionStatus = getTrackingStatusForWebcam(webcamId);
    if (!motionStatus.active) {
      return res.status(400).json({ success: false, error: 'OpenCV must be running before enabling head tracking' });
    }

    enableHeadTrackingForWebcam(webcamId, {
      panServoId,
      centerDeg: typeof centerDeg === 'number' ? centerDeg : config.centerDeg,
      rangeDeg: typeof rangeDeg === 'number' ? rangeDeg : config.rangeDeg,
      invertPan: invertPan !== undefined ? invertPan : config.invertPan,
      smoothing: typeof smoothing === 'number' ? smoothing : config.smoothing,
      deadzone: typeof deadzone === 'number' ? deadzone : config.deadzone
    });

    res.json({ success: true, message: 'Head tracking servo mapping enabled' });
  } catch (error) {
    console.error('Error enabling head tracking servo:', error);
    res.status(500).json({ success: false, error: error.message });
  }
});

// ─── Disable head tracking servo mapping (OpenCV keeps running) ──────
router.post('/api/head-tracking/:charId/disable-servo', async (req, res) => {
  try {
    const { charId } = req.params;
    const config = await headAnimationService.readHeadTrackingConfig(charId);
    const webcamId = config.webcamPartId ? String(config.webcamPartId) : null;

    if (webcamId) {
      disableHeadTrackingForWebcam(webcamId);
    }

    res.json({ success: true, message: 'Head tracking servo mapping disabled' });
  } catch (error) {
    console.error('Error disabling head tracking servo:', error);
    res.status(500).json({ success: false, error: error.message });
  }
});

// ─── Hot-update OpenCV params ────────────────────────────────────────
router.post('/api/head-tracking/:charId/params', async (req, res) => {
  try {
    const { charId } = req.params;
    const params = req.body;
    const config = await headAnimationService.readHeadTrackingConfig(charId);
    const webcamId = config.webcamPartId ? String(config.webcamPartId) : null;

    if (!webcamId) {
      return res.status(400).json({ success: false, error: 'No webcam configured' });
    }

    // Update OpenCV motion params on the running Python process
    const motionParams = {};
    if (params.motionThreshold !== undefined) motionParams.motionThreshold = params.motionThreshold;
    if (params.minContourArea !== undefined) motionParams.minContourArea = params.minContourArea;
    if (params.maxContourArea !== undefined) motionParams.maxContourArea = params.maxContourArea;
    if (params.backgroundLearningRate !== undefined) motionParams.backgroundLearningRate = params.backgroundLearningRate;
    if (params.blurSize !== undefined) motionParams.blurSize = params.blurSize;
    if (params.dilateSize !== undefined) motionParams.dilateSize = params.dilateSize;
    if (params.varThreshold !== undefined) motionParams.varThreshold = params.varThreshold;
    if (params.noiseReductionKernelSize !== undefined) motionParams.noiseReductionKernelSize = params.noiseReductionKernelSize;

    if (Object.keys(motionParams).length > 0) {
      updateTrackingParamsForWebcam(webcamId, motionParams);
    }

    // Update head tracking servo params in memory (if head tracking is active)
    if (params.smoothing !== undefined || params.deadzone !== undefined ||
        params.centerDeg !== undefined || params.rangeDeg !== undefined ||
        params.invertPan !== undefined) {
      const htState = getHeadTrackingStateForWebcam(webcamId);
      if (htState.enabled) {
        enableHeadTrackingForWebcam(webcamId, {
          panServoId: htState.panServoId || config.panServoId,
          centerDeg: params.centerDeg !== undefined ? params.centerDeg : config.centerDeg,
          rangeDeg: params.rangeDeg !== undefined ? params.rangeDeg : config.rangeDeg,
          invertPan: params.invertPan !== undefined ? params.invertPan : config.invertPan,
          smoothing: params.smoothing !== undefined ? params.smoothing : config.smoothing,
          deadzone: params.deadzone !== undefined ? params.deadzone : config.deadzone
        });
      }
    }

    res.json({ success: true, message: 'Parameters updated' });
  } catch (error) {
    console.error('Error updating head tracking params:', error);
    res.status(500).json({ success: false, error: error.message });
  }
});

// ─── Check requirements ──────────────────────────────────────────────
router.get('/api/head-tracking/:charId/requirements', async (req, res) => {
  try {
    const { charId } = req.params;

    const [servos, webcams] = await Promise.all([
      headAnimationService.getAvailableServos(charId),
      headAnimationService.getAvailableWebcams(charId)
    ]);

    // Check mjpg-streamer health
    let mjpgStreamerOk = false;
    try {
      const response = await fetch('http://localhost:8090/', {
        method: 'GET',
        signal: AbortSignal.timeout(3000)
      });
      mjpgStreamerOk = response.status !== 0;
    } catch (_) {
      mjpgStreamerOk = false;
    }

    const canEnable = servos.length > 0 && webcams.length > 0 && mjpgStreamerOk;

    res.json({
      success: true,
      canEnable,
      requirements: {
        servos: servos.length > 0,
        webcams: webcams.length > 0,
        mjpgStreamer: mjpgStreamerOk
      },
      availableServos: servos,
      availableWebcams: webcams
    });
  } catch (error) {
    console.error('Error checking head tracking requirements:', error);
    res.status(500).json({ success: false, error: error.message });
  }
});

// ─── Presets CRUD ────────────────────────────────────────────────────
router.get('/api/head-tracking/:charId/presets', async (req, res) => {
  try {
    const presets = await headAnimationService.listPresets(req.params.charId);
    res.json({ success: true, presets });
  } catch (error) {
    res.status(500).json({ success: false, error: error.message });
  }
});

router.post('/api/head-tracking/:charId/presets', async (req, res) => {
  try {
    const preset = await headAnimationService.savePreset(req.params.charId, req.body);
    res.json({ success: true, preset });
  } catch (error) {
    res.status(500).json({ success: false, error: error.message });
  }
});

router.delete('/api/head-tracking/:charId/presets/:presetId', async (req, res) => {
  try {
    await headAnimationService.deletePreset(req.params.charId, req.params.presetId);
    res.json({ success: true });
  } catch (error) {
    res.status(400).json({ success: false, error: error.message });
  }
});

// ─── Test sweep ──────────────────────────────────────────────────────
router.post('/api/head-tracking/:charId/test-sweep', async (req, res) => {
  try {
    const { charId } = req.params;
    const config = await headAnimationService.readHeadTrackingConfig(charId);

    if (!config.panServoId) {
      return res.status(400).json({ success: false, error: 'No pan servo configured' });
    }

    const servos = await headAnimationService.getAvailableServos(charId);
    const servo = servos.find(s => s.id === String(config.panServoId));

    if (!servo) {
      return res.status(400).json({ success: false, error: 'Pan servo not found' });
    }

    const minAngle = servo.calibrated && servo.minAngle != null ? servo.minAngle : 0;
    const maxAngle = servo.calibrated && servo.maxAngle != null ? servo.maxAngle : 180;
    const centerAngle = Math.round((minAngle + maxAngle) / 2);

    // Sweep: center -> min -> max -> center
    const steps = [centerAngle, minAngle, maxAngle, centerAngle];
    const delay = 500;

    for (let i = 0; i < steps.length; i++) {
      await hardwareService.controlPart(config.panServoId, 'moveToAngle', { angleDeg: steps[i] });
      if (i < steps.length - 1) {
        await new Promise(resolve => setTimeout(resolve, delay));
      }
    }

    res.json({
      success: true,
      message: 'Sweep completed',
      steps,
      minAngle,
      maxAngle
    });
  } catch (error) {
    console.error('Error in test sweep:', error);
    res.status(500).json({ success: false, error: error.message });
  }
});

// ─── Manual target (click-to-track) ─────────────────────────────────
router.post('/api/head-tracking/:charId/manual-target', async (req, res) => {
  try {
    if (process.env.MB_TEST_MODE === '1' || process.env.MB_TEST_MODE === 'true') {
      return res.json({ success: true, testMode: true });
    }
    const { x, y, durationSec } = req.body || {};
    if (x == null || y == null) {
      return res.status(400).json({ success: false, error: 'x and y required (0-100%)' });
    }
    const { charId } = req.params;
    const config = await headAnimationService.readHeadTrackingConfig(charId);
    if (!config.webcamPartId) {
      return res.status(400).json({ success: false, error: 'No webcam configured' });
    }
    motionTrackingController.setManualTarget(config.webcamPartId, parseFloat(x), parseFloat(y), durationSec || 30);
    res.json({ success: true, x, y, durationSec: durationSec || 30 });
  } catch (error) {
    res.status(500).json({ success: false, error: error.message });
  }
});

export default router;
