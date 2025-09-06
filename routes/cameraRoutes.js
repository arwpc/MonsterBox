const express = require('express');
const router = express.Router();
const { spawn } = require('child_process');
const path = require('path');
const logger = require('../scripts/logger');
const fs = require('fs').promises;
const util = require('util');
const exec = util.promisify(require('child_process').exec);
const partService = require('../services/partService');
const webcamService = require('../services/webcamService');

// Log all camera route requests
router.use((req, res, next) => {
    logger.info(`📷 CAMERA ROUTE: ${req.method} ${req.path} - Query: ${JSON.stringify(req.query)}`);
    next();
});

// Path to store camera settings
const CAMERA_SETTINGS_PATH = path.join(__dirname, '..', 'data', 'camera-settings.json');

// Default camera settings
const DEFAULT_WIDTH = 1280;
const DEFAULT_HEIGHT = 720;
const DEFAULT_FPS = 30;

// Keep track of active camera processes
let activeProcesses = new Map();

// Load camera settings
async function loadCameraSettings() {
    try {
        const data = await fs.readFile(CAMERA_SETTINGS_PATH, 'utf8');
        const settings = JSON.parse(data);
        return {
            selectedCamera: settings.selectedCamera,
            width: settings.width || DEFAULT_WIDTH,
            height: settings.height || DEFAULT_HEIGHT,
            fps: settings.fps || DEFAULT_FPS
        };
    } catch (error) {
        return {
            selectedCamera: null,
            width: DEFAULT_WIDTH,
            height: DEFAULT_HEIGHT,
            fps: DEFAULT_FPS
        };
    }
}

// Load character-specific camera settings
async function loadCharacterCameraSettings(characterId) {
    if (!characterId) {
        return await loadCameraSettings();
    }

    try {
        const characterCameraSettingsPath = path.join(__dirname, '..', 'data', `camera_settings_char_${characterId}.json`);
        const data = await fs.readFile(characterCameraSettingsPath, 'utf8');
        const settings = JSON.parse(data);
        return {
            selectedCamera: settings.selectedCamera,
            width: settings.width || DEFAULT_WIDTH,
            height: settings.height || DEFAULT_HEIGHT,
            fps: settings.fps || DEFAULT_FPS,
            characterId: settings.characterId,
            characterName: settings.characterName,
            assignedAt: settings.assignedAt
        };
    } catch (error) {
        // Fall back to global settings if character-specific settings don't exist
        return await loadCameraSettings();
    }
}

// Save camera settings
async function saveCameraSettings(settings) {
    try {
        await fs.writeFile(CAMERA_SETTINGS_PATH, JSON.stringify({
            selectedCamera: settings.selectedCamera,
            width: settings.width || DEFAULT_WIDTH,
            height: settings.height || DEFAULT_HEIGHT,
            fps: settings.fps || DEFAULT_FPS
        }, null, 2));
    } catch (error) {
        logger.error('Failed to save camera settings', { error: error.message });
    }
}

// Kill any existing camera processes
async function killExistingCameraProcesses() {
    // First kill any processes we're tracking
    for (const [key, process] of activeProcesses.entries()) {
        try {
            process.kill('SIGTERM');
            activeProcesses.delete(key);
        } catch (error) {
            logger.error(`Failed to kill process ${key}`, { error: error.message });
        }
    }

    // Then use pkill as a backup
    try {
        await exec('pkill -f "(camera_stream|camera_control|head_track).py"');
    } catch (error) {
        // Ignore pkill errors as they might mean no processes were found
    }

    // Add delay after killing processes
    await new Promise(resolve => setTimeout(resolve, 3000));
}

// Clean up lock files
async function cleanupLockFiles() {
    try {
        const files = await fs.readdir('/tmp');
        for (const file of files) {
            if (file.startsWith('camera_') && file.endsWith('.lock')) {
                try {
                    await fs.unlink(`/tmp/${file}`);
                } catch (error) {
                    logger.error(`Failed to remove lock file ${file}`, { error: error.message });
                }
            }
        }
        // Add delay after cleanup
        await new Promise(resolve => setTimeout(resolve, 1000));
    } catch (error) {
        logger.error('Failed to cleanup lock files', { error: error.message });
    }
}

