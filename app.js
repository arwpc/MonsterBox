// Suppress deprecation warnings
process.env.NODE_NO_WARNINGS = '1';

// File: app.js

const express = require('express');
const path = require('path');
const http = require('http');
const logger = require('./scripts/logger');
const app = express();
const server = http.createServer(app);
const port = 3000;
const audio = require('./scripts/audio');
const fs = require('fs');
const os = require('os');
const session = require('express-session');

// Import routes
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
const systemConfigRoutes = require('./routes/systemConfigRoutes');
const logRoutes = require('./routes/logRoutes');

// Import services
const characterService = require('./services/characterService');

// Basic Express setup
app.use(express.json());
app.use(express.urlencoded({ extended: true }));
app.set('view engine', 'ejs');
app.set('views', path.join(__dirname, 'views'));
app.use(express.static(path.join(__dirname, 'public')));
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

// Use other routes
app.use('/parts/led', ledRoutes);
app.use('/parts/light', lightRoutes);
app.use('/parts/servo', servoRoutes);
app.use('/parts/sensor', sensorRoutes);
app.use('/parts/linear-actuator', linearActuatorRoutes);
app.use('/parts', partRoutes.router); // Changed this line to apply partRoutes to /parts
app.use('/characters', characterRoutes);
app.use('/sounds', soundRoutes);
app.use('/active-mode', activeModeRoutes);
app.use('/system-config', systemConfigRoutes);
app.use('/logs', logRoutes);

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

// New route for client-side logging
app.post('/log', (req, res) => {
    logger.info(`Client log: ${req.body.message}`);
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
        console.log(`info: MonsterBox server running at http://localhost:${port} {"timestamp":"${new Date().toISOString()}"}`);
        console.log(`info: Local IP address: ${localIp}, system name ${hostname} {"timestamp":"${new Date().toISOString()}"}`);
        console.log(`info: Audio stream server started {"timestamp":"${new Date().toISOString()}"}`);
        console.log(`info: Audio stream started successfully {"timestamp":"${new Date().toISOString()}"}`);
        console.log('Ready for Halloween, Sir.');
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
function initializeApp() {
    // Start the audio stream
    try {
        audio.startStream(server);
    } catch (error) {
        logger.error('Error starting audio stream:', error);
    }

    // Start the server only if not in test environment
    if (process.env.NODE_ENV !== 'test') {
        startServer();
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
function gracefulShutdown(reason) {
    logger.info(`Initiating graceful shutdown. Reason: ${reason}`);

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
