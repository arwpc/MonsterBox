/**
 * MonsterBox - ElevenLabs WebSocket Conversation Service
 * Real-time streaming conversation with immediate responses
 * 
 * Upgraded: Uses Scribe v2 Realtime for live STT instead of batch transcription
 */

import { spawn } from 'child_process';
import { EventEmitter } from 'events';
import fs from 'fs/promises';
import fetch from 'node-fetch';
import path from 'path';
import { fileURLToPath } from 'url';
import WebSocket, { WebSocketServer } from 'ws';
import { getSTTConfig } from './aiConfigStore.js';
import { readConfig } from './configService.js';
import elevenLabsConfigService from './elevenLabsConfigService.js';
import elevenLabsSTTService from './elevenLabsSTTService.js';
import realtimeSTTService from './elevenLabsRealtimeSTTService.js';
import randomPoseService from './randomPoseService.js';
import serverPlaybackService from './serverPlaybackService.js';
import serverSTTListener from './serverSTTListener.js';
import * as jawAnimationService from './jawAnimationSuperPowerService.js';

// Minimal WAV encoder for PCM16LE mono (16kHz)
function encodeWavPCM16LE(rawPcm, sampleRate = 16000, channels = 1) {
    try {
        const dataLen = rawPcm.length;
        const blockAlign = channels * 2;
        const byteRate = sampleRate * blockAlign;
        const header = Buffer.alloc(44);
        header.write('RIFF', 0);
        header.writeUInt32LE(36 + dataLen, 4);
        header.write('WAVE', 8);
        header.write('fmt ', 12);
        header.writeUInt32LE(16, 16);
        header.writeUInt16LE(1, 20);
        header.writeUInt16LE(channels, 22);
        header.writeUInt32LE(sampleRate, 24);
        header.writeUInt32LE(byteRate, 28);
        header.writeUInt16LE(blockAlign, 32);
        header.writeUInt16LE(16, 34);
        header.write('data', 36);
        header.writeUInt32LE(dataLen, 40);
        return Buffer.concat([header, rawPcm]);
    } catch (_) {
        return Buffer.alloc(0);
    }
}


// Simple heuristics to reduce false STT when expecting English only
function _isBracketedSfx(text) {
    try { return /^\s*\([^)]{1,120}\)\s*$/.test(text); } catch (_) { return false; }
}
function _isLikelyEnglish(text, config) {
    try {
        if (!text) return false;

        // Get configuration values or use defaults
        const minLetterRatio = (config && config.minLetterRatio) ? (config.minLetterRatio / 100) : 0.55;
        const requireVowels = (config && config.requireVowels !== false); // default true

        // Drop if any non-ASCII present (catches many other scripts and emojis)
        if (/[^\x00-\x7F]/.test(text)) return false;
        // Keep if mostly letters/digits/basic punctuation
        var compact = String(text).replace(/\s+/g, '');
        if (!compact) return false;
        var letters = (compact.match(/[A-Za-z]/g) || []).length;
        var total = compact.length;
        if (!letters) return false;
        var ratio = letters / total;
        if (ratio < minLetterRatio) return false;
        // Require at least one vowel to avoid SFX-like tokens (if enabled)
        if (requireVowels && !/[AEIOUaeiou]/.test(text)) return false;
        return true;
    } catch (_) { return false; }
}

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

async function resolvePartsPath() {
    try {
        const cfg = await readConfig();
        const appRoot = path.resolve(__dirname, '..');
        if (cfg && cfg.dataPath) {
            return path.resolve(appRoot, cfg.dataPath, 'parts.json');
        }
        return path.resolve(appRoot, 'data', 'parts.json');
    } catch (e) {
        const appRoot = path.resolve(__dirname, '..');
        return path.resolve(appRoot, 'data', 'parts.json');
    }
}

async function resolveCharactersPath() {
    try {
        const cfg = await readConfig();
        const appRoot = path.resolve(__dirname, '..');
        if (cfg && cfg.dataPath) {
            return path.resolve(appRoot, cfg.dataPath, 'characters.json');
        }
        return path.resolve(appRoot, 'data', 'characters.json');
    } catch (e) {
        const appRoot = path.resolve(__dirname, '..');
        return path.resolve(appRoot, 'data', 'characters.json');
    }
}

async function getAgentIdForCharacter(characterId) {
    try {
        const file = await resolveCharactersPath();
        const content = await fs.readFile(file, 'utf8');
        const list = JSON.parse(content);
        if (Array.isArray(list)) {
            const c = list.find(ch => Number(ch.id) === Number(characterId));
            if (c && c.elevenLabsAgentId) return String(c.elevenLabsAgentId);
        }
    } catch (_) { /* noop */ }
    return null;
}


async function getMicrophoneDeviceForCharacter(characterId) {
    try {
        const partsFile = await resolvePartsPath();
        const content = await fs.readFile(partsFile, 'utf8');
        const parts = JSON.parse(content);
        if (Array.isArray(parts)) {
            const mic = parts.find(p => String(p.type).toLowerCase() === 'microphone' && Number(p.characterId) === Number(characterId));
            if (mic) {
                const cfg = mic.config || {};
                return cfg.deviceId || cfg.inputDevice || cfg.audioDeviceId || mic.inputDevice || 'default';
            }
        }
    } catch (e) {
        console.warn('⚠️ Could not resolve microphone for character:', e.message);
    }
    return 'default';
}


class ElevenLabsWebSocketService extends EventEmitter {
    constructor() {
        super();
        this.config = elevenLabsConfigService.getElevenLabsConfig();
        this.activeConnections = new Map(); // sessionId -> connection info
        this.wsServer = null;
        this.port = 8795; // Dedicated port for AI chat WebSocket

        // Hardening: Session management
        this.sessionTimeoutMs = 3600000; // 1 hour max session duration
        this.cleanupIntervalMs = 60000; // cleanup every minute
        this._cleanupTimer = null;

        console.log('🎤 ElevenLabsWebSocketService initialized with hardening');
    }

    /**
     * Cleanup old/stale sessions
     */
    _cleanupOldSessions() {
        const now = Date.now();
        const toDelete = [];

        for (const [sessionId, connection] of this.activeConnections.entries()) {
            const age = now - connection.startTime.getTime();

            // Remove sessions older than timeout OR inactive for 5 minutes
            const inactive = !connection.isActive && age > 300000;
            const expired = age > this.sessionTimeoutMs;

            if (expired || inactive) {
                console.log(`🧹 Cleaning up session ${sessionId} (age=${Math.round(age / 1000)}s, active=${connection.isActive})`);

                // Close WebSocket connections
                try {
                    if (connection.clientWs && connection.clientWs.readyState === WebSocket.OPEN) {
                        connection.clientWs.close();
                    }
                } catch (e) {
                    console.warn(`⚠️ Error closing client WS for ${sessionId}:`, e.message);
                }

                try {
                    if (connection.elevenLabsWs && connection.elevenLabsWs.readyState === WebSocket.OPEN) {
                        connection.elevenLabsWs.close();
                    }
                } catch (e) {
                    console.warn(`⚠️ Error closing ElevenLabs WS for ${sessionId}:`, e.message);
                }

                // Stop server mic loop
                if (connection.serverMicActive) {
                    connection.serverMicActive = false;
                }

                toDelete.push(sessionId);
            }
        }

        toDelete.forEach(id => this.activeConnections.delete(id));

        if (toDelete.length > 0) {
            console.log(`🧹 Cleaned up ${toDelete.length} old WebSocket sessions`);
        }
    }

