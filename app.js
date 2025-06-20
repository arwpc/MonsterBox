// Print uncaught exceptions for debugging
process.on('uncaughtException', function (err) {
    console.error('Uncaught Exception:', err.stack || err);
});

// Load environment variables first
require('dotenv').config();

// Suppress deprecation warnings
process.env.NODE_NO_WARNINGS = '1';

// File: app.js

let express, path, http, logger, app, server, port, audioStream, soundController, fs, os, session;
let videoStream; // <-- Add videoStream variable
let ledRoutes, lightRoutes, servoRoutes, sensorRoutes, partRoutes, sceneRoutes, characterRoutes, soundRoutes, linearActuatorRoutes, activeModeRoutes, systemConfigRoutes, logRoutes, cameraRoutes, webcamRoutes, voiceRoutes, cleanupRoutes, healthRoutes, authRoutes, sshRoutes, jawAnimationRoutes, aiConfigRoutes;
let characterService;
let authMiddleware, rbacMiddleware;
let jawAnimationSystem;
let chatterPiServiceManager;
let hardwareServiceManager;
let serviceConnectionManager;

// Import error handling middleware
const { errorHandler, notFoundHandler, asyncHandler } = require('./middleware/errorHandler');

// Import connection management
const ServiceConnectionManager = require('./services/serviceConnectionManager');

// Import caching middleware
const { cache, invalidateCache, cacheManager } = require('./middleware/cacheMiddleware');

try {
    express = require('express');
    path = require('path');
    http = require('http');
    logger = require('./scripts/logger');
    app = express();
    server = http.createServer(app);

    // Ensure JSON and URL-encoded body parsing is enabled before routes
    app.use(express.json());
    app.use(express.urlencoded({ extended: true }));
    port = process.env.PORT || 3000;
    audioStream = require('./scripts/audio');
    videoStream = require('./scripts/video'); // <-- Require video.js
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
    webcamRoutes = require('./routes/webcamRoutes');
    voiceRoutes = require('./routes/voiceRoutes');
    cleanupRoutes = require('./routes/cleanup');
    healthRoutes = require('./routes/healthRoutes');

    // Import authentication routes
    authRoutes = require('./routes/auth/authRoutes');
    sshRoutes = require('./routes/auth/sshRoutes');

    // Import AI configuration routes
    aiConfigRoutes = require('./routes/ai-config');
    aiManagementRoutes = require('./routes/aiManagementRoutes');

    // Import jaw animation routes
    const jawAnimationRoutesModule = require('./routes/jawAnimationRoutes');
    jawAnimationRoutes = jawAnimationRoutesModule.router;

    // Import authentication middleware
    authMiddleware = require('./middleware/auth');
    rbacMiddleware = require('./middleware/rbac');

    // Import services
    characterService = require('./services/characterService');

    // Import jaw animation system
    const JawAnimationSystem = require('./scripts/jaw-animation/jawAnimationSystem');
    jawAnimationSystem = new JawAnimationSystem();
} catch (err) {
    try {
        require('./scripts/logger').error('Fatal error during app initialization:', err);
    } catch (e) {
        console.error('Fatal error during app initialization:', err);
    }
    process.exit(1);
}

// Security middleware - must be first
const helmet = require('helmet');
const rateLimit = require('express-rate-limit');

// Configure Helmet for security headers (disable CSP to set manually)
app.use(helmet({
    contentSecurityPolicy: false, // Disable to set manually
    crossOriginEmbedderPolicy: false // Required for WebRTC
}));

// Set Content Security Policy manually to avoid formatting issues
app.use((req, res, next) => {
    res.setHeader('Content-Security-Policy',
        "default-src 'self'; " +
        "style-src 'self' 'unsafe-inline' https://fonts.googleapis.com; " +
        "font-src 'self' https://fonts.gstatic.com; " +
        "script-src 'self' 'unsafe-inline' 'unsafe-eval' https://code.jquery.com; " +
        "img-src 'self' data: blob:; " +
        "connect-src 'self' ws: wss:; " +
        "media-src 'self' blob:; " +
        "base-uri 'self'; " +
        "form-action 'self'; " +
        "frame-ancestors 'self'; " +
        "object-src 'none'; " +
        "script-src-attr 'unsafe-inline'"
    );
    next();
});

