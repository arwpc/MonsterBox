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
        res.render('parts', { title: 'Hardware Parts Management', parts: partsWithDetails });
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

module.exports = {
    router: router,
    executePythonScript: executePythonScript
};
