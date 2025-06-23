/**
 * Dynamic WebSocket Proxy System
 * 
 * Automatically creates browser-compatible WebSocket proxies for services
 * registered with the port management system. Eliminates the need for
 * manual proxy configuration and hardcoded port mappings.
 */

const WebSocket = require('ws');
const http = require('http');
const EventEmitter = require('events');
const { getInstance: getServiceDiscovery } = require('./serviceDiscovery');
const logger = require('../scripts/logger');

class DynamicWebSocketProxy extends EventEmitter {
    constructor(options = {}) {
        super();
        
        this.config = {
            // Proxy settings
            connectionTimeout: 10000,
            heartbeatInterval: 30000,
            maxConnections: 100,
            
            // Retry settings
            retryAttempts: 3,
            retryDelay: 1000,
            
            // Buffer settings
            messageBufferSize: 1000,
            
            ...options
        };
        
        this.serviceDiscovery = getServiceDiscovery();
        this.proxyServers = new Map();
        this.activeConnections = new Map();
        this.connectionCount = 0;
        this.isInitialized = false;
    }
    
    /**
     * Initialize the proxy system
     */
    async initialize() {
        try {
            logger.info('🔗 Initializing Dynamic WebSocket Proxy...');
            
            // Ensure service discovery is initialized
            if (!this.serviceDiscovery.isInitialized) {
                await this.serviceDiscovery.initialize();
            }
            
            // Listen to service discovery events
            this.serviceDiscovery.on('serviceRegistered', (service) => {
                this.handleServiceRegistered(service);
            });
            
            this.serviceDiscovery.on('serviceUnregistered', (service) => {
                this.handleServiceUnregistered(service);
            });
            
            // Create proxies for existing services
            const existingServices = this.serviceDiscovery.getAllServices();
            for (const service of existingServices) {
                if (service.proxyPort) {
                    await this.createProxy(service);
                }
            }
            
            this.isInitialized = true;
            logger.info('✅ Dynamic WebSocket Proxy initialized successfully');
            
            this.emit('initialized');
            return true;
        } catch (error) {
            logger.error('❌ Failed to initialize Dynamic WebSocket Proxy:', error);
            throw error;
        }
    }
    
    /**
     * Handle service registration
     */
    async handleServiceRegistered(service) {
        if (service.proxyPort) {
            logger.info(`🔗 Creating proxy for service: ${service.name}`);
            await this.createProxy(service);
        }
    }
    
    /**
     * Handle service unregistration
     */
    async handleServiceUnregistered(service) {
        if (this.proxyServers.has(service.name)) {
            logger.info(`🔗 Removing proxy for service: ${service.name}`);
            await this.removeProxy(service.name);
        }
    }
    
    /**
     * Create a proxy for a service
     */
    async createProxy(service) {
        if (this.proxyServers.has(service.name)) {
            logger.warn(`Proxy for service ${service.name} already exists`);
            return;
        }
        
        try {
            const proxyServer = await this.startProxyServer(service);
            this.proxyServers.set(service.name, proxyServer);
            
            logger.info(`✅ Proxy created for ${service.name}: ${service.proxyPort} → ${service.port}`);
            
            this.emit('proxyCreated', { service, proxyServer });
        } catch (error) {
            logger.error(`❌ Failed to create proxy for ${service.name}:`, error);
            throw error;
        }
    }
    
    /**
     * Remove a proxy for a service
     */
    async removeProxy(serviceName) {
        const proxyServer = this.proxyServers.get(serviceName);
        if (!proxyServer) {
            return;
        }
        
        try {
            await this.stopProxyServer(proxyServer);
            this.proxyServers.delete(serviceName);
            
            logger.info(`✅ Proxy removed for service: ${serviceName}`);
            
            this.emit('proxyRemoved', { serviceName });
        } catch (error) {
            logger.error(`❌ Failed to remove proxy for ${serviceName}:`, error);
            throw error;
        }
    }
    
