/**
 * MonsterBox Centralized Port Management System
 * 
 * Eliminates port contention by providing:
 * - Dynamic port allocation
 * - Service registration and discovery
 * - Automatic proxy management
 * - Conflict detection and resolution
 * - Environment-specific port ranges
 */

const fs = require('fs').promises;
const path = require('path');
const net = require('net');
const EventEmitter = require('events');
const logger = require('../scripts/logger');

class PortManager extends EventEmitter {
    constructor(options = {}) {
        super();
        
        // Configuration
        this.config = {
            // Port ranges for different service types
            ranges: {
                main: { start: 80, end: 81 },           // Main application ports
                websocket: { start: 8000, end: 8199 },      // Direct WebSocket services
                proxy: { start: 8200, end: 8399 },          // Browser proxy services
                hardware: { start: 8400, end: 8599 },       // Hardware-specific services
                chatterpi: { start: 8600, end: 8699 },      // ChatterPi services
                testing: { start: 8700, end: 8799 },        // Testing and development
                reserved: { start: 8800, end: 8999 }        // Reserved for future use
            },
            
            // Reserved ports that should never be allocated
            reserved: [22, 80, 443, 3000, 5432, 6379, 27017],
            
            // Service priorities (higher = more important)
            priorities: {
                main: 100,
                hardware: 90,
                websocket: 80,
                chatterpi: 70,
                proxy: 60,
                testing: 50
            },
            
            // Registry file location
            registryFile: path.join(__dirname, '../data/port-registry.json'),
            
            // Health check settings
            healthCheck: {
                interval: 30000,    // 30 seconds
                timeout: 5000,      // 5 seconds
                retries: 3
            },
            
            ...options
        };
        
        // Internal state
        this.registry = new Map();
        this.allocatedPorts = new Set();
        this.healthCheckInterval = null;
        this.isInitialized = false;
    }
    
    /**
     * Initialize the port manager
     */
    async initialize() {
        try {
            logger.info('🔌 Initializing Port Manager...');
            
            // Load existing registry
            await this.loadRegistry();
            
            // Validate existing allocations
            await this.validateExistingAllocations();
            
            // Start health monitoring
            this.startHealthMonitoring();
            
            this.isInitialized = true;
            logger.info('✅ Port Manager initialized successfully');
            
            this.emit('initialized');
            return true;
        } catch (error) {
            logger.error('❌ Failed to initialize Port Manager:', error);
            throw error;
        }
    }
    
    /**
     * Register a service and allocate a port
     */
    async registerService(serviceConfig) {
        if (!this.isInitialized) {
            throw new Error('Port Manager not initialized');
        }
        
        const {
            name,
            type = 'websocket',
            preferredPort = null,
            requiresProxy = true,
            priority = this.config.priorities[type] || 50,
            metadata = {}
        } = serviceConfig;
        
        if (!name) {
            throw new Error('Service name is required');
        }
        
        logger.info(`🔌 Registering service: ${name} (type: ${type})`);
        
        try {
            // Check if service already registered
            if (this.registry.has(name)) {
                const existing = this.registry.get(name);
                logger.info(`Service ${name} already registered on port ${existing.port}`);
                return existing;
            }
            
            // Allocate port
            const port = await this.allocatePort(type, preferredPort, priority);
            
            // Allocate proxy port if needed
            let proxyPort = null;
            if (requiresProxy) {
                proxyPort = await this.allocatePort('proxy', null, priority);
            }
            
            // Create service registration
            const registration = {
                name,
                type,
                port,
                proxyPort,
                priority,
                status: 'allocated',
                registeredAt: new Date().toISOString(),
                lastHealthCheck: null,
                metadata: {
                    ...metadata,
                    pid: process.pid,
                    hostname: require('os').hostname()
                }
            };
            
            // Store registration
            this.registry.set(name, registration);
            this.allocatedPorts.add(port);
            if (proxyPort) {
                this.allocatedPorts.add(proxyPort);
            }
            
            // Save registry
            await this.saveRegistry();
            
            logger.info(`✅ Service ${name} registered: port ${port}${proxyPort ? `, proxy ${proxyPort}` : ''}`);
            
            this.emit('serviceRegistered', registration);
            return registration;
            
        } catch (error) {
            logger.error(`❌ Failed to register service ${name}:`, error);
            throw error;
        }
    }
    
    /**
     * Unregister a service and free its ports
     */
    async unregisterService(serviceName) {
        if (!this.registry.has(serviceName)) {
            logger.warn(`Service ${serviceName} not found in registry`);
            return false;
        }
        
        const registration = this.registry.get(serviceName);
        
        logger.info(`🔌 Unregistering service: ${serviceName}`);
        
        // Free ports
        this.allocatedPorts.delete(registration.port);
        if (registration.proxyPort) {
            this.allocatedPorts.delete(registration.proxyPort);
        }
        
        // Remove from registry
        this.registry.delete(serviceName);
        
        // Save registry
        await this.saveRegistry();
        
        logger.info(`✅ Service ${serviceName} unregistered`);
        
        this.emit('serviceUnregistered', registration);
        return true;
    }
    
    /**
     * Get service information
     */
    getService(serviceName) {
        return this.registry.get(serviceName) || null;
    }
    
    /**
     * Get all registered services
     */
    getAllServices() {
        return Array.from(this.registry.values());
    }
    
    /**
     * Get services by type
     */
    getServicesByType(type) {
        return Array.from(this.registry.values()).filter(service => service.type === type);
    }
    
    /**
     * Check if a port is available
     */
    async isPortAvailable(port) {
        if (this.allocatedPorts.has(port)) {
            return false;
        }
        
        if (this.config.reserved.includes(port)) {
            return false;
        }
        
        return new Promise((resolve) => {
            const server = net.createServer();
            
            server.listen(port, () => {
                server.close(() => resolve(true));
            });
            
            server.on('error', () => resolve(false));
        });
    }
    
