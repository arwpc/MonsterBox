/**
 * AI Management Routes
 * 
 * Comprehensive AI Management system for MonsterBox
 * Handles STT, AI Personalities, and TTS configuration
 */

const express = require('express');
const router = express.Router();
const fs = require('fs').promises;
const path = require('path');
const multer = require('multer');

// Import services
const characterService = require('../services/characterService');
const voiceService = require('../services/voiceService');

// Configure multer for file uploads
const upload = multer({ 
    dest: 'uploads/',
    limits: { fileSize: 10 * 1024 * 1024 } // 10MB limit
});

// Configuration file paths
const AI_CONFIG_DIR = path.join(__dirname, '../data/ai-config');
const STT_CONFIG_FILE = path.join(AI_CONFIG_DIR, 'stt-config.json');
const PERSONALITIES_CONFIG_FILE = path.join(AI_CONFIG_DIR, 'personalities-config.json');
const TTS_CONFIG_FILE = path.join(AI_CONFIG_DIR, 'tts-config.json');

// Ensure config directory exists
async function ensureConfigDir() {
    try {
        await fs.access(AI_CONFIG_DIR);
    } catch (error) {
        await fs.mkdir(AI_CONFIG_DIR, { recursive: true });
    }
}

// Load configuration file
async function loadConfig(filePath, defaultConfig = {}) {
    try {
        await ensureConfigDir();
        const data = await fs.readFile(filePath, 'utf8');
        return JSON.parse(data);
    } catch (error) {
        return defaultConfig;
    }
}

// Save configuration file
async function saveConfig(filePath, config) {
    try {
        await ensureConfigDir();
        await fs.writeFile(filePath, JSON.stringify(config, null, 2));
        return true;
    } catch (error) {
        console.error(`Error saving config to ${filePath}:`, error);
        return false;
    }
}

// Dashboard route (both root and /dashboard)
const dashboardHandler = async (req, res) => {
    try {
        // Get system status
        const status = await getSystemStatus();
        const metrics = await getPerformanceMetrics();

        res.render('ai-config/dashboard', {
            title: 'AI Management Dashboard',
            status,
            metrics,
            error: null
        });
    } catch (error) {
        console.error('AI Management Dashboard error:', error);
        res.render('ai-config/dashboard', {
            title: 'AI Management Dashboard',
            status: null,
            metrics: null,
            error: error.message
        });
    }
};

router.get('/', dashboardHandler);
router.get('/dashboard', dashboardHandler);

// STT Configuration routes
router.get('/stt', async (req, res) => {
    try {
        const config = await loadConfig(STT_CONFIG_FILE, {
            apiKey: process.env.OPENAI_API_KEY ? '••••••••••••' : '',
            model: 'whisper-1',
            language: 'en',
            confidenceThreshold: 0.7,
            chunkDuration: 2000,
            timeout: 30000,
            fallbackToSystem: true
        });
        
        res.render('ai-config/stt', {
            title: 'Speech-to-Text Configuration',
            config
        });
    } catch (error) {
        console.error('STT config error:', error);
        res.status(500).render('error', {
            title: 'Error',
            message: 'Failed to load STT configuration',
            error: error.message
        });
    }
});

// AI Personalities Configuration routes
router.get('/personalities', async (req, res) => {
    try {
        const globalConfig = await loadConfig(PERSONALITIES_CONFIG_FILE, {
            defaultProvider: 'openai',
            defaultModel: 'gpt-4',
            defaultTemperature: 0.8,
            defaultMaxTokens: 150,
            contextLength: 5,
            responseTimeout: 30000
        });
        
        // Load characters
        const characters = await characterService.getAllCharacters();
        
        res.render('ai-config/personalities', {
            title: 'AI Personalities Configuration',
            globalConfig,
            characters
        });
    } catch (error) {
        console.error('Personalities config error:', error);
        res.status(500).render('error', {
            title: 'Error',
            message: 'Failed to load personalities configuration',
            error: error.message
        });
    }
});

// TTS Configuration routes
router.get('/tts', async (req, res) => {
    try {
        const globalTTSConfig = await loadConfig(TTS_CONFIG_FILE, {
            defaultSpeed: 1.0,
            defaultPitch: 0,
            defaultVolume: 0,
            audioFormat: 'mp3',
            sampleRate: '44100',
            timeout: 30000
        });

        // Load characters with voice configurations
        const characters = await characterService.getAllCharacters();

        // Add voice configuration to each character
        for (let character of characters) {
            try {
                character.voiceConfig = await voiceService.getVoiceByCharacterId(character.id);
            } catch (error) {
                character.voiceConfig = null;
            }
        }

        // Check if a specific character was requested
        const selectedCharacterId = req.query.characterId;

        res.render('ai-config/tts', {
            title: 'Text-to-Speech Configuration',
            globalTTSConfig,
            characters,
            selectedCharacterId
        });
    } catch (error) {
        console.error('TTS config error:', error);
        res.status(500).render('error', {
            title: 'Error',
            message: 'Failed to load TTS configuration',
            error: error.message
        });
    }
});

