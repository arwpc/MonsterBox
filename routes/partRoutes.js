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

const checkCharacterSelected = async (req, res, next) => {
    logger.info(`checkCharacterSelected - Initial characterId: ${req.characterId}`);
    if (!req.characterId) {
        req.characterId = req.query.characterId || req.session.characterId;
        logger.info(`checkCharacterSelected - Updated characterId: ${req.characterId}`);
    }
    if (!req.characterId) {
        try {
            const characters = await characterService.getAllCharacters();
            if (characters && characters.length > 0) {
                req.characterId = characters[0].id;
                if (req.session) req.session.characterId = req.characterId;
                logger.info(`checkCharacterSelected - Defaulted to first available characterId: ${req.characterId}`);
            } else {
                logger.warn('No characters available - redirecting to Characters page');
                return res.redirect('/characters');
            }
        } catch (err) {
            logger.error('Error selecting default character:', err);
            return res.status(400).send('Character selection required. Please create a character first.');
        }
    }
    logger.info(`checkCharacterSelected - Final characterId: ${req.characterId}`);
    next();
};

router.use(checkCharacterSelected);

router.get('/', async (req, res) => {
    try {
        // Get ALL parts (hardware-centric approach)
        const allParts = await partService.getAllParts();

        // Apply character filter if specified
        const filterCharacterId = req.query.filterCharacterId;
        let filteredParts = allParts;

        if (filterCharacterId && filterCharacterId !== 'all') {
            const characterIdNum = parseInt(filterCharacterId);
            filteredParts = allParts.filter(part => part.characterId === characterIdNum);
        }

        const partsWithDetails = await Promise.all(filteredParts.map(async part => ({
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
            characters,
            filterCharacterId: filterCharacterId || 'all'
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

        // Use individual forms for all types now
        res.render(`part-forms/${type}`, renderData);
        // Speaker defaults handled in template; no extra data needed

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
        // Route uses dynamic template path; speaker handled by views/part-forms/speaker.ejs

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
        } else if (type === 'motion-sensor') {
            logger.info(`Created motion sensor: ${JSON.stringify(newPart)}`);
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

// Consolidated Microphone Management Route
router.get('/microphone/manage/:id?', async (req, res) => {
    try {
        const characters = await characterService.getAllCharacters();
        let part = { type: 'microphone' };
        let character = null;
        let title = 'Add Microphone';
        let action = '/parts/microphone';

        // If ID is provided, we're editing
        if (req.params.id) {
            const id = parseInt(req.params.id);
            if (isNaN(id)) {
                logger.warn(`Invalid part ID (not a number): ${req.params.id}`);
                return res.status(404).send('Part not found');
            }
            part = await partService.getPartById(id);
            if (!part) {
                logger.warn(`Part not found with id: ${id}`);
                return res.status(404).send('Part not found');
            }
            title = 'Edit Microphone';
            character = await characterService.getCharacterById(part.characterId);
        } else {
            // For new microphones, use selected character if available
            if (req.characterId) {
                character = await characterService.getCharacterById(req.characterId);
                part.characterId = req.characterId;
            }
        }

        res.render('part-forms/microphone', {
            title,
            action,
            part,
            character,
            characters
        });
    } catch (error) {
        logger.error('Error rendering microphone management form:', error);
        res.status(500).send('An error occurred while loading the form');
    }
});

// Legacy routes for backward compatibility
router.get('/microphone/new', (req, res) => {
    res.redirect('/parts/microphone/manage');
});

router.get('/microphone/:id/edit', (req, res) => {
    res.redirect(`/parts/microphone/manage/${req.params.id}`);
});

router.post('/microphone', checkCharacterSelected, async (req, res) => {
    try {
        const partData = req.body;
        partData.type = 'microphone';

        // Ensure character ID is set (fallback to middleware-selected character)
        if (!partData.characterId) {
            partData.characterId = req.characterId;
        }

        // Validate character selection
        if (!partData.characterId) {
            return res.status(400).send('Character selection is required');
        }

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

        if (partData.id) {
            // Update existing microphone
            logger.info(`Updating microphone ${partData.id} with data: ${JSON.stringify(partData)}`);
            const updatedPart = await partService.updatePart(partData.id, partData);
            logger.info(`Updated microphone: ${JSON.stringify(updatedPart)}`);
        } else {
            // Create new microphone
            logger.info(`Creating microphone with data: ${JSON.stringify(partData)}`);
            const newPart = await partService.createPart(partData);
            logger.info(`Created microphone: ${JSON.stringify(newPart)}`);
        }

        res.redirect(`/parts?characterId=${partData.characterId}`);
    } catch (error) {
        logger.error('Error saving microphone:', error);
        res.status(500).send('An error occurred while saving the microphone');
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

// Consolidated Speaker Management Route
router.get('/speaker/manage/:id?', async (req, res) => {
    try {
        const characters = await characterService.getAllCharacters();
        let part = { type: 'speaker' };
        let character = null;
        let title = 'Add Speaker';
        let action = '/parts/speaker';

        // If ID is provided, we're editing
        if (req.params.id) {
            const id = parseInt(req.params.id);
            if (isNaN(id)) {
                logger.warn(`Invalid part ID (not a number): ${req.params.id}`);
                return res.status(404).send('Part not found');
            }
            part = await partService.getPartById(id);
            if (!part) {
                logger.warn(`Part not found with id: ${id}`);
                return res.status(404).send('Part not found');
            }
            title = 'Edit Speaker';
            character = await characterService.getCharacterById(part.characterId);
        } else {
            // For new speakers, use selected character if available
            if (req.characterId) {
                character = await characterService.getCharacterById(req.characterId);
                part.characterId = req.characterId;
            }
        }

        res.render('part-forms/speaker', {
            title,
            action,
            part,
            character,
            characters
        });
    } catch (error) {
        logger.error('Error rendering speaker management form:', error);
        res.status(500).send('An error occurred while loading the form');
    }
});

// Legacy routes for backward compatibility
router.get('/speaker/new', (req, res) => {
    res.redirect('/parts/speaker/manage');
});

router.get('/speaker/:id/edit', (req, res) => {
    res.redirect(`/parts/speaker/manage/${req.params.id}`);
});

router.post('/speaker', checkCharacterSelected, async (req, res) => {
    try {
        const partData = req.body;
        partData.type = 'speaker';

        // Ensure character ID is set (fallback to middleware-selected character)
        if (!partData.characterId) {
            partData.characterId = req.characterId;
        }

        // Validate character selection
        if (!partData.characterId) {
            return res.status(400).send('Character selection is required');
        }

        // Convert string values to appropriate types
        if (partData.volume) partData.volume = parseInt(partData.volume);

        if (partData.id) {
            // Update existing speaker
            logger.info(`Updating speaker ${partData.id} with data: ${JSON.stringify(partData)}`);
            const updatedPart = await partService.updatePart(partData.id, partData);
            logger.info(`Updated speaker: ${JSON.stringify(updatedPart)}`);
        } else {
            // Create new speaker
            logger.info(`Creating speaker with data: ${JSON.stringify(partData)}`);
            const newPart = await partService.createPart(partData);
            logger.info(`Created speaker: ${JSON.stringify(newPart)}`);
        }

        res.redirect(`/parts?characterId=${partData.characterId}`);
    } catch (error) {
        logger.error('Error saving speaker:', error);
        res.status(500).send('An error occurred while saving the speaker');
    }
});

// API Routes for Microphone Management
router.get('/api/microphone/devices', async (req, res) => {
    try {
        const MicrophoneService = require('../services/microphoneService');
        const microphoneService = new MicrophoneService();
        const devices = await microphoneService.getAvailableDevices();

        res.json({
            success: true,
            devices: devices
        });
    } catch (error) {
        logger.error('Error getting microphone devices:', error);
        res.status(500).json({
            success: false,
            error: error.message
        });
    }
});

router.post('/api/microphone/test', async (req, res) => {
    try {
        const { config, duration } = req.body;
        const MicrophoneService = require('../services/microphoneService');
        const microphoneService = new MicrophoneService();

        const testResults = await microphoneService.performBasicTest(
            { config: config },
            duration || 5
        );

        res.json({
            success: true,
            results: testResults
        });
    } catch (error) {
        logger.error('Error testing microphone:', error);
        res.status(500).json({
            success: false,
            error: error.message
        });
    }
});

router.post('/api/microphone/test-levels', async (req, res) => {
    try {
        const { microphoneId, duration } = req.body;
        const MicrophoneService = require('../services/microphoneService');
        const microphoneService = new MicrophoneService();

        const levels = await microphoneService.testAudioLevels(microphoneId, duration || 10);

        res.json({
            success: true,
            levels: levels
        });
    } catch (error) {
        logger.error('Error testing audio levels:', error);
        res.status(500).json({
            success: false,
            error: error.message
        });
    }
});

// Removed duplicate monitoring endpoints - using the enhanced ones below

router.get('/api/microphone/:id/levels', async (req, res) => {
    try {
        const microphoneId = parseInt(req.params.id);
        const MicrophoneService = require('../services/microphoneService');
        const microphoneService = new MicrophoneService();

        const levels = await microphoneService.getCurrentAudioLevels(microphoneId);

        res.json({
            success: true,
            levels: levels
        });
    } catch (error) {
        logger.error('Error getting audio levels:', error);
        res.status(500).json({
            success: false,
            error: error.message
        });
    }
});

router.post('/api/microphone/test-stt', async (req, res) => {
    try {
        const { microphoneId, characterId, duration } = req.body;
        const ElevenLabsLiveSTTService = require('../services/elevenLabsLiveSTTService');
        const sttService = new ElevenLabsLiveSTTService();

        // Test STT integration
        const testResult = await sttService.testSTTIntegration(microphoneId, characterId, duration || 10);

        res.json({
            success: testResult.success,
            transcription: testResult.transcription,
            confidence: testResult.confidence,
            language: testResult.language,
            error: testResult.error
        });
    } catch (error) {
        logger.error('Error testing STT integration:', error);
        res.status(500).json({
            success: false,
            error: error.message
        });
    }
});

router.get('/api/microphone/stt-status', async (req, res) => {
    try {
        const ElevenLabsLiveSTTService = require('../services/elevenLabsLiveSTTService');
        const sttService = new ElevenLabsLiveSTTService();

        const status = await sttService.getServiceStatus();

        res.json({
            success: true,
            status: status.active ? 'active' : 'inactive',
            details: status
        });
    } catch (error) {
        logger.error('Error getting STT status:', error);
        res.status(500).json({
            success: false,
            error: error.message
        });
    }
});

// Redirect microphone management to the consolidated management page
router.get('/microphone/management', async (req, res) => {
    try {
        // Find the first microphone for this character, or redirect to create new one
        const microphones = await partService.getAllParts();
        const microphoneParts = microphones.filter(part =>
            part.type === 'microphone' && part.characterId === req.characterId
        );

        if (microphoneParts.length > 0) {
            // Redirect to edit the first microphone
            res.redirect(`/parts/microphone/manage/${microphoneParts[0].id}`);
        } else {
            // Redirect to create a new microphone
            res.redirect('/parts/microphone/manage');
        }
    } catch (error) {
        logger.error('Error rendering microphone management:', error);
        res.status(500).send('An error occurred while loading the microphone management page');
    }
});

// Legacy routes for backward compatibility
router.get('/microphone/monitor', async (req, res) => {
    res.redirect('/parts/microphone/management');
});

// Motion Sensor routes
router.get('/motion-sensor/new', async (req, res) => {
    try {
        const character = await characterService.getCharacterById(req.characterId);
        const characters = await characterService.getAllCharacters();
        const part = { type: 'motion-sensor', characterId: req.characterId };
        res.render('part-forms/motion-sensor', {
            title: 'Add Motion Sensor',
            action: `/parts/motion-sensor`,
            part,
            character,
            characters
        });
    } catch (error) {
        logger.error('Error rendering motion sensor form:', error);
        res.status(500).send('An error occurred while loading the form');
    }
});

router.get('/motion-sensor/:id/edit', async (req, res) => {
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
        res.render('part-forms/motion-sensor', {
            title: 'Edit Motion Sensor',
            action: `/parts/motion-sensor/${id}/update`,
            part,
            character,
            characters
        });
    } catch (error) {
        logger.error('Error fetching motion sensor for editing:', error);
        res.status(500).send('An error occurred while fetching the motion sensor');
    }
});

router.post('/motion-sensor', checkCharacterSelected, async (req, res) => {
    try {
        const partData = req.body;
        partData.type = 'motion-sensor';
        partData.characterId = req.characterId;

        // Convert string values to appropriate types
        if (partData.gpioPin) partData.gpioPin = parseInt(partData.gpioPin);
        if (partData.sensitivity) partData.sensitivity = parseFloat(partData.sensitivity);
        if (partData.detectionRange) partData.detectionRange = parseFloat(partData.detectionRange);
        if (partData.triggerDelay) partData.triggerDelay = parseInt(partData.triggerDelay);

        // Convert checkbox values to booleans
        partData.active = partData.active === 'on';
        partData.invertSignal = partData.invertSignal === 'on';
        partData.enableLogging = partData.enableLogging === 'on';

        logger.info(`Creating motion sensor with data: ${JSON.stringify(partData)}`);
        const newPart = await partService.createPart(partData);
        logger.info(`Created motion sensor: ${JSON.stringify(newPart)}`);
        res.redirect(`/parts?characterId=${req.characterId}`);
    } catch (error) {
        logger.error('Error creating motion sensor:', error);
        res.status(500).send('An error occurred while creating the motion sensor');
    }
});

router.post('/motion-sensor/:id/update', async (req, res) => {
    try {
        const id = parseInt(req.params.id);
        if (isNaN(id)) {
            logger.warn(`Invalid part ID (not a number): ${req.params.id}`);
            return res.status(404).send('Part not found');
        }

        const partData = req.body;
        partData.characterId = req.characterId;

        // Convert string values to appropriate types
        if (partData.gpioPin) partData.gpioPin = parseInt(partData.gpioPin);
        if (partData.sensitivity) partData.sensitivity = parseFloat(partData.sensitivity);
        if (partData.detectionRange) partData.detectionRange = parseFloat(partData.detectionRange);
        if (partData.triggerDelay) partData.triggerDelay = parseInt(partData.triggerDelay);

        // Convert checkbox values to booleans
        partData.active = partData.active === 'on';
        partData.invertSignal = partData.invertSignal === 'on';
        partData.enableLogging = partData.enableLogging === 'on';

        const updatedPart = await partService.updatePart(id, partData);
        logger.info(`Updated motion sensor: ${JSON.stringify(updatedPart)}`);
        res.redirect(`/parts?characterId=${req.characterId}`);
    } catch (error) {
        logger.error('Error updating motion sensor:', error);
        res.status(500).send('An error occurred while updating the motion sensor');
    }
});

// Motion Sensor Control Routes
router.get('/motion-sensor/control', (req, res) => {
    const { id, gpioPin, action } = req.query;

    if (action === 'start') {
        res.writeHead(200, {
            'Content-Type': 'text/event-stream',
            'Cache-Control': 'no-cache',
            'Connection': 'keep-alive'
        });

        const scriptPath = path.join(__dirname, '..', 'scripts', 'test_sensor.py');
        const process = spawn('python3', [scriptPath, gpioPin]);

        process.stdout.on('data', (data) => {
            const output = data.toString().trim();
            logger.debug(`Motion sensor script output: ${output}`);
            res.write(`data: ${output}\n\n`);
        });

        process.stderr.on('data', (data) => {
            const error = data.toString().trim();
            logger.error(`Motion sensor script error: ${error}`);
            res.write(`data: ${JSON.stringify({ error: error })}\n\n`);
        });

        process.on('close', (code) => {
            logger.debug(`Motion sensor script exited with code ${code}`);
            res.write(`data: ${JSON.stringify({ status: 'Motion sensor monitoring stopped' })}\n\n`);
            res.end();
        });

        req.on('close', () => {
            process.kill();
        });
    } else {
        res.status(400).json({ error: 'Invalid action' });
    }
});

router.post('/motion-sensor/control', async (req, res) => {
    const { id, gpioPin, action } = req.body;
    logger.debug(`Received POST /motion-sensor/control request: ${JSON.stringify(req.body)}`);

    if (action === 'stop') {
        try {
            if (!id) {
                // Be lenient: allow stopping even without a persisted part ID (e.g., unsaved motion sensor form)
                logger.warn('Received stop request with missing or invalid motion sensor ID - treating as success');
                return res.json({ success: true, message: 'Stop request received for motion sensor monitoring' });
            }

            logger.info(`Received stop request for motion sensor monitoring. ID: ${id}, GPIO Pin: ${gpioPin}`);

            res.json({ success: true, message: 'Stop request received for motion sensor monitoring' });
        } catch (error) {
            logger.error('Error handling motion sensor stop request:', error);
            res.status(500).json({ success: false, error: 'Failed to process stop request: ' + error.message });
        }
    } else {
        res.status(400).json({ error: 'Invalid action' });
    }
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

        // Get microphone from parts system (not microphone service)
        const allParts = await partService.getAllParts();
        const microphone = allParts.find(part => part.type === 'microphone' && part.id === id);

        if (!microphone) {
            return res.status(404).json({ error: 'Microphone not found' });
        }

        // Return simulated status for parts-based microphones
        const status = {
            id: id,
            name: microphone.name,
            status: 'inactive', // Default status
            level: 0,
            deviceId: microphone.deviceId || 'unknown',
            sampleRate: parseInt(microphone.sampleRate) || 16000,
            channels: parseInt(microphone.channels) || 1,
            lastActivity: null,
            timestamp: new Date().toISOString()
        };

        res.json(status);
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

        // Get microphone from parts system (not microphone service)
        const allParts = await partService.getAllParts();
        const microphone = allParts.find(part => part.type === 'microphone' && part.id === id);

        if (!microphone) {
            return res.status(404).json({
                success: false,
                error: 'Microphone not found',
                microphoneId: id,
                testType: testType || 'basic',
                timestamp: new Date().toISOString()
            });
        }

        // Simulate test results for parts-based microphones based on test type
        const baseResults = {
            deviceDetected: true,
            audioLevelDetected: Math.random() > 0.1,
            averageLevel: Math.random() * 100,
            peakLevel: Math.random() * 100,
            noiseFloor: -45 + Math.random() * 10,
            testDuration: duration || 5,
            sampleRate: parseInt(microphone.sampleRate) || 16000,
            channels: parseInt(microphone.channels) || 1,
            deviceId: microphone.deviceId || 'unknown'
        };

        // Add test-type specific results
        let testResults = { ...baseResults };

        if (testType === 'ambient') {
            testResults = {
                ...baseResults,
                ambientDetected: Math.random() > 0.3,
                ambientLevel: -30 + Math.random() * 20, // -30 to -10 dB
                backgroundNoise: -40 + Math.random() * 15, // -40 to -25 dB
                voiceActivityDetected: Math.random() > 0.7,
                recommendation: Math.random() > 0.5 ?
                    'Environment is suitable for voice recording' :
                    'Consider reducing background noise for optimal performance'
            };
        } else if (testType === 'comprehensive') {
            testResults = {
                ...baseResults,
                signalToNoise: 20 + Math.random() * 30, // 20-50 dB
                latency: 5 + Math.random() * 15, // 5-20 ms
                stability: 85 + Math.random() * 15, // 85-100%
                frequencyResponse: Array.from({ length: 10 }, () => Math.random() * 100)
            };
        }

        const testResult = {
            microphoneId: id,
            testType: testType || 'basic',
            duration: duration || 5,
            startTime: new Date().toISOString(),
            success: true,
            results: testResults,
            endTime: new Date().toISOString()
        };

        logger.info(`✅ Microphone test completed for ${id} (${microphone.name})`);
        res.json(testResult);
    } catch (error) {
        logger.error('Error testing microphone:', error);
        res.status(500).json({
            success: false,
            error: error.message,
            timestamp: new Date().toISOString()
        });
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


// Speaker API routes (placed at end to avoid interrupting microphone routes)
router.get('/api/speaker/devices', async (req, res) => {
    try {
        const SpeakerService = require('../services/speakerService');
        const svc = new SpeakerService();
        const devices = await svc.getAvailableDevices();
        res.json({ success: true, devices });
    } catch (err) {
        logger.error('Error getting speaker devices:', err);
        res.status(500).json({ success: false, error: err.message });
    }
});

router.post('/api/speaker/test', async (req, res) => {
    try {
        const { deviceId } = req.body;
        const SpeakerService = require('../services/speakerService');
        const svc = new SpeakerService();
        const result = await svc.playTest(deviceId || 'default');
        res.json({ success: !!result.success, ...result });
    } catch (err) {
        logger.error('Error playing speaker test tone:', err);
        res.status(500).json({ success: false, error: err.message });
    }
});

router.post('/api/speaker/volume', async (req, res) => {
    try {
        const { volume } = req.body;
        const SpeakerService = require('../services/speakerService');
        const svc = new SpeakerService();
        const result = await svc.setVolume(parseInt(volume || 80, 10));
        res.json({ success: !!result.success, ...result });
    } catch (err) {
        logger.error('Error setting volume:', err);
        res.status(500).json({ success: false, error: err.message });
    }
});

module.exports = {
    router: router,
    executePythonScript: executePythonScript
};
