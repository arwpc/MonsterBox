/**
 * Setup Poses Routes
 * Routes for pose setup and management interface
 */

import express from 'express';
import posesController from '../../controllers/posesController.js';

const router = express.Router();

// Setup poses page
router.get('/', async (req, res) => {
    try {
        res.render('setup/poses', {
            title: 'Setup Poses - MonsterBox 5.3',
            page: 'setup-poses',
            config: { theme: 'dark' }
        });
    } catch (error) {
        console.error('Error rendering poses setup page:', error);
        res.status(500).render('error', {
            title: 'Error',
            page: 'error',
            config: { theme: 'dark' },
            error: 'Failed to load poses setup page',
            message: error.message
        });
    }
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
