import express from 'express';
import characterAudioConfigService from '../../services/characterAudioConfigService.js';
import microphoneService from '../../services/microphoneService.js';

const router = express.Router();

/**
 * Get character audio configuration
 */
router.get('/api/audio-config', async (req, res) => {
    try {
        const config = await characterAudioConfigService.getCharacterAudioConfig();
        res.json({ success: true, config });
    } catch (error) {
        console.error('Error getting audio config:', error);
        res.status(500).json({ success: false, error: error.message });
    }
});

/**
 * Update character audio configuration
 */
router.post('/api/audio-config', async (req, res) => {
    try {
        const updatedConfig = await characterAudioConfigService.saveCharacterAudioConfig(req.body);
        res.json({ success: true, config: updatedConfig });
    } catch (error) {
        console.error('Error updating audio config:', error);
        res.status(500).json({ success: false, error: error.message });
    }
});

/**
 * Update specific audio configuration section
 */
router.post('/api/audio-config/:section', async (req, res) => {
    try {
        const { section } = req.params;
        const updatedConfig = await characterAudioConfigService.updateAudioConfig(section, req.body);
        res.json({ success: true, config: updatedConfig });
    } catch (error) {
        console.error(`Error updating ${section} config:`, error);
        res.status(500).json({ success: false, error: error.message });
    }
});

/**
 * Get microphone configuration
 */
router.get('/api/microphone-config', async (req, res) => {
    try {
        const config = await characterAudioConfigService.getMicrophoneConfig();
        res.json({ success: true, config });
    } catch (error) {
        console.error('Error getting microphone config:', error);
        res.status(500).json({ success: false, error: error.message });
    }
});

/**
 * Get speaker configuration
 */
router.get('/api/speaker-config', async (req, res) => {
    try {
        const config = await characterAudioConfigService.getSpeakerConfig();
        res.json({ success: true, config });
    } catch (error) {
        console.error('Error getting speaker config:', error);
        res.status(500).json({ success: false, error: error.message });
    }
});

/**
 * Get STT configuration
 */
router.get('/api/stt-config', async (req, res) => {
    try {
        const config = await characterAudioConfigService.getSTTConfig();
        res.json({ success: true, config });
    } catch (error) {
        console.error('Error getting STT config:', error);
        res.status(500).json({ success: false, error: error.message });
    }
});

/**
 * Get jaw animation configuration
 */
router.get('/api/jaw-animation-config', async (req, res) => {
    try {
        const config = await characterAudioConfigService.getJawAnimationConfig();
        res.json({ success: true, config });
    } catch (error) {
        console.error('Error getting jaw animation config:', error);
        res.status(500).json({ success: false, error: error.message });
    }
});

/**
 * Get all microphones for current character
 */
router.get('/api/microphones', async (req, res) => {
    try {
        const microphones = await microphoneService.getAllMicrophones();
        res.json({ success: true, microphones });
    } catch (error) {
        console.error('Error getting microphones:', error);
        res.status(500).json({ success: false, error: error.message });
    }
});

/**
 * Create new microphone
 */
router.post('/api/microphones', async (req, res) => {
    try {
        const microphone = await microphoneService.createMicrophone(req.body);
        res.json({ success: true, microphone });
    } catch (error) {
        console.error('Error creating microphone:', error);
        res.status(500).json({ success: false, error: error.message });
    }
});

/**
 * Update microphone
 */
router.put('/api/microphones/:id', async (req, res) => {
    try {
        const { id } = req.params;
        const microphone = await microphoneService.updateMicrophone(id, req.body);
        res.json({ success: true, microphone });
    } catch (error) {
        console.error('Error updating microphone:', error);
        res.status(500).json({ success: false, error: error.message });
    }
});

/**
 * Delete microphone
 */
router.delete('/api/microphones/:id', async (req, res) => {
    try {
        const { id } = req.params;
        await microphoneService.deleteMicrophone(id);
        res.json({ success: true });
    } catch (error) {
        console.error('Error deleting microphone:', error);
        res.status(500).json({ success: false, error: error.message });
    }
});

export default router;
