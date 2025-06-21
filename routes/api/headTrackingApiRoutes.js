const express = require('express');
const router = express.Router();
const fs = require('fs').promises;
const path = require('path');
const WebSocket = require('ws');
const logger = require('../../scripts/logger');

// Head tracking data file path
const HEAD_TRACKING_DATA_FILE = path.join(__dirname, '..', '..', 'data', 'head_tracking.json');

// WebSocket connection to head tracking service
let headTrackingWS = null;

/**
 * Initialize WebSocket connection to head tracking service
 */
function initializeWebSocketConnection() {
    if (headTrackingWS && headTrackingWS.readyState === WebSocket.OPEN) {
        return;
    }

    try {
        headTrackingWS = new WebSocket('ws://localhost:8776');

        headTrackingWS.on('open', () => {
            logger.info('🎯 Connected to head tracking WebSocket service');
        });

        headTrackingWS.on('error', (error) => {
            logger.error('Head tracking WebSocket error:', error);
            headTrackingWS = null;
        });

        headTrackingWS.on('close', () => {
            logger.info('Head tracking WebSocket connection closed');
            headTrackingWS = null;

            // Reconnect after 5 seconds
            setTimeout(initializeWebSocketConnection, 5000);
        });

    } catch (error) {
        logger.error('Failed to connect to head tracking service:', error);
        headTrackingWS = null;
    }
}

/**
 * Send message to head tracking service
 */
async function sendToHeadTrackingService(message) {
    return new Promise((resolve, reject) => {
        if (!headTrackingWS || headTrackingWS.readyState !== WebSocket.OPEN) {
            initializeWebSocketConnection();
            return reject(new Error('Head tracking service not available'));
        }

        const messageId = Date.now().toString();
        message.message_id = messageId;

        // Set up response handler
        const responseHandler = (data) => {
            try {
                const response = JSON.parse(data);
                if (response.message_id === messageId || response.type === message.type + '_response') {
                    headTrackingWS.removeListener('message', responseHandler);
                    resolve(response);
                }
            } catch (error) {
                // Ignore parsing errors for other messages
            }
        };

        headTrackingWS.on('message', responseHandler);

        // Send message
        headTrackingWS.send(JSON.stringify(message));

        // Timeout after 10 seconds
        setTimeout(() => {
            headTrackingWS.removeListener('message', responseHandler);
            reject(new Error('Head tracking service timeout'));
        }, 10000);
    });
}

/**
 * Load head tracking configurations from file
 */
async function loadHeadTrackingData() {
    try {
        const data = await fs.readFile(HEAD_TRACKING_DATA_FILE, 'utf8');
        return JSON.parse(data);
    } catch (error) {
        if (error.code === 'ENOENT') {
            return [];
        }
        throw error;
    }
}

// Initialize WebSocket connection on startup
initializeWebSocketConnection();

// GET /api/hardware/head-tracking/status - Get service status
router.get('/status', async (req, res) => {
    try {
        const serviceStatus = {
            service_available: headTrackingWS && headTrackingWS.readyState === WebSocket.OPEN,
            service_url: 'ws://localhost:8776',
            last_check: new Date().toISOString()
        };

        if (serviceStatus.service_available) {
            try {
                const response = await sendToHeadTrackingService({
                    type: 'get_tracking_status'
                });
                serviceStatus.tracking_status = response.status || {};
            } catch (error) {
                logger.warn('Failed to get tracking status from service:', error);
                serviceStatus.service_available = false;
            }
        }

        res.json({
            success: true,
            status: serviceStatus
        });

    } catch (error) {
        logger.error('Error getting head tracking status:', error);
        res.status(500).json({
            success: false,
            error: 'Failed to get head tracking status'
        });
    }
});

// GET /api/hardware/head-tracking/configurations - Get all configurations
router.get('/configurations', async (req, res) => {
    try {
        const configurations = await loadHeadTrackingData();
        const characterId = req.query.characterId;

        let filteredConfigs = configurations;
        if (characterId) {
            filteredConfigs = configurations.filter(config =>
                config.characterId === parseInt(characterId)
            );
        }

        res.json({
            success: true,
            configurations: filteredConfigs
        });

    } catch (error) {
        logger.error('Error getting head tracking configurations:', error);
        res.status(500).json({
            success: false,
            error: 'Failed to get configurations'
        });
    }
});

