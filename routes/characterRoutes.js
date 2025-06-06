const express = require('express');
const router = express.Router();
const characterService = require('../services/characterService');
const partService = require('../services/partService');
const soundService = require('../services/soundService');
const animatronicService = require('../services/animatronicService');
const systemConfigService = require('../services/systemConfigService');
const fs = require('fs').promises;
const path = require('path');
const multer = require('multer');
const logger = require('../scripts/logger');
const { exec } = require('child_process');
const util = require('util');
const execAsync = util.promisify(exec);

const upload = multer({
    dest: path.join(__dirname, '../public/images/characters')
});

router.get('/', async (req, res) => {
    try {
        const characters = await characterService.getAllCharacters();
        const parts = await partService.getAllParts();
        const sounds = await soundService.getAllSounds();
        res.render('characters', { title: 'Characters', characters, parts, sounds });
    } catch (error) {
        logger.error('Error fetching characters:', error);
        res.status(500).send('An error occurred while fetching characters');
    }
});

router.get('/new', async (req, res) => {
    try {
        // Get all parts and sounds
        const allParts = await partService.getAllParts();
        const allSounds = await soundService.getAllSounds();
        
        // For new character, only show unassigned parts
        const parts = allParts.filter(part => !part.characterId);
        
        // Show all sounds for new character (same as edit form)
        const sounds = allSounds;
        
        // Provide a temporary character object with temporary ID to ensure the form 
        // behaves consistently with the edit form
        const tempCharacter = {
            id: 'new',  // Using 'new' instead of null so template conditions work
            char_name: '',
            char_description: '',
            image: null
        };
        
        res.render('character-form', {
            title: 'Add New Character',
            action: '/characters',
            character: tempCharacter,
            parts,
            sounds,
            webcam: null, // New characters don't have webcams yet
            isNewCharacter: true  // Flag to help template distinguish new vs edit
        });
    } catch (error) {
        logger.error('Error rendering new character form:', error);
        res.status(500).send('An error occurred while loading the new character form');
    }
});

router.get('/:id/edit', async (req, res) => {
    try {
        const characterId = parseInt(req.params.id);
        const character = await characterService.getCharacterById(characterId);
        if (!character) {
            return res.status(404).send('Character not found');
        }

        // Get all parts and sounds
        const allParts = await partService.getAllParts();
        const allSounds = await soundService.getAllSounds();

        // Filter parts to show only unassigned parts and parts assigned to this character
        const parts = allParts.filter(part => 
            !part.characterId || part.characterId === characterId
        );

        // Show all available sounds in the database for character edit form
        const sounds = allSounds;

        // Get webcam information for this character
        const characterWebcamService = require('../services/characterWebcamService');
        const webcam = await characterWebcamService.getWebcamByCharacter(character.id);

        res.render('character-form', {
            title: 'Edit Character',
            action: `/characters/${character.id}`,
            character,
            parts,
            sounds,
            webcam
        });
    } catch (error) {
        logger.error('Error fetching character:', error);
        res.status(500).send('An error occurred while fetching the character');
    }
});

async function updatePartsAndSounds(characterId, selectedPartIds, selectedSoundIds) {
    // Get all current parts and sounds
    const allParts = await partService.getAllParts();
    const allSounds = await soundService.getAllSounds();

    // Update parts
    for (const part of allParts) {
        if (selectedPartIds.includes(part.id)) {
            // Part should be associated with this character
            if (part.characterId !== characterId) {
                await partService.updatePart(part.id, { ...part, characterId });
            }
        } else if (part.characterId === characterId) {
            // Part should no longer be associated with this character
            await partService.updatePart(part.id, { ...part, characterId: null });
        }
    }

    // Update sounds
    for (const sound of allSounds) {
        const characterIds = sound.characterIds || [];
        if (selectedSoundIds.includes(sound.id)) {
            // Sound should be associated with this character
            if (!characterIds.includes(characterId)) {
                await soundService.updateSound(sound.id, {
                    ...sound,
                    characterIds: [...characterIds, characterId]
                });
            }
        } else if (characterIds.includes(characterId)) {
            // Sound should no longer be associated with this character
            await soundService.updateSound(sound.id, {
                ...sound,
                characterIds: characterIds.filter(id => id !== characterId)
            });
        }
    }
}

