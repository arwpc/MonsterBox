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
        } catch (error) {
            logger.error(`Error killing process ${key}:`, error);
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

// Rest of the routes remain unchanged...
