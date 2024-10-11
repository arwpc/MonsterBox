// File: controllers/sceneController.js

const sceneService = require('../services/sceneService');
const characterService = require('../services/characterService');
const partService = require('../services/partService');
const soundService = require('../services/soundService');
const logger = require('../scripts/logger');

const sceneController = {
    getAllScenes: async (req, res, next, characterId) => {
        try {
            const scenes = await sceneService.getScenesByCharacter(characterId);
            const character = await characterService.getCharacterById(characterId);
            
            logger.debug(`Character data: ${JSON.stringify(character)}`);
            
            if (!character) {
                logger.warn(`Character with ID ${characterId} not found`);
                return res.status(404).render('error', { error: 'Character not found' });
            }
            
            logger.info(`Retrieved ${scenes.length} scenes for character ${characterId}`);
            logger.debug(`Rendering scenes view with data: ${JSON.stringify({ title: 'Scenes', scenes, character })}`);
            res.render('scenes', { title: 'Scenes', scenes, character });
        } catch (error) {
            logger.error(`Error getting scenes for character ${characterId}:`, error);
            res.status(500).render('error', { error: 'Failed to retrieve scenes' });
        }
    },

    // ... (rest of the controller code remains unchanged)
};

module.exports = sceneController;
