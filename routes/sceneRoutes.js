const express = require('express');
const router = express.Router();
const dataManager = require('../dataManager');

router.get('/', async (req, res) => {
    try {
        const scenes = await dataManager.getScenes();
        const characters = await dataManager.getCharacters();
        res.render('scenes', { title: 'Scenes', scenes, characters });
    } catch (error) {
        console.error('Error fetching scenes:', error);
        res.status(500).send('Something broke!');
    }
});

router.get('/new', async (req, res) => {
    try {
        const characters = await dataManager.getCharacters();
        const parts = await dataManager.getParts();
        const sounds = await dataManager.getSounds();
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
        const scene = await dataManager.getScene(req.params.id);
        const characters = await dataManager.getCharacters();
        const parts = await dataManager.getParts();
        const sounds = await dataManager.getSounds();
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
        const sceneData = {
            scene_name: req.body.scene_name,
            character_id: parseInt(req.body.character_id),
            steps: parseSteps(req.body.steps)
        };
        await dataManager.saveScene(sceneData);
        res.redirect('/scenes');
    } catch (error) {
        console.error('Error creating scene:', error);
        res.status(500).send('Something broke!');
    }
});

router.post('/:id', async (req, res) => {
    try {
        const sceneData = {
            id: parseInt(req.params.id),
            scene_name: req.body.scene_name,
            character_id: parseInt(req.body.character_id),
            steps: parseSteps(req.body.steps)
        };
        await dataManager.saveScene(sceneData);
        res.redirect('/scenes');
    } catch (error) {
        console.error('Error updating scene:', error);
        res.status(500).send('Something broke!');
    }
});

router.post('/:id/delete', async (req, res) => {
    try {
        await dataManager.removeScene(req.params.id);
        res.sendStatus(200);
    } catch (error) {
        console.error('Error deleting scene:', error);
        res.status(500).send('Something broke!');
    }
});

function parseSteps(steps) {
    if (!Array.isArray(steps)) {
        steps = [steps];
    }
    return steps.map(step => ({
        name: step.name,
        type: step.type,
        ...(step.type === 'sound' ? {
            sound_id: parseInt(step.sound_id),
            concurrent: step.concurrent === 'on'
        } : {
            part_id: parseInt(step.part_id),
            duration: parseInt(step.duration),
            ...(step.type === 'motor' ? {
                direction: step.direction,
                speed: parseInt(step.speed)
            } : {})
        })
    }));
}

module.exports = router;