// Configure rate limiting
const generalLimiter = rateLimit({
    windowMs: 15 * 60 * 1000, // 15 minutes
    max: 1000, // Limit each IP to 1000 requests per windowMs
    message: {
        error: 'Too many requests from this IP, please try again later.',
        retryAfter: '15 minutes'
    },
    standardHeaders: true,
    legacyHeaders: false
});

const apiLimiter = rateLimit({
    windowMs: 15 * 60 * 1000, // 15 minutes
    max: 500, // Limit each IP to 500 API requests per windowMs
    message: {
        error: 'Too many API requests from this IP, please try again later.',
        retryAfter: '15 minutes'
    },
    standardHeaders: true,
    legacyHeaders: false
});

// Strict rate limiting for cache management endpoints
const cacheManagementLimiter = rateLimit({
    windowMs: 15 * 60 * 1000, // 15 minutes
    max: 10, // Very limited cache management operations
    message: {
        error: 'Too many cache management requests from this IP.',
        retryAfter: '15 minutes'
    },
    standardHeaders: true,
    legacyHeaders: false
});

// Moderate rate limiting for monitoring endpoints
const monitoringLimiter = rateLimit({
    windowMs: 1 * 60 * 1000, // 1 minute
    max: 60, // 1 request per second average
    message: {
        error: 'Too many monitoring requests from this IP.',
        retryAfter: '1 minute'
    },
    standardHeaders: true,
    legacyHeaders: false
});

// Apply general rate limiting to all requests
app.use(generalLimiter);

// Basic Express setup with enhanced security
app.use(express.json({
    limit: '10mb', // Prevent large payload attacks
    strict: true
}));
app.use(express.urlencoded({
    extended: true,
    limit: '10mb',
    parameterLimit: 1000 // Prevent parameter pollution
}));
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
    secret: process.env.SESSION_SECRET || 'fallback-secret-key-change-in-production',
    resave: false,
    saveUninitialized: true,
    cookie: { secure: false } // set to true if using https
}));

// JWT session integration middleware
app.use(authMiddleware.integrateWithSession);

// Global character middleware
app.use((req, res, next) => {
    if (!req.session) {
        req.session = {};
    }
    req.session.characterId = req.session.characterId || null;
    next();
});

// Set up authentication routes (no auth required)
app.use('/auth', authRoutes);

// Set up SSH routes (JWT auth required)
app.use('/ssh', sshRoutes);

// Apply API rate limiting to API routes
app.use('/api', apiLimiter);

// Set up routes
app.use('/parts/led', ledRoutes);
app.use('/parts/light', lightRoutes);
app.use('/parts/servo', servoRoutes);
app.use('/parts/sensor', sensorRoutes);
app.use('/parts/linear-actuator', linearActuatorRoutes);
app.use('/parts/webcam', webcamRoutes);
app.use('/parts', partRoutes.router);
app.use('/characters',
    invalidateCache('GET:/api/characters:'), // Invalidate character cache on modifications
    characterRoutes
);
app.use('/ai-instances', require('./routes/aiInstanceRoutes'));
app.use('/sounds', soundRoutes);
app.use('/active-mode', activeModeRoutes);
// System config routes for global servo management
app.use('/system-config', systemConfigRoutes);
app.use('/logs', logRoutes);
app.use('/camera', cameraRoutes);
app.use('/api/webcam', require('./routes/api/webcamApiRoutes'));
app.use('/api/streaming', require('./routes/streamingRoutes'));
app.use('/api/character-webcam', require('./routes/api/characterWebcamApiRoutes'));
app.use('/api/motion-tracking', require('./routes/api/motionTrackingApiRoutes'));
app.use('/api/voice', voiceRoutes);
app.use('/jaw-animation', jawAnimationRoutes);
app.use('/api/chatterpi', require('./routes/chatterpiRoutes'));
app.use('/api/hardware', require('./routes/api/hardwareApiRoutes').router);

// Simple characters API endpoint for hardware monitor (cached)
app.get('/api/characters',
    cache({ ttl: 600000 }), // Cache for 10 minutes
    asyncHandler(async (req, res) => {
        const characterService = require('./services/characterService');
        const characters = await characterService.getAllCharacters();

        // Format for hardware monitor dropdown
        const formattedCharacters = characters.map(char => ({
            id: char.id,
            name: char.char_name || char.name || `Character ${char.id}`
        }));

        res.json(formattedCharacters);
    })
);

