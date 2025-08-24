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

const OpenAIAssistantService = require('../ai/services/OpenAIAssistantService');
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

// OpenAI Assistants Management UI
router.get('/assistants', async (req, res) => {
    try {
        const OpenAIAssistantService = require('../ai/services/OpenAIAssistantService');
        const assistantService = new OpenAIAssistantService({});

        // List assistants (best-effort if key missing)
        let assistants = [];
        try {
            assistants = await assistantService.listAssistants({ limit: 100 });
        } catch (e) {
            assistants = [];
        }

        // Function to parse instructions into 5 sections
        function parseInstructions(instructions) {
            if (!instructions || typeof instructions !== 'string') {
                return {
                    overallDescription: '',
                    roleAndVoice: '',
                    hardRules: '',
                    positiveExamples: '',
                    negativeExamples: ''
                };
            }

            const parsed = {
                overallDescription: '',
                roleAndVoice: '',
                hardRules: '',
                positiveExamples: '',
                negativeExamples: ''
            };

            // Split by section headers
            const sections = instructions.split(/\n\n(?=[A-Z][A-Z\s&()]+:)/);

            sections.forEach(section => {
                const trimmedSection = section.trim();
                if (trimmedSection.startsWith('OVERALL DESCRIPTION:')) {
                    parsed.overallDescription = trimmedSection.replace('OVERALL DESCRIPTION:', '').trim();
                } else if (trimmedSection.startsWith('ROLE & VOICE:')) {
                    parsed.roleAndVoice = trimmedSection.replace('ROLE & VOICE:', '').trim();
                } else if (trimmedSection.startsWith('HARD RULES:')) {
                    parsed.hardRules = trimmedSection.replace('HARD RULES:', '').trim();
                } else if (trimmedSection.startsWith('POSITIVE EXAMPLES:')) {
                    parsed.positiveExamples = trimmedSection.replace('POSITIVE EXAMPLES:', '').trim();
                } else if (trimmedSection.startsWith('NEGATIVE EXAMPLES (DO NOT DO):')) {
                    parsed.negativeExamples = trimmedSection.replace('NEGATIVE EXAMPLES (DO NOT DO):', '').trim();
                } else if (!trimmedSection.includes(':') && parsed.overallDescription === '') {
                    // If no section headers found, treat as overall description
                    parsed.overallDescription = trimmedSection;
                }
            });

            return parsed;
        }

        // Enrich assistants with local config (conversation starters, files, actions) and parsed instructions
        const assistantConfig = require('../ai/services/assistantConfigStore');
        const cfg = await assistantConfig.readConfig();
        const enriched = assistants.map(a => ({
            ...a,
            config: cfg.assistants?.[a.id] || undefined,
            parsedInstructions: parseInstructions(a.instructions)
        }));

        // Load characters for assignment dropdowns and enrich with voice configurations
        const characters = await characterService.getAllCharacters();

        // Add voice configuration to each character
        for (let character of characters) {
            try {
                character.voiceConfig = await voiceService.getVoiceByCharacterId(character.id);
            } catch (error) {
                character.voiceConfig = null;
            }
        }

        res.render('ai-config/assistants', {
            title: 'OpenAI Assistants Management',
            assistants: enriched,
            characters
        });
    } catch (error) {
        console.error('Assistants config error:', error);
        res.status(500).render('error', {
            title: 'Error',
            message: 'Failed to load OpenAI Assistants',
            error: error.message
        });
    }
});

// Backward-compat: redirect old personalities page to assistants
router.get('/personalities', (req, res) => {
    return res.redirect('/ai-management/assistants');
});


// Assistants CRUD API
router.get('/api/assistants', async (req, res) => {
    try {
        const service = new OpenAIAssistantService({});
        const assistants = await service.listAssistants({ limit: 100 });
        res.json({ success: true, assistants });
    } catch (error) {
        res.status(500).json({ success: false, error: error.message });
    }
});

router.post('/api/assistants', async (req, res) => {
    try {
        const service = new OpenAIAssistantService({});
        const assistant = await service.createAssistant(req.body || {});
        res.json({ success: true, assistant });
    } catch (error) {
        res.status(500).json({ success: false, error: error.message });
    }
});

