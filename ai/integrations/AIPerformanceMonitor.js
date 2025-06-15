/**
 * AI Performance Monitoring System
 * 
 * Monitors AI API performance, tracks metrics, and provides
 * insights for optimization and troubleshooting.
 */

const EventEmitter = require('events');
const fs = require('fs').promises;
const path = require('path');
const logger = require('../../scripts/logger');

class AIPerformanceMonitor extends EventEmitter {
    constructor(options = {}) {
        super();
        
        this.config = {
            metricsRetentionDays: options.metricsRetentionDays || 30,
            aggregationInterval: options.aggregationInterval || 5 * 60 * 1000, // 5 minutes
            alertThresholds: {
                errorRate: options.errorRateThreshold || 10, // 10%
                avgResponseTime: options.avgResponseTimeThreshold || 5000, // 5 seconds
                failureCount: options.failureCountThreshold || 5
            },
            enablePersistence: options.enablePersistence !== false,
            metricsPath: options.metricsPath || './logs/ai-metrics',
            ...options
        };

        // Real-time metrics
        this.metrics = {
            requests: {
                total: 0,
                successful: 0,
                failed: 0,
                byProvider: {}
            },
            performance: {
                totalResponseTime: 0,
                avgResponseTime: 0,
                minResponseTime: Infinity,
                maxResponseTime: 0,
                byProvider: {}
            },
            errors: {
                total: 0,
                byType: {},
                byProvider: {},
                recent: []
            },
            usage: {
                totalTokens: 0,
                totalCost: 0,
                byProvider: {}
            }
        };

        // Time-series data
        this.timeSeries = [];
        this.aggregatedData = [];

        // Alert state
        this.alertState = {
            errorRateAlert: false,
            responseTimeAlert: false,
            failureAlert: false
        };

        this.initialize();
    }

    /**
     * Initialize the performance monitor
     */
    async initialize() {
        try {
            if (this.config.enablePersistence) {
                await this.loadPersistedMetrics();
                this.startPersistenceScheduler();
            }
            
            this.startAggregationScheduler();
            this.startAlertMonitoring();
            
            logger.info('📊 AI Performance Monitor initialized');
        } catch (error) {
            logger.error('❌ Failed to initialize Performance Monitor:', error.message);
        }
    }

    /**
     * Record a request start
     */
    recordRequestStart(requestId, provider, prompt, options = {}) {
        const timestamp = Date.now();
        
        this.timeSeries.push({
            id: requestId,
            type: 'request_start',
            provider,
            timestamp,
            prompt: prompt.slice(0, 100), // Store first 100 chars
            model: options.model,
            maxTokens: options.maxTokens
        });

        // Update provider metrics
        this.initializeProviderMetrics(provider);
        
        this.emit('request_started', { requestId, provider, timestamp });
    }

    /**
     * Record a successful response
     */
    recordResponse(requestId, provider, response, responseTime) {
        const timestamp = Date.now();
        
        // Update request metrics
        this.metrics.requests.total++;
        this.metrics.requests.successful++;
        this.metrics.requests.byProvider[provider].total++;
        this.metrics.requests.byProvider[provider].successful++;

        // Update performance metrics
        this.updatePerformanceMetrics(provider, responseTime);

        // Update usage metrics
        if (response.metadata && response.metadata.usage) {
            this.updateUsageMetrics(provider, response.metadata.usage);
        }

        // Record time series data
        this.timeSeries.push({
            id: requestId,
            type: 'response_success',
            provider,
            timestamp,
            responseTime,
            tokens: response.metadata?.usage?.total_tokens || 0,
            model: response.model
        });

        this.emit('response_recorded', { 
            requestId, 
            provider, 
            responseTime, 
            success: true 
        });

        this.checkAlerts();
    }

    /**
     * Record a failed request
     */
    recordError(requestId, provider, error, responseTime = null) {
        const timestamp = Date.now();
        
        // Update request metrics
        this.metrics.requests.total++;
        this.metrics.requests.failed++;
        this.metrics.requests.byProvider[provider].total++;
        this.metrics.requests.byProvider[provider].failed++;

        // Update error metrics
        this.metrics.errors.total++;
        
        const errorType = this.categorizeError(error);
        this.metrics.errors.byType[errorType] = (this.metrics.errors.byType[errorType] || 0) + 1;
        this.metrics.errors.byProvider[provider] = (this.metrics.errors.byProvider[provider] || 0) + 1;

        // Store recent error
        this.metrics.errors.recent.push({
            timestamp,
            provider,
            error: error.message,
            type: errorType,
            requestId
        });

        // Keep only last 100 errors
        if (this.metrics.errors.recent.length > 100) {
            this.metrics.errors.recent = this.metrics.errors.recent.slice(-100);
        }

        // Record time series data
        this.timeSeries.push({
            id: requestId,
            type: 'response_error',
            provider,
            timestamp,
            responseTime,
            error: error.message,
            errorType
        });

        this.emit('error_recorded', { 
            requestId, 
            provider, 
            error, 
            errorType 
        });

        this.checkAlerts();
    }

