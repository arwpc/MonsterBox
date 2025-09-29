/**
 * Setup Super Powers Routes
 * Routes for super powers (jaw animation) configuration interface
 */

import express from 'express';

const router = express.Router();

// Setup super powers page
router.get('/', async (req, res) => {
    try {
        const inTest = (process.env.MB_TEST_MODE === '1' || process.env.MB_TEST_MODE === 'true');
        const selectedCharacterId = String(req.app.locals?.config?.selectedCharacter || '');
        const characters = inTest ? [
            { id: 1, name: 'Test Character' },
            { id: 5, name: 'Phantom Five' }
        ] : (req.app.locals?.characters || []);

        res.render('setup/super-powers', {
            title: 'Setup Super Powers - MonsterBox 4.0',
            page: 'setup-super-powers',
            characters,
            selectedCharacterId
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
