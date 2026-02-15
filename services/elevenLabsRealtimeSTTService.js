/**
 * MonsterBox - ElevenLabs Scribe v2 Realtime Speech-to-Text Service
 * 
 * WebSocket-based real-time STT using the Scribe v2 Realtime model.
 * Streams PCM audio chunks and receives partial/committed transcripts
 * with ~150ms latency and built-in VAD (Voice Activity Detection).
 * 
 * Architecture:
 *   Mic (arecord) → PCM16LE mono 16kHz → base64 → Scribe v2 Realtime WS
 *                                                       ↓
 *                                            partial_transcript  (live, interim)
 *                                            committed_transcript (final, after VAD silence)
 *                                                       ↓
 *                                            EventEmitter → consumers (conversation, UI, agents)
 * 
 * @see https://elevenlabs.io/docs/api-reference/speech-to-text/v-1-speech-to-text-realtime
 */

import { EventEmitter } from 'events';
import WebSocket from 'ws';
import elevenLabsConfigService from './elevenLabsConfigService.js';

// Default configuration for Scribe v2 Realtime
const DEFAULTS = {
    MODEL_ID: 'scribe_v2_realtime',
    AUDIO_FORMAT: 'pcm_16000',
    SAMPLE_RATE: 16000,
    COMMIT_STRATEGY: 'vad',
    VAD_SILENCE_THRESHOLD_SECS: 1.5,
    VAD_THRESHOLD: 0.4,
    MIN_SPEECH_DURATION_MS: 100,
    MIN_SILENCE_DURATION_MS: 100,
    INCLUDE_TIMESTAMPS: true,
    INCLUDE_LANGUAGE_DETECTION: true,
    RECONNECT_DELAY_MS: 2000,
    MAX_RECONNECT_ATTEMPTS: 5,
    SESSION_TIMEOUT_MS: 3600000,       // 1 hour max
    KEEPALIVE_INTERVAL_MS: 30000,      // 30s ping
    WS_URL: 'wss://api.elevenlabs.io/v1/speech-to-text/realtime'
};

/**
 * Represents a single Scribe v2 Realtime STT session
 */
class RealtimeSTTSession extends EventEmitter {
    /**
     * @param {Object} options
     * @param {string} options.apiKey - ElevenLabs API key
     * @param {string} [options.languageCode] - ISO 639-1/3 language code (auto-detect if omitted)
     * @param {string} [options.commitStrategy] - 'vad' or 'manual'
     * @param {number} [options.vadSilenceThresholdSecs] - Silence threshold for VAD (0.3-3)
     * @param {number} [options.vadThreshold] - Voice activity threshold (0.1-0.9)
     * @param {boolean} [options.includeTimestamps] - Include word-level timestamps
     * @param {boolean} [options.includeLanguageDetection] - Include detected language
     * @param {string} [options.previousText] - Context from previous turn (<50 chars)
     * @param {string} [options.sessionId] - Optional session identifier for logging
     */
    constructor(options = {}) {
        super();

        this.apiKey = options.apiKey;
        this.sessionId = options.sessionId || `scribe_${Date.now()}_${Math.random().toString(36).substr(2, 6)}`;
        this.languageCode = options.languageCode || null;
        this.commitStrategy = options.commitStrategy || DEFAULTS.COMMIT_STRATEGY;
        this.vadSilenceThresholdSecs = options.vadSilenceThresholdSecs || DEFAULTS.VAD_SILENCE_THRESHOLD_SECS;
        this.vadThreshold = options.vadThreshold || DEFAULTS.VAD_THRESHOLD;
        this.includeTimestamps = options.includeTimestamps !== undefined ? options.includeTimestamps : DEFAULTS.INCLUDE_TIMESTAMPS;
        this.includeLanguageDetection = options.includeLanguageDetection !== undefined ? options.includeLanguageDetection : DEFAULTS.INCLUDE_LANGUAGE_DETECTION;
        this.previousText = options.previousText || null;

        // State
        this.ws = null;
        this.isConnected = false;
        this.isConnecting = false;
        this.serverSessionId = null;     // Session ID from ElevenLabs
        this.serverConfig = null;        // Config echoed back by server
        this.reconnectAttempts = 0;
        this.maxReconnectAttempts = options.maxReconnectAttempts || DEFAULTS.MAX_RECONNECT_ATTEMPTS;
        this._keepaliveTimer = null;
        this._sessionTimer = null;
        this._hasSentFirstChunk = false;

        // Stats
        this.stats = {
            chunkssSent: 0,
            partialTranscripts: 0,
            committedTranscripts: 0,
            bytesStreamed: 0,
            startTime: null,
            lastActivityTime: null,
            errors: 0
        };
    }

