/**
 * Setup Audio Routes
 * Routes for audio configuration interface
 */

import express from 'express';

const router = express.Router();

// Setup audio page
router.get('/', async (req, res) => {
    try {
        res.render('setup/audio', {
            title: 'Setup Audio - MonsterBox 4.0',
            page: 'setup-audio'
        });
    } catch (error) {
        console.error('Error rendering audio setup page:', error);
        res.status(500).render('error', {
            title: 'Error',
            error: 'Failed to load audio setup page',
            message: error.message
        });
    }
});

export default router;
