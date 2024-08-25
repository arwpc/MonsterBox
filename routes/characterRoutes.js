const express = require('express');
const router = express.Router();
const dataManager = require('../dataManager');
const fs = require('fs').promises;
const path = require('path');
const multer = require('multer');

const upload = multer({
    dest: path.join(__dirname, '../public/images/characters')
});

router.get('/', async (req, res) => {
    try {
        const characters = await dataManager.getCharacters();
        const parts = await dataManager.getParts();
        const sounds = await dataManager.getSounds();
        res.render('characters', { title: 'Characters', characters, parts, sounds });
    } catch (error) {
        console.error('Error fetching characters:', error);
        res.status(500).send('An error occurred while fetching characters');
    }
});

router.get('/new', async (req, res) => {
    try {
        const parts = await dataManager.getParts();
        const sounds = await dataManager.getSounds();
        res.render('character-form', { title: 'Add New Character', action: '/characters', character: {}, parts, sounds });
    } catch (error) {
        console.error('Error rendering new character form:', error);
        res.status(500).send('An error occurred while loading the new character form');
    }
});

router.get('/:id/edit', async (req, res) => {
    try {
        const characters = await dataManager.getCharacters();
        const character = characters.find(c => c.id === parseInt(req.params.id));
        const parts = await dataManager.getParts();
        const sounds = await dataManager.getSounds();
        if (character) {
            res.render('character-form', { title: 'Edit Character', action: `/characters/${character.id}`, character, parts, sounds });
        } else {
            res.status(404).send('Character not found');
        }
    } catch (error) {
        console.error('Error fetching character:', error);
        res.status(500).send('An error occurred while fetching the character');
    }
});

router.post('/', upload.single('character_image'), async (req, res) => {
    try {
        const characters = await dataManager.getCharacters();
        const newCharacter = {
            id: dataManager.getNextId(characters),
            char_name: req.body.char_name,
            char_description: req.body.char_description,
            parts: req.body.parts ? req.body.parts.map(Number) : [],
            sounds: req.body.sounds ? req.body.sounds.map(Number) : [],
            image: req.file ? req.file.filename : null
        };
        characters.push(newCharacter);
        await dataManager.saveCharacters(characters);
        res.redirect('/characters');
    } catch (error) {
        console.error('Error creating character:', error);
        res.status(500).send('An error occurred while creating the character');
    }
});

router.post('/:id', upload.single('character_image'), async (req, res) => {
    try {
        const id = parseInt(req.params.id);
        const characters = await dataManager.getCharacters();
        const index = characters.findIndex(c => c.id === id);
        if (index !== -1) {
            characters[index] = {
                ...characters[index],
                char_name: req.body.char_name,
                char_description: req.body.char_description,
                parts: req.body.parts ? req.body.parts.map(Number) : [],
                sounds: req.body.sounds ? req.body.sounds.map(Number) : []
            };
            if (req.file) {
                if (characters[index].image) {
                    const oldImagePath = path.join(__dirname, '../public/images/characters', characters[index].image);
                    await fs.unlink(oldImagePath).catch(console.error);
                }
                characters[index].image = req.file.filename;
            }
            await dataManager.saveCharacters(characters);
            res.redirect('/characters');
        } else {
            res.status(404).send('Character not found');
        }
    } catch (error) {
        console.error('Error updating character:', error);
        res.status(500).send('An error occurred while updating the character');
    }
});

router.post('/:id/delete', async (req, res) => {
    try {
        const id = parseInt(req.params.id);
        const characters = await dataManager.getCharacters();
        const index = characters.findIndex(c => c.id === id);
        if (index !== -1) {
            if (characters[index].image) {
                const imagePath = path.join(__dirname, '../public/images/characters', characters[index].image);
                await fs.unlink(imagePath).catch(console.error);
            }
            characters.splice(index, 1);
            await dataManager.saveCharacters(characters);
            res.sendStatus(200);
        } else {
            res.status(404).send('Character not found');
        }
    } catch (error) {
        console.error('Error deleting character:', error);
        res.status(500).send('An error occurred while deleting the character');
    }
});

router.get('/:id/parts', async (req, res) => {
    try {
        const characterId = parseInt(req.params.id);
        const characters = await dataManager.getCharacters();
        const character = characters.find(c => c.id === characterId);
        
        if (!character) {
            return res.status(404).json({ error: 'Character not found' });
        }

        const allParts = await dataManager.getParts();
        const characterParts = allParts.filter(part => character.parts.includes(part.id));

        res.json(characterParts);
    } catch (error) {
        console.error('Error in GET /characters/:id/parts route:', error);
        res.status(500).json({ error: 'An error occurred while fetching character parts' });
    }
});

module.exports = router;