    /**
     * Build the WebSocket URL with query parameters
     */
    _buildUrl() {
        const params = new URLSearchParams();
        params.set('model_id', DEFAULTS.MODEL_ID);
        params.set('include_timestamps', String(this.includeTimestamps));
        params.set('include_language_detection', String(this.includeLanguageDetection));
        params.set('audio_format', DEFAULTS.AUDIO_FORMAT);
        params.set('commit_strategy', this.commitStrategy);

        if (this.commitStrategy === 'vad') {
            params.set('vad_silence_threshold_secs', String(this.vadSilenceThresholdSecs));
            params.set('vad_threshold', String(this.vadThreshold));
            params.set('min_speech_duration_ms', String(DEFAULTS.MIN_SPEECH_DURATION_MS));
            params.set('min_silence_duration_ms', String(DEFAULTS.MIN_SILENCE_DURATION_MS));
        }

        if (this.languageCode) {
            params.set('language_code', this.languageCode);
        }

        return `${DEFAULTS.WS_URL}?${params.toString()}`;
    }

    /**
     * Connect to the Scribe v2 Realtime WebSocket
     * @returns {Promise<void>}
     */
    async connect() {
        if (this.isConnected || this.isConnecting) {
            console.log(`🎤 [${this.sessionId}] Already connected/connecting`);
            return;
        }

        this.isConnecting = true;
        this._hasSentFirstChunk = false;

        const url = this._buildUrl();
        console.log(`🎤 [${this.sessionId}] Connecting to Scribe v2 Realtime...`);
        console.log(`   URL: ${url.replace(/xi-api-key=[^&]+/, 'xi-api-key=***')}`);

        return new Promise((resolve, reject) => {
            try {
                this.ws = new WebSocket(url, {
                    headers: {
                        'xi-api-key': this.apiKey
                    }
                });

                this.ws.on('open', () => {
                    console.log(`✅ [${this.sessionId}] Connected to Scribe v2 Realtime`);
                    this.isConnected = true;
                    this.isConnecting = false;
                    this.reconnectAttempts = 0;
                    this.stats.startTime = Date.now();
                    this.stats.lastActivityTime = Date.now();

                    // Start keepalive
                    this._startKeepalive();

                    // Start session timeout
                    this._sessionTimer = setTimeout(() => {
                        console.log(`⏰ [${this.sessionId}] Session timeout reached, disconnecting`);
                        this.disconnect('session_timeout');
                    }, DEFAULTS.SESSION_TIMEOUT_MS);

                    this.emit('connected', { sessionId: this.sessionId });
                    resolve();
                });

                this.ws.on('message', (data) => {
                    this._handleMessage(data);
                });

                this.ws.on('close', (code, reason) => {
                    const reasonStr = reason ? reason.toString() : 'unknown';
                    console.log(`🔌 [${this.sessionId}] WebSocket closed: code=${code}, reason=${reasonStr}`);
                    this._cleanup();
                    this.emit('disconnected', { code, reason: reasonStr, sessionId: this.sessionId });

                    // Auto-reconnect on unexpected close (not user-initiated)
                    if (code !== 1000 && this.reconnectAttempts < this.maxReconnectAttempts) {
                        this._scheduleReconnect();
                    }
                });

                this.ws.on('error', (error) => {
                    console.error(`❌ [${this.sessionId}] WebSocket error:`, error.message);
                    this.stats.errors++;
                    this.isConnecting = false;
                    this.emit('error', { error: error.message, sessionId: this.sessionId });

                    if (!this.isConnected) {
                        reject(error);
                    }
                });
            } catch (error) {
                this.isConnecting = false;
                console.error(`❌ [${this.sessionId}] Connection failed:`, error.message);
                reject(error);
            }
        });
    }

