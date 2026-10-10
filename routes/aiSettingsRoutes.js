/**
 * MonsterBox - AI Settings Routes
 * Comprehensive ElevenLabs STT/Agent/TTS management interface
 */

import express from 'express';
import fs from 'fs/promises';
import path from 'path';
import { fileURLToPath } from 'url';
import { resolveCharacter } from '../services/characterContext.js';
import elevenLabsConfigService from '../services/elevenLabsConfigService.js';
import elevenLabsTTSService from '../services/elevenLabsTTSService.js';

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

// Character for a page request. Goes through the resolver so ?characterId=N
// shows that character (the gate's audit:resolver forbids reading
// selectedCharacter directly).
async function getCurrentCharacterInfo(req) {
    try {
        const ctx = await resolveCharacter(req);
        const characterId = ctx ? ctx.id : null;
        const characterName = ctx && ctx.name ? ctx.name : (characterId ? 'Character ' + characterId : 'No Character');
        return { characterId, characterName };
    } catch {
        return { characterId: null, characterName: 'Unknown' };
    }
}

const AGENT_SNAPSHOT_DIR = path.resolve(__dirname, '..', 'config', 'elevenlabs', 'agents');

function isoFromUnixSecs(secs) {
    const n = Number(secs);
    return Number.isFinite(n) && n > 0 ? new Date(n * 1000).toISOString() : null;
}

/**
 * Read-only summary of the character's ElevenLabs agent, taken from the
 * committed snapshot in config/elevenlabs/agents/ (refreshed by whoever PATCHes
 * the agent). The snapshot is matched by agent id, never by file name, so a
 * renamed character or file still finds its agent. ElevenLabs itself is never
 * called from here: the page is a mirror with a deep link, not an editor.
 */
async function loadAgentTurnSummary(characterId) {
    if (!characterId) return { available: false, reason: 'No character selected' };
    const chars = await readJsonIfExists(path.resolve(__dirname, '..', 'data', 'characters.json'));
    const entry = Array.isArray(chars) ? chars.find(c => Number(c.id) === Number(characterId)) : null;
    const agentId = entry && (entry.elevenLabsAgentId || entry.agentId) ? String(entry.elevenLabsAgentId || entry.agentId) : null;
    if (!agentId) return { available: false, reason: 'This character has no ElevenLabs agent assigned' };
    const deepLink = 'https://elevenlabs.io/app/agents/' + encodeURIComponent(agentId);

    let files = [];
    try {
        files = (await fs.readdir(AGENT_SNAPSHOT_DIR)).filter(f => f.endsWith('.json'));
    } catch (error) {
        if (error.code !== 'ENOENT') console.warn('AI settings: cannot list agent snapshots:', error.message);
    }
    for (const file of files) {
        const full = path.join(AGENT_SNAPSHOT_DIR, file);
        let doc;
        try {
            doc = await readJsonIfExists(full);
        } catch (error) {
            console.warn(`AI settings: unreadable agent snapshot ${file}:`, error.message);
            continue;
        }
        const agent = doc && (doc.agent || doc);
        if (!agent || agent.agent_id !== agentId) continue;

        const cc = agent.conversation_config || {};
        const prompt = (cc.agent && cc.agent.prompt) || {};
        const turn = cc.turn || {};
        const soft = turn.soft_timeout_config || {};
        const clientEvents = Array.isArray(cc.conversation && cc.conversation.client_events) ? cc.conversation.client_events : [];
        let snapshotWrittenAt = null;
        try { snapshotWrittenAt = (await fs.stat(full)).mtime.toISOString(); } catch { /* keep null */ }
        return {
            available: true,
            agentId,
            agentName: agent.name || null,
            deepLink,
            snapshotFile: path.relative(path.resolve(__dirname, '..'), full),
            snapshotWrittenAt,
            agentUpdatedAt: isoFromUnixSecs(agent.metadata && agent.metadata.updated_at_unix_secs),
            llm: prompt.llm || null,
            maxTokens: prompt.max_tokens != null ? prompt.max_tokens : null,
            temperature: prompt.temperature != null ? prompt.temperature : null,
            ragEnabled: !!(prompt.rag && prompt.rag.enabled),
            turnModel: turn.turn_model || null,
            turnEagerness: turn.turn_eagerness || null,
            turnTimeout: turn.turn_timeout != null ? turn.turn_timeout : null,
            speculativeTurn: turn.speculative_turn != null ? !!turn.speculative_turn : null,
            softTimeoutSeconds: soft.timeout_seconds != null ? soft.timeout_seconds : null,
            softTimeoutMax: soft.max_soft_timeouts_per_generation != null ? soft.max_soft_timeouts_per_generation : null,
            softTimeoutMessage: soft.message || null,
            clientEvents,
            interruptionEvent: clientEvents.includes('interruption'),
            responseCompleteEvent: clientEvents.includes('agent_response_complete'),
            maxDurationSeconds: cc.conversation && cc.conversation.max_duration_seconds != null ? cc.conversation.max_duration_seconds : null
        };
    }
    return { available: false, agentId, deepLink, reason: 'No snapshot in config/elevenlabs/agents/ carries this agent id' };
}

// AI Settings main page
router.get('/', async (req, res) => {
    try {
        const isConfigured = elevenLabsConfigService.isElevenLabsConfigured();
        const maskedApiKey = elevenLabsConfigService.getMaskedApiKey();
        const { characterId, characterName } = await getCurrentCharacterInfo(req);
        const agentTurn = await loadAgentTurnSummary(characterId).catch((error) => {
            console.warn('AI settings: agent snapshot summary failed:', error.message);
            return { available: false, reason: 'Snapshot could not be read' };
        });

        res.renderWithLayout('ai-settings/index', {
            title: 'AI Settings - ElevenLabs Integration',
            page: 'ai-settings',
            isConfigured,
            maskedApiKey,
            characterId,
            characterName,
            agentTurn,
            activeTab: req.query.tab || 'overview',
            styles: '/css/ai-settings.css',
            scripts: ['/js/ai-settings.js', '/js/ai-settings-conversation.js']
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
        const { characterId, characterName } = await getCurrentCharacterInfo(req);
        res.renderWithLayout('ai-settings/stt', {
            title: 'Speech-to-Text Settings',
            page: 'ai-settings-stt',
            activeTab: 'stt',
            characterId,
            characterName,
            styles: '/css/ai-settings.css',
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
        const { characterId, characterName } = await getCurrentCharacterInfo(req);
        res.renderWithLayout('ai-settings/tts', {
            title: 'Text-to-Speech Settings - Voice Assignment',
            page: 'ai-settings-tts',
            activeTab: 'tts',
            characterId,
            characterName,
            styles: '/css/ai-settings.css',
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
        const ctx = await resolveCharacter(req);
        const characterId = ctx ? ctx.id : null;
        const dataPath = characterId
            ? path.resolve(appRoot, 'data', `character-${characterId}`)
            : path.resolve(appRoot, 'data');
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

        // Actually exercise the credential. GET /v1/voices is a free read, so this
        // costs no characters while proving the key is accepted by ElevenLabs.
        const result = await elevenLabsTTSService.getVoices();
        if (!result || !result.success) {
            return res.status(502).json({
                success: false,
                error: (result && result.error) || 'ElevenLabs API connection failed'
            });
        }

        res.json({
            success: true,
            message: `ElevenLabs API connection successful (${result.voices.length} voices available)`,
            voiceCount: result.voices.length
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
