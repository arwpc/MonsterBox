/**
 * Setup Parts Routes
 * Routes for parts management interface
 */

import express from 'express';
import partsController from '../../controllers/partsController.js';

const router = express.Router();

// Setup parts page
router.get('/', async (req, res) => {
    try {
        res.render('setup/parts', {
            title: 'Setup Parts - MonsterBox 4.0',
            page: 'setup-parts',
            config: { theme: 'dark' },
            currentCharacter: null
        });
    } catch (error) {
        console.error('Error rendering parts setup page:', error);
        res.status(500).render('error', {
            title: 'Error',
            page: 'error',
            config: { theme: 'dark' },
            currentCharacter: null,
            error: 'Failed to load parts setup page',
            message: error.message
        });
    }
});

// API endpoints for parts management
router.get('/api/parts', partsController.getAllParts);
router.get('/api/parts/:id', partsController.getPartById);
router.post('/api/parts', partsController.createPart);
router.put('/api/parts/:id', partsController.updatePart);
router.delete('/api/parts/:id', partsController.deletePart);
router.post('/api/parts/:id/test', partsController.testPart);

export default router;
