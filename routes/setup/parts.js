/**
 * Setup Parts Routes
 * Routes for parts management interface
 */

import express from 'express';
import multer from 'multer';
import partsController, { getPartByIdHelper } from '../../controllers/partsController.js';
import hardwareService from '../../services/hardwareService/index.js';

const router = express.Router();

// Configure multer for audio file uploads
const upload = multer({
    storage: multer.memoryStorage(),
    limits: {
        fileSize: 50 * 1024 * 1024 // 50MB limit for audio files
    },
    fileFilter: (req, file, cb) => {
        // Accept audio files
        if (file.mimetype.startsWith('audio/')) {
            cb(null, true);
        } else {
            cb(new Error('Only audio files are allowed'), false);
        }
    }
});

// Setup parts page
router.get('/', async (req, res) => {
    try {
        res.render('setup/parts', {
            title: 'Setup Parts - MonsterBox 4.0',
            page: 'setup-parts',
            config: { theme: 'dark' }
        });
    } catch (error) {
        console.error('Error rendering parts setup page:', error);
        res.status(500).render('error', {
            title: 'Error',
            page: 'error',
            config: { theme: 'dark' },
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

// Play audio through specific speaker part
router.post('/api/parts/:id/play-audio', upload.single('audio'), async (req, res) => {
    try {
        const partId = req.params.id;

        if (!req.file) {
            return res.status(400).json({
                success: false,
                error: 'No audio file provided'
            });
        }

        // Get the part details
        const part = await getPartByIdHelper(partId);
        if (!part || part.type !== 'speaker') {
            return res.status(404).json({
                success: false,
                error: 'Speaker part not found'
            });
        }

        // Save the audio file temporarily and play it
        const fs = await import('fs');
        const path = await import('path');
        const tempDir = '/tmp';
        const tempFilename = `tts-${Date.now()}.mp3`;
        const tempPath = path.join(tempDir, tempFilename);

        // Write the audio buffer to a temporary file
        await fs.promises.writeFile(tempPath, req.file.buffer);

        // Play the audio through the speaker using controlPart
        const result = await hardwareService.controlPart(partId, 'play', {
            filename: tempPath,
            volume: part.config?.volume || 50
        });

        // Clean up the temporary file after a delay
        setTimeout(() => {
            fs.promises.unlink(tempPath).catch(err => {
                console.warn('Failed to clean up temp audio file:', err);
            });
        }, 5000);

        res.json({
            success: true,
            message: `Audio playing through ${part.name}`,
            result: result
        });

    } catch (error) {
        console.error('Error playing audio through speaker:', error);
        res.status(500).json({
            success: false,
            error: error.message
        });
    }
});

export default router;