    /**
     * Handle incoming WebSocket messages from Scribe v2 Realtime
     */
    _handleMessage(data) {
        try {
            const message = JSON.parse(data.toString());
            this.stats.lastActivityTime = Date.now();

            switch (message.message_type) {
                case 'session_started': {
                    this.serverSessionId = message.session_id;
                    this.serverConfig = message.config;
                    console.log(`🎯 [${this.sessionId}] Session started: server_session=${message.session_id}`);
                    console.log(`   Config: format=${message.config?.audio_format}, rate=${message.config?.sample_rate}, vad_silence=${message.config?.vad_silence_threshold_secs}s`);
                    this.emit('session_started', {
                        sessionId: this.sessionId,
                        serverSessionId: message.session_id,
                        config: message.config
                    });
                    break;
                }

                case 'partial_transcript': {
                    const text = message.text || '';
                    if (text) {
                        this.stats.partialTranscripts++;
                        this.emit('partial_transcript', {
                            text,
                            sessionId: this.sessionId,
                            timestamp: Date.now()
                        });
                    }
                    break;
                }

                case 'committed_transcript': {
                    const text = message.text || '';
                    if (text) {
                        this.stats.committedTranscripts++;
                        console.log(`📝 [${this.sessionId}] Committed: "${text}"`);
                        this.emit('committed_transcript', {
                            text,
                            sessionId: this.sessionId,
                            timestamp: Date.now()
                        });
                    }
                    break;
                }

                case 'committed_transcript_with_timestamps': {
                    const text = message.text || '';
                    const words = message.words || [];
                    const languageCode = message.language_code || null;
                    if (text) {
                        console.log(`📝 [${this.sessionId}] Committed (timestamps): "${text}" [${words.length} words, lang=${languageCode}]`);
                        this.emit('committed_transcript_with_timestamps', {
                            text,
                            words,
                            languageCode,
                            sessionId: this.sessionId,
                            timestamp: Date.now()
                        });
                    }
                    break;
                }

                default: {
                    // Check for error types
                    if (message.message_type && (
                        message.message_type.includes('error') ||
                        message.message_type === 'auth_error' ||
                        message.message_type === 'quota_exceeded' ||
                        message.message_type === 'commit_throttled' ||
                        message.message_type === 'rate_limited' ||
                        message.message_type === 'resource_exhausted' ||
                        message.message_type === 'session_time_limit_exceeded' ||
                        message.message_type === 'chunk_size_exceeded' ||
                        message.message_type === 'insufficient_audio_activity'
                    )) {
                        const errorMsg = message.message || message.text || message.message_type;
                        console.error(`❌ [${this.sessionId}] Scribe error (${message.message_type}): ${errorMsg}`);
                        this.stats.errors++;
                        this.emit('scribe_error', {
                            type: message.message_type,
                            message: errorMsg,
                            sessionId: this.sessionId
                        });
                    }
                    break;
                }
            }
        } catch (error) {
            console.error(`❌ [${this.sessionId}] Error parsing message:`, error.message);
        }
    }

    /**
     * Send an audio chunk (PCM16LE mono 16kHz, base64 encoded)
     * @param {string} audioBase64 - Base64-encoded PCM16LE mono 16kHz audio
     * @param {Object} [options]
     * @param {boolean} [options.commit] - Force commit after this chunk (manual strategy)
     * @param {number} [options.sampleRate] - Sample rate (default 16000)
     */
    sendAudioChunk(audioBase64, options = {}) {
        if (!this.isConnected || !this.ws || this.ws.readyState !== WebSocket.OPEN) {
            return false;
        }

        const message = {
            message_type: 'input_audio_chunk',
            audio_base_64: audioBase64,
            sample_rate: options.sampleRate || DEFAULTS.SAMPLE_RATE
        };

        // Send previous_text context with first chunk only
        if (!this._hasSentFirstChunk && this.previousText) {
            message.previous_text = this.previousText;
            this._hasSentFirstChunk = true;
        }

        // Manual commit flag
        if (options.commit) {
            message.commit = true;
        }

        try {
            this.ws.send(JSON.stringify(message));
            this.stats.chunkssSent++;
            this.stats.bytesStreamed += audioBase64.length; // approximate
            return true;
        } catch (error) {
            console.error(`❌ [${this.sessionId}] Error sending audio chunk:`, error.message);
            this.stats.errors++;
            return false;
        }
    }

