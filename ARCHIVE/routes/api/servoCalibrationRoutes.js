const express = require('express');
const router = express.Router();
const logger = require('../../scripts/logger');
const { getServoClient } = require('../../services/servoWebSocketClient');

function requireWs(res) {
  const servoClient = getServoClient();
  if (!servoClient.isConnected) {
    res.status(503).json({ success: false, message: 'Servo WebSocket service not available' });
    return null;
  }
  return servoClient;
}

// GET /api/servo-calibration/status/:servoId
router.get('/status/:servoId', async (req, res) => {
  try {
    const { servoId } = req.params;
    const servoClient = requireWs(res);
    if (!servoClient) return;

    const result = await servoClient.sendRequest('get_calibration_status', { servo_id: String(servoId) }, 5000);
    res.json({ success: result.status === 'success', data: result });
  } catch (err) {
    logger.error('Error getting calibration status:', err);
    res.status(500).json({ success: false, message: err.message });
  }
});

// GET /api/servo-calibration/pulse/:servoId
router.get('/pulse/:servoId', async (req, res) => {
  try {
    const { servoId } = req.params;
    const servoClient = requireWs(res);
    if (!servoClient) return;

    const result = await servoClient.sendRequest('get_current_pulse_width', { servo_id: String(servoId) }, 5000);
    res.json({ success: result.status === 'success', data: result });
  } catch (err) {
    logger.error('Error getting current pulse:', err);
    res.status(500).json({ success: false, message: err.message });
  }
});

// POST /api/servo-calibration/save-position
router.post('/save-position', async (req, res) => {
  try {
    const { servoId, position, description, pulse_us, angle } = req.body;
    if (!servoId || !position) {
      return res.status(400).json({ success: false, message: 'servoId and position are required' });
    }
    const servoClient = requireWs(res);
    if (!servoClient) return;

    const result = await servoClient.sendRequest('save_calibration_position', {
      servo_id: String(servoId),
      position,
      description,
      pulse_us: pulse_us ? parseInt(pulse_us) : undefined,
      angle: angle ? parseFloat(angle) : undefined
    }, 8000);

    res.json({ success: result.status === 'success', data: result });
  } catch (err) {
    logger.error('Error saving calibration position:', err);
    res.status(500).json({ success: false, message: err.message });
  }
});

// POST /api/servo-calibration/test-position
router.post('/test-position', async (req, res) => {
  try {
    const { servoId, position, duration } = req.body;
    if (!servoId || !position) {
      return res.status(400).json({ success: false, message: 'servoId and position are required' });
    }
    const servoClient = requireWs(res);
    if (!servoClient) return;

    const result = await servoClient.sendRequest('test_calibrated_position', {
      servo_id: String(servoId),
      position,
      duration: duration ? parseFloat(duration) : undefined
    }, 15000);

    res.json({ success: result.status === 'success', data: result });
  } catch (err) {
    logger.error('Error testing calibrated position:', err);
    res.status(500).json({ success: false, message: err.message });
  }
});

// Convenience pass-through to auto range test
router.post('/auto-range-test', async (req, res) => {
  try {
    const { servoId } = req.body;
    if (!servoId) {
      return res.status(400).json({ success: false, message: 'servoId is required' });
    }
    const servoClient = requireWs(res);
    if (!servoClient) return;

    const result = await servoClient.sendRequest('servo_auto_range_test', { servo_id: String(servoId) }, 30000);
    res.json({ success: result.status === 'success', data: result });
  } catch (err) {
    logger.error('Error running auto-range-test:', err);
    res.status(500).json({ success: false, message: err.message });
  }
});

// POST /api/servo-calibration/reset
router.post('/reset', async (req, res) => {
  try {
    const { servoId } = req.body;
    if (!servoId) {
      return res.status(400).json({ success: false, message: 'servoId is required' });
    }
    const servoClient = requireWs(res);
    if (!servoClient) return;

    const result = await servoClient.sendRequest('reset_calibration', { servo_id: String(servoId) }, 10000);
    res.json({ success: result.status === 'success', data: result });
  } catch (err) {
    logger.error('Error resetting calibration:', err);
    res.status(500).json({ success: false, message: err.message });
  }
});

// POST /api/servo-calibration/reconnect
router.post('/reconnect', async (req, res) => {
  try {
    const servoClient = getServoClient();
    // Force a fresh discovery and connect cycle
    if (servoClient && typeof servoClient.disconnect === 'function') {
      servoClient.disconnect();
    }
    if (servoClient && typeof servoClient.discoverServoService === 'function') {
      servoClient.discoverServoService();
    } else if (servoClient && typeof servoClient.connect === 'function') {
      servoClient.connect();
    }
    res.json({ success: true, message: 'Reconnect triggered' });
  } catch (err) {
    logger.error('Error triggering reconnect:', err);
    res.status(500).json({ success: false, message: err.message });
  }
});

module.exports = router;

