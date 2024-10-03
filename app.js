// File: app.js

const express = require('express');
const path = require('path');
const http = require('http');
const { exec, execSync } = require('child_process');
const logger = require('./logger');
const app = express();
const server = http.createServer(app);
const port = 3000;
const audio = require('./scripts/audio');
const fs = require('fs');
const os = require('os');

// Import routes and services
const ledRoutes = require('./routes/ledRoutes');
const lightRoutes = require('./routes/lightRoutes');
const servoRoutes = require('./routes/servoRoutes');
const sensorRoutes = require('./routes/sensorRoutes');
const partRoutes = require('./routes/partRoutes');
const sceneRoutes = require('./routes/sceneRoutes');
const characterRoutes = require('./routes/characterRoutes');
const soundRoutes = require('./routes/soundRoutes');
const linearActuatorRoutes = require('./routes/linearActuatorRoutes');
const activeModeRoutes = require('./routes/activeModeRoutes');
const characterService = require('./services/characterService');

// Basic Express setup
app.use(express.json());
app.use(express.urlencoded({ extended: true }));
app.set('view engine', 'ejs');
app.use(express.static('public'));
app.use('/scripts', express.static(path.join(__dirname, 'scripts')));

// Global character middleware
app.use((req, res, next) => {
    if (!req.session) {
        req.session = {};
    }
    req.session.characterId = req.session.characterId || null;
    next();
});

// Routes
app.use('/parts/led', ledRoutes);
app.use('/parts/light', lightRoutes);
app.use('/parts/servo', servoRoutes);
app.use('/parts/sensor', sensorRoutes);
app.use('/parts/linear-actuator', linearActuatorRoutes);
app.use('/parts', partRoutes);
app.use('/scenes', sceneRoutes);
app.use('/characters', characterRoutes);
app.use('/sounds', soundRoutes);
app.use('/active-mode', activeModeRoutes);

// Main menu route
app.get('/', async (req, res) => {
    try {
        const characters = await characterService.getAllCharacters();
        logger.info(`Fetched ${characters.length} characters for main menu`);
        res.render('index', { 
            title: 'MonsterBox Control Panel',
            characters: characters
        });
    } catch (error) {
        logger.error('Error fetching characters for main menu:', error);
        res.status(500).render('error', { 
            error: 'Failed to fetch characters',
            details: error.message
        });
    }
});

// Set global character route
app.post('/set-character', (req, res) => {
    const { characterId } = req.body;
    req.session.characterId = characterId;
    logger.info(`Set global character ID to ${characterId}`);
    res.json({ success: true });
});

// Audio routes
app.post('/audio/set-mic-volume', (req, res) => {
    logger.info('Mic volume control not implemented');
    res.status(200).json({ success: true, message: 'Mic volume control not implemented' });
});

// Function to check if mjpg-streamer is running
function isMjpgStreamerRunning() {
    try {
        const output = execSync('pgrep mjpg_streamer').toString();
        return output.trim() !== '';
    } catch (error) {
        return false;
    }
}

// Function to check if video device exists
function videoDeviceExists() {
    return fs.existsSync('/dev/video0');
}

// Function to start mjpg-streamer
function startMjpgStreamer() {
    if (isMjpgStreamerRunning()) {
        logger.info('mjpg-streamer is already running');
        return;
    }

    if (!videoDeviceExists()) {
        logger.error('Video device /dev/video0 not found. Cannot start mjpg-streamer.');
        return;
    }

    exec('sudo mjpg_streamer -i "input_uvc.so" -o "output_http.so -w /usr/local/share/mjpg-streamer/www -p 8080"', (error, stdout, stderr) => {
        if (error) {
            logger.error(`Error starting mjpg-streamer: ${error}`);
            return;
        }
        logger.info(`mjpg-streamer started: ${stdout}`);
    });
}

// Try to start mjpg-streamer when the server starts
startMjpgStreamer();

// Function to get the local IP address
function getLocalIpAddress() {
    const interfaces = os.networkInterfaces();
    for (const devName in interfaces) {
        const iface = interfaces[devName];
        for (let i = 0; i < iface.length; i++) {
            const alias = iface[i];
            if (alias.family === 'IPv4' && alias.address !== '127.0.0.1' && !alias.internal) {
                if (alias.address === '10.10.10.215') {
                    return alias.address;
                }
            }
        }
    }
    logger.warn('IP address 10.10.10.215 not found, using fallback');
    return '127.0.0.1';  // Fallback to localhost if the specific IP is not found
}

