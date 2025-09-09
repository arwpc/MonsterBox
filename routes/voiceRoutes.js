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
router.put('/settings/:characterId', voiceController.updateVoiceSettings);
router.post('/generate', voiceController.generateSpeech);
router.post('/generate-for-scene', voiceController.generateAndSaveForScene);
router.post('/generate-test', voiceController.generateTestSpeech);

// Voice metadata routes
router.patch('/metadata/:characterId', voiceController.updateVoiceMetadata);
router.get('/history/:characterId', voiceController.getVoiceHistory);
router.get('/stats/:characterId', voiceController.getVoiceStats);
router.delete('/history/:characterId', voiceController.deleteVoiceHistory);

// Voice generation routes
router.get('/capabilities/:speaker_id', voiceController.getVoiceCapabilities);
router.post('/test-connection', voiceController.testVoiceConnection);

// Audio integrity testing
router.post('/test-audio-integrity', voiceController.testAudioIntegrity);

// Live TTS endpoint for Enhanced Test Chat (returns URL for client-side playback)
router.post('/speak', async (req, res) => {
    try {
        const startTime = Date.now();
        const { text, character, characterId, voiceConfig } = req.body;

        if (!text || !text.trim()) {
            return res.status(400).json({ success: false, error: 'Text is required for speech generation' });
        }

        const voiceService = require('../services/voiceService');

        // Resolve character voice
        let voiceSettings = null;
        if (characterId) {
            try { voiceSettings = await voiceService.getVoiceByCharacterId(characterId); } catch (e) { console.warn(`⚠️ Voice settings unavailable for character ${characterId}:`, e.message); }
        }

        const speakerId = voiceSettings?.speaker_id || 'en-US-AriaNeural';
        const options = { ...voiceSettings?.settings, ...voiceConfig };

        const result = await voiceService.generateSpeech(text, speakerId, options, characterId);
        const processingTime = Date.now() - startTime;

        if (result && result.url) {
            return res.json({
                success: true,
                audioUrl: result.url,
                text,
                character: character || 'default',
                provider: result.provider || 'ElevenLabs',
                duration: result.duration,
                processingTime,
                timestamp: new Date().toISOString()
            });
        }
        throw new Error('Failed to generate audio');
    } catch (error) {
        const processingTime = typeof startTime !== 'undefined' ? (Date.now() - startTime) : undefined;
        console.error('❌ Error in TTS speak:', error);
        return res.status(500).json({ success: false, error: 'Failed to process speech request', details: error.message, processingTime });
    }
});

// Server-side preview that PLAYS audio on the character's configured speaker hardware
router.post('/preview-and-play', async (req, res) => {
    try {
        const { text, characterId, voiceId, voiceConfig } = req.body;
        if (!text || !text.trim() || !characterId) {
            return res.status(400).json({ success: false, error: 'text and characterId are required' });
        }
        const voiceService = require('../services/voiceService');

        // Resolve character voice if not provided
        let speakerId = voiceId;
        let settings = voiceConfig || {};
        try {
            const voiceSettings = await voiceService.getVoiceByCharacterId(characterId);
            if (!speakerId) speakerId = voiceSettings?.speaker_id;
            settings = { ...voiceSettings?.settings, ...settings };
        } catch (e) {
            // No voice settings available; continue if voiceId provided
        }
        if (!speakerId) {
            return res.status(404).json({ success: false, error: 'No voice configured for this character' });
        }

        const result = await voiceService.generateAndPlaySpeech(text, speakerId, settings, characterId);
        return res.json({ success: true, played: !!result?.playback?.success, device: result?.playback?.device, provider: result?.provider || 'ElevenLabs', url: result?.url });
    } catch (error) {
        console.error('❌ Error in preview-and-play:', error);
        return res.status(500).json({ success: false, error: 'Failed preview-and-play', details: error.message });
    }
});

// Play base64 audio data through character's configured speaker
router.post('/play-audio', async (req, res) => {
    try {
        const { audioData, characterId, format = 'mp3' } = req.body;

        if (!audioData || !characterId) {
            return res.status(400).json({
                success: false,
                error: 'audioData and characterId are required'
            });
        }

        const fs = require('fs').promises;
        const path = require('path');
        const os = require('os');

        // Create temporary file from base64 data
        const tempDir = os.tmpdir();
        const tempFileName = `audio_${Date.now()}_${Math.random().toString(36).substr(2, 9)}.${format}`;
        const tempFilePath = path.join(tempDir, tempFileName);

        // Convert base64 to buffer and write to temp file
        const audioBuffer = Buffer.from(audioData, 'base64');
        await fs.writeFile(tempFilePath, audioBuffer);

        // Play audio through character's configured speaker
        const SpeakerService = require('../services/speakerService');
        const speakerService = new SpeakerService();
        const result = await speakerService.playAudioForCharacter(tempFilePath, characterId);

        // Clean up temp file
        try {
            await fs.unlink(tempFilePath);
        } catch (cleanupError) {
            console.warn('⚠️ Failed to clean up temp audio file:', cleanupError.message);
        }

        if (result.success) {
            return res.json({
                success: true,
                played: true,
                device: result.device,
                message: `Audio played on character ${characterId} speaker`
            });
        } else {
            return res.status(500).json({
                success: false,
                error: 'Failed to play audio',
                details: result.error
            });
        }

    } catch (error) {
        console.error('❌ Error playing base64 audio:', error);
        return res.status(500).json({
            success: false,
            error: 'Failed to play audio',
            details: error.message
        });
    }
});

// STT endpoint for Enhanced Test Chat
router.post('/transcribe', async (req, res) => {
    try {
        const { audioData, character, characterId, sttOnly } = req.body;
        const startTime = Date.now();

        if (!audioData) {
            return res.status(400).json({
                success: false,
                error: 'Audio data is required'
            });
        }

        console.log(`🎙️ STT request (Character: ${character || 'default'})`);

        // Initialize ElevenLabs STT service if not already done
        if (!global.elevenLabsSTTService) {
            const ElevenLabsSTTService = require('../services/elevenLabsSTTService');
            global.elevenLabsSTTService = new ElevenLabsSTTService();
        }

        // Transcribe the audio data (base64 encoded)
        const transcriptionResult = await global.elevenLabsSTTService.transcribeBase64Audio(audioData, {
            language: 'en'
        });

        if (transcriptionResult.success) {
            const responseTime = Date.now() - startTime;
            console.log(`✅ STT transcription completed: "${transcriptionResult.text?.substring(0, 50)}..."`);

            res.json({
                success: true,
                transcription: transcriptionResult.text,
                language: transcriptionResult.language,
                confidence: transcriptionResult.confidence,
                responseTime: responseTime,
                provider: 'elevenlabs',
                characterId: characterId,
                character: character
            });
        } else {
            console.error(`❌ STT transcription failed: ${transcriptionResult.error}`);
            res.status(500).json({
                success: false,
                error: transcriptionResult.error,
                provider: 'elevenlabs'
            });
        }

    } catch (error) {
        console.error('❌ Error in STT transcribe:', error);
        res.status(500).json({
            success: false,
            error: 'Failed to process transcription',
            details: error.message
        });
    }
});

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
        
        // Determine file extension from the original URL
        const urlPath = new URL(audioUrl).pathname;
        const originalExtension = path.extname(urlPath) || '.wav'; // Default to WAV format

        // Create the target filename with correct extension
        const targetFileName = `${Date.now()}-${text.slice(0, 30).replace(/[^a-zA-Z0-9]/g, '_')}${originalExtension}`;
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
