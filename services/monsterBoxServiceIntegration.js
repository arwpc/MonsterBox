/**
 * MonsterBox Service Integration Layer
 * 
 * Integrates the new centralized port management system with the existing
 * MonsterBox application. Provides a unified interface for service management
 * and maintains backward compatibility while eliminating port conflicts.
 */

const { getInstance: getPortManager, resetInstance: resetPortManager } = require('./portManager');
const { getInstance: getServiceDiscovery, resetInstance: resetServiceDiscovery } = require('./serviceDiscovery');
const { getInstance: getEnhancedServiceManager } = require('./enhancedServiceManager');
const { getInstance: getDynamicWebSocketProxy } = require('./dynamicWebSocketProxy');
const { validateConfig } = require('../config/portConfig');
const CharacterBasedServiceLoader = require('./characterBasedServiceLoader');
const logger = require('../scripts/logger');

class MonsterBoxServiceIntegration {
    constructor(options = {}) {
        this.config = {
            // Integration settings
            enableLegacySupport: true,
            autoStartServices: true,
            enableHealthMonitoring: true,
            enableCharacterBasedLoading: true,

            // Service startup order (will be filtered by character-based loader)
            coreServices: [
                'hardwareRegistry',
                'microphone',
                'audioStream',
                'elevenLabsConversational'
            ],

            hardwareServices: [
                'motorService',
                'lightService',
                'sensorService',
                'webcamService',
                'actuatorService',
                'headTrackingService'
            ],

            ...options
        };

        this.portManager = getPortManager();
        this.serviceDiscovery = getServiceDiscovery();
        this.serviceManager = getEnhancedServiceManager();
        this.proxyManager = getDynamicWebSocketProxy();
        this.characterLoader = new CharacterBasedServiceLoader(options.dynamicCharacterManager);

        this.isInitialized = false;
        this.startupResults = null;
        this.characterInfo = null;
    }
    
    /**
     * Initialize the complete service integration
     */
    async initialize() {
        try {
            logger.info('🚀 Initializing MonsterBox Service Integration...');

            // Reset singleton instances to ensure fresh configuration
            logger.info('🔄 Resetting service singletons for fresh configuration...');
            resetPortManager();
            resetServiceDiscovery();

            // Initialize character-based service loading first
            if (this.config.enableCharacterBasedLoading) {
                this.characterInfo = await this.characterLoader.initialize();
                logger.info(`🎭 Character-based loading enabled for character ${this.characterInfo.characterId}`);
                logger.info(`📋 Will start ${this.characterInfo.requiredServices.length} services based on character parts`);
            }

            // Validate configuration
            const configValidation = validateConfig();
            if (!configValidation.valid) {
                logger.error('❌ Port configuration validation failed:');
                configValidation.errors.forEach(error => logger.error(`  - ${error}`));
                throw new Error('Invalid port configuration');
            }

            logger.info('✅ Port configuration validated successfully');

            // Initialize components in order
            await this.portManager.initialize();
            await this.serviceDiscovery.initialize();
            await this.serviceManager.initialize();
            await this.proxyManager.initialize();

            // Set up event handlers
            this.setupEventHandlers();

            // Auto-start services if enabled
            if (this.config.autoStartServices) {
                this.startupResults = await this.startAllServices();
            }

            this.isInitialized = true;
            logger.info('✅ MonsterBox Service Integration initialized successfully');

            return {
                success: true,
                startupResults: this.startupResults,
                characterInfo: this.characterInfo
            };

        } catch (error) {
            logger.error('❌ Failed to initialize MonsterBox Service Integration:', error);
            throw error;
        }
    }
    
