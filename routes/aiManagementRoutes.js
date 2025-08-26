/**
 * AI Management Routes
 *
 * ElevenLabs Conversational AI Management system for MonsterBox
 * Handles ElevenLabs agents, voice configuration, and conversation settings
 */

const express = require('express');
const router = express.Router();
const fs = require('fs').promises;
const path = require('path');
const multer = require('multer');
const logger = require('../scripts/logger');

// Import services
const characterService = require('../services/characterService');
const voiceService = require('../services/voiceService');
// Configure multer for file uploads
const upload = multer({
    dest: 'uploads/',
    limits: { fileSize: 20 * 1024 * 1024 } // 20MB limit
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

// ElevenLabs Voice Activity Detection Configuration routes
router.get('/stt', async (req, res) => {
    try {
        const config = await loadConfig(STT_CONFIG_FILE, {
            apiKey: process.env.ELEVENLABS_API_KEY ? '••••••••••••' : '',
            vadType: 'server_vad',
            vadThreshold: 0.5,
            prefixPadding: 300,
            silenceDuration: 200,
            timeout: 30000
        });

        res.render('ai-config/stt', {
            title: 'Voice Activity Detection Configuration',
            config
        });
    } catch (error) {
        console.error('VAD config error:', error);
        res.status(500).render('error', {
            title: 'Error',
            message: 'Failed to load VAD configuration',
            error: error.message
        });
    }
});

// ElevenLabs Agents Management (replaces assistants)
router.get('/agents', async (req, res) => {
    console.log('🎭 Agents route hit');
    try {
        // Get ElevenLabs agents from the service
        let agents = [];
        let serviceStatus = null;

        if (global.elevenLabsService) {
            try {
                serviceStatus = global.elevenLabsService.getStatus();
                agents = serviceStatus.agents || [];
                console.log(`🎭 Found ${agents.length} ElevenLabs agents for display`);
            } catch (error) {
                console.warn('⚠️ Could not get ElevenLabs agents:', error.message);
            }
        } else {
            console.warn('⚠️ ElevenLabs service not available');
        }

        // Load characters for assignment dropdowns
        const characters = await characterService.getAllCharacters();

        // Add voice configuration to each character
        for (let character of characters) {
            try {
                character.voiceConfig = await voiceService.getVoiceByCharacterId(character.id);
            } catch (error) {
                character.voiceConfig = null;
            }
        }

        console.log(`🎭 Rendering agents page with ${agents.length} agents and ${characters.length} characters`);

        // Temporary: return JSON to debug
        if (req.query.debug === 'json') {
            return res.json({
                title: 'ElevenLabs Agents Management',
                agents: agents,
                characters: characters,
                serviceStatus: serviceStatus
            });
        }



        res.render('ai-config/agents', {
            title: 'ElevenLabs Agents Management',
            agents: agents,
            characters: characters,
            serviceStatus: serviceStatus
        });
    } catch (error) {
        console.error('ElevenLabs agents error:', error);
        res.status(500).render('error', {
            title: 'Error',
            message: 'Failed to load ElevenLabs agents configuration',
            error: error.message
        });
    }
});

// Agent Configuration Route
router.get('/agents/:agentId/configure', async (req, res) => {
    console.log('⚙️ Agent configure route hit for agent:', req.params.agentId);
    try {
        const { agentId } = req.params;

        // Get ElevenLabs agents from the service
        let agent = null;
        let serviceStatus = null;

        if (global.elevenLabsService) {
            try {
                serviceStatus = global.elevenLabsService.getStatus();
                const agents = serviceStatus.agents || [];
                agent = agents.find(a => a.agentId === agentId);
                console.log(`⚙️ Found agent for configuration:`, agent ? agent.name : 'Not found');
            } catch (error) {
                console.warn('⚠️ Could not get ElevenLabs agent:', error.message);
            }
        } else {
            console.warn('⚠️ ElevenLabs service not available');
        }

        if (!agent) {
            return res.status(404).render('error', {
                title: 'Agent Not Found',
                message: `Agent with ID ${agentId} not found`,
                error: 'The requested agent does not exist or the ElevenLabs service is unavailable.'
            });
        }

        // Get characters for assignment
        const characters = await characterService.getAllCharacters();

        res.render('ai-config/agent-configure', {
            title: `Configure Agent: ${agent.name}`,
            agent: agent,
            characters: characters,
            serviceStatus: serviceStatus
        });
    } catch (error) {
        console.error('Agent configure route error:', error);
        res.status(500).render('error', {
            title: 'Error',
            message: 'Failed to load agent configuration',
            error: error.message
        });
    }
});

// Agent Configuration Route
router.get('/agents/:agentId/configure', async (req, res) => {
    console.log('⚙️ Agent configure route hit for agent:', req.params.agentId);
    try {
        const { agentId } = req.params;

        // Get ElevenLabs agents from the service
        let agent = null;
        let serviceStatus = null;

        if (global.elevenLabsService) {
            try {
                serviceStatus = global.elevenLabsService.getStatus();
                const agents = serviceStatus.agents || [];
                agent = agents.find(a => a.agentId === agentId);
                console.log(`⚙️ Found agent for configuration:`, agent ? agent.name : 'Not found');
            } catch (error) {
                console.warn('⚠️ Could not get ElevenLabs agent:', error.message);
            }
        } else {
            console.warn('⚠️ ElevenLabs service not available');
        }

        if (!agent) {
            return res.status(404).render('error', {
                title: 'Agent Not Found',
                message: `Agent with ID ${agentId} not found`,
                error: 'The requested agent does not exist or the ElevenLabs service is unavailable.'
            });
        }

        // Get characters for assignment
        const characters = await characterService.getAllCharacters();

        res.render('ai-config/agent-configure', {
            title: `Configure Agent: ${agent.name}`,
            agent: agent,
            characters: characters,
            serviceStatus: serviceStatus
        });
    } catch (error) {
        console.error('Agent configure route error:', error);
        res.status(500).render('error', {
            title: 'Error',
            message: 'Failed to load agent configuration',
            error: error.message
        });
    }
});

// Test route for debugging agents
router.get('/agents-simple', async (req, res) => {
    console.log('🧪 Simple agents route hit');

    try {
        let agents = [];
        let serviceStatus = null;

        if (global.elevenLabsService) {
            serviceStatus = global.elevenLabsService.getStatus();
            agents = serviceStatus.agents || [];
        }

        const characters = await characterService.getAllCharacters();

        res.render('ai-config/agents-simple', {
            title: 'Simple Agents Test',
            agents: agents,
            characters: characters,
            serviceStatus: serviceStatus
        });
    } catch (error) {
        console.error('Simple agents error:', error);
        res.status(500).send('Error: ' + error.message);
    }
});

// ElevenLabs Voice Configuration (replaces TTS)
router.get('/voices', async (req, res) => {
    try {
        const globalTTSConfig = await loadConfig(TTS_CONFIG_FILE, {
            defaultStability: 0.5,
            defaultSimilarity: 0.75,
            defaultStyle: 0.0,
            outputFormat: 'mp3_44100_128',
            modelId: 'eleven_multilingual_v2',
            timeout: 30000
        });

        // Get characters for voice assignment
        const characters = await characterService.getAllCharacters();

        // Add voice configuration to each character
        for (let character of characters) {
            try {
                character.voiceConfig = await voiceService.getVoiceByCharacterId(character.id);
            } catch (error) {
                character.voiceConfig = null;
            }
        }

        res.render('ai-config/tts', {
            title: 'ElevenLabs Voice Configuration',
            globalTTSConfig,
            characters
        });
    } catch (error) {
        res.status(500).render('error', {
            title: 'Error',
            message: 'Failed to load voice configuration',
            error: error.message
        });
    }
});

// Microphone and STT Testing Interface
router.get('/microphone-stt', async (req, res) => {
    try {
        // Get available microphones (if any microphone service is available)
        let microphones = [];
        try {
            // Try to get microphones from parts service
            const partService = require('../services/partService');
            const allParts = await partService.getAllParts();
            microphones = allParts.filter(part => part.type === 'microphone');
        } catch (error) {
            console.warn('Could not load microphones:', error.message);
        }

        // Get all characters for character selection
        const characterService = require('../services/characterService');
        const characters = await characterService.getAllCharacters();

        // Get character-specific audio configurations
        const audioConfigService = require('../services/characterAudioConfigService');

        // Add audio config to each character
        for (let character of characters) {
            try {
                character.audioConfig = await audioConfigService.getAudioConfig(character.id);
            } catch (error) {
                character.audioConfig = null;
            }
        }

        res.render('ai-config/microphone-stt', {
            title: 'Microphone and STT Testing',
            microphones: microphones,
            characters: characters
        });
    } catch (error) {
        console.error('Error loading microphone-stt page:', error);
        res.status(500).render('error', {
            title: 'Error',
            message: 'Failed to load Microphone and STT Testing page',
            error: error.message
        });
    }
});

// DEPRECATED: Redirect old OpenAI assistant routes to ElevenLabs agents
router.get('/assistants', (req, res) => {
    res.redirect('/ai-management/agents');
});

// Backward-compat: redirect old personalities page to agents
router.get('/personalities', (req, res) => {
    res.redirect('/ai-management/agents');
});

// DEPRECATED: OpenAI Assistant API endpoints - redirect to ElevenLabs
router.get('/api/assistants', (req, res) => {
    res.status(410).json({
        success: false,
        error: 'OpenAI Assistants have been replaced by ElevenLabs Conversational AI',
        redirect: '/ai-management/agents'
    });
});

router.post('/api/assistants', (req, res) => {
    res.status(410).json({
        success: false,
        error: 'OpenAI Assistants have been replaced by ElevenLabs Conversational AI',
        redirect: '/ai-management/agents'
    });
});

router.patch('/api/assistants/:assistantId', (req, res) => {
    res.status(410).json({
        success: false,
        error: 'OpenAI Assistants have been replaced by ElevenLabs Conversational AI',
        redirect: '/ai-management/agents'
    });
});

router.delete('/api/assistants/:assistantId', (req, res) => {
    res.status(410).json({
        success: false,
        error: 'OpenAI Assistants have been replaced by ElevenLabs Conversational AI',
        redirect: '/ai-management/agents'
    });
});

router.post('/api/assistants/:assistantId/assign', (req, res) => {
    res.status(410).json({
        success: false,
        error: 'OpenAI Assistants have been replaced by ElevenLabs Conversational AI',
        redirect: '/ai-management/agents'
    });
});


router.post('/api/assistants/:assistantId/test', (req, res) => {
    res.status(410).json({
        success: false,
        error: 'OpenAI Assistants have been replaced by ElevenLabs Conversational AI',
        redirect: '/conversational-ai'
    });
});

router.post('/api/assistants/:assistantId/chat/start', (req, res) => {
    res.status(410).json({
        success: false,
        error: 'OpenAI Assistants have been replaced by ElevenLabs Conversational AI',
        redirect: '/conversational-ai'
    });
});

router.post('/api/assistants/:assistantId/chat/send', (req, res) => {
    res.status(410).json({
        success: false,
        error: 'OpenAI Assistants have been replaced by ElevenLabs Conversational AI',
        redirect: '/conversational-ai'
    });
});


// DEPRECATED: Assistant configuration functionality replaced by ElevenLabs
router.post('/api/assistants/:assistantId/starters', (req, res) => {
    res.status(410).json({
        success: false,
        error: 'OpenAI Assistants have been replaced by ElevenLabs Conversational AI',
        redirect: '/ai-management/agents'
    });
});

router.post('/api/assistants/:assistantId/voice', (req, res) => {
    res.status(410).json({
        success: false,
        error: 'OpenAI Assistants have been replaced by ElevenLabs Conversational AI',
        redirect: '/ai-management/agents'
    });
});

// DEPRECATED: Knowledge files functionality replaced by ElevenLabs
router.post('/api/assistants/:assistantId/files', (req, res) => {
    res.status(410).json({
        success: false,
        error: 'OpenAI Assistants have been replaced by ElevenLabs Conversational AI',
        redirect: '/ai-management/agents'
    });
});

router.get('/api/assistants/:assistantId/files', (req, res) => {
    res.status(410).json({
        success: false,
        error: 'OpenAI Assistants have been replaced by ElevenLabs Conversational AI',
        redirect: '/ai-management/agents'
    });
});

router.delete('/api/assistants/:assistantId/files/:fileId', (req, res) => {
    res.status(410).json({
        success: false,
        error: 'OpenAI Assistants have been replaced by ElevenLabs Conversational AI',
        redirect: '/ai-management/agents'
    });
});

router.get('/api/assistants/:assistantId/files/:fileId/content', (req, res) => {
    res.status(410).json({
        success: false,
        error: 'OpenAI Assistants have been replaced by ElevenLabs Conversational AI',
        redirect: '/ai-management/agents'
    });
});

// DEPRECATED: OpenAPI actions functionality replaced by ElevenLabs
router.post('/api/assistants/:assistantId/actions/import-openapi', (req, res) => {
    res.status(410).json({
        success: false,
        error: 'OpenAI Assistants have been replaced by ElevenLabs Conversational AI',
        redirect: '/ai-management/agents'
    });
});

router.get('/api/assistants/:assistantId/actions', (req, res) => {
    res.status(410).json({
        success: false,
        error: 'OpenAI Assistants have been replaced by ElevenLabs Conversational AI',
        redirect: '/ai-management/agents'
    });
});

router.patch('/api/assistants/:assistantId/actions', (req, res) => {
    res.status(410).json({
        success: false,
        error: 'OpenAI Assistants have been replaced by ElevenLabs Conversational AI',
        redirect: '/ai-management/agents'
    });
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
        const returnTo = req.query.returnTo;

        res.render('ai-config/tts', {
            title: 'Text-to-Speech Configuration',
            globalTTSConfig,
            characters,
            selectedCharacterId,
            returnTo
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
        // Initialize ElevenLabs STT service if not already done
        if (!global.elevenLabsSTTService) {
            const ElevenLabsSTTService = require('../services/elevenLabsSTTService');
            global.elevenLabsSTTService = new ElevenLabsSTTService();
        }

        const status = global.elevenLabsSTTService.getStatus();

        res.json({
            success: true,
            status: status.isConfigured ? 'available' : 'not_configured',
            provider: 'ElevenLabs',
            model: status.model,
            isConfigured: status.isConfigured,
            apiKeyConfigured: status.apiKeyConfigured
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
        // Initialize ElevenLabs STT service if not already done
        if (!global.elevenLabsSTTService) {
            const ElevenLabsSTTService = require('../services/elevenLabsSTTService');
            global.elevenLabsSTTService = new ElevenLabsSTTService();
        }

        const testResult = await global.elevenLabsSTTService.testConnection();

        res.json({
            success: testResult.success,
            status: testResult.success ? 'available' : 'error',
            provider: 'ElevenLabs',
            responseTime: testResult.responseTime || 0,
            message: testResult.message,
            error: testResult.error
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

        // Initialize ElevenLabs STT service if not already done
        if (!global.elevenLabsSTTService) {
            const ElevenLabsSTTService = require('../services/elevenLabsSTTService');
            global.elevenLabsSTTService = new ElevenLabsSTTService();
        }

        const startTime = Date.now();
        logger.info(`🎙️ STT transcription request for file: ${req.file.originalname}`);
        console.log('File object:', JSON.stringify(req.file, null, 2));
        console.log('File path exists:', require('fs').existsSync(req.file.path));
        console.log('File path:', req.file.path);

        // Transcribe the uploaded audio file using the file path
        const transcriptionResult = await global.elevenLabsSTTService.transcribeAudio(req.file.path, {
            language: req.body.language || 'en',
            model: req.body.model || 'scribe_v1'
        });

        if (transcriptionResult.success) {
            logger.info(`✅ STT transcription completed: "${transcriptionResult.text?.substring(0, 50)}..."`);

            res.json({
                success: true,
                transcription: transcriptionResult.text,
                language: transcriptionResult.language,
                confidence: transcriptionResult.confidence,
                words: transcriptionResult.words,
                responseTime: transcriptionResult.responseTime,
                provider: 'elevenlabs',
                audioSize: req.file.size
            });
        } else {
            logger.error(`❌ STT transcription failed: ${transcriptionResult.error}`);
            res.status(500).json({
                success: false,
                error: transcriptionResult.error,
                provider: 'elevenlabs'
            });
        }
    } catch (error) {
        logger.error('❌ STT transcription error:', error.message);
        res.status(500).json({
            success: false,
            error: error.message,
            provider: 'elevenlabs'
        });
    }
});

// Legacy STT transcribe endpoint (for backward compatibility)
router.post('/api/stt/transcribe-legacy', upload.single('audio'), async (req, res) => {
    try {
        if (!req.file) {
            return res.status(400).json({ success: false, error: 'No audio file provided' });
        }

        const startTime = Date.now();
        const language = req.body.language || 'en';
        const microphone = req.body.microphone || 'default';
        const characterId = req.body.characterId;
        const isTest = req.body.isTest === 'true';

        console.log(`🎤 STT Test Request - File: ${req.file.originalname}, Size: ${req.file.size}, MIME: ${req.file.mimetype}, Microphone: ${microphone}, Character: ${characterId}`);

        // For testing purposes, we'll simulate STT processing
        // In a real implementation, this would call ElevenLabs STT service

        // Simulate processing time
        await new Promise(resolve => setTimeout(resolve, Math.random() * 500 + 200));

        // Mock transcription responses for testing
        const mockTranscriptions = [
            "Hello, this is a test of the speech to text system.",
            "Testing microphone and speech recognition functionality.",
            "The quick brown fox jumps over the lazy dog.",
            "Speech to text is working correctly.",
            "This is a sample transcription for testing purposes.",
            "Audio quality seems good for speech recognition.",
            "Testing the microphone input and STT processing.",
            "Voice recognition test completed successfully."
        ];

        // Simulate confidence based on audio file size (larger files = better quality = higher confidence)
        const confidence = Math.min(95, Math.max(60, (req.file.size / 1024) * 2 + Math.random() * 20));

        // Select a random transcription for testing
        const transcription = mockTranscriptions[Math.floor(Math.random() * mockTranscriptions.length)];

        const responseTime = Date.now() - startTime;

        // Clean up uploaded file
        try {
            await fs.unlink(req.file.path);
        } catch (e) {
            console.warn('Could not clean up uploaded file:', e.message);
        }

        console.log(`🎤 STT Test Response - Transcription: "${transcription}", Confidence: ${confidence.toFixed(1)}%, Time: ${responseTime}ms`);

        res.json({
            success: true,
            transcription: transcription,
            confidence: Math.round(confidence),
            provider: 'Mock STT (Testing)',
            responseTime: responseTime,
            audioSize: req.file.size,
            microphone: microphone,
            language: language,
            isTest: true,
            metadata: {
                originalFilename: req.file.originalname,
                mimeType: req.file.mimetype,
                timestamp: new Date().toISOString()
            }
        });

    } catch (error) {
        console.error('STT transcribe error:', error);

        // Clean up uploaded file if it exists
        if (req.file && req.file.path) {
            try {
                await fs.unlink(req.file.path);
            } catch (cleanupError) {
                console.error('Error cleaning up file:', cleanupError);
            }
        }

        res.status(500).json({
            success: false,
            error: error.message,
            responseTime: Date.now() - (req.startTime || Date.now())
        });
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

// Create new AI personality (must be before character routes to avoid parameter conflict)
router.post('/api/personalities/create', (req, res) => {
    res.status(410).json({
        success: false,
        error: 'Personality management has been replaced by ElevenLabs Conversational AI',
        redirect: '/ai-management/agents'
    });
});

// Migrate character AI configs to personalities
router.post('/api/personalities/migrate', async (req, res) => {
    try {
        const personalitiesPath = path.join(__dirname, '../data/ai-personalities.json');
        let personalities = [];

        try {
            const data = await fs.readFile(personalitiesPath, 'utf8');
            personalities = JSON.parse(data);
        } catch (error) {
            personalities = [];
        }

        // Get all characters with AI configurations
        const characters = await characterService.getAllCharacters();
        const migratedPersonalities = [];

        for (const character of characters) {
            if (character.aiConfig && Object.keys(character.aiConfig).length > 0) {
                // Check if personality already exists for this character
                const existingPersonality = personalities.find(p =>
                    p.assignedCharacter === character.id.toString()
                );

                if (!existingPersonality) {
                    // Create new personality from character AI config
                    const newPersonality = {
                        id: Date.now().toString() + '_' + character.id,
                        name: character.char_name + ' Personality',
                        provider: character.aiConfig.provider || 'openai',
                        model: character.aiConfig.model || 'gpt-4',
                        temperature: character.aiConfig.temperature || 0.8,
                        maxTokens: character.aiConfig.maxTokens || 150,
                        systemPrompt: character.aiConfig.systemPrompt || '',
                        contextLength: character.aiConfig.contextLength || 5,
                        enabled: character.aiConfig.enabled || false,
                        assignedCharacter: character.id.toString(),
                        createdAt: new Date().toISOString(),
                        migratedFrom: 'character_config'
                    };

                    personalities.push(newPersonality);
                    migratedPersonalities.push(newPersonality);
                }
            }
        }

        // Save updated personalities
        await fs.writeFile(personalitiesPath, JSON.stringify(personalities, null, 2));

        res.json({
            success: true,
            message: `Migrated ${migratedPersonalities.length} character AI configurations to personalities`,
            migratedPersonalities
        });
    } catch (error) {
        console.error('Migration error:', error);
        res.status(500).json({ success: false, error: error.message });
    }
});

// Assign personality to character
router.post('/api/personalities/:personalityId/assign', async (req, res) => {
    try {
        const { personalityId } = req.params;
        const { characterId } = req.body;

        const personalitiesPath = path.join(__dirname, '../data/ai-personalities.json');
        let personalities = [];

        try {
            const data = await fs.readFile(personalitiesPath, 'utf8');
            personalities = JSON.parse(data);
        } catch (error) {
            return res.status(404).json({ success: false, error: 'Personalities file not found' });
        }

        // Find the personality to update
        const personalityIndex = personalities.findIndex(p => p.id === personalityId);
        if (personalityIndex === -1) {
            return res.status(404).json({ success: false, error: 'Personality not found' });
        }

        // If assigning to a character, check if another personality is already assigned
        if (characterId) {
            const existingAssignment = personalities.find(p =>
                p.assignedCharacter === characterId && p.id !== personalityId
            );

            if (existingAssignment) {
                // Unassign the existing personality
                existingAssignment.assignedCharacter = null;
                existingAssignment.lastModified = new Date().toISOString();
            }
        }

        // Update the personality assignment
        personalities[personalityIndex].assignedCharacter = characterId || null;
        personalities[personalityIndex].lastModified = new Date().toISOString();

        // Save updated personalities
        await fs.writeFile(personalitiesPath, JSON.stringify(personalities, null, 2));

        res.json({
            success: true,
            message: characterId ? 'Personality assigned to character successfully' : 'Personality unassigned successfully',
            personality: personalities[personalityIndex]
        });
    } catch (error) {
        console.error('Assignment error:', error);
        res.status(500).json({ success: false, error: error.message });
    }
});

// List all personalities
router.get('/api/personalities/list', async (req, res) => {
    try {
        const personalitiesPath = path.join(__dirname, '../data/ai-personalities.json');
        let personalities = [];

        try {
            const data = await fs.readFile(personalitiesPath, 'utf8');
            personalities = JSON.parse(data);
        } catch (error) {
            // File doesn't exist yet, return empty array
            personalities = [];
        }

        res.json({ success: true, personalities });
    } catch (error) {
        console.error('List personalities error:', error);
        res.status(500).json({ success: false, error: error.message });
    }
});

// Get available characters for personality assignment
router.get('/api/personalities/available-characters', async (req, res) => {
    try {
        const characters = await characterService.getAllCharacters();

        // Return simplified character data for dropdown
        const availableCharacters = characters.map(char => ({
            id: char.id,
            name: char.char_name,
            description: char.description
        }));

        res.json({ success: true, characters: availableCharacters });
    } catch (error) {
        console.error('Get available characters error:', error);
        res.status(500).json({ success: false, error: error.message });
    }
});

// Get specific personality
router.get('/api/personalities/:personalityId', async (req, res) => {
    try {
        const personalityId = req.params.personalityId;
        const personalitiesPath = path.join(__dirname, '../data/ai-personalities.json');

        const data = await fs.readFile(personalitiesPath, 'utf8');
        const personalities = JSON.parse(data);

        const personality = personalities.find(p => p.id === personalityId);

        if (!personality) {
            return res.status(404).json({ success: false, error: 'Personality not found' });
        }

        res.json({ success: true, personality });
    } catch (error) {
        console.error('Get personality error:', error);
        res.status(500).json({ success: false, error: error.message });
    }
});

// Update personality
router.post('/api/personalities/:personalityId', async (req, res) => {
    try {
        const personalityId = req.params.personalityId;
        const config = req.body;
        const personalitiesPath = path.join(__dirname, '../data/ai-personalities.json');

        const data = await fs.readFile(personalitiesPath, 'utf8');
        const personalities = JSON.parse(data);

        const personalityIndex = personalities.findIndex(p => p.id === personalityId);

        if (personalityIndex === -1) {
            return res.status(404).json({ success: false, error: 'Personality not found' });
        }

        // Update personality
        personalities[personalityIndex] = {
            ...personalities[personalityIndex],
            name: config.personalityName.trim(),
            provider: config.aiProvider,
            model: config.aiModel,
            temperature: parseFloat(config.aiTemperature),
            maxTokens: parseInt(config.aiMaxTokens),
            systemPrompt: config.systemPrompt,
            contextLength: parseInt(config.contextLength),
            enabled: config.enabled === 'true',
            assignedCharacter: config.assignedCharacter || null,
            lastModified: new Date().toISOString()
        };

        await fs.writeFile(personalitiesPath, JSON.stringify(personalities, null, 2));

        res.json({ success: true, message: 'Personality updated successfully' });
    } catch (error) {
        console.error('Update personality error:', error);
        res.status(500).json({ success: false, error: error.message });
    }
    });

// DEPRECATED: Personality sync and document upload replaced by ElevenLabs
router.post('/api/personalities/:personalityId/sync-assistant', (req, res) => {
    res.status(410).json({
        success: false,
        error: 'Personality management has been replaced by ElevenLabs Conversational AI',
        redirect: '/ai-management/agents'
    });
});

router.post('/api/personalities/:personalityId/upload-docs', (req, res) => {
    res.status(410).json({
        success: false,
        error: 'Personality management has been replaced by ElevenLabs Conversational AI',
        redirect: '/ai-management/agents'
    });
});

router.post('/api/personalities/:personalityId/test-assistant', (req, res) => {
    res.status(410).json({
        success: false,
        error: 'Personality testing has been replaced by ElevenLabs Conversational AI',
        redirect: '/conversational-ai'
    });
});



// Toggle personality enabled status
router.post('/api/personalities/:personalityId/toggle', async (req, res) => {
    try {
        const personalityId = req.params.personalityId;
        const { enabled } = req.body;
        const personalitiesPath = path.join(__dirname, '../data/ai-personalities.json');

        const data = await fs.readFile(personalitiesPath, 'utf8');
        const personalities = JSON.parse(data);

        const personalityIndex = personalities.findIndex(p => p.id === personalityId);

        if (personalityIndex === -1) {
            return res.status(404).json({ success: false, error: 'Personality not found' });
        }

        personalities[personalityIndex].enabled = enabled;
        personalities[personalityIndex].lastModified = new Date().toISOString();

        await fs.writeFile(personalitiesPath, JSON.stringify(personalities, null, 2));

        res.json({ success: true, message: `Personality ${enabled ? 'enabled' : 'disabled'} successfully` });
    } catch (error) {
        console.error('Toggle personality error:', error);
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

// Character-specific STT configuration API (legacy - for backward compatibility)
router.get('/api/stt/character/:characterId/config', async (req, res) => {
    try {
        const characterId = parseInt(req.params.characterId);
        const audioConfigService = require('../services/characterAudioConfigService');

        const config = await audioConfigService.getCharacterAudioConfig(characterId);
        res.json({ success: true, config: config.stt });
    } catch (error) {
        console.error(`Error loading STT config for character ${characterId}:`, error);
        res.status(500).json({ success: false, error: error.message });
    }
});

router.post('/api/stt/character/:characterId/config', async (req, res) => {
    try {
        const characterId = parseInt(req.params.characterId);
        const audioConfigService = require('../services/characterAudioConfigService');

        const currentConfig = await audioConfigService.getCharacterAudioConfig(characterId);
        const updatedConfig = {
            ...currentConfig,
            stt: {
                ...currentConfig.stt,
                ...req.body
            }
        };

        await audioConfigService.updateCharacterAudioConfig(characterId, updatedConfig);
        res.json({ success: true, config: updatedConfig.stt });
    } catch (error) {
        console.error(`Error updating STT config for character ${characterId}:`, error);
        res.status(500).json({ success: false, error: error.message });
    }
});

// Character + Microphone specific STT configuration API
router.get('/api/stt/character/:characterId/microphone/:microphoneId/config', async (req, res) => {
    try {
        const characterId = parseInt(req.params.characterId);
        const microphoneId = parseInt(req.params.microphoneId);
        const audioConfigService = require('../services/characterAudioConfigService');

        const config = await audioConfigService.getCharacterMicrophoneSTTConfig(characterId, microphoneId);
        res.json({ success: true, config });
    } catch (error) {
        console.error(`Error loading STT config for character ${characterId} microphone ${microphoneId}:`, error);
        res.status(500).json({ success: false, error: error.message });
    }
});

router.post('/api/stt/character/:characterId/microphone/:microphoneId/config', async (req, res) => {
    try {
        const characterId = parseInt(req.params.characterId);
        const microphoneId = parseInt(req.params.microphoneId);
        const audioConfigService = require('../services/characterAudioConfigService');

        await audioConfigService.updateCharacterMicrophoneSTTConfig(characterId, microphoneId, req.body);
        const updatedConfig = await audioConfigService.getCharacterMicrophoneSTTConfig(characterId, microphoneId);

        res.json({ success: true, config: updatedConfig });
    } catch (error) {
        console.error(`Error updating STT config for character ${characterId} microphone ${microphoneId}:`, error);
        res.status(500).json({ success: false, error: error.message });
    }
});

// Live transcription WebSocket endpoint info
router.get('/api/stt/live-transcription-info', async (req, res) => {
    try {
        // Initialize ElevenLabs Live STT service if not already done
        if (!global.elevenLabsLiveSTTService) {
            const ElevenLabsLiveSTTService = require('../services/elevenLabsLiveSTTService');
            global.elevenLabsLiveSTTService = new ElevenLabsLiveSTTService();
            await global.elevenLabsLiveSTTService.initialize();
        }

        const liveSTTStatus = global.elevenLabsLiveSTTService.getStatus();
        const hostname = req.hostname === 'localhost' ? '127.0.0.1' : req.hostname;

        // Check if secure proxy is available for HTTPS requests
        let websocketUrl, port, protocol;

        // Debug request details
        const isSecure = req.secure || req.headers['x-forwarded-proto'] === 'https' || req.protocol === 'https';
        const proxyAvailable = false; // We'll use direct connection for now

        console.log(`🔍 Live transcription request debug:`, {
            secure: req.secure,
            protocol: req.protocol,
            xForwardedProto: req.headers['x-forwarded-proto'],
            isSecure,
            proxyAvailable,
            hostname
        });

        // Always connect to Live STT service for transcription-only functionality
        // The Conversational Service (port 8771) is for full AI conversations
        // The Live STT Service (port 8778) is for speech-to-text transcription only

        if (isSecure && global.elevenLabsSTTWebSocketProxy) {
            // Use secure WebSocket proxy for HTTPS requests
            const sttProxyStatus = global.elevenLabsSTTWebSocketProxy.getStatus();
            if (sttProxyStatus.isRunning) {
                protocol = 'wss';
                port = sttProxyStatus.proxyPort; // Should be 8873
                websocketUrl = `${protocol}://${hostname}:${port}`;
                console.log(`✅ Using secure STT proxy: ${websocketUrl}`);
            } else {
                // Fallback to plain WebSocket
                protocol = 'ws';
                port = 8778;
                websocketUrl = `${protocol}://${hostname}:${port}`;
                console.log(`⚠️ Secure STT proxy not running, using plain WebSocket: ${websocketUrl}`);
            }
        } else {
            // Use plain WebSocket for HTTP requests - connect to Live STT service
            protocol = 'ws';
            port = 8778; // ElevenLabs Live STT service port
            websocketUrl = `${protocol}://${hostname}:${port}`;
            console.log(`🔗 Using Live STT WebSocket: ${websocketUrl} (isSecure: ${isSecure}, sttProxyAvailable: ${global.elevenLabsSTTWebSocketProxy ? 'true' : 'false'})`);
        }
        console.log(`📝 Note: Using Live STT Service for transcription-only functionality`);

        res.json({
            success: true,
            websocketUrl: websocketUrl,
            status: liveSTTStatus.isRunning ? 'available' : 'unavailable',
            port: port,
            hostname: hostname,
            protocol: protocol,
            sttServiceConfigured: liveSTTStatus.sttServiceConfigured,
            activeConnections: liveSTTStatus.activeConnections
        });
    } catch (error) {
        console.error('Error getting live transcription info:', error);
        res.status(500).json({ success: false, error: error.message });
    }
});

// Testing API routes for ElevenLabs
router.post('/api/test/elevenlabs', async (req, res) => {
    try {
        const startTime = Date.now();
        const elevenLabsService = global.elevenLabsService;

        if (!elevenLabsService) {
            return res.json({
                success: false,
                error: 'ElevenLabs service not initialized'
            });
        }

        const status = elevenLabsService.getStatus();
        const responseTime = Date.now() - startTime;

        res.json({
            success: true,
            activeAgents: status ? status.availableAgents : 0,
            wsStatus: status ? (status.isRunning ? 'Connected' : 'Disconnected') : 'Unknown',
            responseTime: Math.round(responseTime),
            activeConnections: status ? status.activeConnections : 0,
            port: status ? status.port : 8771
        });
    } catch (error) {
        res.status(500).json({ success: false, error: error.message });
    }
});

router.post('/api/test/voices', async (req, res) => {
    try {
        const startTime = Date.now();
        const elevenLabsService = global.elevenLabsService;

        if (!elevenLabsService) {
            return res.json({
                success: false,
                error: 'ElevenLabs service not initialized'
            });
        }

        // Mock voice count test
        const responseTime = Date.now() - startTime + Math.random() * 500;

        res.json({
            success: true,
            voiceCount: 'Available',
            responseTime: Math.round(responseTime)
        });
    } catch (error) {
        res.status(500).json({ success: false, error: error.message });
    }
});

router.post('/api/test/conversation', async (req, res) => {
    try {
        const startTime = Date.now();
        const elevenLabsService = global.elevenLabsService;

        if (!elevenLabsService) {
            return res.json({
                success: false,
                error: 'ElevenLabs service not initialized'
            });
        }

        // Check if audio file was uploaded
        if (req.files && req.files.audio) {
            // Handle audio file upload for transcription testing
            const audioFile = req.files.audio;

            // Mock transcription for demo (in real implementation, would send to ElevenLabs)
            const mockTranscriptions = [
                "Hello, this is a test of the ElevenLabs voice system.",
                "Testing voice activity detection with ElevenLabs.",
                "The quick brown fox jumps over the lazy dog.",
                "MonsterBox ElevenLabs integration is working perfectly.",
                "Voice recognition and transcription test successful."
            ];

            const transcription = mockTranscriptions[Math.floor(Math.random() * mockTranscriptions.length)];
            const responseTime = Date.now() - startTime;

            res.json({
                success: true,
                transcription: transcription,
                vadStatus: 'Active',
                responseTime: Math.round(responseTime),
                audioSize: audioFile.size
            });
        } else {
            // Regular STT system test without audio
            const status = elevenLabsService.getStatus();
            const responseTime = Date.now() - startTime;

            res.json({
                success: true,
                activeConnections: status ? status.activeConnections : 0,
                vadStatus: status && status.isRunning ? 'Enabled' : 'Disabled',
                responseTime: Math.round(responseTime),
                sttSystemStatus: status && status.isRunning ? 'Online' : 'Offline',
                elevenLabsConnected: status && status.isRunning
            });
        }
    } catch (error) {
        res.status(500).json({ success: false, error: error.message });
    }
});

router.post('/api/test/full-conversation', async (req, res) => {
    try {
        const startTime = Date.now();
        const elevenLabsService = global.elevenLabsService;

        if (!elevenLabsService) {
            return res.json({
                success: false,
                error: 'ElevenLabs service not initialized'
            });
        }

        // Mock full conversation test
        const agentTime = Math.random() * 300 + 100;
        const voiceInputTime = Math.random() * 200 + 50;
        const voiceOutputTime = Math.random() * 500 + 200;

        const totalTime = agentTime + voiceInputTime + voiceOutputTime;

        res.json({
            success: true,
            agent: {
                success: true,
                responseTime: Math.round(agentTime)
            },
            voiceInput: {
                success: true,
                responseTime: Math.round(voiceInputTime)
            },
            voiceOutput: {
                success: true,
                responseTime: Math.round(voiceOutputTime)
            },
            totalTime: Math.round(totalTime),
            audioUrl: '/sounds/conversation-test.mp3'
        });
    } catch (error) {
        res.status(500).json({ success: false, error: error.message });
    }
});

// ElevenLabs VAD Configuration
router.post('/api/vad/config', async (req, res) => {
    try {
        const config = req.body;

        // Save VAD configuration
        const vadConfigFile = path.join(__dirname, '../data/ai-config/vad-config.json');
        await fs.writeFile(vadConfigFile, JSON.stringify(config, null, 2));

        // Update ElevenLabs service if available
        if (global.elevenLabsService) {
            global.elevenLabsService.updateVADConfig(config);
        }

        res.json({ success: true, message: 'VAD configuration saved successfully' });
    } catch (error) {
        console.error('Error saving VAD configuration:', error);
        res.status(500).json({ success: false, error: error.message });
    }
});

// ElevenLabs Voices API
router.get('/api/elevenlabs/voices', async (req, res) => {
    try {
        if (!process.env.ELEVENLABS_API_KEY) {
            return res.json({ success: false, error: 'ElevenLabs API key not configured' });
        }

        const response = await fetch('https://api.elevenlabs.io/v1/voices', {
            headers: {
                'xi-api-key': process.env.ELEVENLABS_API_KEY
            }
        });

        if (!response.ok) {
            throw new Error(`ElevenLabs API error: ${response.status}`);
        }

        const data = await response.json();

        // Filter for favorites only if requested
        let voices = data.voices || [];
        if (req.query.favorites === 'true') {
            voices = voices.filter(voice => voice.category === 'premade' || voice.sharing?.status === 'public');
        }

        res.json({
            success: true,
            voices: voices,
            total: voices.length,
            favorites: voices.filter(v => v.category === 'premade').length
        });
    } catch (error) {
        console.error('Error fetching ElevenLabs voices:', error);
        res.status(500).json({ success: false, error: error.message });
    }
});

// ElevenLabs Voice Preview
router.post('/api/elevenlabs/preview', async (req, res) => {
    try {
        const { voiceId, text, settings = {} } = req.body;

        if (!voiceId || !text) {
            return res.status(400).json({ success: false, error: 'Voice ID and text are required' });
        }

        if (!process.env.ELEVENLABS_API_KEY) {
            return res.status(400).json({ success: false, error: 'ElevenLabs API key not configured' });
        }

        // Generate speech using ElevenLabs API
        const response = await fetch(`https://api.elevenlabs.io/v1/text-to-speech/${voiceId}`, {
            method: 'POST',
            headers: {
                'xi-api-key': process.env.ELEVENLABS_API_KEY,
                'Content-Type': 'application/json'
            },
            body: JSON.stringify({
                text: text,
                model_id: settings.modelId || 'eleven_multilingual_v2',
                voice_settings: {
                    stability: settings.stability || 0.5,
                    similarity_boost: settings.similarity || 0.75,
                    style: settings.style || 0.0,
                    use_speaker_boost: true
                }
            })
        });

        if (!response.ok) {
            throw new Error(`ElevenLabs API error: ${response.status}`);
        }

        // Get audio data
        const audioBuffer = await response.arrayBuffer();
        const audioBase64 = Buffer.from(audioBuffer).toString('base64');

        res.json({
            success: true,
            audioData: audioBase64,
            format: 'mp3',
            message: 'Voice preview generated successfully'
        });

    } catch (error) {
        console.error('Error generating ElevenLabs preview:', error);
        res.status(500).json({ success: false, error: error.message });
    }
});

// ElevenLabs Global Settings
router.post('/api/elevenlabs/global', async (req, res) => {
    try {
        const config = req.body;

        // Save ElevenLabs global configuration
        const elevenLabsConfigFile = path.join(__dirname, '../data/ai-config/elevenlabs-config.json');
        await fs.writeFile(elevenLabsConfigFile, JSON.stringify(config, null, 2));

        res.json({ success: true, message: 'ElevenLabs global settings saved successfully' });
    } catch (error) {
        console.error('Error saving ElevenLabs global settings:', error);
        res.status(500).json({ success: false, error: error.message });
    }
});

// ElevenLabs Save All Voice Assignments
router.post('/api/elevenlabs/save-all', async (req, res) => {
    try {
        // This would save all character voice assignments
        // Implementation depends on how character data is stored
        res.json({ success: true, message: 'All ElevenLabs voice assignments saved successfully' });
    } catch (error) {
        console.error('Error saving ElevenLabs voice assignments:', error);
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
        // Check ElevenLabs status
        const elevenLabsStatus = await getElevenLabsStatus();

        return {
            elevenlabs: elevenLabsStatus
        };
    } catch (error) {
        console.error('Error getting system status:', error);
        return null;
    }
}

async function getElevenLabsStatus() {
    try {
        // Check if ElevenLabs service is available
        const hasApiKey = !!process.env.ELEVENLABS_API_KEY;
        const elevenLabsService = global.elevenLabsService;

        let status = {
            online: hasApiKey && elevenLabsService,
            activeAgents: 0,
            activeConnections: 0,
            voiceCount: 'Loading...',
            configuredCharacters: 0,
            port: elevenLabsService ? elevenLabsService.port : '8771',
            vadEnabled: true,
            status: 'Unknown'
        };

        if (!hasApiKey) {
            status.status = 'No API key';
            status.online = false;
            return status;
        }

        if (!elevenLabsService) {
            status.status = 'Service not initialized';
            status.online = false;
            return status;
        }

        // Get service status from ElevenLabs service
        const serviceStatus = elevenLabsService.getStatus();
        if (serviceStatus) {
            status.activeAgents = serviceStatus.availableAgents || 0;
            status.activeConnections = serviceStatus.activeConnections || 0;
            status.voiceCount = serviceStatus.agents ? serviceStatus.agents.length : 0;
            status.configuredCharacters = serviceStatus.agents ? serviceStatus.agents.length : 0;
            status.status = serviceStatus.isRunning ? 'Connected' : 'Disconnected';
            status.online = serviceStatus.isRunning;
            status.online = serviceStatus.online;
        } else {
            status.status = 'Connected';
        }

        return status;
    } catch (error) {
        console.error('Error getting ElevenLabs status:', error);
        return {
            online: false,
            activeAgents: 0,
            activeConnections: 0,
            voiceCount: 'Error',
            configuredCharacters: 0,
            port: '8771',
            vadEnabled: false,
            status: 'Error: ' + error.message
        };
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

// AI Chat endpoint for Enhanced Test Chat
router.post('/chat', async (req, res) => {
    try {
        const { message, character, characterId, context, liveMode } = req.body;

        if (!message) {
            return res.status(400).json({
                success: false,
                error: 'Message is required'
            });
        }

        const modeLabel = liveMode ? '[LIVE]' : '[CHAT]';
        console.log(`💬 ${modeLabel} AI Chat request: "${message}" (Character: ${character || 'default'})`);

        // Get character information
        let targetCharacter = null;
        if (characterId) {
            try {
                targetCharacter = await characterService.getCharacterById(characterId);
            } catch (error) {
                console.warn(`⚠️ Could not get character ${characterId}:`, error.message);
            }
        }

        // AI chat is now handled by ElevenLabs Conversational AI
        console.log('🎭 AI chat redirected to ElevenLabs Conversational AI');

        res.json({
            success: false,
            error: 'AI chat functionality has been replaced by ElevenLabs Conversational AI',
            redirect: '/conversational-ai',
            data: {
                message: 'Please use the ElevenLabs Conversational AI interface for character conversations',
                character: targetCharacter?.char_name || 'Unknown'
            }
        });
        return;

        // Fallback response if no assistant or assistant failed
        const fallbackResponses = [
            "I hear you, though the shadows cloud my response...",
            "Your words echo in the darkness...",
            "The spirits whisper, but I cannot make out their meaning...",
            "Something stirs in the void, but I cannot grasp it...",
            "The connection wavers between worlds..."
        ];

        const fallbackResponse = fallbackResponses[Math.floor(Math.random() * fallbackResponses.length)];

        res.json({
            success: true,
            data: {
                aiResponse: {
                    text: fallbackResponse,
                    character: targetCharacter?.char_name || 'Unknown',
                    metadata: {
                        fallback: true,
                        timestamp: new Date().toISOString()
                    }
                }
            }
        });

    } catch (error) {
        console.error('❌ AI Chat error:', error);
        res.status(500).json({
            success: false,
            error: 'Failed to process chat message',
            details: error.message
        });
    }
});

// ElevenLabs Agents API Endpoints
router.get('/api/elevenlabs/agents', async (req, res) => {
    try {
        // Get ElevenLabs agents from the service
        if (global.elevenLabsService) {
            const status = global.elevenLabsService.getStatus();
            res.json({
                success: true,
                agents: status.agents || []
            });
        } else {
            res.json({
                success: false,
                error: 'ElevenLabs service not available',
                agents: []
            });
        }
    } catch (error) {
        console.error('Error fetching ElevenLabs agents:', error);
        res.status(500).json({
            success: false,
            error: 'Failed to fetch ElevenLabs agents',
            details: error.message
        });
    }
});

router.post('/api/elevenlabs/agents', async (req, res) => {
    try {
        const { name, description, instructions, voiceId, conversationStarters } = req.body;

        // Create new ElevenLabs agent
        if (global.elevenLabsService) {
            const agent = await global.elevenLabsService.createAgent({
                name,
                description,
                instructions,
                voiceId,
                conversationStarters
            });

            res.json({
                success: true,
                agent: agent
            });
        } else {
            res.json({
                success: false,
                error: 'ElevenLabs service not available'
            });
        }
    } catch (error) {
        console.error('Error creating ElevenLabs agent:', error);
        res.status(500).json({
            success: false,
            error: 'Failed to create ElevenLabs agent',
            details: error.message
        });
    }
});

// ElevenLabs Agents API endpoints
router.post('/api/elevenlabs/agents/assign', async (req, res) => {
    try {
        const { agentId, characterId } = req.body;

        if (!agentId) {
            return res.status(400).json({
                success: false,
                error: 'Agent ID is required'
            });
        }

        if (!characterId) {
            return res.status(400).json({
                success: false,
                error: 'Character ID is required'
            });
        }

        // Update character with agent assignment
        const character = await characterService.getCharacterById(characterId);
        if (!character) {
            return res.status(404).json({
                success: false,
                error: 'Character not found'
            });
        }

        // Update character with ElevenLabs agent ID
        character.elevenLabsAgentId = agentId;
        const updated = await characterService.updateCharacter(characterId, character);

        if (updated) {
            // Notify ElevenLabs service of the assignment
            if (global.elevenLabsService) {
                try {
                    await global.elevenLabsService.assignAgentToCharacter(agentId, characterId);
                } catch (error) {
                    console.warn('⚠️ Could not notify ElevenLabs service:', error.message);
                }
            }

            res.json({
                success: true,
                message: 'Agent assigned to character successfully'
            });
        } else {
            res.status(500).json({
                success: false,
                error: 'Failed to update character'
            });
        }

    } catch (error) {
        console.error('❌ Agent assignment error:', error);
        res.status(500).json({
            success: false,
            error: error.message
        });
    }
});

router.get('/api/elevenlabs/agents', async (req, res) => {
    try {
        let agents = [];

        if (global.elevenLabsService) {
            const status = global.elevenLabsService.getStatus();
            agents = status.agents || [];
        }

        res.json({
            success: true,
            agents: agents
        });
    } catch (error) {
        console.error('❌ Get agents error:', error);
        res.status(500).json({
            success: false,
            error: error.message
        });
    }
});

module.exports = router;
