/**
 * Setup Webcam Routes
 * Routes for webcam configuration interface + Webcam Models CRUD + Device Controls
 */

import express from 'express';
import * as motionTrackingController from '../../controllers/motionTrackingController.js';
import webcamController from '../../controllers/webcamController.js';
import webcamModelsController from '../../controllers/webcamModelsController.js';

const router = express.Router();

// Setup webcam page
router.get('/', async (req, res) => {
    try {
        res.renderWithLayout('setup/webcam', {
            title: 'Setup Webcam - MonsterBox',
            page: 'setup-webcam'
        });
    } catch (error) {
        console.error('Error rendering webcam setup page:', error);
        res.status(500).renderWithLayout('error', {
            title: 'Error',
            page: 'error',
            error: 'Failed to load webcam setup page',
            message: error.message
        });
    }
});

router.get('/api/health', webcamController.getHealthStatus);

// Webcam device controls (per webcam part)
router.get('/api/parts/:id/controls/list', webcamController.listControls);
router.put('/api/parts/:id/controls/set', express.json(), webcamController.setControls);
// Device discovery
router.get('/api/devices', webcamController.listDevices);
router.get('/api/devices/probe', webcamController.probeDevices);
router.get('/api/devices/inuse', webcamController.devicesInUse);

// Apply selected webcam device to mjpg-streamer service
router.post('/api/parts/:id/apply-device', express.json(), webcamController.applyDeviceToService);

// Live MJPEG stream
router.get('/api/parts/:id/stream', webcamController.streamMJPEG);

// Webcam Models CRUD
router.get('/api/models', webcamModelsController.getAllModels);
router.get('/api/models/:id', webcamModelsController.getModelById);
router.post('/api/models', express.json(), webcamModelsController.createModel);
router.put('/api/models/:id', express.json(), webcamModelsController.updateModel);
router.delete('/api/models/:id', webcamModelsController.deleteModel);

// Motion Tracking API
router.post('/api/motion-tracking/start', express.json(), motionTrackingController.startMotionTracking);
router.post('/api/motion-tracking/stop', express.json(), motionTrackingController.stopMotionTracking);
router.post('/api/motion-tracking/params', express.json(), motionTrackingController.updateMotionTrackingParams);
router.get('/api/motion-tracking/status', motionTrackingController.getMotionTrackingStatus);
router.get('/api/motion-tracking/head-tracking-requirements', motionTrackingController.checkHeadTrackingRequirements);
// Head Tracking API
router.post('/api/motion-tracking/head-tracking/enable', express.json(), motionTrackingController.enableHeadTracking);
router.post('/api/motion-tracking/head-tracking/disable', express.json(), motionTrackingController.disableHeadTracking);
router.get('/api/motion-tracking/head-tracking/status', motionTrackingController.getHeadTrackingStatus);


export default router;
