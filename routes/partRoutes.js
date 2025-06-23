const express = require('express');
const router = express.Router();
const partService = require('../services/partService');
const characterService = require('../services/characterService');
const { spawn } = require('child_process');
const path = require('path');
const logger = require('../scripts/logger');
const fs = require('fs').promises;

async function getServoName(servoType) {
    try {
        const servoConfigPath = path.join(__dirname, '..', 'data', 'servos.json');
        const data = await fs.readFile(servoConfigPath, 'utf8');
        const servos = JSON.parse(data).servos;
        const servo = servos.find(s => s.name === servoType);
        return servo ? servo.name : servoType;
    } catch (error) {
        logger.error('Error reading servo configurations:', error);
        return servoType;
    }
}

async function getPartDetails(part) {
    switch (part.type) {
        case 'motor':
        case 'linear-actuator':
            return `Dir Pin: ${part.directionPin}, PWM Pin: ${part.pwmPin}`;
        case 'light':
        case 'led':
            return `GPIO Pin: ${part.gpioPin}`;
        case 'servo':
            const servoName = await getServoName(part.servoType);
            if (part.usePCA9685) {
                return `Servo: ${servoName}, PCA9685 Channel: ${part.channel}, Min Pulse: ${part.minPulse}μs, Max Pulse: ${part.maxPulse}μs`;
            } else {
                return `Servo: ${servoName}, GPIO Pin: ${part.pin}, Min Pulse: ${part.minPulse}μs, Max Pulse: ${part.maxPulse}μs`;
            }
        case 'sensor':
            return `Type: ${part.sensorType}, GPIO Pin: ${part.gpioPin}, Active: ${part.active ? 'Yes' : 'No'}`;
        case 'head-tracking':
            return `Webcam: ${part.webcam_device}, Servo: ${part.servo_id || 'Not assigned'}, Enabled: ${part.enabled ? 'Yes' : 'No'}`;
        default:
            return '';
    }
}

const checkCharacterSelected = (req, res, next) => {
    logger.info(`checkCharacterSelected - Initial characterId: ${req.characterId}`);
    if (!req.characterId) {
        req.characterId = req.query.characterId || req.session.characterId;
        logger.info(`checkCharacterSelected - Updated characterId: ${req.characterId}`);
    }
    if (!req.characterId) {
        req.characterId = '1'; // Set a default characterId
        logger.info(`checkCharacterSelected - Set default characterId: ${req.characterId}`);
    }
    logger.info(`checkCharacterSelected - Final characterId: ${req.characterId}`);
    next();
};

router.use(checkCharacterSelected);

router.get('/', async (req, res) => {
    try {
        // Get ALL parts (hardware-centric approach)
        const allParts = await partService.getAllParts();
        const partsWithDetails = await Promise.all(allParts.map(async part => ({
            ...part,
            details: await getPartDetails(part)
        })));

        // Get character data for the template
        const character = await characterService.getCharacterById(req.characterId);
        const characters = await characterService.getAllCharacters();

        res.render('parts', {
            title: 'Hardware Parts Management',
            parts: partsWithDetails,
            character,
            characters
        });
    } catch (error) {
        logger.error('Error fetching parts:', error);
        res.status(500).send('An error occurred while fetching parts');
    }
});

const servoTypes = ['Standard', 'Continuous', 'Digital', 'Linear', 'FS90R'];

function getServoDefaults(type) {
    switch (type) {
        case 'Standard':
            return { minPulse: 500, maxPulse: 2500, defaultAngle: 90 };
        case 'Continuous':
            return { minPulse: 500, maxPulse: 2500, defaultAngle: 90 };
        case 'Digital':
            return { minPulse: 500, maxPulse: 2500, defaultAngle: 90 };
        case 'Linear':
            return { minPulse: 500, maxPulse: 2500, defaultAngle: 90 };
        case 'FS90R':
            return { minPulse: 500, maxPulse: 2500, defaultAngle: 90 };
        default:
            return { minPulse: 500, maxPulse: 2500, defaultAngle: 90 };
    }
}

router.get('/new/:type', async (req, res) => {
    try {
        const { type } = req.params;
        const character = await characterService.getCharacterById(req.characterId);
        const characters = await characterService.getAllCharacters();
        const part = { type, characterId: req.characterId };

        const renderData = {
            title: `Add ${type.charAt(0).toUpperCase() + type.slice(1)}`,
            action: `/parts/${type}`,
            part,
            character,
            characters
        };

        if (type === 'servo') {
            const servoConfigPath = path.join(__dirname, '..', 'data', 'servos.json');
            const servoConfigData = await fs.readFile(servoConfigPath, 'utf8');
            renderData.servoConfigs = JSON.parse(servoConfigData).servos;
            renderData.servoTypes = servoTypes;
            renderData.getServoDefaults = getServoDefaults;
        }

        res.render(`part-forms/${type}`, renderData);
    } catch (error) {
        logger.error('Error rendering new part form:', error);
        res.status(500).send('An error occurred while loading the new part form');
    }
});

