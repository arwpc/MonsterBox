const express = require('express');
const router = express.Router();
const { spawn } = require('child_process');
const path = require('path');
const logger = require('../scripts/logger');
const fs = require('fs').promises;

// Path to store camera settings
const CAMERA_SETTINGS_PATH = path.join(__dirname, '..', 'data', 'camera-settings.json');

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

router.get('/list', async (req, res) => {
    try {
        const result = await new Promise((resolve, reject) => {
            const process = spawn('v4l2-ctl', ['--list-devices']);
            let output = '';
            let error = '';

            process.stdout.on('data', (data) => {
                output += data.toString();
            });

            process.stderr.on('data', (data) => {
                error += data.toString();
            });

            process.on('close', (code) => {
                if (code === 0) {
                    const cameras = [];
                    const lines = output.split('\n');
                    let currentCamera = null;
                    let devices = [];

                    for (const line of lines) {
                        const trimmedLine = line.trim();
                        if (!trimmedLine) continue;

                        if (line.includes('USB 2.0 Camera')) {
                            // If we have a previous camera, add it to the list
                            if (currentCamera && devices.length > 0) {
                                cameras.push({
                                    name: currentCamera,
                                    devices: devices
                                });
                            }
                            // Start a new camera
                            currentCamera = 'USB Camera';
                            devices = [];
                        } else if (trimmedLine.startsWith('/dev/video')) {
                            const deviceId = parseInt(trimmedLine.replace('/dev/video', ''));
                            if (!isNaN(deviceId)) {
                                devices.push({
                                    id: deviceId,
                                    path: trimmedLine
                                });
                            }
                        }
                    }

                    // Add the last camera if we have one
                    if (currentCamera && devices.length > 0) {
                        cameras.push({
                            name: currentCamera,
                            devices: devices
                        });
                    }

                    resolve(cameras);
                } else {
                    reject(new Error(error || 'Failed to list cameras'));
                }
            });
        });

        res.json(result);
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
        await saveCameraSettings({ selectedCamera: cameraId });
        res.json({ success: true });
    } catch (error) {
        logger.error('Error selecting camera:', error);
        res.status(500).json({ error: 'Failed to select camera' });
    }
});

router.get('/stream', async (req, res) => {
    const width = parseInt(req.query.width) || 640;
    const height = parseInt(req.query.height) || 480;

    try {
        const settings = await loadCameraSettings();
        if (!settings.selectedCamera && settings.selectedCamera !== 0) {
            throw new Error('No camera selected');
        }

        res.writeHead(200, {
            'Content-Type': 'multipart/x-mixed-replace; boundary=frame',
            'Cache-Control': 'no-cache',
            'Connection': 'keep-alive',
            'Pragma': 'no-cache'
        });

        const streamScript = path.join(__dirname, '..', 'scripts', 'camera_stream.py');
        const pythonProcess = spawn('python3', [
            streamScript, 
            '--width', width.toString(), 
            '--height', height.toString(),
            '--camera-id', settings.selectedCamera.toString()
        ]);

        pythonProcess.stdout.on('data', (data) => {
            res.write(data);
        });

        pythonProcess.stderr.on('data', (data) => {
            logger.error(`Camera stream error: ${data}`);
        });

        req.on('close', () => {
            pythonProcess.kill();
            logger.info('Camera stream connection closed');
        });

    } catch (error) {
        logger.error('Camera stream error:', error);
        res.status(500).json({ error: 'Failed to start camera stream' });
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

        const args = [controlScript, command, '--camera-id', settings.selectedCamera.toString()];

        if (command === 'head_track') {
            if (params.action) {
                args.push('--action', params.action);
            }
            if (params['servo-id'] !== undefined) {
                args.push('--servo-id', params['servo-id'].toString());
            }
        } else if (command === 'settings') {
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

        const process = spawn('python3', args);
        let output = '';
        let error = '';

        process.stdout.on('data', (data) => {
            output += data.toString();
        });

        process.stderr.on('data', (data) => {
            error += data.toString();
            logger.error(`Camera control error: ${data}`);
        });

        process.on('close', (code) => {
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

        process.on('error', (err) => {
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
            error: 'Failed to execute camera control'
        });
    }
});

module.exports = router;
