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

        // Check if this is a remote character and handle accordingly
        const character = await characterService.getCharacterById(parseInt(characterId));
        const isRemoteCharacter = character && character.animatronic && character.animatronic.rpi_config;

        if (isRemoteCharacter) {
            // For remote characters, validate device on the RPI system
            const deviceValidation = await webcamService.validateRemoteDevice(parseInt(characterId), parsedDeviceId);
            if (!deviceValidation.valid) {
                logger.warn(`Remote camera ${parsedDeviceId} validation failed: ${deviceValidation.message}`);
                return res.status(409).json({
                    success: false,
                    message: 'Remote camera not available',
                    error: deviceValidation.message,
                    suggestion: 'Check camera connection on RPI system'
                });
            }
        } else {
            // For local characters, check camera availability locally
            const cameraCheck = await checkCameraAvailability(parsedDeviceId);
            if (!cameraCheck.available) {
                logger.warn(`Local camera ${parsedDeviceId} is not available: ${cameraCheck.reason}`);
                return res.status(409).json({
                    success: false,
                    message: 'Camera not available',
                    error: cameraCheck.reason,
                    suggestion: 'Stop existing streams or try a different camera'
                });
            }
        }

        // Set response headers for MJPEG stream
        res.setHeader('Content-Type', 'multipart/x-mixed-replace; boundary=frame');
        res.setHeader('Cache-Control', 'no-cache');
        res.setHeader('Connection', 'keep-alive');

        let process;

        if (isRemoteCharacter) {
            // For remote characters, run the test stream on the RPI system via SSH
            const rpiConfig = character.animatronic.rpi_config;
            const host = rpiConfig.host;
            const user = rpiConfig.user || 'remote';
            const remoteScript = `/home/remote/MonsterBox/scripts/webcam_test_stream.py`;

            logger.info(`Starting remote test stream on ${host} for device ${parsedDeviceId}`);

            process = spawn('ssh', [
                '-o', 'ConnectTimeout=10',
                '-o', 'StrictHostKeyChecking=no',
                `${user}@${host}`,
                `python3 ${remoteScript} --device-id ${parsedDeviceId} --width ${parsedWidth} --height ${parsedHeight} --fps ${parsedFps} --duration 30`
            ]);
        } else {
            // For local characters, run the test stream locally
            const streamScript = path.join(__dirname, '..', '..', 'scripts', 'webcam_test_stream.py');
            process = spawn('python3', [
                streamScript,
                '--device-id', parsedDeviceId.toString(),
                '--width', parsedWidth.toString(),
                '--height', parsedHeight.toString(),
                '--fps', parsedFps.toString(),
                '--duration', '30' // 30 second test
            ]);
        }

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

// Utility function to safely serialize objects with circular references
function safeStringify(obj, space) {
    const seen = new WeakSet();
    return JSON.stringify(obj, (key, val) => {
        if (val != null && typeof val === "object") {
            if (seen.has(val)) {
                return "[Circular]";
            }
            seen.add(val);
        }
        return val;
    }, space);
}

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

        // Clean the status object to remove circular references
        const cleanStatus = {
            success: true,
            hasWebcam: status.hasWebcam,
            status: status.status,
            isStreaming: status.isStreaming,
            streamClients: status.streamClients,
            lastActivity: status.lastActivity,
            message: status.message,
            webcam: status.webcam ? {
                id: status.webcam.id,
                name: status.webcam.name,
                deviceId: status.webcam.deviceId,
                devicePath: status.webcam.devicePath,
                resolution: status.webcam.resolution,
                fps: status.webcam.fps,
                status: status.webcam.status,
                characterId: status.webcam.characterId
            } : null,
            deviceHealth: status.deviceHealth ? {
                healthy: status.deviceHealth.healthy,
                message: status.deviceHealth.message,
                lastChecked: status.deviceHealth.lastChecked
            } : null
        };

        res.json(cleanStatus);
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

// Validate webcam device on remote system
router.get('/validate-device', async (req, res) => {
    try {
        const characterId = parseInt(req.query.characterId);
        const deviceId = parseInt(req.query.deviceId);

        if (isNaN(characterId) || isNaN(deviceId)) {
            return res.status(400).json({
                success: false,
                message: 'Invalid character ID or device ID'
            });
        }

        const validation = await webcamService.validateRemoteDevice(characterId, deviceId);

        res.json({
            success: validation.valid,
            message: validation.message,
            devicePath: validation.devicePath,
            host: validation.host
        });
    } catch (error) {
        logger.error('Error validating remote device:', error);
        res.status(500).json({
            success: false,
            message: 'Error validating device',
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

// Set camera controls (brightness, contrast, etc.)
router.post('/set-controls', async (req, res) => {
    try {
        const { characterId, deviceId, controls } = req.body;

        if (!characterId || (deviceId !== 0 && !deviceId) || !controls) {
            return res.status(400).json({
                success: false,
                message: 'Character ID, device ID, and controls are required'
            });
        }

        const parsedCharacterId = parseInt(characterId);
        const parsedDeviceId = parseInt(deviceId);

        if (isNaN(parsedCharacterId) || isNaN(parsedDeviceId)) {
            return res.status(400).json({
                success: false,
                message: 'Invalid character ID or device ID'
            });
        }

        const result = await webcamService.setCameraControls(parsedCharacterId, parsedDeviceId, controls);

        if (result.success) {
            // Also save the controls to the webcam part configuration
            try {
                const webcam = await webcamService.getWebcamByCharacter(parsedCharacterId);
                if (webcam) {
                    const partService = require('../../services/partService');
                    const updatedWebcam = {
                        ...webcam,
                        cameraControls: controls
                    };
                    await partService.updatePart(webcam.id, updatedWebcam);
                    logger.info(`Camera controls saved to webcam part ${webcam.id}`);
                }
            } catch (saveError) {
                logger.warn('Failed to save camera controls to part configuration:', saveError);
                // Don't fail the request if saving to part fails
            }

            res.json({
                success: true,
                message: 'Camera controls applied and saved successfully',
                appliedControls: result.appliedControls,
                failedControls: result.failedControls
            });
        } else {
            res.status(500).json({
                success: false,
                message: result.message || 'Failed to apply camera controls'
            });
        }
    } catch (error) {
        logger.error('Error setting camera controls:', error);
        res.status(500).json({
            success: false,
            message: 'Error setting camera controls',
            error: error.message
        });
    }
});

module.exports = router;
