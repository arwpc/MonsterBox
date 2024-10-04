const express = require('express');
const router = express.Router();
const partService = require('../services/partService');
const characterService = require('../services/characterService');
const { spawn } = require('child_process');
const path = require('path');
const logger = require('../scripts/logger');

router.get('/:id/edit', async (req, res) => {
    try {
        const id = parseInt(req.params.id);
        if (isNaN(id)) {
            throw new Error('Invalid part ID');
        }
        const part = await partService.getPartById(id);
        const characters = await characterService.getAllCharacters();
        res.render('part-forms/sensor', { title: 'Edit Sensor', action: `/parts/sensor/${part.id}`, part, characters });
    } catch (error) {
        logger.error('Error fetching sensor:', error);
        res.status(500).send('An error occurred while fetching the sensor: ' + error.message);
    }
});

router.post('/', async (req, res) => {
    try {
        const newSensor = {
            name: req.body.name,
            type: 'sensor',
            characterId: parseInt(req.body.characterId),
            sensorType: req.body.sensorType,
            gpioPin: parseInt(req.body.gpioPin) || 16,
            active: req.body.active === 'on'
        };
        const createdSensor = await partService.createPart(newSensor);
        logger.info('Created sensor:', createdSensor);
        res.redirect('/parts');
    } catch (error) {
        logger.error('Error creating sensor:', error);
        res.status(500).send('An error occurred while creating the sensor: ' + error.message);
    }
});

router.post('/:id', async (req, res) => {
    try {
        const id = parseInt(req.params.id);
        if (isNaN(id)) {
            throw new Error('Invalid part ID');
        }
        const updatedSensor = {
            id: id,
            name: req.body.name,
            type: 'sensor',
            characterId: parseInt(req.body.characterId),
            sensorType: req.body.sensorType,
            gpioPin: parseInt(req.body.gpioPin) || 16,
            active: req.body.active === 'on'
        };
        const result = await partService.updatePart(id, updatedSensor);
        logger.info('Updated sensor:', result);
        res.redirect('/parts');
    } catch (error) {
        logger.error('Error updating sensor:', error);
        res.status(500).send('An error occurred while updating the sensor: ' + error.message);
    }
});

router.get('/test-sensor', async (req, res) => {
    try {
        const sensorId = parseInt(req.query.id);
        const gpioPin = parseInt(req.query.gpioPin);

        if (isNaN(sensorId) || isNaN(gpioPin)) {
            throw new Error('Invalid sensor ID or GPIO pin');
        }

        const scriptPath = path.join(__dirname, '..', 'scripts', 'test_sensor.py');

        res.writeHead(200, {
            'Content-Type': 'text/event-stream',
            'Cache-Control': 'no-cache',
            'Connection': 'keep-alive'
        });

        const python = spawn('sudo', ['python3', scriptPath, gpioPin.toString()]);

        python.stdout.on('data', (data) => {
            res.write(`data: ${data}\n\n`);
        });

        python.stderr.on('data', (data) => {
            logger.error(`Python script error: ${data}`);
            res.write(`data: ${JSON.stringify({ error: data.toString() })}\n\n`);
        });

        python.on('close', (code) => {
            logger.info(`Python script exited with code ${code}`);
            res.write(`data: ${JSON.stringify({ done: true })}\n\n`);
            res.end();
        });

        req.on('close', () => {
            python.kill();
        });
    } catch (error) {
        logger.error('Error testing sensor:', error);
        res.status(500).json({ error: 'Internal Server Error' });
    }
});

module.exports = router;
