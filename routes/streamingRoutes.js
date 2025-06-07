const express = require('express');
const router = express.Router();
const streamingService = require('../services/streamingService');
const webcamService = require('../services/webcamService');
const characterService = require('../services/characterService');
const logger = require('../scripts/logger');

// Start stream for character
router.post('/start/:characterId', async (req, res) => {
    try {
        const characterId = parseInt(req.params.characterId);
        if (isNaN(characterId)) {
            return res.status(400).json({
                success: false,
                message: 'Invalid character ID'
            });
        }

        const options = {
            width: req.body.width ? parseInt(req.body.width) : undefined,
            height: req.body.height ? parseInt(req.body.height) : undefined,
            fps: req.body.fps ? parseInt(req.body.fps) : undefined,
            quality: req.body.quality ? parseInt(req.body.quality) : undefined
        };

        const result = await streamingService.startStream(characterId, options);
        res.json(result);
    } catch (error) {
        logger.error('Error starting stream:', error);
        res.status(500).json({
            success: false,
            message: 'Internal server error',
            error: error.message
        });
    }
});

// Stop stream for character
router.post('/stop/:characterId', async (req, res) => {
    try {
        const characterId = parseInt(req.params.characterId);
        if (isNaN(characterId)) {
            return res.status(400).json({
                success: false,
                message: 'Invalid character ID'
            });
        }

        const result = await streamingService.stopStream(characterId);
        res.json(result);
    } catch (error) {
        logger.error('Error stopping stream:', error);
        res.status(500).json({
            success: false,
            message: 'Internal server error',
            error: error.message
        });
    }
});

// Get stream for character (MJPEG endpoint)
router.get('/stream/:characterId', async (req, res) => {
    try {
        const characterId = parseInt(req.params.characterId);
        if (isNaN(characterId)) {
            return res.status(400).send('Invalid character ID');
        }

        // Check if stream exists, if not try to start it
        let streamInfo = streamingService.getStreamInfo(characterId);
        if (!streamInfo || streamInfo.status !== 'active') {
            logger.info(`Starting stream for character ${characterId} on demand`);
            const startResult = await streamingService.startStream(characterId);
            if (!startResult.success) {
                return res.status(500).send(`Failed to start stream: ${startResult.error}`);
            }
            streamInfo = streamingService.getStreamInfo(characterId);
        }

        if (!streamInfo) {
            return res.status(404).send('Stream not available');
        }

        // Pipe stream to client
        const success = streamingService.pipeToClient(characterId, res);
        if (!success) {
            return res.status(500).send('Failed to connect to stream');
        }

        logger.debug(`Client connected to stream for character ${characterId}`);

    } catch (error) {
        logger.error('Error serving stream:', error);
        res.status(500).send('Internal server error');
    }
});

// Get stream status for character
router.get('/status/:characterId', async (req, res) => {
    try {
        const characterId = parseInt(req.params.characterId);
        if (isNaN(characterId)) {
            return res.status(400).json({
                success: false,
                message: 'Invalid character ID'
            });
        }

        const streamInfo = streamingService.getStreamInfo(characterId);
        const webcamStatus = await webcamService.getWebcamStatus(characterId);

        res.json({
            success: true,
            characterId: characterId,
            hasStream: !!streamInfo,
            streamInfo: streamInfo,
            webcamStatus: webcamStatus,
            clientCount: streamingService.getClientCount(characterId)
        });
    } catch (error) {
        logger.error('Error getting stream status:', error);
        res.status(500).json({
            success: false,
            message: 'Internal server error',
            error: error.message
        });
    }
});

// Get all active streams
router.get('/all', async (req, res) => {
    try {
        const streams = streamingService.getAllStreams();
        const streamData = [];

        for (const stream of streams) {
            const character = await characterService.getCharacterById(stream.characterId);
            streamData.push({
                ...stream,
                character: character,
                clientCount: streamingService.getClientCount(stream.characterId)
            });
        }

        res.json({
            success: true,
            streams: streamData,
            totalStreams: streams.length
        });
    } catch (error) {
        logger.error('Error getting all streams:', error);
        res.status(500).json({
            success: false,
            message: 'Internal server error',
            error: error.message
        });
    }
});

