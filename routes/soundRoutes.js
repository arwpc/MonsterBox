// File: routes/soundRoutes.js

const express = require('express');
const path = require('path');
const { spawn } = require('child_process');
const soundService = require('../services/soundService');
const characterService = require('../services/characterService');
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

let soundPlayerProcess = null;

function startSoundPlayer() {
    if (!soundPlayerProcess) {
        const scriptPath = path.resolve(__dirname, '..', 'scripts', 'sound_player.py');
        soundPlayerProcess = spawn('python3', [scriptPath]);

        soundPlayerProcess.stdout.on('data', (data) => {
            console.log(`Sound player output: ${data}`);
        });

        soundPlayerProcess.stderr.on('data', (data) => {
            console.error(`Sound player error: ${data}`);
        });

        soundPlayerProcess.on('close', (code) => {
            console.log(`Sound player exited with code ${code}`);
            soundPlayerProcess = null;
        });
    }
}

router.get('/', async (req, res) => {
    try {
        const characters = await characterService.getAllCharacters();
        res.render('sounds', { title: 'Sounds', characters, selectedCharacterId: null, sounds: [] });
    } catch (error) {
        console.error('Error fetching characters:', error);
        res.status(500).json({ error: 'Internal Server Error', details: error.message });
    }
});

router.get('/character/:characterId', async (req, res) => {
    try {
        const characterId = parseInt(req.params.characterId);
        const characters = await characterService.getAllCharacters();
        const sounds = await soundService.getSoundsByCharacter(characterId);
        res.render('sounds', { title: 'Sounds', characters, selectedCharacterId: characterId, sounds });
    } catch (error) {
        console.error('Error fetching sounds:', error);
        res.status(500).json({ error: 'Internal Server Error', details: error.message });
    }
});

router.get('/new', async (req, res) => {
    try {
        const characters = await characterService.getAllCharacters();
        res.render('sound-form', { title: 'Add New Sound', action: '/sounds', sound: null, characters });
    } catch (error) {
        console.error('Error fetching characters:', error);
        res.status(500).json({ error: 'Internal Server Error', details: error.message });
    }
});

router.get('/:id/edit', async (req, res) => {
    try {
        const sound = await soundService.getSoundById(parseInt(req.params.id));
        const characters = await characterService.getAllCharacters();
        if (sound) {
            res.render('sound-form', { title: 'Edit Sound', action: `/sounds/${sound.id}`, sound, characters });
        } else {
            res.status(404).json({ error: 'Sound not found', details: `No sound with id ${req.params.id}` });
        }
    } catch (error) {
        console.error('Error fetching sound:', error);
        res.status(500).json({ error: 'Internal Server Error', details: error.message });
    }
});

router.post('/', upload.single('sound_file'), async (req, res) => {
    try {
        const newSound = {
            name: req.body.name,
            filename: req.file.filename,
            characterId: parseInt(req.body.characterId)
        };
        await soundService.createSound(newSound);
        res.redirect(`/sounds/character/${newSound.characterId}`);
    } catch (error) {
        console.error('Error adding sound:', error);
        res.status(500).json({ error: 'Internal Server Error', details: error.message });
    }
});

router.post('/:id', upload.single('sound_file'), async (req, res) => {
    try {
        const id = parseInt(req.params.id);
        const updatedSound = {
            name: req.body.name,
            characterId: parseInt(req.body.characterId)
        };
        
        if (req.file) {
            const sound = await soundService.getSoundById(id);
            if (sound.filename) {
                const oldFilePath = path.join(__dirname, '../public/sounds', sound.filename);
                await fs.unlink(oldFilePath).catch(console.error);
            }
            updatedSound.filename = req.file.filename;
        }

        await soundService.updateSound(id, updatedSound);
        res.redirect(`/sounds/character/${updatedSound.characterId}`);
    } catch (error) {
        console.error('Error updating sound:', error);
        res.status(500).json({ error: 'Internal Server Error', details: error.message });
    }
});

router.post('/:id/play', async (req, res) => {
    try {
        const soundId = parseInt(req.params.id);
        console.log('Attempting to play sound with ID:', soundId);

        const sound = await soundService.getSoundById(soundId);
        
        if (!sound) {
            console.error('Sound not found for ID:', soundId);
            return res.status(404).json({ error: 'Sound not found', details: `No sound with id ${soundId}`, soundId });
        }

        console.log('Found sound:', sound);

        const filePath = path.resolve(__dirname, '..', 'public', 'sounds', sound.filename);
        console.log('Absolute file path:', filePath);

        try {
            await fs.access(filePath, fs.constants.R_OK);
            console.log('File exists and is readable:', filePath);
        } catch (error) {
            console.error('File access error:', error);
            return res.status(404).json({ error: 'Sound file not accessible', details: error.message, filePath });
        }

        startSoundPlayer();

        if (!soundPlayerProcess) {
            return res.status(500).json({ error: 'Failed to start sound player' });
        }

        const command = `PLAY|${sound.id}|${filePath}\n`;
        soundPlayerProcess.stdin.write(command);

        res.status(200).json({ 
            message: 'Playing sound on character',
            sound: sound.name,
            file: sound.filename
        });

    } catch (error) {
        console.error('Error in /play route:', error);
        res.status(500).json({ error: 'Internal Server Error', details: error.message });
    }
});

router.post('/:id/delete', async (req, res) => {
    try {
        const id = parseInt(req.params.id);
        const sound = await soundService.getSoundById(id);
        if (sound.filename) {
            const filePath = path.join(__dirname, '../public/sounds', sound.filename);
            await fs.unlink(filePath).catch(console.error);
        }
        await soundService.deleteSound(id);
        res.status(200).json({ message: 'Sound deleted successfully' });
    } catch (error) {
        console.error('Error deleting sound:', error);
        res.status(500).json({ error: 'Internal Server Error', details: error.message });
    }
});

module.exports = router;
