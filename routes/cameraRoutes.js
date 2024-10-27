const express = require('express');
const router = express.Router();
const { spawn } = require('child_process');
const path = require('path');
const logger = require('../scripts/logger');

// Main camera control interface
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

// Camera stream endpoint
router.get('/stream', (req, res) => {
    const width = parseInt(req.query.width) || 160;
    const height = parseInt(req.query.height) || 120;

    res.writeHead(200, {
        'Content-Type': 'multipart/x-mixed-replace; boundary=frame',
        'Cache-Control': 'no-cache',
        'Connection': 'keep-alive',
        'Pragma': 'no-cache'
    });

    const streamScript = path.join(__dirname, '..', 'scripts', 'camera_stream.py');
    const pythonProcess = spawn('python3', ['-u', streamScript, 
        '--width', width.toString(), 
        '--height', height.toString()
    ]);

    pythonProcess.stdout.on('data', (data) => {
        res.write('--frame\r\n');
        res.write('Content-Type: image/jpeg\r\n\r\n');
        res.write(data);
        res.write('\r\n');
    });

    pythonProcess.stderr.on('data', (data) => {
        logger.error(`Camera stream error: ${data}`);
    });

    req.on('close', () => {
        pythonProcess.kill();
        logger.info('Camera stream connection closed');
    });
});

// Camera control endpoint
router.post('/control', async (req, res) => {
    const { command, params = {} } = req.body;
    const controlScript = path.join(__dirname, '..', 'scripts', 'camera_control.py');
    
    try {
        const args = [controlScript, command];
        Object.entries(params).forEach(([key, value]) => {
            args.push(`--${key}`, value.toString());
        });

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
            if (code === 0) {
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
    } catch (error) {
        logger.error('Camera control error:', error);
        res.status(500).json({ 
            success: false, 
            error: 'Failed to execute camera control'
        });
    }
});

module.exports = router;
