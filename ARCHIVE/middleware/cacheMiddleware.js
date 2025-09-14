/**
 * Caching Middleware for MonsterBox
 * 
 * Provides intelligent response caching with configurable TTL,
 * cache invalidation, and performance optimization for API endpoints.
 */

const logger = require('../scripts/logger');

class CacheManager {
    constructor(options = {}) {
        this.cache = new Map();
        this.config = {
            defaultTTL: options.defaultTTL || 300000, // 5 minutes
            maxCacheSize: options.maxCacheSize || 1000,
            enableCompression: options.enableCompression !== false,
            enableMetrics: options.enableMetrics !== false,
            ...options
        };
        
        this.metrics = {
            hits: 0,
            misses: 0,
            sets: 0,
            deletes: 0,
            evictions: 0
        };
        
        // Cleanup interval
        this.cleanupInterval = setInterval(() => {
            this.cleanup();
        }, 60000); // Every minute
    }

    /**
     * Get cached value
     */
    get(key) {
        const entry = this.cache.get(key);
        
        if (!entry) {
            this.metrics.misses++;
            return null;
        }
        
        // Check if expired
        if (Date.now() > entry.expiresAt) {
            this.cache.delete(key);
            this.metrics.misses++;
            return null;
        }
        
        // Update access time
        entry.lastAccessed = Date.now();
        this.metrics.hits++;
        
        return entry.data;
    }

    /**
     * Set cached value
     */
    set(key, data, ttl = this.config.defaultTTL) {
        // Check cache size limit
        if (this.cache.size >= this.config.maxCacheSize) {
            this.evictLRU();
        }
        
        const entry = {
            data,
            createdAt: Date.now(),
            lastAccessed: Date.now(),
            expiresAt: Date.now() + ttl,
            ttl,
            size: this.calculateSize(data)
        };
        
        this.cache.set(key, entry);
        this.metrics.sets++;
        
        logger.debug(`Cache set: ${key} (TTL: ${ttl}ms)`);
    }

    /**
     * Delete cached value
     */
    delete(key) {
        const deleted = this.cache.delete(key);
        if (deleted) {
            this.metrics.deletes++;
            logger.debug(`Cache delete: ${key}`);
        }
        return deleted;
    }

    /**
     * Clear cache with optional pattern
     */
    clear(pattern = null) {
        if (!pattern) {
            const size = this.cache.size;
            this.cache.clear();
            logger.info(`Cache cleared: ${size} entries removed`);
            return size;
        }
        
        // Pattern-based clearing
        const regex = new RegExp(pattern);
        let cleared = 0;
        
        for (const key of this.cache.keys()) {
            if (regex.test(key)) {
                this.cache.delete(key);
                cleared++;
            }
        }
        
        logger.info(`Cache cleared with pattern '${pattern}': ${cleared} entries removed`);
        return cleared;
    }

    /**
     * Evict least recently used entry
     */
    evictLRU() {
        let lruKey = null;
        let lruTime = Date.now();
        
        for (const [key, entry] of this.cache) {
            if (entry.lastAccessed < lruTime) {
                lruTime = entry.lastAccessed;
                lruKey = key;
            }
        }
        
        if (lruKey) {
            this.cache.delete(lruKey);
            this.metrics.evictions++;
            logger.debug(`Cache evicted LRU: ${lruKey}`);
        }
    }

    /**
     * Cleanup expired entries
     */
    cleanup() {
        const now = Date.now();
        let cleaned = 0;
        
        for (const [key, entry] of this.cache) {
            if (now > entry.expiresAt) {
                this.cache.delete(key);
                cleaned++;
            }
        }
        
        if (cleaned > 0) {
            logger.debug(`Cache cleanup: ${cleaned} expired entries removed`);
        }
    }

    /**
     * Calculate approximate size of data
     */
    calculateSize(data) {
        try {
            return JSON.stringify(data).length;
        } catch {
            return 0;
        }
    }

