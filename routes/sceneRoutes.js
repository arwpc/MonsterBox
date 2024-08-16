const express = require('express');
const router = express.Router();
const {
    getScenes,
    getSceneById,
    createScene,
    updateScene,
    deleteScene,
    addStep,
    updateStep,
    deleteStep,
    newScene  // Ensure this is imported
} = require('../controllers/sceneController');

// Scene routes
router.get('/', getScenes);
router.get('/new', newScene);  // Updated to use the newScene method
router.get('/:id/edit', getSceneById);
router.post('/', createScene);
router.post('/:id', updateScene);
router.post('/:id/delete', deleteScene);

// Step routes
router.post('/:id/steps', addStep);
router.post('/:sceneId/steps/:stepId', updateStep);
router.post('/:sceneId/steps/:stepId/delete', deleteStep);

module.exports = router;