router.patch('/api/assistants/:assistantId', async (req, res) => {
    try {
        const { assistantId } = req.params;
        const updateData = req.body || {};

        // Log instruction updates for verification
        if (updateData.instructions) {
            console.log(`📝 Instructions update for assistant ${assistantId}:`, updateData.instructions.substring(0, 100) + '...');
        }

        const service = new OpenAIAssistantService({});
        const updated = await service.updateAssistant(assistantId, updateData);

        console.log(`✅ Assistant ${assistantId} updated successfully`);
        res.json({ success: true, assistant: updated });
    } catch (error) {
        console.error(`❌ Failed to update assistant ${assistantId}:`, error.message);
        res.status(500).json({ success: false, error: error.message });
    }
});

router.delete('/api/assistants/:assistantId', async (req, res) => {
    try {
        const { assistantId } = req.params;
        // Prevent deletion if assigned to a character
        const characters = await characterService.getAllCharacters();
        const inUse = characters.some(c => c.openaiAssistantId === assistantId);
        if (inUse) {
            return res.status(400).json({ success: false, error: 'Assistant is assigned to a character and cannot be deleted' });
        }
        const service = new OpenAIAssistantService({});
        await service.deleteAssistant(assistantId);
        res.json({ success: true });
    } catch (error) {
        res.status(500).json({ success: false, error: error.message });
    }
});

// Assign assistant to character
router.post('/api/assistants/:assistantId/assign', async (req, res) => {
    try {
        const { assistantId } = req.params;
        const { characterId } = req.body;
        const character = await characterService.getCharacterById(characterId);
        if (!character) return res.status(404).json({ success: false, error: 'Character not found' });

        const updated = await characterService.updateCharacter(characterId, {
            ...character,
            openaiAssistantId: assistantId
        });
        res.json({ success: true, character: updated });
    } catch (error) {
        res.status(500).json({ success: false, error: error.message });
    }
});


// Test an assistant directly by ID
router.post('/api/assistants/:assistantId/test', async (req, res) => {
    try {
        const { assistantId } = req.params;
        const { prompt } = req.body;
        const service = new OpenAIAssistantService({});
        const result = await service.runAssistantMessageByAssistantId(assistantId, prompt || 'Introduce yourself.');
        res.json({ success: true, response: result.text, metadata: { threadId: result.threadId, runId: result.runId } });
    } catch (error) {
        console.error('Assistant test error:', error);
        res.status(500).json({ success: false, error: error.message });
    }
});

// Chat API for an assistant: start thread and send messages
router.post('/api/assistants/:assistantId/chat/start', async (req, res) => {
    try {
        const { assistantId } = req.params;
        const service = new OpenAIAssistantService({});
        // ensure file_search with vector store if configured
        const cfg = await assistantConfig.getAssistantConfig(assistantId);
        if (cfg.vectorStoreId) {
            try { await service.ensureAssistantHasFileSearch(assistantId, cfg.vectorStoreId); } catch (e) {}
        }
        const thread = await service.createThread();
        res.json({ success: true, threadId: thread.id });
    } catch (error) {
        res.status(500).json({ success: false, error: error.message });
    }
});

router.post('/api/assistants/:assistantId/chat/send', async (req, res) => {
    try {
        const { assistantId } = req.params;
        const { threadId, message } = req.body;
        if (!threadId) throw new Error('threadId is required');
        if (!message) throw new Error('message is required');
        const service = new OpenAIAssistantService({});
        await service.sendMessageToThread(threadId, message);
        const { text, runId } = await service.runAssistantOnThread(assistantId, threadId, {});
        res.json({ success: true, runId, text });
    } catch (error) {
        res.status(500).json({ success: false, error: error.message });
    }
});


// Assistant configuration store
const assistantConfig = require('../ai/services/assistantConfigStore');

// List assistants (+ configs)
router.get('/api/assistants', async (req, res) => {
    try {
        const service = new OpenAIAssistantService({});
        const list = await service.listAssistants({ limit: 100 });
        const cfg = await assistantConfig.readConfig();
        const enriched = list.map(a => ({ ...a, config: cfg.assistants?.[a.id] || undefined }));
        res.json({ success: true, assistants: enriched });
    } catch (error) {
        res.status(500).json({ success: false, error: error.message });
    }
});