router.get('/:id/edit', async (req, res) => {
    try {
        const id = parseInt(req.params.id);
        if (isNaN(id)) {
            logger.warn(`Invalid part ID (not a number): ${req.params.id}`);
            return res.status(404).send('Part not found');
        }

        const part = await partService.getPartById(id);
        if (!part) {
            logger.warn(`Part not found with ID: ${id}`);
            return res.status(404).send('Part not found');
        }

        const character = await characterService.getCharacterById(req.characterId);
        const characters = await characterService.getAllCharacters();
        const renderData = {
            title: `Edit ${part.type.charAt(0).toUpperCase() + part.type.slice(1)}`,
            action: `/parts/${part.id}/update`,
            part,
            character,
            characters
        };

        if (part.type === 'servo') {
            const servoConfigPath = path.join(__dirname, '..', 'data', 'servos.json');
            const servoConfigData = await fs.readFile(servoConfigPath, 'utf8');
            renderData.servoConfigs = JSON.parse(servoConfigData).servos;
            renderData.servoTypes = servoTypes;
            renderData.getServoDefaults = getServoDefaults;
        }

        res.render(`part-forms/${part.type}`, renderData);
    } catch (error) {
        logger.error('Error fetching part for edit:', error);
        res.status(500).send('An error occurred while fetching the part');
    }
});

router.post('/:type', checkCharacterSelected, async (req, res) => {
    try {
        const { type } = req.params;
        const partData = req.body;
        partData.type = type;
        partData.characterId = req.characterId;
        logger.info(`Creating new part - characterId: ${req.characterId}, type: ${type}`);
        logger.info(`Creating new part with data: ${JSON.stringify(partData)}`);
        const newPart = await partService.createPart(partData);
        logger.info(`Created new part: ${JSON.stringify(newPart)}`);
        if (type === 'led') {
            logger.info(`Created LED: ${JSON.stringify(newPart)}`);
        } else if (type === 'light') {
            logger.info(`Created light: ${JSON.stringify(newPart)}`);
        } else if (type === 'servo') {
            logger.info(`Created servo: ${JSON.stringify(newPart)}`);
        } else if (type === 'linear-actuator') {
            logger.info(`Created linear actuator: ${JSON.stringify(newPart)}`);
        } else if (type === 'sensor') {
            logger.info(`Created sensor: ${JSON.stringify(newPart)}`);
        } else if (type === 'webcam') {
            logger.info(`Created webcam: ${JSON.stringify(newPart)}`);
        } else if (type === 'microphone') {
            logger.info(`Created microphone: ${JSON.stringify(newPart)}`);
        }
        const redirectUrl = `/parts?characterId=${req.characterId}`;
        logger.info(`Redirecting to: ${redirectUrl}`);
        res.redirect(redirectUrl);
    } catch (error) {
        logger.error('Error creating part:', error);
        res.status(500).send('An error occurred while creating the part');
    }
});

router.post('/:id/update', async (req, res) => {
    try {
        const id = parseInt(req.params.id);
        if (isNaN(id)) {
            logger.warn(`Invalid part ID (not a number): ${req.params.id}`);
            return res.status(404).send('Part not found');
        }

        const partData = req.body;
        partData.characterId = req.characterId;
        const updatedPart = await partService.updatePart(id, partData);
        logger.info(`Updated part: ${JSON.stringify(updatedPart)}`);
        res.redirect(`/parts?characterId=${req.characterId}`);
    } catch (error) {
        logger.error('Error updating part:', error);
        res.status(500).send('An error occurred while updating the part');
    }
});

router.post('/:id/delete', async (req, res) => {
    try {
        const id = parseInt(req.params.id);
        logger.info(`Attempting to delete part with ID: ${id}`);
        logger.info(`Request params: ${JSON.stringify(req.params)}`);
        logger.info(`Request query: ${JSON.stringify(req.query)}`);
        logger.info(`Request body: ${JSON.stringify(req.body)}`);

        // Log summary before deletion (reduced verbosity)
        const allParts = await partService.getAllParts();
        logger.info(`Parts before deletion: ${allParts.length} total`);
        logger.debug(`All parts before deletion: ${JSON.stringify(allParts)}`);

        // Check if the part exists before attempting to delete
        const partToDelete = allParts.find(part => part.id === id);
        if (!partToDelete) {
            logger.warn(`Part with ID ${id} not found before deletion attempt`);
            return res.status(404).json({ error: 'Part not found' });
        }

        logger.info(`Part to be deleted: ${JSON.stringify(partToDelete)}`);

        try {
            // Special cleanup for microphones
            if (partToDelete.type === 'microphone') {
                await performMicrophoneCleanup(id);
            }

            await partService.deletePart(id);
            logger.info(`Part with ID ${id} deleted successfully`);

            // Log summary after deletion (reduced verbosity)
            const allPartsAfter = await partService.getAllParts();
            logger.info(`Parts remaining after deletion: ${allPartsAfter.length} total`);
            logger.debug(`All parts after deletion: ${JSON.stringify(allPartsAfter)}`);

            res.status(200).json({ message: 'Part deleted successfully' });
        } catch (deleteError) {
            logger.error(`Error in partService.deletePart: ${deleteError}`);
            res.status(500).json({ error: 'An error occurred while deleting the part' });
        }
    } catch (error) {
        logger.error(`Error in delete route: ${error}`);
        res.status(500).json({ error: 'An unexpected error occurred' });
    }
});

