const express = require('express');
const router = express.Router();
const dataManager = require('../dataManager');
const { exec } = require('child_process');
const path = require('path');

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

router.post('/test-motor', (req, res) => {
    console.log('Test motor route hit');
    console.log('Request body:', req.body);
    
    const { direction, speed, duration, directionPin, pwmPin } = req.body;
    const pythonScript = path.join(__dirname, '..', 'motor_control.py');
    const command = `sudo python3 ${pythonScript} ${direction} ${speed} ${duration} ${directionPin} ${pwmPin}`;
    
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
        res.status(200).send('Motor test successful');
    });
});

module.exports = router;
