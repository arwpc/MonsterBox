/**
 * Core AI Integration Module
 * 
 * Main entry point for AI integrations with unified interface,
 * comprehensive error handling, and monitoring.
 */

const AIClientManager = require('./AIClientManager');
const APIKeyManager = require('./APIKeyManager');
const AIPerformanceMonitor = require('./AIPerformanceMonitor');
const logger = require('../../scripts/logger');

class CoreAIIntegration {
    constructor(options = {}) {
        this.config = {
            enableMonitoring: options.enableMonitoring !== false,
            enableKeyManagement: options.enableKeyManagement !== false,
            defaultProvider: options.defaultProvider || 'elevenlabs',
            fallbackProviders: options.fallbackProviders || ['anthropic', 'google'],
            ...options
        };

        this.initialized = false;
        this.clientManager = null;
        this.keyManager = null;
        this.performanceMonitor = null;
    }

    /**
     * Initialize the AI integration system
     */
    async initialize() {
        try {
            logger.info('🚀 Initializing Core AI Integration...');

            // Initialize API Key Manager
            if (this.config.enableKeyManagement) {
                this.keyManager = new APIKeyManager(this.config.keyManager);
                await this.keyManager.initialize();
            }

            // Initialize Performance Monitor
            if (this.config.enableMonitoring) {
                this.performanceMonitor = new AIPerformanceMonitor(this.config.monitoring);
                await this.performanceMonitor.initialize();
            }

            // Initialize Client Manager
            this.clientManager = new AIClientManager({
                defaultProvider: this.config.defaultProvider,
                fallbackProviders: this.config.fallbackProviders,
                ...this.config.clientManager
            });

            // Set up event listeners
            this.setupEventListeners();

            this.initialized = true;
            logger.info('✅ Core AI Integration initialized successfully');

            return {
                success: true,
                providers: Array.from(this.clientManager.clients.keys()),
                monitoring: !!this.performanceMonitor,
                keyManagement: !!this.keyManager
            };

        } catch (error) {
            logger.error('❌ Failed to initialize Core AI Integration:', error.message);
            throw error;
        }
    }

    /**
     * Set up event listeners for monitoring and logging
     */
    setupEventListeners() {
        if (this.clientManager && this.performanceMonitor) {
            // Monitor client manager events
            this.clientManager.on('response_generated', (data) => {
                this.performanceMonitor.recordResponse(
                    data.requestId || this.generateRequestId(),
                    data.provider,
                    data.response,
                    data.responseTime
                );
            });

            this.clientManager.on('all_providers_failed', (data) => {
                this.performanceMonitor.recordError(
                    data.requestId || this.generateRequestId(),
                    'all_providers',
                    data.lastError,
                    data.responseTime
                );
            });
        }

        if (this.keyManager) {
            // Monitor key management events
            this.keyManager.on('key_validated', (data) => {
                logger.info(`🔑 Key validation for ${data.provider}: ${data.result.valid ? 'VALID' : 'INVALID'}`);
            });

            this.keyManager.on('rotation_needed', (data) => {
                logger.warn(`⚠️ Key rotation needed for ${data.provider}`);
            });
        }

        if (this.performanceMonitor) {
            // Monitor performance alerts
            this.performanceMonitor.on('alert', (alert) => {
                const status = alert.active ? 'TRIGGERED' : 'RESOLVED';
                logger.warn(`🚨 Performance Alert ${status}: ${alert.type} - ${alert.value} (threshold: ${alert.threshold})`);
            });
        }
    }

    /**
     * Generate AI response with full monitoring and error handling
     */
    async generateResponse(prompt, options = {}) {
        if (!this.initialized) {
            throw new Error('AI Integration not initialized. Call initialize() first.');
        }

        const requestId = this.generateRequestId();
        const startTime = Date.now();

        try {
            // Record request start
            if (this.performanceMonitor) {
                this.performanceMonitor.recordRequestStart(
                    requestId,
                    options.preferredProvider || this.config.defaultProvider,
                    prompt,
                    options
                );
            }

            // Generate response using client manager
            const response = await this.clientManager.generateResponse(prompt, options);

            // Add request metadata
            response.metadata = {
                ...response.metadata,
                requestId,
                totalTime: Date.now() - startTime,
                monitoringEnabled: !!this.performanceMonitor,
                keyManagementEnabled: !!this.keyManager
            };

            logger.info(`✅ AI response generated successfully (${response.metadata.provider}, ${response.metadata.totalTime}ms)`);
            
            return response;

        } catch (error) {
            const responseTime = Date.now() - startTime;
            
            // Record error
            if (this.performanceMonitor) {
                this.performanceMonitor.recordError(
                    requestId,
                    options.preferredProvider || this.config.defaultProvider,
                    error,
                    responseTime
                );
            }

            logger.error(`❌ AI response generation failed (${responseTime}ms):`, error.message);
            throw error;
        }
    }

