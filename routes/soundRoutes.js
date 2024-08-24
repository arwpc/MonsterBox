const express = require('express');
const path = require('path');
const { spawn } = require('child_process');
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
        res.status(500).json({ error: 'Internal Server Error', details: error.message });
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
            res.status(404).json({ error: 'Sound not found', details: `No sound with id ${req.params.id}` });
        }
    } catch (error) {
        console.error('Error fetching sound:', error);
        res.status(500).json({ error: 'Internal Server Error', details: error.message });
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
        res.status(500).json({ error: 'Internal Server Error', details: error.message });
    }
});

router.post('/:id', upload.single('sound_file'), async (req, res) => {
    try {
        const sounds = await dataManager.getSounds();
        const soundIndex = sounds.findIndex(s => s.id === parseInt(req.params.id));
        
        if (soundIndex === -1) {
            return res.status(404).json({ error: 'Sound not found', details: `No sound with id ${req.params.id}` });
        }

        const updatedSound = sounds[soundIndex];
        updatedSound.name = req.body.name;

        if (req.file) {
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
        res.status(500).json({ error: 'Internal Server Error', details: error.message });
    }
});

router.post('/:id/play', async (req, res) => {
    try {
        const soundId = parseInt(req.params.id);
        console.log('Received request to play sound with ID:', soundId);

        const sounds = await dataManager.getSounds();
        const sound = sounds.find(s => s.id === soundId);
        
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

        const pythonScriptPath = path.resolve(__dirname, '..', 'scripts', 'play_sound.py');
        console.log('Python script path:', pythonScriptPath);

        const command = `python3 "${pythonScriptPath}" "${filePath}"`;
        console.log('Executing command:', command);

        const childProcess = spawn(command, { shell: true });

        let pythonOutput = '';
        let pythonError = '';

        childProcess.stdout.on('data', (data) => {
            pythonOutput += data.toString();
            console.log(`Python script output: ${data}`);
        });

        childProcess.stderr.on('data', (data) => {
            pythonError += data.toString();
            console.error(`Python script error: ${data}`);
        });

        childProcess.on('close', (code) => {
            console.log(`Python script exited with code ${code}`);
            if (code !== 0) {
                return res.status(500).json({ 
                    error: 'Error playing sound', 
                    details: `Python script exited with code ${code}`,
                    output: pythonOutput,
                    errorOutput: pythonError,
                    command: command
                });
            }
            res.status(200).json({ 
                message: 'Playing sound on character',
                pythonOutput,
                command: command
            });
        });

    } catch (error) {
        console.error('Error in /play route:', error);
        res.status(500).json({ error: 'Internal Server Error', details: error.message });
    }
});

router.post('/:id/delete', async (req, res) => {
    try {
        const id = parseInt(req.params.id);
        const sounds = await dataManager.getSounds();
        const soundIndex = sounds.findIndex(s => s.id === id);
        
        if (soundIndex === -1) {
            return res.status(404).json({ error: 'Sound not found', details: `No sound with id ${id}` });
        }

        const soundToDelete = sounds[soundIndex];
        const filePath = path.join(__dirname, '../public/sounds', soundToDelete.filename);

        try {
            await fs.unlink(filePath);
        } catch (error) {
            console.error('Error deleting sound file:', error);
            if (error.code !== 'ENOENT') {
                return res.status(500).json({ error: 'Error deleting sound file', details: error.message });
            }
        }

        sounds.splice(soundIndex, 1);
        await dataManager.saveSounds(sounds);

        res.status(200).json({ message: 'Sound deleted successfully' });
    } catch (error) {
        console.error('Error deleting sound:', error);
        res.status(500).json({ error: 'Internal Server Error', details: error.message });
    }
});

module.exports = router;
