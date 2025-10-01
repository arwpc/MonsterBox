/**
 * Status Monitor for Unified Animatronic Hub
 * 
 * Handles consolidated service status checking, replacing individual
 * port connections with a unified monitoring system.
 * 
 * Features:
 * - Service health checking via WebSocket and HTTP
 * - Status aggregation and history tracking
 * - Support for remote character monitoring
 * - Configurable service definitions
 */

const WebSocket = require('ws');
const https = require('https');
const http = require('http');
const logger = require('../../scripts/logger');

class StatusMonitor {
    constructor(options = {}) {
        this.config = {
            hostname: options.hostname || 'localhost',
            maxHistoryEntries: options.maxHistoryEntries || 100,
            connectionTimeout: 3000,
            retryAttempts: 2,
            ...options
        };

        // Service status cache
        this.lastCheck = {};
        this.healthHistory = [];
        this.isInitialized = false;

        // Define services to monitor (from hardware-monitor.ejs)
        this.serviceDefinitions = this.getServiceDefinitions();
        
        logger.info(`🔍 StatusMonitor initialized for ${this.config.hostname}`);
    }

    /**
     * Initialize the status monitor
     */
    async initialize() {
        try {
            logger.info('🚀 Initializing StatusMonitor...');
            
            // Perform initial status check
            await this.checkAllServices();
            
            this.isInitialized = true;
            logger.info('✅ StatusMonitor initialized successfully');
            
        } catch (error) {
            logger.error('❌ Failed to initialize StatusMonitor:', error);
            throw error;
        }
    }

    /**
     * Check all configured services
     */
    async checkAllServices() {
        const status = {};
        const checkPromises = [];

        // Create promises for all service checks
        for (const service of this.serviceDefinitions) {
            const promise = this.checkServiceStatus(service)
                .then(result => ({
                    service,
                    status: result.online ? 'online' : 'offline',
                    lastChecked: new Date().toISOString(),
                    details: result.details,
                    responseTime: result.responseTime
                }))
                .catch(error => ({
                    service,
                    status: 'offline',
                    lastChecked: new Date().toISOString(),
                    details: `Error: ${error.message}`,
                    responseTime: null
                }));
            
            checkPromises.push(promise);
        }

        // Wait for all checks to complete
        const results = await Promise.all(checkPromises);

        // Build status object
        for (const result of results) {
            status[result.service.name] = {
                port: result.service.port,
                type: result.service.type,
                icon: result.service.icon,
                status: result.status,
                lastChecked: result.lastChecked,
                details: result.details,
                responseTime: result.responseTime
            };
        }

        // Update cache and history
        this.lastCheck = status;
        this.updateHealthHistory(status);

        return status;
    }

    /**
     * Check individual service status
     */
    async checkServiceStatus(service) {
        const startTime = Date.now();
        
        try {
            // Determine check method based on service type
            if (['elevenlabs', 'stt', 'microphone', 'hardware', 'registry', 'light'].includes(service.type)) {
                return await this.checkWebSocketService(service.port, startTime);
            }
            
            if (service.type.includes('proxy')) {
                return await this.checkHttpsService(service.port, startTime);
            }
            
            // Default to WebSocket check
            return await this.checkWebSocketService(service.port, startTime);
            
        } catch (error) {
            return {
                online: false,
                details: error.message,
                responseTime: Date.now() - startTime
            };
        }
    }

    /**
     * Check WebSocket service status
     */
    async checkWebSocketService(port, startTime) {
        return new Promise((resolve) => {
            const timeout = setTimeout(() => {
                resolve({
                    online: false,
                    details: 'Connection timeout',
                    responseTime: Date.now() - startTime
                });
            }, this.config.connectionTimeout);

            try {
                // Use 127.0.0.1 for local service health checks to force IPv4
                // and avoid issues with hostname resolution (e.g., 127.0.1.1 vs 127.0.0.1 vs ::1)
                const ws = new WebSocket(`ws://127.0.0.1:${port}`, {
                    timeout: this.config.connectionTimeout
                });

                ws.on('open', () => {
                    clearTimeout(timeout);
                    ws.close();
                    resolve({
                        online: true,
                        details: 'WebSocket connection successful',
                        responseTime: Date.now() - startTime
                    });
                });

                ws.on('error', (error) => {
                    clearTimeout(timeout);
                    resolve({
                        online: false,
                        details: `WebSocket error: ${error.message}`,
                        responseTime: Date.now() - startTime
                    });
                });

            } catch (error) {
                clearTimeout(timeout);
                resolve({
                    online: false,
                    details: `Connection error: ${error.message}`,
                    responseTime: Date.now() - startTime
                });
            }
        });
    }

