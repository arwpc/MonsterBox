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

// ... (keep the existing imports and setup code)

// Function to check if mjpg-streamer is running
function isMjpgStreamerRunning() {
    try {
        const output = execSync('pgrep mjpg_streamer').toString();
        return output.trim() !== '';
    } catch (error) {
        logger.error('Error checking mjpg-streamer status:', error);
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

// Health check for mjpg-streamer
function checkMjpgStreamerHealth() {
    if (!isMjpgStreamerRunning()) {
        logger.warn('mjpg-streamer is not running. Attempting to start...');
        startMjpgStreamer();
    }
}

// Set up a periodic health check
setInterval(checkMjpgStreamerHealth, 60000); // Check every minute

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
            timeout: 30000 // Increased timeout to 30 seconds
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
        if (!isMjpgStreamerRunning()) {
            logger.warn('mjpg-streamer is not running. Attempting to start...');
            startMjpgStreamer();
            // Wait for a short time to allow mjpg-streamer to start
            setTimeout(() => retryProxyRequest(req, res), 5000);
        } else {
            retryProxyRequest(req, res);
        }
    } catch (error) {
        logger.error('Error in stream route:', error);
        sendFallbackImage(res, path.join(__dirname, 'public', 'images', 'no-stream.jpg'));
    }
});

// ... (keep the rest of the existing code, including error handling and graceful shutdown)

module.exports = app;