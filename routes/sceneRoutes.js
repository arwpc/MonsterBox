const express = require('express');
const router = express.Router();
const sceneController = require('../controllers/sceneController');

router.get('/', sceneController.getAllScenes);
router.get('/new', sceneController.newScene);
router.get('/:id', sceneController.getSceneById);
router.get('/:id/edit', sceneController.getSceneById); // Using getSceneById for edit as well
router.post('/', sceneController.createScene);
router.post('/:id', sceneController.updateScene);
router.delete('/:id', sceneController.deleteScene);
router.get('/:id/play', sceneController.playScene);
router.post('/:id/execute-step', sceneController.executeStep);
router.post('/:id/execute', sceneController.executeScene);

module.exports = router;