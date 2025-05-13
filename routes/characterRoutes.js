const express = require('express');
const router = express.Router();
const characterService = require('../services/characterService');
const partService = require('../services/partService');
const soundService = require('../services/soundService');
const fs = require('fs').promises;
const path = require('path');
const multer = require('multer');
const logger = require('../scripts/logger');

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

        // Filter sounds to show only unassigned sounds and sounds assigned to this character
        const sounds = allSounds.filter(sound => 
            !sound.characterIds || 
            sound.characterIds.length === 0 || 
            sound.characterIds.includes(characterId)
        );

        res.render('character-form', { 
            title: 'Edit Character', 
            action: `/characters/${character.id}`, 
            character, 
            parts, 
            sounds 
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

module.exports = router;
