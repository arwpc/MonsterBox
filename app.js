// app.js
const express = require('express');
const path = require('path');
const app = express();

// Import route modules
const characterRoutes = require('./routes/characterRoutes');
const sceneRoutes = require('./routes/sceneRoutes');
const partRoutes = require('./routes/partRoutes');
const soundRoutes = require('./routes/soundRoutes');

// Middleware setup
app.use(express.json());
app.use(express.urlencoded({ extended: true }));
app.set('view engine', 'ejs');
app.use(express.static(path.join(__dirname, 'public')));

// Main menu route
app.get('/', (req, res) => {
    res.render('index', { title: 'MonsterBox Control Panel' });
});

// Register routes
app.use('/characters', characterRoutes);
app.use('/scenes', sceneRoutes);
app.use('/parts', partRoutes);
app.use('/sounds', soundRoutes);

// Handle 404 errors
app.use((req, res, next) => {
    res.status(404).send('Sorry, the page you are looking for does not exist.');
});

// Handle other errors
app.use((err, req, res, next) => {
    console.error(err.stack);
    res.status(500).send('Something went wrong!');
});

// Start the server
const port = 3000;
app.listen(port, () => {
    console.log(`MonsterBox server running at http://localhost:${port}`);
});

module.exports = app;
