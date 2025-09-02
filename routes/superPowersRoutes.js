const express = require('express');
const router = express.Router();
const asyncHandler = require('../middleware/errorHandler').asyncHandler;
const { getSuperPowersService } = require('../services/superPowersService');
const partService = require('../services/partService');
const characterService = require('../services/characterService');

router.get('/', asyncHandler(async (req, res) => {
  const characters = await characterService.getAllCharacters();
  res.render('super-powers', {
    title: 'Super Powers',
    pageTitle: 'Super Powers',
    characters
  });
}));

router.get('/jaw-animation', asyncHandler(async (req, res) => {
  const characterId = req.query.characterId || req.session.characterId || null;
  const characters = await characterService.getAllCharacters();
  const superPowers = getSuperPowersService();
  const cfg = characterId ? superPowers.getJawAnimationConfig(characterId) : null;
  const servos = characterId ? await partService.getAvailableServosForJawAnimation(characterId) : [];

  res.render('super-powers-jaw-animation', {
    title: 'Jaw Animation',
    pageTitle: 'Jaw Animation',
    characterId,
    characters,
    servos,
    config: cfg
  });
}));

module.exports = router;

