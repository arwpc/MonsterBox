const express = require('express');
const router = express.Router();
const partService = require('../services/partService');
const characterService = require('../services/characterService');
const { spawn } = require('child_process');
const path = require('path');
const logger = require('../scripts/logger');
const fs = require('fs');

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

        const newServo = {
            name: req.body.name,
            type: 'servo',
            characterId: parseInt(req.body.characterId, 10),
            pin: parseInt(req.body.pin, 10) || 3,
            usePCA9685: req.body.usePCA9685 === 'on',
            channel: parseInt(req.body.channel, 10) || null,
            servoType: req.body.servoType,
            minPulse: selectedServo ? selectedServo.min_pulse_width_us : parseInt(req.body.minPulse, 10),
            maxPulse: selectedServo ? selectedServo.max_pulse_width_us : parseInt(req.body.maxPulse, 10),
            defaultAngle: selectedServo ? selectedServo.default_angle_deg : parseInt(req.body.defaultAngle, 10),
            mode: selectedServo ? selectedServo.mode : ['Standard'],
            feedback: selectedServo ? selectedServo.feedback : false,
            controlType: selectedServo ? selectedServo.control_type : ['PWM']
        };

        const createdServo = await partService.createPart(newServo);
        logger.info('Created servo:', createdServo);
        res.redirect(`/parts?characterId=${newServo.characterId}`);
    } catch (error) {
        logger.error('Error creating Servo:', error);
        res.status(500).send('An error occurred while creating the Servo: ' + error.message);
    }
});

router.post('/head-track', async (req, res) => {
    try {
        const { command, pcaChannel } = req.body;

        const scriptPath = path.join(__dirname, '..', 'scripts', 'head_track.py');
        const args = [command, pcaChannel.toString()];

        const process = spawn('python3', [scriptPath, ...args]);

        let stdout = '';
        let stderr = '';

        process.stdout.on('data', (data) => {
            stdout += data.toString();
            logger.log(`Python script output: ${data}`);
        });

        process.stderr.on('data', (data) => {
            stderr += data.toString();
            logger.error(`Python script error: ${data}`);
        });

        process.on('close', (code) => {
            logger.log(`Python script exited with code ${code}`);
            if (code === 0) {
                res.json({ success: true, message: 'Head tracking process completed', output: stdout });
            } else {
                res.status(500).json({ success: false, message: 'Head tracking process failed', error: stderr });
            }
        });
    } catch (error) {
        logger.debug('Error executing head tracking script:', error);
        res.status(500).json({ success: false, message: 'An error occurred during head tracking', error: error.message });
    }
});

router.post('/test', async (req, res) => {
    try {
        const { pin, angle, duration, usePCA9685, channel, minPulse, maxPulse } = req.body;

        const scriptPath = path.join(__dirname, '..', 'scripts', 'servo_control.py');

        const args = [
            String(pin),
            String(angle),
            String(duration),
            usePCA9685 ? 'true' : 'false',
            String(channel || ''),
            String(minPulse),
            String(maxPulse)
        ];

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
                res.json({ success: true, message: 'Servo test completed successfully', output: stdout });
            } else {
                res.status(500).json({ success: false, message: 'Servo test failed', error: stderr });
            }
        });
    } catch (error) {
        logger.error('Error testing servo:', error);
        res.status(500).json({ success: false, message: 'An error occurred while testing the servo', error: error.message });
    }
});

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

        const updatedServo = {
            id: id,
            name: req.body.name,
            type: 'servo',
            characterId: parseInt(req.body.characterId, 10),
            pin: parseInt(req.body.pin, 10) || 3,
            usePCA9685: req.body.usePCA9685 === 'on',
            channel: parseInt(req.body.channel, 10) || null,
            servoType: req.body.servoType,
            minPulse: selectedServo ? selectedServo.min_pulse_width_us : parseInt(req.body.minPulse, 10),
            maxPulse: selectedServo ? selectedServo.max_pulse_width_us : parseInt(req.body.maxPulse, 10),
            defaultAngle: selectedServo ? selectedServo.default_angle_deg : parseInt(req.body.defaultAngle, 10),
            mode: selectedServo ? selectedServo.mode : ['Standard'],
            feedback: selectedServo ? selectedServo.feedback : false,
            controlType: selectedServo ? selectedServo.control_type : ['PWM']
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