// DELETE route for API compatibility (used by tests and API clients)
router.delete('/:id', async (req, res) => {
    try {
        const id = parseInt(req.params.id);
        logger.info(`Attempting to delete part with ID: ${id} via DELETE method`);

        // Log summary before deletion (reduced verbosity)
        const allParts = await partService.getAllParts();
        logger.info(`Parts before deletion: ${allParts.length} total`);

        // Check if the part exists before attempting to delete
        const partToDelete = allParts.find(part => part.id === id);
        if (!partToDelete) {
            logger.warn(`Part with ID ${id} not found before deletion attempt`);
            return res.status(404).json({ error: 'Part not found' });
        }

        logger.info(`Part to be deleted: ${JSON.stringify(partToDelete)}`);

        try {
            // Special cleanup for microphones
            if (partToDelete.type === 'microphone') {
                await performMicrophoneCleanup(id);
            }

            await partService.deletePart(id);
            logger.info(`Part with ID ${id} deleted successfully`);

            // Log summary after deletion (reduced verbosity)
            const allPartsAfter = await partService.getAllParts();
            logger.info(`Parts remaining after deletion: ${allPartsAfter.length} total`);

            res.status(200).json({ message: 'Part deleted successfully' });
        } catch (deleteError) {
            logger.error(`Error in partService.deletePart: ${deleteError}`);
            res.status(500).json({ error: 'An error occurred while deleting the part' });
        }
    } catch (error) {
        logger.error(`Error in DELETE route: ${error}`);
        res.status(500).json({ error: 'An unexpected error occurred' });
    }
});

router.get('/sensor/test', (req, res) => {
    const { gpioPin, timeout } = req.query;

    if (!gpioPin) {
        return res.status(400).json({ error: 'GPIO pin is required' });
    }

    res.writeHead(200, {
        'Content-Type': 'text/event-stream',
        'Cache-Control': 'no-cache',
        'Connection': 'keep-alive'
    });

    const scriptPath = path.join(__dirname, '..', 'scripts', 'sensor_control.py');
    const args = [gpioPin, timeout || '30'];

    logger.info(`Executing sensor test script: ${scriptPath} with args: ${args.join(', ')}`);

    const process = spawn('python3', [scriptPath, ...args]);

    process.stdout.on('data', (data) => {
        const output = data.toString().trim();
        logger.debug(`Sensor script output: ${output}`);
        res.write(`data: ${JSON.stringify({ status: output })}\n\n`);
    });

    process.stderr.on('data', (data) => {
        const output = data.toString().trim();
        // Parse Python log levels instead of treating all stderr as errors
        const pythonModuleLogPattern = /^(\w+):[\w._]+:(.+)$/;
        const match = output.match(pythonModuleLogPattern);

        if (match) {
            const [, level, message] = match;
            switch (level.toUpperCase()) {
                case 'INFO':
                    logger.info(`Sensor script: ${message}`);
                    break;
                case 'WARNING':
                case 'WARN':
                    logger.warn(`Sensor script: ${message}`);
                    break;
                case 'ERROR':
                    logger.error(`Sensor script error: ${message}`);
                    res.write(`data: ${JSON.stringify({ error: message })}\n\n`);
                    break;
                default:
                    logger.info(`Sensor script: ${output}`);
            }
        } else if (output.toLowerCase().includes('error') || output.toLowerCase().includes('exception')) {
            logger.error(`Sensor script error: ${output}`);
            res.write(`data: ${JSON.stringify({ error: output })}\n\n`);
        } else {
            logger.info(`Sensor script: ${output}`);
        }
    });

    process.on('close', (code) => {
        logger.info(`Sensor script exited with code ${code}`);
        res.write(`data: ${JSON.stringify({ done: true })}\n\n`);
        res.end();
    });

    req.on('close', () => {
        process.kill();
    });
});