    /**
     * Send raw PCM buffer as audio chunk
     * @param {Buffer} pcmBuffer - Raw PCM16LE mono 16kHz buffer
     * @param {Object} [options] - Same as sendAudioChunk options
     */
    sendPCMBuffer(pcmBuffer, options = {}) {
        if (!pcmBuffer || pcmBuffer.length === 0) return false;
        return this.sendAudioChunk(pcmBuffer.toString('base64'), options);
    }

    /**
     * Manually commit the current transcript segment
     * Only works with manual commit strategy
     */
    commit() {
        if (!this.isConnected || !this.ws || this.ws.readyState !== WebSocket.OPEN) {
            return false;
        }

        try {
            // Send an empty audio chunk with commit flag
            this.ws.send(JSON.stringify({
                message_type: 'input_audio_chunk',
                audio_base_64: '',
                commit: true
            }));
            return true;
        } catch (error) {
            console.error(`❌ [${this.sessionId}] Error committing:`, error.message);
            return false;
        }
    }

    /**
     * Update previous text context (for next reconnection or first chunk)
     * @param {string} text
     */
    setPreviousText(text) {
        this.previousText = text ? String(text).slice(0, 50) : null; // Max 50 chars recommended
    }

    /**
     * Disconnect the session
     * @param {string} [reason]
     */
    disconnect(reason = 'user_initiated') {
        console.log(`🔌 [${this.sessionId}] Disconnecting: ${reason}`);
        this._cleanup();

        if (this.ws) {
            try {
                if (this.ws.readyState === WebSocket.OPEN || this.ws.readyState === WebSocket.CONNECTING) {
                    this.ws.close(1000, reason);
                }
            } catch (error) {
                console.warn(`⚠️ [${this.sessionId}] Error closing WebSocket:`, error.message);
            }
            this.ws = null;
        }
    }

    /**
     * Get session statistics
     */
    getStats() {
        return {
            ...this.stats,
            sessionId: this.sessionId,
            serverSessionId: this.serverSessionId,
            isConnected: this.isConnected,
            uptime: this.stats.startTime ? Date.now() - this.stats.startTime : 0,
            commitStrategy: this.commitStrategy,
            languageCode: this.languageCode
        };
    }

    // --- Private helpers ---

    _startKeepalive() {
        this._stopKeepalive();
        this._keepaliveTimer = setInterval(() => {
            if (this.ws && this.ws.readyState === WebSocket.OPEN) {
                try {
                    this.ws.ping();
                } catch (_) { /* noop */ }
            }
        }, DEFAULTS.KEEPALIVE_INTERVAL_MS);
    }

    _stopKeepalive() {
        if (this._keepaliveTimer) {
            clearInterval(this._keepaliveTimer);
            this._keepaliveTimer = null;
        }
    }

    _cleanup() {
        this.isConnected = false;
        this.isConnecting = false;
        this._stopKeepalive();
        if (this._sessionTimer) {
            clearTimeout(this._sessionTimer);
            this._sessionTimer = null;
        }
    }

    _scheduleReconnect() {
        this.reconnectAttempts++;
        const delay = DEFAULTS.RECONNECT_DELAY_MS * Math.pow(2, this.reconnectAttempts - 1); // Exponential backoff
        console.log(`🔄 [${this.sessionId}] Reconnecting in ${delay}ms (attempt ${this.reconnectAttempts}/${this.maxReconnectAttempts})`);

        setTimeout(async () => {
            try {
                await this.connect();
            } catch (error) {
                console.error(`❌ [${this.sessionId}] Reconnection failed:`, error.message);
                if (this.reconnectAttempts >= this.maxReconnectAttempts) {
                    this.emit('max_reconnects_reached', { sessionId: this.sessionId });
                }
            }
        }, delay);
    }
}


