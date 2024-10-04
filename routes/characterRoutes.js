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
        const parts = await partService.getAllParts();
        const sounds = await soundService.getAllSounds();
        res.render('character-form', { title: 'Add New Character', action: '/characters', character: {}, parts, sounds });
    } catch (error) {
        logger.error('Error rendering new character form:', error);
        res.status(500).send('An error occurred while loading the new character form');
    }
});

router.get('/:id/edit', async (req, res) => {
    try {
        const character = await characterService.getCharacterById(parseInt(req.params.id));
        const parts = await partService.getAllParts();
        const sounds = await soundService.getAllSounds();
        if (character) {
            res.render('character-form', { title: 'Edit Character', action: `/characters/${character.id}`, character, parts, sounds });
        } else {
            res.status(404).send('Character not found');
        }
    } catch (error) {
        logger.error('Error fetching character:', error);
        res.status(500).send('An error occurred while fetching the character');
    }
});

router.post('/', upload.single('character_image'), async (req, res) => {
    try {
        const newCharacter = {
            char_name: req.body.char_name,
            char_description: req.body.char_description,
            parts: req.body.parts ? req.body.parts.map(Number) : [],
            sounds: req.body.sounds ? req.body.sounds.map(Number) : [],
            image: req.file ? req.file.filename : null
        };
        await characterService.createCharacter(newCharacter);
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
            parts: req.body.parts ? req.body.parts.map(Number) : [],
            sounds: req.body.sounds ? req.body.sounds.map(Number) : []
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
        const character = await characterService.getCharacterById(characterId);
        
        if (!character) {
            logger.warn(`Character not found for ID: ${characterId}`);
            return res.status(404).json({ error: 'Character not found' });
        }

        const allParts = await partService.getAllParts();
        const characterParts = allParts.filter(part => character.parts.includes(part.id));

        res.json(characterParts);
    } catch (error) {
        logger.error('Error in GET /characters/:id/parts route:', error);
        res.status(500).json({ error: 'An error occurred while fetching character parts' });
    }
});

module.exports = router;