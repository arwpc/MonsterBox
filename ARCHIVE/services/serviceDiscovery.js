/**
 * MonsterBox Service Discovery System
 * 
 * Provides service discovery and registration capabilities:
 * - Service registration with metadata
 * - Service lookup by name, type, or tags
 * - Health monitoring and status tracking
 * - Event-driven service updates
 * - Integration with Port Manager
 */

const EventEmitter = require('events');
const { getInstance: getPortManager } = require('./portManager');
const logger = require('../scripts/logger');

class ServiceDiscovery extends EventEmitter {
    constructor(options = {}) {
        super();
        
        this.config = {
            // Service registration timeout
            registrationTimeout: 30000,
            
            // Service discovery cache TTL
            cacheTTL: 60000,
            
            // Health check settings
            healthCheck: {
                enabled: true,
                interval: 30000,
                timeout: 5000
            },
            
            ...options
        };
        
        this.portManager = getPortManager();
        this.services = new Map();
        this.serviceCache = new Map();
        this.healthCheckInterval = null;
        this.isInitialized = false;
    }
    
    /**
     * Initialize service discovery
     */
    async initialize() {
        try {
            logger.info('🔍 Initializing Service Discovery...');
            
            // Ensure port manager is initialized
            if (!this.portManager.isInitialized) {
                await this.portManager.initialize();
            }
            
            // Listen to port manager events
            this.portManager.on('serviceRegistered', (registration) => {
                this.handleServiceRegistration(registration);
            });
            
            this.portManager.on('serviceUnregistered', (registration) => {
                this.handleServiceUnregistration(registration);
            });
            
            // Start health monitoring if enabled
            if (this.config.healthCheck.enabled) {
                this.startHealthMonitoring();
            }
            
            this.isInitialized = true;
            logger.info('✅ Service Discovery initialized successfully');
            
            this.emit('initialized');
            return true;
        } catch (error) {
            logger.error('❌ Failed to initialize Service Discovery:', error);
            throw error;
        }
    }
    
    /**
     * Register a service with discovery metadata
     */
    async registerService(serviceConfig) {
        const {
            name,
            type,
            description = '',
            tags = [],
            endpoints = {},
            dependencies = [],
            metadata = {},
            ...portManagerConfig
        } = serviceConfig;
        
        if (!name) {
            throw new Error('Service name is required');
        }
        
        logger.info(`🔍 Registering service for discovery: ${name}`);
        
        try {
            // Register with port manager first
            const portRegistration = await this.portManager.registerService({
                name,
                type,
                ...portManagerConfig
            });
            
            // Create discovery registration
            const discoveryRegistration = {
                ...portRegistration,
                description,
                tags: new Set(tags),
                endpoints: {
                    websocket: `ws://localhost:${portRegistration.port}`,
                    proxy: portRegistration.proxyPort ? `ws://localhost:${portRegistration.proxyPort}` : null,
                    ...endpoints
                },
                dependencies: new Set(dependencies),
                discoveryMetadata: {
                    ...metadata,
                    registeredAt: new Date().toISOString(),
                    lastSeen: new Date().toISOString()
                },
                status: 'registered'
            };
            
            // Store in discovery registry
            this.services.set(name, discoveryRegistration);
            
            // Clear cache for this service type
            this.clearCacheForType(type);
            
            logger.info(`✅ Service ${name} registered for discovery`);
            
            this.emit('serviceRegistered', discoveryRegistration);
            return discoveryRegistration;
            
        } catch (error) {
            logger.error(`❌ Failed to register service ${name} for discovery:`, error);
            throw error;
        }
    }
    
    /**
     * Unregister a service from discovery
     */
    async unregisterService(serviceName) {
        if (!this.services.has(serviceName)) {
            logger.warn(`Service ${serviceName} not found in discovery registry`);
            return false;
        }
        
        const registration = this.services.get(serviceName);
        
        logger.info(`🔍 Unregistering service from discovery: ${serviceName}`);
        
        // Unregister from port manager
        await this.portManager.unregisterService(serviceName);
        
        // Remove from discovery registry
        this.services.delete(serviceName);
        
        // Clear cache
        this.clearCacheForType(registration.type);
        
        logger.info(`✅ Service ${serviceName} unregistered from discovery`);
        
        this.emit('serviceUnregistered', registration);
        return true;
    }
    
    /**
     * Find a service by name
     */
    findService(serviceName) {
        const service = this.services.get(serviceName);
        if (service) {
            service.discoveryMetadata.lastSeen = new Date().toISOString();
        }
        return service || null;
    }
    
    /**
     * Find services by type
     */
    findServicesByType(type) {
        const cacheKey = `type:${type}`;
        
        // Check cache first
        if (this.serviceCache.has(cacheKey)) {
            const cached = this.serviceCache.get(cacheKey);
            if (Date.now() - cached.timestamp < this.config.cacheTTL) {
                return cached.services;
            }
        }
        
        // Find services
        const services = Array.from(this.services.values())
            .filter(service => service.type === type)
            .map(service => {
                service.discoveryMetadata.lastSeen = new Date().toISOString();
                return service;
            });
        
        // Cache results
        this.serviceCache.set(cacheKey, {
            services,
            timestamp: Date.now()
        });
        
        return services;
    }
    
