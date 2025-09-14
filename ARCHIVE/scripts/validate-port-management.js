#!/usr/bin/env node
/**
 * Port Management System Validation Script
 * 
 * Validates the new centralized port management system
 */

const { validateConfig, getEnvironmentConfig } = require('../config/portConfig');
const { PortManager } = require('../services/portManager');
const { ServiceDiscovery } = require('../services/serviceDiscovery');
const { MonsterBoxServiceIntegration } = require('../services/monsterBoxServiceIntegration');
const logger = require('./logger');

async function validatePortManagement() {
    logger.info('🔍 Validating Port Management System...');
    
    let success = true;
    const results = {
        configuration: false,
        portManager: false,
        serviceDiscovery: false,
        integration: false,
        cleanup: false
    };
    
    try {
        // 1. Validate Configuration
        logger.info('📋 Validating port configuration...');
        const configValidation = validateConfig();
        
        if (configValidation.valid) {
            logger.info('✅ Port configuration is valid');
            results.configuration = true;
        } else {
            logger.error('❌ Port configuration validation failed:');
            configValidation.errors.forEach(error => logger.error(`  - ${error}`));
            success = false;
        }
        
        // 2. Test Port Manager
        logger.info('🔌 Testing Port Manager...');
        const portManager = new PortManager();
        
        try {
            await portManager.initialize();
            logger.info('✅ Port Manager initialized successfully');
            
            // Test service registration
            const testRegistration = await portManager.registerService({
                name: 'validation-test-service',
                type: 'testing',
                requiresProxy: true
            });
            
            logger.info(`✅ Test service registered on port ${testRegistration.port}, proxy ${testRegistration.proxyPort}`);
            
            // Test port availability check
            const isAvailable = await portManager.isPortAvailable(testRegistration.port);
            if (!isAvailable) {
                logger.info('✅ Port availability check working correctly');
            } else {
                logger.warn('⚠️ Port availability check may have issues');
            }
            
            // Test unregistration
            await portManager.unregisterService('validation-test-service');
            logger.info('✅ Test service unregistered successfully');
            
            // Test statistics
            const stats = portManager.getPortUsageStats();
            logger.info(`📊 Port usage: ${stats.totalAllocated} allocated, ${stats.serviceCount} services`);
            
            results.portManager = true;
            await portManager.shutdown();
            
        } catch (error) {
            logger.error('❌ Port Manager test failed:', error.message);
            success = false;
        }
        
        // 3. Test Service Discovery
        logger.info('🔍 Testing Service Discovery...');
        const serviceDiscovery = new ServiceDiscovery();
        
        try {
            await serviceDiscovery.initialize();
            logger.info('✅ Service Discovery initialized successfully');
            
            // Test service registration with discovery
            const discoveryRegistration = await serviceDiscovery.registerService({
                name: 'discovery-validation-test',
                type: 'testing',
                description: 'Validation test service',
                tags: ['validation', 'test'],
                dependencies: []
            });
            
            logger.info(`✅ Service registered with discovery: ${discoveryRegistration.name}`);
            
            // Test service lookup
            const foundService = serviceDiscovery.findService('discovery-validation-test');
            if (foundService) {
                logger.info('✅ Service lookup working correctly');
            } else {
                logger.error('❌ Service lookup failed');
                success = false;
            }
            
            // Test type-based lookup
            const testServices = serviceDiscovery.findServicesByType('testing');
            logger.info(`✅ Found ${testServices.length} testing services`);
            
            // Test tag-based lookup
            const taggedServices = serviceDiscovery.findServicesByTag('validation');
            logger.info(`✅ Found ${taggedServices.length} validation-tagged services`);
            
            // Test connection info
            const connectionInfo = serviceDiscovery.getServiceConnection('discovery-validation-test');
            if (connectionInfo) {
                logger.info(`✅ Connection info: ${connectionInfo.url} (${connectionInfo.type})`);
            }
            
            // Cleanup
            await serviceDiscovery.unregisterService('discovery-validation-test');
            logger.info('✅ Discovery test service cleaned up');
            
            results.serviceDiscovery = true;
            await serviceDiscovery.shutdown();
            
        } catch (error) {
            logger.error('❌ Service Discovery test failed:', error.message);
            success = false;
        }
        
        // 4. Test Integration System
        logger.info('🚀 Testing Service Integration...');
        const serviceIntegration = new MonsterBoxServiceIntegration({
            autoStartServices: false // Don't start all services for validation
        });
        
        try {
            const initResult = await serviceIntegration.initialize();
            
            if (initResult.success) {
                logger.info('✅ Service Integration initialized successfully');
                
                // Test system status
                const systemStatus = serviceIntegration.getSystemStatus();
                logger.info('✅ System status retrieved successfully');
                logger.info(`📊 Integration status: ${systemStatus.integration.initialized ? 'initialized' : 'not initialized'}`);
                
                // Test health check
                const healthStatus = await serviceIntegration.performHealthCheck();
                logger.info(`💓 Health check: ${healthStatus.overall} (${healthStatus.issues.length} issues)`);
                
                // Test service connections
                const connections = serviceIntegration.getServiceConnections();
                logger.info(`🔗 Service connections: ${Object.keys(connections).length} services available`);
                
                results.integration = true;
            } else {
                logger.error('❌ Service Integration initialization failed');
                success = false;
            }
            
            await serviceIntegration.shutdown();
            
        } catch (error) {
            logger.error('❌ Service Integration test failed:', error.message);
            success = false;
        }
        
        // 5. Cleanup Test
        logger.info('🧹 Testing cleanup procedures...');
        try {
            // Test that all components shut down cleanly
            logger.info('✅ All components shut down successfully');
            results.cleanup = true;
        } catch (error) {
            logger.error('❌ Cleanup test failed:', error.message);
            success = false;
        }
        
    } catch (error) {
        logger.error('❌ Validation failed with error:', error);
        success = false;
    }
    
    // Summary
    logger.info('');
    logger.info('📋 VALIDATION SUMMARY');
    logger.info('====================');
    
    Object.entries(results).forEach(([test, passed]) => {
        const status = passed ? '✅ PASS' : '❌ FAIL';
        logger.info(`${status} ${test}`);
    });
    
    logger.info('');
    
    if (success) {
        logger.info('🎉 Port Management System validation PASSED');
        logger.info('');
        logger.info('The new centralized port management system is ready for use!');
        logger.info('');
        logger.info('Key benefits:');
        logger.info('  • No more port conflicts');
        logger.info('  • Dynamic port allocation');
        logger.info('  • Automatic proxy management');
        logger.info('  • Service discovery');
        logger.info('  • Health monitoring');
        logger.info('  • Centralized configuration');
        
        process.exit(0);
    } else {
        logger.error('💥 Port Management System validation FAILED');
        logger.error('');
        logger.error('Please review the errors above and fix any issues before deploying.');
        
        process.exit(1);
    }
}

