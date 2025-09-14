/**
 * SSH Retry Manager for MonsterBox
 * Intelligent retry mechanisms with exponential backoff, circuit breaker patterns,
 * and failure classification for robust SSH connection management
 */

const EventEmitter = require('events');
const logger = require('../../scripts/logger');

/**
 * Retry Policy Configuration
 */
class RetryPolicy {
    constructor(options = {}) {
        // Basic retry settings
        this.maxRetries = options.maxRetries || 3;
        this.initialDelayMs = options.initialDelayMs || 1000;
        this.maxDelayMs = options.maxDelayMs || 30000;
        this.backoffMultiplier = options.backoffMultiplier || 2;
        this.jitterEnabled = options.jitterEnabled !== false;
        this.jitterMaxMs = options.jitterMaxMs || 1000;
        
        // Circuit breaker settings
        this.circuitBreakerEnabled = options.circuitBreakerEnabled !== false;
        this.failureThreshold = options.failureThreshold || 5;
        this.recoveryTimeoutMs = options.recoveryTimeoutMs || 60000;
        this.halfOpenMaxCalls = options.halfOpenMaxCalls || 3;
        
        // Failure classification
        this.retryableErrors = options.retryableErrors || [
            'ECONNREFUSED', 'ECONNRESET', 'ETIMEDOUT', 'ENOTFOUND',
            'EHOSTUNREACH', 'ENETUNREACH', 'EPIPE', 'ECONNABORTED'
        ];
        
        this.nonRetryableErrors = options.nonRetryableErrors || [
            'EACCES', 'EPERM', 'ENOENT', 'EISDIR', 'ENOTDIR',
            'AUTH_FAILED', 'INVALID_CREDENTIALS', 'HOST_KEY_MISMATCH'
        ];
        
        // Timeout settings
        this.operationTimeoutMs = options.operationTimeoutMs || 30000;
        this.totalTimeoutMs = options.totalTimeoutMs || 300000; // 5 minutes
        
        // Dead letter queue settings
        this.enableDeadLetterQueue = options.enableDeadLetterQueue !== false;
        this.deadLetterQueueMaxSize = options.deadLetterQueueMaxSize || 1000;
    }
    
    /**
     * Calculate delay for retry attempt
     */
    calculateDelay(attempt) {
        let delay = this.initialDelayMs * Math.pow(this.backoffMultiplier, attempt);
        delay = Math.min(delay, this.maxDelayMs);
        
        if (this.jitterEnabled) {
            const jitter = Math.random() * this.jitterMaxMs;
            delay += jitter;
        }
        
        return Math.floor(delay);
    }
    
    /**
     * Check if error is retryable
     */
    isRetryableError(error) {
        if (!error) return false;
        
        const errorCode = error.code || error.errno || error.name;
        const errorMessage = error.message || '';
        
        // Check non-retryable errors first
        if (this.nonRetryableErrors.some(code => 
            errorCode === code || errorMessage.includes(code))) {
            return false;
        }
        
        // Check retryable errors
        return this.retryableErrors.some(code => 
            errorCode === code || errorMessage.includes(code));
    }
}

/**
 * Circuit Breaker States
 */
const CircuitBreakerState = {
    CLOSED: 'closed',
    OPEN: 'open',
    HALF_OPEN: 'half_open'
};

/**
 * Circuit Breaker Implementation
 */
class CircuitBreaker extends EventEmitter {
    constructor(policy) {
        super();
        this.policy = policy;
        this.state = CircuitBreakerState.CLOSED;
        this.failureCount = 0;
        this.lastFailureTime = null;
        this.halfOpenCallCount = 0;
        this.successCount = 0;
        this.totalCalls = 0;
    }
    