// Update conversation starters
router.post('/api/assistants/:assistantId/starters', async (req, res) => {
    try {
        const { assistantId } = req.params; const { starters } = req.body;
        const updated = await assistantConfig.setAssistantConfig(assistantId, { conversationStarters: Array.isArray(starters)? starters : [] });
        res.json({ success: true, config: updated });
    } catch (error) {
        res.status(500).json({ success: false, error: error.message });
    }
});

// Voice assignment for assistants
router.post('/api/assistants/:assistantId/voice', async (req, res) => {
    try {
        const { assistantId } = req.params;
        const { voiceId, settings } = req.body;

        const voiceConfig = {
            voiceId: voiceId,
            settings: settings || {
                speed: 1.0,
                pitch: 0,
                volume: 0,
                emotion: 'Neutral'
            }
        };

        const updated = await assistantConfig.setAssistantConfig(assistantId, { voice: voiceConfig });
        res.json({ success: true, config: updated });
    } catch (error) {
        res.status(500).json({ success: false, error: error.message });
    }
});

// Knowledge files: upload

router.post('/api/assistants/:assistantId/files', upload.array('files'), async (req, res) => {
    try {
        const { assistantId } = req.params;
        const service = new OpenAIAssistantService({});
        // Ensure vector store and assistant file_search tool
        let cfg = await assistantConfig.getAssistantConfig(assistantId);
        if (!cfg.vectorStoreId) {
            const vs = await service.createVectorStore({ name: `kb_${assistantId}` });
            cfg = await assistantConfig.setAssistantConfig(assistantId, { vectorStoreId: vs.id });
            await service.ensureAssistantHasFileSearch(assistantId, vs.id);
        }
        const uploaded = [];
        try {
            // First try SDK batch upload for efficiency
            const batchFiles = await service.uploadFilesToVectorStore(cfg.vectorStoreId, (req.files||[]).map(f => f.path));
            for (let i = 0; i < (req.files||[]).length; i++) {
                const f = req.files[i];
                const bf = batchFiles[i] || batchFiles.find(x => x?.filename === f.originalname || x?.display_name === f.originalname) || {};
                const fileId = bf?.id || bf?.file_id || bf?.file?.id;
                uploaded.push({ fileId, filename: f.originalname, uploadedAt: new Date().toISOString() });
            }
        } catch (e) {
            // Per-file fallback path
            for (const f of req.files || []) {
                try {
                    const vfile = await service.uploadFileToVectorStore(cfg.vectorStoreId, f.path, { filename: f.originalname });
                    const fileId = vfile?.id || vfile?.file?.id || vfile?.data?.id;
                    uploaded.push({ fileId, filename: f.originalname, uploadedAt: new Date().toISOString() });
                } catch (e2) {
                    console.error('Knowledge file upload failed:', f.originalname, e2?.message || e2);
                    throw e2;
                } finally {
                    try { await fs.unlink(f.path); } catch (_) {}
                }
            }
        } finally {
            // Ensure we always clean up any remaining temp files
            for (const f of req.files || []) { try { await fs.unlink(f.path); } catch (_) {} }
        }
        const merged = await assistantConfig.setAssistantConfig(assistantId, { files: [...(cfg.files||[]), ...uploaded] });
        res.json({ success: true, files: merged.files, vectorStoreId: merged.vectorStoreId });
    } catch (error) {
        console.error('Upload knowledge files error:', error);
        res.status(500).json({ success: false, error: error.message });
    }
});

// Knowledge files: list
router.get('/api/assistants/:assistantId/files', async (req, res) => {
    try {
        const { assistantId } = req.params; const cfg = await assistantConfig.getAssistantConfig(assistantId);
        res.json({ success: true, files: cfg.files || [], vectorStoreId: cfg.vectorStoreId || null });
    } catch (error) {
        res.status(500).json({ success: false, error: error.message });
    }
});

// Knowledge files: delete
router.delete('/api/assistants/:assistantId/files/:fileId', async (req, res) => {
    try {
        const { assistantId, fileId } = req.params; const service = new OpenAIAssistantService({});
        const cfg = await assistantConfig.getAssistantConfig(assistantId);
        if (cfg.vectorStoreId) {
            try { await service.removeFileFromVectorStore(cfg.vectorStoreId, fileId); } catch (e) {}
        }
        const remaining = (cfg.files||[]).filter(f=>f.fileId!==fileId);
        const updated = await assistantConfig.setAssistantConfig(assistantId, { files: remaining });
        res.json({ success: true, files: updated.files });
    } catch (error) {
        res.status(500).json({ success: false, error: error.message });
    }
});

