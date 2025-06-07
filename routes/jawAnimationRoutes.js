const express = require('express');
const router = express.Router();
const jawAnimationController = require('../controllers/jawAnimationController');

// Jaw Animation Test Page
router.get('/test', jawAnimationController.getTestPage);

// Debug route to check file paths and working directory
router.get('/api/debug', (req, res) => {
    const path = require('path');
    const fs = require('fs');

    const partsPath = path.join(process.cwd(), 'data', 'parts.json');
    const debugInfo = {
        cwd: process.cwd(),
        partsPath: partsPath,
        partsExists: fs.existsSync(partsPath),
        __dirname: __dirname,
        nodeVersion: process.version,
        platform: process.platform
    };

    if (fs.existsSync(partsPath)) {
        try {
            const stats = fs.statSync(partsPath);
            debugInfo.partsFileSize = stats.size;
            debugInfo.partsModified = stats.mtime;
        } catch (error) {
            debugInfo.partsError = error.message;
        }
    }

    res.json(debugInfo);
});

// Test endpoint to bypass controller
router.get('/api/servo-test/:characterId', async (req, res) => {
    try {
        const characterId = parseInt(req.params.characterId);
        const partService = require('../services/partService');

        const parts = await partService.getAllParts();
        const jawServo = parts.find(part =>
            part.characterId === characterId &&
            part.type === 'servo' &&
            part.name && part.name.toLowerCase().includes('jaw')
        );

        if (!jawServo) {
            // Try broader search
            const anyServo = parts.find(part =>
                part.characterId === characterId &&
                part.type === 'servo'
            );

            return res.json({
                error: 'No jaw servo found',
                debug: {
                    characterId: characterId,
                    totalParts: parts.length,
                    servosForCharacter: parts.filter(p => p.characterId === characterId && p.type === 'servo'),
                    anyServoFound: anyServo
                }
            });
        }

        res.json({
            servo: jawServo,
            status: 'success'
        });
    } catch (error) {
        res.status(500).json({
            error: 'Failed to get servo configuration',
            details: error.message
        });
    }
});

// API Routes
router.get('/api/servo/:characterId', jawAnimationController.getServoConfig);
router.post('/api/servo/:characterId/test', jawAnimationController.testServo);
router.post('/api/servo/:characterId/angle', jawAnimationController.setServoAngle);
router.post('/api/animation/:characterId/start', jawAnimationController.startAnimation);
router.post('/api/animation/:characterId/stop', jawAnimationController.stopAnimation);
router.get('/api/animation/:characterId/status', jawAnimationController.getAnimationStatus);

module.exports = router;
