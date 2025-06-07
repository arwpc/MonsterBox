const express = require('express');
const router = express.Router();
const webcamService = require('../../services/webcamService');
const characterService = require('../../services/characterService');
const logger = require('../../scripts/logger');
const { spawn } = require('child_process');
const path = require('path');

// Detect available cameras
router.get('/detect', async (req, res) => {
    try {
        const characterId = req.query.characterId;
        const useRemote = req.query.remote === 'true';

        if (!characterId) {
            return res.status(400).json({
                success: false,
                message: 'Character ID is required'
            });
        }

        const result = await webcamService.detectCameras(parseInt(characterId), useRemote);
        res.json(result);
    } catch (error) {
        logger.error('Error in camera detection API:', error);
        res.status(500).json({
            success: false,
            message: 'Internal server error during camera detection',
            error: error.message
        });
    }
});

// Validate device on RPI system
router.get('/validate-device', async (req, res) => {
    try {
        const { characterId, deviceId } = req.query;

        if (!characterId || !deviceId) {
            return res.status(400).json({
                success: false,
                message: 'Character ID and device ID are required'
            });
        }

        const result = await webcamService.validateRemoteDevice(
            parseInt(characterId),
            parseInt(deviceId)
        );

        res.json({
            success: result.valid,
            ...result
        });
    } catch (error) {
        logger.error('Error in device validation API:', error);
        res.status(500).json({
            success: false,
            message: 'Internal server error during device validation',
            error: error.message
        });
    }
});

// Monitor device health
router.get('/health/:characterId', async (req, res) => {
    try {
        const characterId = parseInt(req.params.characterId);
        if (isNaN(characterId)) {
            return res.status(400).json({
                success: false,
                message: 'Invalid character ID'
            });
        }

        const result = await webcamService.monitorDeviceHealth(characterId);
        res.json({
            success: result.healthy,
            ...result
        });
    } catch (error) {
        logger.error('Error in device health monitoring API:', error);
        res.status(500).json({
            success: false,
            message: 'Error monitoring device health',
            error: error.message
        });
    }
});

// Test camera stream
router.get('/test-stream', async (req, res) => {
    try {
        const { characterId, deviceId, width = 640, height = 480, fps = 30 } = req.query;

        if (!characterId || !deviceId) {
            return res.status(400).json({
                success: false,
                message: 'Character ID and device ID are required'
            });
        }

        // Validate parameters
        const parsedDeviceId = parseInt(deviceId);
        const parsedWidth = parseInt(width);
        const parsedHeight = parseInt(height);
        const parsedFps = parseInt(fps);

        if (isNaN(parsedDeviceId) || isNaN(parsedWidth) || isNaN(parsedHeight) || isNaN(parsedFps)) {
            return res.status(400).json({
                success: false,
                message: 'Invalid parameters'
            });
        }

        // Check if camera is available before starting test
        const cameraCheck = await checkCameraAvailability(parsedDeviceId);
        if (!cameraCheck.available) {
            logger.warn(`Camera ${parsedDeviceId} is not available: ${cameraCheck.reason}`);
            return res.status(409).json({
                success: false,
                message: 'Camera not available',
                error: cameraCheck.reason,
                suggestion: 'Stop existing streams or try a different camera'
            });
        }

        // Set response headers for MJPEG stream
        res.setHeader('Content-Type', 'multipart/x-mixed-replace; boundary=frame');
        res.setHeader('Cache-Control', 'no-cache');
        res.setHeader('Connection', 'keep-alive');

        // Start camera test stream
        const streamScript = path.join(__dirname, '..', '..', 'scripts', 'webcam_test_stream.py');
        const process = spawn('python3', [
            streamScript,
            '--device-id', parsedDeviceId.toString(),
            '--width', parsedWidth.toString(),
            '--height', parsedHeight.toString(),
            '--fps', parsedFps.toString(),
            '--duration', '30' // 30 second test
        ]);

        // Handle stream data
        process.stdout.on('data', (data) => {
            try {
                res.write(data);
            } catch (error) {
                logger.error('Error writing test stream data:', error);
            }
        });

        // Handle process errors
        process.stderr.on('data', (data) => {
            logger.error('Test stream error:', data.toString());
        });

        // Handle process exit
        process.on('close', (code) => {
            logger.info(`Test stream process exited with code ${code}`);
            try {
                res.end();
            } catch (error) {
                logger.error('Error ending test stream response:', error);
            }
        });

        // Handle client disconnect
        req.on('close', () => {
            logger.info('Test stream client disconnected');
            try {
                process.kill();
            } catch (error) {
                logger.error('Error killing test stream process:', error);
            }
        });

    } catch (error) {
        logger.error('Error starting test stream:', error);
        res.status(500).json({
            success: false,
            message: 'Error starting test stream',
            error: error.message
        });
    }
});

