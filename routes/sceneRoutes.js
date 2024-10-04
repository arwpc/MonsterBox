// File: routes/sceneRoutes.js

const express = require('express');
const router = express.Router();
const sceneController = require('../controllers/sceneController');
const scenePlayerController = require('../controllers/scenePlayerController');
const logger = require('../scripts/logger');

// Middleware to check if a character is selected
const checkCharacterSelected = (req, res, next) => {
    if (!req.query.characterId) {
        logger.warn('No character selected, redirecting to main page');
        return res.redirect('/');  // Redirect to main page if no character is selected
    }
    req.characterId = req.query.characterId;
    logger.debug(`Character selected: ${req.characterId}`);
    next();
};

// Apply the middleware to all routes
router.use(checkCharacterSelected);

router.get('/', (req, res, next) => {
    logger.info(`Getting all scenes for character ${req.characterId}`);
    sceneController.getAllScenes(req, res, next, req.characterId);
});

router.get('/new', (req, res, next) => {
    logger.info(`Rendering new scene form for character ${req.characterId}`);
    sceneController.newScene(req, res, next, req.characterId);
});

router.get('/step-template', (req, res, next) => {
    logger.info(`Getting step template for character ${req.characterId}`);
    sceneController.getStepTemplate(req, res, next, req.characterId);
});

router.get('/:id', (req, res, next) => {
    logger.info(`Getting scene player for scene ${req.params.id}, character ${req.characterId}`);
    scenePlayerController.getScenePlayer(req, res, next);
});

router.get('/:id/edit', (req, res, next) => {
    logger.info(`Getting scene ${req.params.id} for editing, character ${req.characterId}`);
    sceneController.getSceneById(req, res, next, req.characterId);
});

router.post('/', (req, res, next) => {
    req.body.characterId = req.characterId;
    logger.info(`Creating new scene for character ${req.characterId}`);
    sceneController.createScene(req, res, next);
});

router.post('/:id', (req, res, next) => {
    req.body.characterId = req.characterId;
    logger.info(`Updating scene ${req.params.id} for character ${req.characterId}`);
    sceneController.updateScene(req, res, next);
});

router.delete('/:id', (req, res, next) => {
    logger.info(`Deleting scene ${req.params.id}`);
    sceneController.deleteScene(req, res, next);
});

router.get('/:id/play', (req, res, next) => {
    logger.info(`Playing scene ${req.params.id} for character ${req.characterId}`);
    scenePlayerController.playScene(req, res, next);
});

router.post('/:id/stop', (req, res, next) => {
    logger.info(`Stopping scene ${req.params.id} for character ${req.characterId}`);
    scenePlayerController.stopScene(req, res, next);
});

router.post('/stop-all', (req, res, next) => {
    logger.info(`Stopping all scenes for character ${req.characterId}`);
    scenePlayerController.stopAllScenes(req, res, next);
});

module.exports = router;
