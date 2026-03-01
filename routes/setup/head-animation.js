import express from 'express';
import { loadCharacters } from '../../services/characterService.js';
import * as configService from '../../services/configService.js';
import * as headAnimationService from '../../services/headAnimationSuperPowerService.js';
import {
  startTrackingForWebcam,
  stopTrackingForWebcam,
  enableHeadTrackingForWebcam,
  disableHeadTrackingForWebcam,
  getTrackingStatusForWebcam,
  getHeadTrackingStateForWebcam,
  updateTrackingParamsForWebcam
} from '../../controllers/motionTrackingController.js';
import hardwareService from '../../services/hardwareService/index.js';

const router = express.Router();

/**
 * Head Animation Setup Routes
 * Configures and tests OpenCV-based head tracking with servo mapping.
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
    if (config.webcamPartId) {
      const status = getTrackingStatusForWebcam(String(config.webcamPartId));
      trackingActive = status.active;
      trackingStatus = status.status;
    }

    res.json({
      success: true,
      config,
      availableServos: servos,
      availableWebcams: webcams,
      trackingActive,
      trackingStatus
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

    if (htConfig.enabled && !htConfig.panServoId) {
      return res.status(400).json({
        success: false,
        error: 'Pan servo is required when head tracking is enabled'
      });
    }

    if (htConfig.enabled && !htConfig.webcamPartId) {
      return res.status(400).json({
        success: false,
        error: 'Webcam is required when head tracking is enabled'
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

// ─── Start tracking ──────────────────────────────────────────────────
router.post('/api/head-tracking/:charId/start', async (req, res) => {
  try {
    const { charId } = req.params;
    const config = await headAnimationService.readHeadTrackingConfig(charId);

    if (!config.webcamPartId) {
      return res.status(400).json({ success: false, error: 'No webcam configured' });
    }

    const webcamId = String(config.webcamPartId);

    // Start motion tracking Python process
    const motionParams = {
      motionThreshold: config.motionThreshold,
      minContourArea: config.minContourArea,
      maxContourArea: config.maxContourArea,
      trackingSmoothing: config.smoothing,
      trackingDeadzone: config.deadzone,
      backgroundLearningRate: config.backgroundLearningRate,
      noiseReductionKernelSize: config.noiseReductionKernelSize
    };

    const startResult = await startTrackingForWebcam(webcamId, motionParams);

    // Enable head tracking servo mapping if servo is configured
    if (config.panServoId) {
      enableHeadTrackingForWebcam(webcamId, {
        panServoId: config.panServoId,
        centerDeg: config.centerDeg,
        rangeDeg: config.rangeDeg,
        invertPan: config.invertPan,
        smoothing: config.smoothing,
        deadzone: config.deadzone
      });
    }

    res.json({
      success: true,
      message: 'Head tracking started',
      webcamId,
      config: startResult.config
    });
  } catch (error) {
    console.error('Error starting head tracking:', error);
    res.status(500).json({ success: false, error: error.message });
  }
});

// ─── Stop tracking ───────────────────────────────────────────────────
router.post('/api/head-tracking/:charId/stop', async (req, res) => {
  try {
    const { charId } = req.params;
    const config = await headAnimationService.readHeadTrackingConfig(charId);
    const webcamId = config.webcamPartId ? String(config.webcamPartId) : null;

    if (webcamId) {
      disableHeadTrackingForWebcam(webcamId);
      await stopTrackingForWebcam(webcamId);
    }

    res.json({ success: true, message: 'Head tracking stopped' });
  } catch (error) {
    console.error('Error stopping head tracking:', error);
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
    if (params.noiseReductionKernelSize !== undefined) motionParams.noiseReductionKernelSize = params.noiseReductionKernelSize;

    if (Object.keys(motionParams).length > 0) {
      updateTrackingParamsForWebcam(webcamId, motionParams);
    }

    // Update head tracking servo params in memory
    if (params.smoothing !== undefined || params.deadzone !== undefined ||
        params.centerDeg !== undefined || params.rangeDeg !== undefined ||
        params.invertPan !== undefined) {
      enableHeadTrackingForWebcam(webcamId, {
        panServoId: config.panServoId,
        centerDeg: params.centerDeg !== undefined ? params.centerDeg : config.centerDeg,
        rangeDeg: params.rangeDeg !== undefined ? params.rangeDeg : config.rangeDeg,
        invertPan: params.invertPan !== undefined ? params.invertPan : config.invertPan,
        smoothing: params.smoothing !== undefined ? params.smoothing : config.smoothing,
        deadzone: params.deadzone !== undefined ? params.deadzone : config.deadzone
      });
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

export default router;
