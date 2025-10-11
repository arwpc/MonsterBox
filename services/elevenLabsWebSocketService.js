/**
 * MonsterBox 4.0 - ElevenLabs WebSocket Conversation Service
 * Real-time streaming conversation with immediate responses
 */

import WebSocket, { WebSocketServer } from 'ws';
import { EventEmitter } from 'events';
import fetch from 'node-fetch';
import elevenLabsConfigService from './elevenLabsConfigService.js';
import serverSTTListener from './serverSTTListener.js';
import serverPlaybackService from './serverPlaybackService.js';
import elevenLabsSTTService from './elevenLabsSTTService.js';
import randomPoseService from './randomPoseService.js';
import { getSTTConfig } from './aiConfigStore.js';
import fs from 'fs/promises';
import path from 'path';
import { fileURLToPath } from 'url';
import { readConfig } from './configService.js';

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
    }

    /**
     * Start WebSocket server for real-time chat
     */
    async startWebSocketServer() {
        return new Promise((resolve, reject) => {
            try {
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
            serverMicTimer: null,
            serverMicActive: false,
            sttLastAt: 0,
            sttPcm: Buffer.alloc(0), // rolling PCM buffer for partial STT
            _dbgLastTs: 0,           // throttle for client debug breadcrumbs
            sttLanguage: null,       // per-connection STT language override
            suppressMicUntilMs: 0,   // suppress server mic during server playback
            audioBuffer: [],         // base64 MP3 frames from ElevenLabs
            audioPlaying: false      // audio playback loop active flag
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
                    await this.startConversation(sessionId, message.agentId);
                    // If server mic is selected, begin streaming immediately
                    if (connection.micSource === 'server') {
                        this._startServerMicLoop(sessionId).catch(function () { /* noop */ });
                    }
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

                case 'set_stt_language':
                    try {
                        const lang = (message && message.language) ? String(message.language).toLowerCase() : '';
                        connection.sttLanguage = lang ? (lang.length > 2 ? lang.slice(0, 2) : lang) : null;
                        this.sendToClient(sessionId, { type: 'debug', originalType: 'set_stt_language', data: { language: connection.sttLanguage } });
                    } catch (_) { /* noop */ }
                    break;

                case 'browser_audio_chunk':
                    // Forward browser-sent PCM16k (base64) directly to ElevenLabs
                    try {
                        if (connection && connection.elevenLabsWs && connection.elevenLabsWs.readyState === WebSocket.OPEN) {
                            const audio64 = (message && message.audio) ? String(message.audio) : '';
                            connection.elevenLabsWs.send(JSON.stringify({ user_audio_chunk: audio64 }));
                        }
                    } catch (_) { /* noop */ }
                    break;

                case 'eos':
                    // Client signals end-of-speech explicitly
                    this._sendEmptyAudioChunkToAgent(sessionId);
                    break;

                case 'end_conversation':
                    await this.endConversation(sessionId);
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
                connection.isActive = true;


                // Ensure server mic loop is running once active
                if (connection.micSource === 'server') {
                    try { this._startServerMicLoop(sessionId); } catch (_) { }
                }

                // Send conversation initiation with optimized config for speed
                elevenLabsWs.send(JSON.stringify({
                    type: 'conversation_initiation_client_data',
                    conversation_config_override: {
                        turn_detection: {
                            type: 'server_vad',
                            threshold: 0.5,
                            prefix_padding_ms: 100, // Reduced for faster response
                            silence_duration_ms: 500 // Reduced for faster response
                        }
                    }
                }));

                this.sendToClient(sessionId, {
                    type: 'conversation_started',
                    agentId: agentId,
                    message: 'Connected to real-time agent - ready for instant chat!'
                });
            });

            elevenLabsWs.on('message', (data) => {
                this.handleElevenLabsMessage(sessionId, data);
            });

            elevenLabsWs.on('close', () => {
                console.log(`🔌 ElevenLabs real-time connection closed for ${sessionId}`);
                connection.elevenLabsWs = null;
                connection.isActive = false;
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
        if (!connection || !connection.elevenLabsWs || !connection.isActive) {
            this.sendToClient(sessionId, {
                type: 'error',
                message: 'No active real-time conversation'
            });
            return;
        }

        try {
            console.log(`📤 Sending text to real-time agent: "${text}"`);

            // Send text message to ElevenLabs real-time WebSocket
            // Use proper text message format for conversational AI
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
                    break;

                case 'audio':
                    // Real-time audio response with text
                    if (message.audio_event) {
                        const audioData = message.audio_event.audio_base_64;
                        // Try multiple fields for text content - check audio_event first
                        const responseText = message.audio_event?.agent_response ||
                            message.audio_event?.text ||
                            message.agent_response ||
                            message.text ||
                            null;

                        const c = this.activeConnections.get(sessionId);

                        // If we're outputting on server speaker, suppress mic during playback and enqueue audio for streaming
                        try {
                            if (c && c.outputMode === 'server') {
                                c.suppressMicUntilMs = Date.now() + 1200; // extend on each chunk
                                if (!Array.isArray(c.audioBuffer)) c.audioBuffer = [];
                                c.audioBuffer.push(audioData);
                                if (!c.audioPlaying) {
                                    this._startAudioPlayback(sessionId).catch(function () { /* noop */ });
                                }
                            }
                        } catch (_) { }

                        // Always also send to client so UI can display text and/or play locally if selected
                        this.sendToClient(sessionId, {
                            type: 'agent_response',
                            text: responseText || 'Audio response',
                            audio: audioData,
                            timestamp: Date.now(),
                            realTime: true
                        });
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
                            // Primary event used by mic-panel
                            this.sendToClient(sessionId, {
                                type: 'user_transcript',
                                user_transcription_event: message.user_transcription_event || { user_transcript: userText },
                                timestamp: Date.now()
                            });
                            // Also send generic transcript event for broader UI compatibility
                            this.sendToClient(sessionId, {
                                type: 'transcript',
                                role: 'user',
                                text: userText,
                                timestamp: Date.now()
                            });
                        }
                    } catch (_) { /* noop */ }
                    break;

                case 'agent_response':
                    // Text-only agent response
                    const responseText = message.agent_response_event?.agent_response ||
                        message.agent_response ||
                        message.text ||
                        message.message ||
                        '';



                    this.sendToClient(sessionId, {
                        type: 'agent_response',
                        text: responseText || 'Text response',
                        timestamp: Date.now(),
                        realTime: true
                    });
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

            const { spawn } = require('child_process');
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
            try {
                let deviceId = 'default';
                if (connection.characterId != null) {
                    deviceId = await getMicrophoneDeviceForCharacter(connection.characterId);
                } else {
                    try { const cfg = await getSTTConfig(); deviceId = cfg.deviceId || cfg.microphoneDeviceId || 'default'; } catch (_) { deviceId = 'default'; }
                }
                if (deviceId !== connection._lastDevId) { connection._lastDevId = deviceId; try { this.sendToClient(sessionId, { type: 'debug', originalType: 'server_mic_device', data: { deviceId } }); } catch (_) { } }
                // Capture ~250ms chunks to reduce process-spawn overhead and improve stability
                const wav = await serverSTTListener.captureChunkWav(deviceId, 0.25);
                if (wav && wav.length > 44) {
                    const raw = wav.subarray(44); // strip 44-byte WAV header -> raw PCM16LE

                    // Accumulate raw PCM into rolling buffer for partial STT (keep ~2s max)
                    try {
                        if (!connection.sttPcm) connection.sttPcm = Buffer.alloc(0);
                        connection.sttPcm = Buffer.concat([connection.sttPcm, raw]);
                        const maxBytes = 16000 * 2 * 2; // 2 seconds @16kHz mono 16-bit
                        if (connection.sttPcm.length > maxBytes) {
                            connection.sttPcm = connection.sttPcm.slice(connection.sttPcm.length - maxBytes);
                        }
                    } catch (_) { /* noop */ }

                    // Current time and suppression check (avoid echo during server playback)
                    const now = Date.now();
                    const suppressed = connection.suppressMicUntilMs && (now < connection.suppressMicUntilMs);

                    // 1) Stream to ElevenLabs real-time agent (unless suppressed)
                    if (!suppressed && connection.elevenLabsWs && connection.elevenLabsWs.readyState === WebSocket.OPEN) {
                        const b64 = raw.toString('base64');
                        connection.elevenLabsWs.send(JSON.stringify({ user_audio_chunk: b64 }));
                    }

                    // 2) Throttled STT transcription for on-screen "You (STT)" lines (unless suppressed)
                    if (!suppressed && (!connection.sttLastAt || (now - connection.sttLastAt) >= 1000)) {
                        connection.sttLastAt = now;
                        try {
                            const sttCfg = await getSTTConfig();
                            const pcmForStt = (connection.sttPcm && connection.sttPcm.length >= 20000)
                                ? connection.sttPcm.slice(-Math.min(connection.sttPcm.length, 16000 * 2 * 2))
                                : null;
                            if (pcmForStt) {
                                let sttWav = encodeWavPCM16LE(pcmForStt, 16000, 1);
                                const lang = (connection.sttLanguage && connection.sttLanguage !== 'auto') ? connection.sttLanguage : (sttCfg.language || 'auto');

                                // Apply audio filtering if enabled
                                const audioFilterEnabled = (sttCfg.audioFilterEnabled !== false); // default true
                                const debugAudio = process.env.MB_DEBUG_AUDIO === '1';
                                try {
                                    if (process.env.MB_STT_FILTER === '1' || (audioFilterEnabled && lang && lang.slice(0, 2) === 'en')) {
                                        const beforeSize = sttWav.length;
                                        const startTime = Date.now();
                                        sttWav = await this._filterWavForSTT(sttWav, sttCfg);
                                        const afterSize = sttWav.length;
                                        const duration = Date.now() - startTime;
                                        if (debugAudio) {
                                            console.log('[STT Filter] Applied audio filters in ' + duration + 'ms (before: ' + beforeSize + ' bytes, after: ' + afterSize + ' bytes)');
                                        }
                                    }
                                } catch (err) {
                                    if (debugAudio) {
                                        console.error('[STT Filter] Audio filtering failed:', err.message || err);
                                    }
                                    /* keep original on failure */
                                }

                                const result = await elevenLabsSTTService.transcribeAudio(sttWav, { mimeType: 'audio/wav', model: sttCfg.model, language: lang });
                                const text = (result && result.success && (result.transcript || result.text)) ? String(result.transcript || result.text).trim() : '';

                                if (debugAudio && text) {
                                    console.log('[STT] Transcription received: "' + text + '"');
                                }

                                if (text) {
                                    let allow = true;
                                    let filterReason = null;

                                    // Text filtering based on configuration
                                    const allowSfxForAutotune = process.env.MB_AUTOTUNE_ALLOW_SFX === '1';
                                    const filterSfx = (sttCfg.filterSfx !== false); // default true
                                    const validateEnglish = (sttCfg.validateEnglish !== false); // default true

                                    if ((lang || '').slice(0, 2) === 'en' && !allowSfxForAutotune) {
                                        // Check for bracketed sound effects
                                        if (filterSfx && _isBracketedSfx(text)) {
                                            allow = false;
                                            filterReason = 'bracketed_sfx';
                                            try { this.sendToClient(sessionId, { type: 'debug', originalType: 'stt_filtered_sfx', data: { text } }); } catch (_) { }
                                        }
                                        // Validate English text
                                        else if (validateEnglish && !_isLikelyEnglish(text, sttCfg)) {
                                            allow = false;
                                            filterReason = 'non_english';
                                            try { this.sendToClient(sessionId, { type: 'debug', originalType: 'stt_filtered_english', data: { text } }); } catch (_) { }
                                        }
                                    }

                                    if (debugAudio && !allow) {
                                        console.log('[STT Filter] Rejected transcription "' + text + '" (reason: ' + filterReason + ')');
                                    }

                                    if (allow) {
                                        if (debugAudio) {
                                            console.log('[STT] Accepted transcription: "' + text + '"');
                                        }
                                        this.sendToClient(sessionId, { type: 'stt_partial', text: text, timestamp: now });
                                        // reset buffer after a successful partial to avoid repeats
                                        connection.sttPcm = Buffer.alloc(0);
                                    }
                                } else if (debugAudio && result && !result.success) {
                                    console.log('[STT] Transcription failed:', result.error || 'Unknown error');
                                }
                            }
                        } catch (e) {
                            try {
                                const msg = (e && (e.message || e.error || e.toString && e.toString())) || 'STT failed';
                                this.sendToClient(sessionId, { type: 'stt_error', message: String(msg).slice(0, 200) });
                            } catch (_) { /* noop */ }
                        }
                    }
                    // 3) Periodic client breadcrumb with device and bytes captured (once per second)
                    if (!connection._dbgLastTs || (now - connection._dbgLastTs) >= 1000) {
                        connection._dbgLastTs = now;
                        try { this.sendToClient(sessionId, { type: 'debug', originalType: 'server_mic_tick', data: { deviceId, bytes: raw.length, suppressed: !!suppressed } }); } catch (_) { }
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

        const connection = this.activeConnections.get(sessionId);
        if (connection) {
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

                // Combine chunks into single buffer and stream
                const combinedBase64 = chunksToPlay.join('');
                const audioBuffer = Buffer.from(combinedBase64, 'base64');

                const result = await serverPlaybackService.playBufferOnCharacterSpeaker(audioBuffer, {
                    characterId: c.characterId,
                    contentType: 'audio/mpeg', // ElevenLabs ConvAI default stream is MP3 frames
                    volume: 80
                });
                if (!result.success) {
                    console.error(`❌ Audio playback failed: ${result.error}`);
                }

                // Extend mic suppression during server playback to avoid echo
                c.suppressMicUntilMs = Date.now() + 1500;
            }
        } catch (error) {
            console.error(`❌ Error in audio playback loop:`, error.message);
        } finally {
            c.audioPlaying = false;
            console.log(`🔇 Audio playback stopped for session ${sessionId}`);
        }
    }

    async stopWebSocketServer() {
        if (this.wsServer) {
            // Close all active connections
            for (const [sessionId, connection] of this.activeConnections) {
                if (connection.elevenLabsWs) {
                    connection.elevenLabsWs.close();
                }
                if (connection.clientWs) {
                    connection.clientWs.close();
                }
            }

            this.activeConnections.clear();

            return new Promise((resolve) => {
                this.wsServer.close(() => {
                    console.log('🛑 ElevenLabs Chat WebSocket server stopped');
                    resolve();
                });
            });
        }
    }
}

export default new ElevenLabsWebSocketService();