    /**
     * Start WebSocket server for real-time chat
     * @param {object} [httpsServer] - Optional HTTPS server to attach WSS to at /ai-chat
     */
    async startWebSocketServer(httpsServer) {
        return new Promise((resolve, reject) => {
            try {
                // Primary WS server on dedicated port (HTTP clients)
                this.wsServer = new WebSocketServer({
                    port: this.port,
                    host: '0.0.0.0', // Explicitly bind to IPv4
                    perMessageDeflate: false,
                    verifyClient: (info) => {
                        console.log(`🔍 WebSocket connection attempt from: ${info.origin || 'unknown'} (${info.req.connection.remoteAddress})`);
                        return true; // Accept all connections for now
                    }
                });

                this.wsServer.on('connection', (ws, req) => {
                    this.handleClientConnection(ws, req);
                });

                this.wsServer.on('listening', () => {
                    console.log(`🌐 ElevenLabs Chat WebSocket server listening on port ${this.port}`);

                    // Attach secondary WSS to HTTPS server at /ai-chat (HTTPS clients)
                    if (httpsServer) {
                        try {
                            this.wssServer = new WebSocketServer({
                                server: httpsServer,
                                path: '/ai-chat',
                                perMessageDeflate: false
                            });
                            this.wssServer.on('connection', (ws, req) => {
                                this.handleClientConnection(ws, req);
                            });
                            console.log(`🔒 Secure WebSocket (WSS) attached to HTTPS server at /ai-chat`);
                        } catch (e) {
                            console.warn(`⚠️  Failed to attach WSS to HTTPS server:`, e.message);
                        }
                    }

                    // Start periodic cleanup
                    this._cleanupTimer = setInterval(() => {
                        this._cleanupOldSessions();
                    }, this.cleanupIntervalMs);
                    console.log(`🧹 Session cleanup timer started (every ${this.cleanupIntervalMs / 1000}s)`);

                    resolve();
                });

                this.wsServer.on('error', (error) => {
                    console.error('❌ Chat WebSocket server error:', error.message);
                    reject(error);
                });

            } catch (error) {
                reject(error);
            }
        });
    }

    /**
     * Handle new client connection
     */
    handleClientConnection(ws, req) {
        const sessionId = this.generateSessionId();
        console.log(`🔌 New chat client connected: ${sessionId}`);

        const connection = {
            sessionId,
            clientWs: ws,
            elevenLabsWs: null,
            agentId: null,
            isActive: false,
            startTime: new Date(),
            // New runtime fields for output/mic routing
            characterId: null,
            outputMode: 'server',    // 'server' | 'local'
            micSource: 'server',     // 'server' | 'browser'
            transcriptionOnly: false, // true = STT only, false = full conversation
            serverMicTimer: null,
            serverMicActive: false,
            sttLastAt: 0,
            sttPcm: Buffer.alloc(0), // rolling PCM buffer for partial STT
            _dbgLastTs: 0,           // throttle for client debug breadcrumbs
            sttLanguage: null,       // per-connection STT language override
            suppressMicUntilMs: 0,   // suppress server mic during server playback
            // Duration-based echo suppression (tracks actual audio playback time)
            aiSpeaking: false,          // true while AI is generating audio
            speechStartedAt: 0,         // Date.now() when first audio chunk of current utterance arrives
            accumulatedAudioMs: 0,      // total audio duration accumulated from PCM chunk sizes
            audioBuffer: [],         // base64 MP3 frames from ElevenLabs
            audioPlaying: false,     // audio playback loop active flag
            // Scribe v2 Realtime STT session (replaces batch STT polling)
            realtimeSTTSession: null,
            useRealtimeSTT: true,    // prefer Scribe v2 Realtime over batch STT
            // Hardening: Error tracking
            consecutiveErrors: 0,
            maxConsecutiveErrors: 10,
            lastError: null,
            transcriptCount: 0,
            audioChunkCount: 0
        };

        this.activeConnections.set(sessionId, connection);

        ws.on('message', (data) => {
            this.handleClientMessage(sessionId, data);
        });

        ws.on('close', () => {
            this.handleClientDisconnect(sessionId);
        });

        ws.on('error', (error) => {
            console.error(`❌ Client WebSocket error for ${sessionId}:`, error.message);
            this.handleClientDisconnect(sessionId);
        });

        // Send welcome message
        this.sendToClient(sessionId, {
            type: 'connected',
            sessionId: sessionId,
            message: 'Connected to MonsterBox AI Chat'
        });
    }

    /**
     * Handle message from client
     */
    async handleClientMessage(sessionId, data) {
        try {
            const message = JSON.parse(data.toString());
            const connection = this.activeConnections.get(sessionId);

            if (!connection) {
                console.error(`❌ Connection not found: ${sessionId}`);
                return;
            }

            switch (message.type) {
                case 'start_conversation':
                    // Initialize pending message queue
                    connection.pendingMessages = [];
                    connection.conversationReady = false;
                    await this.startConversation(sessionId, message.agentId);
                    // Start Scribe v2 Realtime STT for live transcription
                    // (mic loop is deferred until conversation_initiation_metadata is received)
                    if (connection.useRealtimeSTT) {
                        this._startRealtimeSTTSession(sessionId).catch(e => console.error('RT-STT start error:', e.message));
                    }
                    break;

                case 'start_transcription_only':
                    // Start transcription-only mode (no agent, just STT)
                    console.log(`🎤 Starting transcription-only mode for session ${sessionId}`);
                    connection.isActive = true;
                    connection.transcriptionOnly = true;
                    // Start Scribe v2 Realtime STT for live transcription
                    if (connection.useRealtimeSTT) {
                        this._startRealtimeSTTSession(sessionId).catch(e => console.error('RT-STT start error:', e.message));
                    }
                    this.sendToClient(sessionId, {
                        type: 'transcription_started',
                        message: 'Transcription-only mode active - speak into the microphone'
                    });
                    // Start server mic loop for transcription
                    if (connection.micSource === 'server') {
                        this._startServerMicLoop(sessionId).catch(function () { /* noop */ });
                    }
                    break;

                case 'stop_transcription':
                    // Stop transcription-only mode
                    console.log(`🛑 Stopping transcription for session ${sessionId}`);
                    connection.isActive = false;
                    connection.transcriptionOnly = false;
                    this._stopRealtimeSTTSession(sessionId);
                    this._stopServerMicLoop(sessionId, false);
                    this.sendToClient(sessionId, {
                        type: 'transcription_stopped',
                        message: 'Transcription stopped'
                    });
                    break;

                case 'send_message':
                    await this.sendMessageToAgent(sessionId, message.text);
                    break;

                case 'set_character':
                    connection.characterId = (typeof message.characterId !== 'undefined' ? message.characterId : null);
                    // Send breadcrumb so client can display active character id
                    this.sendToClient(sessionId, { type: 'debug', originalType: 'set_character', data: { characterId: connection.characterId } });
                    break;

                case 'set_output_mode':
                    connection.outputMode = (message && message.mode === 'local') ? 'local' : 'server';
                    break;

                case 'set_mic_source':
                    connection.micSource = (message && message.source === 'browser') ? 'browser' : 'server';
                    // Breadcrumb for UI
                    this.sendToClient(sessionId, { type: 'debug', originalType: 'set_mic_source', data: { source: connection.micSource } });
                    if (connection.isActive) {
                        if (connection.micSource === 'server') this._startServerMicLoop(sessionId);
                        else this._stopServerMicLoop(sessionId, true);
                    }
                    break;

                case 'set_audio_playback':
                    // Toggle whether AI audio is played through character speaker
                    connection.audioPlaybackEnabled = !!(message && message.enabled);
                    this.sendToClient(sessionId, { type: 'debug', originalType: 'set_audio_playback', data: { enabled: connection.audioPlaybackEnabled } });
                    break;

                case 'set_speaker_part':
                    // Override which speaker part to route audio through
                    connection.speakerPartId = message.speakerPartId || null;
                    console.log(`🔊 Speaker part set to ${connection.speakerPartId} for session ${sessionId}`);
                    // Stop existing stream so next chunk creates one with the new device
                    if (connection.characterId != null) {
                        try { serverPlaybackService.stopStream({ characterId: connection.characterId }); } catch (_) { }
                    }
                    break;

                case 'set_stt_language':
                    try {
                        const lang = (message && message.language) ? String(message.language).toLowerCase() : '';
                        connection.sttLanguage = lang ? (lang.length > 2 ? lang.slice(0, 2) : lang) : null;
                        this.sendToClient(sessionId, { type: 'debug', originalType: 'set_stt_language', data: { language: connection.sttLanguage } });
                    } catch (_) { /* noop */ }
                    break;

                case 'set_parrot_mode':
                    connection.parrotMode = !!(message && message.enabled);
                    console.log(`🦜 Parrot mode ${connection.parrotMode ? 'ON' : 'OFF'} for session ${sessionId}`);
                    this.sendToClient(sessionId, { type: 'debug', originalType: 'set_parrot_mode', data: { enabled: connection.parrotMode } });
                    break;

                case 'browser_audio_chunk':
                    // Forward browser-sent PCM16k (base64) to ElevenLabs ConvAI + Scribe STT
                    try {
                        const audio64 = (message && message.audio) ? String(message.audio) : '';
                        if (!audio64) break;

                        // Echo suppression: skip forwarding while AI audio is playing through speakers
                        const browserNow = Date.now();
                        const browserSuppressed = connection && connection.suppressMicUntilMs && (browserNow < connection.suppressMicUntilMs);

                        // Forward to ElevenLabs ConvAI agent (skip during parrot mode or echo suppression)
                        if (connection && !browserSuppressed && !connection.parrotMode && connection.elevenLabsWs && connection.elevenLabsWs.readyState === WebSocket.OPEN) {
                            connection.elevenLabsWs.send(JSON.stringify({ user_audio_chunk: audio64 }));
                        }

                        // Also forward to Scribe v2 Realtime STT for live transcription (skip during echo suppression)
                        if (!browserSuppressed && connection && connection.realtimeSTTSession && connection.realtimeSTTSession.isConnected) {
                            const rawPcm = Buffer.from(audio64, 'base64');
                            connection.realtimeSTTSession.sendPCMBuffer(rawPcm);
                        }
                    } catch (_) { /* noop */ }
                    break;

                case 'eos':
                    // Client signals end-of-speech explicitly
                    this._sendEmptyAudioChunkToAgent(sessionId);
                    break;

                case 'end_conversation':
                    await this.endConversation(sessionId);
                    this._stopRealtimeSTTSession(sessionId);
                    this._stopServerMicLoop(sessionId, true);
                    break;

                default:
                    console.warn(`❓ Unknown message type: ${message.type}`);
            }

        } catch (error) {
            console.error(`❌ Error handling client message for ${sessionId}:`, error.message);
            this.sendToClient(sessionId, {
                type: 'error',
                message: 'Failed to process message'
            });
        }
    }