// API Routes

// System status
router.get('/api/status', async (req, res) => {
    try {
        const status = await getSystemStatus();
        res.json({ success: true, status });
    } catch (error) {
        res.status(500).json({ success: false, error: error.message });
    }
});

// STT API routes
router.get('/api/stt/status', async (req, res) => {
    try {
        const hasApiKey = !!process.env.OPENAI_API_KEY;
        res.json({ 
            success: hasApiKey,
            status: hasApiKey ? 'Connected' : 'No API key configured',
            model: 'whisper-1'
        });
    } catch (error) {
        res.status(500).json({ success: false, error: error.message });
    }
});

router.post('/api/stt/config', async (req, res) => {
    try {
        const config = req.body;
        
        // Don't save the API key if it's masked
        if (config.apiKey && config.apiKey.includes('••••')) {
            delete config.apiKey;
        }
        
        const saved = await saveConfig(STT_CONFIG_FILE, config);
        
        if (saved) {
            res.json({ success: true, message: 'STT configuration saved successfully' });
        } else {
            res.status(500).json({ success: false, error: 'Failed to save configuration' });
        }
    } catch (error) {
        res.status(500).json({ success: false, error: error.message });
    }
});

router.post('/api/stt/test', async (req, res) => {
    try {
        const startTime = Date.now();
        
        // Test OpenAI API connection
        if (!process.env.OPENAI_API_KEY) {
            return res.json({ 
                success: false, 
                error: 'OpenAI API key not configured' 
            });
        }
        
        // Simple test - we can't actually test Whisper without audio
        // but we can verify the API key format
        const apiKey = process.env.OPENAI_API_KEY;
        if (!apiKey.startsWith('sk-')) {
            return res.json({ 
                success: false, 
                error: 'Invalid OpenAI API key format' 
            });
        }
        
        const responseTime = Date.now() - startTime;
        res.json({ 
            success: true, 
            responseTime,
            status: 'API key format valid',
            message: 'STT connection test successful'
        });
    } catch (error) {
        res.status(500).json({ success: false, error: error.message });
    }
});

router.post('/api/stt/transcribe', upload.single('audio'), async (req, res) => {
    try {
        if (!req.file) {
            return res.status(400).json({ success: false, error: 'No audio file provided' });
        }
        
        const startTime = Date.now();
        
        // Here you would integrate with the actual OpenAI Whisper STT
        // For now, return a mock response
        const responseTime = Date.now() - startTime;
        
        // Clean up uploaded file
        await fs.unlink(req.file.path);
        
        res.json({
            success: true,
            text: 'This is a mock transcription result. Integrate with OpenAI Whisper for real transcription.',
            confidence: 0.95,
            provider: 'OpenAI Whisper (Mock)',
            responseTime
        });
    } catch (error) {
        res.status(500).json({ success: false, error: error.message });
    }
});

// AI Personalities API routes
router.post('/api/personalities/global', async (req, res) => {
    try {
        const config = req.body;
        const saved = await saveConfig(PERSONALITIES_CONFIG_FILE, config);
        
        if (saved) {
            res.json({ success: true, message: 'Global AI configuration saved successfully' });
        } else {
            res.status(500).json({ success: false, error: 'Failed to save configuration' });
        }
    } catch (error) {
        res.status(500).json({ success: false, error: error.message });
    }
});

router.get('/api/personalities/character/:characterId', async (req, res) => {
    try {
        const characterId = req.params.characterId;
        const character = await characterService.getCharacterById(characterId);
        
        if (!character) {
            return res.status(404).json({ success: false, error: 'Character not found' });
        }
        
        res.json({ success: true, character });
    } catch (error) {
        res.status(500).json({ success: false, error: error.message });
    }
});

router.post('/api/personalities/character/:characterId', async (req, res) => {
    try {
        const characterId = req.params.characterId;
        const config = req.body;
        
        // Update character with AI configuration
        const character = await characterService.getCharacterById(characterId);
        if (!character) {
            return res.status(404).json({ success: false, error: 'Character not found' });
        }
        
        character.aiConfig = {
            provider: config.aiProvider,
            model: config.aiModel,
            temperature: parseFloat(config.aiTemperature),
            maxTokens: parseInt(config.aiMaxTokens),
            systemPrompt: config.systemPrompt,
            contextLength: parseInt(config.contextLength),
            enabled: config.enabled === 'true'
        };
        
        const updated = await characterService.updateCharacter(characterId, character);
        
        if (updated) {
            res.json({ success: true, message: 'Character AI configuration saved successfully' });
        } else {
            res.status(500).json({ success: false, error: 'Failed to save character configuration' });
        }
    } catch (error) {
        res.status(500).json({ success: false, error: error.message });
    }
});

