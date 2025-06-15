/**
 * Unified AI Client Manager
 * 
 * Manages multiple AI service providers with unified interface,
 * error handling, rate limiting, and fallback mechanisms.
 */

const EventEmitter = require('events');
const logger = require('../../scripts/logger');

// Import individual AI clients
const OpenAIClient = require('./OpenAIClient');
const AnthropicClient = require('./AnthropicClient');
const GoogleAIClient = require('./GoogleAIClient');

class AIClientManager extends EventEmitter {
    constructor(options = {}) {
        super();
        
        this.config = {
            defaultProvider: options.defaultProvider || 'openai',
            fallbackProviders: options.fallbackProviders || ['anthropic', 'google'],
            maxRetries: options.maxRetries || 3,
            retryDelay: options.retryDelay || 1000,
            timeout: options.timeout || 30000,
            enableFallback: options.enableFallback !== false,
            enableRateLimiting: options.enableRateLimiting !== false,
            ...options
        };

        // Initialize clients
        this.clients = new Map();
        this.rateLimiters = new Map();
        this.healthStatus = new Map();
        
        // Performance metrics
        this.metrics = {
            totalRequests: 0,
            successfulRequests: 0,
            failedRequests: 0,
            fallbackRequests: 0,
            averageResponseTime: 0,
            providerUsage: {}
        };

        this.initializeClients();
        this.startHealthMonitoring();
    }

    /**
     * Initialize all available AI clients
     */
    initializeClients() {
        const clientConfigs = [
            { name: 'openai', ClientClass: OpenAIClient, apiKey: process.env.OPENAI_API_KEY },
            { name: 'anthropic', ClientClass: AnthropicClient, apiKey: process.env.ANTHROPIC_API_KEY },
            { name: 'google', ClientClass: GoogleAIClient, apiKey: process.env.GOOGLE_API_KEY }
        ];

        for (const { name, ClientClass, apiKey } of clientConfigs) {
            try {
                if (apiKey) {
                    const client = new ClientClass({
                        apiKey,
                        timeout: this.config.timeout,
                        enableRateLimiting: this.config.enableRateLimiting
                    });
                    
                    this.clients.set(name, client);
                    this.healthStatus.set(name, { healthy: true, lastCheck: Date.now() });
                    this.metrics.providerUsage[name] = { requests: 0, errors: 0, avgResponseTime: 0 };
                    
                    logger.info(`✅ ${name} AI client initialized`);
                } else {
                    logger.warn(`⚠️ ${name} API key not found, client not initialized`);
                }
            } catch (error) {
                logger.error(`❌ Failed to initialize ${name} client: ${error.message}`);
                this.healthStatus.set(name, { healthy: false, lastCheck: Date.now(), error: error.message });
            }
        }

        if (this.clients.size === 0) {
            throw new Error('No AI clients could be initialized. Please check your API keys.');
        }

        logger.info(`🤖 AI Client Manager initialized with ${this.clients.size} providers`);
    }

    /**
     * Generate AI response with automatic fallback
     */
    async generateResponse(prompt, options = {}) {
        const startTime = Date.now();
        this.metrics.totalRequests++;

        const requestOptions = {
            model: options.model,
            maxTokens: options.maxTokens || 150,
            temperature: options.temperature || 0.7,
            systemPrompt: options.systemPrompt,
            conversationHistory: options.conversationHistory || [],
            ...options
        };

        // Determine provider order
        const providers = this.getProviderOrder(options.preferredProvider);
        
        let lastError = null;
        
        for (const [index, provider] of providers.entries()) {
            try {
                const client = this.clients.get(provider);
                if (!client || !this.isProviderHealthy(provider)) {
                    continue;
                }

                logger.info(`🧠 Attempting AI generation with ${provider} (attempt ${index + 1})`);
                
                const response = await this.executeWithTimeout(
                    client.generateResponse(prompt, requestOptions),
                    this.config.timeout
                );

                // Update metrics
                const responseTime = Date.now() - startTime;
                this.updateMetrics(provider, responseTime, true);
                this.metrics.successfulRequests++;

                // Add metadata
                response.metadata = {
                    ...response.metadata,
                    provider,
                    responseTime,
                    fallbackUsed: index > 0,
                    timestamp: new Date().toISOString()
                };

                this.emit('response_generated', {
                    provider,
                    prompt,
                    response,
                    responseTime,
                    fallbackUsed: index > 0
                });

                return response;

            } catch (error) {
                lastError = error;
                logger.warn(`⚠️ ${provider} failed: ${error.message}`);
                
                this.updateMetrics(provider, Date.now() - startTime, false);
                this.updateProviderHealth(provider, false, error.message);
                
                // If this was a fallback attempt, increment fallback counter
                if (index > 0) {
                    this.metrics.fallbackRequests++;
                }
            }
        }

        // All providers failed
        this.metrics.failedRequests++;
        const error = new Error(`All AI providers failed. Last error: ${lastError?.message || 'Unknown error'}`);
        
        this.emit('all_providers_failed', {
            prompt,
            providers,
            lastError,
            responseTime: Date.now() - startTime
        });

        throw error;
    }

