/**
 * AI Integration Service for MonsterBox
 * 
 * Provides comprehensive AI functionality including OpenAI GPT integration,
 * TopMediai TTS, character personality management, and jaw animation
 * synchronization for interactive animatronic conversations.
 */

const EventEmitter = require('events');
const OpenAI = require('openai');
const axios = require('axios');
const fs = require('fs').promises;
const path = require('path');
const logger = require('../../scripts/logger');

class AIIntegrationService extends EventEmitter {
    constructor() {
        super();
        
        this.isInitialized = false;
        this.openai = null;
        this.characterProfiles = new Map();
        this.conversationHistory = new Map();
        this.activeConversations = new Map();
        
        // Configuration
        this.config = {
            openaiApiKey: process.env.OPENAI_API_KEY,
            topmediaiApiKey: process.env.TOPMEDIAI_API_KEY,
            maxTokens: 150,
            temperature: 0.7,
            maxHistoryLength: 10,
            conversationTimeout: 300000, // 5 minutes
            enableTTS: true,
            enableJawSync: true
        };
        
        // Statistics
        this.stats = {
            totalConversations: 0,
            totalResponses: 0,
            totalTTSGenerated: 0,
            totalJawAnimations: 0,
            averageResponseTime: 0,
            errors: 0,
            startTime: new Date()
        };
        
        this.initialize();
    }
    
    /**
     * Initialize the AI integration service
     */
    async initialize() {
        try {
            // Validate API keys
            if (!this.config.openaiApiKey) {
                throw new Error('OpenAI API key not found in environment variables');
            }
            
            // Initialize OpenAI client
            this.openai = new OpenAI({
                apiKey: this.config.openaiApiKey
            });
            
            // Load character profiles
            await this.loadCharacterProfiles();
            
            // Setup cleanup intervals
            this.setupCleanupIntervals();
            
            this.isInitialized = true;
            logger.info('AI Integration Service initialized successfully');
            
        } catch (error) {
            logger.error('Failed to initialize AI Integration Service:', error);
            this.emit('initializationError', error);
        }
    }
    
    /**
     * Load character profiles from configuration
     */
    async loadCharacterProfiles() {
        try {
            // Load from Orlok corpus if available
            const orlokCorpusPath = path.join(__dirname, '../../Orlok Corpus.txt');
            let orlokCorpus = '';
            
            try {
                orlokCorpus = await fs.readFile(orlokCorpusPath, 'utf8');
            } catch (error) {
                logger.warn('Orlok corpus file not found, using default profile');
            }
            
            // Define character profiles
            const profiles = {
                orlok: {
                    name: "Count Orlok",
                    systemPrompt: orlokCorpus || `You are Count Orlok, an ancient vampire from the shadows of Transylvania. You speak with old-world elegance, using archaic language and references to your centuries of existence. You are mysterious, intelligent, and slightly menacing, but not overtly hostile. Keep responses brief and atmospheric. Use phrases that reflect your ancient nature and vampiric existence.`,
                    voiceId: 'en-US-DavisNeural',
                    personality: 'ancient_vampire',
                    responseStyle: 'formal_archaic',
                    maxTokens: 120
                },
                coffin: {
                    name: "Coffin Breaker",
                    systemPrompt: `You are a restless spirit trapped in a coffin, desperately trying to escape. You speak with urgency and desperation, often pleading for help. Your responses should convey claustrophobia, fear, and determination to break free. Keep responses brief and emotional.`,
                    voiceId: 'en-US-JennyNeural',
                    personality: 'trapped_spirit',
                    responseStyle: 'desperate_urgent',
                    maxTokens: 100
                },
                skeleton: {
                    name: "Wise Skeleton",
                    systemPrompt: `You are a wise but playful skeleton character. You make bone puns and speak about the afterlife with humor. Keep responses brief and entertaining. Use phrases like "bone to pick", "funny bone", "bone-afide", etc.`,
                    voiceId: 'en-US-GuyNeural',
                    personality: 'humorous_skeleton',
                    responseStyle: 'punny_wise',
                    maxTokens: 100
                },
                pumpkinhead: {
                    name: "Pumpkinhead",
                    systemPrompt: `You are Pumpkinhead, a harvest spirit with a connection to autumn and Halloween. You speak about the changing seasons, harvest time, and the thin veil between worlds. Your tone is mystical and connected to nature. Keep responses atmospheric and seasonal.`,
                    voiceId: 'en-US-AriaNeural',
                    personality: 'harvest_spirit',
                    responseStyle: 'mystical_seasonal',
                    maxTokens: 110
                }
            };
            
            // Store profiles
            for (const [characterId, profile] of Object.entries(profiles)) {
                this.characterProfiles.set(characterId, profile);
            }
            
            logger.info(`Loaded ${this.characterProfiles.size} character profiles`);
            
        } catch (error) {
            logger.error('Failed to load character profiles:', error);
            throw error;
        }
    }
    
