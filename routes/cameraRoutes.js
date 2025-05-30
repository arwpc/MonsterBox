const express = require('express');
const router = express.Router();
const { spawn } = require('child_process');
const path = require('path');
const logger = require('../scripts/logger');
const fs = require('fs').promises;
const util = require('util');
const exec = util.promisify(require('child_process').exec);
const partService = require('../services/partService');

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

// Start camera stream
async function startCameraStream(cameraId, width = DEFAULT_WIDTH, height = DEFAULT_HEIGHT, fps = DEFAULT_FPS) {
    return new Promise((resolve, reject) => {
        const streamScript = path.join(__dirname, '..', 'scripts', 'camera_stream.py');
        
        const process = spawn('python3', [
            streamScript,
            '--camera-id', cameraId.toString(),
            '--width', width.toString(),
            '--height', height.toString(),
            '--fps', fps.toString()
        ]);

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

                // If initialized but not frame data, it might be other output
                if (initialized && !frameReceived) {
                    try {
                        res.write(data);
                    } catch (error) {
                        logger.error('Failed to write stream data', { error: error.message });
                    }
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

// Camera routes
router.get('/', async (req, res) => {
    try {
        const characterId = req.query.characterId || req.session.characterId;
        const settings = await loadCameraSettings();
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

router.get('/stream', async (req, res) => {
    let streamProcess = null;
    try {
        const settings = await loadCameraSettings();
        if (!settings.selectedCamera && settings.selectedCamera !== 0) {
            throw new Error('No camera selected');
        }

        // Kill any existing camera processes and wait
        await killExistingCameraProcesses();
        await cleanupLockFiles();

        // Use saved settings or query parameters
        const width = parseInt(req.query.width) || settings.width || DEFAULT_WIDTH;
        const height = parseInt(req.query.height) || settings.height || DEFAULT_HEIGHT;
        const fps = parseInt(req.query.fps) || settings.fps || DEFAULT_FPS;

        streamProcess = await startCameraStream(settings.selectedCamera, width, height, fps);

        res.setHeader('Content-Type', 'multipart/x-mixed-replace; boundary=frame');
        
        streamProcess.stdout.on('data', (data) => {
            try {
                res.write(data);
            } catch (error) {
                logger.error('Error writing stream data:', error);
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

router.get('/list', async (req, res) => {
    try {
        // Kill any existing camera processes and wait
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

            if (cameras.length > 0) {
                return res.json(cameras);
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

router.post('/select', async (req, res) => {
    try {
        const { cameraId } = req.body;
        if (typeof cameraId !== 'number') {
            throw new Error('Invalid camera ID');
        }

        // Kill any existing camera processes and wait
        await killExistingCameraProcesses();
        await cleanupLockFiles();

        // Verify camera is accessible
        const verifyScript = path.join(__dirname, '..', 'scripts', 'camera_control.py');
        
        const process = spawn('python3', [
            verifyScript,
            'settings',
            '--camera-id', cameraId.toString(),
            '--width', DEFAULT_WIDTH.toString(),
            '--height', DEFAULT_HEIGHT.toString(),
            '--fps', DEFAULT_FPS.toString()
        ]);

        // Track this process
        activeProcesses.set('verify', process);

        let output = '';
        let error = '';

        process.stdout.on('data', (data) => {
            output += data.toString();
        });

        process.stderr.on('data', (data) => {
            error += data.toString();
        });

        const result = await new Promise((resolve, reject) => {
            process.on('close', async (code) => {
                activeProcesses.delete('verify');
                try {
                    // Try to parse the last line of output as JSON
                    const lines = output.trim().split('\n');
                    const lastLine = lines[lines.length - 1];
                    const result = JSON.parse(lastLine);
                    
                    if (result.success) {
                        await saveCameraSettings({ 
                            selectedCamera: cameraId,
                            width: result.width,
                            height: result.height,
                            fps: result.fps
                        });
                        resolve(result);
                    } else {
                        reject(new Error(result.error || 'Camera verification failed'));
                    }
                } catch (e) {
                    reject(new Error(`Invalid camera verification response: ${e.message}`));
                }
            });

            process.on('error', (err) => {
                reject(err);
            });
        });

        res.json({ success: true, ...result });
    } catch (error) {
        logger.error('Error selecting camera:', error);
        res.status(500).json({ error: error.message });
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

            // Start motion detection process
            const process = spawn('python3', args);

            // Track this process
            activeProcesses.set('motion', process);

            // Handle stdout data (motion detection results)
            let buffer = '';
            process.stdout.on('data', (data) => {
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

            process.stderr.on('data', (data) => {
                // Debug level for camera control output
                logger.debug(`Camera control output: ${data}`);
            });

            // Handle process close
            process.on('close', (code) => {
                activeProcesses.delete('motion');
                res.end();
            });

            // Handle client disconnect
            req.on('close', () => {
                if (activeProcesses.has('motion')) {
                    const process = activeProcesses.get('motion');
                    process.kill('SIGTERM');
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

        // Start head tracking process
        const trackScript = path.join(__dirname, '..', 'scripts', 'head_track.py');
        const args = [
            '--camera-id', settings.selectedCamera.toString(),
            '--servo-id', servoId,
            '--width', '320',  // Use lower resolution for faster processing
            '--height', '240'
        ];

        const process = spawn('python3', [trackScript, ...args]);

        // Track this process
        activeProcesses.set('head_track', process);

        // Set response headers for streaming
        res.setHeader('Content-Type', 'application/x-ndjson');
        res.setHeader('Cache-Control', 'no-cache');
        res.setHeader('Connection', 'keep-alive');

        // Handle stdout data (tracking results)
        let buffer = '';
        process.stdout.on('data', (data) => {
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

                    try {
                        // Check if this is initialization output
                        if (jsonStr.includes('"message":"Head tracking initialized"')) {
                            continue;
                        }

                        // Try to parse as JSON
                        const result = JSON.parse(jsonStr);
                        if (result.success) {
                            res.write(JSON.stringify(result) + '\n');
                        } else {
                            logger.error('Head tracking error:', result.error);
                        }
                    } catch (e) {
                        // Only log parsing errors for non-empty strings that aren't debug output
                        if (jsonStr.trim() && !jsonStr.startsWith('Device') && !jsonStr.includes('v4l2')) {
                            logger.error('Error parsing head tracking data:', e);
                        }
                    }
                }
            } catch (e) {
                logger.error('Error processing head tracking data:', e);
            }
        });

        // Handle stderr output (debug/info messages)
        process.stderr.on('data', (data) => {
            // Debug level for head tracking output
            logger.debug(`Head tracking output: ${data}`);
        });

        // Handle process close
        process.on('close', (code) => {
            activeProcesses.delete('head_track');
            res.end();
        });

        // Handle client disconnect
        req.on('close', () => {
            if (activeProcesses.has('head_track')) {
                const process = activeProcesses.get('head_track');
                process.kill('SIGTERM');
                activeProcesses.delete('head_track');
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

module.exports = router;
