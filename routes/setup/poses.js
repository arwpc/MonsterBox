/**
 * Setup Poses Routes
 * Routes for pose setup and management interface
 */

import express from 'express';
import posesController from '../../controllers/posesController.js';

const router = express.Router();

// Redirect to Animation Studio (poses are now integrated there)
router.get('/', (req, res) => {
    res.redirect('/scenes');
});

// API endpoints for setup interface
router.get('/api/poses', posesController.getAllPoses);
router.get('/api/templates', posesController.getTemplates);
router.post('/api/poses', posesController.createPose);
router.post('/api/poses/from-template', posesController.createFromTemplate);
router.put('/api/poses/:id', posesController.updatePose);
router.delete('/api/poses/:id', posesController.deletePose);
router.post('/api/poses/:id/test', posesController.executePose);

export default router;
