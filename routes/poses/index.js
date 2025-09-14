/**
 * Poses Routes
 * API endpoints for pose management and execution
 */

import express from 'express';
import posesController from '../../controllers/posesController.js';

const router = express.Router();

// Get all poses
router.get('/', posesController.getAllPoses);

// Get pose templates
router.get('/templates', posesController.getTemplates);

// Get poses by category
router.get('/category/:category', posesController.getPosesByCategory);

// Create pose from template
router.post('/from-template', posesController.createFromTemplate);

// Get specific pose
router.get('/:id', posesController.getPose);

// Create new pose
router.post('/', posesController.createPose);

// Update pose
router.put('/:id', posesController.updatePose);

// Delete pose
router.delete('/:id', posesController.deletePose);

// Execute pose
router.post('/:id/execute', posesController.executePose);

export default router;