// Get webcam status for character
router.get('/status/:characterId', async (req, res) => {
    try {
        const characterId = parseInt(req.params.characterId);
        if (isNaN(characterId)) {
            return res.status(400).json({
                success: false,
                message: 'Invalid character ID'
            });
        }

        const status = await webcamService.getWebcamStatus(characterId);
        res.json({
            success: true,
            ...status
        });
    } catch (error) {
        logger.error('Error getting webcam status:', error);
        res.status(500).json({
            success: false,
            message: 'Error getting webcam status',
            error: error.message
        });
    }
});

// Get stream URL for character
router.get('/stream-url/:characterId', async (req, res) => {
    try {
        const characterId = parseInt(req.params.characterId);
        if (isNaN(characterId)) {
            return res.status(400).json({
                success: false,
                message: 'Invalid character ID'
            });
        }

        const streamUrl = await webcamService.getStreamUrl(characterId);
        const publicUrl = await webcamService.getPublicStreamUrl(characterId);

        if (!streamUrl) {
            return res.json({
                success: false,
                message: 'No active webcam found for this character'
            });
        }

        res.json({
            success: true,
            streamUrl: streamUrl,
            publicUrl: publicUrl
        });
    } catch (error) {
        logger.error('Error getting stream URL:', error);
        res.status(500).json({
            success: false,
            message: 'Error getting stream URL',
            error: error.message
        });
    }
});

// Get all webcams
router.get('/all', async (req, res) => {
    try {
        const webcams = await webcamService.getAllWebcams();
        const webcamData = [];

        for (const webcam of webcams) {
            const character = await characterService.getCharacterById(webcam.characterId);
            const status = await webcamService.getWebcamStatus(webcam.characterId);
            
            webcamData.push({
                ...webcam,
                character: character,
                status: status
            });
        }

        res.json({
            success: true,
            webcams: webcamData
        });
    } catch (error) {
        logger.error('Error getting all webcams:', error);
        res.status(500).json({
            success: false,
            message: 'Error getting webcams',
            error: error.message
        });
    }
});

// Validate webcam configuration
router.post('/validate', async (req, res) => {
    try {
        const config = req.body;
        const validation = webcamService.validateWebcamConfig(config);

        if (config.characterId) {
            const canAssign = await webcamService.canAssignWebcam(
                parseInt(config.characterId), 
                config.id ? parseInt(config.id) : null
            );
            
            if (!canAssign.canAssign) {
                validation.valid = false;
                validation.errors.push(canAssign.reason);
            }
        }

        res.json({
            success: true,
            validation: validation
        });
    } catch (error) {
        logger.error('Error validating webcam config:', error);
        res.status(500).json({
            success: false,
            message: 'Error validating configuration',
            error: error.message
        });
    }
});

// Helper function to check camera availability
async function checkCameraAvailability(deviceId) {
    try {
        const { spawn } = require('child_process');
        const checkScript = path.join(__dirname, '..', '..', 'scripts', 'webcam_detect.py');

        return new Promise((resolve) => {
            const process = spawn('python3', [checkScript]);
            let output = '';

            process.stdout.on('data', (data) => {
                output += data.toString();
            });

            process.on('close', (code) => {
                try {
                    const result = JSON.parse(output);
                    const camera = result.cameras?.find(cam => cam.id === deviceId);

                    if (!camera) {
                        resolve({ available: false, reason: 'Camera not found' });
                    } else if (camera.in_use) {
                        resolve({ available: false, reason: 'Camera currently in use by another process' });
                    } else if (!camera.accessible) {
                        resolve({ available: false, reason: 'Camera not accessible' });
                    } else {
                        resolve({ available: true, reason: 'Camera available' });
                    }
                } catch (error) {
                    resolve({ available: false, reason: 'Failed to check camera status' });
                }
            });

            // Timeout after 5 seconds
            setTimeout(() => {
                process.kill();
                resolve({ available: false, reason: 'Camera check timeout' });
            }, 5000);
        });
    } catch (error) {
        return { available: false, reason: 'Camera check failed' };
    }
}

module.exports = router;
