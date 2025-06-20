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
                motion_tracking: {
                    enabled: req.body.motion_tracking_enabled === 'on',
                    sensitivity: 50,
                    min_area: 500,
                    last_motion: null,
                    motion_center: null
                },
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
                    ssh_key_path: "~/.ssh/id_rsa"
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
                motion_tracking: {
                    enabled: req.body.motion_tracking_enabled === 'on',
                    sensitivity: 50,
                    min_area: 500,
                    last_motion: null,
                    motion_center: null
                },
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
                    ssh_key_path: "~/.ssh/id_rsa"
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

// Character-Part Assignment Routes
router.get('/:id/parts', async (req, res) => {
    try {
        const characterId = parseInt(req.params.id);
        const character = await characterService.getCharacterById(characterId);
        if (!character) {
            return res.status(404).send('Character not found');
        }

        // Get all parts and filter by character assignment
        const allParts = await partService.getAllParts();
        const assignedParts = allParts.filter(part => part.characterId === characterId);
        const availableParts = allParts.filter(part => !part.characterId || part.characterId === characterId);

        res.render('character-parts', {
            title: `${character.char_name} - Hardware Parts`,
            character,
            assignedParts,
            availableParts
        });
    } catch (error) {
        logger.error('Error fetching character parts:', error);
        res.status(500).send('An error occurred while fetching character parts');
    }
});

// Assign part to character
router.post('/:id/parts/assign', async (req, res) => {
    try {
        const characterId = parseInt(req.params.id);
        const partId = parseInt(req.body.partId);

        const character = await characterService.getCharacterById(characterId);
        if (!character) {
            return res.status(404).json({ success: false, error: 'Character not found' });
        }

        const part = await partService.getPartById(partId);
        if (!part) {
            return res.status(404).json({ success: false, error: 'Part not found' });
        }

        // Check if part is already assigned to another character
        if (part.characterId && part.characterId !== characterId) {
            return res.status(400).json({
                success: false,
                error: 'Part is already assigned to another character'
            });
        }

        // Assign part to character
        await partService.updatePart(partId, { ...part, characterId });

        logger.info(`✅ Assigned part ${partId} to character ${characterId}`);
        res.json({ success: true, message: 'Part assigned successfully' });
    } catch (error) {
        logger.error('Error assigning part to character:', error);
        res.status(500).json({ success: false, error: error.message });
    }
});

// Unassign part from character
router.post('/:id/parts/unassign', async (req, res) => {
    try {
        const characterId = parseInt(req.params.id);
        const partId = parseInt(req.body.partId);

        const part = await partService.getPartById(partId);
        if (!part) {
            return res.status(404).json({ success: false, error: 'Part not found' });
        }

        if (part.characterId !== characterId) {
            return res.status(400).json({
                success: false,
                error: 'Part is not assigned to this character'
            });
        }

        // Unassign part from character
        await partService.updatePart(partId, { ...part, characterId: null });

        logger.info(`✅ Unassigned part ${partId} from character ${characterId}`);
        res.json({ success: true, message: 'Part unassigned successfully' });
    } catch (error) {
        logger.error('Error unassigning part from character:', error);
        res.status(500).json({ success: false, error: error.message });
    }
});

// Character-AI Assignment Routes
router.get('/:id/ai', async (req, res) => {
    try {
        const characterId = parseInt(req.params.id);
        const character = await characterService.getCharacterById(characterId);
        if (!character) {
            return res.status(404).send('Character not found');
        }

        // Load AI instances
        const aiInstancesPath = path.join(__dirname, '..', 'data', 'ai-instances.json');
        const aiInstancesData = await fs.readFile(aiInstancesPath, 'utf8');
        const allAIInstances = JSON.parse(aiInstancesData);

        // Get assigned AI instances for this character
        const assignedAIInstances = character.ai_instances || [];
        const availableAIInstances = allAIInstances.filter(ai =>
            !assignedAIInstances.includes(ai.id)
        );

        res.render('character-ai', {
            title: `${character.char_name} - AI Instances`,
            character,
            assignedAIInstances: allAIInstances.filter(ai => assignedAIInstances.includes(ai.id)),
            availableAIInstances
        });
    } catch (error) {
        logger.error('Error fetching character AI instances:', error);
        res.status(500).send('An error occurred while fetching character AI instances');
    }
});