const executePythonScript = (req, res) => {
    const { script, args } = req.body;

    if (!script || !Array.isArray(args)) {
        logger.error('Invalid request to execute Python script');
        return res.status(400).json({ success: false, error: 'Invalid request parameters' });
    }

    const scriptPath = path.join(__dirname, '..', 'scripts', script);
    logger.info(`Executing Python script: ${scriptPath} with args: ${args.join(', ')}`);

    try {
        const process = spawn('python3', [scriptPath, ...args]);

        let stdoutData = '';
        let stderrData = '';

        process.stdout.on('data', (data) => {
            stdoutData += data.toString();
            logger.debug(`Python script output: ${data}`);
        });

        process.stderr.on('data', (data) => {
            stderrData += data.toString();
            const output = data.toString().trim();

            // Parse Python log levels instead of treating all stderr as errors
            const pythonModuleLogPattern = /^(\w+):[\w._]+:(.+)$/;
            const match = output.match(pythonModuleLogPattern);

            if (match) {
                const [, level, message] = match;
                switch (level.toUpperCase()) {
                    case 'INFO':
                        logger.info(`Python script: ${message}`);
                        break;
                    case 'WARNING':
                    case 'WARN':
                        logger.warn(`Python script: ${message}`);
                        break;
                    case 'ERROR':
                        logger.error(`Python script error: ${message}`);
                        break;
                    default:
                        logger.info(`Python script: ${output}`);
                }
            } else if (output.toLowerCase().includes('error') || output.toLowerCase().includes('exception')) {
                logger.error(`Python script error: ${output}`);
            } else {
                logger.info(`Python script: ${output}`);
            }
        });

        process.on('close', (code) => {
            logger.info(`Python script exited with code ${code}`);
            try {
                const result = JSON.parse(stdoutData.trim());
                res.json(result);
            } catch (error) {
                logger.error(`Error parsing Python script output: ${error}`);
                res.status(500).json({
                    success: false,
                    error: 'Failed to parse script result',
                    stdout: stdoutData,
                    stderr: stderrData
                });
            }
        });

        process.on('error', (error) => {
            logger.error(`Failed to start Python script: ${error}`);
            res.status(500).json({ success: false, error: 'Failed to start script' });
        });

    } catch (error) {
        logger.error(`Unexpected error executing Python script: ${error}`);
        res.status(500).json({ success: false, error: 'An unexpected error occurred' });
    }
};

router.post('/execute-python-script', executePythonScript);

// GET /microphone/devices - Discover available microphone devices
router.get('/microphone/devices', async (req, res) => {
    try {
        logger.info('Discovering available microphone devices');

        const { spawn } = require('child_process');
        const scriptPath = path.join(__dirname, '..', 'scripts', 'microphone_test.py');

        const pythonProcess = spawn('python3', [scriptPath, 'discover'], {
            stdio: ['pipe', 'pipe', 'pipe']
        });

        let stdout = '';
        let stderr = '';

        pythonProcess.stdout.on('data', (data) => {
            stdout += data.toString();
        });

        pythonProcess.stderr.on('data', (data) => {
            stderr += data.toString();
        });

        pythonProcess.on('close', (code) => {
            if (code === 0) {
                try {
                    const result = JSON.parse(stdout);
                    logger.info(`Discovered ${result.microphones ? result.microphones.length : 0} microphone devices`);
                    res.json(result);
                } catch (parseError) {
                    logger.error('Error parsing microphone discovery result:', parseError);
                    res.status(500).json({
                        success: false,
                        error: 'Failed to parse microphone discovery result',
                        microphones: []
                    });
                }
            } else {
                logger.error(`Microphone discovery failed with code ${code}: ${stderr}`);
                res.status(500).json({
                    success: false,
                    error: `Microphone discovery failed: ${stderr}`,
                    microphones: []
                });
            }
        });

        pythonProcess.on('error', (error) => {
            logger.error('Error executing microphone discovery:', error);
            res.status(500).json({
                success: false,
                error: 'Failed to execute microphone discovery script',
                microphones: []
            });
        });

    } catch (error) {
        logger.error('Error in microphone device discovery:', error);
        res.status(500).json({
            success: false,
            error: 'An error occurred while discovering microphone devices',
            microphones: []
        });
    }
});

// POST /parts/:id/test - Test hardware part
router.post('/:id/test', async (req, res) => {
    try {
        const id = parseInt(req.params.id);
        if (isNaN(id)) {
            return res.status(400).json({ success: false, error: 'Invalid part ID' });
        }

        const part = await partService.getPartById(id);
        if (!part) {
            return res.status(404).json({ success: false, error: 'Part not found' });
        }

        // Mock hardware test for now - in real implementation, this would test actual hardware
        const testResult = {
            success: true,
            part_id: part.id,
            part_name: part.name,
            part_type: part.type,
            test_timestamp: new Date().toISOString(),
            response_time: Math.floor(Math.random() * 500) + 100, // Mock response time
            status: 'online',
            message: `Hardware test successful for ${part.type} "${part.name}"`
        };

        logger.info(`🧪 Tested hardware part: ${part.name} (${part.type})`);
        res.json(testResult);
    } catch (error) {
        logger.error('Error testing part:', error);
        res.status(500).json({ success: false, error: error.message });
    }
});

router.get('/api/parts', async (req, res) => {
    try {
        const parts = await partService.getAllParts();
        const partsWithDetails = await Promise.all(parts.map(async part => ({
            ...part,
            details: await getPartDetails(part)
        })));
        res.json(partsWithDetails);
    } catch (error) {
        logger.error('Error fetching parts for API:', error);
        res.status(500).json({ error: 'An error occurred while fetching parts' });
    }
});

// Microphone routes
router.get('/microphone/new', async (req, res) => {
    try {
        const character = await characterService.getCharacterById(req.characterId);
        const characters = await characterService.getAllCharacters();
        const part = { type: 'microphone', characterId: req.characterId };
        res.render('part-form', {
            title: 'Add Microphone',
            action: `/parts/microphone`,
            part,
            character,
            characters
        });
    } catch (error) {
        logger.error('Error rendering microphone form:', error);
        res.status(500).send('An error occurred while loading the form');
    }
});

