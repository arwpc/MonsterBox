const express = require('express');
const router = express.Router();
const jawAnimationController = require('../controllers/jawAnimationController');

// Jaw Animation Test Page
router.get('/test', jawAnimationController.getTestPage);

// API Routes
router.get('/api/servo/:characterId', jawAnimationController.getServoConfig);
router.post('/api/servo/:characterId/test', jawAnimationController.testServo);
router.post('/api/servo/:characterId/angle', jawAnimationController.setServoAngle);
router.post('/api/animation/:characterId/start', jawAnimationController.startAnimation);
router.post('/api/animation/:characterId/stop', jawAnimationController.stopAnimation);
router.get('/api/animation/:characterId/status', jawAnimationController.getAnimationStatus);

module.exports = router;