// Start camera stream - supports both local and remote characters
async function startCameraStream(cameraId, width = DEFAULT_WIDTH, height = DEFAULT_HEIGHT, fps = DEFAULT_FPS, character = null) {
    logger.info(`🚀 STARTCAMERASTREAM CALLED: cameraId=${cameraId}, character=${character ? character.char_name : 'null'}`);
    return new Promise((resolve, reject) => {
        const streamScript = path.join(__dirname, '..', 'scripts', 'camera_stream.py');

        // Check if this is a remote character
        logger.info(`🔍 Character object for streaming:`, character ? {
            id: character.id,
            char_name: character.char_name,
            hasAnimatronic: !!character.animatronic,
            hasRpiConfig: !!(character.animatronic && character.animatronic.rpi_config)
        } : 'null');

        let isRemoteCharacter = character && character.animatronic && character.animatronic.rpi_config;

        // Check if the remote host is actually localhost
        if (isRemoteCharacter) {
            const host = character.animatronic.rpi_config.host;
            const isLocalhost = host === '127.0.0.1' || host === 'localhost' || host === '192.168.8.130';
            if (isLocalhost) {
                logger.info(`🏠 Character ${character.char_name} is configured as remote (${host}) but is localhost - using local streaming`);
                isRemoteCharacter = false;
            } else {
                logger.info(`🌐 Character ${character.char_name} is truly remote (${host}) - using SSH streaming`);
            }
        }

        logger.info(`🔍 Is remote character: ${isRemoteCharacter}`);

        let process;

        if (isRemoteCharacter) {
            // For remote characters, run the camera script on their RPI via SSH
            const rpiConfig = character.animatronic.rpi_config;
            const host = rpiConfig.host;
            const username = rpiConfig.username || 'remote';
            const password = rpiConfig.password || 'klrklr89!';

            logger.info(`🌐 Starting remote camera stream on ${host} for camera ${cameraId}`);

            // Use sshpass to run the camera script remotely
            const remoteCommand = `python3 /home/remote/MonsterBox/scripts/camera_stream.py --camera-id ${cameraId} --width ${width} --height ${height} --fps ${fps}`;

            process = spawn('sshpass', [
                '-p', password,
                'ssh',
                '-o', 'StrictHostKeyChecking=no',
                '-o', 'UserKnownHostsFile=/dev/null',
                '-o', 'LogLevel=ERROR',
                `${username}@${host}`,
                remoteCommand
            ]);
        } else {
            // For local characters, run the camera script locally
            logger.info(`🏠 Starting local camera stream for camera ${cameraId}`);

            process = spawn('python3', [
                streamScript,
                '--camera-id', cameraId.toString(),
                '--width', width.toString(),
                '--height', height.toString(),
                '--fps', fps.toString()
            ]);
        }

        let initOutput = '';
        let initError = '';
        let initialized = false;
        let frameReceived = false;

        // Handle initialization output
        process.stdout.on('data', (data) => {
            try {
                if (!initialized) {
                    initOutput += data.toString();
                    if (initOutput.includes('{"success":')) {
                        const result = JSON.parse(initOutput.split('\n').find(line => line.includes('{"success":')));
                        if (result.success) {
                            initialized = true;
                        } else {
                            reject(new Error(result.error || 'Failed to initialize camera'));
                            return;
                        }
                    }
                }

                // Check if we've received frame data
                if (initialized && data.includes('--frame')) {
                    frameReceived = true;
                    resolve(process);
                }

            } catch (e) {
                // If parsing fails, it might be frame data
                if (initialized && data.includes('--frame')) {
                    frameReceived = true;
                    resolve(process);
                }
            }
        });

        process.stderr.on('data', (data) => {
            const msg = data.toString();
            if (!initialized) {
                initError += msg;
            }
        });

        process.on('error', (err) => {
            if (!initialized || !frameReceived) {
                reject(err);
            }
            logger.error('Stream process error', { error: err.message });
        });

        process.on('close', (code) => {
            if (!initialized || !frameReceived) {
                reject(new Error(initError || `Stream process exited with code ${code}`));
            }
        });

        // Set a timeout for initialization
        setTimeout(() => {
            if (!initialized || !frameReceived) {
                process.kill('SIGTERM');
                reject(new Error('Stream initialization timeout'));
            }
        }, 15000);  // 15 second timeout

        // Track this process
        activeProcesses.set('stream', process);
    });
}

// Get servos by character ID
async function getServosByCharacter(characterId) {
    try {
        const parts = await partService.getPartsByCharacter(characterId);
        return parts.filter(part => part.type === 'servo');
    } catch (error) {
        logger.error('Failed to get servos', { error: error.message });
        return [];
    }
}

// DEPRECATED: Standalone camera route - functionality moved to webcam parts management
// Use /parts/webcam/:id/edit instead for consolidated webcam interface
/*
router.get('/', async (req, res) => {
    try {
        const characterId = req.query.characterId || req.session.characterId;
        const settings = await loadCharacterCameraSettings(characterId);
        const servos = await getServosByCharacter(characterId);
        const characterService = require('../services/characterService');
        const characters = await characterService.getAllCharacters();
        const selectedCharacter = characterId ? await characterService.getCharacterById(characterId) : null;
        res.render('camera', {
            title: 'Camera Control',
            characterId: characterId || null,
            selectedCamera: settings.selectedCamera,
            servos: servos,
            characters: characters,
            selectedCharacter: selectedCharacter
        });
    } catch (error) {
        logger.error('Failed to render camera view', { error: error.message });
        res.status(500).render('error', {
            error: 'Failed to load camera interface',
            details: error.message
        });
    }
});
*/