    /**
     * Start conversation with ElevenLabs agent using real-time WebSocket API
     */
    async startConversation(sessionId, agentId) {
        const connection = this.activeConnections.get(sessionId);
        if (!connection) return;

        try {
            // If no agentId provided, try to resolve from character mapping (characters.json)
            if ((!agentId || agentId === 'null' || agentId === 'undefined') && connection.characterId != null) {
                try {
                    const resolved = await getAgentIdForCharacter(connection.characterId);
                    if (resolved) {
                        agentId = resolved;
                        console.log(`🧠 Resolved agentId ${agentId} for character ${connection.characterId}`);
                    }
                } catch (_) { /* noop */ }
            }
            console.log(`🚀 Starting real-time conversation with agent: ${agentId}`);

            // Close any existing ElevenLabs connection
            if (connection.elevenLabsWs && connection.elevenLabsWs.readyState === WebSocket.OPEN) {
                connection.elevenLabsWs.close();
                connection.elevenLabsWs = null;
            }

            // Get signed URL for ElevenLabs real-time WebSocket
            const signedUrlResponse = await fetch(
                `${this.config.baseUrl}/convai/conversation/get-signed-url?agent_id=${agentId}`,
                {
                    method: 'GET',
                    headers: {
                        'xi-api-key': this.config.apiKey,
                        'Content-Type': 'application/json'
                    }
                }
            );

            if (!signedUrlResponse.ok) {
                throw new Error(`Failed to get signed URL: HTTP ${signedUrlResponse.status}`);
            }

            const { signed_url } = await signedUrlResponse.json();
            console.log(`🔗 Got signed URL for agent ${agentId}`);

            // Connect to ElevenLabs real-time WebSocket
            const elevenLabsWs = new WebSocket(signed_url);

            elevenLabsWs.on('open', () => {
                console.log(`⚡ Connected to ElevenLabs real-time agent: ${agentId}`);
                connection.elevenLabsWs = elevenLabsWs;
                connection.agentId = agentId;
                // Mark as active but NOT ready for messages until conversation_initiation_metadata received
                connection.isActive = true;
                connection.conversationReady = false;
                connection.pendingMessages = connection.pendingMessages || [];

                // Send minimal conversation initiation — let the agent's own config handle everything
                elevenLabsWs.send(JSON.stringify({
                    type: 'conversation_initiation_client_data',
                    conversation_config_override: {}
                }));
            });

            elevenLabsWs.on('message', (data) => {
                this.handleElevenLabsMessage(sessionId, data);
            });

            elevenLabsWs.on('close', (code, reason) => {
                console.log(`🔌 ElevenLabs real-time connection closed for ${sessionId} (code=${code}, reason=${reason || 'none'})`);
                connection.elevenLabsWs = null;
                connection.isActive = false;
                connection.conversationReady = false;
                // Stop persistent audio stream so mpg123 flushes remaining data and exits cleanly
                if (connection.characterId != null) {
                    try { serverPlaybackService.stopStream({ characterId: connection.characterId }); } catch (_) { /* noop */ }
                }
                this.sendToClient(sessionId, {
                    type: 'conversation_ended',
                    message: 'Real-time conversation ended'
                });
            });

            elevenLabsWs.on('error', (error) => {
                console.error(`❌ ElevenLabs real-time WebSocket error for ${sessionId}:`, error.message);
                this.sendToClient(sessionId, {
                    type: 'error',
                    message: 'Real-time agent connection failed'
                });
            });

        } catch (error) {
            console.error(`❌ Failed to start real-time conversation for ${sessionId}:`, error.message);
            this.sendToClient(sessionId, {
                type: 'error',
                message: 'Failed to connect to real-time agent: ' + error.message
            });
        }
    }

    /**
     * Send message to ElevenLabs agent via real-time WebSocket
     */
    async sendMessageToAgent(sessionId, text) {
        const connection = this.activeConnections.get(sessionId);
        if (!connection) {
            this.sendToClient(sessionId, {
                type: 'error',
                message: 'No active session'
            });
            return;
        }

        // If conversation is being established but not yet ready, queue the message
        if (connection.isActive && !connection.conversationReady) {
            console.log(`⏳ Queuing message (conversation starting): "${text}"`);
            if (!connection.pendingMessages) connection.pendingMessages = [];
            connection.pendingMessages.push(text);
            return;
        }

        if (!connection.elevenLabsWs || !connection.isActive || !connection.conversationReady) {
            this.sendToClient(sessionId, {
                type: 'error',
                message: 'No active real-time conversation'
            });
            return;
        }

        try {
            console.log(`📤 Sending text to real-time agent: "${text}"`);

            // Send text message to ElevenLabs real-time WebSocket
            const message = {
                type: 'user_message',
                text: text
            };

            connection.elevenLabsWs.send(JSON.stringify(message));
            console.log(`✅ Text message sent to real-time agent for ${sessionId}`);

        } catch (error) {
            console.error(`❌ Failed to send message to real-time agent for ${sessionId}:`, error.message);
            this.sendToClient(sessionId, {
                type: 'error',
                message: 'Failed to send message to real-time agent: ' + error.message
            });
        }
    }

