// File: app.js

const express = require('express');
const path = require('path');
const app = express();
const port = 3000;

// Import routes
const motorRoutes = require('./routes/motorRoutes');
const ledRoutes = require('./routes/ledRoutes');
const lightRoutes = require('./routes/lightRoutes');
const servoRoutes = require('./routes/servoRoutes');
const sensorRoutes = require('./routes/sensorRoutes');
const partRoutes = require('./routes/partRoutes');
const sceneRoutes = require('./routes/sceneRoutes');
const characterRoutes = require('./routes/characterRoutes');
const soundRoutes = require('./routes/soundRoutes');
const linearActuatorRoutes = require('./routes/linearActuatorRoutes');
const armedModeRoutes = require('./routes/armedModeRoutes');

// Import data services
const characterService = require('./services/characterService');
const partService = require('./services/partService');
const sceneService = require('./services/sceneService');

// Basic Express setup
app.use(express.json());
app.use(express.urlencoded({ extended: true }));
app.set('view engine', 'ejs');
app.use(express.static('public'));

// Routes
app.use('/parts/motor', motorRoutes);
app.use('/parts/led', ledRoutes);
app.use('/parts/light', lightRoutes);
app.use('/parts/servo', servoRoutes);
app.use('/parts/sensor', sensorRoutes);
app.use('/parts/linear-actuator', linearActuatorRoutes);
app.use('/parts', partRoutes);
app.use('/scenes', sceneRoutes);
app.use('/characters', characterRoutes);
app.use('/sounds', soundRoutes);
app.use('/armed-mode', armedModeRoutes);

// Main menu route
app.get('/', (req, res) => {
    res.render('index', { title: 'MonsterBox Control Panel' });
});

// Armed Mode route
app.get('/armed-mode', async (req, res) => {
    try {
        const characters = await characterService.getAllCharacters();
        const sensors = await partService.getAllParts().then(parts => parts.filter(part => part.type === 'sensor'));
        const scenes = await sceneService.getAllScenes();
        res.render('armed-mode', { 
            title: 'Armed Mode', 
            characters: characters, 
            sensors: sensors, 
            scenes: scenes 
        });
    } catch (error) {
        console.error('Error loading Armed Mode page:', error);
        res.status(500).send('Error loading Armed Mode page');
    }
});

// Error handling middleware
app.use((err, req, res, next) => {
    console.error(err.stack);
    res.status(500).send('Something broke!');
});

// Start the server
app.listen(port, () => {
    console.log(`MonsterBox server running at http://localhost:${port}`);
});

module.exports = app;
