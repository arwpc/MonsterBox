const express = require('express');
const router = express.Router();
const partService = require('../services/partService');

router.get('/', async (req, res) => {
    try {
        const parts = await partService.getAllParts();
        const characters = await partService.getAllCharacters();
        res.render('parts', { title: 'Parts', parts, characters });
    } catch (error) {
        console.error('Error fetching parts:', error);
        res.status(500).send('An error occurred while fetching parts');
    }
});

router.get('/new', async (req, res) => {
    try {
        const characters = await partService.getAllCharacters();
        res.render('part-form', { title: 'Add New Part', action: '/parts', part: {}, characters });
    } catch (error) {
        console.error('Error rendering new part form:', error);
        res.status(500).send('An error occurred while loading the new part form');
    }
});

router.get('/:id/edit', async (req, res) => {
    try {
        const part = await partService.getPartById(req.params.id);
        const characters = await partService.getAllCharacters();
        if (part) {
            res.render('part-form', { title: 'Edit Part', action: `/parts/${part.id}`, part, characters });
        } else {
            res.status(404).send('Part not found');
        }
    } catch (error) {
        console.error('Error fetching part:', error);
        res.status(500).send('An error occurred while fetching the part');
    }
});

router.post('/', async (req, res) => {
    try {
        const newPart = await partService.createPart(req.body);
        res.redirect('/parts');
    } catch (error) {
        console.error('Error creating part:', error);
        res.status(500).send('An error occurred while creating the part');
    }
});

router.post('/:id', async (req, res) => {
    try {
        const updatedPart = await partService.updatePart(req.params.id, req.body);
        res.redirect('/parts');
    } catch (error) {
        if (error.message === 'Part not found') {
            res.status(404).send('Part not found');
        } else {
            console.error('Error updating part:', error);
            res.status(500).send('An error occurred while updating the part');
        }
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
                result = await partService.testMotor(part_id, testParams.direction, testParams.speed, testParams.duration);
                break;
            case 'light':
                result = await partService.testLight(part_id, testParams.state, testParams.duration);
                break;
            case 'led':
                result = await partService.testLED(part_id, testParams.brightness, testParams.duration);
                break;
            case 'servo':
                result = await partService.testServo(part_id, testParams.angle, testParams.speed, testParams.duration);
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
