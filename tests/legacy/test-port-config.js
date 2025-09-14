#!/usr/bin/env node

/**
 * Test script to verify port configuration is working correctly
 */

const { resetInstance: resetPortManager, getInstance: getPortManager } = require('./services/portManager');
const { resetInstance: resetServiceDiscovery, getInstance: getServiceDiscovery } = require('./services/serviceDiscovery');
const { getEnvironmentConfig } = require('./config/portConfig');

async function testPortConfiguration() {
    console.log('🧪 Testing Port Configuration...\n');

    // Reset singletons to ensure fresh configuration
    console.log('🔄 Resetting singleton instances...');
    resetPortManager();
    resetServiceDiscovery();

    // Test environment configuration
    console.log('📋 Environment Configuration:');
    const envConfig = getEnvironmentConfig();
    console.log(`   Environment: ${envConfig.environment}`);
    console.log(`   Service Types: ${Object.keys(envConfig.serviceTypes).join(', ')}`);
    console.log(`   Port Ranges: ${Object.keys(envConfig.ranges).join(', ')}`);
    
    // Check if elevenlabs and hardware are in ranges
    if (envConfig.ranges.elevenlabs) {
        console.log(`   ✅ ElevenLabs range: ${envConfig.ranges.elevenlabs.start}-${envConfig.ranges.elevenlabs.end}`);
    } else {
        console.log('   ❌ ElevenLabs range not found!');
    }
    
    if (envConfig.ranges.hardware) {
        console.log(`   ✅ Hardware range: ${envConfig.ranges.hardware.start}-${envConfig.ranges.hardware.end}`);
    } else {
        console.log('   ❌ Hardware range not found!');
    }

    console.log('\n🔌 Testing Port Manager...');
    
    // Initialize port manager
    const portManager = getPortManager();
    await portManager.initialize();
    
    console.log('✅ Port Manager initialized successfully');

    // Test elevenlabs service registration
    console.log('\n🤖 Testing ElevenLabs service registration...');
    try {
        const elevenLabsRegistration = await portManager.registerService({
            name: 'testElevenLabsService',
            type: 'elevenlabs',
            requiresProxy: true
        });
        
        console.log(`✅ ElevenLabs service registered: port ${elevenLabsRegistration.port}, proxy ${elevenLabsRegistration.proxyPort}`);
        
        // Unregister test service
        await portManager.unregisterService('testElevenLabsService');
        console.log('✅ Test service unregistered');
        
    } catch (error) {
        console.log(`❌ ElevenLabs service registration failed: ${error.message}`);
    }

    // Test hardware service registration
    console.log('\n🔧 Testing Hardware service registration...');
    try {
        const hardwareRegistration = await portManager.registerService({
            name: 'testHardwareService',
            type: 'hardware',
            requiresProxy: true
        });
        
        console.log(`✅ Hardware service registered: port ${hardwareRegistration.port}, proxy ${hardwareRegistration.proxyPort}`);
        
        // Unregister test service
        await portManager.unregisterService('testHardwareService');
        console.log('✅ Test service unregistered');
        
    } catch (error) {
        console.log(`❌ Hardware service registration failed: ${error.message}`);
    }

    // Test service discovery
    console.log('\n🔍 Testing Service Discovery...');
    const serviceDiscovery = getServiceDiscovery();
    await serviceDiscovery.initialize();
    
    console.log('✅ Service Discovery initialized successfully');

    // Test elevenlabs service discovery registration
    try {
        const discoveryRegistration = await serviceDiscovery.registerService({
            name: 'testElevenLabsDiscovery',
            type: 'elevenlabs',
            description: 'Test ElevenLabs service for discovery',
            tags: ['test', 'elevenlabs']
        });
        
        console.log(`✅ ElevenLabs service registered in discovery: port ${discoveryRegistration.port}`);
        
        // Unregister test service
        await serviceDiscovery.unregisterService('testElevenLabsDiscovery');
        console.log('✅ Test discovery service unregistered');
        
    } catch (error) {
        console.log(`❌ ElevenLabs discovery registration failed: ${error.message}`);
    }

    // Cleanup
    await portManager.shutdown();
    await serviceDiscovery.shutdown();
    
    console.log('\n🎉 Port configuration test completed!');
}

// Run the test
testPortConfiguration().catch(error => {
    console.error('❌ Test failed:', error);
    process.exit(1);
});
