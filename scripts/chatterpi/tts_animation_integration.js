/**
 * TTS Animation Integration for ChatterPi
 * Connects TopMediai TTS with ChatterPi Animation System audio streaming
 * Provides real-time jaw animation synchronized with high-quality TTS audio
 */

const axios = require('axios');
const fs = require('fs').promises;
const path = require('path');
const WebSocket = require('ws');
const logger = require('../logger');

class TTSAnimationIntegration {
    constructor(options = {}) {
        this.config = {
            // TopMediai API configuration
            topmediaiApiKey: process.env.TOPMEDIAI_API_KEY,
            topmediaiBaseUrl: 'https://api.topmediai.com/v1',

            // ChatterPi Animation System configuration
            animationBridgeUrl: 'ws://localhost:8767',
            fallbackToSystemTTS: true,

            // Audio streaming configuration - disabled to prevent connection errors
            streamingEnabled: false,
            realtimeAnimation: false,
            
            // Voice configuration
            defaultVoiceId: 'en-US-AriaNeural',
            defaultEmotion: 'Neutral',
            defaultSpeed: 1.0,
            defaultPitch: 0,
            
            ...options
        };
        
        // State management
        this.isInitialized = false;
        this.animationBridge = null;
        this.currentSession = null;
        this.audioCache = new Map();
        
        // Character voice mappings
        this.characterVoices = {
            'orlok': {
                voiceId: 'en-US-GuyNeural',
                emotion: 'Serious',
                speed: 0.8,
                pitch: -10
            },
            'robot': {
                voiceId: 'en-US-JennyNeural',
                emotion: 'Neutral',
                speed: 1.2,
                pitch: 5
            },
            'pirate': {
                voiceId: 'en-US-ChristopherNeural',
                emotion: 'Excited',
                speed: 0.9,
                pitch: -5
            }
        };
        
        logger.info('🎤 TTS Animation Integration initialized');
    }
    
    /**
     * Initialize the TTS animation integration
     */
    async initialize() {
        if (this.isInitialized) {
            logger.info('TTS Animation Integration already initialized');
            return true;
        }
        
        try {
            // Connect to ChatterPi Animation System audio bridge
            if (this.config.streamingEnabled) {
                logger.info('Skipping animation bridge connection for now');
                // await this.connectToAnimationBridge();
            }
            
            // Verify TopMediai API access
            await this.verifyTopMediaiAccess();
            
            this.isInitialized = true;
            logger.info('✅ TTS Animation Integration initialized successfully');
            return true;
            
        } catch (error) {
            logger.error('❌ Failed to initialize TTS Animation Integration:', error);
            return false;
        }
    }
    
    /**
     * Connect to ChatterPi Animation System audio bridge
     */
    async connectToAnimationBridge() {
        return new Promise((resolve, reject) => {
            try {
                this.animationBridge = new WebSocket(this.config.animationBridgeUrl);
                
                this.animationBridge.on('open', () => {
                    logger.info('✅ Connected to ChatterPi Animation System audio bridge');
                    
                    // Send welcome message
                    this.animationBridge.send(JSON.stringify({
                        type: 'client_info',
                        client_type: 'tts_integration',
                        capabilities: ['streaming_tts', 'real_time_animation']
                    }));
                    
                    resolve();
                });
                
                this.animationBridge.on('message', (data) => {
                    this.handleAnimationBridgeMessage(data);
                });
                
                this.animationBridge.on('error', (error) => {
                    logger.error('Animation bridge error:', error);
                    reject(error);
                });
                
                this.animationBridge.on('close', () => {
                    logger.warn('Animation bridge disconnected');
                    this.animationBridge = null;

                    // Auto-reconnect disabled for now
                    // setTimeout(() => this.connectToAnimationBridge(), 5000);
                });
                
            } catch (error) {
                reject(error);
            }
        });
    }
    