// Assign AI instance to character
router.post('/:id/ai/assign', async (req, res) => {
    try {
        const characterId = parseInt(req.params.id);
        const aiInstanceId = req.body.aiInstanceId;

        const character = await characterService.getCharacterById(characterId);
        if (!character) {
            return res.status(404).json({ success: false, error: 'Character not found' });
        }

        // Initialize ai_instances array if it doesn't exist
        if (!character.ai_instances) {
            character.ai_instances = [];
        }

        // Check if AI instance is already assigned
        if (character.ai_instances.includes(aiInstanceId)) {
            return res.status(400).json({
                success: false,
                error: 'AI instance is already assigned to this character'
            });
        }

        // Add AI instance to character
        character.ai_instances.push(aiInstanceId);

        // Also update chatterpi_config for compatibility
        if (!character.chatterpi_config) {
            character.chatterpi_config = {};
        }
        if (!character.chatterpi_config.ai_characters) {
            character.chatterpi_config.ai_characters = [];
        }

        // Add to chatterpi_config if not already there
        if (!character.chatterpi_config.ai_characters.includes(aiInstanceId)) {
            character.chatterpi_config.ai_characters.push(aiInstanceId);
        }

        // Set as default if it's the first AI assigned
        if (!character.chatterpi_config.default_character) {
            character.chatterpi_config.default_character = aiInstanceId;
        }

        await characterService.updateCharacter(characterId, character);

        logger.info(`✅ Assigned AI instance ${aiInstanceId} to character ${characterId}`);
        res.json({ success: true, message: 'AI instance assigned successfully' });
    } catch (error) {
        logger.error('Error assigning AI instance to character:', error);
        res.status(500).json({ success: false, error: error.message });
    }
});

// Unassign AI instance from character
router.post('/:id/ai/unassign', async (req, res) => {
    try {
        const characterId = parseInt(req.params.id);
        const aiInstanceId = req.body.aiInstanceId;

        const character = await characterService.getCharacterById(characterId);
        if (!character) {
            return res.status(404).json({ success: false, error: 'Character not found' });
        }

        if (!character.ai_instances || !character.ai_instances.includes(aiInstanceId)) {
            return res.status(400).json({
                success: false,
                error: 'AI instance is not assigned to this character'
            });
        }

        // Remove AI instance from character
        character.ai_instances = character.ai_instances.filter(id => id !== aiInstanceId);

        // Also update chatterpi_config for compatibility
        if (character.chatterpi_config && character.chatterpi_config.ai_characters) {
            character.chatterpi_config.ai_characters = character.chatterpi_config.ai_characters.filter(id => id !== aiInstanceId);

            // If this was the default character, clear the default
            if (character.chatterpi_config.default_character === aiInstanceId) {
                character.chatterpi_config.default_character = character.chatterpi_config.ai_characters.length > 0
                    ? character.chatterpi_config.ai_characters[0]
                    : null;
            }
        }

        await characterService.updateCharacter(characterId, character);

        logger.info(`✅ Unassigned AI instance ${aiInstanceId} from character ${characterId}`);
        res.json({ success: true, message: 'AI instance unassigned successfully' });
    } catch (error) {
        logger.error('Error unassigning AI instance from character:', error);
        res.status(500).json({ success: false, error: error.message });
    }
});

// Remove all AI assignments from character
router.post('/:id/ai/remove-all', async (req, res) => {
    try {
        const characterId = parseInt(req.params.id);

        const character = await characterService.getCharacterById(characterId);
        if (!character) {
            return res.status(404).json({ success: false, error: 'Character not found' });
        }

        // Clear all AI assignments
        if (character.chatterpi_config) {
            character.chatterpi_config.ai_characters = [];
            character.chatterpi_config.default_character = null;
        }
        if (character.ai_instances) {
            character.ai_instances = [];
        }

        await characterService.updateCharacter(characterId, character);

        logger.info(`✅ Removed all AI assignments from character ${characterId}`);
        res.json({ success: true, message: 'All AI assignments removed successfully' });
    } catch (error) {
        logger.error('Error removing all AI assignments from character:', error);
        res.status(500).json({ success: false, error: error.message });
    }
});

module.exports = router;
