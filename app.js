// Print uncaught exceptions for debugging
process.on('uncaughtException', function (err) {
    console.error('Uncaught Exception:', err.stack || err);
});

// Load environment variables first
require('dotenv').config();

// Suppress deprecation warnings
process.env.NODE_NO_WARNINGS = '1';

// File: app.js

let express, path, http, https, logger, app, server, httpsServer, port, audioStream, soundController, fs, os, session;
let videoStream; // <-- Add videoStream variable
let ledRoutes, lightRoutes, servoRoutes, sensorRoutes, partRoutes, sceneRoutes, characterRoutes, soundRoutes, linearActuatorRoutes, activeModeRoutes, systemConfigRoutes, logRoutes, cameraRoutes, webcamRoutes, voiceRoutes, cleanupRoutes, healthRoutes, authRoutes, sshRoutes, aiConfigRoutes, aiManagementRoutes, configRoutes, headTrackingRoutes, conversationalAiRoutes;
let characterService;
let authMiddleware, rbacMiddleware;

let conversationalAIServiceManager;
let hardwareServiceManager;
let serviceConnectionManager;
let audioCleanupService;
let microphoneManagerService;
let elevenLabsService;
let elevenLabsWebSocketProxy;

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
    https = require('https');
    logger = require('./scripts/logger');
    fs = require('fs');
    app = express();

    // Try to load SSL certificates
    try {
        const sslConfigPath = '/etc/ssl/monsterbox/ssl-config.json';

        if (fs.existsSync(sslConfigPath)) {
            const sslConfigData = fs.readFileSync(sslConfigPath, 'utf8');
            sslConfig = JSON.parse(sslConfigData);

            // Load SSL certificates
            const privateKey = fs.readFileSync(sslConfig.certificates.key, 'utf8');
            const certificate = fs.readFileSync(sslConfig.certificates.cert, 'utf8');

            const credentials = {
                key: privateKey,
                cert: certificate
            };

            // Create HTTPS server
            httpsServer = https.createServer(credentials, app);
            logger.info('🔐 SSL certificates loaded successfully');
        }
    } catch (sslError) {
        logger.warn('⚠️ SSL certificates not available, running HTTP only:', sslError.message);
    }

    // Create HTTP server (always available)
    server = http.createServer(app);

    // Ensure JSON and URL-encoded body parsing is enabled before routes
    app.use(express.json());
    app.use(express.urlencoded({ extended: true }));
    port = process.env.PORT || 80;
    audioStream = require('./scripts/audio');
    videoStream = require('./scripts/video'); // <-- Require video.js
    soundController = require('./controllers/soundController');
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
    configRoutes = require('./routes/configRoutes');
    headTrackingRoutes = require('./routes/headTrackingRoutes');

    // Import authentication routes
    authRoutes = require('./routes/auth/authRoutes');
    sshRoutes = require('./routes/auth/sshRoutes');

    // Import AI configuration routes
    aiConfigRoutes = require('./routes/ai-config');
    aiManagementRoutes = require('./routes/aiManagementRoutes');

    // Import ElevenLabs Conversational AI routes
    conversationalAiRoutes = require('./routes/conversationalAiRoutes');







    // Import authentication middleware
    authMiddleware = require('./middleware/auth');
    rbacMiddleware = require('./middleware/rbac');

    // Import services
    characterService = require('./services/characterService');

    // Initialize audio cleanup service only if not in test mode
    if (process.env.NODE_ENV !== 'test') {
        const AudioCleanupService = require('./services/audioCleanupService');
        audioCleanupService = new AudioCleanupService({
            maxFileAge: 24 * 60 * 60 * 1000, // 24 hours
            cleanupInterval: 2 * 60 * 60 * 1000, // 2 hours
            preserveRecentFiles: 30 * 60 * 1000 // 30 minutes
        });
    }


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
    crossOriginEmbedderPolicy: false, // Required for WebRTC
    crossOriginOpenerPolicy: false // Disable COOP to avoid untrustworthy origin warnings
}));

