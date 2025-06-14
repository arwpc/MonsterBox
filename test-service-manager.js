#!/usr/bin/env node
/**
 * Test ChatterPi Service Manager
 * Quick test to verify the service manager can start services
 */

const ChatterPiServiceManager = require('./services/chatterPiServiceManager');

async function testServiceManager() {
    console.log('🧪 Testing ChatterPi Service Manager');
    console.log('=' * 40);
    
    const serviceManager = new ChatterPiServiceManager();
    
    try {
        console.log('🚀 Initializing service manager...');
        const success = await serviceManager.initialize();
        
        if (success) {
            console.log('✅ Service manager initialized successfully');
            
            // Get status
            const status = serviceManager.getServiceStatus();
            console.log('\n📊 Service Status:');
            console.log(JSON.stringify(status, null, 2));
            
            // Test WebSocket connection
            const ws = serviceManager.getWebSocket('jawAnimator');
            if (ws) {
                console.log('✅ WebSocket connection available');
                
                // Test sending a command
                const success = serviceManager.sendJawCommand({
                    type: 'get_status'
                });
                
                if (success) {
                    console.log('✅ Successfully sent test command');
                } else {
                    console.log('⚠️ Failed to send test command');
                }
            } else {
                console.log('⚠️ WebSocket connection not available');
            }
            
        } else {
            console.log('❌ Service manager initialization failed');
        }
        
        // Wait a bit then cleanup
        console.log('\n⏳ Waiting 5 seconds then cleaning up...');
        await new Promise(resolve => setTimeout(resolve, 5000));
        
        console.log('🧹 Cleaning up...');
        await serviceManager.cleanup();
        console.log('✅ Cleanup complete');
        
    } catch (error) {
        console.error('❌ Test failed:', error);
        await serviceManager.cleanup();
        process.exit(1);
    }
}

// Handle shutdown
process.on('SIGINT', async () => {
    console.log('\n⏹️ Test interrupted');
    process.exit(0);
});

testServiceManager().then(() => {
    console.log('🎯 Test completed successfully');
    process.exit(0);
}).catch((error) => {
    console.error('❌ Test failed:', error);
    process.exit(1);
});
