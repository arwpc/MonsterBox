const express = require('express');
const router = express.Router();
const partService = require('../services/partService');
const dataManager = require('../dataManager');
const { exec } = require('child_process');
const path = require('path');
const { spawn } = require('child_process');

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
        const parts = await dataManager.getParts();
        const newPart = {
            id: dataManager.getNextId(parts),
            name: req.body.name,
            type: req.body.type,
            characterId: parseInt(req.body.characterId)
        };

        if (req.body.type === 'motor') {
            newPart.directionPin = parseInt(req.body.directionPin);
            newPart.pwmPin = parseInt(req.body.pwmPin);
        } else if (req.body.type === 'sensor') {
            newPart.sensorType = req.body.sensorType;
            newPart.gpioPin = parseInt(req.body.gpioPin);
        } else if (req.body.type === 'led') {
            newPart.ledPin = parseInt(req.body.ledPin);
            newPart.duration = parseInt(req.body.duration);
        } else {
            newPart.pin = parseInt(req.body.pin);
        }

        await partService.createPart(newPart);
        res.redirect('/parts');
    } catch (error) {
        console.error('Error creating part:', error);
        res.status(500).send('An error occurred while creating the part');
    }
});

router.post('/:id', async (req, res) => {
    try {
        const id = parseInt(req.params.id);
        const parts = await dataManager.getParts();
        const index = parts.findIndex(p => p.id === id);
        if (index !== -1) {
            parts[index] = {
                id: id,
                name: req.body.name,
                type: req.body.type,
                characterId: parseInt(req.body.characterId)
            };

            if (req.body.type === 'motor') {
                parts[index].directionPin = parseInt(req.body.directionPin);
                parts[index].pwmPin = parseInt(req.body.pwmPin);
            } else if (req.body.type === 'sensor') {
                parts[index].sensorType = req.body.sensorType;
                parts[index].gpioPin = parseInt(req.body.gpioPin);
            } else if (req.body.type === 'led') {
                parts[index].ledPin = parseInt(req.body.ledPin);
                parts[index].duration = parseInt(req.body.duration);
            } else {
                parts[index].pin = parseInt(req.body.pin);
            }

            await dataManager.saveParts(parts);
            await partService.updatePart(id, parts[index]);
            res.redirect('/parts');
        } else {
            res.status(404).send('Part not found');
        }
    } catch (error) {
        console.error('Error updating part:', error);
        res.status(500).send('An error occurred while updating the part');
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

router.get('/test-sensor', (req, res) => {
    console.log('Test sensor route hit');
    console.log('Request query:', req.query);
    
    const { gpioPin } = req.query;
    const scriptPath = path.join(__dirname, '..', 'scripts', 'test_sensor.py');
    const pythonProcess = spawn('sudo', ['python3', scriptPath, gpioPin]);
    
    console.log('Command to be executed:', `sudo python3 ${scriptPath} ${gpioPin}`);

    res.writeHead(200, {
        'Content-Type': 'text/event-stream',
        'Cache-Control': 'no-cache',
        'Connection': 'keep-alive'
    });

    pythonProcess.stdout.on('data', (data) => {
        res.write(`data: ${data}\n\n`);
    });

    pythonProcess.stderr.on('data', (data) => {
        console.error(`stderr: ${data}`);
        res.write(`data: ${JSON.stringify({ error: data.toString() })}\n\n`);
    });

    pythonProcess.on('close', (code) => {
        console.log(`Python script exited with code ${code}`);
        res.write(`data: ${JSON.stringify({ done: true })}\n\n`);
        res.end();
    });

    req.on('close', () => {
        pythonProcess.kill();
    });
});

router.post('/test-led', (req, res) => {
    console.log('Test LED route hit');
    console.log('Request body:', req.body);
    
    const { command } = req.body;

    if (!command) {
        console.error('Command not specified');
        return res.status(400).send('Command not specified');
    }

    console.log('Command to be executed:', command);

    exec(command, (error, stdout, stderr) => {
        if (error) {
            console.error(`exec error: ${error}`);
            return res.status(500).send(`Error executing command: ${error.message}`);
        }
        if (stderr) {
            console.error(`stderr: ${stderr}`);
            return res.status(500).send(`Error from Python script: ${stderr}`);
        }
        console.log(`stdout: ${stdout}`);
        res.status(200).send(stdout || 'LED test successful (no output)');
    });
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
