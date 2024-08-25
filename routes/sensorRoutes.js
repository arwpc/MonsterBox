const express = require('express');
const router = express.Router();
const dataManager = require('../dataManager');
const { spawn } = require('child_process');
const path = require('path');

router.get('/', async (req, res) => {
    try {
        const sensors = await dataManager.getSensors();
        const characters = await dataManager.getCharacters();
        res.render('sensors', { title: 'Sensors', sensors, characters });
    } catch (error) {
        console.error('Error fetching sensors:', error);
        res.status(500).send('Internal Server Error');
    }
});

router.get('/new', async (req, res) => {
    try {
        const characters = await dataManager.getCharacters();
        const parts = await dataManager.getParts();
        res.render('part-forms/sensor', { title: 'Add New Sensor', action: '/sensors', sensor: {}, characters, parts });
    } catch (error) {
        console.error('Error rendering new sensor form:', error);
        res.status(500).send('Internal Server Error');
    }
});

router.get('/:id/edit', async (req, res) => {
    try {
        const sensors = await dataManager.getSensors();
        const characters = await dataManager.getCharacters();
        const parts = await dataManager.getParts();
        const sensor = sensors.find(s => s.id === parseInt(req.params.id));
        if (sensor) {
            res.render('part-forms/sensor', { title: 'Edit Sensor', action: '/sensors/' + sensor.id, sensor, characters, parts });
        } else {
            res.status(404).send('Sensor not found');
        }
    } catch (error) {
        console.error('Error fetching sensor:', error);
        res.status(500).send('Internal Server Error');
    }
});

router.post('/', async (req, res) => {
    try {
        const sensors = await dataManager.getSensors();
        const newSensor = {
            id: dataManager.getNextId(sensors),
            name: req.body.name,
            type: req.body.type,
            characterId: parseInt(req.body.characterId),
            active: req.body.active === 'on',
            gpioPin: parseInt(req.body.gpioPin)
        };

        sensors.push(newSensor);
        await dataManager.saveSensors(sensors);
        res.redirect('/sensors');
    } catch (error) {
        console.error('Error creating sensor:', error);
        res.status(500).send('Internal Server Error');
    }
});

router.post('/:id', async (req, res) => {
    try {
        const id = parseInt(req.params.id);
        const sensors = await dataManager.getSensors();
        const index = sensors.findIndex(s => s.id === id);
        if (index !== -1) {
            sensors[index] = {
                id: id,
                name: req.body.name,
                type: req.body.type,
                characterId: parseInt(req.body.characterId),
                active: req.body.active === 'on',
                gpioPin: parseInt(req.body.gpioPin)
            };

            await dataManager.saveSensors(sensors);
            res.redirect('/sensors');
        } else {
            res.status(404).send('Sensor not found');
        }
    } catch (error) {
        console.error('Error updating sensor:', error);
        res.status(500).send('Internal Server Error');
    }
});

router.post('/:id/delete', async (req, res) => {
    try {
        const id = parseInt(req.params.id);
        const sensors = await dataManager.getSensors();
        const index = sensors.findIndex(s => s.id === id);
        if (index !== -1) {
            sensors.splice(index, 1);
            await dataManager.saveSensors(sensors);
            res.sendStatus(200);
        } else {
            res.status(404).send('Sensor not found');
        }
    } catch (error) {
        console.error('Error deleting sensor:', error);
        res.status(500).send('Internal Server Error');
    }
});

router.get('/:id/test', async (req, res) => {
    try {
        const id = parseInt(req.params.id);
        const sensors = await dataManager.getSensors();
        const sensor = sensors.find(s => s.id === id);
        
        if (!sensor) {
            return res.status(404).send('Sensor not found');
        }

        res.render('sensor-test', { title: 'Test Sensor', sensor });
    } catch (error) {
        console.error('Error rendering sensor test page:', error);
        res.status(500).send('Internal Server Error');
    }
});

router.get('/test', async (req, res) => {
    try {
        const sensorId = parseInt(req.query.id);
        const sensors = await dataManager.getSensors();
        const sensor = sensors.find(s => s.id === sensorId);

        if (!sensor) {
            return res.status(404).json({ error: 'Sensor not found' });
        }

        // Update sensor with new GPIO pin if provided
        if (req.query.gpioPin) {
            sensor.gpioPin = parseInt(req.query.gpioPin);
            await dataManager.saveSensors(sensors);
        }

        const scriptPath = path.join(__dirname, '..', 'scripts', 'test_sensor.py');
        
        res.writeHead(200, {
            'Content-Type': 'text/event-stream',
            'Cache-Control': 'no-cache',
            'Connection': 'keep-alive'
        });

        const python = spawn('sudo', ['python3', scriptPath, sensor.gpioPin.toString()]);

        python.stdout.on('data', (data) => {
            res.write(`data: ${data}\n\n`);
        });

        python.stderr.on('data', (data) => {
            console.error(`Python script error: ${data}`);
            res.write(`data: ${JSON.stringify({ error: data.toString() })}\n\n`);
        });

        python.on('close', (code) => {
            console.log(`Python script exited with code ${code}`);
            res.write(`data: ${JSON.stringify({ done: true })}\n\n`);
            res.end();
        });

        req.on('close', () => {
            python.kill();
        });
    } catch (error) {
        console.error('Error testing sensor:', error);
        res.status(500).json({ error: 'Internal Server Error' });
    }
});

module.exports = router;