router.post('/', upload.single('character_image'), async (req, res) => {
    try {
        const newCharacter = {
            char_name: req.body.char_name,
            char_description: req.body.char_description,
            parts: [],
            sounds: [],
            image: req.file ? req.file.filename : null
        };

        // Add animatronic configuration if enabled
        if (req.body.animatronic_enabled === 'on') {
            newCharacter.animatronic = {
                enabled: true,
                status: req.body.animatronic_status || 'offline',
                character_type: req.body.character_type || '',
                description: req.body.animatronic_description || '',
                hardware_monitoring: req.body.hardware_monitoring === 'on',
                services: [
                    "monsterbox",
                    "nginx",
                    "ssh",
                    "systemd-resolved",
                    "bluetooth",
                    "gpio-control"
                ],
                log_types: [
                    "system",
                    "auth",
                    "kernel",
                    "daemon",
                    "user"
                ],
                animatronic_parts: []
            };

            // Add RPI configuration if host is provided
            if (req.body.rpi_host) {
                newCharacter.animatronic.rpi_config = {
                    host: req.body.rpi_host,
                    user: req.body.rpi_user || 'remote',
                    password: req.body.rpi_password || '',
                    password: req.body.rpi_password || '',
                    ssh_key_path: "~/.ssh/id_rsa",
                    collection_interval: parseInt(req.body.collection_interval) || 300,
                    max_lines: parseInt(req.body.max_lines) || 1000
                };
            }
        } else {
            newCharacter.animatronic = {
                enabled: false,
                status: 'virtual',
                character_type: 'Virtual Character',
                description: 'Software-only character',
                rpi_config: null,
                services: ["monsterbox"],
                log_types: ["system", "application"],
                hardware_monitoring: false,
                animatronic_parts: []
            };
        }

        const character = await characterService.createCharacter(newCharacter);

        const selectedPartIds = req.body.parts ? 
            (Array.isArray(req.body.parts) ? req.body.parts.map(Number) : [Number(req.body.parts)]) : [];
        const selectedSoundIds = req.body.sounds ? 
            (Array.isArray(req.body.sounds) ? req.body.sounds.map(Number) : [Number(req.body.sounds)]) : [];

        await updatePartsAndSounds(character.id, selectedPartIds, selectedSoundIds);

        res.redirect('/characters');
    } catch (error) {
        logger.error('Error creating character:', error);
        res.status(500).send('An error occurred while creating the character');
    }
});




router.post('/:id', upload.single('character_image'), async (req, res) => {
    try {
        const id = parseInt(req.params.id);
        const updatedCharacter = {
            char_name: req.body.char_name,
            char_description: req.body.char_description,
            parts: [],
            sounds: []
        };

        // Add animatronic configuration if enabled
        if (req.body.animatronic_enabled === 'on') {
            updatedCharacter.animatronic = {
                enabled: true,
                status: req.body.animatronic_status || 'offline',
                character_type: req.body.character_type || '',
                description: req.body.animatronic_description || '',
                hardware_monitoring: req.body.hardware_monitoring === 'on',
                services: [
                    "monsterbox",
                    "nginx",
                    "ssh",
                    "systemd-resolved",
                    "bluetooth",
                    "gpio-control"
                ],
                log_types: [
                    "system",
                    "auth",
                    "kernel",
                    "daemon",
                    "user"
                ],
                animatronic_parts: []
            };

            // Add RPI configuration if host is provided
            if (req.body.rpi_host) {
                updatedCharacter.animatronic.rpi_config = {
                    host: req.body.rpi_host,
                    user: req.body.rpi_user || 'remote',
                    password: req.body.rpi_password || '',
                    ssh_key_path: "~/.ssh/id_rsa",
                    collection_interval: parseInt(req.body.collection_interval) || 300,
                    max_lines: parseInt(req.body.max_lines) || 1000
                };
            }
        } else {
            updatedCharacter.animatronic = {
                enabled: false,
                status: 'virtual',
                character_type: 'Virtual Character',
                description: 'Software-only character',
                rpi_config: null,
                services: ["monsterbox"],
                log_types: ["system", "application"],
                hardware_monitoring: false,
                animatronic_parts: []
            };
        }

        if (req.file) {
            const character = await characterService.getCharacterById(id);
            if (character.image) {
                const oldImagePath = path.join(__dirname, '../public/images/characters', character.image);
                await fs.unlink(oldImagePath).catch(err => logger.error('Error deleting old character image:', err));
            }
            updatedCharacter.image = req.file.filename;
        }

        await characterService.updateCharacter(id, updatedCharacter);

        const selectedPartIds = req.body.parts ? 
            (Array.isArray(req.body.parts) ? req.body.parts.map(Number) : [Number(req.body.parts)]) : [];
        const selectedSoundIds = req.body.sounds ? 
            (Array.isArray(req.body.sounds) ? req.body.sounds.map(Number) : [Number(req.body.sounds)]) : [];

        await updatePartsAndSounds(id, selectedPartIds, selectedSoundIds);

        res.redirect('/characters');
    } catch (error) {
        logger.error('Error updating character:', error);
        res.status(500).send('An error occurred while updating the character');
    }
});

