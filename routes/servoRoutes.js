const express = require('express');
const router = express.Router();
const partService = require('../services/partService');
const characterService = require('../services/characterService');
const { spawn } = require('child_process');
const path = require('path');
const logger = require('../scripts/logger');
const fs = require('fs');
const { getServoClient } = require('../services/servoWebSocketClient');

// Function to read servo configurations
const getServoConfigs = () => {
    const servoConfigPath = path.join(__dirname, '..', 'data', 'servos.json');
    try {
        if (fs.existsSync(servoConfigPath)) {
            const data = fs.readFileSync(servoConfigPath, 'utf8');
            return JSON.parse(data).servos;
        }
        return [];
    } catch (error) {
        logger.error('Error reading servo configurations:', error);
        return [];
    }
};

router.get('/new', async (req, res) => {
    try {
        const characters = await characterService.getAllCharacters();
        const characterId = req.query.characterId;
        let character = null;
        if (characterId) {
            character = await characterService.getCharacterById(characterId);
        }

        const servoConfigs = getServoConfigs();

        res.render('part-forms/servo', {
            title: 'Create Servo',
            action: '/parts/servo',
            part: {},
            characters,
            character,
            servoConfigs
        });
    } catch (error) {
        logger.error('Error fetching characters:', error);
        res.status(500).send('An error occurred while fetching the characters: ' + error.message);
    }
});

router.get('/:id/edit', async (req, res) => {
    try {
        const id = parseInt(req.params.id, 10);
        logger.debug('Editing Servo with ID:', id, 'Type:', typeof id);
        if (isNaN(id)) {
            throw new Error('Invalid part ID');
        }
        const part = await partService.getPartById(id);
        const characters = await characterService.getAllCharacters();
        const character = await characterService.getCharacterById(part.characterId);
        const servoConfigs = getServoConfigs();

        res.render('part-forms/servo', {
            title: 'Edit Servo',
            action: `/parts/servo/${part.id}`,
            part,
            characters,
            character,
            servoConfigs
        });
    } catch (error) {
        logger.error('Error fetching Servo:', error);
        res.status(500).send('An error occurred while fetching the Servo: ' + error.message);
    }
});

router.post('/', async (req, res) => {
    try {
        const servoConfigs = getServoConfigs();
        const selectedServo = servoConfigs.find(s => s.name === req.body.servoType);
        let customSettings = null;

        try {
            if (req.body.customSettings) {
                customSettings = JSON.parse(req.body.customSettings);
            }
        } catch (error) {
            logger.error('Error parsing custom settings:', error);
        }

        // Build PCA9685 settings if using PCA9685
        let pca9685Settings = null;
        if (req.body.usePCA9685 === 'on') {
            pca9685Settings = {
                frequency: parseInt(req.body.pca9685Frequency, 10) || 50,
                address: req.body.pca9685Address || '0x40'
            };
        }

        const newServo = {
            name: req.body.name,
            type: 'servo',
            characterId: parseInt(req.body.characterId, 10),
            pin: parseInt(req.body.pin, 10) || 3,
            usePCA9685: req.body.usePCA9685 === 'on',
            channel: req.body.channel !== undefined && req.body.channel !== '' ? parseInt(req.body.channel, 10) : null,
            pca9685Settings: pca9685Settings,
            servoType: req.body.servoType,
            minPulse: customSettings ? customSettings.minPulse : (selectedServo ? selectedServo.min_pulse_width_us : parseInt(req.body.minPulse, 10)),
            maxPulse: customSettings ? customSettings.maxPulse : (selectedServo ? selectedServo.max_pulse_width_us : parseInt(req.body.maxPulse, 10)),
            defaultAngle: customSettings ? customSettings.defaultAngle : (selectedServo ? selectedServo.default_angle_deg : parseInt(req.body.defaultAngle, 10)),
            mode: selectedServo ? selectedServo.mode : ['Standard'],
            feedback: selectedServo ? selectedServo.feedback : false,
            controlType: selectedServo ? selectedServo.control_type : ['PWM'],
            customSettings: customSettings
        };

        const createdServo = await partService.createPart(newServo);
        logger.info('Created servo:', createdServo);
        res.redirect(`/parts?characterId=${newServo.characterId}`);
    } catch (error) {
        logger.error('Error creating Servo:', error);
        res.status(500).send('An error occurred while creating the Servo: ' + error.message);
    }
});

