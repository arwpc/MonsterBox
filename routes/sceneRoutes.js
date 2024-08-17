const express = require('express');
const router = express.Router();
const {
    getAllScenes,
    getScene,
    saveScene,
    removeScene,
    addStepToScene,
    updateStepInScene,
    removeStepFromScene,
    getAllCharacters,
    getAllParts,
    getAllSounds
} = require('../services/sceneService');

router.get('/', async (req, res) => {
    try {
        const scenes = await getAllScenes();
        const characters = await getAllCharacters();
        res.render('scenes', { 
            title: 'Scenes',
            scenes,
            characters
        });
    } catch (error) {
        console.error('Error fetching scenes:', error);
        res.status(500).send('Something broke!');
    }
});

router.get('/new', async (req, res) => {
    try {
        const characters = await getAllCharacters();
        const parts = await getAllParts();
        const sounds = await getAllSounds();
        res.render('scene-form', { 
            title: 'New Scene',
            scene: { steps: [] },
            action: '/scenes',
            characters, 
            parts, 
            sounds 
        });
    } catch (error) {
        console.error('Error rendering new scene form:', error);
        res.status(500).send('Something broke!');
    }
});

router.get('/:id/edit', async (req, res) => {
    try {
        const scene = await getScene(req.params.id);
        const characters = await getAllCharacters();
        const parts = await getAllParts();
        const sounds = await getAllSounds();
        if (scene) {
            res.render('scene-form', { 
                title: 'Edit Scene',
                scene, 
                action: `/scenes/${scene.id}`, 
                characters, 
                parts, 
                sounds 
            });
        } else {
            res.status(404).send('Scene not found');
        }
    } catch (error) {
        console.error('Error fetching scene:', error);
        res.status(500).send('Something broke!');
    }
});

router.post('/', async (req, res) => {
    try {
        const scene = await saveScene(req.body);
        res.redirect('/scenes');
    } catch (error) {
        console.error('Error creating scene:', error);
        res.status(500).send('Something broke!');
    }
});

router.post('/:id', async (req, res) => {
    try {
        const scene = await saveScene(req.body, req.params.id);
        res.redirect('/scenes');
    } catch (error) {
        console.error('Error updating scene:', error);
        res.status(500).send('Something broke!');
    }
});

router.post('/:id/delete', async (req, res) => {
    try {
        await removeScene(req.params.id);
        res.sendStatus(200);
    } catch (error) {
        console.error('Error deleting scene:', error);
        res.status(500).send('Something broke!');
    }
});

module.exports = router;