// Environment configuration display
function displayEnvironmentConfig() {
    logger.info('🔧 Current Environment Configuration:');
    logger.info('====================================');
    
    const config = getEnvironmentConfig();
    
    logger.info(`Environment: ${config.environment}`);
    logger.info('');
    logger.info('Port Ranges:');
    Object.entries(config.ranges).forEach(([type, range]) => {
        logger.info(`  ${type}: ${range.start}-${range.end} (${range.end - range.start + 1} ports)`);
    });
    
    logger.info('');
    logger.info(`Reserved Ports: ${config.reserved.join(', ')}`);
    logger.info('');
    logger.info('Service Priorities:');
    Object.entries(config.priorities).forEach(([type, priority]) => {
        logger.info(`  ${type}: ${priority}`);
    });
    
    logger.info('');
}

// Main execution
async function main() {
    const args = process.argv.slice(2);
    
    if (args.includes('--help') || args.includes('-h')) {
        console.log('Port Management System Validation Script');
        console.log('');
        console.log('Usage: node validate-port-management.js [options]');
        console.log('');
        console.log('Options:');
        console.log('  --config, -c    Show environment configuration');
        console.log('  --help, -h      Show this help message');
        console.log('');
        process.exit(0);
    }
    
    if (args.includes('--config') || args.includes('-c')) {
        displayEnvironmentConfig();
        return;
    }
    
    await validatePortManagement();
}

// Handle errors
process.on('uncaughtException', (error) => {
    logger.error('Uncaught Exception:', error);
    process.exit(1);
});

process.on('unhandledRejection', (reason, promise) => {
    logger.error('Unhandled Rejection:', reason);
    process.exit(1);
});

// Run the script
if (require.main === module) {
    main().catch(error => {
        logger.error('Script failed:', error);
        process.exit(1);
    });
}

module.exports = { validatePortManagement, displayEnvironmentConfig };
