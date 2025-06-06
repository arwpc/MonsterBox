const express = require('express');
const router = express.Router();
const voiceController = require('../controllers/voiceController');
const soundService = require('../services/soundService');
const characterService = require('../services/characterService');
const fs = require('fs');
const fsPromises = require('fs').promises;
const path = require('path');
const https = require('https');

// Voice configuration page
router.get('/configure', (req, res) => {
    const characterId = req.query.characterId;
    if (!characterId) {
        return res.redirect('/characters');
    }
    res.render('voice-config', { 
        title: 'Configure Voice',
        characterId: characterId
    });
});

// Get all characters
router.get('/characters', async (req, res) => {
    try {
        const characters = await characterService.getAllCharacters();
        res.json(characters);
    } catch (error) {
        console.error('Error getting characters:', error);
        res.status(500).json({ error: error.message });
    }
});

// API Routes
router.get('/available', voiceController.getAvailableVoices);
router.get('/settings/:characterId', voiceController.getVoiceSettings);
router.post('/settings', voiceController.saveVoiceSettings);
router.post('/generate', voiceController.generateSpeech);
router.post('/generate-for-scene', voiceController.generateAndSaveForScene);

// Voice metadata routes
router.patch('/metadata/:characterId', voiceController.updateVoiceMetadata);
router.get('/history/:characterId', voiceController.getVoiceHistory);
router.get('/stats/:characterId', voiceController.getVoiceStats);
router.delete('/history/:characterId', voiceController.deleteVoiceHistory);
router.post('/test-connection', voiceController.testVoiceConnection);

// Download file from URL
async function downloadFile(url) {
    return new Promise((resolve, reject) => {
        const tempPath = path.join(__dirname, '..', 'public', 'sounds', `temp_${Date.now()}.wav`);
        const file = fs.createWriteStream(tempPath);

        https.get(url, (response) => {
            response.pipe(file);
            file.on('finish', () => {
                file.close();
                resolve(tempPath);
            });
        }).on('error', (err) => {
            fs.unlink(tempPath, () => {}); // Use callback version for cleanup
            reject(err);
        });
    });
}

// Save generated audio to sounds library
router.post('/save-to-sounds', async (req, res) => {
    let tempFilePath = null;
    try {
        const { audioUrl, text, characterId } = req.body;

        // Extract the audio URL from the response
        const url = new URL(audioUrl);
        
        // Download the file from S3
        tempFilePath = await downloadFile(url.toString());
        
        // Create the target filename
        const targetFileName = `${Date.now()}-${text.slice(0, 30).replace(/[^a-zA-Z0-9]/g, '_')}.mp3`;
        const targetFilePath = path.join(__dirname, '..', 'public', 'sounds', targetFileName);

        // Ensure the sounds directory exists
        const soundsDir = path.join(__dirname, '..', 'public', 'sounds');
        await fsPromises.mkdir(soundsDir, { recursive: true });

        // Copy the temp file to the final location
        await fsPromises.copyFile(tempFilePath, targetFilePath);
        
        // Create a new sound entry - ensure both filename and file properties match
        const newSound = await soundService.createSound({
            name: text,
            filename: targetFileName, // This matches the template's usage
            file: targetFileName,    // This is for backward compatibility
            characterIds: characterId ? [parseInt(characterId)] : [],
            type: 'voice',
            created: new Date().toISOString()
        });

        // Return both the sound entry and the full URL for immediate playback
        res.json({
            ...newSound,
            url: `/sounds/${targetFileName}` // Add the URL for immediate playback
        });
    } catch (error) {
        console.error('Error saving to sounds:', error);
        res.status(500).json({ error: error.message });
    } finally {
        // Clean up the temp file if it exists
        if (tempFilePath) {
            fsPromises.unlink(tempFilePath).catch(() => {});
        }
    }
});

module.exports = router;