// Redirect standalone camera requests to parts management
router.get('/', async (req, res) => {
    try {
        const characterId = req.query.characterId || req.session.characterId;
        if (characterId) {
            // Try to find existing webcam part for this character
            const partService = require('../services/partService');
            const parts = await partService.getPartsByCharacter(characterId);
            const webcamPart = parts.find(part => part.type === 'webcam');

            if (webcamPart) {
                // Redirect to existing webcam part edit page
                return res.redirect(`/parts/webcam/${webcamPart.id}/edit`);
            } else {
                // Redirect to create new webcam part
                return res.redirect(`/parts/webcam/new?characterId=${characterId}`);
            }
        } else {
            // No character selected, redirect to parts list
            return res.redirect('/parts');
        }
    } catch (error) {
        logger.error('Failed to redirect camera request', { error: error.message });
        res.status(500).render('error', {
            error: 'Failed to load camera interface',
            details: error.message
        });
    }
});

router.get('/stream', async (req, res) => {
    let streamProcess = null;
    try {
        const characterId = req.query.characterId || req.session.characterId;
        logger.info(`🎬 CAMERA STREAM REQUEST: characterId=${characterId}`);

        // Check if webcam startup service has an active stream for this character
        if (characterId && global.webcamStartupService && global.webcamStartupService.isStreamActive(characterId)) {
            logger.info(`📹 Found active stream for character ${characterId}, attempting to use existing stream`);

            // Try to use the existing stream from webcam startup service
            try {
                const streamingService = require('../services/streamingService');
                const success = await streamingService.addClient(characterId, res);
                if (success) {
                    logger.info(`✅ Successfully connected to existing stream for character ${characterId}`);
                    return; // Response is handled by streaming service
                } else {
                    logger.warn(`⚠️ Failed to connect to existing stream, falling back to legacy camera stream`);
                }
            } catch (streamError) {
                logger.warn(`⚠️ Error connecting to existing stream: ${streamError.message}, falling back to legacy camera stream`);
            }
        } else {
            logger.info(`📹 No active stream found for character ${characterId}, using legacy camera stream`);
        }

        logger.info(`🎯 AFTER WEBCAM STARTUP SERVICE CHECK - continuing with legacy stream`);

        // Get character's webcam configuration if characterId is provided
        let cameraId = 0;
        let width = parseInt(req.query.width) || DEFAULT_WIDTH;
        let height = parseInt(req.query.height) || DEFAULT_HEIGHT;
        let fps = parseInt(req.query.fps) || DEFAULT_FPS;
        let character = null; // Character object for remote streaming

        if (characterId) {
            try {
                // Get the character's webcam part
                const partService = require('../services/partService');
                const characterService = require('../services/characterService');

                logger.info(`🔍 Getting webcam configuration for character ${characterId}`);

                // Load character first for remote detection
                logger.info(`🎯 ABOUT TO LOAD CHARACTER ${characterId}`);
                character = await characterService.getCharacterById(characterId);
                logger.info(`🎯 CHARACTER LOADED: ${character ? character.char_name : 'null'}`);
                logger.info(`📋 Loaded character: ${character ? character.char_name : 'null'}`);

                const parts = await partService.getPartsByCharacter(characterId);
                logger.info(`📋 Found ${parts.length} parts for character ${characterId}`);

                const webcamPart = parts.find(part => part.type === 'webcam');
                logger.info(`📹 Webcam part for character ${characterId}:`, webcamPart ? {
                    id: webcamPart.id,
                    name: webcamPart.name,
                    deviceId: webcamPart.deviceId,
                    devicePath: webcamPart.devicePath,
                    status: webcamPart.status,
                    resolution: webcamPart.resolution,
                    fps: webcamPart.fps
                } : 'null');

                if (webcamPart && webcamPart.status === 'active') {
                    // For remote characters, we need to handle camera differently
                    const isRemoteCharacter = character && character.animatronic && character.animatronic.rpi_config;

                    if (isRemoteCharacter) {
                        // For remote characters, use their configured deviceId but stream from their RPI
                        cameraId = webcamPart.deviceId || 0;
                        logger.info(`🌐 Character ${characterId} is remote (${character.animatronic.rpi_config.host}), using deviceId ${cameraId}`);
                    } else {
                        // For local characters, use their deviceId directly
                        cameraId = webcamPart.deviceId || 0;
                        logger.info(`🏠 Character ${characterId} is local, using deviceId ${cameraId}`);
                    }

                    // Use webcam part settings if available
                    if (webcamPart.resolution) {
                        const [w, h] = webcamPart.resolution.split('x').map(Number);
                        width = parseInt(req.query.width) || w || DEFAULT_WIDTH;
                        height = parseInt(req.query.height) || h || DEFAULT_HEIGHT;
                    }
                    fps = parseInt(req.query.fps) || webcamPart.fps || DEFAULT_FPS;

                    logger.info(`✅ Using character ${characterId} webcam: camera ${cameraId}, ${width}x${height}@${fps}fps`);
                } else {
                    logger.warn(`⚠️ Character ${characterId} has no active webcam part, using default camera 0`);
                    cameraId = 0;
                }
            } catch (error) {
                logger.error(`❌ Error getting character ${characterId} webcam config:`, error);
                logger.info('🔄 Falling back to default camera settings');
                cameraId = 0;
            }
        } else {
            // Fallback to legacy camera settings for non-character requests
            const settings = await loadCameraSettings();
            cameraId = settings.selectedCamera || 0;
            width = parseInt(req.query.width) || settings.width || DEFAULT_WIDTH;
            height = parseInt(req.query.height) || settings.height || DEFAULT_HEIGHT;
            fps = parseInt(req.query.fps) || settings.fps || DEFAULT_FPS;
        }

        // Kill any existing camera processes and wait
        await killExistingCameraProcesses();
        await cleanupLockFiles();

        logger.info(`🎯 REACHED STREAM CREATION SECTION - character: ${character ? character.char_name : 'null'}`);

        // Character is already loaded above in the webcam configuration section

        streamProcess = await startCameraStream(cameraId, width, height, fps, character);

        res.setHeader('Content-Type', 'multipart/x-mixed-replace; boundary=frame');

        streamProcess.stdout.on('data', (data) => {
            try {
                // Check if client is still connected
                if (res.destroyed || res.writableEnded) {
                    logger.info('Client disconnected, stopping stream');
                    streamProcess.kill('SIGTERM');
                    return;
                }
                res.write(data);
            } catch (error) {
                // Only log if it's not a client disconnect error
                if (error.code !== 'EPIPE' && error.code !== 'ECONNRESET') {
                    logger.error('Error writing stream data:', error);
                }
                // Kill stream process when client disconnects
                streamProcess.kill('SIGTERM');
            }
        });

        streamProcess.stderr.on('data', (data) => {
            // Debug level for stream output
            logger.debug(`Stream output: ${data}`);
        });

        streamProcess.on('close', (code) => {
            activeProcesses.delete('stream');
            try {
                res.end();
            } catch (error) {
                logger.error('Error ending stream response:', error);
            }
        });

        req.on('close', async () => {
            if (streamProcess) {
                streamProcess.kill('SIGTERM');
                activeProcesses.delete('stream');
            }
            await cleanupLockFiles();
        });

    } catch (error) {
        logger.error('Stream error:', error);
        if (streamProcess) {
            streamProcess.kill('SIGTERM');
            activeProcesses.delete('stream');
        }
        res.status(500).send('Stream error');
    }
});