    /**
     * Handle message from ElevenLabs real-time WebSocket
     */
    handleElevenLabsMessage(sessionId, data) {
        try {
            const message = JSON.parse(data.toString());
            const connection = this.activeConnections.get(sessionId);

            if (!connection) return;



            switch (message.type) {
                case 'conversation_initiation_metadata':
                    console.log(`🎯 Conversation initiated for ${sessionId}`);
                    connection.conversationReady = true;
                    // Detect output audio format from agent config (default: pcm_16000)
                    try {
                        const meta = message.conversation_initiation_metadata_event || {};
                        const fmt = meta.agent_output_audio_format || '';
                        connection.audioOutputFormat = fmt || 'pcm_16000';
                        console.log(`🔊 Agent output audio format: "${fmt}" (using: "${connection.audioOutputFormat}")`);
                        // Log the full metadata keys for debugging
                        console.log(`🔊 ConvAI metadata keys:`, JSON.stringify(Object.keys(meta)));
                    } catch (_) {
                        connection.audioOutputFormat = 'pcm_16000';
                    }

                    // NOW notify the client that conversation is ready
                    this.sendToClient(sessionId, {
                        type: 'conversation_started',
                        agentId: connection.agentId,
                        message: 'Connected to real-time agent - ready for instant chat!'
                    });

                    // Start server mic loop only after conversation is fully initialized
                    if (connection.micSource === 'server') {
                        try { this._startServerMicLoop(sessionId); } catch (_) { }
                    }

                    // Flush any pending text messages that arrived before conversation was ready
                    if (connection.pendingMessages && connection.pendingMessages.length > 0) {
                        const pending = connection.pendingMessages.splice(0);
                        for (const pendingText of pending) {
                            console.log(`📤 Flushing pending message: "${pendingText}"`);
                            this.sendMessageToAgent(sessionId, pendingText);
                        }
                    }
                    break;

                case 'audio':
                    // Real-time audio chunk from ElevenLabs agent
                    if (message.audio_event) {
                        const audioData = message.audio_event.audio_base_64;
                        // Extract text only if actually present in this chunk
                        const responseText = message.audio_event?.agent_response ||
                            message.audio_event?.text ||
                            null;

                        const c = this.activeConnections.get(sessionId);

                        // Track accumulated audio duration for accurate echo suppression
                        if (c && audioData) {
                            const audioBuffer = Buffer.from(audioData, 'base64');
                            const fmt = c.audioOutputFormat || 'pcm_16000';

                            if (!c.aiSpeaking) {
                                // First chunk of a new utterance
                                c.aiSpeaking = true;
                                c.speechStartedAt = Date.now();
                                c.accumulatedAudioMs = 0;
                            }

                            // Calculate chunk duration: PCM16LE mono = 2 bytes/sample
                            if (fmt.startsWith('pcm_')) {
                                const sampleRate = parseInt(fmt.split('_')[1]) || 16000;
                                c.accumulatedAudioMs += (audioBuffer.length / (sampleRate * 2)) * 1000;
                            } else {
                                // MP3: estimate ~128kbps → duration_ms ≈ bytes * 8 / 128
                                c.accumulatedAudioMs += (audioBuffer.length * 8 / 128);
                            }

                            // Suppress mic for the full estimated playback duration + tail buffer
                            const TAIL_BUFFER_MS = 2500; // extra room reverb tolerance
                            c.suppressMicUntilMs = c.speechStartedAt + c.accumulatedAudioMs + TAIL_BUFFER_MS;
                        }

                        // Play AI audio through server speakers if enabled
                        try {
                            if (c && audioData && c.audioPlaybackEnabled !== false) {
                                const audioBuffer = Buffer.from(audioData, 'base64');
                                const fmt = c.audioOutputFormat || 'pcm_16000';
                                // Log first chunk for format debugging
                                if (!c._audioChunkCount) {
                                    c._audioChunkCount = 0;
                                    console.log(`🔊 First audio chunk: ${audioBuffer.length} bytes, format="${fmt}", charId=${c.characterId}, playbackEnabled=${c.audioPlaybackEnabled}`);
                                    // Check MP3 magic bytes (0xFF 0xFB/0xF3/0xF2 or ID3)
                                    const hdr = audioBuffer.slice(0, 4);
                                    const isMP3 = (hdr[0] === 0xFF && (hdr[1] & 0xE0) === 0xE0) || (hdr[0] === 0x49 && hdr[1] === 0x44 && hdr[2] === 0x33);
                                    console.log(`🔊 Audio header bytes: [${hdr[0]?.toString(16)}, ${hdr[1]?.toString(16)}, ${hdr[2]?.toString(16)}, ${hdr[3]?.toString(16)}] isMP3=${isMP3}`);
                                }
                                c._audioChunkCount++;

                                // Use persistent streaming for continuous real-time playback.
                                // ElevenLabs ConvAI defaults to PCM16LE; use writePcmStream
                                // for raw PCM or writeMp3Stream if agent outputs MP3.
                                if (fmt.startsWith('pcm_')) {
                                    const sampleRate = parseInt(fmt.split('_')[1]) || 16000;
                                    serverPlaybackService.writePcmStream(audioBuffer, {
                                        characterId: c.characterId,
                                        speakerPartId: c.speakerPartId,
                                        volume: 90,
                                        sampleRate,
                                        kind: 'ai'
                                    }).catch(err => {
                                        console.error(`❌ AI audio playback ERROR:`, err);
                                    });

                                    // Drive jaw from PCM audio amplitude (if jaw enabled)
                                    try {
                                        const samples = new Int16Array(audioBuffer.buffer, audioBuffer.byteOffset, Math.floor(audioBuffer.length / 2));
                                        let sumSq = 0;
                                        for (let i = 0; i < samples.length; i++) sumSq += samples[i] * samples[i];
                                        const rms = Math.sqrt(sumSq / (samples.length || 1)) / 32768;
                                        if (rms > 0.01) {
                                            jawAnimationService.driveJawFromAmplitude(c.characterId, Math.min(1, rms * 3)).catch(() => {});
                                        }
                                    } catch (_) { /* non-fatal */ }
                                } else {
                                    serverPlaybackService.writeMp3Stream(audioBuffer, {
                                        characterId: c.characterId,
                                        speakerPartId: c.speakerPartId,
                                        volume: 90,
                                        kind: 'ai'
                                    }).catch(err => {
                                        console.error(`❌ AI audio playback ERROR:`, err);
                                    });
                                }
                            }
                        } catch (e) { 
                            console.error('❌ CRITICAL: Error playing AI audio:', e); 
                        }

                        // Send audio chunk to client (type 'audio_chunk' — NOT agent_response)
                        // Only include text if this chunk actually contains a response
                        const chunkMsg = {
                            type: 'audio_chunk',
                            audio: audioData,
                            timestamp: Date.now(),
                            realTime: true
                        };
                        if (responseText) {
                            chunkMsg.text = responseText;
                        }
                        this.sendToClient(sessionId, chunkMsg);

                        // Trigger a safe random pose during speech if enabled
                        try {
                            if (c && c.characterId != null) {
                                randomPoseService.triggerDuringTTS(c.characterId, (responseText || '').length);
                            }
                        } catch (_) { /* noop */ }
                    }
                    break;

                case 'user_transcript':
                    // Forward user transcript from ElevenLabs to client (for Parrot Mode)
                    try {
                        const userText = (message.user_transcription_event && message.user_transcription_event.user_transcript)
                            || message.text || '';
                        if (userText) {
                            // Hardening: Track successful transcription
                            connection.transcriptCount += 1;
                            connection.consecutiveErrors = 0; // Reset error counter on success
                            console.log(`✅ Session ${sessionId}: Transcribed "${userText}" (count=${connection.transcriptCount})`);

                            // Send user transcript event to client (single event, no duplicates)
                            this.sendToClient(sessionId, {
                                type: 'user_transcript',
                                user_transcription_event: message.user_transcription_event || { user_transcript: userText },
                                timestamp: Date.now()
                            });
                        }
                    } catch (err) {
                        console.error(`❌ Session ${sessionId}: Error handling user_transcript:`, err.message);
                        connection.consecutiveErrors += 1;
                        connection.lastError = err.message;
                    }
                    break;

                case 'agent_response':
                    // Text-only agent response
                    const responseText = message.agent_response_event?.agent_response ||
                        message.agent_response ||
                        message.text ||
                        message.message ||
                        '';



                    if (responseText) {
                        this.sendToClient(sessionId, {
                            type: 'agent_response',
                            text: responseText,
                            timestamp: Date.now(),
                            realTime: true
                        });
                    }
                    break;

                case 'ping':
                    // Handle ping/pong for connection keepalive (silent)
                    if (message.ping_event && connection.elevenLabsWs) {
                        const pongMessage = {
                            type: 'pong',
                            event_id: message.ping_event.event_id
                        };
                        connection.elevenLabsWs.send(JSON.stringify(pongMessage));
                    }
                    break;

                case 'conversation_end':
                    console.log(`🔚 Conversation ended by ElevenLabs for ${sessionId}`);
                    if (connection) {
                        connection.aiSpeaking = false;
                        connection.speechStartedAt = 0;
                        connection.accumulatedAudioMs = 0;
                    }
                    this.sendToClient(sessionId, {
                        type: 'conversation_ended',
                        message: 'Conversation ended by agent'
                    });
                    break;

                case 'interruption':
                    // Stop any active server playback immediately (barge-in)
                    try {
                        if (connection && connection.characterId != null) {
                            serverPlaybackService.stopForCharacter(connection.characterId);
                        } else {
                            serverPlaybackService.stopAll();
                        }
                    } catch (_) { /* best-effort */ }
                    // Reset echo suppression tracking
                    if (connection) {
                        connection.aiSpeaking = false;
                        connection.speechStartedAt = 0;
                        connection.accumulatedAudioMs = 0;
                        connection.suppressMicUntilMs = Date.now() + 500; // short tail for reverb
                    }
                    this.sendToClient(sessionId, {
                        type: 'interruption',
                        reason: message.interruption_event?.reason || 'Unknown'
                    });
                    break;

                default:
                    // Ignore unknown message types to keep console clean
                    break;
            }

        } catch (error) {
            console.error(`❌ Error handling ElevenLabs real-time message for ${sessionId}:`, error.message);
            console.error('Raw message:', data.toString());
        }
    }