    /**
     * Check if call is allowed
     */
    canExecute() {
        this.totalCalls++;
        
        switch (this.state) {
            case CircuitBreakerState.CLOSED:
                return true;
                
            case CircuitBreakerState.OPEN:
                if (this._shouldAttemptReset()) {
                    this._transitionToHalfOpen();
                    return true;
                }
                return false;
                
            case CircuitBreakerState.HALF_OPEN:
                return this.halfOpenCallCount < this.policy.halfOpenMaxCalls;
                
            default:
                return false;
        }
    }
    
    /**
     * Record successful execution
     */
    recordSuccess() {
        this.successCount++;
        
        if (this.state === CircuitBreakerState.HALF_OPEN) {
            this._transitionToClosed();
        } else if (this.state === CircuitBreakerState.CLOSED) {
            this.failureCount = 0;
        }
    }
    
    /**
     * Record failed execution
     */
    recordFailure() {
        this.failureCount++;
        this.lastFailureTime = Date.now();
        
        if (this.state === CircuitBreakerState.HALF_OPEN) {
            this._transitionToOpen();
        } else if (this.state === CircuitBreakerState.CLOSED && 
                   this.failureCount >= this.policy.failureThreshold) {
            this._transitionToOpen();
        }
    }
    
    /**
     * Check if should attempt reset
     */
    _shouldAttemptReset() {
        return this.lastFailureTime && 
               (Date.now() - this.lastFailureTime) >= this.policy.recoveryTimeoutMs;
    }
    
    /**
     * Transition to closed state
     */
    _transitionToClosed() {
        this.state = CircuitBreakerState.CLOSED;
        this.failureCount = 0;
        this.halfOpenCallCount = 0;
        this.emit('stateChange', 'closed');
        logger.info('Circuit breaker transitioned to CLOSED');
    }
    
    /**
     * Transition to open state
     */
    _transitionToOpen() {
        this.state = CircuitBreakerState.OPEN;
        this.halfOpenCallCount = 0;
        this.emit('stateChange', 'open');
        logger.warn('Circuit breaker transitioned to OPEN');
    }
    
    /**
     * Transition to half-open state
     */
    _transitionToHalfOpen() {
        this.state = CircuitBreakerState.HALF_OPEN;
        this.halfOpenCallCount = 0;
        this.emit('stateChange', 'half_open');
        logger.info('Circuit breaker transitioned to HALF_OPEN');
    }
    
    /**
     * Get circuit breaker statistics
     */
    getStatistics() {
        return {
            state: this.state,
            failureCount: this.failureCount,
            successCount: this.successCount,
            totalCalls: this.totalCalls,
            lastFailureTime: this.lastFailureTime,
            halfOpenCallCount: this.halfOpenCallCount
        };
    }
}

/**
 * Retry Operation Context
 */
class RetryContext {
    constructor(operation, operationId, policy) {
        this.operation = operation;
        this.operationId = operationId;
        this.policy = policy;
        this.attempt = 0;
        this.startTime = Date.now();
        this.lastError = null;
        this.errors = [];
        this.delays = [];
        this.totalDelay = 0;
    }
    
    /**
     * Check if should continue retrying
     */
    shouldRetry() {
        // Check max retries
        if (this.attempt >= this.policy.maxRetries) {
            return false;
        }
        
        // Check total timeout
        const elapsed = Date.now() - this.startTime;
        if (elapsed >= this.policy.totalTimeoutMs) {
            return false;
        }
        
        // Check if error is retryable
        if (this.lastError && !this.policy.isRetryableError(this.lastError)) {
            return false;
        }
        
        return true;
    }
    
    /**
     * Record attempt
     */
    recordAttempt(error = null) {
        this.attempt++;
        if (error) {
            this.lastError = error;
            this.errors.push({
                attempt: this.attempt,
                error: error.message || error,
                timestamp: new Date().toISOString()
            });
        }
    }
    
    /**
     * Record delay
     */
    recordDelay(delay) {
        this.delays.push(delay);
        this.totalDelay += delay;
    }
    
