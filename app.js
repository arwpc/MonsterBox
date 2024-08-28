const express = require('express');
const path = require('path');
const app = express();
const port = 3000;

// Import routes
const motorRoutes = require('./routes/motorRoutes');
const sceneRoutes = require('./routes/sceneRoutes');
const characterRoutes = require('./routes/characterRoutes');
const partRoutes = require('./routes/partRoutes');
const soundRoutes = require('./routes/soundRoutes');

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

module.exports = app;
