// File: routes/sceneRoutes.js

const express = require('express');
const router = express.Router();
const sceneController = require('../controllers/sceneController');
const scenePlayerController = require('../controllers/scenePlayerController');

// Middleware to check if a character is selected
const checkCharacterSelected = (req, res, next) => {
    if (!req.query.characterId) {
        return res.redirect('/');  // Redirect to main page if no character is selected
    }
    req.characterId = req.query.characterId;
    next();
};

// Apply the middleware to all routes
router.use(checkCharacterSelected);

router.get('/', (req, res, next) => {
    sceneController.getAllScenes(req, res, next, req.characterId);
});

router.get('/new', (req, res, next) => {
    sceneController.newScene(req, res, next, req.characterId);
});

router.get('/step-template', (req, res, next) => {
    sceneController.getStepTemplate(req, res, next, req.characterId);
});

router.get('/:id', (req, res, next) => {
    scenePlayerController.getScenePlayer(req, res, next, req.characterId);
});

router.get('/:id/edit', (req, res, next) => {
    sceneController.getSceneById(req, res, next, req.characterId);
});

router.post('/', (req, res, next) => {
    req.body.characterId = req.characterId;
    sceneController.createScene(req, res, next);
});

router.post('/:id', (req, res, next) => {
    req.body.characterId = req.characterId;
    sceneController.updateScene(req, res, next);
});

router.delete('/:id', sceneController.deleteScene);

router.get('/:id/play', (req, res, next) => {
    scenePlayerController.playScene(req, res, next, req.characterId);
});

router.post('/:id/stop', scenePlayerController.stopScene);

router.post('/stop-all', scenePlayerController.stopAllScenes);

module.exports = router;