    /**
     * Start a proxy server for a service
     */
    async startProxyServer(service) {
        return new Promise((resolve, reject) => {
            try {
                // Create HTTP server for the proxy
                const server = http.createServer((req, res) => {
                    res.writeHead(200, { 'Content-Type': 'text/plain' });
                    res.end(`${service.name} WebSocket Proxy Server\nProxy Port: ${service.proxyPort}\nTarget Port: ${service.port}`);
                });
                
                // Create WebSocket server
                const wss = new WebSocket.Server({
                    server,
                    perMessageDeflate: false,
                    clientTracking: true
                });
                
                // Handle WebSocket connections
                wss.on('connection', (browserWs, request) => {
                    this.handleBrowserConnection(browserWs, request, service);
                });
                
                wss.on('error', (error) => {
                    logger.error(`❌ Proxy WebSocket server error for ${service.name}:`, error);
                });
                
                // Start listening
                server.listen(service.proxyPort, () => {
                    logger.debug(`🔗 Proxy server listening on port ${service.proxyPort} for ${service.name}`);
                    
                    const proxyInfo = {
                        server,
                        wss,
                        service,
                        connections: new Map(),
                        startedAt: new Date()
                    };
                    
                    resolve(proxyInfo);
                });
                
                server.on('error', (error) => {
                    logger.error(`❌ Proxy HTTP server error for ${service.name}:`, error);
                    reject(error);
                });
                
            } catch (error) {
                reject(error);
            }
        });
    }
    
    /**
     * Stop a proxy server
     */
    async stopProxyServer(proxyInfo) {
        return new Promise((resolve) => {
            const { server, wss, connections } = proxyInfo;
            
            // Close all connections
            for (const [connectionId, connectionInfo] of connections) {
                this.closeConnection(connectionId, connectionInfo);
            }
            
            // Close WebSocket server
            wss.close(() => {
                // Close HTTP server
                server.close(() => {
                    resolve();
                });
            });
        });
    }
    
    /**
     * Handle browser WebSocket connection
     */
    handleBrowserConnection(browserWs, request, service) {
        const connectionId = `${service.name}_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`;
        
        logger.debug(`🔌 Browser connected to ${service.name} proxy: ${connectionId}`);
        
        // Create connection to target service
        const targetWs = new WebSocket(`ws://localhost:${service.port}`, {
            perMessageDeflate: false
        });
        
        const connectionInfo = {
            browserWs,
            targetWs,
            service,
            connectionId,
            connectedAt: new Date(),
            messageCount: 0,
            lastActivity: new Date()
        };
        
        // Store connection
        const proxyInfo = this.proxyServers.get(service.name);
        if (proxyInfo) {
            proxyInfo.connections.set(connectionId, connectionInfo);
        }
        this.activeConnections.set(connectionId, connectionInfo);
        this.connectionCount++;
        
        // Handle target connection events
        targetWs.on('open', () => {
            logger.debug(`✅ Connected to target service ${service.name} for ${connectionId}`);
            connectionInfo.targetConnected = true;
        });
        
        targetWs.on('message', (data) => {
            try {
                if (browserWs.readyState === WebSocket.OPEN) {
                    browserWs.send(data);
                    connectionInfo.messageCount++;
                    connectionInfo.lastActivity = new Date();
                    logger.debug(`📤 Forwarded message from ${service.name} to browser for ${connectionId}`);
                }
            } catch (error) {
                logger.error(`❌ Error forwarding message from target to browser for ${connectionId}:`, error);
            }
        });
        
        targetWs.on('error', (error) => {
            logger.error(`❌ Target connection error for ${connectionId}:`, error);
            this.closeConnection(connectionId, connectionInfo);
        });
        
        targetWs.on('close', (code, reason) => {
            logger.debug(`🔌 Target connection closed for ${connectionId}: ${code} ${reason}`);
            this.closeConnection(connectionId, connectionInfo);
        });
        
        // Handle browser connection events
        browserWs.on('message', (data) => {
            try {
                if (targetWs.readyState === WebSocket.OPEN) {
                    const messageStr = Buffer.isBuffer(data) ? data.toString('utf8') : data.toString();
                    targetWs.send(messageStr);
                    connectionInfo.messageCount++;
                    connectionInfo.lastActivity = new Date();
                    logger.debug(`📥 Forwarded message from browser to ${service.name} for ${connectionId}`);
                } else {
                    logger.warn(`Cannot forward message - target ${service.name} not connected for ${connectionId}`);
                }
            } catch (error) {
                logger.error(`❌ Error forwarding message from browser to target for ${connectionId}:`, error);
            }
        });
        
        browserWs.on('error', (error) => {
            logger.error(`❌ Browser connection error for ${connectionId}:`, error);
            this.closeConnection(connectionId, connectionInfo);
        });
        
        browserWs.on('close', (code, reason) => {
            logger.debug(`🔌 Browser connection closed for ${connectionId}: ${code} ${reason}`);
            this.closeConnection(connectionId, connectionInfo);
        });
        
        // Set connection timeout
        setTimeout(() => {
            if (!connectionInfo.targetConnected) {
                logger.warn(`Connection timeout for ${connectionId}`);
                this.closeConnection(connectionId, connectionInfo);
            }
        }, this.config.connectionTimeout);
        
        this.emit('connectionEstablished', connectionInfo);
    }
    