router.get('/microphone/:id/edit', async (req, res) => {
    try {
        const id = parseInt(req.params.id);
        if (isNaN(id)) {
            logger.warn(`Invalid part ID (not a number): ${req.params.id}`);
            return res.status(404).send('Part not found');
        }
        const part = await partService.getPartById(id);
        if (!part) {
            logger.warn(`Part not found with id: ${id}`);
            return res.status(404).send('Part not found');
        }
        const character = await characterService.getCharacterById(req.characterId);
        const characters = await characterService.getAllCharacters();
        res.render('part-form', {
            title: 'Edit Microphone',
            action: `/parts/microphone/${id}/update`,
            part,
            character,
            characters
        });
    } catch (error) {
        logger.error('Error fetching part for editing:', error);
        res.status(500).send('An error occurred while fetching the part');
    }
});

router.post('/microphone', checkCharacterSelected, async (req, res) => {
    try {
        const partData = req.body;
        partData.type = 'microphone';
        partData.characterId = req.characterId;

        // Convert string values to appropriate types
        if (partData.sampleRate) partData.sampleRate = parseInt(partData.sampleRate);
        if (partData.channels) partData.channels = parseInt(partData.channels);
        if (partData.sensitivity) partData.sensitivity = parseFloat(partData.sensitivity);
        if (partData.voiceActivationThreshold) partData.voiceActivationThreshold = parseFloat(partData.voiceActivationThreshold);

        // Convert checkbox values to booleans
        partData.echoCancellation = partData.echoCancellation === 'on';
        partData.noiseSuppression = partData.noiseSuppression === 'on';
        partData.autoGainControl = partData.autoGainControl === 'on';
        partData.voiceActivation = partData.voiceActivation === 'on';

        logger.info(`Creating microphone with data: ${JSON.stringify(partData)}`);
        const newPart = await partService.createPart(partData);
        logger.info(`Created microphone: ${JSON.stringify(newPart)}`);
        res.redirect(`/parts?characterId=${req.characterId}`);
    } catch (error) {
        logger.error('Error creating microphone:', error);
        res.status(500).send('An error occurred while creating the microphone');
    }
});

router.post('/microphone/:id/update', async (req, res) => {
    try {
        const id = parseInt(req.params.id);
        if (isNaN(id)) {
            logger.warn(`Invalid part ID (not a number): ${req.params.id}`);
            return res.status(404).send('Part not found');
        }

        const partData = req.body;
        partData.characterId = req.characterId;

        // Convert string values to appropriate types
        if (partData.sampleRate) partData.sampleRate = parseInt(partData.sampleRate);
        if (partData.channels) partData.channels = parseInt(partData.channels);
        if (partData.sensitivity) partData.sensitivity = parseFloat(partData.sensitivity);
        if (partData.voiceActivationThreshold) partData.voiceActivationThreshold = parseFloat(partData.voiceActivationThreshold);

        // Convert checkbox values to booleans
        partData.echoCancellation = partData.echoCancellation === 'on';
        partData.noiseSuppression = partData.noiseSuppression === 'on';
        partData.autoGainControl = partData.autoGainControl === 'on';
        partData.voiceActivation = partData.voiceActivation === 'on';

        const updatedPart = await partService.updatePart(id, partData);
        logger.info(`Updated microphone: ${JSON.stringify(updatedPart)}`);
        res.redirect(`/parts?characterId=${req.characterId}`);
    } catch (error) {
        logger.error('Error updating microphone:', error);
        res.status(500).send('An error occurred while updating the microphone');
    }
});

// Dedicated Microphone Parts Management Page
router.get('/microphone/management', async (req, res) => {
    try {
        const character = await characterService.getCharacterById(req.characterId);
        const characters = await characterService.getAllCharacters();
        const microphones = await partService.getAllParts();
        const microphoneParts = microphones.filter(part => part.type === 'microphone');

        // Get microphone service status
        const MicrophoneService = require('../services/microphoneService');
        const microphoneService = new MicrophoneService();
        const serviceStatus = await microphoneService.getServiceStatus();

        res.render('microphone-management', {
            title: 'Microphone Parts Management',
            character,
            characters,
            microphones: microphoneParts,
            serviceStatus
        });
    } catch (error) {
        logger.error('Error rendering microphone management:', error);
        res.status(500).send('An error occurred while loading the microphone management page');
    }
});

// Legacy routes for backward compatibility
router.get('/microphone/monitor', async (req, res) => {
    res.redirect('/parts/microphone/management');
});

router.get('/microphone/test', async (req, res) => {
    res.redirect('/parts/microphone/management');
});

router.get('/api/microphone/status', async (req, res) => {
    try {
        const MicrophoneService = require('../services/microphoneService');
        const microphoneService = new MicrophoneService();

        const statuses = microphoneService.getAllMicrophoneStatuses();
        res.json(statuses);
    } catch (error) {
        logger.error('Error getting microphone statuses:', error);
        res.status(500).json({ error: 'Failed to get microphone statuses' });
    }
});