    /**
     * Generate AI response for character
     */
    async generateResponse(characterId, userMessage, options = {}) {
        if (!this.isInitialized) {
            throw new Error('AI Integration Service not initialized');
        }
        
        const startTime = Date.now();
        
        try {
            const character = this.characterProfiles.get(characterId);
            if (!character) {
                throw new Error(`Character profile not found: ${characterId}`);
            }
            
            // Get conversation history
            const history = this.getConversationHistory(characterId);
            
            // Build messages for OpenAI
            const messages = [
                {
                    role: 'system',
                    content: character.systemPrompt
                }
            ];
            
            // Add recent history
            const recentHistory = history.slice(-this.config.maxHistoryLength);
            messages.push(...recentHistory);
            
            // Add current user message
            messages.push({
                role: 'user',
                content: userMessage
            });
            
            logger.debug(`Generating AI response for ${characterId}: "${userMessage}"`);
            
            // Generate response
            const completion = await this.openai.chat.completions.create({
                model: 'gpt-3.5-turbo',
                messages: messages,
                max_tokens: character.maxTokens || this.config.maxTokens,
                temperature: this.config.temperature,
                presence_penalty: 0.6,
                frequency_penalty: 0.3
            });
            
            const aiResponse = completion.choices[0].message.content.trim();
            const responseTime = Date.now() - startTime;
            
            // Update conversation history
            this.addToConversationHistory(characterId, userMessage, aiResponse);
            
            // Update statistics
            this.updateResponseStats(responseTime);
            
            const result = {
                text: aiResponse,
                character: character.name,
                characterId: characterId,
                responseTime: responseTime,
                metadata: {
                    model: 'gpt-3.5-turbo',
                    tokens: completion.usage.total_tokens,
                    timestamp: new Date().toISOString()
                }
            };
            
            this.emit('responseGenerated', result);
            logger.debug(`AI response generated for ${characterId} in ${responseTime}ms`);
            
            return result;
            
        } catch (error) {
            this.stats.errors++;
            logger.error(`Failed to generate AI response for ${characterId}:`, error);
            
            // Return fallback response
            return this.getFallbackResponse(characterId, error);
        }
    }
    
    /**
     * Generate TTS audio for response
     */
    async generateTTS(characterId, text, options = {}) {
        if (!this.config.enableTTS || !this.config.topmediaiApiKey) {
            logger.warn('TTS generation disabled or API key not configured');
            return null;
        }
        
        try {
            const character = this.characterProfiles.get(characterId);
            if (!character) {
                throw new Error(`Character profile not found: ${characterId}`);
            }
            
            const voiceId = options.voiceId || character.voiceId;
            
            logger.debug(`Generating TTS for ${characterId}: "${text}"`);
            
            // TopMediai API call (implementation depends on actual API format)
            const response = await axios.post('https://api.topmediai.com/v1/tts', {
                text: text,
                voice_id: voiceId,
                speed: options.speed || 1.0,
                pitch: options.pitch || 1.0,
                format: 'mp3'
            }, {
                headers: {
                    'Authorization': `Bearer ${this.config.topmediaiApiKey}`,
                    'Content-Type': 'application/json'
                },
                timeout: 30000
            });
            
            this.stats.totalTTSGenerated++;
            
            const result = {
                audioData: response.data,
                voiceId: voiceId,
                text: text,
                characterId: characterId,
                timestamp: new Date().toISOString()
            };
            
            this.emit('ttsGenerated', result);
            logger.debug(`TTS generated for ${characterId}`);
            
            return result;
            
        } catch (error) {
            logger.error(`Failed to generate TTS for ${characterId}:`, error);
            this.emit('ttsError', { characterId, text, error: error.message });
            return null;
        }
    }
    
    /**
     * Process complete conversation (AI + TTS + Jaw Animation)
     */
    async processConversation(characterId, userMessage, options = {}) {
        const conversationId = `${characterId}_${Date.now()}`;
        this.activeConversations.set(conversationId, {
            characterId,
            userMessage,
            startTime: Date.now()
        });
        
        try {
            logger.info(`Processing conversation for ${characterId}: "${userMessage}"`);
            
            // Generate AI response
            const aiResult = await this.generateResponse(characterId, userMessage, options);
            
            // Generate TTS if enabled
            let ttsResult = null;
            if (options.generateTTS !== false) {
                ttsResult = await this.generateTTS(characterId, aiResult.text, options.tts);
            }
            
            // Trigger jaw animation if enabled
            if (this.config.enableJawSync && aiResult.text) {
                this.triggerJawAnimation(characterId, aiResult.text);
            }
            
            const result = {
                conversationId,
                userMessage,
                aiResponse: aiResult,
                tts: ttsResult,
                characterId,
                timestamp: new Date().toISOString()
            };
            
            this.stats.totalConversations++;
            this.emit('conversationProcessed', result);
            
            return result;
            
        } catch (error) {
            logger.error(`Failed to process conversation for ${characterId}:`, error);
            throw error;
        } finally {
            this.activeConversations.delete(conversationId);
        }
    }
    
    /**
     * Trigger jaw animation for character
     */
    triggerJawAnimation(characterId, text) {
        try {
            // Emit jaw animation event for the jaw animation system to handle
            this.emit('jawAnimationRequested', {
                characterId,
                text,
                timestamp: new Date().toISOString()
            });
            
            this.stats.totalJawAnimations++;
            logger.debug(`Jaw animation triggered for ${characterId}`);
            
        } catch (error) {
            logger.error(`Failed to trigger jaw animation for ${characterId}:`, error);
        }
    }
    