    /**
     * Get context summary
     */
    getSummary() {
        return {
            operationId: this.operationId,
            attempts: this.attempt,
            totalDelay: this.totalDelay,
            elapsed: Date.now() - this.startTime,
            errors: this.errors,
            lastError: this.lastError?.message
        };
    }
}

/**
 * SSH Retry Manager
 */
class SSHRetryManager extends EventEmitter {
    constructor(policy = {}) {
        super();
        this.policy = new RetryPolicy(policy);
        this.circuitBreakers = new Map(); // host -> CircuitBreaker
        this.deadLetterQueue = [];
        this.activeOperations = new Map(); // operationId -> RetryContext
        this.metrics = {
            totalOperations: 0,
            successfulOperations: 0,
            failedOperations: 0,
            retriedOperations: 0,
            totalRetries: 0,
            circuitBreakerTrips: 0,
            deadLetterQueueSize: 0
        };
        
        // Start cleanup scheduler
        this._startCleanupScheduler();
        
        logger.info('SSH Retry Manager initialized');
    }
    
    /**
     * Execute operation with retry logic
     */
    async executeWithRetry(operation, operationId, host = 'default') {
        const context = new RetryContext(operation, operationId, this.policy);
        this.activeOperations.set(operationId, context);
        this.metrics.totalOperations++;
        
        try {
            // Get or create circuit breaker for host
            const circuitBreaker = this._getCircuitBreaker(host);
            
            while (true) {
                // Check circuit breaker
                if (!circuitBreaker.canExecute()) {
                    throw new Error('Circuit breaker is OPEN - operation not allowed');
                }
                
                try {
                    // Execute operation with timeout
                    const result = await this._executeWithTimeout(operation, this.policy.operationTimeoutMs);
                    
                    // Record success
                    circuitBreaker.recordSuccess();
                    this.metrics.successfulOperations++;
                    
                    if (context.attempt > 0) {
                        this.metrics.retriedOperations++;
                    }
                    
                    this.emit('operationSuccess', {
                        operationId,
                        host,
                        attempts: context.attempt + 1,
                        totalDelay: context.totalDelay
                    });
                    
                    return result;
                    
                } catch (error) {
                    context.recordAttempt(error);
                    circuitBreaker.recordFailure();
                    
                    // Check if should retry
                    if (!context.shouldRetry()) {
                        this._handleFinalFailure(context, host, error);
                        throw error;
                    }
                    
                    // Calculate and apply delay
                    const delay = this.policy.calculateDelay(context.attempt - 1);
                    context.recordDelay(delay);
                    this.metrics.totalRetries++;
                    
                    this.emit('operationRetry', {
                        operationId,
                        host,
                        attempt: context.attempt,
                        delay,
                        error: error.message
                    });
                    
                    logger.debug(`Retrying operation ${operationId} in ${delay}ms (attempt ${context.attempt})`);
                    await this._delay(delay);
                }
            }
        } finally {
            this.activeOperations.delete(operationId);
        }
    }
    
    /**
     * Execute operation with timeout
     */
    async _executeWithTimeout(operation, timeoutMs) {
        return new Promise((resolve, reject) => {
            const timeout = setTimeout(() => {
                reject(new Error('Operation timeout'));
            }, timeoutMs);
            
            Promise.resolve(operation())
                .then(result => {
                    clearTimeout(timeout);
                    resolve(result);
                })
                .catch(error => {
                    clearTimeout(timeout);
                    reject(error);
                });
        });
    }
    
    /**
     * Handle final failure
     */
    _handleFinalFailure(context, host, error) {
        this.metrics.failedOperations++;
        
        // Add to dead letter queue if enabled
        if (this.policy.enableDeadLetterQueue) {
            this._addToDeadLetterQueue(context, host, error);
        }
        
        this.emit('operationFailed', {
            operationId: context.operationId,
            host,
            attempts: context.attempt,
            totalDelay: context.totalDelay,
            error: error.message,
            summary: context.getSummary()
        });
        
        logger.error(`Operation ${context.operationId} failed after ${context.attempt} attempts:`, error);
    }
    
