/**
 * Live Dashboard Routes
 * Routes for live mode dashboard interface
 */

import express from 'express';
import posesController from '../../controllers/posesController.js';

const router = express.Router();

// Live dashboard page
router.get('/', async (req, res) => {
    try {
        res.render('live/dashboard', {
            title: 'Live Dashboard - MonsterBox 4.0',
            page: 'live-dashboard',
            config: { theme: 'dark' },
            currentCharacter: null
        });
    } catch (error) {
        console.error('Error rendering live dashboard page:', error);
        res.status(500).render('error', {
            title: 'Error',
            page: 'error',
            config: { theme: 'dark' },
            currentCharacter: null,
            error: 'Failed to load live dashboard page',
            message: error.message
        });
    }
});

// API endpoints for live dashboard
router.get('/api/poses', posesController.getAllPoses);
router.post('/api/poses/:id/execute', posesController.executePose);

export default router;
