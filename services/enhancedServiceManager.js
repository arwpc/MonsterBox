/**
 * Enhanced Service Manager with Centralized Port Management
 * 
 * Replaces the old service managers with a unified system that:
 * - Uses centralized port allocation
 * - Provides service discovery
 * - Handles automatic proxy creation
 * - Manages service dependencies
 * - Provides health monitoring
 */

const { spawn } = require('child_process');
const path = require('path');
const EventEmitter = require('events');
const { getInstance: getPortManager } = require('./portManager');
const { getInstance: getServiceDiscovery } = require('./serviceDiscovery');
const { getServiceConfig, getAllServiceConfigs } = require('../config/portConfig');
const logger = require('../scripts/logger');

class EnhancedServiceManager extends EventEmitter {
    constructor(options = {}) {
        super();
        
        this.config = {
            // Service startup timeout
            startupTimeout: 30000,
            
            // Service shutdown timeout
            shutdownTimeout: 10000,
            
            // Restart settings
            autoRestart: true,
            maxRestartAttempts: 3,
            restartDelay: 5000,
            
            // Process management
            killSignal: 'SIGTERM',
            killTimeout: 5000,
            
            ...options
        };
        
        this.portManager = getPortManager();
        this.serviceDiscovery = getServiceDiscovery();
        this.processes = new Map();
        this.restartAttempts = new Map();
        this.isInitialized = false;
    }
    
    /**
     * Initialize the service manager
     */
    async initialize() {
        try {
            logger.info('🚀 Initializing Enhanced Service Manager...');
            
            // Initialize dependencies
            if (!this.portManager.isInitialized) {
                await this.portManager.initialize();
            }
            
            if (!this.serviceDiscovery.isInitialized) {
                await this.serviceDiscovery.initialize();
            }
            
            // Listen to service events
            this.serviceDiscovery.on('serviceUnhealthy', (service) => {
                this.handleUnhealthyService(service);
            });
            
            this.isInitialized = true;
            logger.info('✅ Enhanced Service Manager initialized successfully');
            
            this.emit('initialized');
            return true;
        } catch (error) {
            logger.error('❌ Failed to initialize Enhanced Service Manager:', error);
            throw error;
        }
    }
    
    /**
     * Start a service by name
     */
    async startService(serviceName, customConfig = {}) {
        if (!this.isInitialized) {
            throw new Error('Service Manager not initialized');
        }
        
        // Get service configuration
        const serviceConfig = getServiceConfig(serviceName);
        if (!serviceConfig) {
            throw new Error(`Unknown service: ${serviceName}`);
        }
        
        // Merge with custom config
        const finalConfig = { ...serviceConfig, ...customConfig };
        
        logger.info(`🚀 Starting service: ${serviceName}`);
        
        try {
            // Check if service is already running
            if (this.processes.has(serviceName)) {
                logger.warn(`Service ${serviceName} is already running`);
                return this.processes.get(serviceName);
            }
            
            // Register service and allocate ports
            const registration = await this.serviceDiscovery.registerService(finalConfig);
            
            // Start the service process
            const process = await this.startServiceProcess(serviceName, registration, finalConfig);
            
            // Store process info
            this.processes.set(serviceName, {
                process,
                registration,
                config: finalConfig,
                startedAt: new Date(),
                restartCount: 0
            });
            
            // Reset restart attempts
            this.restartAttempts.delete(serviceName);
            
            logger.info(`✅ Service ${serviceName} started successfully on port ${registration.port}`);
            
            this.emit('serviceStarted', { serviceName, registration });
            return registration;
            
        } catch (error) {
            logger.error(`❌ Failed to start service ${serviceName}:`, error);
            
            // Clean up on failure
            try {
                await this.serviceDiscovery.unregisterService(serviceName);
            } catch (cleanupError) {
                logger.error(`Failed to cleanup service ${serviceName}:`, cleanupError);
            }
            
            throw error;
        }
    }
    
    /**
     * Stop a service by name
     */
    async stopService(serviceName) {
        if (!this.processes.has(serviceName)) {
            logger.warn(`Service ${serviceName} is not running`);
            return false;
        }
        
        const serviceInfo = this.processes.get(serviceName);
        
        logger.info(`🛑 Stopping service: ${serviceName}`);
        
        try {
            // Stop the process
            await this.stopServiceProcess(serviceInfo.process);
            
            // Unregister service
            await this.serviceDiscovery.unregisterService(serviceName);
            
            // Remove from processes
            this.processes.delete(serviceName);
            this.restartAttempts.delete(serviceName);
            
            logger.info(`✅ Service ${serviceName} stopped successfully`);
            
            this.emit('serviceStopped', { serviceName });
            return true;
            
        } catch (error) {
            logger.error(`❌ Failed to stop service ${serviceName}:`, error);
            throw error;
        }
    }
    
