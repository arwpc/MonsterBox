// File: app.js

const express = require('express');
const path = require('path');
const http = require('http');
const { exec } = require('child_process');
const app = express();
const server = http.createServer(app);
const port = 3000;
const audio = require('./scripts/audio');
const fs = require('fs');
const os = require('os');

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

// Basic Express setup
app.use(express.json());
app.use(express.urlencoded({ extended: true }));
app.set('view engine', 'ejs');
app.use(express.static('public'));
app.use('/scripts', express.static(path.join(__dirname, 'scripts')));

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
app.get('/', (req, res) => {
    res.render('index', { title: 'MonsterBox Control Panel' });
});

// Audio routes
app.post('/audio/set-mic-volume', (req, res) => {
    res.status(200).json({ success: true, message: 'Mic volume control not implemented' });
});

// Function to start mjpg-streamer
function startMjpgStreamer() {
    exec('sudo mjpg_streamer -i "input_uvc.so" -o "output_http.so -w /usr/local/share/mjpg-streamer/www -p 8080"', (error, stdout, stderr) => {
        if (error) {
            console.error(`Error starting mjpg-streamer: ${error}`);
            return;
        }
        console.log(`mjpg-streamer started: ${stdout}`);
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
                return alias.address;
            }
        }
    }
    return '127.0.0.1';  // Fallback to localhost if no other IP is found
}

// Proxy route for mjpeg-streamer with error handling and fallback
app.use('/stream', (req, res) => {
    const fallbackImagePath = path.join(__dirname, 'public', 'images', 'no-stream.jpg');
    const localIpAddress = getLocalIpAddress();
    
    const proxyRequest = http.request(
        {
            hostname: localIpAddress,
            port: 8080,
            path: '/?action=stream',
            method: req.method,
            headers: req.headers,
            timeout: 5000 // 5 seconds timeout
        },
        (proxyResponse) => {
            res.writeHead(proxyResponse.statusCode, proxyResponse.headers);
            proxyResponse.pipe(res);
        }
    );

    proxyRequest.on('error', (error) => {
        console.error('Proxy request error:', error);
        // Send fallback image
        if (!res.headersSent) {
            res.writeHead(200, { 'Content-Type': 'image/jpeg' });
            fs.createReadStream(fallbackImagePath).pipe(res);
        }
    });

    proxyRequest.on('timeout', () => {
        proxyRequest.destroy();
        console.error('Proxy request timeout');
        // Send fallback image
        if (!res.headersSent) {
            res.writeHead(200, { 'Content-Type': 'image/jpeg' });
            fs.createReadStream(fallbackImagePath).pipe(res);
        }
    });

    req.pipe(proxyRequest);
});

// Start the audio stream
audio.startStream(server);

// Error handling middleware
app.use((err, req, res, next) => {
    console.error(err.stack);
    if (!res.headersSent) {
        res.status(500).send('Something broke!');
    }
});

// Start the server
server.listen(port, () => {
    console.log(`MonsterBox server running at http://localhost:${port}`);
    console.log(`Local IP address: ${getLocalIpAddress()}`);
});

process.on('uncaughtException', (error) => {
    console.error('Uncaught Exception:', error);
});

process.on('unhandledRejection', (reason, promise) => {
    console.error('Unhandled Rejection at:', promise, 'reason:', reason);
});

module.exports = app;