    /**
     * Start all services in the correct order
     */
    async startAllServices() {
        logger.info('🚀 Starting all MonsterBox services...');
        
        const results = {
            core: [],
            hardware: [],
            total: { started: 0, failed: 0 }
        };
        
        try {
            // Filter services based on character requirements
            const coreServices = this.filterServicesByCharacter(this.config.coreServices);
            const hardwareServices = this.filterServicesByCharacter(this.config.hardwareServices);

            // Start core services first
            logger.info('🔧 Starting core services...');
            for (const serviceName of coreServices) {
                try {
                    const registration = await this.serviceManager.startService(serviceName);
                    results.core.push({ serviceName, success: true, registration });
                    results.total.started++;
                    logger.info(`✅ Core service ${serviceName} started on port ${registration.port}`);
                } catch (error) {
                    results.core.push({ serviceName, success: false, error: error.message });
                    results.total.failed++;
                    logger.error(`❌ Failed to start core service ${serviceName}:`, error.message);
                }
            }
            
            // Wait a moment for core services to stabilize
            await new Promise(resolve => setTimeout(resolve, 2000));
            
            // Start hardware services
            logger.info('🔧 Starting hardware services...');
            for (const serviceName of hardwareServices) {
                try {
                    const registration = await this.serviceManager.startService(serviceName);
                    results.hardware.push({ serviceName, success: true, registration });
                    results.total.started++;
                    logger.info(`✅ Hardware service ${serviceName} started on port ${registration.port}`);
                } catch (error) {
                    results.hardware.push({ serviceName, success: false, error: error.message });
                    results.total.failed++;
                    logger.error(`❌ Failed to start hardware service ${serviceName}:`, error.message);
                }
            }
            
            // Wait for hardware services to stabilize
            await new Promise(resolve => setTimeout(resolve, 2000));
            
            const totalServices = results.total.started + results.total.failed;
            logger.info(`✅ Service startup complete: ${results.total.started}/${totalServices} services started successfully`);
            
            return results;
            
        } catch (error) {
            logger.error('❌ Error during service startup:', error);
            throw error;
        }
    }
    
    /**
     * Stop all services
     */
    async stopAllServices() {
        logger.info('🛑 Stopping all MonsterBox services...');
        
        try {
            const results = await this.serviceManager.stopAllServices();
            
            const successCount = results.filter(r => r.success).length;
            logger.info(`✅ Service shutdown complete: ${successCount}/${results.length} services stopped successfully`);
            
            return results;
        } catch (error) {
            logger.error('❌ Error during service shutdown:', error);
            throw error;
        }
    }
    
    /**
     * Get service connection information for frontend
     */
    getServiceConnections() {
        const connections = {};
        const services = this.serviceDiscovery.getAllServices();
        
        for (const service of services) {
            connections[service.name] = {
                name: service.name,
                type: service.type,
                status: service.status,
                port: service.port,
                proxyPort: service.proxyPort,
                websocketUrl: service.endpoints.websocket,
                proxyUrl: service.endpoints.proxy,
                description: service.description,
                tags: Array.from(service.tags || [])
            };
        }
        
        return connections;
    }
    
    /**
     * Get comprehensive system status
     */
    getSystemStatus() {
        return {
            integration: {
                initialized: this.isInitialized,
                startupResults: this.startupResults
            },
            portManager: {
                initialized: this.portManager.isInitialized,
                stats: this.portManager.getPortUsageStats()
            },
            serviceDiscovery: {
                initialized: this.serviceDiscovery.isInitialized,
                stats: this.serviceDiscovery.getDiscoveryStats()
            },
            serviceManager: {
                statuses: this.serviceManager.getAllServiceStatuses()
            },
            proxyManager: {
                initialized: this.proxyManager.isInitialized,
                stats: this.proxyManager.getProxyStats()
            },
            services: this.getServiceConnections()
        };
    }
    
    /**
     * Start a specific service
     */
    async startService(serviceName, customConfig = {}) {
        try {
            logger.info(`🚀 Starting service: ${serviceName}`);
            const registration = await this.serviceManager.startService(serviceName, customConfig);
            logger.info(`✅ Service ${serviceName} started successfully on port ${registration.port}`);
            return registration;
        } catch (error) {
            logger.error(`❌ Failed to start service ${serviceName}:`, error);
            throw error;
        }
    }
    
