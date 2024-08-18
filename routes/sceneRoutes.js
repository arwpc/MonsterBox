const express = require('express');
const router = express.Router();
const sceneController = require('../controllers/sceneController');

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

module.exports = router;