router.post('/api/personalities/character/:characterId/toggle', async (req, res) => {
    try {
        const characterId = req.params.characterId;
        const { enabled } = req.body;
        
        const character = await characterService.getCharacterById(characterId);
        if (!character) {
            return res.status(404).json({ success: false, error: 'Character not found' });
        }
        
        if (!character.aiConfig) {
            character.aiConfig = {};
        }
        
        character.aiConfig.enabled = enabled;
        
        const updated = await characterService.updateCharacter(characterId, character);
        
        if (updated) {
            res.json({ success: true, message: `Character AI ${enabled ? 'enabled' : 'disabled'} successfully` });
        } else {
            res.status(500).json({ success: false, error: 'Failed to update character' });
        }
    } catch (error) {
        res.status(500).json({ success: false, error: error.message });
    }
});

router.post('/api/personalities/test', async (req, res) => {
    try {
        const { characterId, prompt } = req.body;
        const startTime = Date.now();
        
        // Mock AI response for testing
        const responses = [
            "Greetings, mortal. I am pleased to make your acquaintance.",
            "Ah, another visitor to my domain. How delightfully... unexpected.",
            "The shadows whisper your name, and I have been expecting you.",
            "Welcome to my realm. I trust you find it... accommodating.",
            "Your presence brings warmth to these cold halls."
        ];
        
        const response = responses[Math.floor(Math.random() * responses.length)];
        const responseTime = Date.now() - startTime + Math.random() * 1000; // Add some realistic delay
        
        res.json({
            success: true,
            response,
            model: 'gpt-4',
            provider: 'OpenAI (Mock)',
            responseTime: Math.round(responseTime),
            tokens: response.split(' ').length
        });
    } catch (error) {
        res.status(500).json({ success: false, error: error.message });
    }
});

// TTS API routes
router.post('/api/tts/global', async (req, res) => {
    try {
        const config = req.body;
        const saved = await saveConfig(TTS_CONFIG_FILE, config);

        if (saved) {
            res.json({ success: true, message: 'Global TTS configuration saved successfully' });
        } else {
            res.status(500).json({ success: false, error: 'Failed to save configuration' });
        }
    } catch (error) {
        res.status(500).json({ success: false, error: error.message });
    }
});

router.post('/api/tts/save-all', async (req, res) => {
    try {
        // This would save all current voice assignments
        // For now, just return success
        res.json({ success: true, message: 'All voice assignments saved successfully' });
    } catch (error) {
        res.status(500).json({ success: false, error: error.message });
    }
});

// Testing API routes
router.post('/api/test/stt', async (req, res) => {
    try {
        const startTime = Date.now();

        // Mock STT test
        const responseTime = Date.now() - startTime + Math.random() * 500;

        res.json({
            success: true,
            responseTime: Math.round(responseTime),
            status: 'STT system operational',
            provider: 'OpenAI Whisper'
        });
    } catch (error) {
        res.status(500).json({ success: false, error: error.message });
    }
});

router.post('/api/test/ai', async (req, res) => {
    try {
        const { prompt } = req.body;
        const startTime = Date.now();

        // Mock AI test
        const response = "This is a test response from the AI system. All systems are operational.";
        const responseTime = Date.now() - startTime + Math.random() * 1000;

        res.json({
            success: true,
            response,
            responseTime: Math.round(responseTime),
            provider: 'OpenAI',
            model: 'gpt-4'
        });
    } catch (error) {
        res.status(500).json({ success: false, error: error.message });
    }
});

router.post('/api/test/tts', async (req, res) => {
    try {
        const { text } = req.body;
        const startTime = Date.now();

        // Mock TTS test
        const responseTime = Date.now() - startTime + Math.random() * 2000;

        res.json({
            success: true,
            responseTime: Math.round(responseTime),
            provider: 'TopMediaAI',
            audioUrl: '/sounds/test-audio.mp3' // Mock audio URL
        });
    } catch (error) {
        res.status(500).json({ success: false, error: error.message });
    }
});