    /**
     * Get provider order based on health and preferences
     */
    getProviderOrder(preferredProvider) {
        const preferred = preferredProvider || this.config.defaultProvider;
        const providers = [preferred];
        
        // Add fallback providers
        for (const fallback of this.config.fallbackProviders) {
            if (fallback !== preferred && this.clients.has(fallback)) {
                providers.push(fallback);
            }
        }

        // Add any remaining healthy providers
        for (const [name] of this.clients) {
            if (!providers.includes(name) && this.isProviderHealthy(name)) {
                providers.push(name);
            }
        }

        return providers;
    }

    /**
     * Check if provider is healthy
     */
    isProviderHealthy(provider) {
        const status = this.healthStatus.get(provider);
        if (!status) return false;
        
        // Consider provider unhealthy if it failed recently
        const timeSinceLastCheck = Date.now() - status.lastCheck;
        const healthyThreshold = 5 * 60 * 1000; // 5 minutes
        
        return status.healthy || timeSinceLastCheck > healthyThreshold;
    }

    /**
     * Update provider health status
     */
    updateProviderHealth(provider, healthy, error = null) {
        this.healthStatus.set(provider, {
            healthy,
            lastCheck: Date.now(),
            error: healthy ? null : error
        });
    }

    /**
     * Update performance metrics
     */
    updateMetrics(provider, responseTime, success) {
        const usage = this.metrics.providerUsage[provider];
        if (usage) {
            usage.requests++;
            if (!success) usage.errors++;
            
            // Update average response time
            usage.avgResponseTime = (usage.avgResponseTime * (usage.requests - 1) + responseTime) / usage.requests;
        }

        // Update overall average
        this.metrics.averageResponseTime = 
            (this.metrics.averageResponseTime * (this.metrics.totalRequests - 1) + responseTime) / this.metrics.totalRequests;
    }

    /**
     * Execute operation with timeout
     */
    async executeWithTimeout(promise, timeout) {
        return Promise.race([
            promise,
            new Promise((_, reject) => 
                setTimeout(() => reject(new Error('Request timeout')), timeout)
            )
        ]);
    }

    /**
     * Start health monitoring for all providers
     */
    startHealthMonitoring() {
        setInterval(() => {
            this.performHealthChecks();
        }, 5 * 60 * 1000); // Check every 5 minutes
    }

    /**
     * Perform health checks on all providers
     */
    async performHealthChecks() {
        for (const [name, client] of this.clients) {
            try {
                await client.healthCheck();
                this.updateProviderHealth(name, true);
            } catch (error) {
                this.updateProviderHealth(name, false, error.message);
            }
        }
    }

    /**
     * Get current metrics and status
     */
    getStatus() {
        return {
            providers: Array.from(this.clients.keys()),
            healthStatus: Object.fromEntries(this.healthStatus),
            metrics: this.metrics,
            config: {
                defaultProvider: this.config.defaultProvider,
                fallbackProviders: this.config.fallbackProviders,
                enableFallback: this.config.enableFallback
            }
        };
    }

    /**
     * Get available models from all providers
     */
    async getAvailableModels() {
        const models = {};
        
        for (const [name, client] of this.clients) {
            try {
                if (this.isProviderHealthy(name) && typeof client.getAvailableModels === 'function') {
                    models[name] = await client.getAvailableModels();
                }
            } catch (error) {
                logger.warn(`Failed to get models from ${name}: ${error.message}`);
            }
        }
        
        return models;
    }

    /**
     * Cleanup resources
     */
    async cleanup() {
        for (const [name, client] of this.clients) {
            try {
                if (typeof client.cleanup === 'function') {
                    await client.cleanup();
                }
            } catch (error) {
                logger.warn(`Error cleaning up ${name} client: ${error.message}`);
            }
        }
        
        this.clients.clear();
        this.removeAllListeners();
        
        logger.info('🧹 AI Client Manager cleaned up');
    }
}

module.exports = AIClientManager;