// Camera list route - REMOVED DUPLICATE (first implementation)
// This functionality is now handled by the second /list route below
router.get('/list-DISABLED', async (req, res) => {
    try {
        // DISABLED - Kill any existing camera processes and wait
        await killExistingCameraProcesses();
        await cleanupLockFiles();

        // First try using v4l2-ctl
        try {
            const { stdout } = await exec('v4l2-ctl --list-devices');
            const cameras = [];
            const lines = stdout.split('\n');
            let currentCamera = null;
            let devices = [];

            for (const line of lines) {
                const trimmedLine = line.trim();
                if (!trimmedLine.startsWith('/dev/')) {
                    if (currentCamera && devices.length > 0) {
                        cameras.push({
                            name: currentCamera,
                            devices: devices
                        });
                    }
                    if (trimmedLine) {
                        currentCamera = trimmedLine;
                        devices = [];
                    }
                } else if (trimmedLine.startsWith('/dev/video')) {
                    const deviceId = parseInt(trimmedLine.replace('/dev/video', ''));
                    devices.push({
                        id: deviceId,
                        path: trimmedLine
                    });
                }
            }

            if (currentCamera && devices.length > 0) {
                cameras.push({
                    name: currentCamera,
                    devices: devices
                });
            }

            // Filter out Raspberry Pi hardware encoders/decoders and remove duplicates
            const realCameras = [];
            const seenNames = new Set();

            for (const camera of cameras) {
                // Skip Raspberry Pi hardware components
                if (camera.name.includes('bcm2835') ||
                    camera.name.includes('rpi-hevc') ||
                    camera.name.includes('platform:')) {
                    continue;
                }

                // Skip duplicates
                if (seenNames.has(camera.name)) {
                    continue;
                }

                seenNames.add(camera.name);
                realCameras.push(camera);
            }

            if (realCameras.length > 0) {
                logger.info(`Found ${realCameras.length} real camera(s): ${realCameras.map(c => c.name).join(', ')}`);
                return res.json(realCameras);
            }
        } catch (error) {
            // Debug level for fallback message
            logger.debug('v4l2-ctl failed, falling back to direct device check');
        }

        // Fallback: Check /dev/video* devices directly
        const devices = await fs.readdir('/dev');
        const videoDevices = devices
            .filter(file => file.startsWith('video'))
            .map(file => ({
                id: parseInt(file.replace('video', '')),
                path: `/dev/${file}`
            }))
            .sort((a, b) => a.id - b.id);  // Sort by ID

        if (videoDevices.length > 0) {
            // Test each device to ensure it's a valid camera
            const validDevices = [];
            for (const device of videoDevices) {
                try {
                    const cap = spawn('python3', [
                        path.join(__dirname, '..', 'scripts', 'camera_control.py'),
                        'settings',
                        '--camera-id', device.id.toString(),
                        '--width', DEFAULT_WIDTH.toString(),
                        '--height', DEFAULT_HEIGHT.toString(),
                        '--fps', DEFAULT_FPS.toString()
                    ]);

                    const result = await new Promise((resolve) => {
                        let output = '';
                        cap.stdout.on('data', (data) => {
                            output += data.toString();
                        });
                        cap.on('close', () => {
                            try {
                                const result = JSON.parse(output);
                                resolve(result.success);
                            } catch (e) {
                                resolve(false);
                            }
                        });
                    });

                    if (result) {
                        validDevices.push(device);
                    }
                } catch (error) {
                    logger.error(`Error testing device ${device.id}:`, error);
                }
            }

            if (validDevices.length > 0) {
                return res.json([{
                    name: 'System Camera',
                    devices: validDevices
                }]);
            }
        }

        throw new Error('No cameras found');
    } catch (error) {
        logger.error('Error listing cameras:', error);
        res.status(500).json({ error: 'Failed to list cameras' });
    }
});

