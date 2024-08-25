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
router.post('/:id/execute-step', sceneController.executeStep);
router.post('/:id/execute', sceneController.executeScene);
router.get('/light-parts/:characterId', sceneController.getLightParts);

module.exports = router;
