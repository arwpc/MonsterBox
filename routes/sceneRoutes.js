const express = require('express');
const router = express.Router();
const sceneController = require('../controllers/sceneController');
const dataManager = require('../dataManager');

// Routes from the first version
router.get('/', sceneController.getAllScenes);
router.get('/new', sceneController.newScene);
router.get('/:id', sceneController.getSceneById);
router.post('/', sceneController.createScene);
router.put('/:id', sceneController.updateScene);
router.delete('/:id', sceneController.deleteScene);

// New routes for scheduling and triggering
router.post('/:id/schedule', sceneController.scheduleScene);
router.post('/:id/trigger', sceneController.triggerScene);
router.post('/schedule/start', sceneController.startScheduler);
router.post('/schedule/stop', sceneController.stopScheduler);

// Routes from the second version
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