// Camera selection route - REMOVED DUPLICATE
// This functionality is now handled by the second /select route below

// Assign camera to character
router.post('/assign', async (req, res) => {
    try {
        const { characterId, cameraId } = req.body;

        if (typeof characterId !== 'number' || typeof cameraId !== 'number') {
            throw new Error('Invalid character ID or camera ID');
        }

        // Load character service to get character name
        const characterService = require('../services/characterService');
        const character = await characterService.getCharacterById(characterId);

        if (!character) {
            throw new Error('Character not found');
        }

        // Create character-specific camera settings file
        const characterCameraSettingsPath = path.join(__dirname, '..', 'data', `camera_settings_char_${characterId}.json`);

        const settings = {
            characterId: characterId,
            characterName: character.char_name,
            selectedCamera: cameraId,
            width: DEFAULT_WIDTH,
            height: DEFAULT_HEIGHT,
            fps: DEFAULT_FPS,
            assignedAt: new Date().toISOString()
        };

        await fs.writeFile(characterCameraSettingsPath, JSON.stringify(settings, null, 2));

        logger.info(`Camera ${cameraId} assigned to character ${characterId} (${character.char_name})`);

        res.json({
            success: true,
            message: `Camera assigned to ${character.char_name}`,
            characterId: characterId,
            cameraId: cameraId
        });

    } catch (error) {
        logger.error('Camera assignment error:', error);
        res.status(500).json({
            success: false,
            error: error.message
        });
    }
});