    /**
     * Close a connection
     */
    closeConnection(connectionId, connectionInfo) {
        try {
            // Close WebSocket connections
            if (connectionInfo.browserWs && connectionInfo.browserWs.readyState === WebSocket.OPEN) {
                connectionInfo.browserWs.close();
            }
            
            if (connectionInfo.targetWs && connectionInfo.targetWs.readyState === WebSocket.OPEN) {
                connectionInfo.targetWs.close();
            }
            
            // Remove from tracking
            this.activeConnections.delete(connectionId);
            this.connectionCount--;
            
            // Remove from proxy connections
            const proxyInfo = this.proxyServers.get(connectionInfo.service.name);
            if (proxyInfo && proxyInfo.connections.has(connectionId)) {
                proxyInfo.connections.delete(connectionId);
            }
            
            logger.debug(`🔌 Connection ${connectionId} closed`);
            
            this.emit('connectionClosed', connectionInfo);
        } catch (error) {
            logger.error(`❌ Error closing connection ${connectionId}:`, error);
        }
    }
    
    /**
     * Get proxy statistics
     */
    getProxyStats() {
        const stats = {
            totalProxies: this.proxyServers.size,
            activeConnections: this.connectionCount,
            connectionsByService: {},
            proxyInfo: {}
        };
        
        for (const [serviceName, proxyInfo] of this.proxyServers) {
            stats.connectionsByService[serviceName] = proxyInfo.connections.size;
            stats.proxyInfo[serviceName] = {
                proxyPort: proxyInfo.service.proxyPort,
                targetPort: proxyInfo.service.port,
                uptime: Date.now() - proxyInfo.startedAt.getTime(),
                connections: proxyInfo.connections.size
            };
        }
        
        return stats;
    }
    
    /**
     * Get connection information
     */
    getConnectionInfo(connectionId) {
        return this.activeConnections.get(connectionId) || null;
    }
    
    /**
     * Get all active connections
     */
    getAllConnections() {
        return Array.from(this.activeConnections.values());
    }
    
    /**
     * Cleanup and shutdown
     */
    async shutdown() {
        logger.info('🔗 Shutting down Dynamic WebSocket Proxy...');
        
        // Stop all proxy servers
        const shutdownPromises = [];
        for (const [serviceName, proxyInfo] of this.proxyServers) {
            shutdownPromises.push(this.removeProxy(serviceName));
        }
        
        await Promise.all(shutdownPromises);
        
        this.emit('shutdown');
        logger.info('✅ Dynamic WebSocket Proxy shutdown complete');
    }
}

// Singleton instance
let instance = null;

/**
 * Get the singleton Dynamic WebSocket Proxy instance
 */
function getInstance(options = {}) {
    if (!instance) {
        instance = new DynamicWebSocketProxy(options);
    }
    return instance;
}

module.exports = { DynamicWebSocketProxy, getInstance };
