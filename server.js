#!/usr/bin/env node

/**
 * MonsterBox 4.0 - Single Node Express Server
 * Clean, single-character application with Poses feature
 * Eliminates WebSocket complexity while preserving all functionality
 */

import express from 'express';
import path from 'path';
import { fileURLToPath } from 'url';
import fs from 'fs/promises';

// Route imports
import setupPartsRoutes from './routes/setup/parts.js';
import setupCalibrationRoutes from './routes/setup/calibration.js';
import setupAudioRoutes from './routes/setup/audio.js';
import setupWebcamRoutes from './routes/setup/webcam.js';
import setupModelsRoutes from './routes/setup/models.js';
import setupSuperPowersRoutes from './routes/setup/superPowers.js';
import setupSystemRoutes from './routes/setup/system.js';
import setupPosesRoutes from './routes/setup/poses.js';
import setupCharactersRoutes from './routes/setup/characters.js';
import liveDashboardRoutes from './routes/live/dashboard.js';
import scenesRoutes from './routes/scenes/index.js';
import posesRoutes from './routes/poses/index.js';
import scenesApiRoutes from './routes/scenes/api.js';
import aiSettingsRoutes from './routes/aiSettingsRoutes.js';
import elevenLabsApiRoutes from './routes/api/elevenLabsApiRoutes.js';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

// Global safety: do not crash the process on unexpected errors
process.on('uncaughtException', function (err) {
    console.error('[FATAL] Uncaught exception:', err && err.stack || err);
});
process.on('unhandledRejection', function (reason, p) {
    console.error('[FATAL] Unhandled rejection:', reason);
});

const app = express();

let shuttingDown = false;
// Configuration
const config = await loadConfig();
const PORT = config.port || 3000;

// Middleware
app.use(express.json({ limit: '50mb' }));
app.use(express.urlencoded({ extended: true, limit: '50mb' }));
app.use(express.static(path.join(__dirname, 'public')));

// View engine setup
app.set('view engine', 'ejs');
app.set('views', path.join(__dirname, 'views'));

// Global template variables
app.use((req, res, next) => {
    res.locals.config = config;
    req.app.locals.config = config;
    res.locals.currentCharacter = config.selectedCharacter || null;
    next();
});

// Routes
app.use('/setup/parts', setupPartsRoutes);
app.use('/setup/calibration', setupCalibrationRoutes);
app.use('/setup/audio', setupAudioRoutes);
app.use('/setup/webcam', setupWebcamRoutes);
app.use('/setup/models', setupModelsRoutes);
app.use('/setup/super-powers', setupSuperPowersRoutes);
app.use('/setup/system', setupSystemRoutes);
app.use('/setup/poses', setupPosesRoutes);
app.use('/setup/characters', setupCharactersRoutes);
app.use('/live', liveDashboardRoutes);
app.use('/scenes', scenesRoutes);
app.use('/scenes/api', scenesApiRoutes);
app.use('/poses', posesRoutes);
app.use('/ai-settings', aiSettingsRoutes);
app.use('/api/elevenlabs', elevenLabsApiRoutes);

// Main dashboard route
app.get('/', (req, res) => {
    res.render('index', {
        title: 'MonsterBox 4.0',
        page: 'dashboard',
        config: { theme: 'dark' },
        currentCharacter: null
    });
});

// Setup routes
app.get('/setup', (req, res) => {
    res.render('setup/index', {
        title: 'Setup - MonsterBox 4.0',
        page: 'setup',
        config: { theme: 'dark' },
        currentCharacter: null
    });
});

// Error handling
app.use((err, req, res, next) => {
    console.error('Error:', err);
    res.status(500).json({
        error: 'Internal server error',
        message: err.message
    });
});

// 404 handler
app.use((req, res) => {
    res.status(404).render('error', {
        title: 'Page Not Found',
        error: 'Page not found',
        message: `The page ${req.url} was not found.`
    });
});

// Load configuration
async function loadConfig() {
    try {
        const configPath = path.join(__dirname, 'config/app-config.json');
        const configData = await fs.readFile(configPath, 'utf8');
        return JSON.parse(configData);
    } catch (error) {
        console.warn('Config file not found, using defaults');
        return {
            port: 3000,
            theme: 'dark',
            selectedCharacter: null
        };
    }
}

// Health check for mjpg-streamer service
async function checkMjpgStreamerHealth() {
    try {
        // Create AbortController for better timeout management
        const abortController = new AbortController();
        const timeoutId = setTimeout(() => {
            abortController.abort();
        }, 2000); // Reduced timeout to 2 seconds for startup check

        const response = await fetch('http://localhost:8090/', {
            method: 'GET',
            signal: abortController.signal
        });

        clearTimeout(timeoutId);
        // mjpg-streamer is running if we get any response (even 400/500)
        return response.status !== 0;
    } catch (error) {
        // Connection refused means service is not running - don't log timeout errors
        return false;
    }
}

// Start server
app.listen(PORT, '0.0.0.0', async () => {
    console.log(`🎭 MonsterBox 4.0 server running on port ${PORT}`);
    console.log(`📱 Dashboard: http://localhost:${PORT}`);
    console.log(`⚙️  Setup: http://localhost:${PORT}/setup`);
    console.log(`🎬 Live Mode: http://localhost:${PORT}/live`);

    // Check mjpg-streamer service availability
    console.log(`📹 Checking mjpg-streamer service...`);
    const mjpgHealthy = await checkMjpgStreamerHealth();
    if (mjpgHealthy) {
        console.log(`✅ mjpg-streamer service is running on port 8090`);
        console.log(`🎥 Webcam streaming: http://localhost:8090/?action=stream`);
    } else {
        console.log(`⚠️  mjpg-streamer service not detected on port 8090`);
        console.log(`   To enable webcam streaming, run: sudo systemctl start mjpg-streamer`);
    }
});

// Graceful shutdown handling
async function gracefulShutdown(signal) {
    if (shuttingDown) {
        return;
    }
    shuttingDown = true;
    console.log(`\n🛑 Received ${signal}, shutting down gracefully...`);

    const hardExitTimer = setTimeout(function () {
        console.warn('Force exiting after timeout...');
        process.exit(1);
    }, 4000);

    try {
        // Import and call motion tracking cleanup
        const { cleanup: motionTrackingCleanup } = await import('./controllers/motionTrackingController.js');
        await motionTrackingCleanup();
    } catch (error) {
        console.warn('Motion tracking cleanup error:', (error && error.message) || error);
    }

    clearTimeout(hardExitTimer);
    console.log('✅ Shutdown complete');
    process.exit(0);
}

// Handle termination signals (guard prevents re-entry)
process.on('SIGTERM', function () { gracefulShutdown('SIGTERM'); });
process.on('SIGINT', function () { gracefulShutdown('SIGINT'); });

export default app;
