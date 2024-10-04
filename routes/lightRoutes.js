const express = require('express');
const router = express.Router();
const partService = require('../services/partService');
const characterService = require('../services/characterService');
const { spawn } = require('child_process');
const path = require('path');

router.get('/new', async (req, res) => {
    try {
        const characters = await characterService.getAllCharacters();
        res.render('part-forms/light', { title: 'Add Light', action: '/parts/light', part: {}, characters });
    } catch (error) {
        console.error('Error fetching characters:', error);
        res.status(500).send('An error occurred while fetching characters: ' + error.message);
    }
});

router.get('/:id/edit', async (req, res) => {
    try {
        const id = parseInt(req.params.id, 10);
        console.log('Editing Light with ID:', id, 'Type:', typeof id);
        if (isNaN(id)) {
            throw new Error('Invalid part ID');
        }
        const part = await partService.getPartById(id);
        const characters = await characterService.getAllCharacters();
        res.render('part-forms/light', { title: 'Edit Light', action: `/parts/light/${part.id}`, part, characters });
    } catch (error) {
        console.error('Error fetching light:', error);
        res.status(500).send('An error occurred while fetching the light: ' + error.message);
    }
});

router.post('/', async (req, res) => {
    try {
        const newLight = {
            name: req.body.name,
            type: 'light',
            characterId: parseInt(req.body.characterId, 10),
            gpioPin: parseInt(req.body.gpioPin, 10) || 26
        };
        const createdLight = await partService.createPart(newLight);
        console.log('Created light:', createdLight);
        res.redirect('/parts');
    } catch (error) {
        console.error('Error creating light:', error);
        res.status(500).send('An error occurred while creating the light: ' + error.message);
    }
});

router.post('/test', async (req, res) => {
    console.log('Light Test Route Hit');
    try {
        console.log('Light Test Route - Request body:', req.body);
        const { part_id, gpioPin, state } = req.body;
        
        if (!gpioPin || !state) {
            throw new Error('Missing required parameters for light test');
        }

        const scriptPath = path.join(__dirname, '..', 'scripts', 'light_control.py');
        console.log('Light test script path:', scriptPath);
        console.log('Executing light test with parameters:', { gpioPin, state });

        const process = spawn('python3', [
            scriptPath,
            gpioPin.toString(),
            state
        ]);

        let stdout = '';
        let stderr = '';

        process.stdout.on('data', (data) => {
            stdout += data.toString();
            console.log(`Python script output: ${data}`);
        });

        process.stderr.on('data', (data) => {
            stderr += data.toString();
            console.error(`Python script error: ${data}`);
        });

        process.on('close', (code) => {
            console.log(`Python script exited with code ${code}`);
            if (code === 0) {
                res.json({ success: true, message: `Light turned ${state} successfully`, output: stdout });
            } else {
                res.status(500).json({ success: false, message: 'Light test failed', error: stderr });
            }
        });
    } catch (error) {
        console.error('Error testing light:', error);
        res.status(500).json({ success: false, message: 'An error occurred while testing the light', error: error.message });
    }
});

router.post('/:id', async (req, res) => {
    try {
        console.log('Update Light Route - Request params:', req.params);
        console.log('Update Light Route - Request body:', req.body);

        const id = parseInt(req.params.id, 10);
        console.log('Updating Light with ID:', id, 'Type:', typeof id);
        if (isNaN(id)) {
            throw new Error('Invalid part ID');
        }
        const updatedLight = {
            id: id,
            name: req.body.name,
            type: 'light',
            characterId: parseInt(req.body.characterId, 10),
            gpioPin: parseInt(req.body.gpioPin, 10) || 26
        };
        console.log('Updated Light data:', updatedLight);
        const result = await partService.updatePart(id, updatedLight);
        console.log('Updated light:', result);
        res.redirect('/parts');
    } catch (error) {
        console.error('Error updating light:', error);
        res.status(500).send('An error occurred while updating the light: ' + error.message);
    }
});

module.exports = router;