    /**
     * Get cache statistics
     */
    getStats() {
        const totalRequests = this.metrics.hits + this.metrics.misses;
        const hitRate = totalRequests > 0 ? (this.metrics.hits / totalRequests) * 100 : 0;
        
        let totalSize = 0;
        for (const entry of this.cache.values()) {
            totalSize += entry.size;
        }
        
        return {
            entries: this.cache.size,
            maxSize: this.config.maxCacheSize,
            totalSize,
            hitRate: Math.round(hitRate * 100) / 100,
            metrics: { ...this.metrics }
        };
    }

    /**
     * Shutdown cache manager
     */
    shutdown() {
        if (this.cleanupInterval) {
            clearInterval(this.cleanupInterval);
        }
        this.cache.clear();
        logger.info('Cache manager shutdown complete');
    }
}

// Global cache manager instance
const cacheManager = new CacheManager();

/**
 * Create cache key from request
 */
function createCacheKey(req) {
    const { method, originalUrl, query, user } = req;
    const userId = user ? user.id : 'anonymous';
    
    // Include relevant query parameters
    const queryString = Object.keys(query).length > 0 ? 
        JSON.stringify(query) : '';
    
    return `${method}:${originalUrl}:${userId}:${queryString}`;
}

/**
 * Cache middleware factory
 */
function cache(options = {}) {
    const config = {
        ttl: options.ttl || 300000, // 5 minutes
        skipCache: options.skipCache || (() => false),
        keyGenerator: options.keyGenerator || createCacheKey,
        varyBy: options.varyBy || [],
        ...options
    };

    return (req, res, next) => {
        // Skip caching for non-GET requests by default
        if (req.method !== 'GET' && !config.allowNonGet) {
            return next();
        }
        
        // Skip cache check
        if (config.skipCache(req)) {
            return next();
        }
        
        const cacheKey = config.keyGenerator(req);
        const cached = cacheManager.get(cacheKey);
        
        if (cached) {
            // Set cache headers
            res.set({
                'X-Cache': 'HIT',
                'X-Cache-Key': cacheKey,
                'Cache-Control': `max-age=${Math.floor(config.ttl / 1000)}`
            });
            
            // Send cached response
            return res.status(cached.statusCode || 200)
                      .set(cached.headers || {})
                      .send(cached.body);
        }
        
        // Cache miss - intercept response
        const originalSend = res.send;
        const originalJson = res.json;
        
        res.send = function(body) {
            // Cache successful responses
            if (res.statusCode >= 200 && res.statusCode < 300) {
                const cacheEntry = {
                    statusCode: res.statusCode,
                    headers: res.getHeaders(),
                    body: body
                };
                
                cacheManager.set(cacheKey, cacheEntry, config.ttl);
                
                // Set cache headers
                res.set({
                    'X-Cache': 'MISS',
                    'X-Cache-Key': cacheKey,
                    'Cache-Control': `max-age=${Math.floor(config.ttl / 1000)}`
                });
            }
            
            return originalSend.call(this, body);
        };
        
        res.json = function(obj) {
            // Cache successful JSON responses
            if (res.statusCode >= 200 && res.statusCode < 300) {
                const cacheEntry = {
                    statusCode: res.statusCode,
                    headers: res.getHeaders(),
                    body: obj
                };
                
                cacheManager.set(cacheKey, cacheEntry, config.ttl);
                
                // Set cache headers
                res.set({
                    'X-Cache': 'MISS',
                    'X-Cache-Key': cacheKey,
                    'Cache-Control': `max-age=${Math.floor(config.ttl / 1000)}`
                });
            }
            
            return originalJson.call(this, obj);
        };
        
        next();
    };
}

/**
 * Cache invalidation middleware
 */
function invalidateCache(pattern) {
    return (req, res, next) => {
        // Clear cache after successful modification
        const originalSend = res.send;
        const originalJson = res.json;
        
        const clearCache = () => {
            if (res.statusCode >= 200 && res.statusCode < 300) {
                cacheManager.clear(pattern);
            }
        };
        
        res.send = function(body) {
            clearCache();
            return originalSend.call(this, body);
        };
        
        res.json = function(obj) {
            clearCache();
            return originalJson.call(this, obj);
        };
        
        next();
    };
}

module.exports = {
    cache,
    invalidateCache,
    cacheManager,
    CacheManager
};