router.post('/test', async (req, res) => {
    try {
        const { angle, usePCA9685, channel, pin, servoType, duration, servoId } = req.body;

        logger.debug('Testing servo with params:', { angle, usePCA9685, channel, pin, servoType, duration, servoId });

        // Try WebSocket service first
        try {
            const servoClient = getServoClient();

            if (!servoClient.isConnected) {
                throw new Error('Servo WebSocket not connected');
            }

            if (servoId) {
                // Test existing servo by ID
                const result = await servoClient.testServo(servoId, [angle || 90], duration || 1.0);

                res.json({
                    success: true,
                    message: 'Servo test completed via WebSocket service',
                    output: result,
                    method: 'websocket'
                });
                return;
            } else {
                // For new servo testing, we need to create a temporary configuration
                // This would require extending the WebSocket service to handle temporary servos
                logger.debug('Testing new servo configuration - falling back to legacy method');
            }
        } catch (wsError) {
            logger.warn('WebSocket servo test failed, falling back to legacy method:', wsError.message);
        }

        // Fallback to legacy Python script method
        const controlType = usePCA9685 ? 'pca9685' : 'gpio';
        const scriptPath = path.join(__dirname, '..', 'scripts', 'servo_control.py');
        const pinOrChannel = usePCA9685 ? (channel || '0') : (pin || '3');

        const args = [
            'test',                    // command
            controlType,               // control_type
            pinOrChannel,              // pin_or_channel
            String(angle || '90'),     // angle
            String(duration || '1.0'), // duration
            String(servoType || 'Standard')  // servo_type
        ];

        logger.debug('Executing servo_control.py with args:', args);

        try {
            const process = spawn('python3', [scriptPath, ...args]);
            let stdout = '';
            let stderr = '';

            process.stdout.on('data', (data) => {
                stdout += data.toString();
                logger.debug(`Python script output: ${data}`);
            });

            process.stderr.on('data', (data) => {
                stderr += data.toString();
                logger.error(`Python script error: ${data}`);
            });

            process.on('close', (code) => {
                logger.debug(`Python script exited with code ${code}`);
                if (code === 0) {
                    res.json({
                        success: true,
                        message: 'Servo test completed via legacy script',
                        output: stdout,
                        method: 'legacy'
                    });
                } else {
                    // If Python script fails, simulate the movement
                    logger.debug('Python script failed, simulating servo movement');
                    res.json({
                        success: true,
                        message: 'Servo test simulated',
                        details: {
                            note: 'Hardware control unavailable - servo movement simulated',
                            params: { angle, controlType, channel, pin, servoType, duration }
                        },
                        method: 'simulation'
                    });
                }
            });

            process.on('error', (error) => {
                logger.debug('Python script execution failed, simulating servo movement');
                res.json({
                    success: true,
                    message: 'Servo test simulated',
                    details: {
                        note: 'Hardware control unavailable - servo movement simulated',
                        params: { angle, controlType, channel, pin, servoType, duration }
                    },
                    method: 'simulation'
                });
            });
        } catch (error) {
            logger.debug('Failed to spawn Python process, simulating servo movement');
            res.json({
                success: true,
                message: 'Servo test simulated',
                details: {
                    note: 'Hardware control unavailable - servo movement simulated',
                    params: { angle, controlType, channel, pin, servoType, duration }
                },
                method: 'simulation'
            });
        }
    } catch (error) {
        logger.error('Error testing servo:', error);
        res.status(500).json({
            success: false,
            message: 'An error occurred while testing the servo',
            error: error.message
        });
    }
});

// New WebSocket-based servo control routes (MUST be before /:id route)
router.post('/move', async (req, res) => {
    try {
        const { servoId, angle, duration } = req.body;

        if (!servoId) {
            return res.status(400).json({
                success: false,
                message: 'Servo ID is required'
            });
        }

        const servoClient = getServoClient();

        if (!servoClient.isConnected) {
            return res.status(503).json({
                success: false,
                message: 'Servo WebSocket service not available'
            });
        }

        const result = await servoClient.moveServo(servoId, angle || 90, duration || 0.5);

        res.json({
            success: true,
            message: 'Servo moved successfully',
            result: result
        });

    } catch (error) {
        logger.error('Error moving servo via WebSocket:', error);
        res.status(500).json({
            success: false,
            message: 'Failed to move servo',
            error: error.message
        });
    }
});

router.post('/stop', async (req, res) => {
    try {
        const { servoId } = req.body;

        if (!servoId) {
            return res.status(400).json({
                success: false,
                message: 'Servo ID is required'
            });
        }

        const servoClient = getServoClient();
        const result = await servoClient.stopServo(servoId);

        res.json({
            success: true,
            message: 'Servo stopped successfully',
            result: result
        });

    } catch (error) {
        logger.error('Error stopping servo via WebSocket:', error);
        res.status(500).json({
            success: false,
            message: 'Failed to stop servo',
            error: error.message
        });
    }
});

