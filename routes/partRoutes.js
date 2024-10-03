// File: routes/partRoutes.js

const express = require('express');
const router = express.Router();
const partService = require('../services/partService');
const characterService = require('../services/characterService');
const { spawn } = require('child_process');
const path = require('path');

function getPartDetails(part) {
    switch(part.type) {
        case 'motor':
        case 'linear-actuator':
            return `Dir Pin: ${part.directionPin}, PWM Pin: ${part.pwmPin}`;
        case 'light':
        case 'led':
            return `GPIO Pin: ${part.gpioPin}`;
        case 'servo':
            return `GPIO Pin: ${part.gpioPin}, Frequency: ${part.pwmFrequency}Hz, Duty Cycle: ${part.dutyCycle}%`;
        case 'sensor':
            return `Type: ${part.sensorType}, GPIO Pin: ${part.gpioPin}, Active: ${part.active ? 'Yes' : 'No'}`;
        default:
            return '';
    }
}

// Middleware to check if a character is selected
const checkCharacterSelected = (req, res, next) => {
    if (!req.query.characterId) {
        return res.redirect('/');  // Redirect to main page if no character is selected
    }
    req.characterId = req.query.characterId;
    next();
};

// Apply the middleware to all routes
router.use(checkCharacterSelected);

router.get('/', async (req, res) => {
    try {
        const parts = await partService.getPartsByCharacter(req.characterId);
        const character = await characterService.getCharacterById(req.characterId);
        const partsWithDetails = parts.map(part => ({
            ...part,
            details: getPartDetails(part)
        }));
        res.render('parts', { title: 'Parts', parts: partsWithDetails, character });
    } catch (error) {
        console.error('Error fetching parts:', error);
        res.status(500).send('An error occurred while fetching parts');
    }
});

router.get('/new/:type', async (req, res) => {
    try {
        const { type } = req.params;
        const character = await characterService.getCharacterById(req.characterId);
        res.render('part-form', { 
            title: `Add ${type.charAt(0).toUpperCase() + type.slice(1)}`, 
            action: `/parts/${type}`, 
            part: { type }, 
            character 
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
        const character = await characterService.getCharacterById(req.characterId);
        res.render('part-form', {
            title: `Edit ${part.type.charAt(0).toUpperCase() + part.type.slice(1)}`,
            action: `/parts/${part.id}/update`,
            part,
            character
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
        partData.characterId = req.characterId;
        await partService.createPart(partData);
        res.redirect(`/parts?characterId=${req.characterId}`);
    } catch (error) {
        console.error('Error creating part:', error);
        res.status(500).send('An error occurred while creating the part');
    }
});

router.post('/:id/update', async (req, res) => {
    try {
        const id = parseInt(req.params.id);
        const partData = req.body;
        partData.characterId = req.characterId;
        await partService.updatePart(id, partData);
        res.redirect(`/parts?characterId=${req.characterId}`);
    } catch (error) {
        console.error('Error updating part:', error);
        res.status(500).send('An error occurred while updating the part');
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
        const { type, ...testData } = req.body;
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