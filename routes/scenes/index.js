/**
 * Scenes Routes
 * Routes for scene management interface
 */

import express from 'express';

const router = express.Router();

// Scenes page
router.get('/', async (req, res) => {
    try {
        res.renderWithLayout('scenes/scenes', {
            title: 'Scenes - MonsterBox 5.3',
            page: 'scenes'
        });
    } catch (error) {
        console.error('Error rendering scenes page:', error);
        res.status(500);
        res.renderWithLayout('error', {
            title: 'Error',
            page: 'error',
            error: 'Failed to load scenes page',
            message: error.message
        });
    }
});

export default router;
