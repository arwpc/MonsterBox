const express = require('express');
const router = express.Router();
const partService = require('../services/partService');
const characterService = require('../services/characterService');
const { spawn } = require('child_process');
const path = require('path');
const logger = require('../scripts/logger');

let activeSensorProcesses = {};

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

router.get('/control', (req, res) => {
    const sensorId = parseInt(req.query.id);
    const gpioPin = parseInt(req.query.gpioPin);
    const action = req.query.action;

    if (isNaN(sensorId) || isNaN(gpioPin)) {
        return res.status(400).json({ error: 'Invalid sensor ID or GPIO pin' });
    }

    if (action !== 'start') {
        return res.status(400).json({ error: 'Invalid action' });
    }

    res.writeHead(200, {
        'Content-Type': 'text/event-stream',
        'Cache-Control': 'no-cache',
        'Connection': 'keep-alive'
    });

    const scriptPath = path.join(__dirname, '..', 'scripts', 'sensor_control.py');
    const process = spawn('python3', [scriptPath, gpioPin.toString()]);

    activeSensorProcesses[sensorId] = process;

    process.stdout.on('data', (data) => {
        res.write(`data: ${data}\n\n`);
    });

    process.stderr.on('data', (data) => {
        logger.error(`Sensor control script error: ${data}`);
        res.write(`data: ${JSON.stringify({ error: data.toString() })}\n\n`);
    });

    process.on('close', (code) => {
        logger.info(`Sensor control script exited with code ${code}`);
        res.write(`data: ${JSON.stringify({ status: 'Sensor monitoring stopped' })}\n\n`);
        delete activeSensorProcesses[sensorId];
        res.end();
    });

    req.on('close', () => {
        if (activeSensorProcesses[sensorId]) {
            activeSensorProcesses[sensorId].kill();
            delete activeSensorProcesses[sensorId];
        }
    });
});

router.post('/control', (req, res) => {
    const sensorId = parseInt(req.body.id);
    const action = req.body.action;

    if (isNaN(sensorId)) {
        return res.status(400).json({ error: 'Invalid sensor ID' });
    }

    if (action !== 'stop') {
        return res.status(400).json({ error: 'Invalid action' });
    }

    if (activeSensorProcesses[sensorId]) {
        activeSensorProcesses[sensorId].kill();
        delete activeSensorProcesses[sensorId];
        res.json({ status: 'Sensor monitoring stopped' });
    } else {
        res.status(404).json({ error: 'No active sensor process found' });
    }
});

module.exports = router;