    /**
     * Initialize provider metrics if not exists
     */
    initializeProviderMetrics(provider) {
        if (!this.metrics.requests.byProvider[provider]) {
            this.metrics.requests.byProvider[provider] = {
                total: 0,
                successful: 0,
                failed: 0
            };
        }

        if (!this.metrics.performance.byProvider[provider]) {
            this.metrics.performance.byProvider[provider] = {
                totalResponseTime: 0,
                avgResponseTime: 0,
                minResponseTime: Infinity,
                maxResponseTime: 0,
                requestCount: 0
            };
        }

        if (!this.metrics.usage.byProvider[provider]) {
            this.metrics.usage.byProvider[provider] = {
                totalTokens: 0,
                totalCost: 0,
                requestCount: 0
            };
        }
    }

    /**
     * Update performance metrics
     */
    updatePerformanceMetrics(provider, responseTime) {
        // Global metrics
        this.metrics.performance.totalResponseTime += responseTime;
        this.metrics.performance.avgResponseTime = 
            this.metrics.performance.totalResponseTime / this.metrics.requests.successful;
        this.metrics.performance.minResponseTime = 
            Math.min(this.metrics.performance.minResponseTime, responseTime);
        this.metrics.performance.maxResponseTime = 
            Math.max(this.metrics.performance.maxResponseTime, responseTime);

        // Provider metrics
        const providerMetrics = this.metrics.performance.byProvider[provider];
        providerMetrics.totalResponseTime += responseTime;
        providerMetrics.requestCount++;
        providerMetrics.avgResponseTime = 
            providerMetrics.totalResponseTime / providerMetrics.requestCount;
        providerMetrics.minResponseTime = 
            Math.min(providerMetrics.minResponseTime, responseTime);
        providerMetrics.maxResponseTime = 
            Math.max(providerMetrics.maxResponseTime, responseTime);
    }

    /**
     * Update usage metrics
     */
    updateUsageMetrics(provider, usage) {
        const tokens = usage.total_tokens || usage.totalTokens || 0;
        const cost = this.estimateCost(provider, usage);

        // Global metrics
        this.metrics.usage.totalTokens += tokens;
        this.metrics.usage.totalCost += cost;

        // Provider metrics
        const providerUsage = this.metrics.usage.byProvider[provider];
        providerUsage.totalTokens += tokens;
        providerUsage.totalCost += cost;
        providerUsage.requestCount++;
    }

    /**
     * Estimate cost based on provider and usage
     */
    estimateCost(provider, usage) {
        const costPerToken = {
            openai: 0.0000015, // Approximate for GPT-3.5-turbo
            anthropic: 0.000008, // Approximate for Claude
            google: 0.000001 // Approximate for Gemini
        };

        const rate = costPerToken[provider] || 0;
        const tokens = usage.total_tokens || usage.totalTokens || 0;
        
        return tokens * rate;
    }

    /**
     * Categorize error for metrics
     */
    categorizeError(error) {
        const message = error.message.toLowerCase();
        
        if (message.includes('rate limit') || message.includes('429')) {
            return 'rate_limit';
        } else if (message.includes('timeout')) {
            return 'timeout';
        } else if (message.includes('network') || message.includes('connection')) {
            return 'network';
        } else if (message.includes('auth') || message.includes('401') || message.includes('403')) {
            return 'authentication';
        } else if (message.includes('400') || message.includes('bad request')) {
            return 'bad_request';
        } else if (message.includes('500') || message.includes('server')) {
            return 'server_error';
        } else {
            return 'unknown';
        }
    }

    /**
     * Get current metrics summary
     */
    getMetrics() {
        const errorRate = this.metrics.requests.total > 0 
            ? (this.metrics.requests.failed / this.metrics.requests.total) * 100 
            : 0;

        return {
            summary: {
                totalRequests: this.metrics.requests.total,
                successRate: this.metrics.requests.total > 0 
                    ? (this.metrics.requests.successful / this.metrics.requests.total) * 100 
                    : 0,
                errorRate,
                avgResponseTime: this.metrics.performance.avgResponseTime,
                totalTokens: this.metrics.usage.totalTokens,
                estimatedCost: this.metrics.usage.totalCost
            },
            requests: this.metrics.requests,
            performance: this.metrics.performance,
            errors: this.metrics.errors,
            usage: this.metrics.usage,
            alerts: this.alertState
        };
    }