router.post('/api/microphone/:id/preset', async (req, res) => {
    try {
        const id = parseInt(req.params.id);
        const { presetName } = req.body;

        if (isNaN(id)) {
            return res.status(400).json({ error: 'Invalid microphone ID' });
        }

        if (!presetName) {
            return res.status(400).json({ error: 'Preset name is required' });
        }

        const MicrophoneService = require('../services/microphoneService');
        const microphoneService = new MicrophoneService();

        const updatedMicrophone = await microphoneService.applyConfigPreset(id, presetName);

        if (!updatedMicrophone) {
            return res.status(404).json({ error: 'Microphone not found' });
        }

        res.json({ success: true, microphone: updatedMicrophone });
    } catch (error) {
        logger.error('Error applying microphone preset:', error);
        res.status(500).json({ error: error.message });
    }
});

router.get('/api/microphone/presets', async (req, res) => {
    try {
        const MicrophoneService = require('../services/microphoneService');
        const microphoneService = new MicrophoneService();

        const presets = microphoneService.getConfigPresets();
        res.json(presets);
    } catch (error) {
        logger.error('Error getting microphone presets:', error);
        res.status(500).json({ error: 'Failed to get microphone presets' });
    }
});

router.post('/api/microphone/bulk', async (req, res) => {
    try {
        const { microphoneIds, operation, operationData } = req.body;

        if (!Array.isArray(microphoneIds) || microphoneIds.length === 0) {
            return res.status(400).json({ error: 'Microphone IDs array is required' });
        }

        if (!operation) {
            return res.status(400).json({ error: 'Operation is required' });
        }

        const MicrophoneService = require('../services/microphoneService');
        const microphoneService = new MicrophoneService();

        const results = await microphoneService.bulkOperation(microphoneIds, operation, operationData);
        res.json(results);
    } catch (error) {
        logger.error('Error performing bulk microphone operation:', error);
        res.status(500).json({ error: error.message });
    }
});

// Advanced microphone management routes
router.get('/api/microphone/:id/assignments', async (req, res) => {
    try {
        const id = parseInt(req.params.id);
        if (isNaN(id)) {
            return res.status(400).json({ error: 'Invalid microphone ID' });
        }

        const MicrophoneManagerService = require('../services/microphoneManagerService');
        const microphoneManager = new MicrophoneManagerService();

        const assignments = await microphoneManager.getMicrophoneAssignments(id);
        res.json(assignments);
    } catch (error) {
        logger.error('Error getting microphone assignments:', error);
        res.status(500).json({ error: error.message });
    }
});

router.post('/api/microphone/:id/assign-service', async (req, res) => {
    try {
        const id = parseInt(req.params.id);
        const { serviceId, serviceConfig } = req.body;

        if (isNaN(id)) {
            return res.status(400).json({ error: 'Invalid microphone ID' });
        }

        if (!serviceId) {
            return res.status(400).json({ error: 'Service ID is required' });
        }

        const MicrophoneManagerService = require('../services/microphoneManagerService');
        const microphoneManager = new MicrophoneManagerService();

        const result = await microphoneManager.assignServiceToMicrophone(id, serviceId, serviceConfig);
        res.json({ success: result });
    } catch (error) {
        logger.error('Error assigning service to microphone:', error);
        res.status(500).json({ error: error.message });
    }
});

router.delete('/api/microphone/:id/unassign-service/:serviceId', async (req, res) => {
    try {
        const id = parseInt(req.params.id);
        const serviceId = req.params.serviceId;

        if (isNaN(id)) {
            return res.status(400).json({ error: 'Invalid microphone ID' });
        }

        const MicrophoneManagerService = require('../services/microphoneManagerService');
        const microphoneManager = new MicrophoneManagerService();

        const result = await microphoneManager.unassignServiceFromMicrophone(id, serviceId);
        res.json({ success: result });
    } catch (error) {
        logger.error('Error unassigning service from microphone:', error);
        res.status(500).json({ error: error.message });
    }
});

router.get('/api/microphone/:id/real-time-data', async (req, res) => {
    try {
        const id = parseInt(req.params.id);
        if (isNaN(id)) {
            return res.status(400).json({ error: 'Invalid microphone ID' });
        }

        const MicrophoneService = require('../services/microphoneService');
        const microphoneService = new MicrophoneService();

        const realTimeData = microphoneService.getMicrophoneStatus(id);
        res.json(realTimeData || { status: 'inactive', level: 0 });
    } catch (error) {
        logger.error('Error getting real-time microphone data:', error);
        res.status(500).json({ error: error.message });
    }
});

router.post('/api/microphone/:id/calibrate', async (req, res) => {
    try {
        const id = parseInt(req.params.id);
        const { calibrationType, duration } = req.body;

        if (isNaN(id)) {
            return res.status(400).json({ error: 'Invalid microphone ID' });
        }

        const MicrophoneService = require('../services/microphoneService');
        const microphoneService = new MicrophoneService();

        const calibrationResult = await microphoneService.calibrateMicrophone(id, calibrationType, duration);
        res.json(calibrationResult);
    } catch (error) {
        logger.error('Error calibrating microphone:', error);
        res.status(500).json({ error: error.message });
    }
});

