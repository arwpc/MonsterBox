const express = require('express');
const router = express.Router();
const sceneController = require('../controllers/sceneController');

router.get('/', sceneController.getAllScenes);
router.get('/new', sceneController.newScene);
router.get('/:id/edit', sceneController.getSceneById);
router.post('/', sceneController.createScene);
router.post('/:id', sceneController.updateScene);
router.delete('/:id', sceneController.deleteScene);
router.get('/:id/play', sceneController.playScene);
router.post('/execute-step', sceneController.executeStep);

module.exports = router;