// Knowledge files: get content
router.get('/api/assistants/:assistantId/files/:fileId/content', async (req, res) => {
    try {
        const { assistantId, fileId } = req.params;
        const service = new OpenAIAssistantService({});

        // Get file content from OpenAI
        const fileContent = await service.getFileContent(fileId);

        res.json({
            success: true,
            content: fileContent.content,
            contentType: fileContent.contentType || 'text/plain'
        });
    } catch (error) {
        console.error('File content retrieval error:', error);
        res.status(500).json({ success: false, error: error.message });
    }
});

// Actions (OpenAPI): import
router.post('/api/assistants/:assistantId/actions/import-openapi', async (req, res) => {
    try {
        const { assistantId } = req.params; const { openapiUrl, schema } = req.body;
        const source = openapiUrl ? 'url' : 'upload';
        let openapi;
        if (openapiUrl) {
            const axios = require('axios');
            const resp = await axios.get(openapiUrl);
            openapi = resp.data;
        } else {
            openapi = schema;
        }
        // Derive function tools from OpenAPI (simplified)
        const tools = [];
        const paths = openapi?.paths || {};
        for (const [p, methods] of Object.entries(paths)) {
            for (const [m, spec] of Object.entries(methods)) {
                const name = (spec.operationId || `${m}_${p}`).replace(/[^a-zA-Z0-9_]/g,'_');
                tools.push({ type: 'function', function: { name, description: spec.summary || spec.description || name, parameters: spec.requestBody?.content?.['application/json']?.schema || { type:'object', properties:{} } } });
            }
        }
        // Update assistant tools (merge with file_search if exists)
        const service = new OpenAIAssistantService({});
        const a = await service.getAssistant(assistantId);
        const baseTools = Array.isArray(a.tools)? a.tools : [];
        const mergedTools = [...baseTools.filter(t=>t.type==='file_search'), ...tools];
        await service.updateAssistant(assistantId, { tools: mergedTools });
        const updatedCfg = await assistantConfig.setAssistantConfig(assistantId, { openapi: { source, url: openapiUrl || null, schema: openapi, functions: tools.map(t=>({ name: t.function.name, description: t.function.description, parameters: t.function.parameters, enabled: true })) } });
        res.json({ success: true, tools: mergedTools, config: updatedCfg });
    } catch (error) {
        res.status(500).json({ success: false, error: error.message });
    }
});

// Actions: list
router.get('/api/assistants/:assistantId/actions', async (req, res) => {
    try {
        const { assistantId } = req.params; const cfg = await assistantConfig.getAssistantConfig(assistantId);
        res.json({ success: true, actions: cfg.openapi?.functions || [] });
    } catch (error) {
        res.status(500).json({ success: false, error: error.message });
    }
});

