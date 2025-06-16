/**
 * Google AI (Gemini) API Client
 * 
 * Handles communication with Google's Gemini API with proper error handling,
 * rate limiting, and retry mechanisms.
 */

const axios = require('axios');
const EventEmitter = require('events');
const logger = require('../../scripts/logger');

class GoogleAIClient extends EventEmitter {
    constructor(options = {}) {
        super();
        
        this.config = {
            apiKey: options.apiKey || process.env.GOOGLE_API_KEY,
            baseURL: options.baseURL || 'https://generativelanguage.googleapis.com/v1beta',
            timeout: options.timeout || 30000,
            maxRetries: options.maxRetries || 3,
            retryDelay: options.retryDelay || 1000,
            enableRateLimiting: options.enableRateLimiting !== false,
            ...options
        };

        if (!this.config.apiKey) {
            throw new Error('Google AI API key is required');
        }

        // Rate limiting
        this.rateLimiter = {
            requests: 0,
            windowStart: Date.now(),
            maxRequestsPerMinute: 60, // Conservative limit
            maxTokensPerMinute: 32000
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
                'Content-Type': 'application/json'
            }
        });

        // Add request/response interceptors
        this.setupInterceptors();

        logger.info('🤖 Google AI (Gemini) client initialized');
    }

    /**
     * Setup axios interceptors for logging and error handling
     */
    setupInterceptors() {
        this.axiosInstance.interceptors.request.use(
            (config) => {
                this.requestCount++;
                this.lastRequestTime = Date.now();
                logger.debug(`📤 Google AI API request: ${config.method?.toUpperCase()} ${config.url}`);
                return config;
            },
            (error) => {
                this.errorCount++;
                logger.error('📤 Google AI request error:', error.message);
                return Promise.reject(error);
            }
        );

        this.axiosInstance.interceptors.response.use(
            (response) => {
                logger.debug(`📥 Google AI API response: ${response.status} ${response.statusText}`);
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
            logger.error(`❌ Google AI API Error ${status}: ${statusText}`, data);
            
            // Emit specific error events
            if (status === 429) {
                this.emit('rate_limit_exceeded', { error, retryAfter: error.response.headers['retry-after'] });
            } else if (status >= 500) {
                this.emit('server_error', { error, status });
            } else if (status === 401 || status === 403) {
                this.emit('authentication_error', { error });
            }
        } else {
            logger.error('❌ Google AI network error:', error.message);
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
     * Generate AI response using Gemini
     */
    async generateResponse(prompt, options = {}) {
        try {
            await this.checkRateLimit();

            const model = options.model || 'gemini-pro';
            const requestBody = {
                contents: this.buildContents(prompt, options),
                generationConfig: {
                    maxOutputTokens: options.maxTokens || 150,
                    temperature: options.temperature || 0.7,
                    topP: options.topP || 0.8,
                    topK: options.topK || 40
                }
            };

            logger.info(`🧠 Generating Gemini response for: "${prompt.slice(0, 50)}..."`);

            const response = await this.retryWithBackoff(async () => {
                return await this.axiosInstance.post(
                    `/models/${model}:generateContent?key=${this.config.apiKey}`,
                    requestBody
                );
            });

            const result = this.parseResponse(response.data, model);
            
            this.emit('response_generated', {
                prompt,
                response: result,
                model,
                usage: response.data.usageMetadata
            });

            return result;

        } catch (error) {
            logger.error('❌ Gemini response generation failed:', error.message);
            this.emit('generation_error', { prompt, error });
            throw error;
        }
    }

    /**
     * Build contents array for Gemini API
     */
    buildContents(prompt, options) {
        const contents = [];

        // Add system prompt if provided
        if (options.systemPrompt) {
            contents.push({
                role: 'user',
                parts: [{ text: `System: ${options.systemPrompt}` }]
            });
            contents.push({
                role: 'model',
                parts: [{ text: 'I understand. I will follow these instructions.' }]
            });
        }

        // Add conversation history
        if (options.conversationHistory && options.conversationHistory.length > 0) {
            for (const message of options.conversationHistory) {
                contents.push({
                    role: message.role === 'assistant' ? 'model' : 'user',
                    parts: [{ text: message.content }]
                });
            }
        }

        // Add current prompt
        contents.push({
            role: 'user',
            parts: [{ text: prompt }]
        });

        return contents;
    }

    /**
     * Parse Gemini API response
     */
    parseResponse(data, model) {
        if (!data.candidates || data.candidates.length === 0) {
            throw new Error('No candidates found in Gemini response');
        }

        const candidate = data.candidates[0];
        if (!candidate.content || !candidate.content.parts || candidate.content.parts.length === 0) {
            throw new Error('No content found in Gemini response');
        }

        const textPart = candidate.content.parts.find(part => part.text);
        if (!textPart) {
            throw new Error('No text content found in Gemini response');
        }

        return {
            text: textPart.text,
            model: model,
            metadata: {
                finishReason: candidate.finishReason,
                safetyRatings: candidate.safetyRatings,
                usage: data.usageMetadata,
                provider: 'google',
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
                logger.warn(`⏳ Retrying Gemini request in ${delay}ms (attempt ${attempt}/${retries})`);
                
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
            const response = await this.axiosInstance.post(
                `/models/gemini-pro:generateContent?key=${this.config.apiKey}`,
                {
                    contents: [{
                        role: 'user',
                        parts: [{ text: 'Hello' }]
                    }],
                    generationConfig: {
                        maxOutputTokens: 10
                    }
                }
            );

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
            const response = await this.axiosInstance.get(`/models?key=${this.config.apiKey}`);
            
            return response.data.models
                .filter(model => model.supportedGenerationMethods?.includes('generateContent'))
                .map(model => model.name.replace('models/', ''));
        } catch (error) {
            logger.warn('Failed to fetch Google AI models, returning defaults');
            return [
                'gemini-pro',
                'gemini-pro-vision',
                'gemini-1.5-pro',
                'gemini-1.5-flash'
            ];
        }
    }

    /**
     * Get client statistics
     */
    getStats() {
        return {
            provider: 'google',
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
        logger.info('🧹 Google AI client cleaned up');
    }
}

module.exports = GoogleAIClient;
