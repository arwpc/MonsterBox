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

// Wait for process to fully terminate
async function waitForProcessTermination(process, timeout = 5000) {
    return new Promise((resolve) => {
        const timer = setTimeout(() => {
            try {
                process.kill('SIGKILL');
            } catch (error) {
                logger.error('Error force killing process:', error);
            }
            resolve();
        }, timeout);

        process.on('exit', () => {
            clearTimeout(timer);
            resolve();
        });

        try {
            process.kill('SIGTERM');
        } catch (error) {
            clearTimeout(timer);
            resolve();
        }
    });
}

// Kill any existing camera processes
async function killExistingCameraProcesses() {
    // First kill any processes we're tracking
    const killPromises = Array.from(activeProcesses.entries()).map(async ([key, process]) => {
        try {
            await waitForProcessTermination(process);
            activeProcesses.delete(key);
        } catch (error) {
            logger.error(`Error killing process ${key}:`, error);
        }
    });

    await Promise.all(killPromises);

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

// Verify camera is free
async function verifyCameraFree(cameraId) {
    try {
        const { stdout } = await exec(`fuser /dev/video${cameraId} 2>/dev/null`);
        return !stdout.trim();
    } catch (error) {
        // If fuser fails, it means no process is using the device
        return true;
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

router.get('/stream', async (req, res) => {
    try {
        const settings = await loadCameraSettings();
        if (!settings.selectedCamera && settings.selectedCamera !== 0) {
            throw new Error('No camera selected');
        }

        // Kill any existing camera processes and wait
        await killExistingCameraProcesses();
        await cleanupLockFiles();

        // Verify camera is free
        if (!await verifyCameraFree(settings.selectedCamera)) {
            throw new Error('Camera is still in use');
        }

        const width = parseInt(req.query.width) || 320;
        const height = parseInt(req.query.height) || 240;
        
        const streamScript = path.join(__dirname, '..', 'scripts', 'camera_stream.py');
        const process = spawn('python3', [
            streamScript,
            '--camera-id', settings.selectedCamera.toString(),
            '--width', width.toString(),
            '--height', height.toString()
        ]);

        // Track this process
        activeProcesses.set('stream', process);

        res.setHeader('Content-Type', 'multipart/x-mixed-replace; boundary=frame');
        
        process.stdout.on('data', (data) => {
            res.write(data);
        });

        process.stderr.on('data', (data) => {
            logger.error(`Stream error: ${data}`);
        });

        process.on('close', () => {
            activeProcesses.delete('stream');
            res.end();
        });

        req.on('close', async () => {
            await waitForProcessTermination(process);
            activeProcesses.delete('stream');
        });

    } catch (error) {
        logger.error('Stream error:', error);
        res.status(500).send('Stream error');
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

        // Verify camera is free
        if (!await verifyCameraFree(settings.selectedCamera)) {
            throw new Error('Camera is still in use');
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
                    const streamProcess = spawn('python3', [
                        path.join(__dirname, '..', 'scripts', 'camera_stream.py'),
                        '--camera-id', settings.selectedCamera.toString(),
                        '--width', (params.width || 320).toString(),
                        '--height', (params.height || 240).toString()
                    ]);
                    activeProcesses.set('stream', streamProcess);
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
            const streamProcess = spawn('python3', [
                path.join(__dirname, '..', 'scripts', 'camera_stream.py'),
                '--camera-id', settings.selectedCamera.toString(),
                '--width', (params.width || 320).toString(),
                '--height', (params.height || 240).toString()
            ]);
            activeProcesses.set('stream', streamProcess);
            
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

// Keep other routes (list, select) unchanged...

module.exports = router;