    /**
     * Stop a specific service
     */
    async stopService(serviceName) {
        try {
            logger.info(`🛑 Stopping service: ${serviceName}`);
            const result = await this.serviceManager.stopService(serviceName);
            logger.info(`✅ Service ${serviceName} stopped successfully`);
            return result;
        } catch (error) {
            logger.error(`❌ Failed to stop service ${serviceName}:`, error);
            throw error;
        }
    }
    
    /**
     * Restart a specific service
     */
    async restartService(serviceName) {
        try {
            logger.info(`🔄 Restarting service: ${serviceName}`);
            const registration = await this.serviceManager.restartService(serviceName);
            logger.info(`✅ Service ${serviceName} restarted successfully on port ${registration.port}`);
            return registration;
        } catch (error) {
            logger.error(`❌ Failed to restart service ${serviceName}:`, error);
            throw error;
        }
    }
    
    /**
     * Get service information
     */
    getServiceInfo(serviceName) {
        const discoveryInfo = this.serviceDiscovery.findService(serviceName);
        const managerStatus = this.serviceManager.getServiceStatus(serviceName);
        
        return {
            discovery: discoveryInfo,
            manager: managerStatus,
            connection: this.serviceDiscovery.getServiceConnection(serviceName)
        };
    }
    
    /**
     * Setup event handlers
     */
    setupEventHandlers() {
        // Service manager events
        this.serviceManager.on('serviceStarted', ({ serviceName, registration }) => {
            logger.info(`📡 Service started event: ${serviceName} on port ${registration.port}`);
        });
        
        this.serviceManager.on('serviceStopped', ({ serviceName }) => {
            logger.info(`📡 Service stopped event: ${serviceName}`);
        });
        
        this.serviceManager.on('serviceRestartFailed', ({ serviceName, attempts }) => {
            logger.error(`📡 Service restart failed: ${serviceName} after ${attempts} attempts`);
        });
        
        // Service discovery events
        this.serviceDiscovery.on('serviceRegistered', (service) => {
            logger.debug(`📡 Service registered: ${service.name}`);
        });
        
        this.serviceDiscovery.on('serviceUnregistered', (service) => {
            logger.debug(`📡 Service unregistered: ${service.name}`);
        });
        
        // Proxy manager events
        this.proxyManager.on('proxyCreated', ({ service }) => {
            logger.debug(`📡 Proxy created: ${service.name} (${service.proxyPort} → ${service.port})`);
        });
        
        this.proxyManager.on('proxyRemoved', ({ serviceName }) => {
            logger.debug(`📡 Proxy removed: ${serviceName}`);
        });
    }
    
    /**
     * Legacy compatibility methods
     */
    getLegacyServicePorts() {
        if (!this.config.enableLegacySupport) {
            return {};
        }
        
        const legacyPorts = {};
        const services = this.serviceDiscovery.getAllServices();
        
        for (const service of services) {
            // Map to legacy port names
            const legacyName = this.mapToLegacyName(service.name);
            if (legacyName) {
                legacyPorts[legacyName] = service.port;
            }
        }
        
        return legacyPorts;
    }
    
    /**
     * Map service names to legacy names for backward compatibility
     */
    mapToLegacyName(serviceName) {
        const mapping = {
            'microphone': 'MICROPHONE_PORT',
            'audioStream': 'AUDIO_STREAM_PORT',
            'jawAnimation': 'JAW_ANIMATION_PORT',
            'aibridge': 'AI_BRIDGE_PORT',
            'hardwareRegistry': 'HARDWARE_REGISTRY_PORT',
            'motorService': 'MOTOR_SERVICE_PORT',
            'lightService': 'LIGHT_SERVICE_PORT',
            'sensorService': 'SENSOR_SERVICE_PORT',
            'webcamService': 'WEBCAM_SERVICE_PORT',
            'actuatorService': 'ACTUATOR_SERVICE_PORT',
            'headTrackingService': 'HEAD_TRACKING_PORT'
        };
        
        return mapping[serviceName] || null;
    }
    
