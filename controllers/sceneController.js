const sceneService = require('../services/sceneService');
const characterService = require('../services/characterService');
const partService = require('../services/partService');
const soundService = require('../services/soundService');

exports.getAllScenes = async (req, res) => {
    try {
        const scenes = await sceneService.getAllScenes();
        const characters = await characterService.getAllCharacters();
        res.render('scenes', { title: 'Scenes', scenes, characters });
    } catch (error) {
        console.error('Error fetching scenes:', error);
        res.status(500).send('An error occurred while fetching scenes');
    }
};

exports.newScene = async (req, res) => {
    try {
        const characters = await characterService.getAllCharacters();
        res.render('scene-form', { title: 'New Scene', scene: {}, characters });
    } catch (error) {
        console.error('Error rendering new scene form:', error);
        res.status(500).send('An error occurred while loading the new scene form');
    }
};

exports.getSceneById = async (req, res) => {
    try {
        const scene = await sceneService.getSceneById(req.params.id);
        const characters = await characterService.getAllCharacters();
        if (scene) {
            res.render('scene-form', { title: 'Edit Scene', scene, characters });
        } else {
            res.status(404).send('Scene not found');
        }
    } catch (error) {
        console.error('Error fetching scene:', error);
        res.status(500).send('An error occurred while fetching the scene');
    }
};

exports.createScene = async (req, res) => {
    try {
        const newScene = await sceneService.createScene(req.body);
        res.redirect('/scenes');
    } catch (error) {
        console.error('Error creating scene:', error);
        res.status(500).send('An error occurred while creating the scene');
    }
};

exports.updateScene = async (req, res) => {
    try {
        const updatedScene = await sceneService.updateScene(req.params.id, req.body);
        res.redirect('/scenes');
    } catch (error) {
        console.error('Error updating scene:', error);
        res.status(500).send('An error occurred while updating the scene');
    }
};

exports.deleteScene = async (req, res) => {
    try {
        await sceneService.deleteScene(req.params.id);
        res.sendStatus(200);
    } catch (error) {
        console.error('Error deleting scene:', error);
        res.status(500).send('An error occurred while deleting the scene');
    }
};

exports.scheduleScene = async (req, res) => {
    try {
        await sceneService.scheduleScene(req.params.id, req.body.schedule);
        res.sendStatus(200);
    } catch (error) {
        console.error('Error scheduling scene:', error);
        res.status(500).send('An error occurred while scheduling the scene');
    }
};

exports.triggerScene = async (req, res) => {
    try {
        await sceneService.triggerScene(req.params.id);
        res.sendStatus(200);
    } catch (error) {
        console.error('Error triggering scene:', error);
        res.status(500).send('An error occurred while triggering the scene');
    }
};

exports.startScheduler = async (req, res) => {
    try {
        await sceneService.startScheduler();
        res.sendStatus(200);
    } catch (error) {
        console.error('Error starting scheduler:', error);
        res.status(500).send('An error occurred while starting the scheduler');
    }
};

exports.stopScheduler = async (req, res) => {
    try {
        await sceneService.stopScheduler();
        res.sendStatus(200);
    } catch (error) {
        console.error('Error stopping scheduler:', error);
        res.status(500).send('An error occurred while stopping the scheduler');
    }
};
