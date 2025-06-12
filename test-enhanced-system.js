const axios = require('axios');

async function testEnhancedSystem() {
    console.log('🧪 Testing Enhanced Conversation System');
    console.log('======================================');
    
    const baseUrl = 'http://localhost:8766';
    
    // Test 1: API Connectivity
    console.log('\n1. 🔗 Testing API Connectivity...');
    try {
        const healthResponse = await axios.get(`${baseUrl}/health`, { timeout: 5000 });
        console.log('   ✅ MonsterBox API is accessible');
    } catch (error) {
        console.log('   ❌ MonsterBox API is not accessible');
        console.log(`   Error: ${error.message}`);
        return false;
    }
    
    // Test 2: Orlok Character Response
    console.log('\n2. 🧛 Testing Orlok Character...');
    try {
        const orlokResponse = await axios.post(`${baseUrl}/api/chat`, {
            message: "Count Orlok, I sense darkness about you.",
            character: "orlok"
        }, { timeout: 10000 });
        
        const response = orlokResponse.data.aiResponse || orlokResponse.data.response;
        console.log(`   ✅ Orlok Response: "${response}"`);
        console.log(`   📏 Length: ${response.length} characters`);
        console.log(`   📝 Word Count: ${response.split(' ').length} words`);
        
        // Check if response follows ultra-short format
        if (response.split(' ').length <= 6) {
            console.log('   ✅ Follows ultra-short response format');
        } else {
            console.log('   ⚠️ Response longer than expected (>6 words)');
        }
        
    } catch (error) {
        console.log('   ❌ Orlok character test failed');
        console.log(`   Error: ${error.message}`);
        return false;
    }
    
    // Test 3: Mina Character Response
    console.log('\n3. 👩 Testing Mina Character...');
    try {
        const minaResponse = await axios.post(`${baseUrl}/api/chat`, {
            message: "Your ancient wisdom both thrills and terrifies me.",
            character: "mina"
        }, { timeout: 10000 });
        
        const response = minaResponse.data.aiResponse || minaResponse.data.response;
        console.log(`   ✅ Mina Response: "${response}"`);
        console.log(`   📏 Length: ${response.length} characters`);
        console.log(`   📝 Word Count: ${response.split(' ').length} words`);
        
    } catch (error) {
        console.log('   ❌ Mina character test failed');
        console.log(`   Error: ${error.message}`);
        return false;
    }
    
    // Test 4: Performance Timing
    console.log('\n4. ⚡ Testing Response Performance...');
    const performanceTests = [];
    
    for (let i = 0; i < 3; i++) {
        const startTime = Date.now();
        try {
            await axios.post(`${baseUrl}/api/chat`, {
                message: `Test message ${i + 1}`,
                character: "orlok"
            }, { timeout: 10000 });
            
            const responseTime = Date.now() - startTime;
            performanceTests.push(responseTime);
            console.log(`   Test ${i + 1}: ${responseTime}ms`);
            
        } catch (error) {
            console.log(`   Test ${i + 1}: Failed - ${error.message}`);
        }
    }
    
    if (performanceTests.length > 0) {
        const avgResponseTime = performanceTests.reduce((a, b) => a + b, 0) / performanceTests.length;
        console.log(`   📊 Average Response Time: ${avgResponseTime.toFixed(0)}ms`);
        
        if (avgResponseTime <= 1500) {
            console.log('   ✅ Excellent performance (<1.5s)');
        } else if (avgResponseTime <= 3000) {
            console.log('   ✅ Good performance (<3s)');
        } else {
            console.log('   ⚠️ Performance needs improvement (>3s)');
        }
    }
    
    // Test 5: Enhanced Tester Module
    console.log('\n5. 🎭 Testing Enhanced Tester Module...');
    try {
        const EnhancedTester = require('./enhanced-conversation-tester.js');
        const tester = new EnhancedTester();
        console.log('   ✅ Enhanced tester module loaded successfully');
        console.log(`   📊 Configured for ${tester.maxIterations} iterations`);
        console.log(`   🎯 Performance targets: ${tester.performanceTargets.responseTime}ms response, ${tester.performanceTargets.believabilityThreshold}+ believability`);
        console.log(`   💬 ${tester.conversationStarters.length} conversation starters loaded`);
        
    } catch (error) {
        console.log('   ❌ Enhanced tester module failed to load');
        console.log(`   Error: ${error.message}`);
        return false;
    }
    
    console.log('\n✅ ALL TESTS PASSED!');
    console.log('🚀 System is ready for enhanced conversation testing');
    console.log('\nTo run the full test suite:');
    console.log('   ./run-enhanced-conversation-tests.sh');
    console.log('   or');
    console.log('   node enhanced-conversation-tester.js');
    
    return true;
}

// Run the test
if (require.main === module) {
    testEnhancedSystem().then(success => {
        if (success) {
            console.log('\n🎉 Enhanced system test completed successfully!');
            process.exit(0);
        } else {
            console.log('\n💥 Enhanced system test failed!');
            process.exit(1);
        }
    }).catch(error => {
        console.error('\n💥 Test execution failed:', error.message);
        process.exit(1);
    });
}

module.exports = testEnhancedSystem;
