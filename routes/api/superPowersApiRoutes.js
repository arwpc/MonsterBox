const express = require('express');
const router = express.Router();
const { asyncHandler } = require('../../middleware/errorHandler');
const { getSuperPowersService } = require('../../services/superPowersService');

// Get jaw animation config for a character
router.get('/jaw-animation/:characterId', asyncHandler(async (req, res) => {
  const { characterId } = req.params;
  const svc = getSuperPowersService();
  const cfg = svc.getJawAnimationConfig(characterId);
  res.json({ success: true, config: cfg });
}));

// Update jaw animation config for a character
router.post('/jaw-animation/:characterId', asyncHandler(async (req, res) => {
  const { characterId } = req.params;
  const updates = req.body || {};
  const svc = getSuperPowersService();
  const saved = await svc.setJawAnimationConfig(characterId, updates);
  res.json({ success: true, config: saved });
}));

module.exports = router;

