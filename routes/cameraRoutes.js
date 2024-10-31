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

// Kill any existing camera processes
async function killExistingCameraProcesses() {
    return new Promise((resolve) => {
        const kill = spawn('pkill', ['-f', '(camera_stream|camera_control|head_track).py']);
        kill.on('close', () => {
            // Add delay after killing processes
            setTimeout(resolve, 1000);
        });
    });
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

router.get('/stream', async (req, res) => {
    try {
        const settings = await loadCameraSettings();
        if (!settings.selectedCamera && settings.selectedCamera !== 0) {
            throw new Error('No camera selected');
        }

        // Kill any existing camera processes and wait
        await killExistingCameraProcesses();

        const width = parseInt(req.query.width) || 320;  // Default to lower resolution
        const height = parseInt(req.query.height) || 240;
        
        const streamScript = path.join(__dirname, '..', 'scripts', 'camera_stream.py');
        const process = spawn('python3', [
            streamScript,
            '--camera-id', settings.selectedCamera.toString(),
            '--width', width.toString(),
            '--height', height.toString()
        ]);

        res.setHeader('Content-Type', 'multipart/x-mixed-replace; boundary=frame');
        
        process.stdout.on('data', (data) => {
            res.write(data);
        });

        process.stderr.on('data', (data) => {
            logger.error(`Stream error: ${data}`);
        });

        process.on('close', () => {
            res.end();
        });

        req.on('close', () => {
            process.kill();
        });

    } catch (error) {
        logger.error('Stream error:', error);
        res.status(500).send('Stream error');
    }
});

router.get('/list', async (req, res) => {
    try {
        // Kill any existing camera processes and wait
        await killExistingCameraProcesses();

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
                        
                        // If line doesn't start with /dev/, it's a camera name
                        if (!trimmedLine.startsWith('/dev/')) {
                            // Save previous camera if exists
                            if (currentCamera && devices.length > 0) {
                                cameras.push({
                                    name: currentCamera,
                                    devices: devices
                                });
                            }
                            // Start new camera if line not empty
                            if (trimmedLine) {
                                currentCamera = trimmedLine;
                                devices = [];
                            }
                        }
                        // If line starts with /dev/video, it's a device
                        else if (trimmedLine.startsWith('/dev/video')) {
                            const deviceId = parseInt(trimmedLine.replace('/dev/video', ''));
                            devices.push({
                                id: deviceId,
                                path: trimmedLine
                            });
                        }
                    }

                    // Add last camera if exists
                    if (currentCamera && devices.length > 0) {
                        cameras.push({
                            name: currentCamera,
                            devices: devices
                        });
                    }

                    // If no cameras found, try listing video devices directly
                    if (cameras.length === 0) {
                        const videoDevices = [];
                        for (let i = 0; i < 2; i++) {
                            if (fs.existsSync(`/dev/video${i}`)) {
                                videoDevices.push({
                                    id: i,
                                    path: `/dev/video${i}`
                                });
                            }
                        }
                        if (videoDevices.length > 0) {
                            cameras.push({
                                name: 'System Camera',
                                devices: videoDevices
                            });
                        }
                    }

                    resolve(cameras);
                } else {
                    // If v4l2-ctl fails, try listing video devices directly
                    fs.readdir('/dev').then(files => {
                        const videoDevices = files
                            .filter(file => file.startsWith('video'))
                            .map(file => ({
                                id: parseInt(file.replace('video', '')),
                                path: `/dev/${file}`
                            }));
                        
                        if (videoDevices.length > 0) {
                            resolve([{
                                name: 'System Camera',
                                devices: videoDevices
                            }]);
                        } else {
                            reject(new Error('No cameras found'));
                        }
                    }).catch(err => reject(err));
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

        // Kill any existing camera processes and wait
        await killExistingCameraProcesses();

        // Verify camera is accessible
        const verifyScript = path.join(__dirname, '..', 'scripts', 'camera_control.py');
        const process = spawn('python3', [
            verifyScript,
            'motion',  // Use motion command as it includes verification
            '--camera-id', cameraId.toString(),
            '--width', '160',  // Use minimal resolution for quick test
            '--height', '120'
        ]);

        let output = '';
        let error = '';

        process.stdout.on('data', (data) => {
            output += data.toString();
        });

        process.stderr.on('data', (data) => {
            error += data.toString();
        });

        await new Promise((resolve, reject) => {
            process.on('close', (code) => {
                if (code === 0) {
                    try {
                        const result = JSON.parse(output);
                        if (result.success) {
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

        await saveCameraSettings({ selectedCamera: cameraId });
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
            error: error.message
        });
    }
});

module.exports = router;