// Function to retry the proxy request
function retryProxyRequest(req, res, retries = 3) {
    const fallbackImagePath = path.join(__dirname, 'public', 'images', 'no-stream.jpg');
    const localIpAddress = getLocalIpAddress();
    
    logger.info(`Attempting proxy request to ${localIpAddress}:8080`);

    const proxyRequest = http.request(
        {
            hostname: localIpAddress,
            port: 8080,
            path: '/?action=stream',
            method: req.method,
            headers: req.headers,
            timeout: 10000 // 10 seconds timeout
        },
        (proxyResponse) => {
            logger.info(`Proxy request successful, status: ${proxyResponse.statusCode}`);
            if (!res.headersSent) {
                res.writeHead(proxyResponse.statusCode, proxyResponse.headers);
            }
            proxyResponse.pipe(res);
        }
    );

    proxyRequest.on('error', (error) => {
        logger.error('Proxy request error:', { error: error.message, code: error.code, stack: error.stack });
        if (retries > 0) {
            logger.info(`Retrying proxy request. Attempts left: ${retries - 1}`);
            setTimeout(() => retryProxyRequest(req, res, retries - 1), 1000);
        } else {
            logger.warn('Max retries reached, sending fallback image');
            sendFallbackImage(res, fallbackImagePath);
        }
    });

    proxyRequest.on('timeout', () => {
        proxyRequest.destroy();
        logger.error('Proxy request timeout');
        if (retries > 0) {
            logger.info(`Retrying proxy request after timeout. Attempts left: ${retries - 1}`);
            setTimeout(() => retryProxyRequest(req, res, retries - 1), 1000);
        } else {
            logger.warn('Max retries reached after timeout, sending fallback image');
            sendFallbackImage(res, fallbackImagePath);
        }
    });

    req.pipe(proxyRequest);
}

// Function to send fallback image
function sendFallbackImage(res, fallbackImagePath) {
    if (!res.headersSent) {
        res.writeHead(200, { 'Content-Type': 'image/jpeg' });
        fs.createReadStream(fallbackImagePath).pipe(res);
    } else {
        res.end();
    }
}

// Proxy route for mjpeg-streamer with error handling, fallback, and retry mechanism
app.use('/stream', (req, res) => {
    try {
        retryProxyRequest(req, res);
    } catch (error) {
        logger.error('Error in stream route:', error);
        sendFallbackImage(res, path.join(__dirname, 'public', 'images', 'no-stream.jpg'));
    }
});

// Start the audio stream
try {
    audio.startStream(server);
    logger.info('Audio stream started successfully');
} catch (error) {
    logger.error('Error starting audio stream:', error);
}

// Error handling middleware
app.use((err, req, res, next) => {
    logger.error('Unhandled error:', { error: err.message, stack: err.stack });
    if (!res.headersSent) {
        res.status(500).render('error', { error: 'An unexpected error occurred', details: err.message });
    } else {
        res.end();
    }
});

// Start the server
server.listen(port, () => {
    logger.info(`MonsterBox server running at http://localhost:${port}`);
    logger.info(`Local IP address: ${getLocalIpAddress()}`);
});

// Global error handlers
process.on('uncaughtException', (error) => {
    logger.error('Uncaught Exception:', { error: error.message, stack: error.stack });
    gracefulShutdown('Uncaught Exception');
});

process.on('unhandledRejection', (reason, promise) => {
    logger.error('Unhandled Rejection:', { reason: reason, promise: promise });
    gracefulShutdown('Unhandled Rejection');
});

// Graceful shutdown function
function gracefulShutdown(reason) {
    logger.info(`Initiating graceful shutdown. Reason: ${reason}`);
    server.close(() => {
        logger.info('HTTP server closed');
        process.exit(1);
    });

    // If server hasn't finished in 10 seconds, shut down forcefully
    setTimeout(() => {
        logger.error('Could not close connections in time, forcefully shutting down');
        process.exit(1);
    }, 10000);
}

// Handle termination signals
process.on('SIGTERM', () => gracefulShutdown('SIGTERM'));
process.on('SIGINT', () => gracefulShutdown('SIGINT'));

module.exports = app;