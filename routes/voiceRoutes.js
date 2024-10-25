const express = require('express');
const router = express.Router();
const voiceController = require('../controllers/voiceController');

// Get available voices
router.get('/available', voiceController.getAvailableVoices);

// Get voice settings for a character
router.get('/:characterId', voiceController.getVoiceSettings);

// Save voice settings
router.post('/settings', voiceController.saveVoiceSettings);

// Generate speech
router.post('/generate', voiceController.generateSpeech);

// Save to library
router.post('/save-to-library', voiceController.saveToLibrary);

// Save voice preset
router.post('/preset', voiceController.savePreset);

module.exports = router;