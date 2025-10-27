/**
 * Poses Routes
 * API endpoints for pose management and execution
 */

import express from 'express';
import posesController from '../../controllers/posesController.js';

const router = express.Router();

function wantsJson(req) {
    if ((req.query.format || '').toLowerCase() === 'json') {
        return true;
    }
    const accept = (req.headers.accept || '').toLowerCase();
    return accept.includes('application/json');
}

// Get all poses / poses dashboard
router.get('/', async (req, res, next) => {
    if (wantsJson(req)) {
        return posesController.getAllPoses(req, res);
    }
    try {
        res.renderWithLayout('poses/index', {
            title: 'Poses - MonsterBox 5.5',
            page: 'poses',
            pageHeading: 'Poses'
        });
    } catch (error) {
        next(error);
    }
});

router.get('/api/poses', posesController.getAllPoses);

// Get pose templates
router.get('/templates', posesController.getTemplates);

// Get poses by category
router.get('/category/:category', posesController.getPosesByCategory);

// Create pose from template
router.post('/from-template', posesController.createFromTemplate);

// Get specific pose
router.get('/api/poses/:id', posesController.getPose);
router.get('/:id', posesController.getPose);

// Create new pose
router.post('/', posesController.createPose);

// Update pose
router.put('/:id', posesController.updatePose);

// Delete pose
router.delete('/:id', posesController.deletePose);

// Execute pose
router.post('/:id/execute', posesController.executePose);
router.post('/api/poses/:id/execute', posesController.executePose);

export default router;
