// File: routes/sceneRoutes.js

const express = require('express');
const router = express.Router();
const sceneController = require('../controllers/sceneController');
const scenePlayerController = require('../controllers/scenePlayerController');
const logger = require('../scripts/logger');

// Middleware to check if a character is selected
const checkCharacterSelected = (req, res, next) => {
    const characterId = req.query.characterId || req.body.character_id;
    if (!characterId) {
        logger.warn('No character selected, redirecting to main page');
        return res.redirect('/');  // Redirect to main page if no character is selected
    }
    req.characterId = characterId;
    logger.debug(`Character selected: ${req.characterId}`);
    next();
};

// Apply the middleware to all routes except the SSE route
router.use((req, res, next) => {
    if (req.path.match(/^\/\d+\/play$/)) {
        return next();
    }
    checkCharacterSelected(req, res, next);
});

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

// Scene templates routes (must come before /:id route)
router.get('/templates', (req, res, next) => {
    logger.info('Getting scene templates');
    sceneController.getSceneTemplates(req, res, next);
});

// Scene import/export routes (must come before /:id route)
router.get('/export', (req, res, next) => {
    logger.info(`Exporting scenes for character ${req.characterId}`);
    sceneController.exportScenes(req, res, next);
});

// Analytics routes (must come before /:id route)
router.get('/analytics', (req, res, next) => {
    logger.info('Getting scene analytics');
    sceneController.getSceneAnalytics(req, res, next);
});

router.get('/popular', (req, res, next) => {
    logger.info('Getting popular scenes');
    sceneController.getPopularScenes(req, res, next);
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
    logger.info(`Creating new scene for character ${req.characterId}`);
    sceneController.createScene(req, res, next);
});

// POST routes that must come before /:id route
router.post('/stop-all', (req, res, next) => {
    logger.info(`Stopping all scenes`);
    scenePlayerController.stopAllScenes(req, res, next);
});

router.post('/import', (req, res, next) => {
    logger.info(`Importing scenes for character ${req.characterId}`);
    sceneController.importScenes(req, res, next);
});

router.post('/from-template', (req, res, next) => {
    logger.info(`Creating scene from template for character ${req.characterId}`);
    sceneController.createSceneFromTemplate(req, res, next);
});

router.post('/:id', (req, res, next) => {
    logger.info(`Updating scene ${req.params.id} for character ${req.characterId}`);
    sceneController.updateScene(req, res, next);
});

router.delete('/:id', (req, res, next) => {
    logger.info(`Deleting scene ${req.params.id}`);
    sceneController.deleteScene(req, res, next);
});

router.get('/:id/play', (req, res, next) => {
    logger.info(`Playing scene ${req.params.id}`);
    scenePlayerController.playScene(req, res, next);
});

router.get('/:id/status', (req, res, next) => {
    logger.info(`Getting status for scene ${req.params.id}`);
    scenePlayerController.getSceneStatus(req, res, next);
});

router.post('/:id/stop', (req, res, next) => {
    logger.info(`Stopping scene ${req.params.id}`);
    scenePlayerController.stopScene(req, res, next);
});

// Scene duplication route
router.post('/:id/duplicate', (req, res, next) => {
    logger.info(`Duplicating scene ${req.params.id}`);
    sceneController.duplicateScene(req, res, next);
});

router.get('/:id/metrics', (req, res, next) => {
    logger.info(`Getting performance metrics for scene ${req.params.id}`);
    sceneController.getScenePerformanceMetrics(req, res, next);
});

module.exports = router;