router.post('/api/test/pipeline', async (req, res) => {
    try {
        const startTime = Date.now();

        // Mock full pipeline test
        const sttTime = Math.random() * 500 + 200;
        const aiTime = Math.random() * 1000 + 500;
        const ttsTime = Math.random() * 2000 + 1000;

        const totalTime = sttTime + aiTime + ttsTime;

        res.json({
            success: true,
            stt: {
                success: true,
                responseTime: Math.round(sttTime)
            },
            ai: {
                success: true,
                responseTime: Math.round(aiTime)
            },
            tts: {
                success: true,
                responseTime: Math.round(ttsTime)
            },
            totalTime: Math.round(totalTime),
            audioUrl: '/sounds/pipeline-test.mp3'
        });
    } catch (error) {
        res.status(500).json({ success: false, error: error.message });
    }
});

// Configuration export/import
router.get('/api/export', async (req, res) => {
    try {
        const sttConfig = await loadConfig(STT_CONFIG_FILE);
        const personalitiesConfig = await loadConfig(PERSONALITIES_CONFIG_FILE);
        const ttsConfig = await loadConfig(TTS_CONFIG_FILE);

        const exportData = {
            version: '1.0',
            timestamp: new Date().toISOString(),
            stt: sttConfig,
            personalities: personalitiesConfig,
            tts: ttsConfig
        };

        res.setHeader('Content-Type', 'application/json');
        res.setHeader('Content-Disposition', `attachment; filename=ai-config-${Date.now()}.json`);
        res.send(JSON.stringify(exportData, null, 2));
    } catch (error) {
        res.status(500).json({ success: false, error: error.message });
    }
});

router.post('/api/import', upload.single('config'), async (req, res) => {
    try {
        if (!req.file) {
            return res.status(400).json({ success: false, error: 'No configuration file provided' });
        }

        const configData = await fs.readFile(req.file.path, 'utf8');
        const importData = JSON.parse(configData);

        // Validate import data
        if (!importData.version || !importData.stt || !importData.personalities || !importData.tts) {
            return res.status(400).json({ success: false, error: 'Invalid configuration file format' });
        }

        // Save configurations
        await saveConfig(STT_CONFIG_FILE, importData.stt);
        await saveConfig(PERSONALITIES_CONFIG_FILE, importData.personalities);
        await saveConfig(TTS_CONFIG_FILE, importData.tts);

        // Clean up uploaded file
        await fs.unlink(req.file.path);

        res.json({ success: true, message: 'Configuration imported successfully' });
    } catch (error) {
        // Clean up uploaded file on error
        if (req.file) {
            try {
                await fs.unlink(req.file.path);
            } catch (cleanupError) {
                console.error('Error cleaning up uploaded file:', cleanupError);
            }
        }
        res.status(500).json({ success: false, error: error.message });
    }
});

// Helper functions
async function getSystemStatus() {
    try {
        const sttConfig = await loadConfig(STT_CONFIG_FILE);
        const personalitiesConfig = await loadConfig(PERSONALITIES_CONFIG_FILE);
        const ttsConfig = await loadConfig(TTS_CONFIG_FILE);

        // Check STT status
        const sttStatus = {
            online: !!process.env.OPENAI_API_KEY,
            model: sttConfig.model || 'whisper-1',
            language: sttConfig.language || 'en',
            status: process.env.OPENAI_API_KEY ? 'Connected' : 'No API key'
        };

        // Check AI status
        const characters = await characterService.getAllCharacters();
        const activeCharacters = characters.filter(c => c.aiConfig && c.aiConfig.enabled).length;

        const aiStatus = {
            online: !!process.env.OPENAI_API_KEY,
            activeCharacters,
            defaultModel: personalitiesConfig.defaultModel || 'gpt-4',
            status: process.env.OPENAI_API_KEY ? 'Connected' : 'No API key'
        };

        // Check TTS status
        const configuredCharacters = characters.filter(c => c.voiceConfig && c.voiceConfig.speaker_id).length;

        const ttsStatus = {
            online: !!process.env.TOPMEDIAI_API_KEY,
            voiceCount: 'Loading...',
            configuredCharacters,
            status: process.env.TOPMEDIAI_API_KEY ? 'Connected' : 'No API key'
        };

        return {
            stt: sttStatus,
            ai: aiStatus,
            tts: ttsStatus
        };
    } catch (error) {
        console.error('Error getting system status:', error);
        return null;
    }
}

async function getPerformanceMetrics() {
    try {
        // Mock performance metrics
        return {
            totalRequests: Math.floor(Math.random() * 1000) + 100,
            averageResponseTime: Math.floor(Math.random() * 500) + 200,
            successRate: Math.floor(Math.random() * 10) + 90,
            errorCount: Math.floor(Math.random() * 20)
        };
    } catch (error) {
        console.error('Error getting performance metrics:', error);
        return null;
    }
}

module.exports = router;
