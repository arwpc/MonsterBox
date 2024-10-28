const express = require('express');
const router = express.Router();
const voiceController = require('../controllers/voiceController');
const soundService = require('../services/soundService');
const fs = require('fs').promises;
const path = require('path');

router.get('/available', voiceController.getAvailableVoices);
router.get('/settings/:characterId', voiceController.getVoiceSettings);
router.post('/settings', voiceController.saveVoiceSettings);
router.post('/generate', voiceController.generateSpeech);
router.get('/fx-presets', voiceController.getFXPresets);

// Voice presets routes
router.get('/presets/:characterId', voiceController.getVoicePresets);
router.post('/presets', voiceController.savePreset);
router.delete('/presets/:characterId/:presetName', voiceController.deletePreset);

// Voice metadata routes
router.patch('/metadata/:characterId', voiceController.updateVoiceMetadata);
router.get('/history/:characterId', voiceController.getVoiceHistory);

// New route to save generated audio to sounds library
router.post('/save-to-sounds', async (req, res) => {
    try {
        const { audioUrl, text, characterId } = req.body;

        // Extract the audio file name from the URL
        const audioFileName = path.basename(audioUrl);
        const sourceFilePath = path.join(__dirname, '..', 'public', audioUrl);
        const targetFileName = `${Date.now()}-${text.slice(0, 30).replace(/[^a-zA-Z0-9]/g, '_')}.mp3`;
        const targetFilePath = path.join(__dirname, '..', 'public', 'sounds', targetFileName);

        // Copy the audio file to the sounds directory
        await fs.copyFile(sourceFilePath, targetFilePath);

        // Create a new sound entry
        const newSound = await soundService.createSound({
            name: text,
            file: targetFileName,
            characterId: characterId || null,
            type: 'voice',
            created: new Date().toISOString()
        });

        res.json(newSound);
    } catch (error) {
        console.error('Error saving to sounds:', error);
        res.status(500).json({ error: error.message });
    }
});

module.exports = router;
