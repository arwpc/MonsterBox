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

// Function to start mjpg-streamer with a timeout
function startMjpgStreamer(callback) {
    if (mjpgStreamerProcess) {
        logger.info('mjpg-streamer is already running');
        callback(null);
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
            logger.error('Failed to start mjpg-streamer, but continuing with app startup');
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

// ... (keep the rest of the existing code, including error handling and graceful shutdown)

module.exports = app;