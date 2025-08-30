/**
 * Unified Animatronic Hub - Main Controller
 * 
 * Central hub for all animatronic services providing a single secure endpoint
 * for monitoring and control. Replaces the fragmented multi-port architecture
 * with a unified system.
 * 
 * Phase 1: Monitoring Hub Foundation
 * - Consolidated service status checking
 * - Single API endpoint for all service status
 * - System health monitoring
 */

const os = require('os');
const logger = require('../../scripts/logger');
const StatusMonitor = require('./StatusMonitor');
const MainHardwareServer = require('./MainHardwareServer');

class UnifiedAnimatronicHub {
    constructor(options = {}) {
        this.config = {
            hostname: os.hostname(),
            enableHealthMonitoring: true,
            statusCheckInterval: 30000, // 30 seconds
            maxHealthHistoryEntries: 100,
            ...options
        };

        // Initialize components
        this.statusMonitor = null;
        this.hardwareServer = null;
        this.isInitialized = false;
        this.startTime = new Date();
        
        // Service registry - will be expanded in future phases
        this.services = new Map();
        
        logger.info(`🎯 Initializing Unified Animatronic Hub for ${this.config.hostname}`);
    }

    /**
     * Initialize the hub and all its components
     */
    async initialize() {
        try {
            logger.info('🚀 Starting Unified Animatronic Hub initialization...');

            // Initialize status monitor
            this.statusMonitor = new StatusMonitor({
                hostname: this.config.hostname,
                maxHistoryEntries: this.config.maxHealthHistoryEntries
            });

            await this.statusMonitor.initialize();

            // Initialize hardware server (Phase 2)
            this.hardwareServer = new MainHardwareServer({
                hostname: this.config.hostname
            });

            await this.hardwareServer.initialize();

            // Start health monitoring if enabled
            if (this.config.enableHealthMonitoring) {
                this.startHealthMonitoring();
            }

            this.isInitialized = true;
            logger.info('✅ Unified Animatronic Hub initialized successfully');

            return {
                success: true,
                hostname: this.config.hostname,
                startTime: this.startTime,
                services: this.getServiceSummary(),
                hardware: this.hardwareServer ? this.hardwareServer.getCapabilities() : null
            };

        } catch (error) {
            logger.error('❌ Failed to initialize Unified Animatronic Hub:', error);
            throw error;
        }
    }

    /**
     * Handle incoming API requests
     * Central request router for all hub endpoints
     */
    async handleRequest(req, res) {
        try {
            if (!this.isInitialized) {
                return res.status(503).json({
                    error: 'Hub not initialized',
                    hostname: this.config.hostname
                });
            }

            const { method, path } = req;
            const endpoint = this.parseEndpoint(path);

            logger.debug(`Hub request: ${method} ${path} -> ${endpoint}`);

            // Route to appropriate handler
            switch (endpoint) {
                case 'status':
                    return await this.handleStatusRequest(req, res);
                
                case 'health':
                    return await this.handleHealthRequest(req, res);
                
                default:
                    return res.status(404).json({
                        error: 'Endpoint not found',
                        endpoint,
                        availableEndpoints: ['status', 'health']
                    });
            }

        } catch (error) {
            logger.error('Error handling hub request:', error);
            return res.status(500).json({
                error: 'Internal hub error',
                message: error.message
            });
        }
    }

    /**
     * Handle status requests - main monitoring endpoint
     */
    async handleStatusRequest(req, res) {
        try {
            const status = await this.getSystemStatus();
            
            res.json({
                success: true,
                timestamp: new Date().toISOString(),
                ...status
            });

        } catch (error) {
            logger.error('Error getting system status:', error);
            res.status(500).json({
                error: 'Failed to get system status',
                message: error.message
            });
        }
    }

