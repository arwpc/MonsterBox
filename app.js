// File: app.js
const express = require('express');
const path = require('path');
const http = require('http');
const app = express();
const server = http.createServer(app);
const port = 3000;
const camera = require('./scripts/camera');

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

app.post('/camera/set-resolution', (req, res) => {
    camera.setResolution(req.body.resolution);
    res.json({ success: true, resolution: req.body.resolution });
});

app.post('/camera/set-framerate', (req, res) => {
    camera.setFramerate(req.body.framerate);
    res.json({ success: true, framerate: req.body.framerate });
});

app.post('/camera/set-mic-volume', (req, res) => {
    camera.setMicVolume(req.body.volume);
    res.json({ success: true, volume: req.body.volume });
});

// Start the camera stream
global.server = server;
camera.startStream(server);

// Error handling middleware
app.use((err, req, res, next) => {
    console.error(err.stack);
    res.status(500).send('Something broke!');
});

// Start the server
server.listen(port, () => {
    console.log(`MonsterBox server running at http://localhost:${port}`);
});

module.exports = app;