    /**
     * Restart a service
     */
    async restartService(serviceName) {
        logger.info(`🔄 Restarting service: ${serviceName}`);
        
        const serviceInfo = this.processes.get(serviceName);
        const config = serviceInfo ? serviceInfo.config : {};
        
        // Stop if running
        if (this.processes.has(serviceName)) {
            await this.stopService(serviceName);
        }
        
        // Wait a moment before restarting
        await new Promise(resolve => setTimeout(resolve, 1000));
        
        // Start again
        return await this.startService(serviceName, config);
    }
    
    /**
     * Start all configured services
     */
    async startAllServices() {
        const serviceConfigs = getAllServiceConfigs();
        const results = [];
        
        logger.info(`🚀 Starting ${Object.keys(serviceConfigs).length} services...`);
        
        // Start services in dependency order
        const startOrder = this.calculateStartOrder(serviceConfigs);
        
        for (const serviceName of startOrder) {
            try {
                const registration = await this.startService(serviceName);
                results.push({ serviceName, success: true, registration });
            } catch (error) {
                logger.error(`Failed to start service ${serviceName}:`, error);
                results.push({ serviceName, success: false, error: error.message });
            }
        }
        
        const successCount = results.filter(r => r.success).length;
        logger.info(`✅ Started ${successCount}/${results.length} services successfully`);
        
        return results;
    }
    
    /**
     * Stop all running services
     */
    async stopAllServices() {
        const serviceNames = Array.from(this.processes.keys());
        const results = [];
        
        logger.info(`🛑 Stopping ${serviceNames.length} services...`);
        
        // Stop services in reverse dependency order
        const stopOrder = serviceNames.reverse();
        
        for (const serviceName of stopOrder) {
            try {
                await this.stopService(serviceName);
                results.push({ serviceName, success: true });
            } catch (error) {
                logger.error(`Failed to stop service ${serviceName}:`, error);
                results.push({ serviceName, success: false, error: error.message });
            }
        }
        
        const successCount = results.filter(r => r.success).length;
        logger.info(`✅ Stopped ${successCount}/${results.length} services successfully`);
        
        return results;
    }
    
    /**
     * Get service status
     */
    getServiceStatus(serviceName) {
        const processInfo = this.processes.get(serviceName);
        const discoveryInfo = this.serviceDiscovery.findService(serviceName);
        
        if (!processInfo && !discoveryInfo) {
            return { status: 'not_found' };
        }
        
        return {
            status: processInfo ? 'running' : 'stopped',
            processInfo,
            discoveryInfo,
            uptime: processInfo ? Date.now() - processInfo.startedAt.getTime() : 0
        };
    }
    
    /**
     * Get all service statuses
     */
    getAllServiceStatuses() {
        const statuses = {};
        const allServices = new Set([
            ...this.processes.keys(),
            ...this.serviceDiscovery.getAllServices().map(s => s.name)
        ]);
        
        for (const serviceName of allServices) {
            statuses[serviceName] = this.getServiceStatus(serviceName);
        }
        
        return statuses;
    }
    
    /**
     * Start a service process
     */
    async startServiceProcess(serviceName, registration, config) {
        return new Promise((resolve, reject) => {
            const { script, type = 'node', args = [] } = config;
            
            if (!script) {
                reject(new Error(`No script defined for service ${serviceName}`));
                return;
            }
            
            // Determine command and arguments
            let command, processArgs;
            
            if (type === 'python') {
                command = 'python3';
                processArgs = [
                    script,
                    '--host', '0.0.0.0',
                    '--port', registration.port.toString(),
                    ...args
                ];
            } else if (type === 'node') {
                command = 'node';
                processArgs = [script, ...args];
            } else {
                reject(new Error(`Unknown service type: ${type}`));
                return;
            }
            
            // Set environment variables
            const env = {
                ...process.env,
                SERVICE_NAME: serviceName,
                SERVICE_PORT: registration.port.toString(),
                SERVICE_PROXY_PORT: registration.proxyPort ? registration.proxyPort.toString() : '',
                NODE_ENV: process.env.NODE_ENV || 'development'
            };
            
            // Spawn process
            const childProcess = spawn(command, processArgs, {
                env,
                cwd: path.resolve(__dirname, '..'),
                stdio: ['pipe', 'pipe', 'pipe']
            });
            
            // Handle process events
            childProcess.on('spawn', () => {
                logger.debug(`Process spawned for service ${serviceName} (PID: ${childProcess.pid})`);
                resolve(childProcess);
            });
            
            childProcess.on('error', (error) => {
                logger.error(`Process error for service ${serviceName}:`, error);
                reject(error);
            });
            
            childProcess.on('exit', (code, signal) => {
                logger.info(`Service ${serviceName} exited with code ${code}, signal ${signal}`);
                this.handleServiceExit(serviceName, code, signal);
            });
            
            // Handle stdout/stderr
            childProcess.stdout.on('data', (data) => {
                logger.debug(`${serviceName} stdout: ${data.toString().trim()}`);
            });
            
            childProcess.stderr.on('data', (data) => {
                logger.debug(`${serviceName} stderr: ${data.toString().trim()}`);
            });
            
            // Set timeout for startup
            setTimeout(() => {
                if (!childProcess.pid) {
                    reject(new Error(`Service ${serviceName} failed to start within timeout`));
                }
            }, this.config.startupTimeout);
        });
    }
    
