/**
 * Scenes Routes
 * Routes for scene management interface — Animation Studio
 */

import express from 'express';

const router = express.Router();

// Animation Studio — unified scenes, poses, timeline editor
router.get('/', async (req, res) => {
    try {
        res.renderWithLayout('scenes/studio', {
            title: 'Animation Studio - MonsterBox',
            page: 'scenes',
            includeMainWrapper: false
        });
    } catch (error) {
        console.error('Error rendering Animation Studio:', error);
        res.status(500);
        res.renderWithLayout('error', {
            title: 'Error',
            page: 'error',
            error: 'Failed to load Animation Studio',
            message: error.message
        });
    }
});

// Scene editor page - edit existing scene (redirect to studio with ?edit=id)
router.get('/edit/:id', async (req, res) => {
    res.redirect('/scenes?edit=' + encodeURIComponent(req.params.id));
});

// Scene editor page - new scene (redirect to studio)
router.get('/edit/new', async (req, res) => {
    res.redirect('/scenes');
});

export default router;
