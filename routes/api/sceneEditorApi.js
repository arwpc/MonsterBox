/**
 * Scene Editor API Routes
 * Provides data endpoints for the scene editor
 */

import express from 'express';
import { loadParts } from '../../controllers/partsController.js';
import poseRepository from '../../services/poses/poseRepository.js';
import audioLibraryService from '../../services/audioLibraryService.js';
import goblinManagerService from '../../services/goblinManagerService.js';

const router = express.Router();

function getCurrentCharacterId(req) {
  return (parseInt(req.app.locals?.config?.selectedCharacter, 10)) || null;
}

/**
 * GET /api/parts - Get all parts for scene editor
 */
router.get('/parts', async (req, res) => {
  try {
    const parts = await loadParts();
    res.json({
      success: true,
      parts: parts
    });
  } catch (error) {
    console.error('Error loading parts:', error);
    res.status(500).json({
      success: false,
      error: 'Failed to load parts',
      message: error.message
    });
  }
});

/**
 * GET /api/poses - Get all poses for scene editor
 */
router.get('/poses', async (req, res) => {
  try {
    const characterId = getCurrentCharacterId(req);
    const posesData = await poseRepository.loadPoses(characterId);
    res.json({
      success: true,
      poses: posesData.poses || []
    });
  } catch (error) {
    console.error('Error loading poses:', error);
    res.status(500).json({
      success: false,
      error: 'Failed to load poses',
      message: error.message
    });
  }
});

/**
 * GET /api/sounds - Get all audio files for scene editor
 */
router.get('/sounds', async (req, res) => {
  try {
    const result = await audioLibraryService.getAudioFiles({ sortBy: 'title' });
    const sounds = result.audio.map(audio => ({
      id: audio.id,
      name: audio.title,
      filename: audio.filename,
      duration: audio.duration,
      format: audio.format
    }));
    res.json({
      success: true,
      sounds: sounds
    });
  } catch (error) {
    console.error('Error loading sounds:', error);
    res.status(500).json({
      success: false,
      error: 'Failed to load sounds',
      message: error.message
    });
  }
});

/**
 * GET /api/goblins - Get all goblins for scene editor
 */
router.get('/goblins', async (req, res) => {
  try {
    const result = await goblinManagerService.getGoblins({});
    res.json({
      success: true,
      goblins: result.goblins || []
    });
  } catch (error) {
    console.error('Error loading goblins:', error);
    res.status(500).json({
      success: true, // Don't fail if goblins aren't available
      goblins: []
    });
  }
});

export default router;

