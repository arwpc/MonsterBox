const express = require('express');
const router = express.Router();
const {
    getScenes,
    getSceneById,
    createScene,
    updateScene,
    deleteScene,
    newScene,
    addStep,
    updateStep,
    deleteStep
} = require('../controllers/sceneController');

router.get('/', getScenes);
router.get('/new', newScene);
router.get('/:id/edit', getSceneById);
router.post('/', createScene);
router.post('/:id', updateScene);
router.post('/:id/delete', deleteScene);
router.post('/:id/steps', addStep);
router.put('/:sceneId/steps/:stepIndex', updateStep);
router.delete('/:sceneId/steps/:stepIndex', deleteStep);

module.exports = router;
