/**
 * AI Jaw Integration Service
 * 
 * Bridges the AI Integration Service with the Jaw Animation System
 * to provide synchronized jaw movement during AI-generated speech
 * and conversations.
 */

const EventEmitter = require('events');
const aiIntegrationService = require('./aiIntegrationService');
const logger = require('../../scripts/logger');

class AIJawIntegrationService extends EventEmitter {
    constructor() {
        super();
        
        this.isInitialized = false;
        this.jawAnimationSystem = null;
        this.activeAnimations = new Map();
        this.characterServoMapping = new Map();
        
        // Configuration
        this.config = {
            enableJawSync: true,
            animationDuration: 3000, // Default animation duration in ms
            wordsPerMinute: 150, // Average speaking rate
            jawMovementIntensity: 0.7,
            pauseBetweenWords: 100,
            enableTextAnalysis: true
        };
        
        // Statistics
        this.stats = {
            totalAnimations: 0,
            successfulAnimations: 0,
            failedAnimations: 0,
            averageAnimationDuration: 0,
            textAnalysisCount: 0,
            startTime: new Date()
        };
        
        this.initialize();
    }
    
    /**
     * Initialize the AI jaw integration service
     */
    async initialize() {
        try {
            // Load character to servo mappings
            await this.loadCharacterServoMappings();
            
            // Setup AI service event handlers
            this.setupAIEventHandlers();
            
            this.isInitialized = true;
            logger.info('AI Jaw Integration Service initialized successfully');
            
        } catch (error) {
            logger.error('Failed to initialize AI Jaw Integration Service:', error);
            this.emit('initializationError', error);
        }
    }
    
    /**
     * Set jaw animation system reference
     */
    setJawAnimationSystem(jawAnimationSystem) {
        this.jawAnimationSystem = jawAnimationSystem;
        
        if (jawAnimationSystem) {
            this.setupJawAnimationEventHandlers();
            logger.info('Jaw Animation System connected to AI integration');
        }
    }
    
    /**
     * Load character to servo mappings
     */
    async loadCharacterServoMappings() {
        try {
            // Default mappings - these should be loaded from configuration
            const mappings = {
                'orlok': { servoId: 1, characterId: 1 },
                'coffin': { servoId: 2, characterId: 2 },
                'skeleton': { servoId: 3, characterId: 3 },
                'pumpkinhead': { servoId: 4, characterId: 4 }
            };
            
            for (const [characterName, mapping] of Object.entries(mappings)) {
                this.characterServoMapping.set(characterName, mapping);
            }
            
            logger.info(`Loaded ${this.characterServoMapping.size} character servo mappings`);
            
        } catch (error) {
            logger.error('Failed to load character servo mappings:', error);
            throw error;
        }
    }
    
    /**
     * Setup AI service event handlers
     */
    setupAIEventHandlers() {
        aiIntegrationService.on('jawAnimationRequested', (data) => {
            this.handleJawAnimationRequest(data);
        });
        
        aiIntegrationService.on('conversationProcessed', (data) => {
            this.handleConversationProcessed(data);
        });
        
        aiIntegrationService.on('responseGenerated', (data) => {
            this.handleResponseGenerated(data);
        });
    }
    
    /**
     * Setup jaw animation system event handlers
     */
    setupJawAnimationEventHandlers() {
        this.jawAnimationSystem.on('animationStarted', (data) => {
            logger.debug(`Jaw animation started for character ${data.characterId}`);
            this.emit('jawAnimationStarted', data);
        });
        
        this.jawAnimationSystem.on('animationStopped', (data) => {
            logger.debug(`Jaw animation stopped for character ${data.characterId}`);
            this.emit('jawAnimationStopped', data);
        });
        
        this.jawAnimationSystem.on('error', (error) => {
            logger.error('Jaw animation system error:', error);
            this.stats.failedAnimations++;
            this.emit('jawAnimationError', error);
        });
    }
    