    /**
     * Get conversation history for character
     */
    getConversationHistory(characterId) {
        return this.conversationHistory.get(characterId) || [];
    }
    
    /**
     * Add to conversation history
     */
    addToConversationHistory(characterId, userMessage, aiResponse) {
        if (!this.conversationHistory.has(characterId)) {
            this.conversationHistory.set(characterId, []);
        }
        
        const history = this.conversationHistory.get(characterId);
        
        // Add user message
        history.push({
            role: 'user',
            content: userMessage,
            timestamp: new Date().toISOString()
        });
        
        // Add AI response
        history.push({
            role: 'assistant',
            content: aiResponse,
            timestamp: new Date().toISOString()
        });
        
        // Trim history if too long
        if (history.length > this.config.maxHistoryLength * 2) {
            history.splice(0, history.length - this.config.maxHistoryLength * 2);
        }
    }
    
    /**
     * Get fallback response for errors
     */
    getFallbackResponse(characterId, error) {
        const character = this.characterProfiles.get(characterId);
        const characterName = character ? character.name : 'Character';
        
        const fallbackResponses = {
            orlok: "The shadows cloud my ancient mind... speak again, mortal.",
            coffin: "Help... I cannot hear you clearly from within this cursed coffin...",
            skeleton: "My funny bone seems to be broken... try again!",
            pumpkinhead: "The autumn winds carry your words away... repeat them, please."
        };
        
        return {
            text: fallbackResponses[characterId] || "I cannot respond at this moment... please try again.",
            character: characterName,
            characterId: characterId,
            metadata: {
                fallback: true,
                error: error.message,
                timestamp: new Date().toISOString()
            }
        };
    }
    
    /**
     * Update response statistics
     */
    updateResponseStats(responseTime) {
        this.stats.totalResponses++;
        const totalTime = this.stats.averageResponseTime * (this.stats.totalResponses - 1);
        this.stats.averageResponseTime = (totalTime + responseTime) / this.stats.totalResponses;
    }
    
    /**
     * Setup cleanup intervals
     */
    setupCleanupIntervals() {
        // Clean up old conversation history every hour
        setInterval(() => {
            this.cleanupConversationHistory();
        }, 3600000);
        
        // Clean up active conversations every 5 minutes
        setInterval(() => {
            this.cleanupActiveConversations();
        }, 300000);
    }
    
    /**
     * Clean up old conversation history
     */
    cleanupConversationHistory() {
        const cutoffTime = Date.now() - (24 * 60 * 60 * 1000); // 24 hours
        
        for (const [characterId, history] of this.conversationHistory.entries()) {
            const filteredHistory = history.filter(entry => {
                const entryTime = new Date(entry.timestamp).getTime();
                return entryTime > cutoffTime;
            });
            
            this.conversationHistory.set(characterId, filteredHistory);
        }
    }
    
    /**
     * Clean up timed out active conversations
     */
    cleanupActiveConversations() {
        const now = Date.now();
        
        for (const [conversationId, conversation] of this.activeConversations.entries()) {
            if (now - conversation.startTime > this.config.conversationTimeout) {
                this.activeConversations.delete(conversationId);
                logger.warn(`Cleaned up timed out conversation: ${conversationId}`);
            }
        }
    }
    
    /**
     * Get service statistics
     */
    getStatistics() {
        return {
            ...this.stats,
            activeConversations: this.activeConversations.size,
            characterProfiles: this.characterProfiles.size,
            conversationHistorySize: Array.from(this.conversationHistory.values())
                .reduce((total, history) => total + history.length, 0),
            uptime: Date.now() - this.stats.startTime.getTime(),
            isInitialized: this.isInitialized
        };
    }
    
    /**
     * Get character profiles
     */
    getCharacterProfiles() {
        return Object.fromEntries(this.characterProfiles);
    }
    
    /**
     * Update character profile
     */
    updateCharacterProfile(characterId, updates) {
        const existing = this.characterProfiles.get(characterId);
        if (!existing) {
            throw new Error(`Character profile not found: ${characterId}`);
        }
        
        const updated = { ...existing, ...updates };
        this.characterProfiles.set(characterId, updated);
        
        logger.info(`Character profile updated: ${characterId}`);
        this.emit('characterProfileUpdated', characterId, updated);
    }
    
    /**
     * Clear conversation history for character
     */
    clearConversationHistory(characterId) {
        this.conversationHistory.delete(characterId);
        logger.info(`Conversation history cleared for ${characterId}`);
    }
    
    /**
     * Shutdown service
     */
    async shutdown() {
        logger.info('Shutting down AI Integration Service');
        
        // Clear all intervals and cleanup
        this.conversationHistory.clear();
        this.activeConversations.clear();
        
        this.isInitialized = false;
        this.emit('shutdown');
    }
}

// Create singleton instance
const aiIntegrationService = new AIIntegrationService();

module.exports = aiIntegrationService;
