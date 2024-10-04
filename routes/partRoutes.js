// File: routes/partRoutes.js

const express = require('express');
const router = express.Router();
const partService = require('../services/partService');
const characterService = require('../services/characterService');
const { spawn } = require('child_process');
const path = require('path');
const logger = require('../scripts/logger');

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

const checkCharacterSelected = (req, res, next) => {
    if (!req.query.characterId) {
        return res.redirect('/');
    }
    req.characterId = req.query.characterId;
    next();
};

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
        logger.error('Error fetching parts:', error);
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
        logger.error('Error rendering new part form:', error);
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
        logger.error('Error fetching part for edit:', error);
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
        logger.error('Error creating part:', error);
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
        logger.error('Error updating part:', error);
        res.status(500).send('An error occurred while updating the part');
    }
});

router.post('/:id/delete', async (req, res) => {
    try {
        const id = parseInt(req.params.id);
        await partService.deletePart(id);
        res.status(200).json({ message: 'Part deleted successfully' });
    } catch (error) {
        logger.error('Error deleting part:', error);
        res.status(500).json({ error: 'An error occurred while deleting the part' });
    }
});

router.get('/sensor/test', (req, res) => {
    const { gpioPin, timeout } = req.query;

    if (!gpioPin) {
        return res.status(400).json({ error: 'GPIO pin is required' });
    }

    res.writeHead(200, {
        'Content-Type': 'text/event-stream',
        'Cache-Control': 'no-cache',
        'Connection': 'keep-alive'
    });

    const scriptPath = path.join(__dirname, '..', 'scripts', 'sensor_control.py');
    const args = [gpioPin, timeout || '30'];

    logger.info(`Executing sensor test script: ${scriptPath} with args: ${args.join(', ')}`);

    const process = spawn('python3', [scriptPath, ...args]);

    process.stdout.on('data', (data) => {
        const output = data.toString().trim();
        logger.debug(`Sensor script output: ${output}`);
        res.write(`data: ${JSON.stringify({ status: output })}\n\n`);
    });

    process.stderr.on('data', (data) => {
        const error = data.toString().trim();
        logger.error(`Sensor script error: ${error}`);
        res.write(`data: ${JSON.stringify({ error: error })}\n\n`);
    });

    process.on('close', (code) => {
        logger.info(`Sensor script exited with code ${code}`);
        res.write(`data: ${JSON.stringify({ done: true })}\n\n`);
        res.end();
    });

    req.on('close', () => {
        process.kill();
    });
});

module.exports = router;