    /**
     * Handle jaw animation request from AI service
     */
    async handleJawAnimationRequest(data) {
        if (!this.config.enableJawSync || !this.jawAnimationSystem) {
            logger.debug('Jaw sync disabled or jaw animation system not available');
            return;
        }
        
        try {
            const { characterId, text } = data;
            
            // Get servo mapping for character
            const servoMapping = this.characterServoMapping.get(characterId);
            if (!servoMapping) {
                logger.warn(`No servo mapping found for character: ${characterId}`);
                return;
            }
            
            // Analyze text for animation timing
            const animationPlan = this.analyzeTextForAnimation(text);
            
            // Start jaw animation
            await this.startJawAnimation(servoMapping, animationPlan);
            
            this.stats.totalAnimations++;
            this.stats.successfulAnimations++;
            
        } catch (error) {
            logger.error('Failed to handle jaw animation request:', error);
            this.stats.failedAnimations++;
            this.emit('jawAnimationError', error);
        }
    }
    
    /**
     * Handle conversation processed event
     */
    handleConversationProcessed(data) {
        if (data.aiResponse && data.aiResponse.text) {
            // Trigger jaw animation for the AI response
            this.handleJawAnimationRequest({
                characterId: data.characterId,
                text: data.aiResponse.text
            });
        }
    }
    
    /**
     * Handle response generated event
     */
    handleResponseGenerated(data) {
        if (this.config.enableJawSync && data.text) {
            // Pre-analyze text for potential jaw animation
            const animationPlan = this.analyzeTextForAnimation(data.text);
            
            this.emit('animationPlanGenerated', {
                characterId: data.characterId,
                text: data.text,
                animationPlan
            });
        }
    }
    
    /**
     * Analyze text for jaw animation timing
     */
    analyzeTextForAnimation(text) {
        this.stats.textAnalysisCount++;
        
        if (!this.config.enableTextAnalysis) {
            return {
                duration: this.config.animationDuration,
                intensity: this.config.jawMovementIntensity,
                pattern: 'uniform'
            };
        }
        
        try {
            // Count words and estimate speaking duration
            const words = text.trim().split(/\s+/).filter(word => word.length > 0);
            const wordCount = words.length;
            
            // Calculate duration based on words per minute
            const estimatedDuration = (wordCount / this.config.wordsPerMinute) * 60 * 1000;
            
            // Analyze text for emphasis and pauses
            const sentences = text.split(/[.!?]+/).filter(s => s.trim().length > 0);
            const hasEmphasis = /[!?]/.test(text);
            const hasLongPauses = /[,;:]/.test(text);
            
            // Calculate intensity based on text characteristics
            let intensity = this.config.jawMovementIntensity;
            if (hasEmphasis) intensity += 0.2;
            if (text.length > 100) intensity += 0.1;
            intensity = Math.min(intensity, 1.0);
            
            // Generate movement pattern
            const pattern = this.generateMovementPattern(words, sentences);
            
            return {
                duration: Math.max(estimatedDuration, 1000), // Minimum 1 second
                intensity,
                pattern,
                wordCount,
                sentenceCount: sentences.length,
                hasEmphasis,
                hasLongPauses
            };
            
        } catch (error) {
            logger.error('Error analyzing text for animation:', error);
            
            // Return default plan
            return {
                duration: this.config.animationDuration,
                intensity: this.config.jawMovementIntensity,
                pattern: 'uniform'
            };
        }
    }
    
    /**
     * Generate movement pattern based on text analysis
     */
    generateMovementPattern(words, sentences) {
        const pattern = [];
        let currentTime = 0;
        
        for (let i = 0; i < words.length; i++) {
            const word = words[i];
            const wordDuration = (word.length * 50) + 100; // Base duration per word
            
            // Add movement for word
            pattern.push({
                time: currentTime,
                type: 'open',
                intensity: 0.6 + (Math.random() * 0.4) // Vary intensity
            });
            
            pattern.push({
                time: currentTime + wordDuration * 0.7,
                type: 'close',
                intensity: 0.3
            });
            
            currentTime += wordDuration + this.config.pauseBetweenWords;
            
            // Add longer pause for sentence endings
            if (word.match(/[.!?]$/)) {
                currentTime += 200;
            }
        }
        
        return pattern;
    }
    
