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
import gestureEngineService from './gestureEngineService.js';

// Absolute floor below which a frame is never treated as speech, whatever the
// adaptive estimate says.
const VOICE_ACTIVITY_RMS = 0.02;

// How much louder than the measured noise floor a frame must be to count as the
// guest speaking. A fixed threshold does not work here: this node's USB audio
// adapter has a constant preamp hiss around 0.027 RMS, ABOVE the old fixed 0.02,
// so the gate could never close and Scribe kept transcribing the hiss as "...".
// Measured on this node's USB audio adapter: floor ~0.027, speech 0.069-0.195 —
// a 2x margin separates them cleanly while adapting to any quieter or noisier
// install, which is why the threshold is derived rather than hardcoded.
const VOICE_GATE_MARGIN = 2.0;

// How long a frame's worth of voice keeps the gate open after the guest stops.
// Long enough to bridge the pauses inside a sentence, short enough that room
// tone and servo whine never accumulate into a "turn" the agent tries to answer.
const MIC_GATE_HANGOVER_MS = 900;

// Set MB_MIC_VOICE_GATE=0 to stream the raw microphone regardless.
const MIC_VOICE_GATE_ENABLED = process.env.MB_MIC_VOICE_GATE !== '0';

// Set MB_WS_DEBUG=1 to dump per-message WebSocket payload previews. Default
// silent: every conversation message otherwise lands in monsterbox.log and
// wears the SD card.
const WS_DEBUG = process.env.MB_WS_DEBUG === '1';

// Ceiling on waiting for a reply on a live session before the HTTP caller is
// answered with whatever text arrived. Never let a silent agent hang a request.
const ASK_REPLY_TIMEOUT_MS = 30000;

// Quiet after the last audio chunk before a reply is considered complete.
const ASK_SETTLE_MS = 1500;

// 250ms of pcm_16000 at the noise floor. Injected text alone does not close a
// turn — the turn model commits on an audio edge — so this frame is sent right
// after a question to make the agent actually answer. Dithered rather than pure
// zeroes because a perfectly silent buffer reads as a dead stream, not a quiet room.
// 500ms of pcm_16000 silence. Injected text alone does not close a turn — the
// turn model commits on an audio edge — so this is sent right after a text
// question to make the agent actually answer (measured: no reply at all after
// 70s without it).
const TURN_COMMIT_FRAME_B64 = Buffer.alloc(8000 * 2).toString('base64');

// Filler audio for the closed voice gate: TRUE digital silence, not dither.
// Dither keeps the stream alive but ASR transcribes a constant low-level hiss as
// "..." — which becomes a spurious guest turn, exactly the bug being fixed.
// Zeroes give the turn model an unambiguous silence edge (so it commits the
// guest's turn promptly) and give ASR nothing to hallucinate on.
// Cached per length because the mic loop re-frames to one fixed size.
const _floorFrameCache = new Map();
function _floorFrameB64(byteLength) {
    const cached = _floorFrameCache.get(byteLength);
    if (cached) return cached;
    const b64 = Buffer.alloc(byteLength).toString('base64');
    if (_floorFrameCache.size < 8) _floorFrameCache.set(byteLength, b64);
    return b64;
}

/**
 * Log the breakdown of one turn: how long each hop took between the guest
 * falling silent and the character's first sound.
 *
 * A single end-to-end number ("about 12 seconds") is not actionable — it does
 * not say whether to tune end-of-turn detection, the LLM, or TTS. These four
 * deltas do.
 */
