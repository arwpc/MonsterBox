const express = require('express');
const router = express.Router();
const dataManager = require('../dataManager');

router.get('/', async (req, res) => {
    const scenes = await dataManager.getScenes();
    const characters = await dataManager.getCharacters();
    res.render('scenes', { title: 'Scenes', scenes, characters });
});

router.get('/new', async (req, res) => {
    const characters = await dataManager.getCharacters();
    const parts = await dataManager.getParts();
    const sounds = await dataManager.getSounds();
    res.render('scene-form', { title: 'Add New Scene', action: '/scenes', scene: {}, characters, parts, sounds });
});

router.get('/:id/edit', async (req, res) => {
    const scenes = await dataManager.getScenes();
    const characters = await dataManager.getCharacters();
    const parts = await dataManager.getParts();
    const sounds = await dataManager.getSounds();
    const scene = scenes.find(s => s.id === parseInt(req.params.id));
    if (scene) {
        res.render('scene-form', { title: 'Edit Scene', action: '/scenes/' + scene.id, scene, characters, parts, sounds });
    } else {
        res.status(404).send('Scene not found');
    }
});

router.post('/', async (req, res) => {
    const scenes = await dataManager.getScenes();
    const newScene = {
        id: dataManager.getNextId(scenes),
        scene_name: req.body.scene_name,
        character_id: parseInt(req.body.character_id),
        steps: JSON.parse(req.body.steps)
    };
    scenes.push(newScene);
    await dataManager.saveScenes(scenes);
    res.redirect('/scenes');
});

router.post('/:id', async (req, res) => {
    const id = parseInt(req.params.id);
    const scenes = await dataManager.getScenes();
    const index = scenes.findIndex(s => s.id === id);
    if (index !== -1) {
        scenes[index] = {
            id: id,
            scene_name: req.body.scene_name,
            character_id: parseInt(req.body.character_id),
            steps: JSON.parse(req.body.steps)
        };
        await dataManager.saveScenes(scenes);
        res.redirect('/scenes');
    } else {
        res.status(404).send('Scene not found');
    }
});

router.post('/:id/delete', async (req, res) => {
    const id = parseInt(req.params.id);
    const scenes = await dataManager.getScenes();
    const index = scenes.findIndex(s => s.id === id);
    if (index !== -1) {
        scenes.splice(index, 1);
        await dataManager.saveScenes(scenes);
        res.sendStatus(200);
    } else {
        res.status(404).send('Scene not found');
    }
});

module.exports = router;
