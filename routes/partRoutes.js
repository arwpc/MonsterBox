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

router.get('/new', async (req, res) => {
    try {
        const characters = await characterService.getAllCharacters();
        res.render('part-form', { title: 'Add New Part', action: '/parts', part: {}, characters });
    } catch (error) {
        console.error('Error rendering new part form:', error);
        res.status(500).send('An error occurred while loading the new part form');
    }
});

router.get('/:id/edit', async (req, res) => {
    try {
        const part = await partService.getPartById(req.params.id);
        const characters = await characterService.getAllCharacters();
        res.render('part-form', { title: 'Edit Part', action: `/parts/${part.id}`, part, characters });
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
                newPart.directionPin = req.body.directionPin ? parseInt(req.body.directionPin) : null;
                newPart.pwmPin = req.body.pwmPin ? parseInt(req.body.pwmPin) : null;
                break;
            case 'sensor':
                newPart.sensorType = req.body.sensorType;
                newPart.gpioPin = req.body.gpioPin ? parseInt(req.body.gpioPin) : null;
                break;
            case 'led':
            case 'light':
                newPart.gpioPin = req.body.gpioPin ? parseInt(req.body.gpioPin) : null;
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
        if (isNaN(id)) {
            throw new Error('Invalid part ID');
        }

        const updatedPart = {
            id: id,
            name: req.body.name,
            type: req.body.type,
            characterId: parseInt(req.body.characterId)
        };

        switch (req.body.type) {
            case 'motor':
                updatedPart.directionPin = req.body.directionPin ? parseInt(req.body.directionPin) : null;
                updatedPart.pwmPin = req.body.pwmPin ? parseInt(req.body.pwmPin) : null;
                break;
            case 'sensor':
                updatedPart.sensorType = req.body.sensorType;
                updatedPart.gpioPin = req.body.gpioPin ? parseInt(req.body.gpioPin) : null;
                break;
            case 'led':
            case 'light':
                updatedPart.gpioPin = req.body.gpioPin ? parseInt(req.body.gpioPin) : null;
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
                    parseInt(part_id),
                    testParams.direction,
                    parseInt(testParams.speed),
                    parseInt(testParams.duration)
                );
                break;
            case 'light':
            case 'led':
                result = await partService.testLight(
                    parseInt(part_id),
                    testParams.state,
                    parseInt(testParams.duration)
                );
                break;
            case 'sensor':
                result = await partService.testSensor(
                    parseInt(part_id),
                    parseInt(testParams.timeout)
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
