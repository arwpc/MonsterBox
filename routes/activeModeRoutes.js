const express = require('express');
const router = express.Router();
const characterService = require('../services/characterService');
const sceneService = require('../services/sceneService');
const logger = require('../logger');

router.get('/', async (req, res) => {
    try {
        const characters = await characterService.getAllCharacters();
        res.render('active-mode', { 
            title: 'Active Mode',
            characters: characters
        });
    } catch (error) {
        logger.error('Error fetching data for Active Mode:', { error: error.message, stack: error.stack });
        res.status(500).send('An error occurred while loading Active Mode');
    }
});

router.get('/character/:id', async (req, res) => {
    try {
        const characterId = parseInt(req.params.id);
        logger.info(`Fetching sounds for character ID: ${characterId}`);
        const character = await characterService.getCharacterById(characterId);
        if (character) {
            logger.info(`Fetched character: ${JSON.stringify(character)}`);
            res.json(character);
        } else {
            logger.warn(`Character not found for ID: ${characterId}`);
            res.status(404).json({ error: 'Character not found' });
        }
    } catch (error) {
        logger.error('Error fetching character:', { error: error.message, stack: error.stack, characterId: req.params.id });
        res.status(500).json({ error: 'An error occurred while fetching the character' });
    }
});

router.get('/character/:id/scenes', async (req, res) => {
    try {
        const characterId = parseInt(req.params.id);
        logger.info(`Fetching scenes for character ID: ${characterId}`);
        const scenes = await sceneService.getScenesByCharacter(characterId);
        logger.info(`Fetched scenes: ${JSON.stringify(scenes)}`);
        res.json(scenes);
    } catch (error) {
        logger.error('Error fetching scenes for character:', { error: error.message, stack: error.stack, characterId: req.params.id });
        res.status(500).json({ error: 'An error occurred while fetching scenes' });
    }
});

module.exports = router;
