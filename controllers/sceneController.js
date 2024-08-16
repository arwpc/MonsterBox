const {
    getAllScenes,
    getScene,
    saveScene,
    removeScene,
    addStepToScene,
    updateStepInScene,
    removeStepFromScene,
    getAllCharacters  // Ensure this function is available
} = require('../services/sceneService');

exports.getScenes = async (req, res) => {
    try {
        const scenes = await getAllScenes();
        res.render('scenes', { 
            title: 'Scenes',
            scenes 
        });
    } catch (error) {
        console.error('Error fetching scenes:', error);
        res.status(500).send('Something broke!');
    }
};

exports.getSceneById = async (req, res) => {
    try {
        const scene = await getScene(req.params.id);
        const characters = await getAllCharacters();  // Fetch characters
        const parts = []; // Fetch parts from your data source
        const sounds = []; // Fetch sounds from your data source
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
};

exports.createScene = async (req, res) => {
    try {
        const scene = await saveScene(req.body);
        res.redirect('/scenes');
    } catch (error) {
        console.error('Error creating scene:', error);
        res.status(500).send('Something broke!');
    }
};

exports.newScene = async (req, res) => {  // New function for rendering the new scene form
    try {
        const characters = await getAllCharacters();  // Fetch characters
        const parts = []; // Fetch parts from your data source
        const sounds = []; // Fetch sounds from your data source
        res.render('scene-form', { 
            title: 'New Scene',
            scene: {},
            action: '/scenes',
            characters, 
            parts, 
            sounds 
        });
    } catch (error) {
        console.error('Error rendering new scene form:', error);
        res.status(500).send('Something broke!');
    }
};

exports.updateScene = async (req, res) => {
    try {
        const scene = await saveScene(req.body, req.params.id);
        res.redirect(`/scenes/${scene.id}/edit`);
    } catch (error) {
        console.error('Error updating scene:', error);
        res.status(500).send('Something broke!');
    }
};

exports.deleteScene = async (req, res) => {
    try {
        await removeScene(req.params.id);
        res.redirect('/scenes');
    } catch (error) {
        console.error('Error deleting scene:', error);
        res.status(500).send('Something broke!');
    }
};

exports.addStep = async (req, res) => {
    try {
        const scene = await addStepToScene(req.params.id, req.body);
        res.json(scene);
    } catch (error) {
        console.error('Error adding step:', error);
        res.status(500).send('Something broke!');
    }
};

exports.updateStep = async (req, res) => {
    try {
        const scene = await updateStepInScene(req.params.sceneId, req.params.stepId, req.body);
        res.json(scene);
    } catch (error) {
        console.error('Error updating step:', error);
        res.status(500).send('Something broke!');
    }
};

exports.deleteStep = async (req, res) => {
    try {
        const scene = await removeStepFromScene(req.params.sceneId, req.params.stepId);
        res.json(scene);
    } catch (error) {
        console.error('Error deleting step:', error);
        res.status(500).send('Something broke!');
    }
};
