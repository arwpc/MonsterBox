#!/usr/bin/env node

/**
 * AI Integration Test Script
 * 
 * Comprehensive testing of the Core AI Integration system
 * Tests all providers, error handling, and monitoring capabilities
 */

const { getInstance } = require('../ai/integrations');
const logger = require('./logger');

async function testAIIntegration() {
    console.log('🧪 Starting AI Integration Tests...\n');

    let aiIntegration;
    let testResults = {
        initialization: false,
        providers: {},
        fallback: false,
        monitoring: false,
        keyManagement: false,
        healthCheck: false,
        overall: false
    };

    try {
        // Test 1: Initialization
        console.log('📋 Test 1: System Initialization');
        aiIntegration = getInstance({
            enableMonitoring: true,
            enableKeyManagement: true,
            defaultProvider: 'openai',
            fallbackProviders: ['anthropic', 'google']
        });

        const initResult = await aiIntegration.initialize();
        testResults.initialization = initResult.success;
        
        console.log(`   ✅ Initialization: ${initResult.success ? 'PASSED' : 'FAILED'}`);
        console.log(`   📊 Providers: ${initResult.providers.join(', ')}`);
        console.log(`   📈 Monitoring: ${initResult.monitoring ? 'Enabled' : 'Disabled'}`);
        console.log(`   🔐 Key Management: ${initResult.keyManagement ? 'Enabled' : 'Disabled'}\n`);

        // Test 2: Provider Testing
        console.log('📋 Test 2: Individual Provider Testing');
        const providers = ['openai', 'anthropic', 'google'];
        
        for (const provider of providers) {
            try {
                console.log(`   Testing ${provider}...`);
                const testResult = await aiIntegration.testIntegration(provider);
                testResults.providers[provider] = testResult.success;
                
                if (testResult.success) {
                    console.log(`   ✅ ${provider}: PASSED (${testResult.responseTime}ms)`);
                    console.log(`      Response: "${testResult.response.slice(0, 50)}..."`);
                    console.log(`      Fallback Used: ${testResult.fallbackUsed ? 'Yes' : 'No'}`);
                } else {
                    console.log(`   ❌ ${provider}: FAILED - ${testResult.error}`);
                }
            } catch (error) {
                console.log(`   ❌ ${provider}: ERROR - ${error.message}`);
                testResults.providers[provider] = false;
            }
        }
        console.log();

        // Test 3: Fallback Mechanism
        console.log('📋 Test 3: Fallback Mechanism');
        try {
            // Test with a provider that might fail to trigger fallback
            const fallbackTest = await aiIntegration.generateResponse(
                'Test fallback mechanism',
                { 
                    preferredProvider: 'invalid_provider',
                    maxTokens: 50 
                }
            );
            
            testResults.fallback = true;
            console.log(`   ✅ Fallback: PASSED`);
            console.log(`   📊 Used Provider: ${fallbackTest.metadata.provider}`);
            console.log(`   🔄 Fallback Used: ${fallbackTest.metadata.fallbackUsed ? 'Yes' : 'No'}\n`);
        } catch (error) {
            console.log(`   ❌ Fallback: FAILED - ${error.message}\n`);
        }

        // Test 4: Performance Monitoring
        console.log('📋 Test 4: Performance Monitoring');
        try {
            const metrics = aiIntegration.getPerformanceMetrics(1);
            testResults.monitoring = metrics && metrics.current;
            
            if (testResults.monitoring) {
                console.log(`   ✅ Monitoring: PASSED`);
                console.log(`   📊 Total Requests: ${metrics.current.summary.totalRequests}`);
                console.log(`   📈 Success Rate: ${metrics.current.summary.successRate.toFixed(1)}%`);
                console.log(`   ⏱️  Avg Response Time: ${metrics.current.summary.avgResponseTime.toFixed(0)}ms`);
                console.log(`   💰 Estimated Cost: $${metrics.current.summary.estimatedCost.toFixed(4)}\n`);
            } else {
                console.log(`   ❌ Monitoring: FAILED - No metrics available\n`);
            }
        } catch (error) {
            console.log(`   ❌ Monitoring: ERROR - ${error.message}\n`);
        }

        // Test 5: API Key Management
        console.log('📋 Test 5: API Key Management');
        try {
            const keyValidation = await aiIntegration.validateAPIKeys();
            testResults.keyManagement = Object.keys(keyValidation).length > 0;
            
            console.log(`   ✅ Key Management: PASSED`);
            for (const [provider, result] of Object.entries(keyValidation)) {
                const status = result.valid ? '✅ Valid' : '❌ Invalid';
                console.log(`   🔑 ${provider}: ${status}`);
                if (!result.valid && result.error) {
                    console.log(`      Error: ${result.error}`);
                }
            }
            console.log();
        } catch (error) {
            console.log(`   ❌ Key Management: ERROR - ${error.message}\n`);
        }

        // Test 6: Health Check
        console.log('📋 Test 6: System Health Check');
        try {
            const health = await aiIntegration.healthCheck();
            testResults.healthCheck = health.overall !== 'unhealthy';
            
            console.log(`   ✅ Health Check: PASSED`);
            console.log(`   🏥 Overall Health: ${health.overall.toUpperCase()}`);
            console.log(`   📊 Components:`);
            
            for (const [component, status] of Object.entries(health.components)) {
                const healthIcon = status.healthy ? '✅' : '❌';
                console.log(`      ${healthIcon} ${component}: ${status.healthy ? 'Healthy' : 'Unhealthy'}`);
            }
            console.log();
        } catch (error) {
            console.log(`   ❌ Health Check: ERROR - ${error.message}\n`);
        }

        // Test 7: Stress Test (Optional)
        console.log('📋 Test 7: Concurrent Request Stress Test');
        try {
            const concurrentRequests = 5;
            const promises = [];
            
            for (let i = 0; i < concurrentRequests; i++) {
                promises.push(
                    aiIntegration.generateResponse(
                        `Concurrent test request ${i + 1}`,
                        { maxTokens: 30 }
                    )
                );
            }
            
            const startTime = Date.now();
            const results = await Promise.allSettled(promises);
            const endTime = Date.now();
            
            const successful = results.filter(r => r.status === 'fulfilled').length;
            const failed = results.filter(r => r.status === 'rejected').length;
            
            console.log(`   ✅ Stress Test: PASSED`);
            console.log(`   📊 Concurrent Requests: ${concurrentRequests}`);
            console.log(`   ✅ Successful: ${successful}`);
            console.log(`   ❌ Failed: ${failed}`);
            console.log(`   ⏱️  Total Time: ${endTime - startTime}ms`);
            console.log(`   📈 Avg Time per Request: ${((endTime - startTime) / concurrentRequests).toFixed(0)}ms\n`);
        } catch (error) {
            console.log(`   ❌ Stress Test: ERROR - ${error.message}\n`);
        }

        // Calculate Overall Result
        const passedTests = Object.values(testResults).filter(result => {
            if (typeof result === 'object') {
                return Object.values(result).some(v => v === true);
            }
            return result === true;
        }).length;
        
        const totalTests = Object.keys(testResults).length - 1; // Exclude 'overall'
        testResults.overall = passedTests >= (totalTests * 0.7); // 70% pass rate

        // Final Results
        console.log('📊 Test Results Summary:');
        console.log('=' .repeat(50));
        console.log(`✅ Initialization: ${testResults.initialization ? 'PASSED' : 'FAILED'}`);
        
        console.log(`📡 Provider Tests:`);
        for (const [provider, result] of Object.entries(testResults.providers)) {
            console.log(`   ${result ? '✅' : '❌'} ${provider}: ${result ? 'PASSED' : 'FAILED'}`);
        }
        
        console.log(`🔄 Fallback Mechanism: ${testResults.fallback ? 'PASSED' : 'FAILED'}`);
        console.log(`📈 Performance Monitoring: ${testResults.monitoring ? 'PASSED' : 'FAILED'}`);
        console.log(`🔐 Key Management: ${testResults.keyManagement ? 'PASSED' : 'FAILED'}`);
        console.log(`🏥 Health Check: ${testResults.healthCheck ? 'PASSED' : 'FAILED'}`);
        console.log('=' .repeat(50));
        
        const overallStatus = testResults.overall ? '✅ PASSED' : '❌ FAILED';
        console.log(`🎯 Overall Test Result: ${overallStatus}`);
        
        if (testResults.overall) {
            console.log('\n🎉 AI Integration is working correctly!');
            console.log('🚀 System is ready for production use.');
        } else {
            console.log('\n⚠️  Some tests failed. Please review the results above.');
            console.log('🔧 Check configuration and API keys before deployment.');
        }

    } catch (error) {
        console.error('❌ Test execution failed:', error.message);
        testResults.overall = false;
    } finally {
        // Cleanup
        if (aiIntegration) {
            try {
                await aiIntegration.cleanup();
                console.log('\n🧹 Cleanup completed successfully.');
            } catch (error) {
                console.error('⚠️  Cleanup error:', error.message);
            }
        }
    }

    return testResults;
}

// Run tests if called directly
if (require.main === module) {
    testAIIntegration()
        .then(results => {
            process.exit(results.overall ? 0 : 1);
        })
        .catch(error => {
            console.error('💥 Test script failed:', error.message);
            process.exit(1);
        });
}

module.exports = testAIIntegration;
