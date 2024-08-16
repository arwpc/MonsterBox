const express = require('express');
const router = express.Router();
const dataManager = require('../dataManager');

router.get('/', async (req, res) => {
    const parts = await dataManager.getParts();
    res.render('parts', { title: 'Parts', parts });
});

router.get('/new', (req, res) => {
    res.render('part-form', { title: 'Add New Part', action: '/parts', part: {} });
});

router.get('/:id/edit', async (req, res) => {
    const parts = await dataManager.getParts();
    const part = parts.find(p => p.id === parseInt(req.params.id));
    if (part) {
        res.render('part-form', { title: 'Edit Part', action: '/parts/' + part.id, part });
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
        pin: parseInt(req.body.pin)
    };
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
            pin: parseInt(req.body.pin)
        };
        await dataManager.saveParts(parts);
        res.redirect('/parts');
    } else {
        res.status(404).send('Part not found');
    }
});

router.post('/:id/delete', async (req, res) => {
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

module.exports = router;
