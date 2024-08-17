const express = require('express');
const path = require('path');
const { exec } = require('child_process');
const dataManager = require('../dataManager');
const multer = require('multer');
const router = express.Router();

// Multer setup for file uploads
const storage = multer.diskStorage({
    destination: function (req, file, cb) {
        cb(null, 'public/sounds/');
    },
    filename: function (req, file, cb) {
        cb(null, Date.now() + path.extname(file.originalname));
    }
});
const upload = multer({ storage: storage });

router.get('/', async (req, res) => {
    try {
        const sounds = await dataManager.getSounds();
        res.render('sounds', { title: 'Sounds', sounds });
    } catch (error) {
        console.error('Error fetching sounds:', error);
        res.status(500).send('Internal Server Error');
    }
});

router.get('/new', (req, res) => {
    res.render('sound-form', { title: 'Add New Sound', action: '/sounds' });
});

router.post('/', upload.single('sound_file'), async (req, res) => {
    try {
        const sounds = await dataManager.getSounds();
        const newSound = {
            id: dataManager.getNextId(sounds),
            name: req.body.name,
            filename: req.file.filename
        };
        sounds.push(newSound);
        await dataManager.saveSounds(sounds);
        res.redirect('/sounds');
    } catch (error) {
        console.error('Error adding sound:', error);
        res.status(500).send('Internal Server Error');
    }
});

router.post('/play', async (req, res) => {
    try {
        const { soundId } = req.body;
        const sounds = await dataManager.getSounds();
        const sound = sounds.find(s => s.id === parseInt(soundId));

        if (sound) {
            const filePath = path.join(__dirname, '../public/sounds', sound.filename);
            const pythonScriptPath = path.join(__dirname, '../scripts/play_sound.py');

            console.log(`Attempting to play sound: ${filePath}`);

            // Call the Python script to play the sound
            exec(`python3 ${pythonScriptPath} "${filePath}"`, (error, stdout, stderr) => {
                if (error) {
                    console.error(`Error executing Python script: ${error.message}`);
                    console.error(`stderr: ${stderr}`);
                    return res.status(500).send(`Error playing sound: ${error.message}`);
                }
                if (stderr) {
                    console.error(`Error from Python script: ${stderr}`);
                    return res.status(500).send(`Error playing sound: ${stderr}`);
                }
                console.log(`Python script output: ${stdout}`);
                res.status(200).send('Playing sound on character');
            });
        } else {
            res.status(404).send('Sound not found');
        }
    } catch (error) {
        console.error('Error in /play route:', error);
        res.status(500).send('Internal Server Error');
    }
});

module.exports = router;
