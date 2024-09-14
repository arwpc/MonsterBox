const express = require('express');
const router = express.Router();
const partService = require('../services/partService');
const characterService = require('../services/characterService');
const servoController = require('../controllers/servoController');

router.get('/:id/edit', async (req, res) => {
    try {
        const id = parseInt(req.params.id);
        if (isNaN(id)) {
            throw new Error('Invalid part ID');
        }
        const part = await partService.getPartById(id);
        const characters = await characterService.getAllCharacters();
        res.render('part-forms/servo', { title: 'Edit Servo', action: `/parts/servo/${part.id}`, part, characters });
    } catch (error) {
        console.error('Error fetching servo:', error);
        res.status(500).send('An error occurred while fetching the servo: ' + error.message);
    }
});

router.post('/', async (req, res) => {
    try {
        const newServo = {
            name: req.body.name,
            type: 'servo',
            characterId: parseInt(req.body.characterId),
            servoType: req.body.servoType,
            channel: parseInt(req.body.channel),
            minPulse: parseInt(req.body.minPulse),
            maxPulse: parseInt(req.body.maxPulse),
            defaultAngle: parseInt(req.body.defaultAngle)
        };
        const createdServo = await partService.createPart(newServo);
        console.log('Created servo:', createdServo);
        res.redirect('/parts');
    } catch (error) {
        console.error('Error creating servo:', error);
        res.status(500).send('An error occurred while creating the servo: ' + error.message);
    }
});

router.post('/:id', async (req, res) => {
    try {
        const id = parseInt(req.params.id);
        if (isNaN(id)) {
            throw new Error('Invalid part ID');
        }
        const updatedServo = {
            id: id,
            name: req.body.name,
            type: 'servo',
            characterId: parseInt(req.body.characterId),
            servoType: req.body.servoType,
            channel: parseInt(req.body.channel),
            minPulse: parseInt(req.body.minPulse),
            maxPulse: parseInt(req.body.maxPulse),
            defaultAngle: parseInt(req.body.defaultAngle)
        };
        const result = await partService.updatePart(id, updatedServo);
        console.log('Updated servo:', result);
        res.redirect('/parts');
    } catch (error) {
        console.error('Error updating servo:', error);
        res.status(500).send('An error occurred while updating the servo: ' + error.message);
    }
});

router.post('/test', servoController.testServo);
router.post('/stop', servoController.stopServo);

module.exports = router;