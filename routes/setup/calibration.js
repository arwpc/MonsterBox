/**
 * Setup Calibration Routes
 * Routes for calibration interface (servos, linear actuators, etc.)
 */

import express from 'express';
import { loadParts } from '../../controllers/partsController.js';
import * as actuatorService from '../../services/hardwareService/actuator.js';
import * as linearActuatorCalibration from '../../services/linearActuatorCalibrationService.js';

const router = express.Router();

// Setup calibration main page
router.get('/', async (req, res) => {
    try {
        res.render('setup/calibration', {
            title: 'Setup Calibration - MonsterBox 4.0',
            page: 'setup-calibration',
            config: { theme: 'dark' },
            currentCharacter: null
        });
    } catch (error) {
        console.error('Error rendering calibration setup page:', error);
        res.status(500).render('error', {
            title: 'Error',
            page: 'error',
            config: { theme: 'dark' },
            currentCharacter: null,
            error: 'Failed to load calibration setup page',
            message: error.message
        });
    }
});

// Linear actuator calibration page
router.get('/linear_actuator/:id', async (req, res) => {
    try {
        const partId = req.params.id;
        const parts = await loadParts();
        const part = parts.find(p => String(p.id) === String(partId));

        if (!part) {
            return res.status(404).render('error', {
                title: 'Part Not Found',
                page: 'error',
                config: { theme: 'dark' },
                currentCharacter: null,
                error: 'Linear actuator not found',
                message: `No linear actuator found with ID: ${partId}`
            });
        }

        if (part.type !== 'linear_actuator') {
            return res.status(400).render('error', {
                title: 'Invalid Part Type',
                page: 'error',
                config: { theme: 'dark' },
                currentCharacter: null,
                error: 'Invalid part type',
                message: `Part ${partId} is not a linear actuator`
            });
        }

        const calibrationStatus = await linearActuatorCalibration.getCalibrationStatus(partId);

        res.render('setup/calibration-linear-actuator', {
            title: `Calibrate ${part.name} - MonsterBox 4.0`,
            page: 'setup-calibration-linear-actuator',
            config: { theme: 'dark' },
            currentCharacter: null,
            part: part,
            calibrationStatus: calibrationStatus
        });
    } catch (error) {
        console.error('Error rendering linear actuator calibration page:', error);
        res.status(500).render('error', {
            title: 'Error',
            page: 'error',
            config: { theme: 'dark' },
            currentCharacter: null,
            error: 'Failed to load calibration page',
            message: error.message
        });
    }
});

// API Routes for Linear Actuator Calibration

// Jog linear actuator (extend/retract)
router.post('/api/linear_actuator/:id/jog', express.json(), async (req, res) => {
    try {
        const partId = req.params.id;
        const { direction, speed = 50, duration = 500 } = req.body;

        if (!['extend', 'retract'].includes(direction)) {
            return res.status(400).json({
                success: false,
                error: 'Invalid direction. Must be "extend" or "retract"'
            });
        }

        const parts = await loadParts();
        const part = parts.find(p => String(p.id) === String(partId));

        if (!part || part.type !== 'linear_actuator') {
            return res.status(404).json({
                success: false,
                error: 'Linear actuator not found'
            });
        }

        // Execute jog command
        const result = await actuatorService.controlActuator({
            directionPin: part.directionPin,
            pwmPin: part.pwmPin,
            direction: direction,
            speed: speed,
            duration: duration,
            maxExtension: part.maxExtension || 15000,
            maxRetraction: part.maxRetraction || 15000
        });

        res.json({
            success: true,
            message: `Linear actuator ${direction}ed for ${duration}ms at ${speed}% speed`,
            result: result
        });

    } catch (error) {
        console.error('Error jogging linear actuator:', error);
        res.status(500).json({
            success: false,
            error: 'Failed to jog linear actuator',
            message: error.message
        });
    }
});

// Stop linear actuator
router.post('/api/linear_actuator/:id/stop', express.json(), async (req, res) => {
    try {
        const partId = req.params.id;
        const parts = await loadParts();
        const part = parts.find(p => String(p.id) === String(partId));

        if (!part || part.type !== 'linear_actuator') {
            return res.status(404).json({
                success: false,
                error: 'Linear actuator not found'
            });
        }

        // Execute stop command
        const result = await actuatorService.stopActuator({
            directionPin: part.directionPin,
            pwmPin: part.pwmPin
        });

        res.json({
            success: true,
            message: 'Linear actuator stopped',
            result: result
        });

    } catch (error) {
        console.error('Error stopping linear actuator:', error);
        res.status(500).json({
            success: false,
            error: 'Failed to stop linear actuator',
            message: error.message
        });
    }
});

// Save calibration position
router.post('/api/linear_actuator/:id/save-position', express.json(), async (req, res) => {
    try {
        const partId = req.params.id;
        const { position, description } = req.body;

        if (!['min', 'max'].includes(position)) {
            return res.status(400).json({
                success: false,
                error: 'Invalid position. Must be "min" or "max"'
            });
        }

        const parts = await loadParts();
        const part = parts.find(p => String(p.id) === String(partId));

        if (!part || part.type !== 'linear_actuator') {
            return res.status(404).json({
                success: false,
                error: 'Linear actuator not found'
            });
        }

        // Save the position
        const calibrationData = await linearActuatorCalibration.savePosition(
            partId,
            part.name,
            position,
            description
        );

        res.json({
            success: true,
            message: `${position.charAt(0).toUpperCase() + position.slice(1)} position saved successfully`,
            calibrationData: calibrationData
        });

    } catch (error) {
        console.error('Error saving calibration position:', error);
        res.status(500).json({
            success: false,
            error: 'Failed to save calibration position',
            message: error.message
        });
    }
});

// Get calibration status
router.get('/api/linear_actuator/:id/status', async (req, res) => {
    try {
        const partId = req.params.id;
        const status = await linearActuatorCalibration.getCalibrationStatus(partId);

        res.json({
            success: true,
            status: status
        });

    } catch (error) {
        console.error('Error getting calibration status:', error);
        res.status(500).json({
            success: false,
            error: 'Failed to get calibration status',
            message: error.message
        });
    }
});

// Reset calibration
router.post('/api/linear_actuator/:id/reset', express.json(), async (req, res) => {
    try {
        const partId = req.params.id;
        const success = await linearActuatorCalibration.resetCalibration(partId);

        if (success) {
            res.json({
                success: true,
                message: 'Calibration reset successfully'
            });
        } else {
            res.json({
                success: false,
                message: 'No calibration data found to reset'
            });
        }

    } catch (error) {
        console.error('Error resetting calibration:', error);
        res.status(500).json({
            success: false,
            error: 'Failed to reset calibration',
            message: error.message
        });
    }
});

export default router;