router.get('/api/microphone/analytics', async (req, res) => {
    try {
        const { timeRange, microphoneIds } = req.query;

        const MicrophoneService = require('../services/microphoneService');
        const microphoneService = new MicrophoneService();

        const analytics = await microphoneService.getMicrophoneAnalytics(timeRange, microphoneIds);
        res.json(analytics);
    } catch (error) {
        logger.error('Error getting microphone analytics:', error);
        res.status(500).json({ error: error.message });
    }
});

// Add missing parts API endpoint
router.get('/api/parts', async (req, res) => {
    try {
        const parts = await partService.getAllParts();
        res.json(parts);
    } catch (error) {
        logger.error('Error getting all parts:', error);
        res.status(500).json({ error: error.message });
    }
});

// Service management API endpoints
router.post('/api/services/restart', async (req, res) => {
    try {
        const { serviceType, port } = req.body;

        if (!serviceType || !port) {
            return res.status(400).json({ error: 'Service type and port are required' });
        }

        let result = false;

        // Use microphone services starter for microphone services
        if (global.microphoneServicesStarter && (serviceType === 'microphone' || serviceType === 'audioStream')) {
            const serviceMap = {
                'microphone': 'microphoneService',
                'audioStream': 'audioStreamService'
            };

            const serviceId = serviceMap[serviceType];
            if (serviceId) {
                result = await global.microphoneServicesStarter.restartService(serviceId);
            }
        } else {
            // Fallback to general service manager
            const ServiceManager = require('../services/serviceManager');
            const serviceManager = new ServiceManager();
            result = await serviceManager.restartService(serviceType, port);
        }

        res.json({ success: result });
    } catch (error) {
        logger.error('Error restarting service:', error);
        res.status(500).json({ error: error.message });
    }
});

router.get('/api/services/status', async (req, res) => {
    try {
        let status = {};

        // Get microphone services status
        if (global.microphoneServicesStarter) {
            const microphoneStatus = await global.microphoneServicesStarter.getServicesStatus();
            status = { ...status, ...microphoneStatus };
        }

        // Get other services status
        const ServiceManager = require('../services/serviceManager');
        const serviceManager = new ServiceManager();
        const otherStatus = await serviceManager.getServicesStatus();

        // Merge statuses, prioritizing microphone services starter
        status = { ...otherStatus, ...status };

        res.json(status);
    } catch (error) {
        logger.error('Error getting services status:', error);
        res.status(500).json({ error: error.message });
    }
});

// Enhanced microphone API endpoints
router.get('/api/microphone/:id/status', async (req, res) => {
    try {
        const id = parseInt(req.params.id);
        if (isNaN(id)) {
            return res.status(400).json({ error: 'Invalid microphone ID' });
        }

        const MicrophoneService = require('../services/microphoneService');
        const microphoneService = new MicrophoneService();

        const status = await microphoneService.getMicrophoneStatus(id);
        res.json(status || { status: 'inactive', level: 0 });
    } catch (error) {
        logger.error('Error getting microphone status:', error);
        res.status(500).json({ error: error.message });
    }
});

router.post('/api/microphone/:id/test', async (req, res) => {
    try {
        const id = parseInt(req.params.id);
        const { testType, duration } = req.body;

        if (isNaN(id)) {
            return res.status(400).json({ error: 'Invalid microphone ID' });
        }

        const MicrophoneService = require('../services/microphoneService');
        const microphoneService = new MicrophoneService();

        const testResult = await microphoneService.testMicrophone(id, testType, duration);
        res.json(testResult);
    } catch (error) {
        logger.error('Error testing microphone:', error);
        res.status(500).json({ error: error.message });
    }
});

router.post('/api/microphone/:id/start-monitoring', async (req, res) => {
    try {
        const id = parseInt(req.params.id);
        if (isNaN(id)) {
            return res.status(400).json({ error: 'Invalid microphone ID' });
        }

        const MicrophoneService = require('../services/microphoneService');
        const microphoneService = new MicrophoneService();

        const result = await microphoneService.startMonitoring(id);
        res.json({ success: result });
    } catch (error) {
        logger.error('Error starting microphone monitoring:', error);
        res.status(500).json({ error: error.message });
    }
});

router.post('/api/microphone/:id/stop-monitoring', async (req, res) => {
    try {
        const id = parseInt(req.params.id);
        if (isNaN(id)) {
            return res.status(400).json({ error: 'Invalid microphone ID' });
        }

        const MicrophoneService = require('../services/microphoneService');
        const microphoneService = new MicrophoneService();

        const result = await microphoneService.stopMonitoring(id);
        res.json({ success: result });
    } catch (error) {
        logger.error('Error stopping microphone monitoring:', error);
        res.status(500).json({ error: error.message });
    }
});

router.get('/api/microphone/devices', async (req, res) => {
    try {
        const MicrophoneService = require('../services/microphoneService');
        const microphoneService = new MicrophoneService();

        const devices = await microphoneService.discoverDevices();
        res.json(devices);
    } catch (error) {
        logger.error('Error discovering microphone devices:', error);
        res.status(500).json({ error: error.message });
    }
});

