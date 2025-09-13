/**
 * Setup Super Powers Routes
 * Routes for super powers (jaw animation) configuration interface
 */

import express from 'express';

const router = express.Router();

// Setup super powers page
router.get('/', async (req, res) => {
    try {
        res.render('setup/super-powers', {
            title: 'Setup Super Powers - MonsterBox 4.0',
            page: 'setup-super-powers'
        });
    } catch (error) {
        console.error('Error rendering super powers setup page:', error);
        res.status(500).render('error', {
            title: 'Error',
            error: 'Failed to load super powers setup page',
            message: error.message
        });
    }
});

export default router;
