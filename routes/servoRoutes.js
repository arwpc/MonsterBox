const express = require('express');
const router = express.Router();
const partService = require('../services/partService');
const characterService = require('../services/characterService');
const servoController = require('../controllers/servoController');

router.get('/:id/edit', async (req, res) => {
    try {
        const id = parseInt(req.params.id, 10);
        console.log('Editing Servo with ID:', id, 'Type:', typeof id);
        let part = null;
        if (!isNaN(id)) {
            part = await partService.getPartById(id);
        }
        const characters = await characterService.getAllCharacters();
        res.render('part-forms/servo', { 
            title: part ? 'Edit Servo' : 'New Servo', 
            action: part ? `/parts/servo/${part.id}` : '/parts/servo', 
            part, 
            characters 
        });
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
            characterId: parseInt(req.body.characterId, 10),
            servoType: req.body.servoType,
            channel: parseInt(req.body.channel, 10),
            minPulse: parseInt(req.body.minPulse, 10),
            maxPulse: parseInt(req.body.maxPulse, 10),
            defaultAngle: parseInt(req.body.defaultAngle, 10)
        };
        const createdServo = await partService.createPart(newServo);
        console.log('Created servo:', createdServo);
        res.redirect('/parts');
    } catch (error) {
        console.error('Error creating servo:', error);
        res.status(500).send('An error occurred while creating the servo: ' + error.message);
    }
});

router.post('/test', servoController.testServo);

router.post('/stop', servoController.stopServo);

router.post('/:id', async (req, res) => {
    try {
        console.log('Update Servo Route - Request params:', req.params);
        console.log('Update Servo Route - Request body:', req.body);

        const id = parseInt(req.params.id, 10);
        console.log('Updating Servo with ID:', id, 'Type:', typeof id);
        if (isNaN(id)) {
            throw new Error('Invalid part ID');
        }
        const updatedServo = {
            id: id,
            name: req.body.name,
            type: 'servo',
            characterId: parseInt(req.body.characterId, 10),
            servoType: req.body.servoType,
            channel: parseInt(req.body.channel, 10),
            minPulse: parseInt(req.body.minPulse, 10),
            maxPulse: parseInt(req.body.maxPulse, 10),
            defaultAngle: parseInt(req.body.defaultAngle, 10)
        };
        console.log('Updated Servo data:', updatedServo);
        const result = await partService.updatePart(id, updatedServo);
        console.log('Updated servo:', result);
        res.redirect('/parts');
    } catch (error) {
        console.error('Error updating servo:', error);
        res.status(500).send('An error occurred while updating the servo: ' + error.message);
    }
});

module.exports = router;