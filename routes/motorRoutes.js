const express = require('express');
const router = express.Router();
const partService = require('../services/partService');
const characterService = require('../services/characterService');

router.get('/:id/edit', async (req, res) => {
    try {
        const id = parseInt(req.params.id);
        if (isNaN(id)) {
            throw new Error('Invalid part ID');
        }
        const part = await partService.getPartById(id);
        const characters = await characterService.getAllCharacters();
        const settings = { dirPin: part.directionPin, pwmPin: part.pwmPin };
        res.render('part-forms/motor', { title: 'Edit Motor', action: `/parts/motor/${part.id}`, part, characters, settings });
    } catch (error) {
        console.error('Error fetching motor:', error);
        res.status(500).send('An error occurred while fetching the motor: ' + error.message);
    }
});

router.post('/', async (req, res) => {
    try {
        const newMotor = {
            name: req.body.name,
            type: 'motor',
            characterId: parseInt(req.body.characterId),
            directionPin: parseInt(req.body.directionPin) || 18,
            pwmPin: parseInt(req.body.pwmPin) || 13
        };
        const createdMotor = await partService.createPart(newMotor);
        console.log('Created motor:', createdMotor);
        res.redirect('/parts');
    } catch (error) {
        console.error('Error creating motor:', error);
        res.status(500).send('An error occurred while creating the motor: ' + error.message);
    }
});

router.post('/:id', async (req, res) => {
    try {
        const id = parseInt(req.params.id);
        if (isNaN(id)) {
            throw new Error('Invalid part ID');
        }
        const updatedMotor = {
            id: id,
            name: req.body.name,
            type: 'motor',
            characterId: parseInt(req.body.characterId),
            directionPin: parseInt(req.body.directionPin) || 18,
            pwmPin: parseInt(req.body.pwmPin) || 13
        };
        const result = await partService.updatePart(id, updatedMotor);
        console.log('Updated motor:', result);
        res.redirect('/parts');
    } catch (error) {
        console.error('Error updating motor:', error);
        res.status(500).send('An error occurred while updating the motor: ' + error.message);
    }
});

router.post('/test', async (req, res) => {
    try {
        const { direction, speed, duration, directionPin, pwmPin } = req.body;
        const result = await partService.testMotor({
            direction,
            speed: parseInt(speed),
            duration: parseInt(duration),
            directionPin: parseInt(directionPin),
            pwmPin: parseInt(pwmPin)
        });
        res.json({ success: true, message: 'Motor tested successfully', result });
    } catch (error) {
        console.error('Error testing motor:', error);
        res.status(500).json({ success: false, message: 'An error occurred while testing the motor', error: error.message });
    }
});

module.exports = router;
