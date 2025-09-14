/**
 * Setup Calibration Routes
 * Routes for servo calibration interface
 */

import express from 'express';

const router = express.Router();

// Setup calibration page
router.get('/', async (req, res) => {
    try {
        res.render('setup/calibration', {
            title: 'Setup Calibration - MonsterBox 4.0',
            page: 'setup-calibration'
        });
    } catch (error) {
        console.error('Error rendering calibration setup page:', error);
        res.status(500).render('error', {
            title: 'Error',
            error: 'Failed to load calibration setup page',
            message: error.message
        });
    }
});

export default router;