router.post('/control', async (req, res) => {
    const { command, params = {} } = req.body;
    const controlScript = path.join(__dirname, '..', 'scripts', 'camera_control.py');

    try {
        const settings = await loadCameraSettings();
        if (!settings.selectedCamera && settings.selectedCamera !== 0) {
            throw new Error('No camera selected');
        }

        // Kill any existing camera processes and wait
        await killExistingCameraProcesses();
        await cleanupLockFiles();

        const args = [controlScript, command, '--camera-id', settings.selectedCamera.toString()];

        // Use saved settings or defaults
        const width = params.width || settings.width || DEFAULT_WIDTH;
        const height = params.height || settings.height || DEFAULT_HEIGHT;
        const fps = params.fps || settings.fps || DEFAULT_FPS;

        if (command === 'settings') {
            args.push('--width', width.toString());
            args.push('--height', height.toString());
            args.push('--fps', fps.toString());
        } else if (command === 'motion') {
            // Set response headers for streaming
            res.setHeader('Content-Type', 'application/x-ndjson');
            res.setHeader('Cache-Control', 'no-cache');
            res.setHeader('Connection', 'keep-alive');

            // Add resolution and fps parameters
            args.push('--width', width.toString());
            args.push('--height', height.toString());
            args.push('--fps', fps.toString());

            // Start motion detection process (with visual overlays)
            const motionProcess = spawn('python3', args);

            // Track this process
            activeProcesses.set('motion', motionProcess);

            // Handle stdout data (motion detection results)
            let buffer = '';
            motionProcess.stdout.on('data', (data) => {
                try {
                    // Append new data to buffer
                    buffer += data.toString();

                    // Process complete JSON objects
                    let newlineIndex;
                    while ((newlineIndex = buffer.indexOf('\n')) !== -1) {
                        const jsonStr = buffer.slice(0, newlineIndex);
                        buffer = buffer.slice(newlineIndex + 1);

                        // Skip empty lines
                        if (!jsonStr.trim()) {
                            continue;
                        }
                        // WARNING: This handler sends all lines (even non-JSON) to the frontend.
                        // This can cause log spam if the frontend tries to parse non-JSON lines.
                        // To improve, make the frontend robust to non-JSON lines.
                        res.write(jsonStr + '\n');
                    }
                } catch (e) {
                    logger.error('Error processing motion data:', e);
                }
            });

            motionProcess.stderr.on('data', (data) => {
                // Debug level for camera control output
                logger.debug(`Motion detection output: ${data}`);
            });

            // Handle process close
            motionProcess.on('close', (code) => {
                activeProcesses.delete('motion');
                res.end();
            });

            // Handle client disconnect
            req.on('close', () => {
                if (activeProcesses.has('motion')) {
                    const motionProcess = activeProcesses.get('motion');
                    motionProcess.kill('SIGTERM');
                    activeProcesses.delete('motion');
                }
            });

            return;
        } else {
            return res.status(400).json({
                success: false,
                error: `Unknown command: ${command}`
            });
        }

        // For non-motion commands
        const process = spawn('python3', args);

        // Track this process
        activeProcesses.set('control', process);

        let output = '';
        let error = '';

        process.stdout.on('data', (data) => {
            output += data.toString();
        });

        process.stderr.on('data', (data) => {
            error += data.toString();
            // Debug level for camera control output
            logger.debug(`Camera control output: ${data}`);
        });

        process.on('close', async (code) => {
            activeProcesses.delete('control');
            if (code === 0 && output) {
                try {
                    const result = JSON.parse(output);
                    res.json({ success: true, ...result });
                } catch (e) {
                    res.json({ success: true, message: output });
                }
            } else {
                res.status(500).json({
                    success: false,
                    error: error || 'Camera control failed'
                });
            }
        });

        process.on('error', async (err) => {
            activeProcesses.delete('control');
            logger.error('Failed to start camera control process:', err);
            res.status(500).json({
                success: false,
                error: 'Failed to start camera control process'
            });
        });

    } catch (error) {
        logger.error('Camera control error:', error);
        res.status(500).json({
            success: false,
            error: error.message
        });
    }
});

// Head tracking route
router.post('/head-track', async (req, res) => {
    const { servoId } = req.body;

    try {
        // Validate servo ID
        if (!servoId) {
            throw new Error('Servo ID is required');
        }

        // Load camera settings
        const settings = await loadCameraSettings();
        if (!settings.selectedCamera && settings.selectedCamera !== 0) {
            throw new Error('No camera selected');
        }

        // Kill any existing camera processes and wait
        await killExistingCameraProcesses();
        await cleanupLockFiles();

        // Head tracking is now handled by the WebSocket head tracking service
        // This endpoint is deprecated - use the new head tracking API instead
        return res.status(410).json({
            success: false,
            message: 'Head tracking endpoint deprecated. Use /api/hardware/head-tracking/start instead.',
            migration_info: {
                new_endpoint: '/api/hardware/head-tracking/start',
                websocket_service: 'ws://localhost:8776',
                documentation: '/hardware-monitor.html'
            }
        });

    } catch (error) {
        logger.error('Head tracking error:', error);
        res.status(500).json({
            success: false,
            error: error.message
        });
    }
});