// GET /api/hardware/head-tracking/configurations/:id - Get specific configuration
router.get('/configurations/:id', async (req, res) => {
    try {
        const configurations = await loadHeadTrackingData();
        const config = configurations.find(c => c.id === req.params.id);

        if (!config) {
            return res.status(404).json({
                success: false,
                error: 'Configuration not found'
            });
        }

        res.json({
            success: true,
            configuration: config
        });

    } catch (error) {
        logger.error('Error getting head tracking configuration:', error);
        res.status(500).json({
            success: false,
            error: 'Failed to get configuration'
        });
    }
});

// POST /api/hardware/head-tracking/start - Start head tracking
router.post('/start', async (req, res) => {
    try {
        const { character_id, config } = req.body;

        if (!character_id) {
            return res.status(400).json({
                success: false,
                error: 'character_id is required'
            });
        }

        // Configure tracking if config provided
        if (config) {
            await sendToHeadTrackingService({
                type: 'configure_tracking',
                character_id: character_id,
                config: config
            });
        }

        // Start tracking
        const response = await sendToHeadTrackingService({
            type: 'start_tracking',
            character_id: character_id
        });

        res.json({
            success: true,
            message: 'Head tracking started',
            response: response
        });

    } catch (error) {
        logger.error('Error starting head tracking:', error);
        res.status(500).json({
            success: false,
            error: 'Failed to start head tracking'
        });
    }
});

// POST /api/hardware/head-tracking/stop - Stop head tracking
router.post('/stop', async (req, res) => {
    try {
        const { character_id } = req.body;

        if (!character_id) {
            return res.status(400).json({
                success: false,
                error: 'character_id is required'
            });
        }

        const response = await sendToHeadTrackingService({
            type: 'stop_tracking',
            character_id: character_id
        });

        res.json({
            success: true,
            message: 'Head tracking stopped',
            response: response
        });

    } catch (error) {
        logger.error('Error stopping head tracking:', error);
        res.status(500).json({
            success: false,
            error: 'Failed to stop head tracking'
        });
    }
});

// POST /api/hardware/head-tracking/configure - Configure head tracking
router.post('/configure', async (req, res) => {
    try {
        const { character_id, config } = req.body;

        if (!character_id || !config) {
            return res.status(400).json({
                success: false,
                error: 'character_id and config are required'
            });
        }

        const response = await sendToHeadTrackingService({
            type: 'configure_tracking',
            character_id: character_id,
            config: config
        });

        res.json({
            success: true,
            message: 'Head tracking configured',
            response: response
        });

    } catch (error) {
        logger.error('Error configuring head tracking:', error);
        res.status(500).json({
            success: false,
            error: 'Failed to configure head tracking'
        });
    }
});

// POST /api/hardware/head-tracking/test-servo - Test servo movement
router.post('/test-servo', async (req, res) => {
    try {
        const { character_id, servo_id, angle } = req.body;

        if (!character_id || !servo_id || angle === undefined) {
            return res.status(400).json({
                success: false,
                error: 'character_id, servo_id, and angle are required'
            });
        }

        const response = await sendToHeadTrackingService({
            type: 'test_servo',
            character_id: character_id,
            servo_id: servo_id,
            angle: parseFloat(angle)
        });

        res.json({
            success: true,
            message: 'Servo test completed',
            response: response
        });

    } catch (error) {
        logger.error('Error testing servo:', error);
        res.status(500).json({
            success: false,
            error: 'Failed to test servo'
        });
    }
});

// POST /api/hardware/head-tracking/calibrate - Calibrate head tracking
router.post('/calibrate', async (req, res) => {
    try {
        const { character_id } = req.body;

        if (!character_id) {
            return res.status(400).json({
                success: false,
                error: 'character_id is required'
            });
        }

        const response = await sendToHeadTrackingService({
            type: 'calibrate_tracking',
            character_id: character_id
        });

        res.json({
            success: true,
            message: 'Head tracking calibrated',
            response: response
        });

    } catch (error) {
        logger.error('Error calibrating head tracking:', error);
        res.status(500).json({
            success: false,
            error: 'Failed to calibrate head tracking'
        });
    }
});

// GET /api/hardware/head-tracking/tracking-status/:characterId - Get tracking status for character
router.get('/tracking-status/:characterId', async (req, res) => {
    try {
        const characterId = req.params.characterId;

        const response = await sendToHeadTrackingService({
            type: 'get_tracking_status',
            character_id: characterId
        });

        res.json({
            success: true,
            status: response.status || {},
            character_id: characterId
        });

    } catch (error) {
        logger.error('Error getting tracking status:', error);
        res.status(500).json({
            success: false,
            error: 'Failed to get tracking status'
        });
    }
});

module.exports = router;
