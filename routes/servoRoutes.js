const express = require('express');
const router = express.Router();
const partService = require('../services/partService');
const characterService = require('../services/characterService');
const servoController = require('../controllers/servoController');
const logger = require('../scripts/logger');

router.get('/new', async (req, res) => {
    try {
        const characters = await characterService.getAllCharacters();
        const servoTypes = servoController.getServoTypes();
        const characterId = req.query.characterId;
        let character = null;
        if (characterId) {
            character = await characterService.getCharacterById(characterId);
        }
        res.render('part-forms/servo', { 
            title: 'New Servo', 
            action: '/parts/servo', 
            part: null, 
            characters,
            character,
            servoTypes,
            getServoDefaults: servoController.getServoDefaults
        });
    } catch (error) {
        logger.error('Error preparing new servo form:', error);
        res.status(500).send('An error occurred while preparing the new servo form: ' + error.message);
    }
});

router.get('/:id/edit', async (req, res) => {
    try {
        const id = parseInt(req.params.id, 10);
        logger.debug('Editing Servo with ID:', id, 'Type:', typeof id);
        if (isNaN(id)) {
            throw new Error('Invalid part ID');
        }
        const part = await partService.getPartById(id);
        if (!part) {
            throw new Error('Part not found');
        }
        const characters = await characterService.getAllCharacters();
        const character = await characterService.getCharacterById(part.characterId);
        const servoTypes = servoController.getServoTypes();
        res.render('part-forms/servo', { 
            title: 'Edit Servo', 
            action: `/parts/servo/${part.id}`, 
            part, 
            characters,
            character,
            servoTypes,
            getServoDefaults: servoController.getServoDefaults
        });
    } catch (error) {
        logger.error('Error fetching servo:', error);
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
        logger.info('Created servo:', createdServo);
        res.redirect(`/parts?characterId=${createdServo.characterId}`);
    } catch (error) {
        logger.error('Error creating servo:', error);
        res.status(500).send('An error occurred while creating the servo: ' + error.message);
    }
});

router.post('/test', servoController.testServo);

router.post('/stop', servoController.stopServo);

router.post('/:id', async (req, res) => {
    try {
        logger.debug('Update Servo Route - Request params:', req.params);
        logger.debug('Update Servo Route - Request body:', req.body);

        const id = parseInt(req.params.id, 10);
        logger.debug('Updating Servo with ID:', id, 'Type:', typeof id);
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
        logger.debug('Updated Servo data:', updatedServo);
        const result = await partService.updatePart(id, updatedServo);
        logger.info('Updated servo:', result);
        res.redirect(`/parts?characterId=${result.characterId}`);
    } catch (error) {
        logger.error('Error updating servo:', error);
        res.status(500).send('An error occurred while updating the servo: ' + error.message);
    }
});

module.exports = router;
