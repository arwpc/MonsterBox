const express = require('express');
const path = require('path');
const { exec } = require('child_process');
const fs = require('fs').promises;
const dataManager = require('../dataManager');
const router = express.Router();

// Multer setup for file uploads
const multer = require('multer');
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
    res.render('sound-form', { title: 'Add New Sound', action: '/sounds', sound: {} });
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
            let command;

            if (sound.filename.endsWith('.wav')) {
                command = `aplay "${filePath}"`;
            } else if (sound.filename.endsWith('.mp3')) {
                command = `mpg123 "${filePath}"`;
            } else {
                return res.status(400).send('Unsupported audio format');
            }

            exec(command, (error, stdout, stderr) => {
                if (error) {
                    console.error(`Error playing sound: ${stderr}`);
                    return res.status(500).send('Error playing sound');
                }
                console.log(`Playing sound: ${sound.filename}`);
                res.status(200).send('Playing sound on character');
            });
        } else {
            res.status(404).send('Sound not found');
        }
    } catch (error) {
        console.error('Error playing sound on character:', error);
        res.status(500).send('Internal Server Error');
    }
});

router.post('/stop', (req, res) => {
    try {
        exec('pkill -f mpg123', () => {});
        exec('pkill -f aplay', () => {});

        console.log('Stopping all sounds on character');
        res.status(200).send('Stopped all sounds');
    } catch (error) {
        console.error('Error stopping sounds on character:', error);
        res.status(500).send('Internal Server Error');
    }
});

router.post('/:id/delete', async (req, res) => {
    console.log('DELETE /sounds/:id route hit. ID:', req.params.id);
    try {
        const soundId = parseInt(req.params.id);
        const sounds = await dataManager.getSounds();
        const index = sounds.findIndex(s => s.id === soundId);
        if (index !== -1) {
            const [deletedSound] = sounds.splice(index, 1);
            await dataManager.saveSounds(sounds);
            
            // Attempt to delete the file, but don't fail if it doesn't exist
            try {
                await fs.unlink(path.join('public/sounds', deletedSound.filename));
            } catch (error) {
                console.error('Error deleting sound file:', error);
                // Continue even if file deletion fails
            }
            
            res.sendStatus(200);
        } else {
            res.status(404).send('Sound not found');
        }
    } catch (error) {
        console.error('Error deleting sound:', error);
        res.status(500).send('Internal Server Error');
    }
});

module.exports = router;