// Test route for video configuration component
app.get('/test/video-configuration', (req, res) => {
    res.render('test-video-configuration', {
        title: 'Video Configuration Component Test'
    });
});

// Test route for jaw animation - handled by jawAnimationRoutes

app.use('/cleanup', cleanupRoutes);
app.use('/health', healthRoutes);

// Log Collection routes
app.use('/log-collection', require('./routes/logCollectionRoutes'));
app.use('/api/log-collection', require('./routes/logCollectionRoutes'));

// AI Configuration routes
app.use('/ai-config', aiConfigRoutes);
app.use('/ai-management', aiManagementRoutes);

// Connection monitoring endpoint
app.get('/api/connections/status',
    monitoringLimiter,
    asyncHandler(async (req, res) => {
        if (!serviceConnectionManager) {
            return res.status(503).json({
                success: false,
                error: 'Connection manager not initialized'
            });
        }

        const statuses = await serviceConnectionManager.getServiceStatuses();
        const stats = serviceConnectionManager.getConnectionStats();

        res.json({
            success: true,
            data: {
                services: statuses,
                statistics: stats,
                timestamp: new Date().toISOString()
            }
        });
    }));

// Cache management endpoints
app.get('/api/cache/stats',
    monitoringLimiter,
    asyncHandler(async (req, res) => {
        const stats = cacheManager.getStats();
        res.json({
            success: true,
            data: stats,
            timestamp: new Date().toISOString()
        });
    })
);

app.post('/api/cache/clear',
    cacheManagementLimiter,
    asyncHandler(async (req, res) => {
        const { pattern } = req.body;
        const cleared = cacheManager.clear(pattern);

        res.json({
            success: true,
            message: `Cache cleared: ${cleared} entries removed`,
            pattern: pattern || 'all',
            timestamp: new Date().toISOString()
        });
    })
);

// API Documentation endpoint
app.get('/api/docs', asyncHandler(async (req, res) => {
    const fs = require('fs').promises;
    const path = require('path');
    const marked = require('marked');

    try {
        const docPath = path.join(__dirname, 'docs/api/api-documentation.md');
        const markdown = await fs.readFile(docPath, 'utf8');

        if (req.headers.accept && req.headers.accept.includes('text/html')) {
            // Return HTML version
            const html = marked.parse(markdown);
            const fullHtml = `
<!DOCTYPE html>
<html lang="en">
<head>
    <meta charset="UTF-8">
    <meta name="viewport" content="width=device-width, initial-scale=1.0">
    <title>MonsterBox API Documentation</title>
    <style>
        body { font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, sans-serif;
               line-height: 1.6; max-width: 1200px; margin: 0 auto; padding: 20px; }
        code { background: #f4f4f4; padding: 2px 4px; border-radius: 3px; }
        pre { background: #f4f4f4; padding: 15px; border-radius: 5px; overflow-x: auto; }
        table { border-collapse: collapse; width: 100%; }
        th, td { border: 1px solid #ddd; padding: 8px; text-align: left; }
        th { background-color: #f2f2f2; }
        .endpoint { background: #e8f4fd; padding: 10px; border-left: 4px solid #2196F3; margin: 10px 0; }
    </style>
</head>
<body>
    ${html}
</body>
</html>`;
            res.send(fullHtml);
        } else {
            // Return markdown
            res.type('text/markdown').send(markdown);
        }
    } catch (error) {
        res.status(404).json({
            success: false,
            error: 'API documentation not found'
        });
    }
}));

// API Schema endpoint (OpenAPI 3.0)
app.get('/api/schema', asyncHandler(async (req, res) => {
    const fs = require('fs').promises;
    const path = require('path');

    try {
        const schemaPath = path.join(__dirname, 'docs/api/api-schema.json');
        const schema = await fs.readFile(schemaPath, 'utf8');
        const schemaObj = JSON.parse(schema);

        res.json(schemaObj);
    } catch (error) {
        res.status(404).json({
            success: false,
            error: 'API schema not found'
        });
    }
}));

// Root route - must be before error handling middleware
app.get('/', asyncHandler(async (req, res) => {
    const characters = await characterService.getAllCharacters();
    res.render('index', {
        title: 'MonsterBox Control Panel',
        characters: characters
    });
}));

// Error handling middleware - must be last
app.use(notFoundHandler);
app.use(errorHandler);

