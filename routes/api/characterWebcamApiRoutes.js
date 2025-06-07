const express = require('express');
const router = express.Router();
const characterWebcamService = require('../../services/characterWebcamService');
const logger = require('../../scripts/logger');

// Assign webcam to character
router.post('/assign', async (req, res) => {
    try {
        const { characterId, webcamId } = req.body;

        if (!characterId || !webcamId) {
            return res.status(400).json({
                success: false,
                message: 'Character ID and webcam ID are required'
            });
        }

        const result = await characterWebcamService.assignWebcam(
            parseInt(characterId), 
            parseInt(webcamId)
        );

        if (result.success) {
            res.json(result);
        } else {
            res.status(400).json(result);
        }
    } catch (error) {
        logger.error('Error in assign webcam API:', error);
        res.status(500).json({
            success: false,
            message: 'Internal server error',
            error: error.message
        });
    }
});

// Remove webcam from character
router.post('/remove', async (req, res) => {
    try {
        const { characterId } = req.body;

        if (!characterId) {
            return res.status(400).json({
                success: false,
                message: 'Character ID is required'
            });
        }

        const result = await characterWebcamService.removeWebcam(parseInt(characterId));

        if (result.success) {
            res.json(result);
        } else {
            res.status(400).json(result);
        }
    } catch (error) {
        logger.error('Error in remove webcam API:', error);
        res.status(500).json({
            success: false,
            message: 'Internal server error',
            error: error.message
        });
    }
});

// Get webcam for character
router.get('/character/:characterId', async (req, res) => {
    try {
        const characterId = parseInt(req.params.characterId);
        if (isNaN(characterId)) {
            return res.status(400).json({
                success: false,
                message: 'Invalid character ID'
            });
        }

        const webcam = await characterWebcamService.getWebcamByCharacter(characterId);

        res.json({
            success: true,
            characterId: characterId,
            hasWebcam: !!webcam,
            webcam: webcam
        });
    } catch (error) {
        logger.error('Error getting webcam for character:', error);
        res.status(500).json({
            success: false,
            message: 'Internal server error',
            error: error.message
        });
    }
});

// Get character for webcam
router.get('/webcam/:webcamId', async (req, res) => {
    try {
        const webcamId = parseInt(req.params.webcamId);
        if (isNaN(webcamId)) {
            return res.status(400).json({
                success: false,
                message: 'Invalid webcam ID'
            });
        }

        const character = await characterWebcamService.getCharacterByWebcam(webcamId);

        res.json({
            success: true,
            webcamId: webcamId,
            hasCharacter: !!character,
            character: character
        });
    } catch (error) {
        logger.error('Error getting character for webcam:', error);
        res.status(500).json({
            success: false,
            message: 'Internal server error',
            error: error.message
        });
    }
});

// Get all associations
router.get('/all', async (req, res) => {
    try {
        const associations = await characterWebcamService.getAllAssociations();

        res.json({
            success: true,
            associations: associations,
            count: associations.length
        });
    } catch (error) {
        logger.error('Error getting all associations:', error);
        res.status(500).json({
            success: false,
            message: 'Internal server error',
            error: error.message
        });
    }
});

// Validate association
router.post('/validate', async (req, res) => {
    try {
        const { characterId, webcamId } = req.body;

        if (!characterId || !webcamId) {
            return res.status(400).json({
                success: false,
                message: 'Character ID and webcam ID are required'
            });
        }

        const validation = await characterWebcamService.validateAssociation(
            parseInt(characterId), 
            parseInt(webcamId)
        );

        res.json({
            success: true,
            validation: validation
        });
    } catch (error) {
        logger.error('Error validating association:', error);
        res.status(500).json({
            success: false,
            message: 'Internal server error',
            error: error.message
        });
    }
});

// Transfer webcam between characters
router.post('/transfer', async (req, res) => {
    try {
        const { fromCharacterId, toCharacterId } = req.body;

        if (!fromCharacterId || !toCharacterId) {
            return res.status(400).json({
                success: false,
                message: 'Both source and target character IDs are required'
            });
        }

        if (fromCharacterId === toCharacterId) {
            return res.status(400).json({
                success: false,
                message: 'Source and target characters cannot be the same'
            });
        }

        const result = await characterWebcamService.transferWebcam(
            parseInt(fromCharacterId), 
            parseInt(toCharacterId)
        );

        if (result.success) {
            res.json(result);
        } else {
            res.status(400).json(result);
        }
    } catch (error) {
        logger.error('Error transferring webcam:', error);
        res.status(500).json({
            success: false,
            message: 'Internal server error',
            error: error.message
        });
    }
});

// Get association statistics
router.get('/stats', async (req, res) => {
    try {
        const stats = await characterWebcamService.getAssociationStats();

        res.json({
            success: true,
            stats: stats
        });
    } catch (error) {
        logger.error('Error getting association stats:', error);
        res.status(500).json({
            success: false,
            message: 'Internal server error',
            error: error.message
        });
    }
});

// Bulk assign webcams (for migration/setup)
router.post('/bulk-assign', async (req, res) => {
    try {
        const { assignments } = req.body;

        if (!assignments || !Array.isArray(assignments)) {
            return res.status(400).json({
                success: false,
                message: 'Assignments array is required'
            });
        }

        const results = [];
        let successCount = 0;
        let failureCount = 0;

        for (const assignment of assignments) {
            const { characterId, webcamId } = assignment;
            
            if (!characterId || !webcamId) {
                results.push({
                    characterId,
                    webcamId,
                    success: false,
                    error: 'Missing character ID or webcam ID'
                });
                failureCount++;
                continue;
            }

            const result = await characterWebcamService.assignWebcam(
                parseInt(characterId), 
                parseInt(webcamId)
            );

            results.push({
                characterId: parseInt(characterId),
                webcamId: parseInt(webcamId),
                ...result
            });

            if (result.success) {
                successCount++;
            } else {
                failureCount++;
            }
        }

        res.json({
            success: failureCount === 0,
            message: `Bulk assignment completed: ${successCount} successful, ${failureCount} failed`,
            results: results,
            summary: {
                total: assignments.length,
                successful: successCount,
                failed: failureCount
            }
        });

    } catch (error) {
        logger.error('Error in bulk assign:', error);
        res.status(500).json({
            success: false,
            message: 'Internal server error',
            error: error.message
        });
    }
});

// Check association constraints
router.get('/constraints/:characterId', async (req, res) => {
    try {
        const characterId = parseInt(req.params.characterId);
        if (isNaN(characterId)) {
            return res.status(400).json({
                success: false,
                message: 'Invalid character ID'
            });
        }

        const webcam = await characterWebcamService.getWebcamByCharacter(characterId);
        const canAssignWebcam = !webcam; // Can assign if no webcam currently assigned

        res.json({
            success: true,
            characterId: characterId,
            hasWebcam: !!webcam,
            canAssignWebcam: canAssignWebcam,
            currentWebcam: webcam,
            constraints: {
                maxWebcamsPerCharacter: 1,
                currentWebcamCount: webcam ? 1 : 0
            }
        });
    } catch (error) {
        logger.error('Error checking constraints:', error);
        res.status(500).json({
            success: false,
            message: 'Internal server error',
            error: error.message
        });
    }
});

module.exports = router;
