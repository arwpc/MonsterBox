// Load environment variables first
require('dotenv').config();

// Suppress deprecation warnings
process.env.NODE_NO_WARNINGS = '1';

// File: app.js

let express, path, http, logger, app, server, port, audioStream, soundController, fs, os, session;
let ledRoutes, lightRoutes, servoRoutes, sensorRoutes, partRoutes, sceneRoutes, characterRoutes, soundRoutes, linearActuatorRoutes, activeModeRoutes, systemConfigRoutes, logRoutes, cameraRoutes, voiceRoutes;
let characterService;

try {
    express = require('express');
    path = require('path');
    http = require('http');
    logger = require('./scripts/logger');
    app = express();
    server = http.createServer(app);
    port = 3000;
    audioStream = require('./scripts/audio');
    soundController = require('./controllers/soundController');
    fs = require('fs');
    os = require('os');
    session = require('express-session');

    // Import routes
    ledRoutes = require('./routes/ledRoutes');
    lightRoutes = require('./routes/lightRoutes');
    servoRoutes = require('./routes/servoRoutes');
    sensorRoutes = require('./routes/sensorRoutes');
    partRoutes = require('./routes/partRoutes');
    sceneRoutes = require('./routes/sceneRoutes');
    characterRoutes = require('./routes/characterRoutes');
    soundRoutes = require('./routes/soundRoutes');
    linearActuatorRoutes = require('./routes/linearActuatorRoutes');
    activeModeRoutes = require('./routes/activeModeRoutes');
    systemConfigRoutes = require('./routes/systemConfigRoutes');
    logRoutes = require('./routes/logRoutes');
    cameraRoutes = require('./routes/cameraRoutes');
    voiceRoutes = require('./routes/voiceRoutes');

    // Import services
    characterService = require('./services/characterService');
} catch (err) {
    // Log to console and logger if possible
    let logger;
    try {
        logger = require('./scripts/logger');
        logger.error('Fatal error during app initialization:', err);
    } catch (e) {
        console.error('Fatal error during app initialization:', err);
    }
    process.exit(1);
}

// Basic Express setup
app.use(express.json());
app.use(express.urlencoded({ extended: true }));
app.set('view engine', 'ejs');
app.set('views', path.join(__dirname, 'views'));

// Serve static files with correct MIME types
app.use(express.static(path.join(__dirname, 'public'), {
    setHeaders: (res, path) => {
        if (path.endsWith('.css')) {
            res.setHeader('Content-Type', 'text/css');
        }
    }
}));

// Add this line to serve files from the 'scripts' directory
app.use('/scripts', express.static(path.join(__dirname, 'scripts')));

// Use sceneRoutes before session middleware
app.use('/scenes', sceneRoutes);

// Session middleware
app.use(session({
    secret: 'your-secret-key',
    resave: false,
    saveUninitialized: true,
    cookie: { secure: false } // set to true if using https
}));

// Global character middleware
app.use((req, res, next) => {
    if (!req.session) {
        req.session = {};
    }
    req.session.characterId = req.session.characterId || null;
    next();
});

// Use routes
app.use('/parts/led', ledRoutes);
app.use('/parts/light', lightRoutes);
app.use('/parts/servo', servoRoutes);
app.use('/parts/sensor', sensorRoutes);
app.use('/parts/linear-actuator', linearActuatorRoutes);
app.use('/parts', partRoutes.router);
app.use('/characters', characterRoutes);
app.use('/sounds', soundRoutes);
app.use('/active-mode', activeModeRoutes);
app.use('/system-config', systemConfigRoutes);
app.use('/logs', logRoutes);
app.use('/camera', cameraRoutes);
app.use('/api/voice', voiceRoutes);

// Root route
app.get('/', async (req, res) => {
    try {
        const characters = await characterService.getAllCharacters();
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

// New route for setting the selected character
app.post('/set-character', (req, res) => {
    const characterId = req.body.characterId;
    req.session.characterId = characterId;
    logger.info(`Character selected: ${characterId}`);
    res.json({ success: true, message: 'Character updated successfully' });
});

// Updated route for client-side logging
app.post('/client-log', (req, res) => {
    const { level, message } = req.body;
    if (logger[level]) {
        logger[level](`Client log: ${message}`);
    } else {
        logger.info(`Client log (unknown level ${level}): ${message}`);
    }
    res.sendStatus(200);
});

// New route for executing Python scripts
app.post('/execute-python-script', partRoutes.executePythonScript);

// Function to get the local IP address
function getLocalIpAddress() {
    const interfaces = os.networkInterfaces();
    for (const devName in interfaces) {
        const iface = interfaces[devName];
        for (let i = 0; i < iface.length; i++) {
            const alias = iface[i];
            if (alias.family === 'IPv4' && alias.address !== '127.0.0.1' && !alias.internal) {
                return alias.address;
            }
        }
    }
    logger.warn('No suitable IP address found, using fallback');
    return '127.0.0.1';  // Fallback to localhost if no suitable IP is found
}

// Wrap server startup in a function
function startServer() {
    server.listen(port, () => {
        const localIp = getLocalIpAddress();
        const hostname = os.hostname();
        // Keep these console.log calls for IP and host information
        console.log(`MonsterBox server running at http://localhost:${port}`);
        console.log(`Local IP address: ${localIp}, system name ${hostname}`);
        logger.info('Server started successfully');
        logger.info('Ready for Halloween, Sir.');
    });

    server.on('error', (error) => {
        if (error.syscall !== 'listen') {
            throw error;
        }

        switch (error.code) {
            case 'EACCES':
                logger.error(`Port ${port} requires elevated privileges`);
                process.exit(1);
                break;
            case 'EADDRINUSE':
                logger.error(`Port ${port} is already in use`);
                process.exit(1);
                break;
            default:
                throw error;
        }
    });
}

// Initialize the application
async function initializeApp() {
    try {
        // Start the audio stream
        audioStream.startStream(server);
        logger.info('Audio stream started successfully');

        // Initialize the sound controller
        await soundController.startSoundPlayer();
        logger.info('Sound player initialized successfully');

        // Start the server only if not in test environment
        if (process.env.NODE_ENV !== 'test') {
            startServer();
        }
    } catch (error) {
        logger.error('Error during initialization:', error);
        process.exit(1);
    }
}

// Start the application if this file is run directly
if (require.main === module) {
    initializeApp();
}

// Global error handlers
process.on('uncaughtException', (error) => {
    logger.error('Uncaught Exception:', { error: error.message, stack: error.stack });
    // Attempt to gracefully shutdown or restart the application
    gracefulShutdown('Uncaught Exception');
});

process.on('unhandledRejection', (reason, promise) => {
    logger.error('Unhandled Rejection:', { reason: reason, promise: promise });
    // Attempt to gracefully shutdown or restart the application
    gracefulShutdown('Unhandled Rejection');
});

// Graceful shutdown function
async function gracefulShutdown(reason) {
    logger.info(`Initiating graceful shutdown. Reason: ${reason}`);

    try {
        // Stop all sounds
        await soundController.stopAllSounds();
        logger.info('All sounds stopped');
    } catch (error) {
        logger.error('Error stopping sounds during shutdown:', error);
    }

    server.close(() => {
        logger.info('HTTP server closed');
        process.exit(0);
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