router.post('/:id/delete', async (req, res) => {
    try {
        const id = parseInt(req.params.id);
        const character = await characterService.getCharacterById(id);

        // Remove character associations from parts and sounds
        await updatePartsAndSounds(id, [], []);

        if (character.image) {
            const imagePath = path.join(__dirname, '../public/images/characters', character.image);
            await fs.unlink(imagePath).catch(err => logger.error('Error deleting character image:', err));
        }
        await characterService.deleteCharacter(id);
        res.sendStatus(200);
    } catch (error) {
        logger.error('Error deleting character:', error);
        res.status(500).send('An error occurred while deleting the character');
    }
});

router.get('/:id/parts', async (req, res) => {
    try {
        const characterId = parseInt(req.params.id);
        const allParts = await partService.getAllParts();
        const characterParts = allParts.filter(part => part.characterId === characterId);
        res.json(characterParts);
    } catch (error) {
        logger.error('Error in GET /characters/:id/parts route:', error);
        res.status(500).json({ error: 'An error occurred while fetching character parts' });
    }
});

// Animatronic Management Routes

// Test animatronic connection
router.post('/:id/test-connection', async (req, res) => {
    try {
        const characterId = parseInt(req.params.id);
        logger.info(`Testing connection for character ${characterId}`);

        const result = await animatronicService.testCharacterConnection(characterId);

        res.json({
            success: true,
            result: result
        });
    } catch (error) {
        logger.error('Error testing animatronic connection:', error);
        res.status(500).json({
            success: false,
            error: error.message
        });
    }
});

// Collect logs from animatronic
router.post('/:id/collect-logs', async (req, res) => {
    try {
        const characterId = parseInt(req.params.id);
        const { lines = 100, since = null, logTypes = ['system', 'auth', 'kernel'] } = req.body;

        logger.info(`Collecting logs for character ${characterId}`);

        const result = await animatronicService.collectCharacterLogs(characterId, {
            lines: parseInt(lines),
            since: since,
            logTypes: Array.isArray(logTypes) ? logTypes : [logTypes]
        });

        res.json({
            success: true,
            result: result
        });
    } catch (error) {
        logger.error('Error collecting animatronic logs:', error);
        res.status(500).json({
            success: false,
            error: error.message
        });
    }
});

// Setup SSH for animatronic
router.post('/:id/setup-ssh', async (req, res) => {
    try {
        const characterId = parseInt(req.params.id);
        logger.info(`Setting up SSH for character ${characterId}`);

        const result = await animatronicService.setupCharacterSSH(characterId);

        res.json({
            success: true,
            result: result
        });
    } catch (error) {
        logger.error('Error setting up SSH:', error);
        res.status(500).json({
            success: false,
            error: error.message
        });
    }
});

