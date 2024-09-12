const express = require('express');
const path = require('path');
const { spawn } = require('child_process');
const soundService = require('../services/soundService');
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
        const sounds = await soundService.getAllSounds();
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
        const sound = await soundService.getSoundById(parseInt(req.params.id));
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
        const newSound = {
            name: req.body.name,
            filename: req.file.filename
        };
        await soundService.createSound(newSound);
        res.redirect('/sounds');
    } catch (error) {
        console.error('Error adding sound:', error);
        res.status(500).json({ error: 'Internal Server Error', details: error.message });
    }
});

router.post('/:id', upload.single('sound_file'), async (req, res) => {
    try {
        const id = parseInt(req.params.id);
        const updatedSound = {
            name: req.body.name
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