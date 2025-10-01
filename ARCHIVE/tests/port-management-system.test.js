/**
 * Port Management System Tests
 * 
 * Comprehensive tests for the centralized port management system
 */

const { expect } = require('chai');
const { PortManager } = require('../services/portManager');
const { ServiceDiscovery } = require('../services/serviceDiscovery');
const { EnhancedServiceManager } = require('../services/enhancedServiceManager');
const { DynamicWebSocketProxy } = require('../services/dynamicWebSocketProxy');
const { MonsterBoxServiceIntegration } = require('../services/monsterBoxServiceIntegration');
const { validateConfig, getEnvironmentConfig } = require('../config/portConfig');
const fs = require('fs').promises;
const path = require('path');

describe('Port Management System', function() {
    this.timeout(30000);
    
    let portManager;
    let serviceDiscovery;
    let serviceManager;
    let proxyManager;
    let serviceIntegration;
    
    before(async function() {
        // Set test environment
        process.env.NODE_ENV = 'test';
        
        // Clean up any existing registry
        const registryPath = path.join(__dirname, '../data/port-registry.json');
        try {
            await fs.unlink(registryPath);
        } catch (error) {
            // File doesn't exist, that's fine
        }
    });
    
    after(async function() {
        // Clean up test instances
        if (serviceIntegration) {
            await serviceIntegration.shutdown();
        }
        if (proxyManager) {
            await proxyManager.shutdown();
        }
        if (serviceManager) {
            await serviceManager.shutdown();
        }
        if (serviceDiscovery) {
            await serviceDiscovery.shutdown();
        }
        if (portManager) {
            await portManager.shutdown();
        }
    });
    
    describe('Port Configuration', function() {
        it('should validate port configuration successfully', function() {
            const validation = validateConfig();
            expect(validation.valid).to.be.true;
            expect(validation.errors).to.be.an('array').that.is.empty;
        });
        
        it('should provide environment-specific configuration', function() {
            const config = getEnvironmentConfig();
            expect(config).to.have.property('environment', 'test');
            expect(config).to.have.property('ranges');
            expect(config).to.have.property('reserved');
            expect(config).to.have.property('priorities');
        });
        
        it('should have non-overlapping port ranges', function() {
            const config = getEnvironmentConfig();
            const ranges = Object.values(config.ranges);
            
            for (let i = 0; i < ranges.length; i++) {
                for (let j = i + 1; j < ranges.length; j++) {
                    const range1 = ranges[i];
                    const range2 = ranges[j];
                    
                    const overlap = range1.start <= range2.end && range2.start <= range1.end;
                    expect(overlap).to.be.false;
                }
            }
        });
    });
    
    describe('Port Manager', function() {
        beforeEach(async function() {
            portManager = new PortManager();
            await portManager.initialize();
        });
        
        afterEach(async function() {
            if (portManager) {
                await portManager.shutdown();
                portManager = null;
            }
        });
        
        it('should initialize successfully', function() {
            expect(portManager.isInitialized).to.be.true;
        });
        
        it('should register a service and allocate ports', async function() {
            const registration = await portManager.registerService({
                name: 'test-service',
                type: 'testing',
                requiresProxy: true
            });
            
            expect(registration).to.have.property('name', 'test-service');
            expect(registration).to.have.property('type', 'testing');
            expect(registration).to.have.property('port');
            expect(registration).to.have.property('proxyPort');
            expect(registration.port).to.be.a('number');
            expect(registration.proxyPort).to.be.a('number');
        });
        
        it('should prevent duplicate service registration', async function() {
            await portManager.registerService({
                name: 'duplicate-test',
                type: 'testing'
            });
            
            const secondRegistration = await portManager.registerService({
                name: 'duplicate-test',
                type: 'testing'
            });
            
            expect(secondRegistration.name).to.equal('duplicate-test');
        });
        
        it('should unregister services and free ports', async function() {
            const registration = await portManager.registerService({
                name: 'temp-service',
                type: 'testing'
            });
            
            const port = registration.port;
            
            const result = await portManager.unregisterService('temp-service');
            expect(result).to.be.true;
            
            const isAvailable = await portManager.isPortAvailable(port);
            expect(isAvailable).to.be.true;
        });
        
        it('should provide port usage statistics', function() {
            const stats = portManager.getPortUsageStats();
            expect(stats).to.have.property('totalAllocated');
            expect(stats).to.have.property('serviceCount');
            expect(stats).to.have.property('byType');
            expect(stats).to.have.property('ranges');
        });
    });
    
    describe('Service Discovery', function() {
        beforeEach(async function() {
            portManager = new PortManager();
            await portManager.initialize();
            
            serviceDiscovery = new ServiceDiscovery();
            await serviceDiscovery.initialize();
        });
        
        afterEach(async function() {
            if (serviceDiscovery) {
                await serviceDiscovery.shutdown();
                serviceDiscovery = null;
            }
            if (portManager) {
                await portManager.shutdown();
                portManager = null;
            }
        });
        
        it('should register services with discovery metadata', async function() {
            const registration = await serviceDiscovery.registerService({
                name: 'discovery-test',
                type: 'testing',
                description: 'Test service for discovery',
                tags: ['test', 'discovery'],
                dependencies: []
            });
            
            expect(registration).to.have.property('description');
            expect(registration).to.have.property('tags');
            expect(registration).to.have.property('endpoints');
            expect(registration.tags.has('test')).to.be.true;
        });
        
        it('should find services by type', async function() {
            await serviceDiscovery.registerService({
                name: 'test-service-1',
                type: 'testing',
                tags: ['test']
            });
            
            await serviceDiscovery.registerService({
                name: 'test-service-2',
                type: 'testing',
                tags: ['test']
            });
            
            const services = serviceDiscovery.findServicesByType('testing');
            expect(services).to.have.length(2);
        });
        
        it('should find services by tag', async function() {
            await serviceDiscovery.registerService({
                name: 'tagged-service',
                type: 'testing',
                tags: ['special-tag']
            });
            
            const services = serviceDiscovery.findServicesByTag('special-tag');
            expect(services).to.have.length(1);
            expect(services[0].name).to.equal('tagged-service');
        });
        
        it('should provide service connection information', async function() {
            await serviceDiscovery.registerService({
                name: 'connection-test',
                type: 'testing',
                requiresProxy: true
            });
            
            const connection = serviceDiscovery.getServiceConnection('connection-test');
            expect(connection).to.have.property('url');
            expect(connection).to.have.property('type');
            expect(connection).to.have.property('port');
        });
    });
    
    describe('Enhanced Service Manager', function() {
        beforeEach(async function() {
            portManager = new PortManager();
            await portManager.initialize();
            
            serviceDiscovery = new ServiceDiscovery();
            await serviceDiscovery.initialize();
            
            serviceManager = new EnhancedServiceManager();
            await serviceManager.initialize();
        });
        
        afterEach(async function() {
            if (serviceManager) {
                await serviceManager.shutdown();
                serviceManager = null;
            }
            if (serviceDiscovery) {
                await serviceDiscovery.shutdown();
                serviceDiscovery = null;
            }
            if (portManager) {
                await portManager.shutdown();
                portManager = null;
            }
        });
        
        it('should calculate service start order based on dependencies', function() {
            const serviceConfigs = {
                'service-a': { dependencies: [] },
                'service-b': { dependencies: ['service-a'] },
                'service-c': { dependencies: ['service-b'] }
            };
            
            const order = serviceManager.calculateStartOrder(serviceConfigs);
            
            expect(order.indexOf('service-a')).to.be.lessThan(order.indexOf('service-b'));
            expect(order.indexOf('service-b')).to.be.lessThan(order.indexOf('service-c'));
        });
        
        it('should detect circular dependencies', function() {
            const serviceConfigs = {
                'service-a': { dependencies: ['service-b'] },
                'service-b': { dependencies: ['service-a'] }
            };
            
            expect(() => {
                serviceManager.calculateStartOrder(serviceConfigs);
            }).to.throw('Circular dependency');
        });
        
        it('should provide service status information', function() {
            const status = serviceManager.getServiceStatus('non-existent-service');
            expect(status).to.have.property('status', 'not_found');
        });
    });
    
    describe('Dynamic WebSocket Proxy', function() {
        beforeEach(async function() {
            portManager = new PortManager();
            await portManager.initialize();
            
            serviceDiscovery = new ServiceDiscovery();
            await serviceDiscovery.initialize();
            
            proxyManager = new DynamicWebSocketProxy();
            await proxyManager.initialize();
        });
        
        afterEach(async function() {
            if (proxyManager) {
                await proxyManager.shutdown();
                proxyManager = null;
            }
            if (serviceDiscovery) {
                await serviceDiscovery.shutdown();
                serviceDiscovery = null;
            }
            if (portManager) {
                await portManager.shutdown();
                portManager = null;
            }
        });
        
        it('should provide proxy statistics', function() {
            const stats = proxyManager.getProxyStats();
            expect(stats).to.have.property('totalProxies');
            expect(stats).to.have.property('activeConnections');
            expect(stats).to.have.property('connectionsByService');
        });
    });
    
    describe('MonsterBox Service Integration', function() {
        beforeEach(async function() {
            serviceIntegration = new MonsterBoxServiceIntegration({
                autoStartServices: false // Don't auto-start for tests
            });
        });
        
        afterEach(async function() {
            if (serviceIntegration) {
                await serviceIntegration.shutdown();
                serviceIntegration = null;
            }
        });
        
        it('should initialize successfully', async function() {
            const result = await serviceIntegration.initialize();
            expect(result.success).to.be.true;
            expect(serviceIntegration.isInitialized).to.be.true;
        });
        
        it('should provide system status', async function() {
            await serviceIntegration.initialize();
            
            const status = serviceIntegration.getSystemStatus();
            expect(status).to.have.property('integration');
            expect(status).to.have.property('portManager');
            expect(status).to.have.property('serviceDiscovery');
            expect(status).to.have.property('serviceManager');
            expect(status).to.have.property('proxyManager');
        });
        
        it('should provide service connections', async function() {
            await serviceIntegration.initialize();
            
            const connections = serviceIntegration.getServiceConnections();
            expect(connections).to.be.an('object');
        });
        
        it('should perform health checks', async function() {
            await serviceIntegration.initialize();
            
            const healthStatus = await serviceIntegration.performHealthCheck();
            expect(healthStatus).to.have.property('overall');
            expect(healthStatus).to.have.property('services');
            expect(healthStatus).to.have.property('issues');
        });
    });
});
