/**
 * Setup Parts Routes
 * Routes for parts management interface
 */

import express from 'express';
import partsController from '../../controllers/partsController.js';
import hardwareService from '../../services/hardwareService/index.js';

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

// Speaker stream management endpoints
router.get('/api/speaker/streams', async (req, res) => {
    try {
        const { partId } = req.query;
        const result = await hardwareService.HARDWARE_CONTROLLERS.speaker.listStreams({ partId });
        res.json(result);
    } catch (error) {
        console.error('Error listing speaker streams:', error);
        res.status(500).json({ success: false, error: error.message });
    }
});

router.post('/api/speaker/move-stream', async (req, res) => {
    try {
        const { streamId, sinkId } = req.body;
        if (!streamId || !sinkId) {
            return res.status(400).json({ success: false, error: 'streamId and sinkId are required' });
        }

        const result = await hardwareService.HARDWARE_CONTROLLERS.speaker.moveStream({ streamId, sinkId });
        res.json(result);
    } catch (error) {
        console.error('Error moving speaker stream:', error);
        res.status(500).json({ success: false, error: error.message });
    }
});

router.get('/api/speaker/stats', async (req, res) => {
    try {
        const result = await hardwareService.HARDWARE_CONTROLLERS.speaker.getStreamStats();
        res.json(result);
    } catch (error) {
        console.error('Error getting speaker stats:', error);
        res.status(500).json({ success: false, error: error.message });
    }
});

export default router;
