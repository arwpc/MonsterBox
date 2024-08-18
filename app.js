const express = require('express');
const dataManager = require('./dataManager');
const multer = require('multer');
const path = require('path');
const fs = require('fs').promises;
const app = express();
const port = 3000;

// Import routes
const motorRoutes = require('./routes/motorRoutes');
const sceneRoutes = require('./routes/sceneRoutes');
const characterRoutes = require('./routes/characterRoutes');
const partRoutes = require('./routes/partRoutes');
const soundRoutes = require('./routes/soundRoutes');
const sensorRoutes = require('./routes/sensorRoutes');
const activeModeRoutes = require('./routes/activeModeRoutes');

// Multer setup for file uploads
const storage = multer.diskStorage({
    destination: function (req, file, cb) {
        if (file.fieldname === "sound_file") {
            cb(null, 'public/sounds/');
        } else if (file.fieldname === "character_image") {
            cb(null, 'public/images/characters/');
        }
    },
    filename: function (req, file, cb) {
        cb(null, Date.now() + path.extname(file.originalname));
    }
});
const upload = multer({ storage: storage });

// Basic Express setup
app.use(express.json());
app.use(express.urlencoded({ extended: true }));
app.set('view engine', 'ejs');
app.use(express.static('public'));

// Routes
app.use('/motor', motorRoutes);
app.use('/scenes', sceneRoutes);
app.use('/characters', characterRoutes);
app.use('/parts', partRoutes);
app.use('/sounds', soundRoutes);
app.use('/sensors', sensorRoutes);
app.use('/active-mode', activeModeRoutes);

// Main menu route
app.get('/', (req, res) => {
    res.render('index', { title: 'MonsterBox Control Panel' });
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

// Graceful shutdown
process.on('SIGINT', () => {
    console.log('Shutting down gracefully...');
    process.exit();
});