    /**
     * Start jaw animation with servo mapping and animation plan
     */
    async startJawAnimation(servoMapping, animationPlan) {
        if (!this.jawAnimationSystem) {
            throw new Error('Jaw animation system not available');
        }
        
        const animationId = `ai_jaw_${Date.now()}`;
        
        try {
            // Store active animation
            this.activeAnimations.set(animationId, {
                servoMapping,
                animationPlan,
                startTime: Date.now()
            });
            
            // Start jaw animation system for character
            await this.jawAnimationSystem.startAnimation(
                servoMapping.characterId,
                servoMapping.servoId
            );
            
            // Schedule animation stop
            setTimeout(async () => {
                try {
                    await this.stopJawAnimation(animationId);
                } catch (error) {
                    logger.error('Error stopping scheduled jaw animation:', error);
                }
            }, animationPlan.duration);
            
            logger.debug(`Started jaw animation ${animationId} for ${animationPlan.duration}ms`);
            
        } catch (error) {
            this.activeAnimations.delete(animationId);
            throw error;
        }
    }
    
    /**
     * Stop jaw animation
     */
    async stopJawAnimation(animationId) {
        const animation = this.activeAnimations.get(animationId);
        if (!animation) {
            return;
        }
        
        try {
            await this.jawAnimationSystem.stopAnimation();
            
            const duration = Date.now() - animation.startTime;
            this.updateAnimationStats(duration);
            
            this.activeAnimations.delete(animationId);
            
            logger.debug(`Stopped jaw animation ${animationId} after ${duration}ms`);
            
        } catch (error) {
            logger.error(`Error stopping jaw animation ${animationId}:`, error);
            throw error;
        }
    }
    
    /**
     * Update animation statistics
     */
    updateAnimationStats(duration) {
        const totalDuration = this.stats.averageAnimationDuration * this.stats.successfulAnimations;
        this.stats.averageAnimationDuration = (totalDuration + duration) / (this.stats.successfulAnimations + 1);
    }
    
    /**
     * Trigger jaw animation manually
     */
    async triggerJawAnimation(characterId, text, options = {}) {
        const data = {
            characterId,
            text,
            timestamp: new Date().toISOString()
        };
        
        await this.handleJawAnimationRequest(data);
    }
    
    /**
     * Update configuration
     */
    updateConfiguration(newConfig) {
        this.config = { ...this.config, ...newConfig };
        logger.info('AI Jaw Integration configuration updated');
        this.emit('configurationUpdated', this.config);
    }
    
    /**
     * Get service statistics
     */
    getStatistics() {
        return {
            ...this.stats,
            activeAnimations: this.activeAnimations.size,
            characterMappings: this.characterServoMapping.size,
            uptime: Date.now() - this.stats.startTime.getTime(),
            isInitialized: this.isInitialized,
            config: this.config
        };
    }
    
    /**
     * Get character servo mappings
     */
    getCharacterServoMappings() {
        return Object.fromEntries(this.characterServoMapping);
    }
    
    /**
     * Update character servo mapping
     */
    updateCharacterServoMapping(characterId, servoMapping) {
        this.characterServoMapping.set(characterId, servoMapping);
        logger.info(`Updated servo mapping for character: ${characterId}`);
        this.emit('servoMappingUpdated', characterId, servoMapping);
    }
    
    /**
     * Stop all active animations
     */
    async stopAllAnimations() {
        const animationIds = Array.from(this.activeAnimations.keys());
        
        for (const animationId of animationIds) {
            try {
                await this.stopJawAnimation(animationId);
            } catch (error) {
                logger.error(`Error stopping animation ${animationId}:`, error);
            }
        }
        
        logger.info(`Stopped ${animationIds.length} active animations`);
    }
    
    /**
     * Shutdown service
     */
    async shutdown() {
        logger.info('Shutting down AI Jaw Integration Service');
        
        await this.stopAllAnimations();
        
        this.isInitialized = false;
        this.emit('shutdown');
    }
}

// Create singleton instance
const aiJawIntegrationService = new AIJawIntegrationService();

module.exports = aiJawIntegrationService;