// New route for setting the selected character
app.post('/set-character', (req, res) => {
    const characterId = req.body.characterId;
    req.session.characterId = characterId;
    logger.info(`Character selected: ${characterId}`);
    res.json({ success: true, message: 'Character updated successfully' });
});

// Updated route for client-side logging - DISABLED to prevent spam
app.post('/client-log', (req, res) => {
    // Silently accept and discard client logs to prevent spam
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

        // Start the audio stream WebSocket server
        audioStream.startStream(server);

        // Start the video stream WebSocket server
        videoStream.startStream(server); // <-- Call startStream for video

        // Initialize jaw animation system
        initializeJawAnimationSystem(server);

        // Initialize ChatterPi services with real-time optimizations
        initializeChatterPiServices();

        // Initialize Hardware WebSocket Services
        initializeHardwareServices();

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

// Initialize jaw animation system
async function initializeJawAnimationSystem(server) {
    try {
        await jawAnimationSystem.initialize(server);

        // Set the jaw animation system instance in the routes
        const jawAnimationRoutesModule = require('./routes/jawAnimationRoutes');
        jawAnimationRoutesModule.setJawAnimationSystem(jawAnimationSystem);

        logger.info('Jaw animation system initialized successfully');
    } catch (error) {
        logger.error('Failed to initialize jaw animation system:', error);
        // Don't exit - jaw animation is optional
    }
}

// Initialize ChatterPi services with real-time optimizations
async function initializeChatterPiServices() {
    try {
        logger.info('🚀 Initializing ChatterPi services...');

        const SimpleChatterPiManager = require('./services/simpleChatterPiManager');
        chatterPiServiceManager = new SimpleChatterPiManager();

        const success = await chatterPiServiceManager.initialize();

        if (success) {
            logger.info('✅ ChatterPi services initialized with real-time optimizations');

            // Make service manager available to routes
            const chatterpiRoutes = require('./routes/chatterpiRoutes');
            if (chatterpiRoutes.setServiceManager) {
                chatterpiRoutes.setServiceManager(chatterPiServiceManager);
            }

            // Log service status
            const status = chatterPiServiceManager.getServiceStatus();
            logger.info('ChatterPi Service Status:', status);

        } else {
            logger.error('❌ Failed to initialize ChatterPi services');
        }

    } catch (error) {
        logger.error('❌ Error initializing ChatterPi services:', error);
    }
}

// Initialize Hardware WebSocket Services
async function initializeHardwareServices() {
    try {
        logger.info('🦾 Initializing Hardware WebSocket Services...');

        const HardwareServiceManager = require('./services/hardwareServiceManager');
        hardwareServiceManager = new HardwareServiceManager();

        const success = await hardwareServiceManager.initialize();

        if (success) {
            logger.info('✅ Hardware WebSocket Services initialized successfully');

            // Connect hardware service manager to API routes
            const hardwareApiRoutes = require('./routes/api/hardwareApiRoutes');
            hardwareApiRoutes.setHardwareServiceManager(hardwareServiceManager);

            // Start hardware services for default character (Skulltalker - ID 4)
            await hardwareServiceManager.startCharacterServices(4);

            logger.info('🎭 Hardware services started for Skulltalker character');
        } else {
            logger.error('❌ Failed to initialize Hardware WebSocket Services');
        }

    } catch (error) {
        logger.error('❌ Error initializing Hardware WebSocket Services:', error);
    }
}

// Initialize the application
async function initializeApp() {
    try {
        // Initialize connection manager first
        serviceConnectionManager = new ServiceConnectionManager({
            maxConnections: 100,
            connectionTimeout: 30000,
            retryInterval: 5000,
            maxRetries: 5,
            healthCheckInterval: 30000
        });

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
        // Use graceful shutdown for sound controller
        await soundController.gracefulShutdown();
        logger.info('Sound controller shutdown completed');
    } catch (error) {
        logger.error('Error during sound controller shutdown:', error);
    }

    try {
        // Shutdown cache manager
        cacheManager.shutdown();
        logger.info('Cache manager stopped');

        // Shutdown connection manager
        if (serviceConnectionManager) {
            await serviceConnectionManager.shutdown();
            logger.info('Service connections closed');
        }

        // Shutdown hardware services
        if (hardwareServiceManager) {
            await hardwareServiceManager.shutdown();
            logger.info('Hardware services stopped');
        }
    } catch (error) {
        logger.error('Error stopping services during shutdown:', error);
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
