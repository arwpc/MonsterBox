const express = require('express');
const router = express.Router();
const dataManager = require('../dataManager');
const fs = require('fs').promises;
const path = require('path');
const multer = require('multer');

// ... (keep the existing code)

// New route for fetching parts associated with a character
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
