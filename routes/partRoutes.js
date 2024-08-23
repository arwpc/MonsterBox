const express = require('express');
const router = express.Router();
const dataManager = require('../dataManager');
const { exec } = require('child_process');
const path = require('path');
const { spawn } = require('child_process');

router.get('/', async (req, res) => {
    const parts = await dataManager.getParts();
    const characters = await dataManager.getCharacters();
    res.render('parts', { title: 'Parts', parts, characters });
});

router.get('/new', async (req, res) => {
    const characters = await dataManager.getCharacters();
    res.render('part-form', { title: 'Add New Part', action: '/parts', part: {}, characters });
});

router.get('/:id/edit', async (req, res) => {
    const parts = await dataManager.getParts();
    const characters = await dataManager.getCharacters();
    const part = parts.find(p => p.id === parseInt(req.params.id));
    if (part) {
        res.render('part-form', { title: 'Edit Part', action: '/parts/' + part.id, part, characters });
    } else {
        res.status(404).send('Part not found');
    }
});

router.post('/', async (req, res) => {
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

    parts.push(newPart);
    await dataManager.saveParts(parts);
    res.redirect('/parts');
});

router.post('/:id', async (req, res) => {
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
        res.redirect('/parts');
    } else {
        res.status(404).send('Part not found');
    }
});

router.post('/:id/delete', async (req, res) => {
    console.log('DELETE /parts/:id route hit. ID:', req.params.id);
    const id = parseInt(req.params.id);
    const parts = await dataManager.getParts();
    const index = parts.findIndex(p => p.id === id);
    if (index !== -1) {
        parts.splice(index, 1);
        await dataManager.saveParts(parts);
        res.sendStatus(200);
    } else {
        res.status(404).send('Part not found');
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
            console.error(`Exec error: ${error.message}`);
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

module.exports = router;
