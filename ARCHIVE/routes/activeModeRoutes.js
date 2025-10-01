const express = require('express');
const router = express.Router();
const characterService = require('../services/characterService');
const sceneService = require('../services/sceneService');
const partService = require('../services/partService');
const soundService = require('../services/soundService');
const logger = require('../scripts/logger');

router.get('/', async (req, res) => {
    try {
        const characterId = req.query.characterId || req.session.characterId;
        logger.info(`Active Mode: Session characterId: ${characterId}`);

        if (!characterId) {
            logger.warn('No character selected for Active Mode');
            return res.redirect('/?error=noCharacterSelected');
        }

        const character = await characterService.getCharacterById(parseInt(characterId));
        logger.info(`Active Mode: Retrieved character: ${JSON.stringify(character)}`);

        if (!character) {
            logger.warn(`Character not found for ID: ${characterId}`);
            return res.redirect('/?error=characterNotFound');
        }

        // Ensure character has an image property, if not set a default
        if (!character.image) {
            character.image = 'placeholder.jpg';
        }

        logger.info(`Fetched character for Active Mode: ${character.char_name} (ID: ${character.id})`);
        res.render('active-mode', { 
            title: 'Active Mode',
            character: character
        });
    } catch (error) {
        logger.error('Error fetching data for Active Mode:', { error: error.message, stack: error.stack });
        res.status(500).render('error', { error: 'Failed to load Active Mode' });
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
        logger.debug(`Scenes data: ${JSON.stringify(scenes)}`);
        res.json(scenes);
    } catch (error) {
        logger.error('Error fetching scenes for character:', { error: error.message, stack: error.stack, characterId: req.params.id });
        res.status(500).json({ error: 'Failed to fetch scenes for character' });
    }
});

router.get('/character/:id/parts', async (req, res) => {
    try {
        const characterId = parseInt(req.params.id);
        logger.info(`Fetching parts for character ID: ${characterId}`);
        const [character, parts] = await Promise.all([
            characterService.getCharacterById(characterId),
            partService.getPartsByCharacter(characterId)
        ]);
        if (!character) {
            logger.warn(`Character not found for ID: ${characterId}`);
            return res.status(404).json({ error: 'Character not found' });
        }
        logger.info(`Successfully fetched ${parts.length} parts for character: ${character.char_name} (ID: ${character.id})`);
        logger.debug(`Parts data: ${JSON.stringify(parts)}`);
        
        // Log the exact response being sent
        logger.info(`Sending parts response: ${JSON.stringify(parts)}`);
        
        res.json(parts);
    } catch (error) {
        logger.error('Error fetching parts for character:', { error: error.message, stack: error.stack, characterId: req.params.id });
        res.status(500).json({ error: 'Failed to fetch parts for character' });
    }
});

module.exports = router;