    /**
     * Handle messages from animation bridge
     */
    handleAnimationBridgeMessage(data) {
        try {
            const message = JSON.parse(data);
            
            switch (message.type) {
                case 'welcome':
                    logger.info('Animation bridge welcome:', message.system_status);
                    break;
                    
                case 'tts_audio_started':
                    logger.info('TTS audio streaming started for animation');
                    break;
                    
                case 'audio_session_started':
                    this.currentSession = message.session_id;
                    logger.info('Animation session started:', this.currentSession);
                    break;
                    
                case 'error':
                    logger.error('Animation bridge error:', message.error);
                    break;
            }
        } catch (error) {
            logger.error('Error parsing animation bridge message:', error);
        }
    }
    
    /**
     * Verify TopMediai API access
     */
    async verifyTopMediaiAccess() {
        if (!this.config.topmediaiApiKey) {
            throw new Error('TopMediai API key not configured');
        }
        
        try {
            const response = await axios.get(`${this.config.topmediaiBaseUrl}/voices`, {
                headers: {
                    'x-api-key': this.config.topmediaiApiKey
                },
                timeout: 10000
            });
            
            logger.info(`✅ TopMediai API access verified (${response.data.length || 0} voices available)`);
            return true;
            
        } catch (error) {
            logger.warn('TopMediai API verification failed:', error.message);
            if (!this.config.fallbackToSystemTTS) {
                throw error;
            }
            return false;
        }
    }
    
    /**
     * Generate speech with animation for a character
     */
    async speakWithAnimation(text, character = 'orlok', options = {}) {
        try {
            if (!text?.trim()) {
                throw new Error('Text is required for speech generation');
            }
            
            logger.info(`🎤 Generating speech with animation for ${character}: "${text}"`);
            
            // Get character voice configuration
            const voiceConfig = this.getVoiceConfigForCharacter(character, options);
            
            // Generate TTS audio
            const audioResult = await this.generateTTSAudio(text, voiceConfig);
            
            // Stream audio to animation system
            if (this.config.streamingEnabled && this.animationBridge) {
                await this.streamAudioForAnimation(audioResult, {
                    character,
                    text,
                    voiceConfig
                });
            }
            
            return {
                success: true,
                audioResult,
                character,
                voiceConfig,
                animationEnabled: this.config.streamingEnabled && !!this.animationBridge
            };
            
        } catch (error) {
            logger.error('Error in speakWithAnimation:', error);
            
            // Fallback to browser speech synthesis
            return {
                success: false,
                error: error.message,
                fallback: 'browser_speech',
                text,
                character
            };
        }
    }
    
    /**
     * Get voice configuration for character
     */
    getVoiceConfigForCharacter(character, options = {}) {
        const characterConfig = this.characterVoices[character] || this.characterVoices['orlok'];
        
        return {
            voiceId: options.voiceId || characterConfig.voiceId,
            emotion: options.emotion || characterConfig.emotion,
            speed: options.speed || characterConfig.speed,
            pitch: options.pitch || characterConfig.pitch,
            volume: options.volume || 1.0
        };
    }
    