function logTurnLatency(connection, sessionId) {
    const t = connection && connection._turn;
    if (!t || !t.firstAudioAtMs || t._logged) return;
    t._logged = true;
    const parts = [];
    const from = t.speechEndMs || t.transcriptAtMs;
    parts.push(`src=${t.source || 'speech'}`);
    if (t.speechEndMs && t.transcriptAtMs) parts.push(`speech-end→transcript ${t.transcriptAtMs - t.speechEndMs}ms`);
    if (t.transcriptAtMs && t.responseAtMs) parts.push(`transcript→LLM-text ${t.responseAtMs - t.transcriptAtMs}ms`);
    if (t.transcriptAtMs) parts.push(`transcript→first-audio ${t.firstAudioAtMs - t.transcriptAtMs}ms`);
    if (t.responseAtMs) parts.push(`LLM-text→first-audio ${t.firstAudioAtMs - t.responseAtMs}ms`);
    else parts.push(`LLM-text→first-audio n/a (audio led text)`);
    if (from) parts.push(`TOTAL-to-first-sound ${t.firstAudioAtMs - from}ms`);
    console.log(`⏱️  [turn-latency] session=${sessionId} ${parts.join('  |  ')}`);
}

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
    // The agent registry is fleet-wide, but resolveCharactersPath() joins
    // cfg.dataPath, which points at the SELECTED character's directory. On a node
    // whose dataPath holds a stale per-character copy (e.g. a test fixture), that
    // copy shadowed the real registry and agent resolution always returned null.
    // Check the dataPath copy first (so a deliberate override still wins), then
    // fall back to the canonical fleet registry at data/characters.json.
    const appRoot = path.resolve(__dirname, '..');
    const candidates = [];
    try { candidates.push(await resolveCharactersPath()); } catch (_) { /* noop */ }
    const rootRegistry = path.resolve(appRoot, 'data', 'characters.json');
    if (!candidates.includes(rootRegistry)) candidates.push(rootRegistry);

    for (const file of candidates) {
        try {
            const content = await fs.readFile(file, 'utf8');
            const parsed = JSON.parse(content);
            const list = Array.isArray(parsed) ? parsed : (Array.isArray(parsed?.characters) ? parsed.characters : null);
            if (!list) continue;
            const c = list.find(ch => Number(ch.id) === Number(characterId));
            if (c && c.elevenLabsAgentId) return String(c.elevenLabsAgentId);
        } catch (_) { /* try next candidate */ }
    }
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
        // Lazy config (see getter) — a missing API key must not throw at import
        // time and crash the whole server via `export default new ...`.
        this._config = null;
        this.activeConnections = new Map(); // sessionId -> connection info
        // characterId -> sessionId for headless (server-initiated) agent sessions.
        // Headless sessions have no browser client; they are started by the
        // /conversation/api/ai-on toggle and keep the agent live on the node.
        this.headlessSessions = new Map();
        this.wsServer = null;
        this.port = 8795; // Dedicated port for AI chat WebSocket

        // Hardening: Session management
        this.sessionTimeoutMs = 3600000; // 1 hour max session duration
        this.cleanupIntervalMs = 60000; // cleanup every minute
        this._cleanupTimer = null;

        console.log('🎤 ElevenLabsWebSocketService initialized with hardening');
    }

    get config() {
        if (!this._config) this._config = elevenLabsConfigService.getElevenLabsConfig();
        return this._config;
    }

    /**
     * Cleanup old/stale sessions
     */
    _cleanupOldSessions() {
        const now = Date.now();
        const toDelete = [];

        for (const [sessionId, connection] of this.activeConnections.entries()) {
            // A connection registered without a startTime (or with one that was
            // serialized to a string) crashed this timer with an uncaught
            // exception — 21 process-fatal hits in one night's log on one node.
            // Treat an unknown start as "just started": it will age out on a
            // later pass once a real timestamp discrepancy no longer matters.
            const startMs = connection.startTime instanceof Date
                ? connection.startTime.getTime()
                : Number(new Date(connection.startTime || now));
            const age = now - (Number.isFinite(startMs) ? startMs : now);

            // Headless sessions are owned by an explicit on/off toggle, not by a
            // browser lifetime. Reaping a live one on age would silently switch the
            // agent off; they are torn down deterministically by
            // setAgentEnabledForCharacter(id, false) instead.
            if (connection.headless && connection.isActive) continue;

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

                // Stop server mic loop (clear the timer too, or it fires once more)
                connection.serverMicActive = false;
                if (connection.serverMicTimer) {
                    try { clearTimeout(connection.serverMicTimer); } catch (_) { /* noop */ }
                    connection.serverMicTimer = null;
                }
                // Kill the long-lived capture process, else it orphans and holds the mic
                if (connection.micCaptureHandle) {
                    try { connection.micCaptureHandle.stop(); } catch (_) { /* noop */ }
                    connection.micCaptureHandle = null;
                }

                // Stop any Scribe realtime session, else its keepalive interval leaks
                try { this._stopRealtimeSTTSession(sessionId); } catch (_) { /* noop */ }

                // Stop the streaming jaw driver's 50ms timer
                if (connection.characterId != null) {
                    try { jawAnimationService.stopPcmJawStream(connection.characterId); } catch (_) { /* noop */ }
                }

                toDelete.push(sessionId);
            }
        }

        toDelete.forEach(id => {
            this.activeConnections.delete(id);
            // Drop any headless mapping pointing at a reaped session
            for (const [charKey, sid] of this.headlessSessions.entries()) {
                if (sid === id) this.headlessSessions.delete(charKey);
            }
        });

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

        const connection = this._createConnectionRecord(sessionId, ws);

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
                // Settle any question still waiting on this socket, or its HTTP
                // caller would block until the full ask timeout for no reason.
                try { this._abortPendingAsk(sessionId, `socket closed (code=${code})`); } catch (_) { /* noop */ }
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
                    // Fresh visitor, fresh gesture budget — cooldowns and
                    // per-conversation caps are what stop a character repeating
                    // the same move at everyone who walks up.
                    if (connection.characterId != null) {
                        gestureEngineService.startConversation(connection.characterId);
                    }
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

                        // Audio counts as reply activity for a question asked on this
                        // session — a filler line or a reply that is still streaming
                        // must keep the caller waiting rather than settling early.
                        if (c && c._pendingAsk && audioData) {
                            c._pendingAsk.sawAudio = true;
                            this._settlePendingAsk(sessionId);
                        }

                        // Track accumulated audio duration for accurate echo suppression
                        if (c && audioData) {
                            const audioBuffer = Buffer.from(audioData, 'base64');
                            const fmt = c.audioOutputFormat || 'pcm_16000';

                            // Detect the start of a NEW utterance. aiSpeaking is only
                            // cleared on conversation_end/interruption, so relying on it
                            // alone pinned speechStartedAt to the very first reply while
                            // accumulatedAudioMs kept growing across every later turn:
                            // the deadline below then resolved to a time in the PAST and
                            // echo suppression silently stopped working after turn one.
                            // Audio for one utterance arrives back-to-back, so a gap
                            // means a new utterance.
                            const nowMs = Date.now();
                            // Only the first chunk of a NEW utterance closes the turn
                            // clock. Audio still draining from the previous reply would
                            // otherwise land microseconds after the transcript and
                            // report an absurd sub-100ms turn.
                            // The gap check alone identifies the first chunk of a new
                            // reply. Requiring responseAtMs as well silently dropped
                            // the whole measurement whenever audio arrived before the
                            // agent_response text event — which is the normal ordering
                            // for a text-injected question, so that path was never
                            // being timed at all.
                            if (c._turn && !c._turn.firstAudioAtMs
                                && (!c.lastAudioChunkAt || (nowMs - c.lastAudioChunkAt) > 1200)) {
                                c._turn.firstAudioAtMs = nowMs;
                                logTurnLatency(c, sessionId);
                            }
                            const UTTERANCE_GAP_MS = 1200;
                            if (!c.aiSpeaking || (c.lastAudioChunkAt && (nowMs - c.lastAudioChunkAt) > UTTERANCE_GAP_MS)) {
                                // First chunk of a new utterance
                                c.aiSpeaking = true;
                                c.speechStartedAt = nowMs;
                                c.accumulatedAudioMs = 0;
                            }
                            c.lastAudioChunkAt = nowMs;

                            // Calculate chunk duration: PCM16LE mono = 2 bytes/sample
                            let chunkMs;
                            if (fmt.startsWith('pcm_')) {
                                const sampleRate = parseInt(fmt.split('_')[1]) || 16000;
                                chunkMs = (audioBuffer.length / (sampleRate * 2)) * 1000;
                            } else {
                                // MP3: estimate ~128kbps → duration_ms ≈ bytes * 8 / 128
                                chunkMs = (audioBuffer.length * 8 / 128);
                            }
                            c.accumulatedAudioMs += chunkMs;

                            // Model when the speaker will actually FALL SILENT, not when
                            // the bytes arrived. ElevenLabs streams a reply far faster
                            // than real time — a 10s reply can land in 3s — so a deadline
                            // of "first-chunk arrival + total duration" expired while the
                            // speaker was still talking, and the tail of the character's
                            // own reply went back into the agent as guest speech.
                            //
                            // Chunks play serially, so the queue drains at
                            // max(now, previous end) + this chunk's duration.
                            c.playbackEndsAtMs = Math.max(c.playbackEndsAtMs || 0, nowMs) + chunkMs;

                            // Suppress until the speaker is quiet, plus a tail for room
                            // reverb and the capture pipeline's own buffering.
                            // Never move the deadline EARLIER: a new utterance starting while
                            // the previous one is still draining out of the speaker must not
                            // shorten the window and let the tail of it back in as "user" speech.
                            const TAIL_BUFFER_MS = 2500; // extra room reverb tolerance
                            // Apply to EVERY session of this character, not just the
                            // one that received the audio. There is one speaker and one
                            // microphone per character, but there can be several sessions
                            // (a browser client on the conversation page plus a headless
                            // agent, or a one-shot ask socket). Suppressing only the
                            // receiving session left the others' mic loops wide open
                            // during playback, and they transcribed the character's own
                            // reply back as guest speech ("Yes.", "...") — the spurious
                            // follow-up turns seen in the logs.
                            this._suppressMicUntil(c.characterId, c.playbackEndsAtMs + TAIL_BUFFER_MS);
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

                                    // Drive jaw from PCM audio amplitude (if jaw enabled).
                                    // Feed the whole chunk to the streaming driver, which slices it
                                    // into 50ms frames and paces them against playback. Previously
                                    // this took ONE RMS over the entire chunk and issued a single
                                    // servo move per network packet — 4-6 moves across a whole reply,
                                    // which reads as a twitch, not lip sync.
                                    try {
                                        jawAnimationService.driveJawFromPcmStream(c.characterId, audioBuffer, sampleRate).catch(() => {});
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

                            // Start the turn clock at the guest's last voiced frame.
                            connection._turn = {
                                speechEndMs: connection._lastVoiceAtMs || null,
                                transcriptAtMs: Date.now(),
                                responseAtMs: null,
                                firstAudioAtMs: null,
                                text: userText
                            };

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

                    if (connection._turn && !connection._turn.responseAtMs) {
                        connection._turn.responseAtMs = Date.now();
                    }

                    // Feed a question asked via askAgentQuestion() on this live session.
                    if (connection._pendingAsk && responseText) {
                        const p = connection._pendingAsk;
                        p.responseText = p.responseText ? `${p.responseText} ${responseText}` : responseText;
                        this._settlePendingAsk(sessionId);
                    }

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
                        if (connection.characterId != null) {
                            gestureEngineService.endConversation(connection.characterId);
                        }
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
                        // Playback was cut short, so the queued-audio clock is void.
                        connection.playbackEndsAtMs = 0;
                        connection.suppressMicUntilMs = Date.now() + 500; // short tail for reverb
                    }
                    this.sendToClient(sessionId, {
                        type: 'interruption',
                        reason: message.interruption_event?.reason || 'Unknown'
                    });
                    break;

                case 'client_tool_call': {
                    // The agent asked its body to do something. All logic lives in
                    // the gesture service; this is routing only, so whatever shape
                    // the tool protocol takes, the motion rules stay in one place.
                    const call = message.client_tool_call || {};
                    const result = gestureEngineService.handleAgentToolCall(
                        connection?.characterId,
                        call.tool_name,
                        call.parameters || {},
                        { kidMode: connection?.kidMode === true }
                    );
                    // Answer immediately and unconditionally. Motion is
                    // fire-and-forget: making the agent wait on a servo is exactly
                    // the freeze-while-talking failure the gesture spec exists to
                    // prevent, and a gesture that fails must not stall the reply.
                    if (call.tool_call_id && connection?.elevenLabsWs
                        && connection.elevenLabsWs.readyState === WebSocket.OPEN) {
                        connection.elevenLabsWs.send(JSON.stringify({
                            type: 'client_tool_result',
                            tool_call_id: call.tool_call_id,
                            result: result.handled ? 'ok' : 'ignored',
                            is_error: false
                        }));
                    }
                    break;
                }

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
     * A reply is "done" once it has gone quiet for ASK_SETTLE_MS. The agent
     * streams text and audio in fragments with no end-of-reply marker we can
     * rely on, so each new fragment pushes the settle deadline out.
     */
    _settlePendingAsk(sessionId) {
        const c = this.activeConnections.get(sessionId);
        const p = c && c._pendingAsk;
        if (!p) return;
        clearTimeout(p.settleTimer);
        p.settleTimer = setTimeout(() => {
            const still = this.activeConnections.get(sessionId);
            if (!still || still._pendingAsk !== p) return;
            still._pendingAsk = null;
            clearTimeout(p.hardTimer);
            p.resolve({
                success: true,
                response: p.responseText || 'Response received',
                viaSession: sessionId
            });
        }, ASK_SETTLE_MS);
    }

    /**
     * Release any question waiting on this session. Called when the socket dies
     * or the session is torn down, so an in-flight HTTP request settles instead
     * of waiting out its full timeout.
     */
    _abortPendingAsk(sessionId, reason) {
        const c = this.activeConnections.get(sessionId);
        const p = c && c._pendingAsk;
        if (!p) return;
        c._pendingAsk = null;
        clearTimeout(p.settleTimer);
        clearTimeout(p.hardTimer);
        p.resolve({
            success: !!p.responseText,
            response: p.responseText || '',
            viaSession: sessionId,
            aborted: reason || 'session ended'
        });
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
     * Build a connection record. Shared by browser clients and headless
     * (server-initiated) agent sessions so the two can never drift apart.
     * @param {string} sessionId
     * @param {object|null} clientWs - null for headless sessions
     */
    _createConnectionRecord(sessionId, clientWs) {
        return {
            sessionId,
            clientWs: clientWs || null,
            elevenLabsWs: null,
            agentId: null,
            isActive: false,
            startTime: new Date(),
            characterId: null,
            outputMode: 'server',
            micSource: 'server',
            transcriptionOnly: false,
            serverMicTimer: null,
            serverMicActive: false,
            sttLastAt: 0,
            sttPcm: Buffer.alloc(0),
            _dbgLastTs: 0,
            sttLanguage: null,
            suppressMicUntilMs: 0,
            aiSpeaking: false,
            speechStartedAt: 0,
            accumulatedAudioMs: 0,
            // Wall-clock time the queued reply audio is expected to finish playing.
            playbackEndsAtMs: 0,
            audioBuffer: [],
            audioPlaying: false,
            realtimeSTTSession: null,
            useRealtimeSTT: true,
            headless: false,
            consecutiveErrors: 0,
            maxConsecutiveErrors: 10,
            lastError: null,
            transcriptCount: 0,
            audioChunkCount: 0
        };
    }

    /**
     * Wait until a connection's agent socket reports ready, so callers get a
     * real result instead of an optimistic one. Resolves false on timeout.
     */
    async _waitForAgentReady(sessionId, timeoutMs = 15000) {
        const deadline = Date.now() + timeoutMs;
        while (Date.now() < deadline) {
            const c = this.activeConnections.get(sessionId);
            if (!c) return false;
            if (c.isActive && c.elevenLabsWs && c.elevenLabsWs.readyState === WebSocket.OPEN) return true;
            await new Promise(r => setTimeout(r, 100));
        }
        return false;
    }

    /**
     * Start or stop a headless (no browser client) conversational agent session
     * for a character. This is what makes the /conversation/api/ai-on toggle real.
     *
     * Enable is idempotent: a second enable while a live session exists is a
     * no-op rather than a second agent socket + second mic loop.
     *
     * @param {number|string} characterId
     * @param {boolean} enabled
     * @returns {Promise<{success:boolean, enabled:boolean, sessionId?:string, agentId?:string, error?:string}>}
     */
    async setAgentEnabledForCharacter(characterId, enabled) {
        if (characterId == null) {
            return { success: false, enabled: false, error: 'No character selected' };
        }
        const key = String(characterId);

        // ---- DISABLE ----------------------------------------------------
        if (!enabled) {
            const sessionId = this.headlessSessions.get(key);
            if (!sessionId) {
                return { success: true, enabled: false, alreadyStopped: true };
            }
            // Remove the mapping first so a concurrent toggle cannot re-enter.
            this.headlessSessions.delete(key);
            await this._teardownHeadlessSession(sessionId);
            console.log(`🛑 Headless agent session stopped for character ${key} (${sessionId})`);
            return { success: true, enabled: false, sessionId };
        }

        // ---- ENABLE -----------------------------------------------------
        const existingId = this.headlessSessions.get(key);
        if (existingId) {
            const existing = this.activeConnections.get(existingId);
            if (existing && existing.isActive) {
                console.log(`ℹ️ Headless agent already running for character ${key} (${existingId})`);
                return { success: true, enabled: true, sessionId: existingId, agentId: existing.agentId, alreadyRunning: true };
            }
            // Stale mapping (session died) — clean it up before starting fresh.
            this.headlessSessions.delete(key);
            await this._teardownHeadlessSession(existingId);
        }

        let agentId = null;
        try {
            agentId = await getAgentIdForCharacter(characterId);
        } catch (_) { /* handled below */ }
        if (!agentId) {
            return { success: false, enabled: false, error: `No ElevenLabs agent configured for character ${key}` };
        }

        const sessionId = this.generateSessionId();
        const connection = this._createConnectionRecord(sessionId, null);
        connection.characterId = Number(characterId);
        connection.headless = true;
        // The agent performs its own ASR; a parallel Scribe/batch STT stream would
        // only feed a browser client that does not exist here.
        connection.useRealtimeSTT = false;
        this.activeConnections.set(sessionId, connection);
        this.headlessSessions.set(key, sessionId);

        try {
            await this.startConversation(sessionId, agentId);
            const ready = await this._waitForAgentReady(sessionId);
            if (!ready) {
                this.headlessSessions.delete(key);
                await this._teardownHeadlessSession(sessionId);
                return { success: false, enabled: false, error: 'Timed out connecting to ElevenLabs agent' };
            }
            await this._startServerMicLoop(sessionId);
            console.log(`✅ Headless agent session started for character ${key} (${sessionId}, agent ${agentId})`);
            return { success: true, enabled: true, sessionId, agentId };
        } catch (e) {
            this.headlessSessions.delete(key);
            await this._teardownHeadlessSession(sessionId);
            return { success: false, enabled: false, error: e && e.message ? e.message : 'Failed to start agent' };
        }
    }

    /**
     * Fully tear down a headless session: mic loop, STT session, agent socket,
     * timers and the activeConnections entry. Safe to call repeatedly.
     */
    async _teardownHeadlessSession(sessionId) {
        // Settle any in-flight question first so its caller is not left hanging
        // on a session we are about to delete.
        try { this._abortPendingAsk(sessionId, 'agent disabled'); } catch (_) { /* noop */ }
        try { this._stopServerMicLoop(sessionId, true); } catch (_) { /* noop */ }
        try { this._stopRealtimeSTTSession(sessionId); } catch (_) { /* noop */ }
        try { await this.endConversation(sessionId); } catch (_) { /* noop */ }

        const connection = this.activeConnections.get(sessionId);
        if (connection) {
            connection.isActive = false;
            connection.serverMicActive = false;
            if (connection.serverMicTimer) {
                try { clearTimeout(connection.serverMicTimer); } catch (_) { /* noop */ }
                connection.serverMicTimer = null;
            }
            // Drop buffered audio so the playback loop exits promptly.
            connection.audioBuffer = [];
            if (connection.elevenLabsWs) {
                try {
                    if (connection.elevenLabsWs.readyState === WebSocket.OPEN ||
                        connection.elevenLabsWs.readyState === WebSocket.CONNECTING) {
                        connection.elevenLabsWs.close();
                    }
                } catch (_) { /* noop */ }
                connection.elevenLabsWs = null;
            }
            if (connection.characterId != null) {
                try { await serverPlaybackService.stopStream({ characterId: connection.characterId }); } catch (_) { /* noop */ }
                // Stop the streaming jaw driver, else its 50ms timer outlives the socket.
                try { jawAnimationService.stopPcmJawStream(connection.characterId); } catch (_) { /* noop */ }
            }
        }
        this.activeConnections.delete(sessionId);
    }

    /**
     * True if a headless agent session is currently live for a character.
     */
    isAgentEnabledForCharacter(characterId) {
        if (characterId == null) return false;
        const sessionId = this.headlessSessions.get(String(characterId));
        if (!sessionId) return false;
        const c = this.activeConnections.get(sessionId);
        return !!(c && c.isActive);
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

        // Handles ONE frame of microphone PCM16LE. Driven by the continuous capture
        // stream below rather than by a polling timer, so it now sees every frame
        // instead of only the ~34% that survived the old spawn-per-tick gaps.
        const handleFrame = async (raw) => {
            if (!connection.serverMicActive) return;
            // Check if Scribe v2 Realtime session is connected
            const realtimeReady = !!(connection.realtimeSTTSession && connection.realtimeSTTSession.isConnected);
            try {
                const deviceId = connection._lastDevId || 'default';
                if (raw && raw.length) {

                    // Current time and suppression check (avoid echo during server playback)
                    const now = Date.now();
                    const suppressed = connection.suppressMicUntilMs && (now < connection.suppressMicUntilMs);

                    // Frame energy, computed BEFORE anything is forwarded so it can
                    // gate the agent stream. (It used to be computed further down,
                    // after the send, so it could only ever be used for reporting.)
                    let frameRms = 0;
                    try {
                        let sumSq = 0;
                        const n = Math.floor(raw.length / 2);
                        for (let si = 0; si < n; si++) {
                            const s = raw.readInt16LE(si * 2);
                            sumSq += s * s;
                        }
                        frameRms = Math.min(1, Math.sqrt(sumSq / (n || 1)) / 32768);
                    } catch (_) { frameRms = 0; }

                    // Track the room's noise floor so the voice gate adapts to the
                    // install instead of assuming a level. Latches onto any quieter
                    // frame immediately and creeps upward slowly, so a single cough
                    // cannot raise it but a genuinely noisier room is followed.
                    // Never updated while suppressed — the character's own voice must
                    // not be learned as "silence".
                    if (!suppressed) {
                        connection._noiseFloor = (connection._noiseFloor == null)
                            ? frameRms
                            : Math.min(frameRms, connection._noiseFloor * 1.0008 + 0.00002);
                    }
                    const voiceThreshold = Math.max(
                        VOICE_ACTIVITY_RMS,
                        (connection._noiseFloor || 0) * VOICE_GATE_MARGIN
                    );

                    if (!suppressed && frameRms > voiceThreshold) {
                        connection._lastVoiceAtMs = now;
                    }

                    // Voice gate: forward to the agent only while the guest is
                    // actually making sound, plus a short hangover to bridge the
                    // pauses inside a sentence.
                    //
                    // Without this, an idle-but-enabled agent receives an unbroken
                    // stream of room tone — and the idle micro-movement servos are
                    // right next to the microphone. The agent's ASR hallucinates
                    // short tokens on that ("Yes.", "..."), each of which becomes a
                    // spurious guest turn the character then answers. Echo
                    // suppression alone cannot catch these because they occur while
                    // the character is silent, so no suppression window is armed.
                    const voiceGateOpen = !!(connection._lastVoiceAtMs &&
                        (now - connection._lastVoiceAtMs) < MIC_GATE_HANGOVER_MS);

                    // 1) Stream to the ConvAI agent. The stream must never go absent:
                    //    the turn-detection model runs on a continuous audio timeline,
                    //    and simply not sending frames leaves it unable to decide the
                    //    turn ended (measured: replies took 9-13s, or never came).
                    //    So when the gate is closed we substitute synthetic room-floor
                    //    audio instead of the real microphone. The agent keeps a
                    //    continuous timeline, while room tone, servo whine and the
                    //    character's own voice never reach its ASR to be hallucinated
                    //    into spurious guest turns.
                    if (!connection.parrotMode && connection.elevenLabsWs &&
                        connection.elevenLabsWs.readyState === WebSocket.OPEN) {
                        const gated = MIC_VOICE_GATE_ENABLED ? !voiceGateOpen : false;
                        const payload = (!suppressed && !gated)
                            ? raw.toString('base64')
                            : _floorFrameB64(raw.length);
                        try {
                            connection.elevenLabsWs.send(JSON.stringify({ user_audio_chunk: payload }));
                        } catch (_) { /* non-fatal */ }
                    }

                    // 2) Stream to Scribe v2 Realtime for live STT (unless suppressed)
                    if (!suppressed && realtimeReady) {
                        // Send raw PCM directly to Scribe v2 Realtime — no batch polling needed!
                        connection.realtimeSTTSession.sendPCMBuffer(raw);
                    }
                    // 2b) Fallback: Batch STT if Scribe v2 Realtime is not available.
                    //     Skipped for headless sessions: the agent does its own ASR and
                    //     there is no browser client to receive transcripts, so this would
                    //     burn STT credits every 2.5s for nothing.
                    else if (!suppressed && !realtimeReady && !connection.headless && (!connection.sttLastAt || (now - connection.sttLastAt) >= 2500)) {
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
                    } else if (!suppressed && !realtimeReady && !connection.headless) {
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

                    // 3) Report the frame level to the browser VU meter. The RMS and
                    //    the _lastVoiceAtMs timestamp are computed at the top of this
                    //    handler, because the voice gate needs them before deciding
                    //    whether to forward the frame.
                    const rmsLevel = frameRms;

                    // Send audio level to browser every ~500ms (every other tick at 250ms)
                    if (!connection._vuLastTs || (now - connection._vuLastTs) >= 500) {
                        connection._vuLastTs = now;
                        try { this.sendToClient(sessionId, { type: 'audio_level', level: Math.round(rmsLevel * 100) }); } catch (_) { }
                    }

                    // 3b) Server-side breadcrumb for the mic path. Logged only on a
                    //     suppression transition or when the guest is actually audible,
                    //     and at most once a second, so it stays off the SD card during
                    //     idle hours but is there when a turn goes missing.
                    const loud = frameRms > voiceThreshold;
                    if (suppressed !== connection._dbgWasSuppressed ||
                        (loud && (!connection._dbgVoiceTs || (now - connection._dbgVoiceTs) >= 1000))) {
                        if (loud) connection._dbgVoiceTs = now;
                        connection._dbgWasSuppressed = suppressed;
                        const sentReal = !suppressed && (!MIC_VOICE_GATE_ENABLED || voiceGateOpen);
                        console.log(`🎤 [mic] session=${sessionId} rms=${frameRms.toFixed(3)} ` +
                            `floor=${(connection._noiseFloor || 0).toFixed(3)} gate=${voiceThreshold.toFixed(3)} ` +
                            `suppressed=${!!suppressed} forMs=${suppressed ? Math.round(connection.suppressMicUntilMs - now) : 0} ` +
                            `sentReal=${sentReal}`);
                    }

                    // 4) Periodic client breadcrumb with device and bytes captured (once per second)
                    if (!connection._dbgLastTs || (now - connection._dbgLastTs) >= 1000) {
                        connection._dbgLastTs = now;
                        try { this.sendToClient(sessionId, { type: 'debug', originalType: 'server_mic_tick', data: { deviceId, bytes: raw.length, suppressed: !!suppressed, realtimeSTT: realtimeReady } }); } catch (_) { }
                    }
                }
            } catch (_) { /* ignore per-frame errors */ }
        };

        // Resolve the capture device once. The stream stays open for the life of
        // the session, so changing microphones now requires restarting the session
        // (previously it was re-resolved every tick, which is what made each tick
        // pay full device-resolution + process-spawn cost).
        let deviceId = 'default';
        if (connection.characterId != null) {
            try { deviceId = await getMicrophoneDeviceForCharacter(connection.characterId); } catch (_) { deviceId = 'default'; }
        } else {
            // microphoneDeviceId is what the operator's mic dropdown writes, and it is
            // the only device key getSTTConfig() actually surfaces — its return is an
            // explicit literal that never carries `deviceId`, so the old
            // `cfg.deviceId || cfg.microphoneDeviceId` read could only ever resolve to
            // the second operand. The raw stt-config.json on some nodes still holds a
            // stale `deviceId` (e.g. "pulse"); it is inert HERE, but see KNOWN-BUGS for
            // the capture paths that read the raw file directly.
            try { const cfg = await getSTTConfig(); deviceId = cfg.microphoneDeviceId || 'default'; } catch (_) { deviceId = 'default'; }
        }
        connection._lastDevId = deviceId;
        try { this.sendToClient(sessionId, { type: 'debug', originalType: 'server_mic_device', data: { deviceId } }); } catch (_) { }

        // Re-frame the continuous byte stream into steady 250ms frames (8000 bytes
        // at 16kHz mono PCM16) so every downstream consumer keeps the cadence it
        // was written for — only the silence between chunks is gone.
        const FRAME_BYTES = 8000;
        let pending = Buffer.alloc(0);

        connection.micCaptureHandle = serverSTTListener.startContinuousCapture(deviceId, (buf) => {
            if (!connection.serverMicActive || !connection.isActive) return;
            pending = pending.length ? Buffer.concat([pending, buf]) : buf;
            while (pending.length >= FRAME_BYTES) {
                const frame = Buffer.from(pending.subarray(0, FRAME_BYTES));
                pending = pending.subarray(FRAME_BYTES);
                handleFrame(frame).catch(() => { });
            }
        }, (err) => {
            console.error(`🎤 Continuous mic capture failed for ${sessionId}: ${err && err.message}`);
        });

        console.log(`🎤 Continuous mic capture started for ${sessionId} (device=${deviceId})`);
    }

    _stopServerMicLoop(sessionId, sendEos) {
        const connection = this.activeConnections.get(sessionId);
        if (!connection) return;
        connection.serverMicActive = false;
        if (connection.serverMicTimer) { try { clearTimeout(connection.serverMicTimer); } catch (_) { } connection.serverMicTimer = null; }
        // Kill the long-lived capture process, or it keeps holding the microphone
        // (and streaming into a dead session) after the agent is switched off.
        if (connection.micCaptureHandle) {
            try { connection.micCaptureHandle.stop(); } catch (_) { }
            connection.micCaptureHandle = null;
        }
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
                // Character-wide, not per-session: this loop belongs to a one-shot
                // ask socket, but the audio comes out of the shared speaker and any
                // other session's mic loop would otherwise hear and transcribe it.
                const chunkFmt = c.audioOutputFormat || 'pcm_16000';
                if (chunkFmt.startsWith('pcm_')) {
                    const sr = parseInt(chunkFmt.split('_')[1]) || 16000;
                    const durationMs = (audioBuffer.length / (sr * 2)) * 1000;
                    this._suppressMicUntil(c.characterId, Date.now() + durationMs + 1500);
                } else {
                    this._suppressMicUntil(c.characterId, Date.now() + 3000);
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
        this._suppressMicUntil(characterId, Date.now() + durationMs);
    }

    /**
     * Hold the mic closed on every session belonging to a character until an
     * absolute deadline. One character has one speaker and one microphone, so
     * echo suppression has to be character-wide: a per-session deadline leaves
     * any other session's mic loop streaming the character's own voice back to
     * the agent as if the guest had spoken.
     *
     * The deadline only ever moves later, never earlier, so a new utterance
     * starting while the previous one is still draining out of the speaker
     * cannot shorten the window.
     */
    _suppressMicUntil(characterId, untilMs) {
        if (!Number.isFinite(untilMs)) return;
        for (const [, connection] of this.activeConnections) {
            if (characterId == null || Number(connection.characterId) === Number(characterId)) {
                connection.suppressMicUntilMs = Math.max(connection.suppressMicUntilMs || 0, untilMs);
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
     * Find a live agent session for a character that a question can be asked on.
     * Prefers the headless session (the /conversation/api/ai-on toggle); falls back
     * to any active session — e.g. a browser client on the conversation page — that
     * already has an initiated agent socket.
     *
     * Returns a sessionId or null. Ephemeral ask-sockets are never returned: they
     * are one-shot and are torn down as soon as their own question resolves.
     */
    _findLiveAgentSession(characterId) {
        if (characterId == null) return null;
        const usable = (sid) => {
            const c = this.activeConnections.get(sid);
            return !!(c && c.isActive && c.conversationReady && !c.ephemeralAsk &&
                c.elevenLabsWs && c.elevenLabsWs.readyState === WebSocket.OPEN);
        };

        const headlessId = this.headlessSessions.get(String(characterId));
        if (headlessId && usable(headlessId)) return headlessId;

        for (const [sid, c] of this.activeConnections.entries()) {
            if (Number(c.characterId) === Number(characterId) && usable(sid)) return sid;
        }
        return null;
    }

    /**
     * Ask a question on an already-open agent session and await the reply.
     *
     * Why this exists: opening a socket per question cost a signed-URL fetch, a TLS
     * handshake, a conversation_initiation round trip AND the agent's entire spoken
     * first_message (~4-5s of greeting the guest has to sit through) before the
     * answer even started — and it threw away all conversation memory every turn.
     *
     * Questions are serialised per connection through _askChain so two concurrent
     * callers cannot interleave their replies onto each other's promise.
     *
     * @returns {Promise<{success:boolean, response:string, viaSession:string}>}
     * @throws {Error} with .beforeSend === true only if nothing was sent, so the
     *         caller may safely fall back without the agent hearing the question twice.
     */
    async _askOnLiveSession(sessionId, text) {
        const connection = this.activeConnections.get(sessionId);
        if (!connection) {
            const e = new Error('Session disappeared'); e.beforeSend = true; throw e;
        }

        const prior = connection._askChain || Promise.resolve();
        let release;
        connection._askChain = new Promise(r => { release = r; });
        try { await prior; } catch (_) { /* a previous question failing must not poison the queue */ }

        try {
            // Re-check after waiting our turn: the socket may have died in the queue.
            const c = this.activeConnections.get(sessionId);
            if (!c || !c.isActive || !c.conversationReady ||
                !c.elevenLabsWs || c.elevenLabsWs.readyState !== WebSocket.OPEN) {
                const e = new Error('Agent socket not open'); e.beforeSend = true; throw e;
            }

            const pending = {
                text,
                responseText: '',
                sawAudio: false,
                resolve: null,
                settleTimer: null,
                hardTimer: null
            };
            const done = new Promise(res => { pending.resolve = res; });
            c._pendingAsk = pending;

            // Start the turn clock so the same latency table covers this path.
            // No guest speech is involved in a text question, so there is no
            // speech-end to measure from. Leaving _lastVoiceAtMs in here reported
            // whatever the mic last heard — usually the tail of the PREVIOUS reply —
            // as this turn's speech-end, inventing several seconds of latency that
            // never happened.
            c._turn = {
                speechEndMs: null,
                transcriptAtMs: Date.now(),
                responseAtMs: null,
                firstAudioAtMs: null,
                source: 'ask-ai',
                text
            };

            try {
                c.elevenLabsWs.send(JSON.stringify({ type: 'user_message', text }));
            } catch (err) {
                c._pendingAsk = null;
                const e = new Error(`Send failed: ${err.message}`); e.beforeSend = true; throw e;
            }

            // The turn-detection model commits a turn on an audio edge, not on the
            // text frame. With the server mic loop running one arrives on its own;
            // when the mic is suppressed or idle, nothing would ever close the turn
            // and the agent stays silent forever (measured: no reply after 70s).
            // A short frame of room-floor audio gives it the edge it needs.
            setTimeout(() => {
                try {
                    const still = this.activeConnections.get(sessionId);
                    if (still && still._pendingAsk === pending &&
                        still.elevenLabsWs && still.elevenLabsWs.readyState === WebSocket.OPEN) {
                        still.elevenLabsWs.send(JSON.stringify({ user_audio_chunk: TURN_COMMIT_FRAME_B64 }));
                    }
                } catch (_) { /* non-fatal */ }
            }, 150);

            // Hard ceiling so an HTTP caller can never hang on a silent agent.
            pending.hardTimer = setTimeout(() => {
                const still = this.activeConnections.get(sessionId);
                if (still && still._pendingAsk === pending) still._pendingAsk = null;
                pending.resolve({
                    success: true,
                    response: pending.responseText || 'Response received',
                    viaSession: sessionId,
                    timedOut: true
                });
            }, ASK_REPLY_TIMEOUT_MS);

            const result = await done;
            clearTimeout(pending.hardTimer);
            clearTimeout(pending.settleTimer);
            return result;
        } finally {
            release();
        }
    }

    /**
     * Send a text question to an agent and play the response through character speaker.
     *
     * Uses the character's live agent session when one exists (fast: no handshake,
     * no repeated greeting, conversation memory preserved across turns) and only
     * opens a throwaway socket when nothing is running.
     *
     * @param {string} agentId - ElevenLabs agent ID
     * @param {string} text - Question text
     * @param {number} characterId - Character ID for audio playback
     * @returns {Promise<{success: boolean, response: string}>}
     */
    async askAgentQuestion(agentId, text, characterId) {
        const liveSession = this._findLiveAgentSession(characterId);
        if (liveSession) {
            try {
                const r = await this._askOnLiveSession(liveSession, text);
                console.log(`⚡ Answered on live session ${liveSession} (no new socket)`);
                return r;
            } catch (e) {
                if (!e || !e.beforeSend) {
                    // The agent already has the question; asking again on a new socket
                    // would make the character answer twice.
                    throw e;
                }
                console.warn(`⚠️ Live session ${liveSession} unusable (${e.message}) — opening a one-shot socket`);
            }
        }
        return this._askAgentQuestionEphemeral(agentId, text, characterId);
    }

    /**
     * Fallback path: open a dedicated socket for one question. Only used when the
     * character has no live agent session.
     */
    async _askAgentQuestionEphemeral(agentId, text, characterId) {
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
                    suppressMicUntilMs: 0,
                    // Marks this as a one-shot socket so _findLiveAgentSession
                    // never routes a later question onto a connection that is
                    // about to be torn down.
                    ephemeralAsk: true
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
                        if (WS_DEBUG && message.type !== 'ping' && message.type !== 'audio') {
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
                    } else {
                        // Socket never reached OPEN (stalled in CONNECTING). Force
                        // teardown and settle so the HTTP request can't hang forever
                        // and the session isn't leaked in activeConnections.
                        try { elevenLabsWs.terminate(); } catch (_) {}
                        connection.isActive = false;
                        this.activeConnections.delete(sessionId);
                        resolve({ success: true, response: responseText || 'Response received' });
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