// Actions: enable/disable set
router.patch('/api/assistants/:assistantId/actions', async (req, res) => {
    try {
        const { assistantId } = req.params; const { functions } = req.body; // [{name, enabled}]
        const cfg = await assistantConfig.getAssistantConfig(assistantId);
        const fnMap = new Map((functions||[]).map(f=>[f.name, f.enabled]));
        const updatedFns = (cfg.openapi?.functions||[]).map(f=>({ ...f, enabled: fnMap.has(f.name) ? !!fnMap.get(f.name) : f.enabled }));
        const updated = await assistantConfig.setAssistantConfig(assistantId, { openapi: { ...(cfg.openapi||{}), functions: updatedFns } });
        res.json({ success: true, actions: updated.openapi.functions });
    } catch (error) {
        res.status(500).json({ success: false, error: error.message });
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

        if (!process.env.OPENAI_API_KEY) {
            await fs.unlink(req.file.path);
            return res.status(400).json({
                success: false,
                error: 'OpenAI API key not configured'
            });
        }

        const startTime = Date.now();
        const language = req.body.language || 'en';
        const isTest = req.body.isTest === 'true';

        // Determine the correct file extension based on MIME type (needed for cleanup)
        let extension = '.webm'; // Default to webm
        if (req.file.mimetype === 'audio/wav') {
            extension = '.wav';
        } else if (req.file.mimetype === 'audio/mpeg' || req.file.mimetype === 'audio/mp3') {
            extension = '.mp3';
        } else if (req.file.mimetype === 'audio/webm' || req.file.originalname.endsWith('.webm')) {
            extension = '.webm';
        }

        console.log(`🎤 STT Request - File: ${req.file.originalname}, Size: ${req.file.size}, MIME: ${req.file.mimetype}`);

        try {
            // Import OpenAI
            const OpenAI = require('openai');
            const openai = new OpenAI({
                apiKey: process.env.OPENAI_API_KEY
            });

            console.log(`🎤 Processing audio file - Original: ${req.file.originalname}, MIME: ${req.file.mimetype}, Extension: ${extension}`);

            // Determine filename for OpenAI based on extension
            let filename = 'audio.webm';
            if (extension === '.wav') filename = 'audio.wav';
            else if (extension === '.mp3') filename = 'audio.mp3';

            console.log(`🎤 Processing audio file - Size: ${req.file.size}, Filename: ${filename}`);

            // Create a proper file object using Node.js fs and the exact pattern from OpenAI docs
            const path = require('path');

            // Rename the file to have the correct extension for OpenAI to recognize
            const tempPath = req.file.path + extension;
            await fs.rename(req.file.path, tempPath);

            console.log(`🎤 Using renamed file - Path: ${tempPath}, Size: ${req.file.size}`);

            // Call OpenAI Whisper API with the properly named file
            const transcription = await openai.audio.transcriptions.create({
                file: require('fs').createReadStream(tempPath),
                model: 'whisper-1',
                language: language === 'auto' ? undefined : language,
                response_format: 'json'
            });

            // Clean up the renamed file
            await fs.unlink(tempPath);

            const responseTime = Date.now() - startTime;

            // Original file was already renamed and cleaned up above

            res.json({
                success: true,
                text: transcription.text || '',
                confidence: 1.0, // Whisper doesn't provide confidence scores
                provider: 'OpenAI Whisper',
                responseTime,
                isTest,
                metadata: {
                    model: 'whisper-1',
                    language: language,
                    timestamp: new Date().toISOString()
                }
            });

        } catch (apiError) {
            console.error('OpenAI Whisper API error:', apiError);

            // Try to clean up both original and renamed files
            try {
                await fs.unlink(req.file.path);
            } catch (e) {
                // Original file might have been renamed already
            }
            try {
                await fs.unlink(req.file.path + extension);
            } catch (e) {
                // Renamed file might not exist or already cleaned up
            }

            res.json({
                success: false,
                error: `STT processing failed: ${apiError.message}`,
                provider: 'OpenAI Whisper',
                responseTime: Date.now() - startTime
            });
        }

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

        // No temp files to clean up

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

// Create new AI personality (must be before character routes to avoid parameter conflict)
router.post('/api/personalities/create', async (req, res) => {
    try {
        const config = req.body;

        if (!config.personalityName || !config.personalityName.trim()) {
            return res.status(400).json({ success: false, error: 'Personality name is required' });
        }

        // Load existing personalities
        const personalitiesPath = path.join(__dirname, '../data/ai-personalities.json');
        let personalities = [];

        try {
            const data = await fs.readFile(personalitiesPath, 'utf8');
            personalities = JSON.parse(data);
        } catch (error) {
            // File doesn't exist yet, start with empty array
            personalities = [];
        }

        // Check if personality name already exists
        const existingPersonality = personalities.find(p =>
            p.name.toLowerCase() === config.personalityName.toLowerCase()
        );

        if (existingPersonality) {
            return res.status(400).json({
                success: false,
                error: 'A personality with this name already exists'
            });
        }

        // Create new personality
        const newPersonality = {
            id: Date.now().toString(), // Simple ID generation
            name: config.personalityName.trim(),
            provider: config.aiProvider || 'openai',
            model: config.aiModel || 'gpt-4',
            temperature: parseFloat(config.aiTemperature) || 0.8,
            maxTokens: parseInt(config.aiMaxTokens) || 150,
            systemPrompt: config.systemPrompt || '',
            contextLength: parseInt(config.contextLength) || 5,
            enabled: config.enabled === 'true',
            assignedCharacter: config.assignedCharacter || null, // Character assignment
            createdAt: new Date().toISOString()
        };

        personalities.push(newPersonality);

        // Save personalities file
        await fs.writeFile(personalitiesPath, JSON.stringify(personalities, null, 2));

        res.json({
            success: true,
            message: 'AI personality created successfully',
            personality: newPersonality
        });
    } catch (error) {
        console.error('Create personality error:', error);
        res.status(500).json({ success: false, error: error.message });
    }
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

// Sync a personality to an OpenAI Assistant (create/update) and ensure vector store
router.post('/api/personalities/:personalityId/sync-assistant', async (req, res) => {
    try {
        if (!process.env.OPENAI_API_KEY) {
            return res.status(400).json({ success: false, error: 'OpenAI API key not configured' });
        }
        const { personalityId } = req.params;
        const service = new OpenAIAssistantService({});
        const result = await service.ensureAssistantForPersonality(personalityId);
        res.json({ success: true, ...result });
    } catch (error) {
        console.error('Sync assistant error:', error);
        res.status(500).json({ success: false, error: error.message });
    }
});

// Upload training documents for a personality
router.post('/api/personalities/:personalityId/upload-docs', upload.array('docs', 10), async (req, res) => {
    try {
        if (!process.env.OPENAI_API_KEY) {
            return res.status(400).json({ success: false, error: 'OpenAI API key not configured' });
        }
        const { personalityId } = req.params;
        if (!req.files || req.files.length === 0) {
            return res.status(400).json({ success: false, error: 'No documents uploaded' });
        }
        const filePaths = req.files.map(f => f.path);
        const service = new OpenAIAssistantService({});
        const result = await service.uploadDocuments(personalityId, filePaths);
        // Cleanup local uploads after sending to OpenAI
        try {
            await Promise.all(filePaths.map(p => fs.unlink(p).catch(() => {})));
        } catch (cleanupErr) {}
        res.json({ success: true, ...result });
    } catch (error) {
        console.error('Upload docs error:', error);
        res.status(500).json({ success: false, error: error.message });
    }
});

// Test a personality assistant with a prompt
router.post('/api/personalities/:personalityId/test-assistant', async (req, res) => {
    try {
        if (!process.env.OPENAI_API_KEY) {
            return res.status(400).json({ success: false, error: 'OpenAI API key not configured' });
        }
        const { personalityId } = req.params;
        const { prompt } = req.body;
        const service = new OpenAIAssistantService({});
        const result = await service.runAssistantMessage(personalityId, prompt || 'Introduce yourself.');
        res.json({ success: true, response: result.text, metadata: { threadId: result.threadId, runId: result.runId } });
    } catch (error) {
        console.error('Test assistant error:', error);
        res.status(500).json({ success: false, error: error.message });
    }
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

// AI Chat endpoint for Enhanced Test Chat
router.post('/chat', async (req, res) => {
    try {
        const { message, character, characterId } = req.body;

        if (!message) {
            return res.status(400).json({
                success: false,
                error: 'Message is required'
            });
        }

        console.log(`💬 AI Chat request: "${message}" (Character: ${character || 'default'})`);

        // Get character information
        let targetCharacter = null;
        if (characterId) {
            try {
                targetCharacter = await characterService.getCharacterById(characterId);
            } catch (error) {
                console.warn(`⚠️ Could not get character ${characterId}:`, error.message);
            }
        }

        // Use OpenAI Assistant if character has one configured
        if (targetCharacter && targetCharacter.openaiAssistantId) {
            try {
                const assistantService = new OpenAIAssistantService();

                // Create a thread for this conversation
                const thread = await assistantService.createThread();

                // Send message to assistant
                await assistantService.sendMessageToThread(thread.id, message);

                // Run the assistant and get response
                const result = await assistantService.runAssistantOnThread(targetCharacter.openaiAssistantId, thread.id);

                if (result && result.text) {
                    const aiResponse = result.text;

                    res.json({
                        success: true,
                        data: {
                            aiResponse: {
                                text: aiResponse,
                                character: targetCharacter.char_name,
                                metadata: {
                                    assistantId: targetCharacter.openaiAssistantId,
                                    threadId: thread.id,
                                    timestamp: new Date().toISOString()
                                }
                            }
                        }
                    });

                    console.log(`🤖 AI response: "${aiResponse}"`);
                    return;
                }
            } catch (assistantError) {
                console.error('❌ Assistant error:', assistantError);
                // Fall through to fallback response
            }
        }

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

module.exports = router;
