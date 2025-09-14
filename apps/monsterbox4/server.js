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
app.use('/poses', posesRoutes);

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

// Start server
app.listen(PORT, '0.0.0.0', () => {
    console.log(`🎭 MonsterBox 4.0 server running on port ${PORT}`);
    console.log(`📱 Dashboard: http://localhost:${PORT}`);
    console.log(`⚙️  Setup: http://localhost:${PORT}/setup`);
    console.log(`🎬 Live Mode: http://localhost:${PORT}/live`);
});

export default app;