    /**
     * End conversation and close ElevenLabs WebSocket
     */
    async endConversation(sessionId) {
        const connection = this.activeConnections.get(sessionId);
        if (!connection) return;

        // Stop persistent audio stream for this character
        if (connection.characterId != null) {
            try { await serverPlaybackService.stopStream({ characterId: connection.characterId }); } catch (_) { /* best-effort */ }
        }

        // Close ElevenLabs WebSocket if active
        if (connection.elevenLabsWs && connection.elevenLabsWs.readyState === WebSocket.OPEN) {
            try {
                console.log(`🔌 Closing ElevenLabs real-time connection for ${sessionId}`);
                connection.elevenLabsWs.close();
            } catch (error) {
                console.warn(`⚠️ Error closing ElevenLabs connection: ${error.message}`);
            }
            connection.elevenLabsWs = null;
        }

        connection.isActive = false;
        connection.agentId = null;

        this.sendToClient(sessionId, {
            type: 'conversation_ended',
            message: 'Real-time conversation ended'
        });
    }

    /**
     * Start a Scribe v2 Realtime STT session for a connection.
     * Streams partial/committed transcripts to the browser client.
     */
    async _startRealtimeSTTSession(sessionId) {
        const connection = this.activeConnections.get(sessionId);
        if (!connection) return;

        // Destroy any existing session
        if (connection.realtimeSTTSession) {
            try { connection.realtimeSTTSession.disconnect('restart'); } catch (_) { /* noop */ }
            connection.realtimeSTTSession = null;
        }

        try {
            const sttCfg = await getSTTConfig();
            const lang = (connection.sttLanguage && connection.sttLanguage !== 'auto')
                ? connection.sttLanguage
                : (sttCfg.language && sttCfg.language !== 'auto' ? sttCfg.language : null);

            const session = await realtimeSTTService.createSession({
                sessionId: `rt_${sessionId}`,
                languageCode: lang || undefined,
                commitStrategy: 'vad',
                vadSilenceThresholdSecs: 1.5,
                vadThreshold: 0.4,
                includeTimestamps: true,
                includeLanguageDetection: true,
                previousText: null
            });

            connection.realtimeSTTSession = session;

            // Wire Scribe events → client WebSocket
            session.on('partial_transcript', (data) => {
                if (!data.text) return;
                this.sendToClient(sessionId, {
                    type: 'stt_partial',
                    text: data.text,
                    timestamp: data.timestamp,
                    source: 'scribe_v2_realtime'
                });
            });

            session.on('committed_transcript', (data) => {
                if (!data.text) return;
                // Apply the same English/SFX filtering as before
                let allow = true;
                try {
                    const filterSfx = (sttCfg.filterSfx !== false);
                    const validateEnglish = (sttCfg.validateEnglish !== false);
                    const effectiveLang = (lang || 'en').slice(0, 2);

                    if (effectiveLang === 'en') {
                        if (filterSfx && _isBracketedSfx(data.text)) {
                            allow = false;
                            console.log(`❌ [RT-STT] Filtered (SFX): "${data.text}"`);
                        } else if (validateEnglish && !_isLikelyEnglish(data.text, sttCfg)) {
                            allow = false;
                            console.log(`❌ [RT-STT] Filtered (non-English): "${data.text}"`);
                        }
                    }
                } catch (_) { /* noop */ }

                if (allow) {
                    console.log(`✅ [RT-STT] Accepted: "${data.text}"`);
                    // Primary transcript event for UI
                    this.sendToClient(sessionId, {
                        type: 'stt_committed',
                        text: data.text,
                        timestamp: data.timestamp,
                        source: 'scribe_v2_realtime'
                    });
                    // Also send as stt_partial for backward compatibility with existing UI
                    this.sendToClient(sessionId, {
                        type: 'stt_partial',
                        text: data.text,
                        timestamp: data.timestamp,
                        final: true,
                        source: 'scribe_v2_realtime'
                    });
                }
            });

            session.on('committed_transcript_with_timestamps', (data) => {
                if (!data.text) return;
                // Send word-level timestamps (useful for jaw animation sync on input)
                this.sendToClient(sessionId, {
                    type: 'stt_timestamps',
                    text: data.text,
                    words: data.words,
                    languageCode: data.languageCode,
                    timestamp: data.timestamp,
                    source: 'scribe_v2_realtime'
                });
            });

            session.on('scribe_error', (data) => {
                console.error(`❌ [RT-STT] Scribe error for ${sessionId}:`, data.type, data.message);
                this.sendToClient(sessionId, {
                    type: 'stt_error',
                    message: `Scribe: ${data.type} - ${data.message}`,
                    source: 'scribe_v2_realtime'
                });
            });

            session.on('disconnected', () => {
                console.log(`🔌 [RT-STT] Session disconnected for ${sessionId}`);
                connection.realtimeSTTSession = null;
            });

            console.log(`✅ [RT-STT] Scribe v2 Realtime session started for ${sessionId}`);
            this.sendToClient(sessionId, {
                type: 'debug',
                originalType: 'realtime_stt_started',
                data: { model: 'scribe_v2_realtime', language: lang || 'auto', strategy: 'vad' }
            });

        } catch (error) {
            console.error(`❌ [RT-STT] Failed to start for ${sessionId}:`, error.message);
            connection.useRealtimeSTT = false; // Fall back to batch STT
            this.sendToClient(sessionId, {
                type: 'debug',
                originalType: 'realtime_stt_fallback',
                data: { error: error.message, fallback: 'batch_stt' }
            });
        }
    }