/**
 * Manager for multiple concurrent Scribe v2 Realtime sessions.
 * Provides a simple interface for creating, managing, and destroying sessions.
 */
class ElevenLabsRealtimeSTTService extends EventEmitter {
    constructor() {
        super();
        this.sessions = new Map();  // sessionId -> RealtimeSTTSession
        this._config = null;
    }

    /**
     * Get ElevenLabs config (lazy-loaded)
     */
    _getConfig() {
        if (!this._config) {
            this._config = elevenLabsConfigService.getElevenLabsConfig();
        }
        return this._config;
    }

    /**
     * Create and connect a new Scribe v2 Realtime session
     * @param {Object} options
     * @param {string} [options.sessionId] - Custom session ID
     * @param {string} [options.languageCode] - Language code
     * @param {string} [options.commitStrategy] - 'vad' or 'manual'
     * @param {number} [options.vadSilenceThresholdSecs] - VAD silence threshold
     * @param {number} [options.vadThreshold] - VAD voice detection threshold
     * @param {boolean} [options.includeTimestamps] - Include word-level timestamps
     * @param {string} [options.previousText] - Context text from previous turn
     * @returns {Promise<RealtimeSTTSession>}
     */
    async createSession(options = {}) {
        const config = this._getConfig();

        const session = new RealtimeSTTSession({
            apiKey: config.apiKey,
            ...options
        });

        // Relay all session events through the manager
        const eventNames = [
            'connected', 'disconnected', 'session_started',
            'partial_transcript', 'committed_transcript',
            'committed_transcript_with_timestamps',
            'scribe_error', 'error', 'max_reconnects_reached'
        ];

        for (const event of eventNames) {
            session.on(event, (data) => {
                this.emit(event, data);
            });
        }

        // Auto-cleanup on disconnect
        session.on('disconnected', () => {
            this.sessions.delete(session.sessionId);
            console.log(`🧹 Session ${session.sessionId} removed (${this.sessions.size} remaining)`);
        });

        this.sessions.set(session.sessionId, session);
        console.log(`🎤 Creating Scribe v2 Realtime session: ${session.sessionId}`);

        try {
            await session.connect();
            return session;
        } catch (error) {
            this.sessions.delete(session.sessionId);
            throw error;
        }
    }

    /**
     * Get an existing session by ID
     * @param {string} sessionId
     * @returns {RealtimeSTTSession|null}
     */
    getSession(sessionId) {
        return this.sessions.get(sessionId) || null;
    }

    /**
     * Destroy a session
     * @param {string} sessionId
     */
    destroySession(sessionId) {
        const session = this.sessions.get(sessionId);
        if (session) {
            session.disconnect('service_destroy');
            this.sessions.delete(sessionId);
        }
    }

    /**
     * Destroy all active sessions
     */
    destroyAll() {
        for (const [id, session] of this.sessions) {
            try {
                session.disconnect('service_shutdown');
            } catch (_) { /* noop */ }
        }
        this.sessions.clear();
        console.log('🛑 All Scribe v2 Realtime sessions destroyed');
    }

    /**
     * Get count of active sessions
     */
    getActiveSessionCount() {
        return this.sessions.size;
    }

    /**
     * Get stats for all sessions
     */
    getAllStats() {
        const stats = {};
        for (const [id, session] of this.sessions) {
            stats[id] = session.getStats();
        }
        return stats;
    }

    /**
     * Check if Scribe v2 Realtime is available (API key configured)
     */
    isAvailable() {
        try {
            this._getConfig();
            return true;
        } catch (_) {
            return false;
        }
    }
}

// Export singleton manager and the Session class for direct use
const realtimeSTTService = new ElevenLabsRealtimeSTTService();
export { RealtimeSTTSession };
export default realtimeSTTService;