// Get animatronic system information
router.get('/:id/system-info', async (req, res) => {
    try {
        const characterId = parseInt(req.params.id);
        logger.info(`Getting system info for character ${characterId}`);

        const result = await systemConfigService.getCharacterSystemInfo(characterId);

        res.json({
            success: true,
            result: result
        });
    } catch (error) {
        logger.error('Error getting system info:', error);
        res.status(500).json({
            success: false,
            error: error.message
        });
    }
});

// Reboot animatronic system
router.post('/:id/reboot', async (req, res) => {
    try {
        const characterId = parseInt(req.params.id);
        logger.info(`Rebooting system for character ${characterId}`);

        const result = await systemConfigService.rebootCharacterSystem(characterId);

        res.json({
            success: true,
            result: result
        });
    } catch (error) {
        logger.error('Error rebooting system:', error);
        res.status(500).json({
            success: false,
            error: error.message
        });
    }
});

// Character-specific servo configuration routes

// Get character servos page
router.get('/:id/servos', async (req, res) => {
    try {
        const characterId = parseInt(req.params.id);
        const character = await characterService.getCharacterById(characterId);
        const result = await systemConfigService.getCharacterServos(characterId);

        res.render('character-servos', {
            title: `Servo Configuration - ${character.char_name}`,
            character: character,
            servos: result.servos,
            availableServos: result.availableServos
        });
    } catch (error) {
        logger.error('Error getting character servos page:', error);
        res.status(500).send('An error occurred while loading servo configuration: ' + error.message);
    }
});

// Get character servos API
router.get('/:id/servos/api', async (req, res) => {
    try {
        const characterId = parseInt(req.params.id);
        const result = await systemConfigService.getCharacterServos(characterId);

        res.json({
            success: true,
            result: result
        });
    } catch (error) {
        logger.error('Error getting character servos:', error);
        res.status(500).json({
            success: false,
            error: error.message
        });
    }
});

// Add servo to character
router.post('/:id/servos', async (req, res) => {
    try {
        const characterId = parseInt(req.params.id);
        const servoConfig = req.body;

        const result = await systemConfigService.addCharacterServo(characterId, servoConfig);

        res.json({
            success: true,
            result: result
        });
    } catch (error) {
        logger.error('Error adding character servo:', error);
        res.status(500).json({
            success: false,
            error: error.message
        });
    }
});

// Update character servo
router.put('/:id/servos/:servoId', async (req, res) => {
    try {
        const characterId = parseInt(req.params.id);
        const servoId = parseInt(req.params.servoId);
        const updates = req.body;

        const result = await systemConfigService.updateCharacterServo(characterId, servoId, updates);

        res.json({
            success: true,
            result: result
        });
    } catch (error) {
        logger.error('Error updating character servo:', error);
        res.status(500).json({
            success: false,
            error: error.message
        });
    }
});

// Delete character servo
router.delete('/:id/servos/:servoId', async (req, res) => {
    try {
        const characterId = parseInt(req.params.id);
        const servoId = parseInt(req.params.servoId);

        const result = await systemConfigService.deleteCharacterServo(characterId, servoId);

        res.json({
            success: true,
            result: result
        });
    } catch (error) {
        logger.error('Error deleting character servo:', error);
        res.status(500).json({
            success: false,
            error: error.message
        });
    }
});

// Test character servo
router.post('/:id/servos/:servoId/test', async (req, res) => {
    try {
        const characterId = parseInt(req.params.id);
        const servoId = parseInt(req.params.servoId);
        const { angle, duration } = req.body;

        const result = await systemConfigService.testCharacterServo(characterId, servoId, angle, duration);

        res.json({
            success: true,
            result: result
        });
    } catch (error) {
        logger.error('Error testing character servo:', error);
        res.status(500).json({
            success: false,
            error: error.message
        });
    }
});

// Remove servo from character
router.delete('/:id/servos/:servoId', async (req, res) => {
    try {
        const characterId = parseInt(req.params.id);
        const servoId = parseInt(req.params.servoId);

        const result = await systemConfigService.removeCharacterServo(characterId, servoId);

        res.json({
            success: true,
            result: result
        });
    } catch (error) {
        logger.error('Error removing character servo:', error);
        res.status(500).json({
            success: false,
            error: error.message
        });
    }
});

module.exports = router;