    /**
     * Stop a Scribe v2 Realtime STT session for a connection
     */
    _stopRealtimeSTTSession(sessionId) {
        const connection = this.activeConnections.get(sessionId);
        if (!connection) return;
        if (connection.realtimeSTTSession) {
            try { connection.realtimeSTTSession.disconnect('session_stop'); } catch (_) { /* noop */ }
            connection.realtimeSTTSession = null;
        }
    }

    /**
     * Server microphone capture loop -> send user_audio_chunk to ElevenLabs
     */
    // Optional WAV denoise/bandpass using ffmpeg if available
    async _filterWavForSTT(wavBuf, filterConfig) {
        try {
            // Skip filtering if buffer is too small (< 1KB)
            if (!wavBuf || wavBuf.length < 1024) return wavBuf;

            // Get filter settings from config or use defaults
            const highpass = (filterConfig && filterConfig.highpassFreq) || 180;
            const lowpass = (filterConfig && filterConfig.lowpassFreq) || 4200;
            const denoise = (filterConfig && filterConfig.denoiseLevel) || -22;

            return await new Promise(function (resolve) {
                try {
                    // Build optimized filter chain
                    const filterChain = 'highpass=f=' + highpass + ',lowpass=f=' + lowpass + ',afftdn=nf=' + denoise;

                    // Use faster FFmpeg options for real-time processing
                    const ff = spawn('ffmpeg', [
                        '-hide_banner',
                        '-loglevel', 'error',
                        '-f', 'wav',
                        '-i', 'pipe:0',
                        '-ac', '1',
                        '-ar', '16000',
                        '-af', filterChain,
                        '-f', 'wav',
                        'pipe:1'
                    ]);

                    let out = Buffer.alloc(0);
                    let errored = false;

                    ff.stdout.on('data', function (d) { out = Buffer.concat([out, d]); });
                    ff.stderr.on('data', function () { /* ignore stderr */ });
                    ff.on('error', function () { errored = true; resolve(wavBuf); });
                    ff.on('close', function (code) {
                        if (errored || code !== 0 || out.length < 44) {
                            resolve(wavBuf);
                        } else {
                            resolve(out);
                        }
                    });

                    // Set timeout to prevent hanging
                    setTimeout(function () {
                        if (!errored) {
                            try { ff.kill(); } catch (_) { }
                            errored = true;
                            resolve(wavBuf);
                        }
                    }, 5000);

                    ff.stdin.end(wavBuf);
                } catch (e) {
                    resolve(wavBuf);
                }
            });
        } catch (_) { return wavBuf; }
    }

    async _startServerMicLoop(sessionId) {
        const connection = this.activeConnections.get(sessionId);
        if (!connection) return;
        if (connection.serverMicActive) return;
        connection.serverMicActive = true;

        const tick = async () => {
            if (!connection.serverMicActive) return;
            // If real-time agent socket isn't ready, continue with local STT only (skip agent streaming)
            const agentReady = !!(connection.elevenLabsWs && connection.elevenLabsWs.readyState === WebSocket.OPEN);
            // Check if Scribe v2 Realtime session is connected
            const realtimeReady = !!(connection.realtimeSTTSession && connection.realtimeSTTSession.isConnected);
            try {
                let deviceId = 'default';
                if (connection.characterId != null) {
                    deviceId = await getMicrophoneDeviceForCharacter(connection.characterId);
                } else {
                    try { const cfg = await getSTTConfig(); deviceId = cfg.deviceId || cfg.microphoneDeviceId || 'default'; } catch (_) { deviceId = 'default'; }
                }
                if (deviceId !== connection._lastDevId) { connection._lastDevId = deviceId; try { this.sendToClient(sessionId, { type: 'debug', originalType: 'server_mic_device', data: { deviceId } }); } catch (_) { } }
                // Capture ~500ms chunks to reduce process-spawn overhead and improve stability
                const wav = await serverSTTListener.captureChunkWav(deviceId, 0.5);
                if (wav && wav.length > 44) {
                    const raw = wav.subarray(44); // strip 44-byte WAV header -> raw PCM16LE

                    // Current time and suppression check (avoid echo during server playback)
                    const now = Date.now();
                    const suppressed = connection.suppressMicUntilMs && (now < connection.suppressMicUntilMs);

                    // 1) Stream to ElevenLabs ConvAI real-time agent (unless suppressed or parrot mode)
                    if (!suppressed && !connection.parrotMode && connection.elevenLabsWs && connection.elevenLabsWs.readyState === WebSocket.OPEN) {
                        const b64 = raw.toString('base64');
                        connection.elevenLabsWs.send(JSON.stringify({ user_audio_chunk: b64 }));
                    }

                    // 2) Stream to Scribe v2 Realtime for live STT (unless suppressed)
                    if (!suppressed && realtimeReady) {
                        // Send raw PCM directly to Scribe v2 Realtime — no batch polling needed!
                        connection.realtimeSTTSession.sendPCMBuffer(raw);
                    }
                    // 2b) Fallback: Batch STT if Scribe v2 Realtime is not available
                    else if (!suppressed && !realtimeReady && (!connection.sttLastAt || (now - connection.sttLastAt) >= 2500)) {
                        // Accumulate PCM for batch STT fallback
                        try {
                            if (!connection.sttPcm) connection.sttPcm = Buffer.alloc(0);
                            connection.sttPcm = Buffer.concat([connection.sttPcm, raw]);
                            const maxBytes = 16000 * 2 * 6; // 6 seconds
                            if (connection.sttPcm.length > maxBytes) {
                                connection.sttPcm = connection.sttPcm.slice(connection.sttPcm.length - maxBytes);
                            }
                        } catch (_) { /* noop */ }

                        connection.sttLastAt = now;
                        try {
                            const sttCfg = await getSTTConfig();
                            const pcmForStt = (connection.sttPcm && connection.sttPcm.length >= 80000)
                                ? connection.sttPcm.slice(-Math.min(connection.sttPcm.length, 16000 * 2 * 6))
                                : null;
                            if (pcmForStt) {
                                let sttWav = encodeWavPCM16LE(pcmForStt, 16000, 1);
                                const lang = (connection.sttLanguage && connection.sttLanguage !== 'auto') ? connection.sttLanguage : (sttCfg.language || 'auto');
                                const audioFilterEnabled = (sttCfg.audioFilterEnabled !== false);
                                try {
                                    if (process.env.MB_STT_FILTER === '1' || (audioFilterEnabled && lang && lang.slice(0, 2) === 'en')) {
                                        sttWav = await this._filterWavForSTT(sttWav, sttCfg);
                                    }
                                } catch (_) { /* keep original on failure */ }

                                const result = await elevenLabsSTTService.transcribeAudio(sttWav, { mimeType: 'audio/wav', model: sttCfg.model, language: lang });
                                const text = (result && result.success && (result.transcript || result.text)) ? String(result.transcript || result.text).trim() : '';

                                if (text) {
                                    let allow = true;
                                    const filterSfx = (sttCfg.filterSfx !== false);
                                    const validateEnglish = (sttCfg.validateEnglish !== false);
                                    if ((lang || '').slice(0, 2) === 'en' && process.env.MB_AUTOTUNE_ALLOW_SFX !== '1') {
                                        if (filterSfx && _isBracketedSfx(text)) allow = false;
                                        else if (validateEnglish && !_isLikelyEnglish(text, sttCfg)) allow = false;
                                    }
                                    if (allow) {
                                        this.sendToClient(sessionId, { type: 'stt_partial', text: text, timestamp: now, source: 'batch_scribe_v2' });
                                        connection.sttPcm = Buffer.alloc(0);
                                    }
                                }
                            }
                        } catch (e) {
                            try {
                                const msg = (e && (e.message || e.error || e.toString && e.toString())) || 'STT failed';
                                this.sendToClient(sessionId, { type: 'stt_error', message: String(msg).slice(0, 200) });
                            } catch (_) { /* noop */ }
                        }
                    } else if (!suppressed && !realtimeReady) {
                        // Still accumulate PCM for batch fallback between throttle windows
                        try {
                            if (!connection.sttPcm) connection.sttPcm = Buffer.alloc(0);
                            connection.sttPcm = Buffer.concat([connection.sttPcm, raw]);
                            const maxBytes = 16000 * 2 * 6;
                            if (connection.sttPcm.length > maxBytes) {
                                connection.sttPcm = connection.sttPcm.slice(connection.sttPcm.length - maxBytes);
                            }
                        } catch (_) { /* noop */ }
                    }

                    // 3) Compute RMS audio level from PCM16LE and send to client
                    //    PCM16LE = signed 16-bit little-endian samples
                    var rmsLevel = 0;
                    try {
                        var sumSq = 0;
                        var sampleCount = Math.floor(raw.length / 2);
                        for (var si = 0; si < sampleCount; si++) {
                            var sample = raw.readInt16LE(si * 2);
                            sumSq += sample * sample;
                        }
                        rmsLevel = Math.sqrt(sumSq / (sampleCount || 1)) / 32768;
                        rmsLevel = Math.min(1, rmsLevel);
                    } catch (_) { rmsLevel = 0; }

                    // Send audio level to browser every ~500ms (every other tick at 250ms)
                    if (!connection._vuLastTs || (now - connection._vuLastTs) >= 500) {
                        connection._vuLastTs = now;
                        try { this.sendToClient(sessionId, { type: 'audio_level', level: Math.round(rmsLevel * 100) }); } catch (_) { }
                    }

                    // 4) Periodic client breadcrumb with device and bytes captured (once per second)
                    if (!connection._dbgLastTs || (now - connection._dbgLastTs) >= 1000) {
                        connection._dbgLastTs = now;
                        try { this.sendToClient(sessionId, { type: 'debug', originalType: 'server_mic_tick', data: { deviceId, bytes: raw.length, suppressed: !!suppressed, realtimeSTT: realtimeReady } }); } catch (_) { }
                    }
                }
            } catch (_) { /* ignore per-frame errors */ }
            finally {
                if (connection.serverMicActive && connection.isActive) {
                    connection.serverMicTimer = setTimeout(tick, 250); // ~4 fps -> 250ms for stability
                }
            }
        };

        connection.serverMicTimer = setTimeout(tick, 5);
    }

