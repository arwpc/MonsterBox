const express = require('express');
const path = require('path');
const { exec } = require('child_process');
const dataManager = require('../dataManager');
const multer = require('multer');
const fs = require('fs').promises;
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
    res.render('sound-form', { title: 'Add New Sound', action: '/sounds', sound: null });
});

router.get('/:id/edit', async (req, res) => {
    try {
        const sounds = await dataManager.getSounds();
        const sound = sounds.find(s => s.id === parseInt(req.params.id));
        if (sound) {
            res.render('sound-form', { title: 'Edit Sound', action: `/sounds/${sound.id}`, sound });
        } else {
            res.status(404).send('Sound not found');
        }
    } catch (error) {
        console.error('Error fetching sound:', error);
        res.status(500).send('Internal Server Error');
    }
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

router.post('/:id', upload.single('sound_file'), async (req, res) => {
    try {
        const sounds = await dataManager.getSounds();
        const soundIndex = sounds.findIndex(s => s.id === parseInt(req.params.id));
        
        if (soundIndex === -1) {
            return res.status(404).send('Sound not found');
        }

        const updatedSound = sounds[soundIndex];
        updatedSound.name = req.body.name;

        if (req.file) {
            // Delete old file if it exists
            if (updatedSound.filename) {
                const oldFilePath = path.join(__dirname, '../public/sounds', updatedSound.filename);
                await fs.unlink(oldFilePath).catch(console.error);
            }
            updatedSound.filename = req.file.filename;
        }

        await dataManager.saveSounds(sounds);
        res.redirect('/sounds');
    } catch (error) {
        console.error('Error updating sound:', error);
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

router.post('/:id/delete', async (req, res) => {
    try {
        const id = parseInt(req.params.id);
        const sounds = await dataManager.getSounds();
        const soundIndex = sounds.findIndex(s => s.id === id);
        
        if (soundIndex === -1) {
            return res.status(404).send('Sound not found');
        }

        const soundToDelete = sounds[soundIndex];
        const filePath = path.join(__dirname, '../public/sounds', soundToDelete.filename);

        // Delete the file
        try {
            await fs.unlink(filePath);
        } catch (error) {
            console.error('Error deleting sound file:', error);
            // If file doesn't exist, continue with deleting from the data
            if (error.code !== 'ENOENT') {
                return res.status(500).send('Error deleting sound file');
            }
        }

        // Remove the sound from the data array
        sounds.splice(soundIndex, 1);
        await dataManager.saveSounds(sounds);

        res.sendStatus(200);
    } catch (error) {
        console.error('Error deleting sound:', error);
        res.status(500).send('Internal Server Error');
    }
});

router.post('/stop', (req, res) => {
    exec('sudo killall -9 python3', (error, stdout, stderr) => {
        if (error) {
            console.error(`Error stopping sounds: ${error.message}`);
            return res.status(500).send('Error stopping sounds');
        }
        if (stderr) {
            console.error(`Error from killall: ${stderr}`);
            return res.status(500).send('Error stopping sounds');
        }
        res.status(200).send('All sounds stopped');
    });
});

module.exports = router;
