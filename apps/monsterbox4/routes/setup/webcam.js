/**
 * Setup Webcam Routes
 * Routes for webcam configuration interface
 */

import express from 'express';

const router = express.Router();

// Setup webcam page
router.get('/', async (req, res) => {
    try {
        res.render('setup/webcam', {
            title: 'Setup Webcam - MonsterBox 4.0',
            page: 'setup-webcam'
        });
    } catch (error) {
        console.error('Error rendering webcam setup page:', error);
        res.status(500).render('error', {
            title: 'Error',
            error: 'Failed to load webcam setup page',
            message: error.message
        });
    }
});

export default router;