// Calibration API endpoints
router.post('/move-to-position', async (req, res) => {
    try {
        const { servoId, positionName, duration } = req.body;

        if (!servoId || !positionName) {
            return res.status(400).json({
                success: false,
                message: 'Servo ID and position name are required'
            });
        }

        const servoClient = getServoClient();

        if (!servoClient.isConnected) {
            return res.status(503).json({
                success: false,
                message: 'Servo WebSocket service not available'
            });
        }

        const result = await servoClient.sendMessage({
            type: 'servo_move_to_position',
            servo_id: servoId,
            position_name: positionName,
            duration: duration || 2.0
        });

        res.json({
            success: true,
            message: 'Servo moved to position successfully',
            result: result
        });

    } catch (error) {
        logger.error('Error moving servo to position:', error);
        res.status(500).json({
            success: false,
            message: 'Failed to move servo to position',
            error: error.message
        });
    }
});

router.post('/continuous-control', async (req, res) => {
    try {
        const { servo_id, direction, speed, duration } = req.body;

        if (!servo_id) {
            return res.status(400).json({
                success: false,
                message: 'Servo ID is required'
            });
        }

        const servoClient = getServoClient();

        if (!servoClient.isConnected) {
            return res.status(503).json({
                success: false,
                message: 'Servo WebSocket service not available'
            });
        }

        const result = await servoClient.sendMessage({
            type: 'servo_continuous_control',
            servo_id: servo_id,
            direction: direction,
            speed: speed || 'slow',
            duration: duration || 0
        });

        res.json({
            success: true,
            message: 'Continuous servo control executed',
            result: result
        });

    } catch (error) {
        logger.error('Error controlling continuous servo:', error);
        res.status(500).json({
            success: false,
            message: 'Failed to control continuous servo',
            error: error.message
        });
    }
});

router.post('/extension-control', async (req, res) => {
    try {
        const { servo_id, action, speed, target_position } = req.body;

        if (!servo_id) {
            return res.status(400).json({
                success: false,
                message: 'Servo ID is required'
            });
        }

        const servoClient = getServoClient();

        if (!servoClient.isConnected) {
            return res.status(503).json({
                success: false,
                message: 'Servo WebSocket service not available'
            });
        }

        const result = await servoClient.sendMessage({
            type: 'servo_extension_control',
            servo_id: servo_id,
            action: action,
            speed: speed || 'slow',
            target_position: target_position
        });

        res.json({
            success: true,
            message: 'Extension servo control executed',
            result: result
        });

    } catch (error) {
        logger.error('Error controlling extension servo:', error);
        res.status(500).json({
            success: false,
            message: 'Failed to control extension servo',
            error: error.message
        });
    }
});

router.post('/save-position', async (req, res) => {
    try {
        const { servo_id, position_name, description } = req.body;

        if (!servo_id || !position_name) {
            return res.status(400).json({
                success: false,
                message: 'Servo ID and position name are required'
            });
        }

        const servoClient = getServoClient();

        if (!servoClient.isConnected) {
            return res.status(503).json({
                success: false,
                message: 'Servo WebSocket service not available'
            });
        }

        const result = await servoClient.sendMessage({
            type: 'servo_save_position',
            servo_id: servo_id,
            position_name: position_name,
            description: description || `Position: ${position_name}`
        });

        res.json({
            success: true,
            message: 'Position saved successfully',
            result: result
        });

    } catch (error) {
        logger.error('Error saving servo position:', error);
        res.status(500).json({
            success: false,
            message: 'Failed to save servo position',
            error: error.message
        });
    }
});

router.post('/get-positions', async (req, res) => {
    try {
        const { servo_id } = req.body;

        const servoClient = getServoClient();

        if (!servoClient.isConnected) {
            return res.status(503).json({
                success: false,
                message: 'Servo WebSocket service not available'
            });
        }

        const result = await servoClient.sendMessage({
            type: 'servo_get_positions',
            servo_id: servo_id
        });

        res.json({
            success: true,
            message: 'Positions retrieved successfully',
            saved_positions: result.saved_positions || {},
            calibrated_positions: result.calibrated_positions || {}
        });

    } catch (error) {
        logger.error('Error getting servo positions:', error);
        res.status(500).json({
            success: false,
            message: 'Failed to get servo positions',
            error: error.message
        });
    }
});

