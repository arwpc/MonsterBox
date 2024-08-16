const express = require('express');
const router = express.Router();
const dataManager = require('../dataManager');
const { upload } = require('../app');
const fs = require('fs').promises;
const path = require('path');
const { spawn } = require('child_process');

let currentlyPlayingProcess = null;

router.get('/', async (req, res) => {
    const sounds = await dataManager.getSounds();
    res.render('sounds', { title: 'Sounds', sounds, playOnServer: true });
});

router.get('/new', (req, res) => {
    res.render('sound-form', { title: 'Add New Sound', action: '/sounds', sound: {} });
});

router.get('/:id/edit', async (req, res) => {
    const sounds = await dataManager.getSounds();
    const sound = sounds.find(s => s.id === parseInt(req.params.id));
    if (sound) {
        res.render('sound-form', { title: 'Edit Sound', action: '/sounds/' + sound.id, sound });
    } else {
        res.status(404).send('Sound not found');
    }
});

router.post('/', upload.single('sound_file'), async (req, res) => {
    const sounds = await dataManager.getSounds();
    const newSound = {
        id: dataManager.getNextId(sounds),
        name: req.body.name,
        filename: req.file.filename
    };
    sounds.push(newSound);
    await dataManager.saveSounds(sounds);
    res.redirect('/sounds');
});

router.post('/:id', upload.single('sound_file'), async (req, res) => {
    const id = parseInt(req.params.id);
    const sounds = await dataManager.getSounds();
    const index = sounds.findIndex(s => s.id === id);
    if (index !== -1) {
        const oldFilename = sounds[index].filename;
        sounds[index] = {
            id: id,
            name: req.body.name,
            filename: req.file ? req.file.filename : oldFilename
        };
        if (req.file) {
            try {
                await fs.unlink(path.join('public', 'sounds', oldFilename));
            } catch (error) {
                console.error('Error deleting old sound file:', error);
            }
        }
        await dataManager.saveSounds(sounds);
        res.redirect('/sounds');
    } else {
        res.status(404).send('Sound not found');
    }
});

router.post('/:id/delete', async (req, res) => {
    const id = parseInt(req.params.id);
    const sounds = await dataManager.getSounds();
    const index = sounds.findIndex(s => s.id === id);
    if (index !== -1) {
        const sound = sounds[index];
        try {
            await fs.unlink(path.join('public', 'sounds', sound.filename));
        } catch (error) {
            console.error('Error deleting sound file:', error);
        }
        sounds.splice(index, 1);
        await dataManager.saveSounds(sounds);
        res.sendStatus(200);
    } else {
        res.status(404).send('Sound not found');
    }
});

router.get('/play/:id', async (req, res) => {
    const sounds = await dataManager.getSounds();
    const sound = sounds.find(s => s.id === parseInt(req.params.id));
    if (sound) {
        const soundPath = path.join(__dirname, '..', 'public', 'sounds', sound.filename);
        const fileExtension = path.extname(soundPath).toLowerCase();
        let command, args;

        if (fileExtension === '.wav') {
            command = 'aplay';
            args = [soundPath];
        } else if (fileExtension === '.mp3') {
            command = 'mpg123';
            args = [soundPath];
        } else {
            return res.status(400).send('Unsupported file format');
        }

        // Stop any currently playing sound
        if (currentlyPlayingProcess) {
            currentlyPlayingProcess.kill();
        }

        currentlyPlayingProcess = spawn(command, args);

        currentlyPlayingProcess.on('error', (error) => {
            console.error(`Error playing sound: ${error.message}`);
            res.status(500).send('Error playing sound');
        });

        currentlyPlayingProcess.on('exit', (code, signal) => {
            if (code !== 0 && signal !== 'SIGTERM') {
                console.error(`Sound process exited with code ${code} and signal ${signal}`);
            }
            currentlyPlayingProcess = null;
        });

        res.send('Sound playing started');
    } else {
        res.status(404).send('Sound not found');
    }
});

router.get('/stop', (req, res) => {
    if (currentlyPlayingProcess) {
        currentlyPlayingProcess.kill();
        currentlyPlayingProcess = null;
        res.send('Sound stopped');
    } else {
        res.send('No sound playing');
    }
});

module.exports = router;
