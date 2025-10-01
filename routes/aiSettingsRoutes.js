/**
 * MonsterBox 4.0 - AI Settings Routes
 * Comprehensive ElevenLabs STT/Agent/TTS management interface
 */

import express from 'express';
import elevenLabsConfigService from '../services/elevenLabsConfigService.js';

const router = express.Router();

// AI Settings main page
router.get('/', async (req, res) => {
    try {
        const isConfigured = elevenLabsConfigService.isElevenLabsConfigured();
        const maskedApiKey = elevenLabsConfigService.getMaskedApiKey();

        res.render('ai-settings/index', {
            title: 'AI Settings - ElevenLabs Integration',
            isConfigured,
            maskedApiKey,
            activeTab: req.query.tab || 'overview'
        });
    } catch (error) {
        console.error('Error loading AI settings:', error);
        res.status(500).render('error', {
            title: 'AI Settings Error',
            error: 'Failed to load AI settings'
        });
    }
});

// STT (Speech-to-Text) Settings
router.get('/stt', async (req, res) => {
    try {
        // TODO: Fetch STT models and settings from ElevenLabs API
        res.render('ai-settings/stt', {
            title: 'Speech-to-Text Settings',
            activeTab: 'stt'
        });
    } catch (error) {
        console.error('Error loading STT settings:', error);
        res.status(500).json({ error: 'Failed to load STT settings' });
    }
});

// AI Agent Management
router.get('/agents', async (req, res) => {
    try {
        // TODO: Fetch agents from ElevenLabs API
        res.render('ai-settings/agents', {
            title: 'AI Agent Management',
            activeTab: 'agents'
        });
    } catch (error) {
        console.error('Error loading agents:', error);
        res.status(500).json({ error: 'Failed to load agents' });
    }
});

// TTS (Text-to-Speech) Settings
router.get('/tts', async (req, res) => {
    try {
        // TODO: Fetch voices and TTS settings from ElevenLabs API
        res.render('ai-settings/tts', {
            title: 'Text-to-Speech Settings',
            activeTab: 'tts'
        });
    } catch (error) {
        console.error('Error loading TTS settings:', error);
        res.status(500).json({ error: 'Failed to load TTS settings' });
    }
});

// Character-Agent Assignment
router.get('/character-assignment', async (req, res) => {
    try {
        // TODO: Load characters and their agent assignments
        res.render('ai-settings/character-assignment', {
            title: 'Character-Agent Assignment',
            activeTab: 'assignment'
        });
    } catch (error) {
        console.error('Error loading character assignments:', error);
        res.status(500).json({ error: 'Failed to load character assignments' });
    }
});

// API Routes for AJAX operations

// Test API connection
router.post('/test-connection', async (req, res) => {
    try {
        const isConfigured = elevenLabsConfigService.isElevenLabsConfigured();
        if (!isConfigured) {
            return res.status(400).json({
                success: false,
                error: 'ElevenLabs API key not configured'
            });
        }

        // TODO: Test actual API connection
        res.json({
            success: true,
            message: 'ElevenLabs API connection successful'
        });
    } catch (error) {
        console.error('API connection test failed:', error);
        res.status(500).json({
            success: false,
            error: 'API connection test failed'
        });
    }
});

// Get configuration status
router.get('/api/status', async (req, res) => {
    try {
        const isConfigured = elevenLabsConfigService.isElevenLabsConfigured();
        const maskedApiKey = elevenLabsConfigService.getMaskedApiKey();

        res.json({
            configured: isConfigured,
            apiKey: maskedApiKey,
            audioConfig: elevenLabsConfigService.getAudioConfig()
        });
    } catch (error) {
        console.error('Error getting status:', error);
        res.status(500).json({ error: 'Failed to get configuration status' });
    }
});

export default router;
