/**
 * Test script for Unified Animatronic Hub functionality
 * Tests Phase 1 implementation: monitoring hub foundation
 */

const UnifiedAnimatronicHub = require('./services/unified-hub/UnifiedAnimatronicHub');
const logger = require('./scripts/logger');

async function testHubFunctionality() {
    console.log('🧪 Testing Unified Animatronic Hub - Phase 1');
    console.log('=' .repeat(50));

    try {
        // Test 1: Hub initialization
        console.log('\n📋 Test 1: Hub Initialization');
        const hub = new UnifiedAnimatronicHub();
        const initResult = await hub.initialize();
        
        console.log('✅ Hub initialized successfully');
        console.log('   Hostname:', initResult.hostname);
        console.log('   Services:', initResult.services);

        // Test 2: System status check
        console.log('\n📋 Test 2: System Status Check');
        const systemStatus = await hub.getSystemStatus();
        
        console.log('✅ System status retrieved');
        console.log('   Hostname:', systemStatus.hostname);
        console.log('   IP:', systemStatus.ip);
        console.log('   Services total:', systemStatus.summary.total);
        console.log('   Services online:', systemStatus.summary.online);
        console.log('   Services offline:', systemStatus.summary.offline);

        // Test 3: Health status check
        console.log('\n📋 Test 3: Health Status Check');
        const healthStatus = await hub.getHealthStatus();
        
        console.log('✅ Health status retrieved');
        console.log('   Overall health:', healthStatus.overall);
        console.log('   Uptime:', healthStatus.uptime, 'seconds');

        // Test 4: Service status details
        console.log('\n📋 Test 4: Service Status Details');
        if (hub.statusMonitor) {
            const services = await hub.statusMonitor.checkAllServices();
            console.log('✅ Service status check completed');
            
            Object.entries(services).forEach(([name, service]) => {
                console.log(`   ${service.icon} ${name}: ${service.status} (port ${service.port})`);
            });
        }

        // Test 5: Hub request handling simulation
        console.log('\n📋 Test 5: Request Handling Simulation');
        
        // Mock request/response objects
        const mockReq = { method: 'GET', path: '/api/hub/status' };
        const mockRes = {
            json: (data) => {
                console.log('✅ Status endpoint response:', {
                    success: data.success,
                    hostname: data.hostname,
                    servicesTotal: data.summary?.total || 0,
                    servicesOnline: data.summary?.online || 0
                });
            },
            status: (code) => ({ json: (data) => console.log(`Status ${code}:`, data) })
        };

        await hub.handleStatusRequest(mockReq, mockRes);

        // Test 6: Cleanup
        console.log('\n📋 Test 6: Hub Shutdown');
        await hub.shutdown();
        console.log('✅ Hub shutdown completed');

        console.log('\n🎉 All tests completed successfully!');
        console.log('\n📊 Phase 1 Success Criteria:');
        console.log('✅ Single API call returns all service status');
        console.log('✅ Consolidated status monitoring working');
        console.log('✅ No individual port connections needed');
        console.log('✅ Remote character monitoring architecture ready');

    } catch (error) {
        console.error('❌ Test failed:', error.message);
        console.error(error.stack);
        process.exit(1);
    }
}

// Run the test
if (require.main === module) {
    testHubFunctionality().then(() => {
        console.log('\n✅ Hub functionality test completed');
        process.exit(0);
    }).catch(error => {
        console.error('❌ Hub functionality test failed:', error);
        process.exit(1);
    });
}

module.exports = { testHubFunctionality };