    /**
     * Health check for all services
     */
    async performHealthCheck() {
        logger.info('💓 Performing system health check...');

        const healthStatus = {
            overall: 'healthy',
            services: {},
            issues: []
        };

        const services = this.serviceDiscovery.getAllServices();

        // Only check services that are actually registered and expected to be running
        const runningServices = services.filter(service => {
            // Check if service is actually registered in port manager
            const portService = this.portManager.getService(service.name);
            return portService && portService.status !== 'stopped';
        });

        for (const service of runningServices) {
            try {
                const status = this.serviceManager.getServiceStatus(service.name);
                healthStatus.services[service.name] = {
                    status: status.status,
                    uptime: status.uptime,
                    lastHealthCheck: service.lastHealthCheck
                };

                // Only report issues for services that should be running
                if (status.status !== 'running' && status.status !== 'healthy') {
                    healthStatus.issues.push(`Service ${service.name} is ${status.status}`);
                    healthStatus.overall = 'degraded';
                }
            } catch (error) {
                // Service might not be started yet, which is okay
                logger.debug(`Service ${service.name} not available for health check: ${error.message}`);
            }
        }

        if (healthStatus.issues.length > 0) {
            logger.warn(`⚠️ Health check found ${healthStatus.issues.length} issues`);
        } else {
            logger.info('✅ All services healthy');
        }

        return healthStatus;
    }
    
    /**
     * Cleanup and shutdown
     */
    async shutdown() {
        logger.info('🚀 Shutting down MonsterBox Service Integration...');
        
        try {
            // Stop all services
            await this.stopAllServices();
            
            // Shutdown components
            await this.proxyManager.shutdown();
            await this.serviceManager.shutdown();
            await this.serviceDiscovery.shutdown();
            await this.portManager.shutdown();
            
            logger.info('✅ MonsterBox Service Integration shutdown complete');
        } catch (error) {
            logger.error('❌ Error during shutdown:', error);
            throw error;
        }
    }

    /**
     * Filter services based on character requirements
     */
    filterServicesByCharacter(serviceList) {
        if (!this.config.enableCharacterBasedLoading || !this.characterLoader) {
            return serviceList; // Return all services if character-based loading is disabled
        }

        const filteredServices = serviceList.filter(serviceName => {
            const shouldStart = this.characterLoader.shouldStartService(serviceName);
            if (!shouldStart) {
                logger.info(`⏭️ Skipping ${serviceName} - not required for character ${this.characterInfo?.characterId}`);
            }
            return shouldStart;
        });

        logger.info(`🎭 Filtered ${serviceList.length} services to ${filteredServices.length} for character ${this.characterInfo?.characterId}`);
        return filteredServices;
    }

    /**
     * Get character information
     */
    getCharacterInfo() {
        return this.characterInfo;
    }

    /**
     * Get service integration status
     */
    getStatus() {
        return {
            isInitialized: this.isInitialized,
            startupResults: this.startupResults,
            characterInfo: this.characterInfo,
            portManager: this.portManager.getStatus(),
            serviceDiscovery: this.serviceDiscovery.getStatus(),
            serviceManager: this.serviceManager.getStatus(),
            proxyManager: this.proxyManager.getStatus()
        };
    }
}

// Singleton instance
let instance = null;

/**
 * Get the singleton MonsterBox Service Integration instance
 */
function getInstance(options = {}) {
    if (!instance) {
        instance = new MonsterBoxServiceIntegration(options);
    }
    return instance;
}

module.exports = { MonsterBoxServiceIntegration, getInstance };
