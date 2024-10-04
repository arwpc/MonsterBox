const express = require('express');
const router = express.Router();
const partService = require('../services/partService');
const characterService = require('../services/characterService');
const servoController = require('../controllers/servoController');

router.get('/new', async (req, res) => {
    try {
        const characters = await characterService.getAllCharacters();
        const servoTypes = servoController.getServoTypes();
        res.render('part-forms/servo', { 
            title: 'New Servo', 
            action: '/parts/servo', 
            part: null, 
            characters,
            servoTypes,
            getServoDefaults: servoController.getServoDefaults
        });
    } catch (error) {
        console.error('Error preparing new servo form:', error);
        res.status(500).send('An error occurred while preparing the new servo form: ' + error.message);
    }
});

router.get('/:id/edit', async (req, res) => {
    try {
        const id = parseInt(req.params.id, 10);
        console.log('Editing Servo with ID:', id, 'Type:', typeof id);
        if (isNaN(id)) {
            throw new Error('Invalid part ID');
        }
        const part = await partService.getPartById(id);
        if (!part) {
            throw new Error('Part not found');
        }
        const characters = await characterService.getAllCharacters();
        const servoTypes = servoController.getServoTypes();
        res.render('part-forms/servo', { 
            title: 'Edit Servo', 
            action: `/parts/servo/${part.id}`, 
            part, 
            characters,
            servoTypes,
            getServoDefaults: servoController.getServoDefaults
        });
    } catch (error) {
        console.error('Error fetching servo:', error);
        res.status(500).send('An error occurred while fetching the servo: ' + error.message);
    }
});

router.post('/', async (req, res) => {
    try {
        const servoDefaults = servoController.getServoDefaults(req.body.servoType);
        const newServo = {
            name: req.body.name,
            type: 'servo',
            characterId: parseInt(req.body.characterId, 10),
            servoType: req.body.servoType,
            usePCA9685: req.body.usePCA9685 === 'on',
            channel: req.body.usePCA9685 === 'on' ? parseInt(req.body.channel, 10) : null,
            pin: req.body.usePCA9685 !== 'on' ? parseInt(req.body.pin, 10) : null,
            minPulse: parseInt(req.body.minPulse) || servoDefaults.minPulse,
            maxPulse: parseInt(req.body.maxPulse) || servoDefaults.maxPulse,
            defaultAngle: parseInt(req.body.defaultAngle) || servoDefaults.defaultAngle
        };
        const createdServo = await partService.createPart(newServo);
        console.log('Created servo:', createdServo);
        res.json({ success: true, message: 'Servo created successfully', part: createdServo });
    } catch (error) {
        console.error('Error creating servo:', error);
        res.status(500).json({ success: false, message: 'An error occurred while creating the servo: ' + error.message });
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
        const servoDefaults = servoController.getServoDefaults(req.body.servoType);
        const updatedServo = {
            id: id,
            name: req.body.name,
            type: 'servo',
            characterId: parseInt(req.body.characterId, 10),
            servoType: req.body.servoType,
            usePCA9685: req.body.usePCA9685 === 'on',
            channel: req.body.usePCA9685 === 'on' ? parseInt(req.body.channel, 10) : null,
            pin: req.body.usePCA9685 !== 'on' ? parseInt(req.body.pin, 10) : null,
            minPulse: parseInt(req.body.minPulse) || servoDefaults.minPulse,
            maxPulse: parseInt(req.body.maxPulse) || servoDefaults.maxPulse,
            defaultAngle: parseInt(req.body.defaultAngle) || servoDefaults.defaultAngle
        };
        console.log('Updated Servo data:', updatedServo);
        const result = await partService.updatePart(id, updatedServo);
        console.log('Updated servo:', result);
        res.json({ success: true, message: 'Servo updated successfully', part: result });
    } catch (error) {
        console.error('Error updating servo:', error);
        res.status(500).json({ success: false, message: 'An error occurred while updating the servo: ' + error.message });
    }
});

module.exports = router;