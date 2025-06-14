#!/usr/bin/env node

console.log('🧪 Simple ChatterPi Service Manager Test');

try {
    const ChatterPiServiceManager = require('./services/chatterPiServiceManager');
    console.log('✅ Service manager module loaded successfully');
    
    const serviceManager = new ChatterPiServiceManager();
    console.log('✅ Service manager instance created');
    
    console.log('📋 Service definitions:');
    for (const [id, def] of Object.entries(serviceManager.serviceDefinitions)) {
        console.log(`  - ${id}: ${def.name} (${def.script})`);
    }
    
    console.log('🎯 Basic test completed successfully');
    
} catch (error) {
    console.error('❌ Test failed:', error.message);
    console.error(error.stack);
    process.exit(1);
}