// Set Content Security Policy manually to avoid formatting issues
app.use((req, res, next) => {
    res.setHeader('Content-Security-Policy',
        "default-src 'self'; " +
        "style-src 'self' 'unsafe-inline' https://fonts.googleapis.com https://cdnjs.cloudflare.com; " +
        "font-src 'self' https://fonts.gstatic.com https://cdnjs.cloudflare.com; " +
        "script-src 'self' 'unsafe-inline' 'unsafe-eval' https://code.jquery.com https://cdn.jsdelivr.net; " +
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
    limit: '50mb', // Increased for audio uploads (STT)
    strict: true
}));
app.use(express.urlencoded({
    extended: true,
    limit: '50mb', // Increased for audio uploads
    parameterLimit: 1000 // Prevent parameter pollution
}));
app.set('view engine', 'ejs');
app.set('views', path.join(__dirname, 'views'));

// Serve static files with correct MIME types
app.use(express.static(path.join(__dirname, 'public'), {
    setHeaders: (res, path) => {
        if (path.endsWith('.css')) {
            res.setHeader('Content-Type', 'text/css');
        } else if (path.endsWith('.mp3')) {
            res.setHeader('Content-Type', 'audio/mpeg');
        } else if (path.endsWith('.wav')) {
            res.setHeader('Content-Type', 'audio/wav');
        } else if (path.endsWith('.ogg')) {
            res.setHeader('Content-Type', 'audio/ogg');
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
    cookie: {
        secure: httpsServer ? true : false, // Enable secure cookies if HTTPS is available
        httpOnly: true,
        maxAge: 24 * 60 * 60 * 1000 // 24 hours
    }
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
app.use('/parts/head-tracking', headTrackingRoutes);
app.use('/parts/microphone', partRoutes.router); // Microphone routes from partRoutes
app.use('/parts', partRoutes.router);
app.use('/characters',
    invalidateCache('GET:/api/characters:'), // Invalidate character cache on modifications
    characterRoutes
);

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
app.use('/api/character', characterRoutes);


app.use('/api/hardware', require('./routes/api/hardwareApiRoutes').router);
app.use('/api/hardware/head-tracking', require('./routes/api/headTrackingApiRoutes'));
app.use('/api/character-audio-config', require('./routes/api/characterAudioConfigRoutes'));
app.use('/api/system', require('./routes/api/systemApiRoutes'));
app.use('/api/service-management', require('./routes/serviceManagementRoutes'));

// Services restart API endpoint (for microphone management page)
app.post('/api/services/restart', asyncHandler(async (req, res) => {
    const { serviceType, port } = req.body;

    if (!serviceType) {
        return res.status(400).json({
            success: false,
            error: 'Service type is required'
        });
    }

    logger.info(`🔄 Restarting ${serviceType} service on port ${port}`);

    let result = false;

    // Use microphone services starter for microphone services
    if (global.microphoneServicesStarter && (serviceType === 'microphone' || serviceType === 'audioStream')) {
        const serviceMap = {
            'microphone': 'microphoneService',
            'audioStream': 'audioStreamService'
        };

        const serviceId = serviceMap[serviceType];
        if (serviceId) {
            result = await global.microphoneServicesStarter.restartService(serviceId);
        }
    } else {
        // Fallback to general service manager
        const ServiceManager = require('./services/serviceManager');
        const serviceManager = new ServiceManager();
        result = await serviceManager.restartService(serviceType, port);
    }

    if (result) {
        logger.info(`✅ ${serviceType} service restarted successfully`);
        res.json({
            success: true,
            message: `${serviceType} service restarted successfully`
        });
    } else {
        logger.error(`❌ Failed to restart ${serviceType} service`);
        res.status(500).json({
            success: false,
            error: `Failed to restart ${serviceType} service`
        });
    }
}));

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



app.use('/cleanup', cleanupRoutes);
app.use('/health', healthRoutes);
app.use('/configuration', configRoutes);

// Audio cleanup API endpoints
app.get('/api/audio-cleanup/stats',
    monitoringLimiter,
    asyncHandler(async (req, res) => {
        const stats = await audioCleanupService.getCleanupStats();
        res.json({
            success: true,
            data: stats,
            timestamp: new Date().toISOString()
        });
    })
);

app.post('/api/audio-cleanup/run',
    cacheManagementLimiter,
    asyncHandler(async (req, res) => {
        const result = await audioCleanupService.manualCleanup();
        res.json({
            success: result.success,
            message: result.success ?
                `Audio cleanup completed. ${result.totalCleaned} files cleaned.` :
                `Audio cleanup failed: ${result.error}`,
            data: result,
            timestamp: new Date().toISOString()
        });
    })
);

// Log Collection routes
app.use('/log-collection', require('./routes/logCollectionRoutes'));
app.use('/api/log-collection', require('./routes/logCollectionRoutes'));

// Browser error logging routes (webcam and console error monitoring)
app.use('/api/logs', require('./routes/browserErrorRoutes'));

// AI Configuration routes
app.use('/ai-config', aiConfigRoutes);
app.use('/ai-management', aiManagementRoutes);
app.use('/api/ai', aiManagementRoutes);

// ElevenLabs Conversational AI routes
app.use('/api/conversational-ai', conversationalAiRoutes);

// Conversational AI Interface route
app.get('/conversational-ai', async (req, res) => {
    try {
        const characterService = require('./services/characterService');
        const fs = require('fs').promises;
        const path = require('path');

        // Get all characters
        const characters = await characterService.getAllCharacters();

        // Get voice service to check for voice configurations
        const voiceService = require('./services/voiceService');

        // Get ElevenLabs agent mapping
        let elevenLabsAgents = {};
        if (global.elevenLabsService) {
            try {
                const serviceStatus = global.elevenLabsService.getStatus();
                const agents = serviceStatus.agents || [];
                // Create mapping from character ID to actual agent ID
                agents.forEach(agent => {
                    if (agent.characterId) {
                        elevenLabsAgents[agent.characterId] = agent.agentId;
                    }
                });
                console.log(`🎭 Loaded ${agents.length} ElevenLabs agents for conversational AI interface`);
            } catch (error) {
                console.warn('⚠️ Could not load ElevenLabs agents:', error.message);
            }
        }

        // Filter characters that have voice configurations and ElevenLabs agents
        const availableCharacters = [];
        for (const char of characters) {
            try {
                const voiceConfig = await voiceService.getVoiceByCharacterId(char.id);
                const actualAgentId = elevenLabsAgents[char.id];

                if (voiceConfig && voiceConfig.speaker_id && actualAgentId) {
                    // Character has both voice configuration and ElevenLabs agent
                    availableCharacters.push({
                        ...char,
                        hasVoice: true,
                        hasAI: true,
                        elevenLabsAgentId: actualAgentId
                    });
                }
            } catch (error) {
                console.warn(`⚠️ Could not check config for character ${char.id}:`, error.message);
            }
        }

        console.log(`🎭 Loaded ${availableCharacters.length} characters with ElevenLabs AI for conversational interface`);

        res.render('enhanced-test-chat', {
            title: 'ElevenLabs Conversational AI',
            characterId: req.query.characterId || (availableCharacters.length > 0 ? availableCharacters[0].id : null),
            agentId: req.query.agentId || null,
            selectedAgent: null,
            pageTitle: 'ElevenLabs Conversational AI',
            characters: availableCharacters,
            assistants: {}
        });
    } catch (error) {
        console.error('❌ Error rendering conversational AI interface:', error);
        res.status(500).send('Failed to load conversational AI interface: ' + error.message);
    }
});

// Enhanced Test Chat route (formerly ChatterPi test)
app.get('/test-chat', async (req, res) => {
    try {
        const characterService = require('./services/characterService');
        const fs = require('fs').promises;
        const path = require('path');

        // Get all characters
        const characters = await characterService.getAllCharacters();

        // Load assistants configuration
        let assistants = {};
        try {
            const assistantsPath = path.join(__dirname, 'data/assistants-config.json');
            const assistantsData = await fs.readFile(assistantsPath, 'utf8');
            const assistantsConfig = JSON.parse(assistantsData);
            assistants = assistantsConfig.assistants || {};
        } catch (error) {
            console.warn('⚠️ Could not load assistants config:', error.message);
        }

        // Get voice service to check for voice configurations
        const voiceService = require('./services/voiceService');

        // Get ElevenLabs agent mapping
        let elevenLabsAgents = {};
        if (global.elevenLabsService) {
            try {
                const serviceStatus = global.elevenLabsService.getStatus();
                const agents = serviceStatus.agents || [];
                // Create mapping from character ID to actual agent ID
                agents.forEach(agent => {
                    if (agent.characterId) {
                        elevenLabsAgents[agent.characterId] = agent.agentId;
                    }
                });
                console.log(`🎭 Loaded ${agents.length} ElevenLabs agents for mapping`);
            } catch (error) {
                console.warn('⚠️ Could not load ElevenLabs agents:', error.message);
            }
        }

        // Filter characters that have voice configurations (for TTS) and optionally AI enabled
        const availableCharacters = [];
        for (const char of characters) {
            try {
                const voiceConfig = await voiceService.getVoiceByCharacterId(char.id);
                if (voiceConfig && voiceConfig.speaker_id) {
                    // Get the actual ElevenLabs agent ID for this character
                    const actualAgentId = elevenLabsAgents[char.id];

                    // Character has voice configuration, include it
                    availableCharacters.push({
                        ...char,
                        hasVoice: true,
                        hasAI: !!actualAgentId, // Use actual agent ID for AI capability
                        elevenLabsAgentId: actualAgentId || char.elevenLabsAgentId // Use actual agent ID if available
                    });
                }
            } catch (error) {
                console.warn(`⚠️ Could not check voice config for character ${char.id}:`, error.message);
            }
        }

        console.log(`🎭 Loaded ${availableCharacters.length} characters with voice configurations for test page`);
        console.log(`🤖 ${availableCharacters.filter(c => c.hasAI).length} characters have AI enabled`);

        // Handle agentId parameter for ElevenLabs agents
        let selectedAgent = null;
        if (req.query.agentId && global.elevenLabsService) {
            try {
                const serviceStatus = global.elevenLabsService.getStatus();
                const agents = serviceStatus.agents || [];
                selectedAgent = agents.find(a => a.agentId === req.query.agentId);
                console.log(`🎭 Found agent for test chat:`, selectedAgent ? selectedAgent.name : 'Not found');
            } catch (error) {
                console.warn('⚠️ Could not get ElevenLabs agent for test chat:', error.message);
            }
        }

        res.render('enhanced-test-chat', {
            title: 'Enhanced Test Chat - AI Conversation Interface',
            characterId: req.query.characterId || (availableCharacters.length > 0 ? availableCharacters[0].id : null),
            agentId: req.query.agentId || null,
            selectedAgent: selectedAgent,
            pageTitle: selectedAgent ? `Test Chat - ${selectedAgent.name}` : 'Enhanced Test Chat',
            characters: availableCharacters,
            assistants: assistants
        });
    } catch (error) {
        console.error('❌ Error rendering enhanced test page:', error);
        res.status(500).send('Failed to load test page: ' + error.message);
    }
});



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

// Redirect old static HTML pages to new EJS-based Configuration system
app.get('/hardware-monitor.html', (req, res) => {
    res.redirect('/configuration#hardware-monitor');
});

app.get('/log-collection/dashboard', (req, res) => {
    res.redirect('/configuration#log-collection');
});

// Root route - must be before error handling middleware
app.get('/', asyncHandler(async (req, res) => {
    const characters = await characterService.getAllCharacters();
    res.render('index', {
        title: 'MonsterBox Control Panel',
        pageTitle: 'Welcome to MonsterBox',
        pageDescription: 'Advanced Animatronic Control System - Choose a character and navigate to get started.',
        breadcrumbs: [
            { name: 'Home', url: '/' }
        ],
        characters: characters
    });
}));

// Route for setting the selected character
app.post('/set-character', (req, res) => {
    const characterId = req.body.characterId;
    req.session.characterId = characterId;
    logger.info(`Character selected: ${characterId}`);
    res.json({ success: true, message: 'Character updated successfully' });
});

// Route for client-side logging - DISABLED to prevent spam
app.post('/client-log', (req, res) => {
    // Silently accept and discard client logs to prevent spam
    res.sendStatus(200);
});

// Route for executing Python scripts
app.post('/execute-python-script', partRoutes.executePythonScript);

// Error handling middleware - must be last
app.use(notFoundHandler);
app.use(errorHandler);

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
async function startServer() {
    // Start HTTP server
    server.listen(port, async () => {
        const localIp = getLocalIpAddress();
        const hostname = os.hostname();

        // Keep these console.log calls for IP and host information
        console.log(`MonsterBox HTTP server running at http://localhost:${port}`);
        console.log(`Local IP address: ${localIp}, system name ${hostname}`);

        // Start HTTPS server if SSL is configured
        if (httpsServer && sslConfig) {
            const httpsPort = sslConfig.https.port || 8080;
            httpsServer.listen(httpsPort, () => {
                console.log(`MonsterBox HTTPS server running at https://localhost:${httpsPort}`);
                console.log(`HTTPS access: https://${hostname}:${httpsPort}`);
                console.log(`HTTPS IP access: https://${localIp}:${httpsPort}`);
                logger.info(`HTTPS server started on port ${httpsPort}`);
            });

            httpsServer.on('error', (error) => {
                logger.error('HTTPS server error:', error);
                if (error.code === 'EADDRINUSE') {
                    logger.error(`HTTPS port ${httpsPort} is already in use`);
                }
            });
        }

        logger.info('HTTP server started successfully');

        // Initialize the new centralized service management system
        await initializeServiceManagement();

        // Start the audio stream WebSocket server (legacy support)
        audioStream.startStream(server);
        if (httpsServer) {
            audioStream.startStream(httpsServer);
        }

        // Start the enhanced audio stream WebSocket server (legacy support)
        const enhancedAudioStream = require('./scripts/enhanced-audio-stream');
        enhancedAudioStream.startStream(server);
        if (httpsServer) {
            enhancedAudioStream.startStream(httpsServer);
        }

        // Start the video stream WebSocket server (legacy support)
        videoStream.startStream(server);
        if (httpsServer) {
            videoStream.startStream(httpsServer);
        }

        // Initialize Character Audio Config Service
        const characterAudioConfigService = require('./services/characterAudioConfigService');
        await characterAudioConfigService.initialize();
        logger.info('🎤 Character Audio Config Service initialized');

        // Start audio cleanup service
        audioCleanupService.start();
        logger.info('🧹 Audio cleanup service started');

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

// Initialize centralized service management system
async function initializeServiceManagement() {
    try {
        logger.info('🚀 Initializing centralized service management system...');

        // Initialize the MonsterBox Service Integration
        const { getInstance: getServiceIntegration } = require('./services/monsterBoxServiceIntegration');
        const serviceIntegration = getServiceIntegration({
            autoStartServices: true,
            enableHealthMonitoring: true,
            enableLegacySupport: true
        });

        const result = await serviceIntegration.initialize();

        if (result.success) {
            logger.info('✅ Centralized service management initialized successfully');

            // Store service integration globally for access by routes
            global.serviceIntegration = serviceIntegration;

            // Log startup results
            if (result.startupResults) {
                const { total } = result.startupResults;
                logger.info(`📊 Service startup summary: ${total.started} started, ${total.failed} failed`);
            }

            // Perform initial health check
            setTimeout(async () => {
                const healthStatus = await serviceIntegration.performHealthCheck();
                if (healthStatus.overall !== 'healthy') {
                    logger.warn(`⚠️ Initial health check shows system is ${healthStatus.overall}`);
                }
            }, 5000);

        } else {
            logger.error('❌ Failed to initialize centralized service management');
            // Fall back to legacy initialization
            await initializeLegacyServices();
        }

        // Always ensure ElevenLabs service is initialized (regardless of service management approach)
        if (!global.elevenLabsService) {
            logger.info('🤖 Ensuring ElevenLabs service is initialized...');
            await initializeConversationalAIServices();
        }

    } catch (error) {
        logger.error('❌ Error initializing centralized service management:', error);
        // Fall back to legacy initialization
        await initializeLegacyServices();
    }

    // Always ensure ElevenLabs service is initialized (regardless of service management approach)
    if (!global.elevenLabsService) {
        logger.info('🤖 Ensuring ElevenLabs service is initialized...');
        await initializeConversationalAIServices();
    }
}

// Legacy service initialization (fallback)
async function initializeLegacyServices() {
    logger.info('🔄 Falling back to legacy service initialization...');

    try {


        // Initialize Conversational AI services with real-time optimizations
        await initializeConversationalAIServices();

        // Initialize Hardware WebSocket Services
        await initializeHardwareServices();

        // Start Microphone WebSocket Services first
        await startMicrophoneWebSocketServices();

        // Initialize Microphone Manager Service
        await initializeMicrophoneManager();

        logger.info('✅ Legacy service initialization completed');
    } catch (error) {
        logger.error('❌ Error in legacy service initialization:', error);
    }
}



// ElevenLabs Conversational AI Service initialization
async function initializeConversationalAIServices() {
    try {
        logger.info('🤖 Initializing ElevenLabs Conversational AI Service...');

        const ElevenLabsConversationalService = require('./services/elevenLabsConversationalService');
        elevenLabsService = new ElevenLabsConversationalService();

        await elevenLabsService.initialize();

        // Make service globally available
        global.elevenLabsService = elevenLabsService;

        // Initialize ElevenLabs Live STT Service
        logger.info('🎤 Initializing ElevenLabs Live STT Service...');
        const ElevenLabsLiveSTTService = require('./services/elevenLabsLiveSTTService');
        const elevenLabsLiveSTTService = new ElevenLabsLiveSTTService();
        await elevenLabsLiveSTTService.initialize();
        global.elevenLabsLiveSTTService = elevenLabsLiveSTTService;
        logger.info(`✅ ElevenLabs Live STT Service initialized on port ${elevenLabsLiveSTTService.port}`);

        logger.info('✅ ElevenLabs Conversational AI Service initialized successfully');
        logger.info(`🌐 ElevenLabs WebSocket server running on port ${elevenLabsService.port}`);

        // Log available agents
        const status = elevenLabsService.getStatus();
        logger.info(`🎭 Available agents: ${status.availableAgents}`);
        status.agents.forEach(agent => {
            logger.info(`   - Character ${agent.characterId}: ${agent.name}`);
        });

        // Initialize ElevenLabs WebSocket SSL Proxies
        try {
            const ElevenLabsWebSocketProxy = require('./services/elevenLabsWebSocketProxy');

            // Conversational Service Proxy (8771 → 8872)
            elevenLabsWebSocketProxy = new ElevenLabsWebSocketProxy({
                proxyPort: 8872,
                targetPort: 8771,
                serviceName: 'ElevenLabs Conversational'
            });
            await elevenLabsWebSocketProxy.start();

            // Make proxy globally available
            global.elevenLabsWebSocketProxy = elevenLabsWebSocketProxy;

            const proxyStatus = elevenLabsWebSocketProxy.getStatus();
            if (proxyStatus.isRunning) {
                logger.info(`🔐 ElevenLabs Conversational secure WebSocket proxy running on port ${proxyStatus.proxyPort}`);
            }

            // Live STT Service Proxy (8778 → 8873)
            const elevenLabsSTTWebSocketProxy = new ElevenLabsWebSocketProxy({
                proxyPort: 8873,
                targetPort: 8778,
                serviceName: 'ElevenLabs Live STT'
            });
            await elevenLabsSTTWebSocketProxy.start();

            // Make STT proxy globally available
            global.elevenLabsSTTWebSocketProxy = elevenLabsSTTWebSocketProxy;

            const sttProxyStatus = elevenLabsSTTWebSocketProxy.getStatus();
            if (sttProxyStatus.isRunning) {
                logger.info(`🔐 ElevenLabs Live STT secure WebSocket proxy running on port ${sttProxyStatus.proxyPort}`);
            }
        } catch (error) {
            logger.warn('⚠️ ElevenLabs secure WebSocket proxies not started:', error.message);
        }

        return true;

    } catch (error) {
        logger.error('❌ Failed to initialize ElevenLabs Conversational AI Service:', error);
        return false;
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

// Start Microphone WebSocket Services
async function startMicrophoneWebSocketServices() {
    try {
        logger.info('🎤🚀 Starting Microphone WebSocket Services...');

        const MicrophoneServicesStarter = require('./scripts/start-microphone-services');
        const starter = new MicrophoneServicesStarter();

        const results = await starter.startAllServices();

        const successCount = results.filter(r => r.started).length;
        if (successCount === results.length) {
            logger.info('✅ All microphone WebSocket services started successfully');
        } else {
            logger.warn(`⚠️ ${successCount}/${results.length} microphone services started`);
        }

        // Store starter for later use
        global.microphoneServicesStarter = starter;

    } catch (error) {
        logger.error('❌ Error starting microphone WebSocket services:', error);
        // Don't exit - continue with limited functionality
    }
}

// Initialize Microphone Manager Service
async function initializeMicrophoneManager() {
    try {
        logger.info('🎤📋 Initializing Microphone Manager Service...');

        const MicrophoneManagerService = require('./services/microphoneManagerService');
        microphoneManagerService = new MicrophoneManagerService();

        const success = await microphoneManagerService.initialize();

        if (success) {
            logger.info('✅ Microphone Manager Service initialized successfully');

            // STT Integration Service removed - now using ElevenLabs Conversational AI

            // Initialize Audio Stream Service with shared microphone manager
            const AudioStreamService = require('./services/audioStreamService');
            const audioStreamService = new AudioStreamService(microphoneManagerService);
            await audioStreamService.initialize();
            logger.info('🔊 Audio Stream Service initialized');

            logger.info('🎤✅ Complete microphone system initialized with separated architecture');
        } else {
            logger.error('❌ Failed to initialize Microphone Manager Service');
        }

    } catch (error) {
        logger.error('❌ Error initializing Microphone Manager Service:', error);
    }
}

// Initialize the application
async function initializeApp() {
    try {
        // Skip most initialization in test mode
        if (process.env.NODE_ENV === 'test') {
            logger.info('Running in test mode - skipping service initialization');
            return;
        }

        // Initialize connection manager first
        serviceConnectionManager = new ServiceConnectionManager({
            maxConnections: 100,
            connectionTimeout: 30000,
            retryInterval: 5000,
            maxRetries: 5,
            healthCheckInterval: 30000
        });

        // Initialize the sound controller
        if (soundController) {
            await soundController.startSoundPlayer();
            logger.info('Sound player initialized successfully');
        }

        // Start the server
        startServer();
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

// Legacy service shutdown (fallback)
async function shutdownLegacyServices() {
    logger.info('🔄 Shutting down legacy services...');

    try {
        // Shutdown ElevenLabs service
        if (elevenLabsService) {
            await elevenLabsService.shutdown();
            logger.info('ElevenLabs Conversational AI service stopped');
        }

        // Shutdown ElevenLabs WebSocket proxy
        if (elevenLabsWebSocketProxy) {
            await elevenLabsWebSocketProxy.stop();
            logger.info('ElevenLabs WebSocket proxy stopped');
        }

        // Shutdown hardware services
        if (hardwareServiceManager) {
            await hardwareServiceManager.shutdown();
            logger.info('Hardware services stopped');
        }

        // Shutdown microphone WebSocket services
        if (global.microphoneServicesStarter) {
            await global.microphoneServicesStarter.stopAllServices();
            logger.info('Microphone WebSocket services stopped');
        }

        // Shutdown microphone manager service
        if (microphoneManagerService) {
            await microphoneManagerService.shutdown();
            logger.info('Microphone manager service stopped');
        }

        logger.info('✅ Legacy service shutdown completed');
    } catch (error) {
        logger.error('❌ Error in legacy service shutdown:', error);
    }
}

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
        // Shutdown centralized service management first
        if (global.serviceIntegration) {
            await global.serviceIntegration.shutdown();
            logger.info('Centralized service management stopped');
        } else {
            // Legacy shutdown
            await shutdownLegacyServices();
        }

        // Shutdown cache manager
        cacheManager.shutdown();
        logger.info('Cache manager stopped');

        // Shutdown connection manager
        if (serviceConnectionManager) {
            await serviceConnectionManager.shutdown();
            logger.info('Service connections closed');
        }

        // Stop audio cleanup service
        if (audioCleanupService) {
            audioCleanupService.stop();
            logger.info('Audio cleanup service stopped');
        }
    } catch (error) {
        logger.error('Error stopping services during shutdown:', error);
    }

    // Close both HTTP and HTTPS servers
    let serversToClose = 1;
    let serversClosed = 0;

    if (httpsServer) {
        serversToClose = 2;
    }

    const onServerClosed = () => {
        serversClosed++;
        if (serversClosed === serversToClose) {
            logger.info('All servers closed');
            process.exit(0);
        }
    };

    server.close(() => {
        logger.info('HTTP server closed');
        onServerClosed();
    });

    if (httpsServer) {
        httpsServer.close(() => {
            logger.info('HTTPS server closed');
            onServerClosed();
        });
    }

    // If servers haven't finished in 10 seconds, shut down forcefully
    setTimeout(() => {
        logger.error('Could not close connections in time, forcefully shutting down');
        process.exit(1);
    }, 10000);
}

// Handle termination signals
process.on('SIGTERM', () => gracefulShutdown('SIGTERM'));
process.on('SIGINT', () => gracefulShutdown('SIGINT'));

// Make server instances available for cleanup
app.set('server', server);
app.set('httpsServer', httpsServer);

// Export app with cleanup functions for testing
module.exports = app;
module.exports.gracefulShutdown = gracefulShutdown;
module.exports.server = server;
module.exports.httpsServer = httpsServer;