// Camera list route
router.get('/list', async (req, res) => {
    try {
        logger.info('Camera list request received');

        // Get character ID from query parameters to determine if we need remote detection
        const characterId = req.query.characterId;

        if (characterId) {
            // Use webcam service for proper remote/local detection

            try {
                const detectionResult = await webcamService.detectCameras(characterId, true); // Use remote detection

                if (detectionResult.success && detectionResult.cameras && detectionResult.cameras.length > 0) {
                    logger.info(`📹 Found ${detectionResult.cameras.length} camera groups for character ${characterId}`);
                    return res.json(detectionResult.cameras);
                } else {
                    logger.warn(`No cameras found for character ${characterId}: ${detectionResult.message}`);
                }
            } catch (serviceError) {
                logger.error('Webcam service detection failed:', serviceError);
            }
        }

        // Fallback to local detection if no character ID or remote detection fails
        const cameras = [];

        try {
            // Check for available video devices on local system
            const { stdout } = await exec('ls /dev/video* 2>/dev/null || echo ""');
            const videoDevices = stdout.trim().split('\n').filter(device => device.length > 0);

            if (videoDevices.length > 0) {
                // Try to get camera info using v4l2-ctl if available
                for (let i = 0; i < videoDevices.length; i++) {
                    const devicePath = videoDevices[i];
                    const deviceId = parseInt(devicePath.replace('/dev/video', ''));

                    try {
                        const { stdout: cameraInfo } = await exec(`v4l2-ctl --device=${devicePath} --info 2>/dev/null || echo "Camera ${deviceId}"`);
                        const cameraName = cameraInfo.includes('Card type') ?
                            cameraInfo.split('Card type')[1].split('\n')[0].replace(':', '').trim() :
                            `Camera ${deviceId}`;

                        cameras.push({
                            name: cameraName || `Camera ${deviceId}`,
                            devices: [{
                                id: deviceId,
                                path: devicePath,
                                name: cameraName || `Camera ${deviceId}`
                            }]
                        });
                    } catch (infoError) {
                        // Fallback if v4l2-ctl fails
                        cameras.push({
                            name: `Camera ${deviceId}`,
                            devices: [{
                                id: deviceId,
                                path: devicePath,
                                name: `Camera ${deviceId}`
                            }]
                        });
                    }
                }
            } else {
                // No video devices found, provide a mock camera for testing
                logger.warn('No video devices found, providing mock camera');
                cameras.push({
                    name: 'Mock Camera (No hardware detected)',
                    devices: [{
                        id: 0,
                        path: '/dev/video0',
                        name: 'Mock Camera'
                    }]
                });
            }
        } catch (detectError) {
            logger.warn('Camera detection failed, providing mock camera:', detectError.message);
            cameras.push({
                name: 'Mock Camera (Detection failed)',
                devices: [{
                    id: 0,
                    path: '/dev/video0',
                    name: 'Mock Camera'
                }]
            });
        }

        // Ensure we always have at least one camera for testing
        if (cameras.length === 0) {
            cameras.push({
                name: 'Default Camera',
                devices: [{
                    id: 0,
                    path: '/dev/video0',
                    name: 'Default Camera'
                }]
            });
        }

        logger.info(`Found ${cameras.length} camera(s)`);
        res.setHeader('Content-Type', 'application/json');
        res.json(cameras);

    } catch (error) {
        logger.error('Error listing cameras:', error);
        res.status(500).json({ error: error.message });
    }
});