    /**
     * Add operation to dead letter queue
     */
    _addToDeadLetterQueue(context, host, error) {
        if (this.deadLetterQueue.length >= this.policy.deadLetterQueueMaxSize) {
            this.deadLetterQueue.shift(); // Remove oldest entry
        }
        
        this.deadLetterQueue.push({
            operationId: context.operationId,
            host,
            timestamp: new Date().toISOString(),
            attempts: context.attempt,
            error: error.message,
            summary: context.getSummary()
        });
        
        this.metrics.deadLetterQueueSize = this.deadLetterQueue.length;
    }
    
    /**
     * Get or create circuit breaker for host
     */
    _getCircuitBreaker(host) {
        if (!this.circuitBreakers.has(host)) {
            const circuitBreaker = new CircuitBreaker(this.policy);
            
            circuitBreaker.on('stateChange', (state) => {
                if (state === 'open') {
                    this.metrics.circuitBreakerTrips++;
                }
                
                this.emit('circuitBreakerStateChange', {
                    host,
                    state,
                    statistics: circuitBreaker.getStatistics()
                });
            });
            
            this.circuitBreakers.set(host, circuitBreaker);
        }
        
        return this.circuitBreakers.get(host);
    }
    
    /**
     * Delay execution
     */
    async _delay(ms) {
        return new Promise(resolve => setTimeout(resolve, ms));
    }
    
    /**
     * Start cleanup scheduler
     */
    _startCleanupScheduler() {
        this.cleanupInterval = setInterval(() => {
            this._performCleanup();
        }, 60000); // Cleanup every minute
    }
    
    /**
     * Perform cleanup
     */
    _performCleanup() {
        // Clean up old dead letter queue entries (older than 24 hours)
        const cutoffTime = Date.now() - (24 * 60 * 60 * 1000);
        this.deadLetterQueue = this.deadLetterQueue.filter(entry => 
            new Date(entry.timestamp).getTime() > cutoffTime
        );
        
        this.metrics.deadLetterQueueSize = this.deadLetterQueue.length;
    }
    
    /**
     * Get retry statistics
     */
    getStatistics() {
        const circuitBreakerStats = {};
        for (const [host, breaker] of this.circuitBreakers) {
            circuitBreakerStats[host] = breaker.getStatistics();
        }
        
        return {
            metrics: { ...this.metrics },
            activeOperations: this.activeOperations.size,
            circuitBreakers: circuitBreakerStats,
            deadLetterQueue: {
                size: this.deadLetterQueue.length,
                entries: this.deadLetterQueue.slice(-10) // Last 10 entries
            },
            policy: {
                maxRetries: this.policy.maxRetries,
                initialDelayMs: this.policy.initialDelayMs,
                maxDelayMs: this.policy.maxDelayMs,
                circuitBreakerEnabled: this.policy.circuitBreakerEnabled,
                failureThreshold: this.policy.failureThreshold
            }
        };
    }
    
    /**
     * Reset circuit breaker for host
     */
    resetCircuitBreaker(host) {
        const circuitBreaker = this.circuitBreakers.get(host);
        if (circuitBreaker) {
            circuitBreaker._transitionToClosed();
            logger.info(`Circuit breaker reset for host: ${host}`);
        }
    }
    
    /**
     * Clear dead letter queue
     */
    clearDeadLetterQueue() {
        this.deadLetterQueue = [];
        this.metrics.deadLetterQueueSize = 0;
        logger.info('Dead letter queue cleared');
    }
    
    /**
     * Cleanup retry manager
     */
    cleanup() {
        if (this.cleanupInterval) {
            clearInterval(this.cleanupInterval);
        }
        
        this.activeOperations.clear();
        this.circuitBreakers.clear();
        
        logger.info('SSH Retry Manager cleaned up');
    }
}

module.exports = {
    SSHRetryManager,
    RetryPolicy,
    CircuitBreaker,
    CircuitBreakerState
};
