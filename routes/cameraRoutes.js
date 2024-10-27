const express = require('express');
const router = express.Router();
const { spawn } = require('child_process');
const path = require('path');
const logger = require('../scripts/logger');

router.get('/', async (req, res) => {
    try {
        const characterId = req.query.characterId || req.session.characterId;
        res.render('camera', { 
            title: 'Camera Control',
            characterId: characterId || null
        });
    } catch (error) {
        logger.error('Error rendering camera view:', error);
        res.status(500).render('error', { 
            error: 'Failed to load camera interface',
            details: error.message
        });
    }
});

router.get('/stream', (req, res) => {
    // Use more standard default resolution
    const width = parseInt(req.query.width) || 640;
    const height = parseInt(req.query.height) || 480;

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
        '--height', height.toString()
    ]);

    let hasError = false;

    pythonProcess.stdout.on('data', (data) => {
        try {
            res.write(data);
        } catch (error) {
            logger.error(`Error writing camera stream data: ${error}`);
            if (!res.headersSent) {
                res.status(500).end();
            }
            pythonProcess.kill();
        }
    });

    pythonProcess.stderr.on('data', (data) => {
        const errorMsg = data.toString();
        logger.error(`Camera stream error: ${errorMsg}`);
        hasError = true;
    });

    pythonProcess.on('error', (error) => {
        logger.error(`Failed to start camera stream process: ${error}`);
        if (!res.headersSent) {
            res.status(500).json({
                success: false,
                error: 'Failed to start camera stream'
            });
        }
    });

    pythonProcess.on('exit', (code) => {
        if (code !== 0 && !res.headersSent) {
            res.status(500).json({
                success: false,
                error: 'Camera stream process exited unexpectedly'
            });
        }
    });

    req.on('close', () => {
        pythonProcess.kill();
        logger.info('Camera stream connection closed');
    });

    // Handle response errors
    res.on('error', (error) => {
        logger.error(`Response error in camera stream: ${error}`);
        pythonProcess.kill();
    });
});

router.post('/control', async (req, res) => {
    const { command, params = {} } = req.body;
    const controlScript = path.join(__dirname, '..', 'scripts', 'camera_control.py');
    
    try {
        const args = [controlScript, command];

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
