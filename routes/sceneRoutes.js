// File: routes/sceneRoutes.js

const express = require('express');
const router = express.Router();
const sceneController = require('../controllers/sceneController');
const scenePlayerController = require('../controllers/scenePlayerController');

router.get('/', sceneController.getAllScenes);
router.get('/new', sceneController.newScene);
router.get('/:id', scenePlayerController.getScenePlayer);
router.get('/:id/edit', sceneController.getSceneById);
router.post('/', sceneController.createScene);
router.post('/:id', sceneController.updateScene);
router.delete('/:id', sceneController.deleteScene);
router.get('/:id/play', scenePlayerController.playScene);
router.post('/:id/stop', scenePlayerController.stopScene);
router.post('/stop-all', scenePlayerController.stopAllScenes);

module.exports = router;