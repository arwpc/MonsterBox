const express = require('express');
const router = express.Router();
const characterService = require('../services/characterService');
const sceneService = require('../services/sceneService');
const logger = require('../scripts/logger');

router.get('/', async (req, res) => {
    try {
        const characters = await characterService.getAllCharacters();
        logger.info(`Fetched ${characters.length} characters for Active Mode`);
        res.render('active-mode', { 
            title: 'Active Mode',
            characters: characters
        });
    } catch (error) {
        logger.error('Error fetching data for Active Mode:', { error: error.message, stack: error.stack });
        res.status(500).render('error', { error: 'Failed to load Active Mode' });
    }
});

router.get('/character/:id', async (req, res) => {
    try {
        const characterId = parseInt(req.params.id);
        logger.info(`Fetching character with ID: ${characterId}`);
        const character = await characterService.getCharacterById(characterId);
        if (character) {
            logger.info(`Successfully fetched character: ${character.char_name} (ID: ${character.id})`);
            res.json(character);
        } else {
            logger.warn(`Character not found for ID: ${characterId}`);
            res.status(404).json({ error: 'Character not found' });
        }
    } catch (error) {
        logger.error('Error fetching character:', { error: error.message, stack: error.stack, characterId: req.params.id });
        res.status(500).json({ error: 'Failed to fetch character' });
    }
});

router.get('/character/:id/scenes', async (req, res) => {
    try {
        const characterId = parseInt(req.params.id);
        logger.info(`Fetching scenes for character ID: ${characterId}`);
        const [character, scenes] = await Promise.all([
            characterService.getCharacterById(characterId),
            sceneService.getScenesByCharacter(characterId)
        ]);
        if (!character) {
            logger.warn(`Character not found for ID: ${characterId}`);
            return res.status(404).json({ error: 'Character not found' });
        }
        logger.info(`Successfully fetched ${scenes.length} scenes for character: ${character.char_name} (ID: ${character.id})`);
        res.json(scenes);
    } catch (error) {
        logger.error('Error fetching scenes for character:', { error: error.message, stack: error.stack, characterId: req.params.id });
        res.status(500).json({ error: 'Failed to fetch scenes for character' });
    }
});

module.exports = router;
