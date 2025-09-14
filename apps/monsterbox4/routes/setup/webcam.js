/**
 * Setup Webcam Routes
 * Routes for webcam configuration interface + Webcam Models CRUD + Device Controls
 */

import express from 'express';
import webcamController from '../../controllers/webcamController.js';
import webcamModelsController from '../../controllers/webcamModelsController.js';

const router = express.Router();

// Setup webcam page
router.get('/', async (req, res) => {
    try {
        res.render('setup/webcam', {
            title: 'Setup Webcam - MonsterBox 4.0',
            page: 'setup-webcam'
        });
    } catch (error) {
        console.error('Error rendering webcam setup page:', error);
        res.status(500).render('error', {
            title: 'Error',
            error: 'Failed to load webcam setup page',
            message: error.message
        });
    }
});

// Webcam device controls (per webcam part)
router.get('/api/parts/:id/controls/list', webcamController.listControls);
router.put('/api/parts/:id/controls/set', express.json(), webcamController.setControls);
// Device discovery
router.get('/api/devices', webcamController.listDevices);
router.get('/api/devices/probe', webcamController.probeDevices);

// Live MJPEG stream
router.get('/api/parts/:id/stream', webcamController.streamMJPEG);
// WebRTC offer/answer (browser offer -> server answer)
router.post('/api/parts/:id/webrtc/offer', express.json(), webcamController.webrtcOffer);
// WebRTC health
router.get('/api/webrtc/health', webcamController.webrtcHealth);

// Webcam Models CRUD
router.get('/api/models', webcamModelsController.getAllModels);
router.get('/api/models/:id', webcamModelsController.getModelById);
router.post('/api/models', express.json(), webcamModelsController.createModel);
router.put('/api/models/:id', express.json(), webcamModelsController.updateModel);
router.delete('/api/models/:id', webcamModelsController.deleteModel);

export default router;
