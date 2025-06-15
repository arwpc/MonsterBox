/**
 * Anthropic Claude API Client
 * 
 * Handles communication with Anthropic's Claude API with proper error handling,
 * rate limiting, and retry mechanisms.
 */

const axios = require('axios');
const EventEmitter = require('events');
const logger = require('../../scripts/logger');

class AnthropicClient extends EventEmitter {
    constructor(options = {}) {
        super();
        
        this.config = {
            apiKey: options.apiKey || process.env.ANTHROPIC_API_KEY,
            baseURL: options.baseURL || 'https://api.anthropic.com/v1',
            timeout: options.timeout || 30000,
            maxRetries: options.maxRetries || 3,
            retryDelay: options.retryDelay || 1000,
            enableRateLimiting: options.enableRateLimiting !== false,
            ...options
        };

        if (!this.config.apiKey) {
            throw new Error('Anthropic API key is required');
        }

        // Rate limiting
        this.rateLimiter = {
            requests: 0,
            windowStart: Date.now(),
            maxRequestsPerMinute: 60, // Anthropic's rate limit
            maxTokensPerMinute: 100000
        };

        // Request tracking
        this.requestCount = 0;
        this.errorCount = 0;
        this.lastRequestTime = null;

        // Initialize axios instance
        this.axiosInstance = axios.create({
            baseURL: this.config.baseURL,
            timeout: this.config.timeout,
            headers: {
                'Content-Type': 'application/json',
                'x-api-key': this.config.apiKey,
                'anthropic-version': '2023-06-01'
            }
        });

        // Add request/response interceptors
        this.setupInterceptors();

        logger.info('🤖 Anthropic Claude client initialized');
    }

    /**
     * Setup axios interceptors for logging and error handling
     */
    setupInterceptors() {
        this.axiosInstance.interceptors.request.use(
            (config) => {
                this.requestCount++;
                this.lastRequestTime = Date.now();
                logger.debug(`📤 Anthropic API request: ${config.method?.toUpperCase()} ${config.url}`);
                return config;
            },
            (error) => {
                this.errorCount++;
                logger.error('📤 Anthropic request error:', error.message);
                return Promise.reject(error);
            }
        );

        this.axiosInstance.interceptors.response.use(
            (response) => {
                logger.debug(`📥 Anthropic API response: ${response.status} ${response.statusText}`);
                return response;
            },
            (error) => {
                this.errorCount++;
                this.handleAPIError(error);
                return Promise.reject(error);
            }
        );
    }

    /**
     * Handle API errors with detailed logging
     */
    handleAPIError(error) {
        if (error.response) {
            const { status, statusText, data } = error.response;
            logger.error(`❌ Anthropic API Error ${status}: ${statusText}`, data);
            
            // Emit specific error events
            if (status === 429) {
                this.emit('rate_limit_exceeded', { error, retryAfter: error.response.headers['retry-after'] });
            } else if (status >= 500) {
                this.emit('server_error', { error, status });
            } else if (status === 401) {
                this.emit('authentication_error', { error });
            }
        } else {
            logger.error('❌ Anthropic network error:', error.message);
            this.emit('network_error', { error });
        }
    }

    /**
     * Check and enforce rate limits
     */
    async checkRateLimit(estimatedTokens = 1000) {
        if (!this.config.enableRateLimiting) return;

        const now = Date.now();
        const windowDuration = 60 * 1000; // 1 minute

        // Reset window if needed
        if (now - this.rateLimiter.windowStart > windowDuration) {
            this.rateLimiter.requests = 0;
            this.rateLimiter.windowStart = now;
        }

        // Check request limit
        if (this.rateLimiter.requests >= this.rateLimiter.maxRequestsPerMinute) {
            const waitTime = windowDuration - (now - this.rateLimiter.windowStart);
            logger.warn(`⏳ Rate limit reached, waiting ${waitTime}ms`);
            await new Promise(resolve => setTimeout(resolve, waitTime));
            return this.checkRateLimit(estimatedTokens);
        }

        this.rateLimiter.requests++;
    }