    /**
     * Get system status and health information
     */
    getStatus() {
        if (!this.initialized) {
            return { initialized: false };
        }

        const status = {
            initialized: true,
            timestamp: new Date().toISOString(),
            clientManager: this.clientManager ? this.clientManager.getStatus() : null,
            keyManager: this.keyManager ? this.keyManager.getAllKeyStatuses() : null,
            performanceMonitor: this.performanceMonitor ? this.performanceMonitor.getMetrics() : null
        };

        return status;
    }

    /**
     * Get available AI models from all providers
     */
    async getAvailableModels() {
        if (!this.initialized || !this.clientManager) {
            throw new Error('AI Integration not initialized');
        }

        return await this.clientManager.getAvailableModels();
    }

    /**
     * Validate API keys for all providers
     */
    async validateAPIKeys() {
        if (!this.keyManager) {
            return { error: 'Key management not enabled' };
        }

        const results = {};
        const providers = ['openai', 'anthropic', 'google'];

        for (const provider of providers) {
            try {
                results[provider] = await this.keyManager.validateKey(provider, true);
            } catch (error) {
                results[provider] = { valid: false, error: error.message };
            }
        }

        return results;
    }

    /**
     * Get performance metrics
     */
    getPerformanceMetrics(hours = 24) {
        if (!this.performanceMonitor) {
            return { error: 'Performance monitoring not enabled' };
        }

        return {
            current: this.performanceMonitor.getMetrics(),
            historical: this.performanceMonitor.getAggregatedData(hours)
        };
    }

    /**
     * Test AI integration with a simple prompt
     */
    async testIntegration(provider = null) {
        const testPrompt = 'Hello! Please respond with "AI integration test successful" to confirm you are working.';
        
        try {
            const response = await this.generateResponse(testPrompt, {
                preferredProvider: provider,
                maxTokens: 50,
                temperature: 0.1
            });

            return {
                success: true,
                provider: response.metadata.provider,
                responseTime: response.metadata.totalTime,
                response: response.text,
                fallbackUsed: response.metadata.fallbackUsed
            };
        } catch (error) {
            return {
                success: false,
                error: error.message,
                provider: provider || this.config.defaultProvider
            };
        }
    }

    /**
     * Run comprehensive health check
     */
    async healthCheck() {
        const results = {
            timestamp: new Date().toISOString(),
            overall: 'healthy',
            components: {}
        };

        // Check client manager
        if (this.clientManager) {
            const clientStatus = this.clientManager.getStatus();
            results.components.clientManager = {
                healthy: clientStatus.providers.length > 0,
                providers: clientStatus.providers,
                metrics: clientStatus.metrics
            };
        }

        // Check key manager
        if (this.keyManager) {
            const keyStatuses = this.keyManager.getAllKeyStatuses();
            const validKeys = Object.values(keyStatuses).filter(status => status && status.hasKey);
            results.components.keyManager = {
                healthy: validKeys.length > 0,
                totalKeys: validKeys.length,
                statuses: keyStatuses
            };
        }

        // Check performance monitor
        if (this.performanceMonitor) {
            const metrics = this.performanceMonitor.getMetrics();
            results.components.performanceMonitor = {
                healthy: true,
                metrics: metrics.summary,
                alerts: metrics.alerts
            };
        }

        // Test integration
        const integrationTest = await this.testIntegration();
        results.components.integration = integrationTest;

        // Determine overall health
        const componentHealth = Object.values(results.components).map(c => c.healthy);
        if (componentHealth.some(h => h === false)) {
            results.overall = 'degraded';
        }
        if (componentHealth.every(h => h === false)) {
            results.overall = 'unhealthy';
        }

        return results;
    }

    /**
     * Generate unique request ID
     */
    generateRequestId() {
        return `ai_req_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`;
    }

    /**
     * Cleanup all resources
     */
    async cleanup() {
        logger.info('🧹 Cleaning up Core AI Integration...');

        if (this.clientManager) {
            await this.clientManager.cleanup();
        }

        if (this.keyManager) {
            await this.keyManager.cleanup();
        }

        if (this.performanceMonitor) {
            await this.performanceMonitor.cleanup();
        }

        this.initialized = false;
        logger.info('✅ Core AI Integration cleanup complete');
    }
}

// Export singleton instance
let instance = null;

module.exports = {
    CoreAIIntegration,
    
    // Singleton access
    getInstance: (options = {}) => {
        if (!instance) {
            instance = new CoreAIIntegration(options);
        }
        return instance;
    },

    // Individual components for advanced usage
    AIClientManager,
    APIKeyManager,
    AIPerformanceMonitor
};
