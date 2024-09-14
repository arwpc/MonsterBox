// File: app.js
const express = require('express');
const path = require('path');
const http = require('http');
const app = express();
const server = http.createServer(app);
const port = 3000;
const camera = require('./scripts/camera');
const audio = require('./scripts/audio');

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

// Camera routes
app.post('/camera/toggle-night-mode', (req, res) => {
    camera.toggleNightMode();
    res.json({ success: true, nightMode: camera.nightMode });
});

// Audio routes
app.post('/audio/set-mic-volume', (req, res) => {
    try {
        audio.setMicVolume(req.body.volume);
        res.json({ success: true, volume: req.body.volume });
    } catch (error) {
        console.error('Error setting mic volume:', error);
        res.status(500).json({ success: false, error: 'Failed to set mic volume' });
    }
});

app.post('/audio/set-audio-device', (req, res) => {
    try {
        audio.setAudioDevice(req.body.device);
        res.json({ success: true, device: req.body.device });
    } catch (error) {
        console.error('Error setting audio device:', error);
        res.status(500).json({ success: false, error: 'Failed to set audio device' });
    }
});

app.get('/audio/devices', (req, res) => {
    audio.getAudioDevices((devices) => {
        res.json({ devices: devices });
    });
});

// Proxy route for mjpeg-streamer
app.use('/stream', (req, res) => {
    const proxyRequest = http.request(
        {
            hostname: 'localhost',
            port: 8080,
            path: '/?action=stream',
            method: req.method,
            headers: req.headers
        },
        (proxyResponse) => {
            res.writeHead(proxyResponse.statusCode, proxyResponse.headers);
            proxyResponse.pipe(res);
        }
    );
    req.pipe(proxyRequest);

    proxyRequest.on('error', (error) => {
        console.error('Proxy request error:', error);
        res.status(500).send('Error connecting to camera stream');
    });
});

// Start the camera and audio streams
camera.startStream();
audio.startStream(server);

// Error handling middleware
app.use((err, req, res, next) => {
    console.error(err.stack);
    res.status(500).send('Something broke!');
});

// Start the server
server.listen(port, () => {
    console.log(`MonsterBox server running at http://localhost:${port}`);
});

process.on('uncaughtException', (error) => {
    console.error('Uncaught Exception:', error);
    // Optionally, you can choose to exit the process here
    // process.exit(1);
});

process.on('unhandledRejection', (reason, promise) => {
    console.error('Unhandled Rejection at:', promise, 'reason:', reason);
    // Optionally, you can choose to exit the process here
    // process.exit(1);
});

module.exports = app;