    /**
     * Generate AI response using Claude
     */
    async generateResponse(prompt, options = {}) {
        try {
            await this.checkRateLimit();

            const requestBody = {
                model: options.model || 'claude-3-haiku-20240307',
                max_tokens: options.maxTokens || 150,
                temperature: options.temperature || 0.7,
                messages: this.buildMessages(prompt, options)
            };

            logger.info(`🧠 Generating Claude response for: "${prompt.slice(0, 50)}..."`);

            const response = await this.retryWithBackoff(async () => {
                return await this.axiosInstance.post('/messages', requestBody);
            });

            const result = this.parseResponse(response.data);
            
            this.emit('response_generated', {
                prompt,
                response: result,
                model: requestBody.model,
                tokens: response.data.usage
            });

            return result;

        } catch (error) {
            logger.error('❌ Claude response generation failed:', error.message);
            this.emit('generation_error', { prompt, error });
            throw error;
        }
    }

    /**
     * Build messages array for Claude API
     */
    buildMessages(prompt, options) {
        const messages = [];

        // Add conversation history
        if (options.conversationHistory && options.conversationHistory.length > 0) {
            messages.push(...options.conversationHistory);
        }

        // Add system prompt as first user message if provided
        if (options.systemPrompt) {
            messages.unshift({
                role: 'user',
                content: `System: ${options.systemPrompt}\n\nUser: ${prompt}`
            });
        } else {
            messages.push({
                role: 'user',
                content: prompt
            });
        }

        return messages;
    }

    /**
     * Parse Claude API response
     */
    parseResponse(data) {
        if (!data.content || !Array.isArray(data.content) || data.content.length === 0) {
            throw new Error('Invalid response format from Claude API');
        }

        const textContent = data.content.find(item => item.type === 'text');
        if (!textContent) {
            throw new Error('No text content found in Claude response');
        }

        return {
            text: textContent.text,
            model: data.model,
            metadata: {
                id: data.id,
                usage: data.usage,
                stopReason: data.stop_reason,
                provider: 'anthropic',
                timestamp: new Date().toISOString()
            }
        };
    }

    /**
     * Retry mechanism with exponential backoff
     */
    async retryWithBackoff(operation, maxRetries = null) {
        const retries = maxRetries || this.config.maxRetries;
        
        for (let attempt = 1; attempt <= retries; attempt++) {
            try {
                return await operation();
            } catch (error) {
                if (attempt === retries) {
                    throw error;
                }

                // Check if error is retryable
                const isRetryable = this.isRetryableError(error);
                if (!isRetryable) {
                    throw error;
                }

                const delay = this.config.retryDelay * Math.pow(2, attempt - 1);
                logger.warn(`⏳ Retrying Claude request in ${delay}ms (attempt ${attempt}/${retries})`);
                
                await new Promise(resolve => setTimeout(resolve, delay));
            }
        }
    }

    /**
     * Check if error is retryable
     */
    isRetryableError(error) {
        if (!error.response) return true; // Network errors are retryable
        
        const status = error.response.status;
        return status >= 500 || status === 429; // Server errors and rate limits
    }

    /**
     * Health check
     */
    async healthCheck() {
        try {
            const response = await this.axiosInstance.post('/messages', {
                model: 'claude-3-haiku-20240307',
                max_tokens: 10,
                messages: [{ role: 'user', content: 'Hello' }]
            });

            return {
                healthy: true,
                status: response.status,
                timestamp: new Date().toISOString()
            };
        } catch (error) {
            return {
                healthy: false,
                error: error.message,
                timestamp: new Date().toISOString()
            };
        }
    }

    /**
     * Get available models
     */
    async getAvailableModels() {
        // Anthropic doesn't have a models endpoint, return known models
        return [
            'claude-3-opus-20240229',
            'claude-3-sonnet-20240229',
            'claude-3-haiku-20240307',
            'claude-2.1',
            'claude-2.0',
            'claude-instant-1.2'
        ];
    }

    /**
     * Get client statistics
     */
    getStats() {
        return {
            provider: 'anthropic',
            requestCount: this.requestCount,
            errorCount: this.errorCount,
            errorRate: this.requestCount > 0 ? (this.errorCount / this.requestCount) * 100 : 0,
            lastRequestTime: this.lastRequestTime,
            rateLimiter: {
                currentRequests: this.rateLimiter.requests,
                maxRequestsPerMinute: this.rateLimiter.maxRequestsPerMinute,
                windowStart: this.rateLimiter.windowStart
            }
        };
    }

    /**
     * Cleanup resources
     */
    async cleanup() {
        this.removeAllListeners();
        logger.info('🧹 Anthropic client cleaned up');
    }
}

module.exports = AnthropicClient;
