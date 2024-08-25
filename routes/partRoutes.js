const express = require('express');
const router = express.Router();
const partService = require('../services/partService');
const characterService = require('../services/characterService');

router.get('/', async (req, res) => {
    try {
        const parts = await partService.getAllParts();
        const characters = await characterService.getAllCharacters();
        res.render('parts', { title: 'Parts', parts, characters });
    } catch (error) {
        console.error('Error fetching parts:', error);
        res.status(500).send('An error occurred while fetching parts');
    }
});

router.get('/new/:type', async (req, res) => {
    try {
        const { type } = req.params;
        const characters = await characterService.getAllCharacters();
        if (type === 'motor') {
            const settings = { dirPin: 18, pwmPin: 13 }; // Default values
            res.render('part-forms/motor-control', { title: 'Add Motor', action: '/parts', part: {}, characters, settings });
        } else {
            res.render(`part-forms/${type}`, { title: `Add ${type.charAt(0).toUpperCase() + type.slice(1)}`, action: '/parts', part: {}, characters });
        }
    } catch (error) {
        console.error('Error rendering new part form:', error);
        res.status(500).send('An error occurred while loading the new part form');
    }
});

router.get('/:id/edit', async (req, res) => {
    try {
        const part = await partService.getPartById(req.params.id);
        const characters = await characterService.getAllCharacters();
        if (part.type === 'motor') {
            const settings = { dirPin: part.directionPin, pwmPin: part.pwmPin };
            res.render('part-forms/motor-control', { title: 'Edit Motor', action: `/parts/${part.id}`, part, characters, settings });
        } else {
            res.render(`part-forms/${part.type}`, { title: `Edit ${part.type.charAt(0).toUpperCase() + part.type.slice(1)}`, action: `/parts/${part.id}`, part, characters });
        }
    } catch (error) {
        console.error('Error fetching part:', error);
        res.status(500).send('An error occurred while fetching the part');
    }
});

router.post('/', async (req, res) => {
    try {
        const newPart = {
            name: req.body.name,
            type: req.body.type,
            characterId: parseInt(req.body.characterId)
        };

        switch (req.body.type) {
            case 'motor':
                newPart.directionPin = parseInt(req.body.directionPin) || 18;
                newPart.pwmPin = parseInt(req.body.pwmPin) || 13;
                break;
            case 'light':
            case 'led':
                newPart.gpioPin = parseInt(req.body.gpioPin) || 26;
                break;
            case 'servo':
                newPart.gpioPin = parseInt(req.body.gpioPin);
                newPart.pwmFrequency = parseInt(req.body.pwmFrequency) || 50;
                newPart.dutyCycle = parseFloat(req.body.dutyCycle) || 7.5;
                break;
            case 'sensor':
                newPart.sensorType = req.body.sensorType;
                newPart.gpioPin = parseInt(req.body.gpioPin) || 16;
                newPart.active = req.body.active === 'on';
                break;
        }

        await partService.createPart(newPart);
        res.redirect('/parts');
    } catch (error) {
        console.error('Error creating part:', error);
        res.status(500).send('An error occurred while creating the part: ' + error.message);
    }
});

router.post('/:id', async (req, res) => {
    try {
        const id = parseInt(req.params.id);
        const updatedPart = {
            id: id,
            name: req.body.name,
            type: req.body.type,
            characterId: parseInt(req.body.characterId)
        };

        switch (req.body.type) {
            case 'motor':
                updatedPart.directionPin = parseInt(req.body.directionPin) || 18;
                updatedPart.pwmPin = parseInt(req.body.pwmPin) || 13;
                break;
            case 'light':
            case 'led':
                updatedPart.gpioPin = parseInt(req.body.gpioPin) || 26;
                break;
            case 'servo':
                updatedPart.gpioPin = parseInt(req.body.gpioPin);
                updatedPart.pwmFrequency = parseInt(req.body.pwmFrequency) || 50;
                updatedPart.dutyCycle = parseFloat(req.body.dutyCycle) || 7.5;
                break;
            case 'sensor':
                updatedPart.sensorType = req.body.sensorType;
                updatedPart.gpioPin = parseInt(req.body.gpioPin) || 16;
                updatedPart.active = req.body.active === 'on';
                break;
        }

        await partService.updatePart(id, updatedPart);
        res.redirect('/parts');
    } catch (error) {
        console.error('Error updating part:', error);
        res.status(500).send('An error occurred while updating the part: ' + error.message);
    }
});

router.post('/:id/delete', async (req, res) => {
    try {
        await partService.deletePart(req.params.id);
        res.sendStatus(200);
    } catch (error) {
        console.error('Error deleting part:', error);
        res.status(500).send('An error occurred while deleting the part');
    }
});

router.post('/test', async (req, res) => {
    try {
        const { part_id, type, ...testParams } = req.body;
        let result;

        switch (type) {
            case 'motor':
                result = await partService.testMotor(
                    part_id ? parseInt(part_id) : null,
                    testParams.direction,
                    parseInt(testParams.speed),
                    parseInt(testParams.duration),
                    parseInt(testParams.directionPin),
                    parseInt(testParams.pwmPin)
                );
                break;
            case 'light':
            case 'led':
                result = await partService.testLight(
                    part_id ? parseInt(part_id) : null,
                    parseInt(testParams.brightness)
                );
                break;
            case 'servo':
                result = await partService.testServo(
                    part_id ? parseInt(part_id) : null,
                    parseInt(testParams.angle),
                    parseInt(testParams.duration)
                );
                break;
            default:
                throw new Error('Invalid part type');
        }

        res.json({ success: true, message: 'Part tested successfully', result });
    } catch (error) {
        console.error('Error testing part:', error);
        res.status(500).json({ success: false, message: 'An error occurred while testing the part', error: error.message });
    }
});

module.exports = router;
