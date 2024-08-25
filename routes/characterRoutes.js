const express = require('express');
const router = express.Router();
const dataManager = require('../dataManager');
const fs = require('fs').promises;
const path = require('path');
const multer = require('multer');

// Multer setup for file uploads
const storage = multer.diskStorage({
    destination: function (req, file, cb) {
        cb(null, 'public/images/characters/');
    },
    filename: function (req, file, cb) {
        cb(null, Date.now() + path.extname(file.originalname));
    }
});
const upload = multer({ storage: storage });

router.get('/', async (req, res) => {
    try {
        console.log('GET /characters route hit');
        const characters = await dataManager.getCharacters();
        const parts = await dataManager.getParts();
        const sounds = await dataManager.getSounds();
        console.log('Preparing to render characters page...');
        res.render('characters', { 
            title: 'Characters', 
            characters, 
            parts, 
            sounds
        });
    } catch (error) {
        console.error('Error in GET /characters route:', error);
        res.status(500).send('An error occurred while loading the characters page: ' + error.message);
    }
});

router.get('/new', async (req, res) => {
    try {
        const parts = await dataManager.getParts();
        const sounds = await dataManager.getSounds();
        res.render('character-form', { 
            title: 'Add New Character', 
            action: '/characters', 
            character: {}, 
            parts, 
            sounds 
        });
    } catch (error) {
        console.error('Error in GET /characters/new route:', error);
        res.status(500).send('An error occurred while loading the new character form: ' + error.message);
    }
});

router.get('/:id/edit', async (req, res) => {
    try {
        const characters = await dataManager.getCharacters();
        const parts = await dataManager.getParts();
        const sounds = await dataManager.getSounds();
        const character = characters.find(c => c.id === parseInt(req.params.id));
        if (character) {
            res.render('character-form', { 
                title: 'Edit Character', 
                action: '/characters/' + character.id, 
                character, 
                parts, 
                sounds 
            });
        } else {
            res.status(404).send('Character not found');
        }
    } catch (error) {
        console.error('Error in GET /characters/:id/edit route:', error);
        res.status(500).send('An error occurred while loading the edit character form: ' + error.message);
    }
});

router.post('/', upload.single('character_image'), async (req, res) => {
    try {
        const characters = await dataManager.getCharacters();
        const newCharacter = {
            id: dataManager.getNextId(characters),
            char_name: req.body.char_name,
            char_description: req.body.char_description,
            parts: Array.isArray(req.body.parts) ? req.body.parts.map(Number) : req.body.parts ? [Number(req.body.parts)] : [],
            sounds: Array.isArray(req.body.sounds) ? req.body.sounds.map(Number) : req.body.sounds ? [Number(req.body.sounds)] : [],
            image: req.file ? req.file.filename : null
        };
        characters.push(newCharacter);
        await dataManager.saveCharacters(characters);
        res.redirect('/characters');
    } catch (error) {
        console.error('Error in POST /characters route:', error);
        res.status(500).send('An error occurred while creating the character: ' + error.message);
    }
});

router.post('/:id', upload.single('character_image'), async (req, res) => {
    try {
        const id = parseInt(req.params.id);
        const characters = await dataManager.getCharacters();
        const index = characters.findIndex(c => c.id === id);
        if (index !== -1) {
            const oldImage = characters[index].image;
            characters[index] = {
                id: id,
                char_name: req.body.char_name,
                char_description: req.body.char_description,
                parts: Array.isArray(req.body.parts) ? req.body.parts.map(Number) : req.body.parts ? [Number(req.body.parts)] : [],
                sounds: Array.isArray(req.body.sounds) ? req.body.sounds.map(Number) : req.body.sounds ? [Number(req.body.sounds)] : [],
                image: req.file ? req.file.filename : oldImage
            };
            if (req.file && oldImage) {
                try {
                    await fs.unlink(path.join('public', 'images', 'characters', oldImage));
                } catch (error) {
                    console.error('Error deleting old image:', error);
                }
            }
            await dataManager.saveCharacters(characters);
            res.redirect('/characters');
        } else {
            res.status(404).send('Character not found');
        }
    } catch (error) {
        console.error('Error in POST /characters/:id route:', error);
        res.status(500).send('An error occurred while updating the character: ' + error.message);
    }
});

router.post('/:id/delete', async (req, res) => {
    try {
        console.log('DELETE /characters/:id route hit. ID:', req.params.id);
        const id = parseInt(req.params.id);
        const characters = await dataManager.getCharacters();
        const index = characters.findIndex(c => c.id === id);
        if (index !== -1) {
            const character = characters[index];
            if (character.image) {
                try {
                    await fs.unlink(path.join('public', 'images', 'characters', character.image));
                } catch (error) {
                    console.error('Error deleting character image:', error);
                }
            }
            characters.splice(index, 1);
            await dataManager.saveCharacters(characters);
            res.sendStatus(200);
        } else {
            res.status(404).send('Character not found');
        }
    } catch (error) {
        console.error('Error in POST /characters/:id/delete route:', error);
        res.status(500).send('An error occurred while deleting the character: ' + error.message);
    }
});

// New route for fetching light parts
router.get('/:id/light-parts', async (req, res) => {
    try {
        const characterId = parseInt(req.params.id);
        const characters = await dataManager.getCharacters();
        const character = characters.find(c => c.id === characterId);
        
        if (!character) {
            return res.status(404).json({ error: 'Character not found' });
        }

        const allParts = await dataManager.getParts();
        const characterParts = allParts.filter(part => character.parts.includes(part.id) && (part.type === 'led' || part.type === 'light'));

        res.json(characterParts);
    } catch (error) {
        console.error('Error in GET /characters/:id/light-parts route:', error);
        res.status(500).json({ error: 'An error occurred while fetching light parts' });
    }
});

module.exports = router;