router.post('/test-pulse', async (req, res) => {
    try {
        const { servo_id, pulse_width, channel, use_pca9685 } = req.body;

        if (!pulse_width) {
            return res.status(400).json({
                success: false,
                message: 'Pulse width is required'
            });
        }

        const servoClient = getServoClient();

        if (!servoClient.isConnected) {
            return res.status(503).json({
                success: false,
                message: 'Servo WebSocket service not available'
            });
        }

        // If testing a specific channel without a servo ID, create a temporary test
        if (use_pca9685 && channel !== undefined && !servo_id) {
            // Send direct PCA9685 channel test
            const result = await servoClient.sendMessage({
                type: 'test_pca9685_channel',
                channel: parseInt(channel),
                pulse_width: parseInt(pulse_width)
            });

            res.json({
                success: true,
                message: `PCA9685 channel ${channel} test executed`,
                result: result
            });
        } else if (servo_id) {
            // Send direct pulse width test for existing servo
            const result = await servoClient.sendMessage({
                type: 'servo_test_pulse',
                servo_id: servo_id,
                pulse_width: parseInt(pulse_width)
            });

            res.json({
                success: true,
                message: 'Pulse test executed',
                result: result
            });
        } else {
            return res.status(400).json({
                success: false,
                message: 'Either servo_id or (channel + use_pca9685) is required'
            });
        }

    } catch (error) {
        logger.error('Error testing servo pulse:', error);
        res.status(500).json({
            success: false,
            message: 'Failed to test servo pulse',
            error: error.message
        });
    }
});

router.get('/status/:servoId?', async (req, res) => {
    try {
        const { servoId } = req.params;

        const servoClient = getServoClient();
        const result = await servoClient.getServoStatus(servoId || null);

        res.json({
            success: true,
            data: result
        });

    } catch (error) {
        logger.error('Error getting servo status via WebSocket:', error);
        res.status(500).json({
            success: false,
            message: 'Failed to get servo status',
            error: error.message
        });
    }
});

// Update servo route (MUST be after specific routes like /move, /stop)
router.post('/:id', async (req, res) => {
    try {
        logger.debug('Update Servo Route - Request params:', req.params);
        logger.debug('Update Servo Route - Request body:', req.body);

        const id = parseInt(req.params.id, 10);
        logger.debug('Updating Servo with ID:', id, 'Type:', typeof id);
        if (isNaN(id)) {
            throw new Error('Invalid part ID');
        }

        const servoConfigs = getServoConfigs();
        const selectedServo = servoConfigs.find(s => s.name === req.body.servoType);
        let customSettings = null;

        try {
            if (req.body.customSettings) {
                customSettings = JSON.parse(req.body.customSettings);
            }
        } catch (error) {
            logger.error('Error parsing custom settings:', error);
        }

        // Build PCA9685 settings if using PCA9685
        let pca9685Settings = null;
        if (req.body.usePCA9685 === 'on') {
            pca9685Settings = {
                frequency: parseInt(req.body.pca9685Frequency, 10) || 50,
                address: req.body.pca9685Address || '0x40'
            };
        }

        const updatedServo = {
            id: id,
            name: req.body.name,
            type: 'servo',
            characterId: parseInt(req.body.characterId, 10),
            pin: parseInt(req.body.pin, 10) || 3,
            usePCA9685: req.body.usePCA9685 === 'on',
            channel: req.body.channel !== undefined && req.body.channel !== '' ? parseInt(req.body.channel, 10) : null,
            pca9685Settings: pca9685Settings,
            servoType: req.body.servoType,
            minPulse: customSettings ? customSettings.minPulse : (selectedServo ? selectedServo.min_pulse_width_us : parseInt(req.body.minPulse, 10)),
            maxPulse: customSettings ? customSettings.maxPulse : (selectedServo ? selectedServo.max_pulse_width_us : parseInt(req.body.maxPulse, 10)),
            defaultAngle: customSettings ? customSettings.defaultAngle : (selectedServo ? selectedServo.default_angle_deg : parseInt(req.body.defaultAngle, 10)),
            mode: selectedServo ? selectedServo.mode : ['Standard'],
            feedback: selectedServo ? selectedServo.feedback : false,
            controlType: selectedServo ? selectedServo.control_type : ['PWM'],
            customSettings: customSettings
        };

        logger.debug('Updated Servo data:', updatedServo);
        const result = await partService.updatePart(id, updatedServo);
        logger.info('Updated Servo:', result);

        res.redirect(`/parts?characterId=${updatedServo.characterId}`);

    } catch (error) {
        logger.error('Error updating Servo:', error);
        res.status(500).send('An error occurred while updating the Servo: ' + error.message);
    }
});

module.exports = router;