    /**
     * Generate TTS audio using TopMediai API
     */
    async generateTTSAudio(text, voiceConfig) {
        try {
            // Check cache first
            const cacheKey = this.generateCacheKey(text, voiceConfig);
            if (this.audioCache.has(cacheKey)) {
                logger.info('Using cached TTS audio');
                return this.audioCache.get(cacheKey);
            }

            // Use the fixed TopMediai API integration
            const TopMediaiAPI = require('../topMediaiAPI');
            const topMediaiAPI = new TopMediaiAPI();

            const result = await topMediaiAPI.textToSpeech({
                text: text.trim(),
                voiceId: voiceConfig.voiceId,
                options: {
                    emotion: voiceConfig.emotion || 'Neutral',
                    speed: voiceConfig.speed,
                    pitch: voiceConfig.pitch,
                    volume: voiceConfig.volume
                }
            });

            // Read the audio data from the generated file
            const audioBuffer = await require('fs').promises.readFile(result.filepath);

            const audioResult = {
                audioData: audioBuffer,
                format: result.format, // Now correctly returns 'wav' or 'mp3'
                provider: 'TopMediai',
                voiceConfig,
                timestamp: new Date().toISOString(),
                textLength: text.length,
                url: result.url,
                filename: result.filename
            };

            // Cache the result
            this.audioCache.set(cacheKey, audioResult);

            // Limit cache size
            if (this.audioCache.size > 50) {
                const firstKey = this.audioCache.keys().next().value;
                this.audioCache.delete(firstKey);
            }

            logger.info(`✅ Generated TTS audio: ${audioBuffer.length} bytes (${result.format.toUpperCase()})`);
            return audioResult;
            
        } catch (error) {
            logger.error('TopMediai TTS generation failed:', error.message);
            
            if (this.config.fallbackToSystemTTS) {
                return await this.generateSystemTTSFallback(text, voiceConfig);
            }
            
            throw error;
        }
    }
    
    /**
     * Stream audio to animation system for real-time jaw movement
     */
    async streamAudioForAnimation(audioResult, metadata) {
        if (!this.animationBridge || this.animationBridge.readyState !== WebSocket.OPEN) {
            logger.warn('Animation bridge not available for audio streaming');
            return false;
        }
        
        try {
            // Start audio session
            this.animationBridge.send(JSON.stringify({
                type: 'start_audio_session',
                config: {
                    animation_profile: 'enhanced_smoothing',
                    jaw_closed_angle: 50.0,
                    jaw_open_angle: 30.0
                },
                metadata
            }));
            
            // Stream TTS audio data
            this.animationBridge.send(JSON.stringify({
                type: 'tts_audio',
                audio_data: audioResult.audioData.toString('base64'),
                source_type: 'buffer',
                metadata: {
                    provider: audioResult.provider,
                    format: audioResult.format,
                    character: metadata.character,
                    text: metadata.text,
                    voice_config: metadata.voiceConfig
                }
            }));
            
            logger.info('🎭 TTS audio streamed to animation system');
            return true;
            
        } catch (error) {
            logger.error('Error streaming audio for animation:', error);
            return false;
        }
    }
    
    /**
     * Generate cache key for TTS audio
     */
    generateCacheKey(text, voiceConfig) {
        const configStr = JSON.stringify(voiceConfig);
        return `${text.substring(0, 50)}_${Buffer.from(configStr).toString('base64').substring(0, 20)}`;
    }
    
    /**
     * Fallback to system TTS
     */
    async generateSystemTTSFallback(text, voiceConfig) {
        logger.info('Using system TTS fallback');
        
        // This would integrate with the existing system TTS in topMediaiAPI.js
        // For now, return a placeholder that indicates fallback is needed
        return {
            audioData: null,
            format: 'wav',
            provider: 'System',
            voiceConfig,
            timestamp: new Date().toISOString(),
            textLength: text.length,
            fallback: true
        };
    }
    
    /**
     * Get available voices for character selection
     */
    async getAvailableVoices() {
        try {
            // Use the fixed TopMediai API integration
            const TopMediaiAPI = require('../topMediaiAPI');
            const topMediaiAPI = new TopMediaiAPI();

            const voices = await topMediaiAPI.getVoices();

            return voices.map(voice => ({
                id: voice.uuid,
                name: voice.name,
                language: voice.language,
                gender: voice.gender,
                emotions: voice.emotions || ['Neutral'],
                isVip: voice.isVip || false
            }));

        } catch (error) {
            logger.error('Error fetching available voices:', error);
            return [];
        }
    }
    
    /**
     * Cleanup resources
     */
    async cleanup() {
        if (this.animationBridge) {
            this.animationBridge.close();
            this.animationBridge = null;
        }
        
        this.audioCache.clear();
        this.isInitialized = false;
        
        logger.info('✅ TTS Animation Integration cleaned up');
    }
}

module.exports = TTSAnimationIntegration;