    _stopServerMicLoop(sessionId, sendEos) {
        const connection = this.activeConnections.get(sessionId);
        if (!connection) return;
        connection.serverMicActive = false;
        if (connection.serverMicTimer) { try { clearTimeout(connection.serverMicTimer); } catch (_) { } connection.serverMicTimer = null; }
        if (sendEos) this._sendEmptyAudioChunkToAgent(sessionId);
    }

    _sendEmptyAudioChunkToAgent(sessionId) {
        const c = this.activeConnections.get(sessionId);
        try {
            if (c && c.elevenLabsWs && c.elevenLabsWs.readyState === WebSocket.OPEN) {
                c.elevenLabsWs.send(JSON.stringify({ user_audio_chunk: '' }));
            }
        } catch (_) { /* noop */ }
    }


    /**
     * Handle client disconnect
     */
    handleClientDisconnect(sessionId) {
        console.log(`🔌 Client disconnected: ${sessionId}`);

        // Stop any server mic loop and send EOS
        try { this._stopServerMicLoop(sessionId, true); } catch (_) { /* noop */ }
        // Stop Scribe v2 Realtime STT session
        try { this._stopRealtimeSTTSession(sessionId); } catch (_) { /* noop */ }

        const connection = this.activeConnections.get(sessionId);
        if (connection) {
            // Stop persistent audio stream for this character
            if (connection.characterId != null) {
                try { serverPlaybackService.stopStream({ characterId: connection.characterId }); } catch (_) { /* noop */ }
            }
            // Close ElevenLabs WebSocket if active
            if (connection.elevenLabsWs && connection.elevenLabsWs.readyState === WebSocket.OPEN) {
                try {
                    console.log(`🔌 Closing ElevenLabs connection for disconnected client ${sessionId}`);
                    connection.elevenLabsWs.close();
                } catch (error) {
                    console.warn(`⚠️ Error closing ElevenLabs connection: ${error.message}`);
                }
            }
            this.activeConnections.delete(sessionId);
        }
    }

    /**
     * Send message to client
     */
    sendToClient(sessionId, message) {
        const connection = this.activeConnections.get(sessionId);
        if (connection && connection.clientWs && connection.clientWs.readyState === WebSocket.OPEN) {
            connection.clientWs.send(JSON.stringify(message));
        }
    }

    /**
     * Generate unique session ID
     */
    generateSessionId() {
        return 'chat_' + Date.now() + '_' + Math.random().toString(36).substr(2, 9);
    }

    /**
     * Get active connections count
     */
    getActiveConnectionsCount() {
        return this.activeConnections.size;
    }

    /**
     * Get summary of active sessions for status display
     */
    getActiveSessions() {
        const sessions = [];
        for (const [id, c] of this.activeConnections) {
            sessions.push({ sessionId: id, isActive: !!c.isActive, characterId: c.characterId });
        }
        return sessions;
    }

    /**
     * Stop WebSocket server
     */
    /**
     * Start continuous audio playback from buffer
     * Streams buffered chunks as a continuous MP3 stream to avoid gaps
     */
    async _startAudioPlayback(sessionId) {
        const c = this.activeConnections.get(sessionId);
        if (!c || c.audioPlaying) return;

        c.audioPlaying = true;
        c._streamPrimed = false;
        console.log(`🔊 Starting audio playback for session ${sessionId}, character ${c.characterId}`);

        try {
            while ((Array.isArray(c.audioBuffer) && c.audioBuffer.length > 0) || c.isActive) {
                // Wait for buffer to have chunks or timeout
                if (!c.audioBuffer || c.audioBuffer.length === 0) {
                    await new Promise(resolve => setTimeout(resolve, 20));
                    if ((!c.audioBuffer || c.audioBuffer.length === 0) && !c.isActive) break;
                    continue;
                }

                // Prime the stream with a few chunks to prevent underflow
                if (!c._streamPrimed && c.audioBuffer.length < 3) {
                    await new Promise(resolve => setTimeout(resolve, 20));
                    continue;
                }
                c._streamPrimed = true;

                // Collect multiple chunks for smoother playback (aggregate frames)
                const chunksToPlay = [];
                const maxChunks = 12; // larger aggregation reduces syscall overhead
                while (c.audioBuffer.length > 0 && chunksToPlay.length < maxChunks) {
                    chunksToPlay.push(c.audioBuffer.shift());
                }
                if (chunksToPlay.length === 0) continue;

                // Decode each base64 chunk separately then concatenate raw buffers.
                // Joining base64 strings corrupts data (padding '=' in the middle).
                const audioBuffer = Buffer.concat(chunksToPlay.map(chunk => Buffer.from(chunk, 'base64')));

                // Use PCM stream for raw audio (ConvAI default), MP3 stream otherwise
                const fmt = c.audioOutputFormat || 'pcm_16000';
                let result;
                if (fmt.startsWith('pcm_')) {
                    const sampleRate = parseInt(fmt.split('_')[1]) || 16000;
                    result = await serverPlaybackService.writePcmStream(audioBuffer, {
                        characterId: c.characterId,
                        volume: 100,
                        sampleRate,
                        kind: 'ai'
                    });
                } else {
                    result = await serverPlaybackService.playBufferOnCharacterSpeaker(audioBuffer, {
                        characterId: c.characterId,
                        contentType: 'audio/mpeg',
                        volume: 100
                    });
                }
                if (!result.success) {
                    console.error(`❌ Audio playback failed: ${result.error}`);
                }

                // Extend mic suppression: estimate audio duration from PCM buffer
                const chunkFmt = c.audioOutputFormat || 'pcm_16000';
                if (chunkFmt.startsWith('pcm_')) {
                    const sr = parseInt(chunkFmt.split('_')[1]) || 16000;
                    const durationMs = (audioBuffer.length / (sr * 2)) * 1000;
                    c.suppressMicUntilMs = Math.max(c.suppressMicUntilMs, Date.now() + durationMs + 1500);
                } else {
                    c.suppressMicUntilMs = Math.max(c.suppressMicUntilMs, Date.now() + 3000);
                }
            }
        } catch (error) {
            console.error(`❌ Error in audio playback loop:`, error.message);
        } finally {
            c.audioPlaying = false;
            console.log(`🔇 Audio playback stopped for session ${sessionId}`);
            // Close jaw when audio stops
            try { jawAnimationService.driveJawFromAmplitude(c.characterId, 0).catch(() => {}); } catch (_) {}
        }
    }