// Public stream access (character name based)
router.get('/public/:characterName', async (req, res) => {
    try {
        const characterName = req.params.characterName.toLowerCase();
        
        // Find character by name
        const characters = await characterService.getAllCharacters();
        const character = characters.find(char => 
            char.char_name.toLowerCase().replace(/[^a-z0-9]/g, '-') === characterName
        );

        if (!character) {
            return res.status(404).send('Character not found');
        }

        // Check if character has an active webcam
        const webcam = await webcamService.getWebcamByCharacter(character.id);
        if (!webcam || webcam.status !== 'active') {
            return res.status(404).send('No active webcam for this character');
        }

        // Redirect to the stream endpoint
        res.redirect(`/api/streaming/stream/${character.id}`);

    } catch (error) {
        logger.error('Error serving public stream:', error);
        res.status(500).send('Internal server error');
    }
});

// Stream health check
router.get('/health/:characterId', async (req, res) => {
    try {
        const characterId = parseInt(req.params.characterId);
        if (isNaN(characterId)) {
            return res.status(400).json({
                success: false,
                message: 'Invalid character ID'
            });
        }

        const streamInfo = streamingService.getStreamInfo(characterId);
        const webcamHealth = await webcamService.monitorDeviceHealth(characterId);

        const health = {
            characterId: characterId,
            streamActive: !!streamInfo && streamInfo.status === 'active',
            streamInfo: streamInfo,
            webcamHealth: webcamHealth,
            timestamp: new Date().toISOString()
        };

        const isHealthy = health.streamActive && webcamHealth.healthy;

        res.status(isHealthy ? 200 : 503).json({
            success: isHealthy,
            health: health
        });

    } catch (error) {
        logger.error('Error checking stream health:', error);
        res.status(500).json({
            success: false,
            message: 'Internal server error',
            error: error.message
        });
    }
});

// Restart stream for character
router.post('/restart/:characterId', async (req, res) => {
    try {
        const characterId = parseInt(req.params.characterId);
        if (isNaN(characterId)) {
            return res.status(400).json({
                success: false,
                message: 'Invalid character ID'
            });
        }

        // Stop existing stream
        const stopResult = await streamingService.stopStream(characterId);
        logger.info(`Stop result for character ${characterId}:`, stopResult);

        // Wait a moment for cleanup
        await new Promise(resolve => setTimeout(resolve, 2000));

        // Start new stream
        const startResult = await streamingService.startStream(characterId);
        
        res.json({
            success: startResult.success,
            message: startResult.success ? 'Stream restarted successfully' : 'Failed to restart stream',
            stopResult: stopResult,
            startResult: startResult
        });

    } catch (error) {
        logger.error('Error restarting stream:', error);
        res.status(500).json({
            success: false,
            message: 'Internal server error',
            error: error.message
        });
    }
});

// Stream statistics
router.get('/stats/:characterId', async (req, res) => {
    try {
        const characterId = parseInt(req.params.characterId);
        if (isNaN(characterId)) {
            return res.status(400).json({
                success: false,
                message: 'Invalid character ID'
            });
        }

        const streamInfo = streamingService.getStreamInfo(characterId);
        if (!streamInfo) {
            return res.json({
                success: false,
                message: 'No stream found for character'
            });
        }

        const stats = {
            characterId: characterId,
            streamId: streamInfo.streamId,
            startTime: streamInfo.startTime,
            lastActivity: streamInfo.lastActivity,
            clientCount: streamingService.getClientCount(characterId),
            uptime: Date.now() - streamInfo.startTime.getTime(),
            status: streamInfo.status,
            config: streamInfo.config
        };

        res.json({
            success: true,
            stats: stats
        });

    } catch (error) {
        logger.error('Error getting stream stats:', error);
        res.status(500).json({
            success: false,
            message: 'Internal server error',
            error: error.message
        });
    }
});

module.exports = router;
