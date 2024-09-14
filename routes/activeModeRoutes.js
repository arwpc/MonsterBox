const express = require('express');
const router = express.Router();
const characterService = require('../services/characterService');
const sceneService = require('../services/sceneService');

router.get('/', async (req, res) => {
    try {
        const characters = await characterService.getAllCharacters();
        res.render('active-mode', { 
            title: 'Active Mode',
            characters: characters
        });
    } catch (error) {
        console.error('Error fetching data for Active Mode:', error);
        res.status(500).send('An error occurred while loading Active Mode');
    }
});

router.get('/character/:id', async (req, res) => {
    try {
        const characterId = parseInt(req.params.id);
        const character = await characterService.getCharacterById(characterId);
        if (character) {
            res.json(character);
        } else {
            res.status(404).json({ error: 'Character not found' });
        }
    } catch (error) {
        console.error('Error fetching character:', error);
        res.status(500).json({ error: 'An error occurred while fetching the character' });
    }
});

router.get('/character/:id/scenes', async (req, res) => {
    try {
        const characterId = parseInt(req.params.id);
        const scenes = await sceneService.getScenesByCharacterId(characterId);
        res.json(scenes);
    } catch (error) {
        console.error('Error fetching scenes for character:', error);
        res.status(500).json({ error: 'An error occurred while fetching scenes' });
    }
});

module.exports = router;