    /**
     * Handle health check requests
     */
    async handleHealthRequest(req, res) {
        try {
            const health = await this.getHealthStatus();
            const statusCode = health.overall === 'healthy' ? 200 : 503;
            
            res.status(statusCode).json(health);

        } catch (error) {
            logger.error('Error getting health status:', error);
            res.status(503).json({
                overall: 'error',
                error: error.message
            });
        }
    }

    /**
     * Get comprehensive system status
     * This is the main endpoint that replaces individual service checks
     */
    async getSystemStatus() {
        const status = {
            hostname: this.config.hostname,
            ip: this.getLocalIP(),
            timestamp: new Date().toISOString(),
            uptime: this.getUptime(),
            hub: {
                initialized: this.isInitialized,
                startTime: this.startTime,
                version: '1.0.0-phase1'
            }
        };

        // Get service statuses from monitor
        if (this.statusMonitor) {
            const serviceStatuses = await this.statusMonitor.checkAllServices();
            status.services = serviceStatuses;
            status.summary = this.statusMonitor.getSummary();
        } else {
            status.services = {};
            status.summary = { total: 0, online: 0, offline: 0 };
        }

        return status;
    }

    /**
     * Get health status for health checks
     */
    async getHealthStatus() {
        const systemStatus = await this.getSystemStatus();
        
        return {
            overall: systemStatus.summary.online > 0 ? 'healthy' : 'unhealthy',
            hostname: systemStatus.hostname,
            timestamp: systemStatus.timestamp,
            uptime: systemStatus.uptime,
            services: {
                total: systemStatus.summary.total,
                online: systemStatus.summary.online,
                offline: systemStatus.summary.offline
            },
            hub: systemStatus.hub
        };
    }

    /**
     * Start periodic health monitoring
     */
    startHealthMonitoring() {
        if (this.healthMonitoringInterval) {
            clearInterval(this.healthMonitoringInterval);
        }

        this.healthMonitoringInterval = setInterval(async () => {
            try {
                await this.statusMonitor.checkAllServices();
                logger.debug('Health monitoring check completed');
            } catch (error) {
                logger.error('Health monitoring error:', error);
            }
        }, this.config.statusCheckInterval);

        logger.info(`🔍 Health monitoring started (interval: ${this.config.statusCheckInterval}ms)`);
    }

    /**
     * Stop health monitoring
     */
    stopHealthMonitoring() {
        if (this.healthMonitoringInterval) {
            clearInterval(this.healthMonitoringInterval);
            this.healthMonitoringInterval = null;
            logger.info('🛑 Health monitoring stopped');
        }
    }

    /**
     * Parse endpoint from request path
     */
    parseEndpoint(path) {
        // Extract endpoint from path like /api/hub/status -> status
        const parts = path.split('/');
        return parts[parts.length - 1] || 'unknown';
    }

    /**
     * Get local IP address
     */
    getLocalIP() {
        const interfaces = os.networkInterfaces();
        for (const name of Object.keys(interfaces)) {
            for (const iface of interfaces[name]) {
                if (iface.family === 'IPv4' && !iface.internal) {
                    return iface.address;
                }
            }
        }
        return '127.0.0.1';
    }

    /**
     * Get system uptime in seconds
     */
    getUptime() {
        return Math.floor((Date.now() - this.startTime.getTime()) / 1000);
    }

    /**
     * Get service summary for initialization
     */
    getServiceSummary() {
        return {
            registered: this.services.size,
            monitoring: this.statusMonitor ? this.statusMonitor.getMonitoredServiceCount() : 0
        };
    }

    /**
     * Shutdown the hub gracefully
     */
    async shutdown() {
        logger.info('🛑 Shutting down Unified Animatronic Hub...');
        
        this.stopHealthMonitoring();
        
        if (this.statusMonitor) {
            await this.statusMonitor.shutdown();
        }
        
        this.isInitialized = false;
        logger.info('✅ Unified Animatronic Hub shutdown complete');
    }
}

module.exports = UnifiedAnimatronicHub;
