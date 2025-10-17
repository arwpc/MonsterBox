/**
 * Armed/Active Mode Routes
 * API endpoints for automated scene execution
 */

import express from 'express';
import armedModeService from '../../services/scenes/armedModeService.js';

const router = express.Router();

/**
 * GET /scenes/armed-mode/status
 * Get current armed mode status
 */
router.get('/status', async (req, res) => {
  try {
    const status = armedModeService.getStatus();
    res.json({ success: true, status });
  } catch (error) {
    console.error('Error getting armed mode status:', error);
    res.status(500).json({ success: false, error: error.message });
  }
});

/**
 * POST /scenes/armed-mode/arm
 * Arm the system with a playlist of scenes
 * Body: { characterId, sceneIds: [id1, id2, ...], config: { sceneDelay, maxRetries, etc } }
 */
router.post('/arm', async (req, res) => {
  try {
    const { characterId, sceneIds, config } = req.body;

    if (!characterId) {
      return res.status(400).json({ success: false, error: 'Character ID is required' });
    }

    if (!Array.isArray(sceneIds) || sceneIds.length === 0) {
      return res.status(400).json({ success: false, error: 'At least one scene ID is required' });
    }

    const status = await armedModeService.arm(characterId, sceneIds, config);
    res.json({ success: true, message: 'System armed', status });
  } catch (error) {
    console.error('Error arming system:', error);
    res.status(500).json({ success: false, error: error.message });
  }
});

/**
 * POST /scenes/armed-mode/disarm
 * Disarm the system
 */
router.post('/disarm', async (req, res) => {
  try {
    const result = await armedModeService.disarm();
    res.json(result);
  } catch (error) {
    console.error('Error disarming system:', error);
    res.status(500).json({ success: false, error: error.message });
  }
});

/**
 * POST /scenes/armed-mode/playlist
 * Update the scene playlist
 * Body: { sceneIds: [id1, id2, ...] }
 */
router.post('/playlist', async (req, res) => {
  try {
    const { sceneIds } = req.body;

    if (!Array.isArray(sceneIds) || sceneIds.length === 0) {
      return res.status(400).json({ success: false, error: 'At least one scene ID is required' });
    }

    const result = await armedModeService.updatePlaylist(sceneIds);
    res.json(result);
  } catch (error) {
    console.error('Error updating playlist:', error);
    res.status(500).json({ success: false, error: error.message });
  }
});

/**
 * GET /scenes/armed-mode/playlist
 * Get current playlist
 */
router.get('/playlist', async (req, res) => {
  try {
    const status = armedModeService.getStatus();
    res.json({ success: true, playlist: status.playlist });
  } catch (error) {
    console.error('Error getting playlist:', error);
    res.status(500).json({ success: false, error: error.message });
  }
});

/**
 * POST /scenes/armed-mode/config
 * Update configuration
 * Body: { sceneDelay, maxRetries, sceneTimeout, maxConsecutiveFailures }
 */
router.post('/config', async (req, res) => {
  try {
    const config = req.body;
    const result = await armedModeService.updateConfig(config);
    res.json(result);
  } catch (error) {
    console.error('Error updating config:', error);
    res.status(500).json({ success: false, error: error.message });
  }
});

export default router;