    /**
     * Allocate a port from the appropriate range
     */
    async allocatePort(type, preferredPort = null, priority = 50) {
        const range = this.config.ranges[type];
        if (!range) {
            throw new Error(`Unknown service type: ${type}`);
        }

        // Try preferred port first
        if (preferredPort && await this.isPortAvailable(preferredPort)) {
            if (preferredPort >= range.start && preferredPort <= range.end) {
                return preferredPort;
            }
        }

        // Find available port in range
        for (let port = range.start; port <= range.end; port++) {
            if (await this.isPortAvailable(port)) {
                return port;
            }
        }

        throw new Error(`No available ports in range ${range.start}-${range.end} for type ${type}`);
    }

    /**
     * Load registry from file
     */
    async loadRegistry() {
        try {
            const data = await fs.readFile(this.config.registryFile, 'utf8');
            const registryData = JSON.parse(data);

            // Restore registry
            this.registry.clear();
            this.allocatedPorts.clear();

            for (const [name, registration] of Object.entries(registryData.services || {})) {
                this.registry.set(name, registration);
                this.allocatedPorts.add(registration.port);
                if (registration.proxyPort) {
                    this.allocatedPorts.add(registration.proxyPort);
                }
            }

            logger.info(`📋 Loaded ${this.registry.size} services from registry`);
        } catch (error) {
            if (error.code === 'ENOENT') {
                logger.info('📋 No existing registry found, starting fresh');
            } else {
                logger.warn('⚠️ Failed to load registry:', error.message);
            }
        }
    }

    /**
     * Save registry to file
     */
    async saveRegistry() {
        try {
            const registryData = {
                lastUpdated: new Date().toISOString(),
                services: Object.fromEntries(this.registry)
            };

            // Ensure directory exists
            const dir = path.dirname(this.config.registryFile);
            await fs.mkdir(dir, { recursive: true });

            await fs.writeFile(this.config.registryFile, JSON.stringify(registryData, null, 2));
            logger.debug('💾 Registry saved successfully');
        } catch (error) {
            logger.error('❌ Failed to save registry:', error);
        }
    }

    /**
     * Validate existing allocations
     */
    async validateExistingAllocations() {
        const staleServices = [];

        for (const [name, registration] of this.registry) {
            const isAvailable = await this.isPortAvailable(registration.port);
            if (isAvailable) {
                // Port is not in use, mark as stale
                staleServices.push(name);
                logger.warn(`⚠️ Service ${name} port ${registration.port} appears unused`);
            }
        }

        // Clean up stale services
        for (const serviceName of staleServices) {
            await this.unregisterService(serviceName);
        }

        if (staleServices.length > 0) {
            logger.info(`🧹 Cleaned up ${staleServices.length} stale service registrations`);
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

        logger.debug('💓 Health monitoring started');
    }

    /**
     * Perform health check on all services
     */
    async performHealthCheck() {
        const now = new Date().toISOString();

        for (const [name, registration] of this.registry) {
            try {
                const isHealthy = await this.checkServiceHealth(registration);
                registration.lastHealthCheck = now;
                registration.status = isHealthy ? 'healthy' : 'unhealthy';

                if (!isHealthy) {
                    logger.warn(`⚠️ Service ${name} health check failed`);
                    this.emit('serviceUnhealthy', registration);
                }
            } catch (error) {
                logger.error(`❌ Health check error for ${name}:`, error.message);
                registration.status = 'error';
                registration.lastHealthCheck = now;
            }
        }

        // Save updated registry
        await this.saveRegistry();
    }

    /**
     * Check if a specific service is healthy
     */
    async checkServiceHealth(registration) {
        return new Promise((resolve) => {
            const socket = new net.Socket();
            const timeout = setTimeout(() => {
                socket.destroy();
                resolve(false);
            }, this.config.healthCheck.timeout);

            socket.connect(registration.port, 'localhost', () => {
                clearTimeout(timeout);
                socket.destroy();
                resolve(true);
            });

            socket.on('error', () => {
                clearTimeout(timeout);
                resolve(false);
            });
        });
    }

    /**
     * Get port usage statistics
     */
    getPortUsageStats() {
        const stats = {
            totalAllocated: this.allocatedPorts.size,
            serviceCount: this.registry.size,
            byType: {},
            byStatus: {},
            ranges: {}
        };

        // Count by type and status
        for (const registration of this.registry.values()) {
            stats.byType[registration.type] = (stats.byType[registration.type] || 0) + 1;
            stats.byStatus[registration.status] = (stats.byStatus[registration.status] || 0) + 1;
        }

        // Count by range
        for (const [rangeName, range] of Object.entries(this.config.ranges)) {
            const used = Array.from(this.allocatedPorts).filter(
                port => port >= range.start && port <= range.end
            ).length;
            const total = range.end - range.start + 1;

            stats.ranges[rangeName] = {
                used,
                total,
                available: total - used,
                utilization: Math.round((used / total) * 100)
            };
        }

        return stats;
    }

    /**
     * Cleanup and shutdown
     */
    async shutdown() {
        logger.info('🔌 Shutting down Port Manager...');

        if (this.healthCheckInterval) {
            clearInterval(this.healthCheckInterval);
        }

        await this.saveRegistry();

        this.emit('shutdown');
        logger.info('✅ Port Manager shutdown complete');
    }
}

// Singleton instance
let instance = null;

/**
 * Get the singleton Port Manager instance
 */
function getInstance(options = {}) {
    if (!instance) {
        instance = new PortManager(options);
    }
    return instance;
}

module.exports = { PortManager, getInstance };