    /**
     * Check HTTPS service status
     */
    async checkHttpsService(port, startTime) {
        return new Promise((resolve) => {
            const timeout = setTimeout(() => {
                resolve({
                    online: false,
                    details: 'HTTPS connection timeout',
                    responseTime: Date.now() - startTime
                });
            }, this.config.connectionTimeout);

            const options = {
                hostname: '127.0.0.1', // Use 127.0.0.1 to force IPv4 for local service health checks
                port: port,
                path: '/',
                method: 'GET',
                timeout: this.config.connectionTimeout,
                rejectUnauthorized: false // Allow self-signed certificates
            };

            const req = https.request(options, (res) => {
                clearTimeout(timeout);
                resolve({
                    online: true,
                    details: `HTTPS response: ${res.statusCode}`,
                    responseTime: Date.now() - startTime
                });
            });

            req.on('error', (error) => {
                clearTimeout(timeout);
                resolve({
                    online: false,
                    details: `HTTPS error: ${error.message}`,
                    responseTime: Date.now() - startTime
                });
            });

            req.on('timeout', () => {
                clearTimeout(timeout);
                req.destroy();
                resolve({
                    online: false,
                    details: 'HTTPS request timeout',
                    responseTime: Date.now() - startTime
                });
            });

            req.end();
        });
    }

    /**
     * Get service definitions (matches hardware-monitor.ejs)
     */
    getServiceDefinitions() {
        return [
            { name: 'ElevenLabs Conversational AI', port: 8771, icon: '🤖', type: 'elevenlabs' },
            { name: 'ElevenLabs Live STT', port: 8778, icon: '🎤', type: 'stt' },
            { name: 'Microphone Service', port: 8776, icon: '🎙️', type: 'microphone' },
            { name: 'ElevenLabs SSL Proxy', port: 8872, icon: '🔐', type: 'proxy-ssl' },
            { name: 'STT SSL Proxy', port: 8873, icon: '🔐', type: 'proxy-stt' },
            { name: 'Main Hardware Server', port: 8780, icon: '🔧', type: 'hardware' },
            { name: 'Service Registry', port: 8770, icon: '📋', type: 'registry' },
            { name: 'Light Service', port: 8772, icon: '💡', type: 'light' }
        ];
    }

    /**
     * Update health history
     */
    updateHealthHistory(status) {
        const timestamp = new Date().toISOString();
        const onlineCount = Object.values(status).filter(s => s.status === 'online').length;
        const totalCount = Object.keys(status).length;

        const historyEntry = {
            timestamp,
            onlineServices: onlineCount,
            totalServices: totalCount,
            healthPercentage: totalCount > 0 ? Math.round((onlineCount / totalCount) * 100) : 0
        };

        this.healthHistory.push(historyEntry);

        // Limit history size
        if (this.healthHistory.length > this.config.maxHistoryEntries) {
            this.healthHistory.shift();
        }
    }

    /**
     * Get status summary
     */
    getSummary() {
        const services = Object.values(this.lastCheck);
        const online = services.filter(s => s.status === 'online').length;
        const offline = services.filter(s => s.status === 'offline').length;

        return {
            total: services.length,
            online,
            offline,
            healthPercentage: services.length > 0 ? Math.round((online / services.length) * 100) : 0,
            lastUpdate: services.length > 0 ? services[0].lastChecked : null
        };
    }

    /**
     * Get monitored service count
     */
    getMonitoredServiceCount() {
        return this.serviceDefinitions.length;
    }

    /**
     * Get health history
     */
    getHealthHistory() {
        return [...this.healthHistory];
    }

    /**
     * Shutdown the status monitor
     */
    async shutdown() {
        logger.info('🛑 Shutting down StatusMonitor...');
        this.isInitialized = false;
        logger.info('✅ StatusMonitor shutdown complete');
    }
}

module.exports = StatusMonitor;
