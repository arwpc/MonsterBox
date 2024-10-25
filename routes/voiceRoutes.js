const express = require('express');
const router = express.Router();
const voiceController = require('../controllers/voiceController');

// Get available voices from Replica API
router.get('/available', voiceController.getAvailableVoices);

// Get voice settings for a character
router.get('/:characterId', voiceController.getVoiceSettings);

// Save voice settings
router.post('/settings', voiceController.saveVoiceSettings);

// Generate speech
router.post('/generate', voiceController.generateSpeech);

// Save to sound library
router.post('/save-to-library', voiceController.saveToSoundLibrary);

// Save voice preset
router.post('/preset', voiceController.saveVoicePreset);

module.exports = router;