    /**
     * Stop a service process
     */
    async stopServiceProcess(process) {
        return new Promise((resolve) => {
            if (!process || !process.pid) {
                resolve();
                return;
            }
            
            // Try graceful shutdown first
            process.kill(this.config.killSignal);
            
            // Force kill if not stopped within timeout
            const forceKillTimeout = setTimeout(() => {
                if (process.pid) {
                    logger.warn(`Force killing process ${process.pid}`);
                    process.kill('SIGKILL');
                }
            }, this.config.killTimeout);
            
            process.on('exit', () => {
                clearTimeout(forceKillTimeout);
                resolve();
            });
        });
    }
    
    /**
     * Handle service exit
     */
    handleServiceExit(serviceName, code, signal) {
        const serviceInfo = this.processes.get(serviceName);
        if (!serviceInfo) return;
        
        // Remove from processes
        this.processes.delete(serviceName);
        
        // Handle restart if enabled and not intentional shutdown
        if (this.config.autoRestart && serviceInfo.config.autoRestart && code !== 0) {
            this.handleServiceRestart(serviceName, serviceInfo.config);
        }
        
        this.emit('serviceExited', { serviceName, code, signal });
    }
    
    /**
     * Handle service restart
     */
    async handleServiceRestart(serviceName, config) {
        const attempts = this.restartAttempts.get(serviceName) || 0;
        
        if (attempts >= this.config.maxRestartAttempts) {
            logger.error(`Service ${serviceName} exceeded max restart attempts (${attempts})`);
            this.emit('serviceRestartFailed', { serviceName, attempts });
            return;
        }
        
        this.restartAttempts.set(serviceName, attempts + 1);
        
        logger.info(`Restarting service ${serviceName} (attempt ${attempts + 1}/${this.config.maxRestartAttempts})`);
        
        // Wait before restarting
        await new Promise(resolve => setTimeout(resolve, this.config.restartDelay));
        
        try {
            await this.startService(serviceName, config);
            logger.info(`✅ Service ${serviceName} restarted successfully`);
        } catch (error) {
            logger.error(`❌ Failed to restart service ${serviceName}:`, error);
            // Will try again on next exit if within attempt limit
        }
    }
    
    /**
     * Handle unhealthy service
     */
    async handleUnhealthyService(service) {
        logger.warn(`Service ${service.name} is unhealthy, attempting restart...`);
        
        try {
            await this.restartService(service.name);
        } catch (error) {
            logger.error(`Failed to restart unhealthy service ${service.name}:`, error);
        }
    }
    
    /**
     * Calculate service start order based on dependencies
     */
    calculateStartOrder(serviceConfigs) {
        const order = [];
        const visited = new Set();
        const visiting = new Set();
        
        function visit(serviceName) {
            if (visiting.has(serviceName)) {
                throw new Error(`Circular dependency detected involving ${serviceName}`);
            }
            
            if (visited.has(serviceName)) {
                return;
            }
            
            visiting.add(serviceName);
            
            const config = serviceConfigs[serviceName];
            if (config && config.dependencies) {
                for (const dependency of config.dependencies) {
                    if (serviceConfigs[dependency]) {
                        visit(dependency);
                    }
                }
            }
            
            visiting.delete(serviceName);
            visited.add(serviceName);
            order.push(serviceName);
        }
        
        for (const serviceName of Object.keys(serviceConfigs)) {
            visit(serviceName);
        }
        
        return order;
    }
    
    /**
     * Cleanup and shutdown
     */
    async shutdown() {
        logger.info('🚀 Shutting down Enhanced Service Manager...');
        
        await this.stopAllServices();
        
        this.emit('shutdown');
        logger.info('✅ Enhanced Service Manager shutdown complete');
    }
}

// Singleton instance
let instance = null;

/**
 * Get the singleton Enhanced Service Manager instance
 */
function getInstance(options = {}) {
    if (!instance) {
        instance = new EnhancedServiceManager(options);
    }
    return instance;
}

module.exports = { EnhancedServiceManager, getInstance };
