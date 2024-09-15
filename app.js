// File: app.js

const express = require('express');
const path = require('path');
const http = require('http');
const app = express();
const server = http.createServer(app);
const port = 3000;
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

// Audio routes
app.post('/audio/set-mic-volume', (req, res) => {
    res.status(200).json({ success: true, message: 'Mic volume control not implemented' });
});

// Proxy route for mjpeg-streamer with error handling
app.use('/stream', (req, res) => {
    let headersSent = false;
    const proxyRequest = http.request(
        {
            hostname: 'localhost',
            port: 8080,
            path: '/?action=stream',
            method: req.method,
            headers: req.headers,
            timeout: 5000 // 5 seconds timeout
        },
        (proxyResponse) => {
            if (!headersSent) {
                res.writeHead(proxyResponse.statusCode, proxyResponse.headers);
                headersSent = true;
            }
            proxyResponse.pipe(res);
        }
    );
    req.pipe(proxyRequest);

    proxyRequest.on('error', (error) => {
        console.error('Proxy request error:', error);
        if (!headersSent) {
            res.status(503).send('Camera stream unavailable');
            headersSent = true;
        }
    });

    proxyRequest.on('timeout', () => {
        console.error('Proxy request timeout');
        proxyRequest.destroy();
        if (!headersSent) {
            res.status(504).send('Camera stream timeout');
            headersSent = true;
        }
    });
});

// Start the audio stream
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
});

process.on('unhandledRejection', (reason, promise) => {
    console.error('Unhandled Rejection at:', promise, 'reason:', reason);
});

module.exports = app;