    /**
     * Suppress mic input for all active sessions of a character (echo suppression for parrot mode).
     * @param {number} characterId - Character ID to suppress
     * @param {number} durationMs - Duration in milliseconds
     */
    suppressMicForCharacter(characterId, durationMs) {
        const suppressUntil = Date.now() + durationMs;
        for (const [, connection] of this.activeConnections) {
            if (connection.characterId === characterId || characterId == null) {
                connection.suppressMicUntilMs = Math.max(
                    connection.suppressMicUntilMs || 0,
                    suppressUntil
                );
            }
        }
    }

    async stopWebSocketServer() {
        // Clear session cleanup timer to prevent leaks
        if (this._cleanupTimer) {
            clearInterval(this._cleanupTimer);
            this._cleanupTimer = null;
        }

        if (this.wsServer) {
            // Close all active connections
            for (const [sessionId, connection] of this.activeConnections) {
                // Stop server mic loops
                try { this._stopServerMicLoop(sessionId, false); } catch (_) { /* noop */ }
                // Stop realtime STT sessions
                try { this._stopRealtimeSTTSession(sessionId); } catch (_) { /* noop */ }
                // Stop audio streams
                if (connection.characterId != null) {
                    try { serverPlaybackService.stopStream({ characterId: connection.characterId }); } catch (_) { /* noop */ }
                }
                if (connection.elevenLabsWs) {
                    try { connection.elevenLabsWs.close(); } catch (_) { /* noop */ }
                }
                if (connection.clientWs) {
                    try { connection.clientWs.close(); } catch (_) { /* noop */ }
                }
            }

            this.activeConnections.clear();

            // Close WSS server if attached
            if (this.wssServer) {
                try { this.wssServer.close(); } catch (_) { /* noop */ }
                this.wssServer = null;
            }

            return new Promise((resolve) => {
                this.wsServer.close(() => {
                    console.log('🛑 ElevenLabs Chat WebSocket server stopped');
                    resolve();
                });
            });
        }
    }

    /**
     * Send a text question to an agent and play the response through character speaker
     * @param {string} agentId - ElevenLabs agent ID
     * @param {string} text - Question text
     * @param {number} characterId - Character ID for audio playback
     * @returns {Promise<{success: boolean, response: string}>}
     */
    async askAgentQuestion(agentId, text, characterId) {
        return new Promise(async (resolve, reject) => {
            let sessionId = null;
            let responseText = '';
            let connection = null;

            try {
                // Create a temporary connection
                sessionId = this.generateSessionId();
                connection = {
                    sessionId,
                    clientWs: null,
                    elevenLabsWs: null,
                    agentId,
                    isActive: true,
                    startTime: new Date(),
                    characterId,
                    outputMode: 'server',
                    micSource: 'server',
                    audioBuffer: [],
                    audioPlaying: false,
                    suppressMicUntilMs: 0
                };

                this.activeConnections.set(sessionId, connection);

                // Get signed URL for conversation
                const signedUrlResponse = await fetch(
                    `${this.config.baseUrl}/convai/conversation/get-signed-url?agent_id=${agentId}`,
                    {
                        method: 'GET',
                        headers: {
                            'xi-api-key': this.config.apiKey,
                            'Content-Type': 'application/json'
                        }
                    }
                );

                if (!signedUrlResponse.ok) {
                    throw new Error(`Failed to get signed URL: HTTP ${signedUrlResponse.status}`);
                }

                const { signed_url } = await signedUrlResponse.json();

                // Connect to ElevenLabs WebSocket
                const elevenLabsWs = new WebSocket(signed_url);
                connection.elevenLabsWs = elevenLabsWs;

                elevenLabsWs.on('open', () => {
                    console.log(`🎯 Connected to agent ${agentId} for question`);
                    // Send initialization
                    elevenLabsWs.send(JSON.stringify({
                        type: 'conversation_initiation_client_data',
                        conversation_config_override: {}
                    }));
                    
                    // Start streaming audio playback
                    this._startAudioPlayback(sessionId);
                });

                elevenLabsWs.on('message', async (data) => {
                    try {
                        const message = JSON.parse(data.toString());

                        // Log all message types to understand structure
                        if (message.type !== 'ping' && message.type !== 'audio') {
                            console.log(`🔍 WebSocket message type: ${message.type}`, JSON.stringify(message).substring(0, 200));
                        }

                        if (message.type === 'conversation_initiation_metadata') {
                            // Send the question
                            elevenLabsWs.send(JSON.stringify({
                                type: 'user_message',
                                text
                            }));
                        } else if (message.type === 'audio' && message.audio_event) {
                            // Collect audio chunks (will play all at once when connection closes)
                            if (message.audio_event.audio_base_64) {
                                connection.audioBuffer.push(message.audio_event.audio_base_64);
                            }
                            // Accumulate response text from audio events - check all possible fields
                            const textFragment = message.audio_event.agent_response ||
                                message.audio_event.agent_response_text ||
                                message.audio_event.text ||
                                message.audio_event.message ||
                                message.agent_response ||
                                message.text;
                            if (textFragment) {
                                responseText = responseText ? (responseText + ' ' + textFragment) : textFragment;
                                console.log(`📝 Captured text fragment: "${textFragment}"`);
                            }
                        } else if (message.type === 'agent_response' || message.type === 'agent_response_event') {
                            // Extract text from agent_response_event wrapper
                            const textFragment = message.agent_response_event?.agent_response || 
                                                message.agent_response || 
                                                message.text || 
                                                message.message;
                            if (textFragment) {
                                responseText = responseText ? (responseText + ' ' + textFragment) : textFragment;
                                console.log(`📝 Captured agent response: "${textFragment.substring(0, 100)}${textFragment.length > 100 ? '...' : ''}"`);
                            }
                        } else if (message.type === 'ping' && message.ping_event) {
                            elevenLabsWs.send(JSON.stringify({
                                type: 'pong',
                                event_id: message.ping_event.event_id
                            }));
                        }
                    } catch (err) {
                        console.error('❌ Message parse error:', err);
                    }
                });

                elevenLabsWs.on('close', async () => {
                    console.log(`🔌 Agent connection closed`);

                    // Stop the streaming playback loop
                    connection.isActive = false;

                    // Give streaming a moment to finish any remaining chunks
                    await new Promise(r => setTimeout(r, 1000));

                    console.log(`📝 Final response text: "${responseText || 'Response received'}"`);
                    this.activeConnections.delete(sessionId);
                    resolve({ success: true, response: responseText || 'Response received' });
                });

                elevenLabsWs.on('error', (error) => {
                    console.error('❌ Agent WebSocket error:', error);
                    this.activeConnections.delete(sessionId);
                    reject(error);
                });

                // Timeout after 30 seconds
                setTimeout(() => {
                    if (elevenLabsWs.readyState === WebSocket.OPEN) {
                        elevenLabsWs.close();
                    }
                }, 30000);

            } catch (error) {
                if (sessionId) this.activeConnections.delete(sessionId);
                reject(error);
            }
        });
    }
}

export default new ElevenLabsWebSocketService();