    /**
     * Find services by tag
     */
    findServicesByTag(tag) {
        const cacheKey = `tag:${tag}`;
        
        // Check cache first
        if (this.serviceCache.has(cacheKey)) {
            const cached = this.serviceCache.get(cacheKey);
            if (Date.now() - cached.timestamp < this.config.cacheTTL) {
                return cached.services;
            }
        }
        
        // Find services
        const services = Array.from(this.services.values())
            .filter(service => service.tags.has(tag))
            .map(service => {
                service.discoveryMetadata.lastSeen = new Date().toISOString();
                return service;
            });
        
        // Cache results
        this.serviceCache.set(cacheKey, {
            services,
            timestamp: Date.now()
        });
        
        return services;
    }
    
    /**
     * Find services with dependencies
     */
    findServiceDependencies(serviceName) {
        const service = this.findService(serviceName);
        if (!service) {
            return [];
        }
        
        const dependencies = [];
        for (const depName of service.dependencies) {
            const dep = this.findService(depName);
            if (dep) {
                dependencies.push(dep);
            }
        }
        
        return dependencies;
    }
    
    /**
     * Find services that depend on a given service
     */
    findServiceDependents(serviceName) {
        return Array.from(this.services.values())
            .filter(service => service.dependencies.has(serviceName));
    }
    
    /**
     * Get all registered services
     */
    getAllServices() {
        return Array.from(this.services.values());
    }
    
    /**
     * Get service connection info
     */
    getServiceConnection(serviceName, preferProxy = true) {
        const service = this.findService(serviceName);
        if (!service) {
            return null;
        }
        
        // Return proxy endpoint if available and preferred
        if (preferProxy && service.endpoints.proxy) {
            return {
                url: service.endpoints.proxy,
                type: 'proxy',
                port: service.proxyPort
            };
        }
        
        // Return direct endpoint
        return {
            url: service.endpoints.websocket,
            type: 'direct',
            port: service.port
        };
    }
    
    /**
     * Handle service registration from port manager
     */
    handleServiceRegistration(portRegistration) {
        // Update discovery registry if service exists
        if (this.services.has(portRegistration.name)) {
            const service = this.services.get(portRegistration.name);
            Object.assign(service, portRegistration);
            service.discoveryMetadata.lastSeen = new Date().toISOString();
            
            this.clearCacheForType(service.type);
            this.emit('serviceUpdated', service);
        }
    }
    
    /**
     * Handle service unregistration from port manager
     */
    handleServiceUnregistration(portRegistration) {
        if (this.services.has(portRegistration.name)) {
            const service = this.services.get(portRegistration.name);
            this.services.delete(portRegistration.name);
            
            this.clearCacheForType(service.type);
            this.emit('serviceUnregistered', service);
        }
    }
    
    /**
     * Clear cache for a specific service type
     */
    clearCacheForType(type) {
        const keysToDelete = [];
        for (const key of this.serviceCache.keys()) {
            if (key.startsWith(`type:${type}`) || key.includes(type)) {
                keysToDelete.push(key);
            }
        }
        
        for (const key of keysToDelete) {
            this.serviceCache.delete(key);
        }
    }
    
    /**
     * Start health monitoring
     */
    startHealthMonitoring() {
        if (this.healthCheckInterval) {
            clearInterval(this.healthCheckInterval);
        }
        
        this.healthCheckInterval = setInterval(async () => {
            await this.performHealthCheck();
        }, this.config.healthCheck.interval);
        
        logger.debug('💓 Service Discovery health monitoring started');
    }
    
    /**
     * Perform health check on all services
     */
    async performHealthCheck() {
        for (const [name, service] of this.services) {
            try {
                // Get health status from port manager
                const portService = this.portManager.getService(name);
                if (portService) {
                    service.status = portService.status;
                    service.lastHealthCheck = portService.lastHealthCheck;
                }
                
                // Update last seen
                service.discoveryMetadata.lastSeen = new Date().toISOString();
                
            } catch (error) {
                logger.error(`❌ Health check error for service ${name}:`, error.message);
                service.status = 'error';
            }
        }
    }
    
    /**
     * Get discovery statistics
     */
    getDiscoveryStats() {
        const stats = {
            totalServices: this.services.size,
            cacheSize: this.serviceCache.size,
            byType: {},
            byStatus: {},
            byTags: {}
        };
        
        // Count by type and status
        for (const service of this.services.values()) {
            stats.byType[service.type] = (stats.byType[service.type] || 0) + 1;
            stats.byStatus[service.status] = (stats.byStatus[service.status] || 0) + 1;
            
            // Count by tags
            for (const tag of service.tags) {
                stats.byTags[tag] = (stats.byTags[tag] || 0) + 1;
            }
        }
        
        return stats;
    }
    
    /**
     * Cleanup and shutdown
     */
    async shutdown() {
        logger.info('🔍 Shutting down Service Discovery...');
        
        if (this.healthCheckInterval) {
            clearInterval(this.healthCheckInterval);
        }
        
        this.serviceCache.clear();
        
        this.emit('shutdown');
        logger.info('✅ Service Discovery shutdown complete');
    }
}

// Singleton instance
let instance = null;

/**
 * Get the singleton Service Discovery instance
 */
function getInstance(options = {}) {
    if (!instance) {
        instance = new ServiceDiscovery(options);
    }
    return instance;
}

/**
 * Reset the singleton instance (for testing or configuration reloading)
 */
function resetInstance() {
    if (instance) {
        instance.removeAllListeners();
        instance = null;
    }
}

module.exports = { ServiceDiscovery, getInstance, resetInstance };
