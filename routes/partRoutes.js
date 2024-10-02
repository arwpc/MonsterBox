// File: routes/partRoutes.js

const express = require('express');
const router = express.Router();
const partService = require('../services/partService');
const characterService = require('../services/characterService');
const { spawn } = require('child_process');
const path = require('path');

router.get('/', async (req, res) => {
    try {
        const characters = await characterService.getAllCharacters();
        res.render('parts', { title: 'Parts', characters });
    } catch (error) {
        console.error('Error fetching characters:', error);
        res.status(500).send('An error occurred while fetching characters');
    }
});

router.get('/by-character/:characterId', async (req, res) => {
    try {
        const characterId = parseInt(req.params.characterId);
        const parts = await partService.getPartsByCharacter(characterId);
        res.json(parts);
    } catch (error) {
        console.error('Error fetching parts by character:', error);
        res.status(500).json({ error: 'An error occurred while fetching parts' });
    }
});

router.get('/new/:type', async (req, res) => {
    try {
        const { type } = req.params;
        const characters = await characterService.getAllCharacters();
        res.render('part-form', { 
            title: `Add ${type.charAt(0).toUpperCase() + type.slice(1)}`, 
            action: `/parts/${type}`, 
            part: { type }, 
            characters 
        });
    } catch (error) {
        console.error('Error rendering new part form:', error);
        res.status(500).send('An error occurred while loading the new part form');
    }
});

router.get('/:id/edit', async (req, res) => {
    try {
        const id = parseInt(req.params.id);
        const part = await partService.getPartById(id);
        const characters = await characterService.getAllCharacters();
        res.render('part-form', {
            title: `Edit ${part.type.charAt(0).toUpperCase() + part.type.slice(1)}`,
            action: `/parts/${part.id}/update`,
            part,
            characters
        });
    } catch (error) {
        console.error('Error fetching part for edit:', error);
        res.status(500).send('An error occurred while fetching the part');
    }
});

router.post('/:type', async (req, res) => {
    try {
        const { type } = req.params;
        const partData = req.body;
        partData.type = type;
        await partService.createPart(partData);
        res.redirect('/parts');
    } catch (error) {
        console.error('Error creating part:', error);
        res.status(500).send('An error occurred while creating the part');
    }
});

router.post('/:id/update', async (req, res) => {
    try {
        const id = parseInt(req.params.id);
        const partData = req.body;
        await partService.updatePart(id, partData);
        res.redirect('/parts');
    } catch (error) {
        console.error('Error updating part:', error);
        res.status(500).send('An error occurred while updating the part');
    }
});

router.get('/all', async (req, res) => {
    try {
        const parts = await partService.getAllParts();
        res.json(parts);
    } catch (error) {
        console.error('Error fetching all parts:', error);
        res.status(500).json({ error: 'An error occurred while fetching parts' });
    }
});

router.post('/:id/delete', async (req, res) => {
    try {
        const id = parseInt(req.params.id);
        await partService.deletePart(id);
        res.status(200).json({ message: 'Part deleted successfully' });
    } catch (error) {
        console.error('Error deleting part:', error);
        res.status(500).json({ error: 'An error occurred while deleting the part' });
    }
});

router.post('/test', async (req, res) => {
    try {
        const { type, characterId, ...testData } = req.body;
        let scriptPath;
        
        switch (type) {
            case 'motor':
            case 'linear-actuator':
                scriptPath = path.join(__dirname, '..', 'scripts', 'motor_control.py');
                break;
            case 'light':
            case 'led':
                scriptPath = path.join(__dirname, '..', 'scripts', 'led_control.py');
                break;
            case 'servo':
                scriptPath = path.join(__dirname, '..', 'scripts', 'servo_control.py');
                break;
            case 'sensor':
                scriptPath = path.join(__dirname, '..', 'scripts', 'sensor_control.py');
                break;
            default:
                throw new Error('Invalid part type');
        }

        const process = spawn('python3', [scriptPath, ...Object.values(testData).map(String)]);

        let stdout = '';
        let stderr = '';

        process.stdout.on('data', (data) => {
            stdout += data.toString();
        });

        process.stderr.on('data', (data) => {
            stderr += data.toString();
        });

        process.on('close', (code) => {
            if (code === 0) {
                res.json({ success: true, message: 'Test completed successfully', output: stdout });
            } else {
                res.status(500).json({ success: false, message: 'Test failed', error: stderr });
            }
        });
    } catch (error) {
        console.error('Error testing part:', error);
        res.status(500).json({ success: false, message: 'An error occurred while testing the part', error: error.message });
    }
});

module.exports = router;