// File: app.js

const express = require('express');
const path = require('path');
const http = require('http');
const { spawn } = require('child_process');
const logger = require('./logger');
const app = express();
const server = http.createServer(app);
const port = 3000;
const audio = require('./scripts/audio');
const fs = require('fs');
const os = require('os');

// ... (keep the existing imports and setup code)

let mjpgStreamerProcess = null;

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

// Function to check if video device exists
function videoDeviceExists() {
    return fs.existsSync('/dev/video0');
}

// Function to start mjpg-streamer with a timeout
function startMjpgStreamer(callback) {
    if (mjpgStreamerProcess) {
        logger.info('mjpg-streamer is already running');
        callback(null);
        return;
    }

    if (!videoDeviceExists()) {
        logger.error('Video device /dev/video0 not found. Cannot start mjpg-streamer.');
        callback(new Error('Video device not found'));
        return;
    }

    logger.info('Starting mjpg-streamer...');
    mjpgStreamerProcess = spawn('mjpg_streamer', [
        '-i', 'input_uvc.so',
        '-o', 'output_http.so -w /usr/local/share/mjpg-streamer/www -p 8080'
    ]);

    let startupTimeout = setTimeout(() => {
        logger.error('mjpg-streamer startup timed out');
        if (mjpgStreamerProcess) {
            mjpgStreamerProcess.kill();
        }
        mjpgStreamerProcess = null;
        callback(new Error('mjpg-streamer startup timed out'));
    }, 10000); // 10 seconds timeout

    mjpgStreamerProcess.stdout.on('data', (data) => {
        logger.info(`mjpg-streamer stdout: ${data}`);
        if (data.includes('starting to serve')) {
            clearTimeout(startupTimeout);
            callback(null);
        }
    });

    mjpgStreamerProcess.stderr.on('data', (data) => {
        logger.error(`mjpg-streamer stderr: ${data}`);
    });

    mjpgStreamerProcess.on('close', (code) => {
        logger.warn(`mjpg-streamer process exited with code ${code}`);
        clearTimeout(startupTimeout);
        mjpgStreamerProcess = null;
        // Attempt to restart mjpg-streamer
        setTimeout(() => startMjpgStreamer(() => {}), 5000);
    });
}

// ... (keep the rest of the existing functions)

// Wrap server startup in a function
function startServer() {
    server.listen(port, () => {
        logger.info(`MonsterBox server running at http://localhost:${port}`);
        logger.info(`Local IP address: ${getLocalIpAddress()}`);
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
    startMjpgStreamer((err) => {
        if (err) {
            logger.error('Failed to start mjpg-streamer, but continuing with app startup:', err);
        }
        
        // Start the audio stream
        try {
            audio.startStream(server);
            logger.info('Audio stream started successfully');
        } catch (error) {
            logger.error('Error starting audio stream:', error);
        }

        // Start the server
        startServer();
    });
}

// Start the application
initializeApp();

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
    
    // Stop mjpg-streamer process
    if (mjpgStreamerProcess) {
        logger.info('Stopping mjpg-streamer process...');
        mjpgStreamerProcess.kill();
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