    /**
     * Get aggregated data for time period
     */
    getAggregatedData(hours = 24) {
        const cutoff = Date.now() - (hours * 60 * 60 * 1000);
        
        return this.aggregatedData.filter(data => data.timestamp > cutoff);
    }

    /**
     * Check alert conditions
     */
    checkAlerts() {
        const metrics = this.getMetrics();
        
        // Error rate alert
        const errorRateAlert = metrics.summary.errorRate > this.config.alertThresholds.errorRate;
        if (errorRateAlert !== this.alertState.errorRateAlert) {
            this.alertState.errorRateAlert = errorRateAlert;
            this.emit('alert', {
                type: 'error_rate',
                active: errorRateAlert,
                value: metrics.summary.errorRate,
                threshold: this.config.alertThresholds.errorRate
            });
        }

        // Response time alert
        const responseTimeAlert = metrics.summary.avgResponseTime > this.config.alertThresholds.avgResponseTime;
        if (responseTimeAlert !== this.alertState.responseTimeAlert) {
            this.alertState.responseTimeAlert = responseTimeAlert;
            this.emit('alert', {
                type: 'response_time',
                active: responseTimeAlert,
                value: metrics.summary.avgResponseTime,
                threshold: this.config.alertThresholds.avgResponseTime
            });
        }
    }

    /**
     * Start aggregation scheduler
     */
    startAggregationScheduler() {
        setInterval(() => {
            this.aggregateMetrics();
        }, this.config.aggregationInterval);
    }

    /**
     * Start alert monitoring
     */
    startAlertMonitoring() {
        setInterval(() => {
            this.checkAlerts();
        }, 60 * 1000); // Check every minute
    }

    /**
     * Start persistence scheduler
     */
    startPersistenceScheduler() {
        setInterval(() => {
            this.persistMetrics();
        }, 10 * 60 * 1000); // Persist every 10 minutes
    }

    /**
     * Aggregate current metrics
     */
    aggregateMetrics() {
        const timestamp = Date.now();
        const metrics = this.getMetrics();
        
        this.aggregatedData.push({
            timestamp,
            ...metrics.summary
        });

        // Keep only recent aggregated data
        const cutoff = timestamp - (this.config.metricsRetentionDays * 24 * 60 * 60 * 1000);
        this.aggregatedData = this.aggregatedData.filter(data => data.timestamp > cutoff);
    }

    /**
     * Persist metrics to disk
     */
    async persistMetrics() {
        if (!this.config.enablePersistence) return;

        try {
            const metricsDir = path.dirname(this.config.metricsPath);
            await fs.mkdir(metricsDir, { recursive: true });

            const data = {
                metrics: this.metrics,
                aggregatedData: this.aggregatedData,
                timestamp: Date.now()
            };

            await fs.writeFile(
                `${this.config.metricsPath}-${Date.now()}.json`,
                JSON.stringify(data, null, 2)
            );
        } catch (error) {
            logger.error('❌ Failed to persist metrics:', error.message);
        }
    }

    /**
     * Load persisted metrics
     */
    async loadPersistedMetrics() {
        try {
            const metricsDir = path.dirname(this.config.metricsPath);
            const files = await fs.readdir(metricsDir);
            
            const metricsFiles = files
                .filter(file => file.startsWith(path.basename(this.config.metricsPath)))
                .sort()
                .slice(-5); // Load last 5 files

            for (const file of metricsFiles) {
                const filePath = path.join(metricsDir, file);
                const data = JSON.parse(await fs.readFile(filePath, 'utf8'));
                
                // Merge aggregated data
                this.aggregatedData.push(...data.aggregatedData);
            }

            // Remove duplicates and sort
            this.aggregatedData = this.aggregatedData
                .filter((item, index, arr) => 
                    arr.findIndex(other => other.timestamp === item.timestamp) === index)
                .sort((a, b) => a.timestamp - b.timestamp);

        } catch (error) {
            logger.warn('⚠️ Could not load persisted metrics:', error.message);
        }
    }

    /**
     * Reset metrics
     */
    resetMetrics() {
        this.metrics = {
            requests: { total: 0, successful: 0, failed: 0, byProvider: {} },
            performance: { totalResponseTime: 0, avgResponseTime: 0, minResponseTime: Infinity, maxResponseTime: 0, byProvider: {} },
            errors: { total: 0, byType: {}, byProvider: {}, recent: [] },
            usage: { totalTokens: 0, totalCost: 0, byProvider: {} }
        };
        
        this.emit('metrics_reset');
        logger.info('📊 Metrics reset');
    }

    /**
     * Cleanup resources
     */
    async cleanup() {
        if (this.config.enablePersistence) {
            await this.persistMetrics();
        }
        
        this.removeAllListeners();
        logger.info('🧹 Performance Monitor cleaned up');
    }
}

module.exports = AIPerformanceMonitor;
