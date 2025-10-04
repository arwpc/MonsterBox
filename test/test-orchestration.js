/**
 * Test Orchestration System
 * Verifies orchestration can control all animatronics with AI agent integration
 */

import axios from 'axios';

const BASE_URL = 'http://localhost:3000';
const TEST_TIMEOUT = 60000; // 60 seconds

/**
 * Test orchestration status
 */
async function testStatus() {
    console.log('\n📊 Testing Orchestration Status\n');
    console.log('='.repeat(50));
    
    try {
        const response = await axios.get(`${BASE_URL}/api/orchestration/status`, {
            timeout: 10000
        });
        
        if (response.data.success) {
            console.log('✅ Status check successful\n');
            console.log('Animatronics:');
            response.data.animatronics.forEach(a => {
                const status = a.online ? '🟢 ONLINE' : '🔴 OFFLINE';
                console.log(`  ${status} - ${a.name} (${a.ip}:${a.port})`);
            });
            return { success: true, data: response.data };
        } else {
            console.log('❌ Status check failed:', response.data.error);
            return { success: false, error: response.data.error };
        }
    } catch (error) {
        console.log('❌ Error:', error.message);
        return { success: false, error: error.message };
    }
}

/**
 * Test broadcast speech with AI agents
 */
async function testBroadcastSpeech(text) {
    console.log('\n🎭 Testing Broadcast Speech (AI Agent)\n');
    console.log('='.repeat(50));
    console.log(`Broadcasting: "${text}"\n`);
    
    try {
        const response = await axios.post(
            `${BASE_URL}/api/orchestration/say-all`,
            { text },
            {
                headers: { 'Content-Type': 'application/json' },
                timeout: TEST_TIMEOUT
            }
        );
        
        if (response.data.success) {
            console.log('✅ Broadcast successful\n');
            console.log('Results:');
            response.data.results.forEach(r => {
                if (r.success) {
                    console.log(`  ✅ ${r.animatronic}`);
                    if (r.result && r.result.data) {
                        console.log(`     Original: "${r.result.data.originalText}"`);
                        console.log(`     Personality: "${r.result.data.personalityText}"`);
                        console.log(`     Agent: ${r.result.data.agentId}`);
                    }
                } else {
                    console.log(`  ❌ ${r.animatronic}: ${r.error}`);
                }
            });
            return { success: true, data: response.data };
        } else {
            console.log('❌ Broadcast failed:', response.data.error);
            return { success: false, error: response.data.error };
        }
    } catch (error) {
        console.log('❌ Error:', error.message);
        if (error.response) {
            console.log('Response:', JSON.stringify(error.response.data, null, 2));
        }
        return { success: false, error: error.message };
    }
}

/**
 * Test enable random poses
 */
async function testEnableRandomPoses() {
    console.log('\n🎭 Testing Enable Random Poses\n');
    console.log('='.repeat(50));
    
    try {
        const response = await axios.post(
            `${BASE_URL}/api/orchestration/enable-random-poses`,
            {
                cooldownMs: 3000,
                minAmplitude: 0.2,
                maxAmplitude: 0.6
            },
            {
                headers: { 'Content-Type': 'application/json' },
                timeout: 10000
            }
        );
        
        if (response.data.success) {
            console.log('✅ Random poses enabled\n');
            console.log('Results:');
            response.data.results.forEach(r => {
                const status = r.success ? '✅' : '❌';
                console.log(`  ${status} ${r.animatronic}`);
            });
            return { success: true, data: response.data };
        } else {
            console.log('❌ Failed:', response.data.error);
            return { success: false, error: response.data.error };
        }
    } catch (error) {
        console.log('❌ Error:', error.message);
        return { success: false, error: error.message };
    }
}

/**
 * Test disable random poses
 */
async function testDisableRandomPoses() {
    console.log('\n🎭 Testing Disable Random Poses\n');
    console.log('='.repeat(50));
    
    try {
        const response = await axios.post(
            `${BASE_URL}/api/orchestration/disable-random-poses`,
            {},
            {
                headers: { 'Content-Type': 'application/json' },
                timeout: 10000
            }
        );
        
        if (response.data.success) {
            console.log('✅ Random poses disabled\n');
            console.log('Results:');
            response.data.results.forEach(r => {
                const status = r.success ? '✅' : '❌';
                console.log(`  ${status} ${r.animatronic}`);
            });
            return { success: true, data: response.data };
        } else {
            console.log('❌ Failed:', response.data.error);
            return { success: false, error: response.data.error };
        }
    } catch (error) {
        console.log('❌ Error:', error.message);
        return { success: false, error: error.message };
    }
}

/**
 * Main test function
 */
async function runTests() {
    console.log('🎃 MonsterBox Orchestration Test 🎃');
    console.log('====================================\n');
    
    const results = {
        total: 0,
        passed: 0,
        failed: 0
    };
    
    // Test 1: Status
    results.total++;
    const statusResult = await testStatus();
    if (statusResult.success) {
        results.passed++;
    } else {
        results.failed++;
    }
    
    await new Promise(resolve => setTimeout(resolve, 2000));
    
    // Test 2: Enable random poses
    results.total++;
    const enableResult = await testEnableRandomPoses();
    if (enableResult.success) {
        results.passed++;
    } else {
        results.failed++;
    }
    
    await new Promise(resolve => setTimeout(resolve, 2000));
    
    // Test 3: Broadcast speech (only if local device is online)
    if (statusResult.success && statusResult.data.animatronics.some(a => a.online)) {
        results.total++;
        const speechResult = await testBroadcastSpeech("Happy Halloween!");
        if (speechResult.success) {
            results.passed++;
        } else {
            results.failed++;
        }
        
        await new Promise(resolve => setTimeout(resolve, 5000));
    } else {
        console.log('\n⚠️  Skipping broadcast speech test (no animatronics online)');
    }
    
    // Test 4: Disable random poses
    results.total++;
    const disableResult = await testDisableRandomPoses();
    if (disableResult.success) {
        results.passed++;
    } else {
        results.failed++;
    }
    
    // Print summary
    console.log('\n\n📊 Test Summary\n');
    console.log('='.repeat(50));
    console.log(`Total tests: ${results.total}`);
    console.log(`✅ Passed: ${results.passed}`);
    console.log(`❌ Failed: ${results.failed}`);
    console.log('');
    
    if (results.failed > 0) {
        console.log('❌ Some tests failed. Check the details above.');
        process.exit(1);
    } else {
        console.log('✅ All tests passed!');
        process.exit(0);
    }
}

// Run tests
runTests().catch(error => {
    console.error('❌ Test execution failed:', error);
    process.exit(1);
});

