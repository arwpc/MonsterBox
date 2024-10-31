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
        await saveCameraSettings({ selectedCamera: cameraId });
        res.json({ success: true });
    } catch (error) {
        logger.error('Error selecting camera:', error);
        res.status(500).json({ error: 'Failed to select camera' });
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
