/**
 * Enhanced OpenAI API Client
 * 
 * Handles communication with OpenAI's API with proper error handling,
 * rate limiting, and retry mechanisms.
 */

const axios = require('axios');
const EventEmitter = require('events');
const logger = require('../../scripts/logger');

class OpenAIClient extends EventEmitter {
    constructor(options = {}) {
        super();
        
        this.config = {
            apiKey: options.apiKey || process.env.OPENAI_API_KEY,
            baseURL: options.baseURL || 'https://api.openai.com/v1',
            timeout: options.timeout || 30000,
            maxRetries: options.maxRetries || 3,
            retryDelay: options.retryDelay || 1000,
            enableRateLimiting: options.enableRateLimiting !== false,
            ...options
        };

        if (!this.config.apiKey) {
            throw new Error('OpenAI API key is required');
        }

        // Rate limiting
        this.rateLimiter = {
            requests: 0,
            windowStart: Date.now(),
            maxRequestsPerMinute: 3500, // OpenAI's rate limit for tier 1
            maxTokensPerMinute: 90000
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
                'Authorization': `Bearer ${this.config.apiKey}`,
                'User-Agent': 'MonsterBox-AI-Client/1.0'
            }
        });

        // Add request/response interceptors
        this.setupInterceptors();

        logger.info('🤖 OpenAI client initialized');
    }

    /**
     * Setup axios interceptors for logging and error handling
     */
    setupInterceptors() {
        this.axiosInstance.interceptors.request.use(
            (config) => {
                this.requestCount++;
                this.lastRequestTime = Date.now();
                logger.debug(`📤 OpenAI API request: ${config.method?.toUpperCase()} ${config.url}`);
                return config;
            },
            (error) => {
                this.errorCount++;
                logger.error('📤 OpenAI request error:', error.message);
                return Promise.reject(error);
            }
        );

        this.axiosInstance.interceptors.response.use(
            (response) => {
                logger.debug(`📥 OpenAI API response: ${response.status} ${response.statusText}`);
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
            logger.error(`❌ OpenAI API Error ${status}: ${statusText}`, data);
            
            // Emit specific error events
            if (status === 429) {
                this.emit('rate_limit_exceeded', { error, retryAfter: error.response.headers['retry-after'] });
            } else if (status >= 500) {
                this.emit('server_error', { error, status });
            } else if (status === 401) {
                this.emit('authentication_error', { error });
            } else if (status === 400) {
                this.emit('bad_request', { error });
            }
        } else {
            logger.error('❌ OpenAI network error:', error.message);
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
     * Generate AI response using OpenAI
     */
    async generateResponse(prompt, options = {}) {
        try {
            await this.checkRateLimit();

            const requestBody = {
                model: options.model || 'gpt-3.5-turbo',
                messages: this.buildMessages(prompt, options),
                max_tokens: options.maxTokens || 150,
                temperature: options.temperature || 0.7,
                top_p: options.topP || 1,
                frequency_penalty: options.frequencyPenalty || 0,
                presence_penalty: options.presencePenalty || 0
            };

            logger.info(`🧠 Generating OpenAI response for: "${prompt.slice(0, 50)}..."`);

            const response = await this.retryWithBackoff(async () => {
                return await this.axiosInstance.post('/chat/completions', requestBody);
            });

            const result = this.parseResponse(response.data);
            
            this.emit('response_generated', {
                prompt,
                response: result,
                model: requestBody.model,
                usage: response.data.usage
            });

            return result;

        } catch (error) {
            logger.error('❌ OpenAI response generation failed:', error.message);
            this.emit('generation_error', { prompt, error });
            throw error;
        }
    }

    /**
     * Build messages array for OpenAI API
     */
    buildMessages(prompt, options) {
        const messages = [];

        // Add system prompt
        if (options.systemPrompt) {
            messages.push({
                role: 'system',
                content: options.systemPrompt
            });
        }

        // Add conversation history
        if (options.conversationHistory && options.conversationHistory.length > 0) {
            messages.push(...options.conversationHistory);
        }

        // Add current prompt
        messages.push({
            role: 'user',
            content: prompt
        });

        return messages;
    }

    /**
     * Parse OpenAI API response
     */
    parseResponse(data) {
        if (!data.choices || data.choices.length === 0) {
            throw new Error('No choices found in OpenAI response');
        }

        const choice = data.choices[0];
        if (!choice.message || !choice.message.content) {
            throw new Error('No message content found in OpenAI response');
        }

        return {
            text: choice.message.content,
            model: data.model,
            metadata: {
                id: data.id,
                usage: data.usage,
                finishReason: choice.finish_reason,
                provider: 'openai',
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
                logger.warn(`⏳ Retrying OpenAI request in ${delay}ms (attempt ${attempt}/${retries})`);
                
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
            const response = await this.axiosInstance.post('/chat/completions', {
                model: 'gpt-3.5-turbo',
                messages: [{ role: 'user', content: 'Hello' }],
                max_tokens: 10
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
        try {
            const response = await this.axiosInstance.get('/models');
            
            return response.data.data
                .filter(model => model.id.includes('gpt'))
                .map(model => model.id)
                .sort();
        } catch (error) {
            logger.warn('Failed to fetch OpenAI models, returning defaults');
            return [
                'gpt-4',
                'gpt-4-turbo-preview',
                'gpt-3.5-turbo',
                'gpt-3.5-turbo-16k'
            ];
        }
    }

    /**
     * Get client statistics
     */
    getStats() {
        return {
            provider: 'openai',
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
        logger.info('🧹 OpenAI client cleaned up');
    }
}

module.exports = OpenAIClient;
