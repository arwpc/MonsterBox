/**
 * Setup System Routes
 * Routes for system configuration interface
 */

import express from 'express';

const router = express.Router();

// Setup system page
router.get('/', async (req, res) => {
    try {
        res.renderWithLayout('setup/system', {
            title: 'Setup System - MonsterBox',
            page: 'setup-system'
        });
    } catch (error) {
        console.error('Error rendering system setup page:', error);
        res.status(500).renderWithLayout('error', {
            title: 'Error',
            page: 'error',
            error: 'Failed to load system setup page',
            message: error.message
        });
    }
});

export default router;
