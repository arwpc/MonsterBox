const express = require('express');
const path = require('path');
const characterRoutes = require('./routes/characters');
const sceneRoutes = require('./routes/scenes');
const partRoutes = require('./routes/parts');
const scheduleRoutes = require('./routes/schedules');
const { initializeHardware } = require('./hardware/hardwareController');

const app = express();

// Middleware
app.use(express.json());
app.use(express.urlencoded({ extended: true }));
app.use(express.static(path.join(__dirname, 'public')));

// View engine setup
app.set('views', path.join(__dirname, 'views'));
app.set('view engine', 'ejs');

// Routes
app.use('/characters', characterRoutes);
app.use('/scenes', sceneRoutes);
app.use('/parts', partRoutes);
app.use('/schedules', scheduleRoutes);

app.get('/', (req, res) => {
  res.render('index', { title: 'MonsterBox Control Panel' });
});

// Initialize hardware
initializeHardware();

const PORT = process.env.PORT || 3000;
app.listen(PORT, () => console.log(`Server running on port ${PORT}`));

module.exports = app;
