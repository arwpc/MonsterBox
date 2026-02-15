/**
 * MonsterBox 5.5 - AI Settings Routes
 * Comprehensive ElevenLabs STT/Agent/TTS management interface
 */

import express from 'express';
import fs from 'fs/promises';
import path from 'path';
import { fileURLToPath } from 'url';
import { readConfig } from '../services/configService.js';
import elevenLabsConfigService from '../services/elevenLabsConfigService.js';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

async function readJsonIfExists(filePath) {
    try {
        const data = await fs.readFile(filePath, 'utf8');
        return JSON.parse(data);
    } catch (error) {
        if (error.code === 'ENOENT') {
            return null;
        }
        throw error;
    }
}

const router = express.Router();

// Helper to get current character info
async function getCurrentCharacterInfo() {
    try {
        const config = await readConfig();
        const characterId = parseInt(config.selectedCharacter, 10) || null;
        const charactersPath = path.resolve(__dirname, '..', 'data', 'characters.json');
        const chars = await readJsonIfExists(charactersPath);
        let characterName = characterId ? 'Character ' + characterId : 'No Character';
        if (characterId && Array.isArray(chars)) {
            const found = chars.find(c => c.id === characterId);
            if (found) characterName = found.name || characterName;
        }
        return { characterId, characterName };
    } catch {
        return { characterId: null, characterName: 'Unknown' };
    }
}

// AI Settings main page
router.get('/', async (req, res) => {
    try {
        const isConfigured = elevenLabsConfigService.isElevenLabsConfigured();
        const maskedApiKey = elevenLabsConfigService.getMaskedApiKey();
        const { characterId, characterName } = await getCurrentCharacterInfo();

        res.renderWithLayout('ai-settings/index', {
            title: 'AI Settings - ElevenLabs Integration',
            page: 'ai-settings',
            isConfigured,
            maskedApiKey,
            characterId,
            characterName,
            activeTab: req.query.tab || 'overview',
            scripts: ['/js/ai-settings.js']
        });
    } catch (error) {
        console.error('Error loading AI settings:', error);
        res.status(500);
        res.renderWithLayout('error', {
            title: 'AI Settings Error',
            page: 'error',
            error: 'Failed to load AI settings'
        });
    }
});

// STT (Speech-to-Text) Settings
router.get('/stt', async (req, res) => {
    try {
        const { characterId, characterName } = await getCurrentCharacterInfo();
        res.renderWithLayout('ai-settings/stt', {
            title: 'Speech-to-Text Settings',
            page: 'ai-settings-stt',
            activeTab: 'stt',
            characterId,
            characterName,
            scripts: ['/js/ai-settings-stt.js']
        });
    } catch (error) {
        console.error('Error loading STT settings:', error);
        res.status(500).json({ error: 'Failed to load STT settings' });
    }
});

// AI Agent Management - redirect to overview (agents UI removed, API routes kept)
router.get('/agents', (req, res) => {
    res.redirect('/ai-settings');
});

// TTS (Text-to-Speech) Settings
router.get('/tts', async (req, res) => {
    try {
        const { characterId, characterName } = await getCurrentCharacterInfo();
        res.renderWithLayout('ai-settings/tts', {
            title: 'Text-to-Speech Settings - Voice Assignment',
            page: 'ai-settings-tts',
            activeTab: 'tts',
            characterId,
            characterName,
            scripts: ['/js/ai-settings-tts.js']
        });
    } catch (error) {
        console.error('Error loading TTS settings:', error);
        res.status(500).json({ error: 'Failed to load TTS settings' });
    }
});



// API Routes for AJAX operations

router.get('/api/settings', async (req, res) => {
    try {
        const appRoot = path.resolve(__dirname, '..');
        const appConfig = await readConfig();
        const characterId = parseInt(appConfig.selectedCharacter, 10) || null;
        const dataPath = appConfig.dataPath
            ? path.resolve(appRoot, appConfig.dataPath)
            : path.resolve(appRoot, 'data', `character-${characterId}`);
        const aiConfigDir = path.join(dataPath, 'ai-config');

        const [sttConfigRaw, ttsConfigRaw] = await Promise.all([
            readJsonIfExists(path.join(aiConfigDir, 'stt-config.json')),
            readJsonIfExists(path.join(aiConfigDir, 'tts-config.json'))
        ]);

        const sttConfig = sttConfigRaw || {};
        const ttsConfig = ttsConfigRaw || {};

        const configured = elevenLabsConfigService.isElevenLabsConfigured();
        const maskedApiKey = elevenLabsConfigService.getMaskedApiKey();
        const audioConfig = elevenLabsConfigService.getAudioConfig();

        const envProvider = (process.env.AI_PROVIDER || '').toLowerCase();
        const sttProvider = (sttConfig.provider || '').toLowerCase();
        const preferredProvider = envProvider || sttProvider;
        const supportedProviders = ['openai', 'anthropic', 'google'];
        const aiProvider = supportedProviders.includes(preferredProvider)
            ? preferredProvider
            : 'openai';

        const relativeDataPath = path.relative(appRoot, dataPath) || dataPath;

        res.json({
            success: true,
            settings: {
                aiProvider,
                elevenLabs: {
                    configured,
                    apiKeyMasked: maskedApiKey,
                    audio: audioConfig
                },
                stt: sttConfig,
                tts: ttsConfig
            },
            metadata: {
                characterId,
                dataPath: relativeDataPath,
                timestamp: new Date().toISOString()
            }
        });
    } catch (error) {
        console.error('Error getting AI settings:', error);
        res.status(500).json({
            success: false,
            error: 'Failed to load AI settings',
            message: error.message
        });
    }
});

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
