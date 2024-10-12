const express = require('express');
const router = express.Router();
const partService = require('../services/partService');
const characterService = require('../services/characterService');
const { spawn } = require('child_process');
const path = require('path');
const logger = require('../scripts/logger');

function executeTestfire(res, params) {
    const { direction, speed, duration, directionPin, pwmPin, maxExtension, maxRetraction } = params;
    const scriptPath = path.join(__dirname, '..', 'scripts', 'linear_actuator_control.py');
    const command = `sudo python3 "${scriptPath}" ${direction} ${speed} ${duration} ${directionPin} ${pwmPin} ${maxExtension} ${maxRetraction}`;
    
    logger.info(`Executing command: ${command}`);

    spawn('sudo', ['python3', scriptPath, direction, speed, duration, directionPin, pwmPin, maxExtension, maxRetraction], { stdio: 'pipe' })
        .on('error', (error) => {
            logger.error(`Testfire exec error: ${error.message}`);
            res.status(500).json({
                success: false,
                message: 'An error occurred while controlling the linear actuator.',
                error: error.message
            });
        })
        .on('close', (code) => {
            if (code === 0) {
                logger.info('Linear actuator control completed successfully.');
                res.json({
                    success: true,
                    message: 'Linear actuator control completed successfully.'
                });
            } else {
                logger.error(`Linear actuator control failed with exit code: ${code}`);
                res.status(500).json({
                    success: false,
                    message: `Linear actuator control failed with exit code: ${code}`
                });
            }
        });
}

router.get('/new', async (req, res) => {
    try {
        const characters = await characterService.getAllCharacters();
        const characterId = req.query.characterId;
        let character = null;
        if (characterId) {
            character = await characterService.getCharacterById(characterId);
        }
        res.render('part-forms/linear-actuator', { 
            title: 'Create Linear Actuator', 
            action: '/parts/linear-actuator', 
            part: {}, 
            characters,
            character
        });
    } catch (error) {
        logger.error('Error fetching characters:', error);
        res.status(500).send('An error occurred while fetching the characters: ' + error.message);
    }
});

router.get('/:id/edit', async (req, res) => {
    try {
        const id = parseInt(req.params.id, 10);
        logger.debug('Editing Linear Actuator with ID:', id);
        if (isNaN(id)) {
            throw new Error('Invalid part ID');
        }
        const part = await partService.getPartById(id);
        const characters = await characterService.getAllCharacters();
        const character = await characterService.getCharacterById(part.characterId);
        res.render('part-forms/linear-actuator', { 
            title: 'Edit Linear Actuator', 
            action: `/parts/linear-actuator/${part.id}`, 
            part, 
            characters,
            character
        });
    } catch (error) {
        logger.error('Error fetching linear actuator:', error);
        res.status(500).send('An error occurred while fetching the linear actuator: ' + error.message);
    }
});

router.get('/testfire', (req, res) => {
    const { direction = 'forward', speed = '50', duration = '1000', directionPin, pwmPin, maxExtension, maxRetraction } = req.query;
    logger.info(`Received GET testfire request for unsaved linear actuator with params: direction=${direction}, speed=${speed}, duration=${duration}, directionPin=${directionPin}, pwmPin=${pwmPin}, maxExtension=${maxExtension}, maxRetraction=${maxRetraction}`);
    
    executeTestfire(res, {
        direction,
        speed,
        duration,
        directionPin,
        pwmPin,
        maxExtension: maxExtension || '10000',
        maxRetraction: maxRetraction || '10000'
    });
});

router.get('/:id/testfire', (req, res) => {
    const id = parseInt(req.params.id, 10);
    const { direction = 'forward', speed = '50', duration = '1000' } = req.query;
    logger.info(`Received GET testfire request for linear actuator ${id} with params: direction=${direction}, speed=${speed}, duration=${duration}`);
    
    partService.getPartById(id)
        .then(part => {
            logger.debug(`Retrieved part for testfire: ${JSON.stringify(part)}`);
            executeTestfire(res, {
                direction,
                speed,
                duration,
                directionPin: (part.directionPin || 18).toString(),
                pwmPin: (part.pwmPin || 13).toString(),
                maxExtension: (part.maxExtension || 10000).toString(),
                maxRetraction: (part.maxRetraction || 10000).toString()
            });
        })
        .catch(error => {
            logger.error(`Error fetching linear actuator for testfire: ${error.message}`);
            res.status(500).json({
                success: false,
                message: 'An error occurred while fetching the linear actuator data.',
                error: error.message
            });
        });
});

router.post('/', async (req, res) => {
    try {
        const newLinearActuator = {
            name: req.body.name,
            type: 'linear-actuator',
            characterId: parseInt(req.body.characterId, 10),
            directionPin: parseInt(req.body.directionPin, 10),
            pwmPin: parseInt(req.body.pwmPin, 10),
            maxExtension: parseInt(req.body.maxExtension, 10) || 10000,
            maxRetraction: parseInt(req.body.maxRetraction, 10) || 10000
        };
        const createdLinearActuator = await partService.createPart(newLinearActuator);
        logger.info('Created linear actuator:', createdLinearActuator);
        res.redirect('/parts');
    } catch (error) {
        logger.error('Error creating linear actuator:', error);
        res.status(500).send('An error occurred while creating the linear actuator: ' + error.message);
    }
});

router.post('/:id', async (req, res) => {
    try {
        const id = parseInt(req.params.id, 10);
        logger.debug('Updating Linear Actuator with ID:', id);
        if (isNaN(id)) {
            throw new Error('Invalid part ID');
        }
        const updatedLinearActuator = {
            id: id,
            name: req.body.name,
            type: 'linear-actuator',
            characterId: parseInt(req.body.characterId, 10),
            directionPin: parseInt(req.body.directionPin, 10),
            pwmPin: parseInt(req.body.pwmPin, 10),
            maxExtension: parseInt(req.body.maxExtension, 10) || 10000,
            maxRetraction: parseInt(req.body.maxRetraction, 10) || 10000
        };
        logger.debug('Updated Linear Actuator data:', updatedLinearActuator);
        const result = await partService.updatePart(id, updatedLinearActuator);
        logger.info('Updated linear actuator:', result);
        res.redirect('/parts');
    } catch (error) {
        logger.error('Error updating linear actuator:', error);
        res.status(500).send('An error occurred while updating the linear actuator: ' + error.message);
    }
});

module.exports = router;