// Camera selection route - Unified implementation
router.post('/select', async (req, res) => {
    try {
        const { cameraId } = req.body;
        const characterId = req.query.characterId || req.session.characterId;

        logger.info(`Camera selection request: cameraId=${cameraId}, characterId=${characterId}`);

        if (cameraId === undefined || cameraId === null) {
            return res.status(400).json({ success: false, error: 'Camera ID is required' });
        }

        // Convert to number if it's a string
        const numericCameraId = typeof cameraId === 'string' ? parseInt(cameraId, 10) : cameraId;
        if (isNaN(numericCameraId)) {
            return res.status(400).json({ success: false, error: 'Invalid camera ID format' });
        }

        // Kill any existing camera processes to avoid conflicts
        await killExistingCameraProcesses();
        await cleanupLockFiles();

        // Validate camera with Python script (but don't fail if it doesn't work)
        let cameraValidated = false;
        try {
            const verifyScript = path.join(__dirname, '..', 'scripts', 'camera_control.py');
            const verifyProcess = spawn('python3', [
                verifyScript,
                'settings',
                '--camera-id', numericCameraId.toString(),
                '--width', DEFAULT_WIDTH.toString(),
                '--height', DEFAULT_HEIGHT.toString(),
                '--fps', DEFAULT_FPS.toString()
            ]);

            let output = '';
            let error = '';

            verifyProcess.stdout.on('data', (data) => {
                output += data.toString();
            });

            verifyProcess.stderr.on('data', (data) => {
                error += data.toString();
            });

            await new Promise((resolve) => {
                const timeout = setTimeout(() => {
                    verifyProcess.kill('SIGTERM');
                    resolve();
                }, 5000); // 5 second timeout

                verifyProcess.on('close', (code) => {
                    clearTimeout(timeout);
                    try {
                        if (code === 0 && output.trim()) {
                            const lines = output.trim().split('\n');
                            const lastLine = lines[lines.length - 1];
                            const result = JSON.parse(lastLine);
                            if (result.success) {
                                cameraValidated = true;
                                logger.info(`Camera ${numericCameraId} validated successfully`);
                            }
                        }
                    } catch (parseError) {
                        logger.debug(`Camera validation parse error: ${parseError.message}`);
                    }
                    resolve();
                });

                verifyProcess.on('error', () => {
                    clearTimeout(timeout);
                    resolve();
                });
            });
        } catch (validationError) {
            logger.debug(`Camera validation error: ${validationError.message}`);
        }

        // Save camera selection to appropriate settings
        if (characterId) {
            try {
                const characterCameraSettingsPath = path.join(__dirname, '..', 'data', `camera_settings_char_${characterId}.json`);
                const settings = await loadCharacterCameraSettings(characterId);
                settings.selectedCamera = numericCameraId;

                // Ensure data directory exists
                const dataDir = path.join(__dirname, '..', 'data');
                await fs.mkdir(dataDir, { recursive: true }).catch(() => { });

                await fs.writeFile(characterCameraSettingsPath, JSON.stringify(settings, null, 2));
                logger.info(`Camera ${numericCameraId} selected for character ${characterId}`);
            } catch (fileError) {
                logger.warn(`Failed to save character camera settings: ${fileError.message}`);
            }
        } else {
            try {
                const settings = await loadCameraSettings();
                settings.selectedCamera = numericCameraId;

                const dataDir = path.dirname(CAMERA_SETTINGS_PATH);
                await fs.mkdir(dataDir, { recursive: true }).catch(() => { });

                await fs.writeFile(CAMERA_SETTINGS_PATH, JSON.stringify(settings, null, 2));
                logger.info(`Camera ${numericCameraId} selected globally`);
            } catch (fileError) {
                logger.warn(`Failed to save global camera settings: ${fileError.message}`);
            }
        }

        res.json({
            success: true,
            message: 'Camera selected successfully',
            cameraId: numericCameraId,
            validated: cameraValidated
        });
    } catch (error) {
        logger.error('Error selecting camera:', error);
        res.status(500).json({ success: false, error: error.message });
    }
});

// Camera assignment route
router.post('/assign', async (req, res) => {
    try {
        const { characterId, cameraId } = req.body;

        logger.info(`Camera assignment request: characterId=${characterId}, cameraId=${cameraId}`);

        if (!characterId || (cameraId === undefined || cameraId === null)) {
            return res.status(400).json({ success: false, error: 'Character ID and Camera ID are required' });
        }

        // Get character to validate it exists
        const characterService = require('../services/characterService');
        const character = await characterService.getCharacterById(characterId);
        if (!character) {
            return res.status(404).json({ success: false, error: 'Character not found' });
        }

        // Create or update webcam part for this character
        try {
            // Check if character already has a webcam part
            const existingParts = await partService.getPartsByCharacter(characterId);
            const existingWebcam = existingParts.find(part => part.type === 'webcam');

            if (existingWebcam) {
                // Update existing webcam part
                await partService.updatePart(existingWebcam.id, {
                    deviceId: cameraId,
                    devicePath: `/dev/video${cameraId}`,
                    status: 'active'
                });
                logger.info(`Updated webcam part ${existingWebcam.id} for character ${characterId} with camera ${cameraId}`);
            } else {
                // Create new webcam part
                const newWebcamPart = {
                    name: `Webcam for ${character.char_name}`,
                    type: 'webcam',
                    deviceId: cameraId,
                    devicePath: `/dev/video${cameraId}`,
                    characterId: characterId,
                    status: 'active',
                    resolution: '1280x720',
                    fps: 30
                };

                await partService.createPart(newWebcamPart);
                logger.info(`Created new webcam part for character ${characterId} with camera ${cameraId}`);
            }

            // Also save to character-specific camera settings
            const characterCameraSettingsPath = path.join(__dirname, '..', 'data', `camera_settings_char_${characterId}.json`);
            const settings = await loadCharacterCameraSettings(characterId);
            settings.selectedCamera = cameraId;
            await fs.writeFile(characterCameraSettingsPath, JSON.stringify(settings, null, 2));

            res.json({
                success: true,
                message: `Camera ${cameraId} assigned to character ${character.char_name} successfully`
            });

        } catch (partError) {
            logger.error('Error managing webcam part:', partError);
            res.status(500).json({ success: false, error: 'Failed to assign camera to character: ' + partError.message });
        }

    } catch (error) {
        logger.error('Error assigning camera:', error);
        res.status(500).json({ success: false, error: error.message });
    }
});

module.exports = router;
