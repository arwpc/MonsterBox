const express = require('express');
const router = express.Router();
const partService = require('../services/partService');
const characterService = require('../services/characterService');
const { spawn } = require('child_process');
const path = require('path');

router.get('/', async (req, res) => {
    try {
        const parts = await partService.getAllParts();
        const characters = await characterService.getAllCharacters();
        res.render('parts', { title: 'Parts', parts, characters });
    } catch (error) {
        console.error('Error fetching parts:', error);
        res.status(500).send('An error occurred while fetching parts');
    }
});

router.get('/new/:type', async (req, res) => {
    try {
        const { type } = req.params;
        const characters = await characterService.getAllCharacters();
        res.render(`part-forms/${type}`, { 
            title: `Add ${type.charAt(0).toUpperCase() + type.slice(1)}`, 
            action: `/parts/${type}`, 
            part: {}, 
            characters 
        });
    } catch (error) {
        console.error('Error rendering new part form:', error);
        res.status(500).send('An error occurred while loading the new part form');
    }
});

router.get('/:id/edit', async (req, res) => {
    try {
        const id = parseInt(req.params.id);
        const part = await partService.getPartById(id);
        const characters = await characterService.getAllCharacters();
        res.render(`part-forms/${part.type}`, {
            title: `Edit ${part.type.charAt(0).toUpperCase() + part.type.slice(1)}`,
            action: `/parts/${part.type}/${part.id}`,
            part,
            characters
        });
    } catch (error) {
        console.error('Error fetching part for edit:', error);
        res.status(500).send('An error occurred while fetching the part');
    }
});

router.get('/all', async (req, res) => {
    try {
        const parts = await partService.getAllParts();
        res.json(parts);
    } catch (error) {
        console.error('Error fetching all parts:', error);
        res.status(500).json({ error: 'An error occurred while fetching parts' });
    }
});

router.get('/os-test', async (req, res) => {
    res.render('os-test', { title: 'OS Test' });
});

router.post('/os-test', async (req, res) => {
    const { partId, command } = req.body;

    try {
        const part = await partService.getPartById(partId);
        const scriptPath = path.join(__dirname, '..', 'scripts', `${part.type}_control.py`);
        
        const process = spawn('python3', [scriptPath, ...command.split(' ').slice(2)]);

        let output = '';
        let error = '';

        process.stdout.on('data', (data) => {
            output += data.toString();
        });

        process.stderr.on('data', (data) => {
            error += data.toString();
        });

        process.on('close', (code) => {
            res.json({ output: output || error, exitCode: code });
        });
    } catch (error) {
        console.error('Error running OS test:', error);
        res.status(500).json({ error: 'An error occurred while running the OS test' });
    }
});

router.get('/os-test-stream', (req, res) => {
    const { command } = req.query;
    
    res.writeHead(200, {
        'Content-Type': 'text/event-stream',
        'Cache-Control': 'no-cache',
        'Connection': 'keep-alive'
    });

    const process = spawn('python3', command.split(' ').slice(1));

    process.stdout.on('data', (data) => {
        res.write(`data: ${JSON.stringify({output: data.toString()})}\n\n`);
    });

    process.stderr.on('data', (data) => {
        res.write(`data: ${JSON.stringify({output: `Error: ${data.toString()}`})}\n\n`);
    });

    process.on('close', (code) => {
        res.write(`data: ${JSON.stringify({done: true})}\n\n`);
        res.end();
    });
});

module.exports = router;