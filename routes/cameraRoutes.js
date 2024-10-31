const express = require('express');
const router = express.Router();
const { spawn } = require('child_process');
const path = require('path');
const logger = require('../scripts/logger');
const fs = require('fs').promises;
const util = require('util');
const exec = util.promisify(require('child_process').exec);

// Path to store camera settings
const CAMERA_SETTINGS_PATH = path.join(__dirname, '..', 'data', 'camera-settings.json');

// Keep track of active camera processes
let activeProcesses = new Map();

// Load camera settings
async function loadCameraSettings() {
    try {
        const data = await fs.readFile(CAMERA_SETTINGS_PATH, 'utf8');
        return JSON.parse(data);
    } catch (error) {
        return { selectedCamera: null };
    }
}

// Save camera settings
async function saveCameraSettings(settings) {
    try {
        await fs.writeFile(CAMERA_SETTINGS_PATH, JSON.stringify(settings, null, 2));
    } catch (error) {
        logger.error('Error saving camera settings:', error);
    }
}

// Kill any existing camera processes
async function killExistingCameraProcesses() {
    // First kill any processes we're tracking
    for (const [key, process] of activeProcesses.entries()) {
        try {
            process.kill('SIGTERM');
            activeProcesses.delete(key);
            logger.info(`Killed process: ${key}`);
        } catch (error) {
            logger.error(`Error killing process ${key}:`, error);
        }
    }

    // Then use pkill as a backup
    try {
        await exec('pkill -f "(camera_stream|camera_control|head_track).py"');
        logger.info('Killed any remaining camera processes');
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
                    logger.info(`Removed lock file: ${file}`);
                } catch (error) {
                    logger.error(`Error removing lock file ${file}:`, error);
                }
            }
        }
        // Add delay after cleanup
        await new Promise(resolve => setTimeout(resolve, 1000));
    } catch (error) {
        logger.error('Error cleaning up lock files:', error);
    }
}

// Start camera stream
async function startCameraStream(cameraId, width = 320, height = 240) {
    return new Promise((resolve, reject) => {
        const streamScript = path.join(__dirname, '..', 'scripts', 'camera_stream.py');
        logger.info(`Starting camera stream: ${streamScript}`);
        
        const process = spawn('python3', [
            streamScript,
            '--camera-id', cameraId.toString(),
            '--width', width.toString(),
            '--height', height.toString()
        ]);

        let initOutput = '';
        let initError = '';
        let initialized = false;

        // Handle initialization output
        process.stdout.once('data', (data) => {
            try {
                initOutput += data.toString();
                const result = JSON.parse(initOutput);
                if (result.success) {
                    initialized = true;
                    resolve(process);
                } else {
                    reject(new Error(result.error || 'Failed to initialize camera'));
                }
            } catch (e) {
                // If not JSON, it's probably the first frame
                if (initialized) {
                    resolve(process);
                }
            }
        });

        process.stderr.on('data', (data) => {
            const msg = data.toString();
            if (!initialized) {
                initError += msg;
            }
            logger.info(`Stream output: ${msg}`);
        });

        process.on('error', (err) => {
            if (!initialized) {
                reject(err);
            }
            logger.error('Stream process error:', err);
        });

        process.on('close', (code) => {
            if (!initialized) {
                reject(new Error(initError || `Stream process exited with code ${code}`));
            }
            logger.info(`Stream process closed with code ${code}`);
        });

        // Set a timeout for initialization
        setTimeout(() => {
            if (!initialized) {
                process.kill('SIGTERM');
                reject(new Error('Stream initialization timeout'));
            }
        }, 5000);

        // Track this process
        activeProcesses.set('stream', process);
        logger.info('Camera stream process started');
    });
}

// Camera routes
router.get('/', async (req, res) => {
    try {
        const characterId = req.query.characterId || req.session.characterId;
        const settings = await loadCameraSettings();
        res.render('camera', { 
            title: 'Camera Control',
            characterId: characterId || null,
            selectedCamera: settings.selectedCamera
        });
    } catch (error) {
        logger.error('Error rendering camera view:', error);
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

        const width = parseInt(req.query.width) || 320;
        const height = parseInt(req.query.height) || 240;

        streamProcess = await startCameraStream(settings.selectedCamera, width, height);

        res.setHeader('Content-Type', 'multipart/x-mixed-replace; boundary=frame');
        
        streamProcess.stdout.on('data', (data) => {
            try {
                res.write(data);
            } catch (error) {
                logger.error('Error writing stream data:', error);
            }
        });

        streamProcess.stderr.on('data', (data) => {
            logger.info(`Stream output: ${data}`);
        });

        streamProcess.on('close', (code) => {
            logger.info(`Stream process closed with code ${code}`);
            activeProcesses.delete('stream');
            try {
                res.end();
            } catch (error) {
                logger.error('Error ending stream response:', error);
            }
        });

        req.on('close', async () => {
            logger.info('Client disconnected, cleaning up');
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
            logger.info('v4l2-ctl failed, falling back to direct device check');
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
                        '--width', '160',
                        '--height', '120'
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
        logger.info(`Verifying camera ${cameraId}`);
        
        const process = spawn('python3', [
            verifyScript,
            'settings',
            '--camera-id', cameraId.toString(),
            '--width', '160',
            '--height', '120'
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
            logger.error(`Camera verification error: ${data}`);
        });

        await new Promise((resolve, reject) => {
            process.on('close', async (code) => {
                activeProcesses.delete('verify');
                if (code === 0) {
                    try {
                        const result = JSON.parse(output);
                        if (result.success) {
                            await saveCameraSettings({ selectedCamera: cameraId });
                            logger.info(`Camera ${cameraId} selected successfully`);
                            resolve();
                        } else {
                            reject(new Error(result.error || 'Camera verification failed'));
                        }
                    } catch (e) {
                        reject(new Error('Invalid camera verification response'));
                    }
                } else {
                    reject(new Error(error || 'Camera verification failed'));
                }
            });
        });

        res.json({ success: true });
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

        if (command === 'settings') {
            if (params.width !== undefined) {
                args.push('--width', params.width.toString());
            }
            if (params.height !== undefined) {
                args.push('--height', params.height.toString());
            }
        } else if (command === 'motion') {
            // No additional parameters needed for motion detection
        } else {
            return res.status(400).json({
                success: false,
                error: `Unknown command: ${command}`
            });
        }

        logger.info(`Executing camera control: ${args.join(' ')}`);
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
            logger.error(`Camera control error: ${data}`);
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
                // If motion detection fails, try to restart streaming
                if (command === 'motion') {
                    await new Promise(resolve => setTimeout(resolve, 2000));
                    const streamProcess = await startCameraStream(
                        settings.selectedCamera,
                        params.width || 320,
                        params.height || 240
                    );
                    streamProcess.on('error', (err) => {
                        logger.error('Stream process error:', err);
                    });
                }
                
                res.status(500).json({ 
                    success: false, 
                    error: error || 'Camera control failed'
                });
            }
        });

        process.on('error', async (err) => {
            activeProcesses.delete('control');
            logger.error('Failed to start camera control process:', err);
            
            // If process fails to start, try to restart streaming
            await new Promise(resolve => setTimeout(resolve, 2000));
            const streamProcess = await startCameraStream(
                settings.selectedCamera,
                params.width || 320,
                params.height || 240
            );
            streamProcess.on('error', (err) => {
                logger.error('Stream process error:', err);
            });
            
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

module.exports = router;