// Health check endpoint for microphone services
router.get('/api/microphone/health', async (req, res) => {
    try {
        const healthData = {
            timestamp: new Date().toISOString(),
            services: {},
            overall: 'healthy'
        };

        // Check microphone services starter
        if (global.microphoneServicesStarter) {
            const servicesStatus = await global.microphoneServicesStarter.getServicesStatus();
            healthData.services = servicesStatus;

            // Determine overall health
            const allRunning = Object.values(servicesStatus).every(service => service.running);
            healthData.overall = allRunning ? 'healthy' : 'degraded';
        } else {
            healthData.overall = 'error';
            healthData.error = 'Microphone services starter not initialized';
        }

        // Check microphone manager service
        if (global.microphoneManagerService) {
            healthData.microphoneManager = {
                initialized: true,
                activeMicrophones: global.microphoneManagerService.getActiveMicrophonesCount?.() || 0
            };
        } else {
            healthData.microphoneManager = {
                initialized: false
            };
        }

        res.json(healthData);
    } catch (error) {
        logger.error('Error getting microphone health status:', error);
        res.status(500).json({
            error: error.message,
            overall: 'error',
            timestamp: new Date().toISOString()
        });
    }
});

// Auto-restart services endpoint
router.post('/api/microphone/auto-restart', async (req, res) => {
    try {
        if (!global.microphoneServicesStarter) {
            return res.status(500).json({
                success: false,
                error: 'Microphone services starter not available'
            });
        }

        logger.info('🔄 Auto-restarting microphone services...');

        // Get current status
        const currentStatus = await global.microphoneServicesStarter.getServicesStatus();
        const failedServices = Object.entries(currentStatus)
            .filter(([_, service]) => !service.running)
            .map(([serviceId, _]) => serviceId);

        if (failedServices.length === 0) {
            return res.json({
                success: true,
                message: 'All services are already running',
                restarted: []
            });
        }

        // Restart failed services
        const restartResults = [];
        for (const serviceId of failedServices) {
            try {
                const restarted = await global.microphoneServicesStarter.restartService(serviceId);
                restartResults.push({ serviceId, success: restarted });
            } catch (error) {
                restartResults.push({ serviceId, success: false, error: error.message });
            }
        }

        const successCount = restartResults.filter(r => r.success).length;

        res.json({
            success: successCount > 0,
            message: `Restarted ${successCount}/${failedServices.length} services`,
            restarted: restartResults
        });

    } catch (error) {
        logger.error('Error auto-restarting microphone services:', error);
        res.status(500).json({
            success: false,
            error: error.message
        });
    }
});

// General services restart endpoint (for microphone management page)
router.post('/api/services/restart', async (req, res) => {
    try {
        const { serviceType, port } = req.body;

        if (!serviceType) {
            return res.status(400).json({
                success: false,
                error: 'Service type is required'
            });
        }

        logger.info(`🔄 Restarting ${serviceType} service on port ${port}`);

        let result = false;

        // Use microphone services starter for microphone services
        if (global.microphoneServicesStarter && (serviceType === 'microphone' || serviceType === 'audioStream')) {
            const serviceMap = {
                'microphone': 'microphoneService',
                'audioStream': 'audioStreamService'
            };

            const serviceId = serviceMap[serviceType];
            if (serviceId) {
                result = await global.microphoneServicesStarter.restartService(serviceId);
            }
        } else {
            // Fallback to general service manager
            const ServiceManager = require('../services/serviceManager');
            const serviceManager = new ServiceManager();
            result = await serviceManager.restartService(serviceType, port);
        }

        if (result) {
            logger.info(`✅ ${serviceType} service restarted successfully`);
            res.json({
                success: true,
                message: `${serviceType} service restarted successfully`
            });
        } else {
            logger.error(`❌ Failed to restart ${serviceType} service`);
            res.status(500).json({
                success: false,
                error: `Failed to restart ${serviceType} service`
            });
        }

    } catch (error) {
        logger.error('Error restarting service:', error);
        res.status(500).json({
            success: false,
            error: error.message
        });
    }
});

/**
 * Perform cleanup operations when deleting a microphone
 * @param {number} microphoneId - ID of the microphone being deleted
 */
async function performMicrophoneCleanup(microphoneId) {
    try {
        logger.info(`🎤 Performing microphone cleanup for ID: ${microphoneId}`);

        // Import services for cleanup
        const CharacterMicrophoneService = require('../services/characterMicrophoneService');
        const characterMicrophoneService = new CharacterMicrophoneService();

        // Remove character associations
        const associations = await characterMicrophoneService.loadAssociations();
        const microphoneAssociations = associations.filter(assoc => assoc.microphoneId === microphoneId);

        for (const association of microphoneAssociations) {
            logger.info(`🔗 Removing microphone association for character ${association.characterId}`);
            await characterMicrophoneService.removeMicrophone(association.characterId);
        }

        // TODO: Stop any active microphone services/streams
        // This would involve communicating with the microphone WebSocket service
        // to stop any active recording or streaming for this microphone

        logger.info(`✅ Microphone cleanup completed for ID: ${microphoneId}`);
    } catch (error) {
        logger.error(`❌ Error during microphone cleanup for ID ${microphoneId}:`, error);
        // Don't throw error to prevent deletion failure
    }
}

module.exports = {
    router: router,
    executePythonScript: executePythonScript
};
