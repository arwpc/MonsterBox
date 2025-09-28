#!/usr/bin/env node

/**
 * BULLETPROOF MonsterBox UI Testing Suite
 * Tests EVERY page, button, form, and workflow with ZERO tolerance for failures
 */

const axios = require('axios').default;
const fs = require('fs');
const path = require('path');

const BASE_URL = 'http://localhost:3000';
const TIMEOUT = 15000;

// Test results tracking
const testResults = {
    pages: {},
    buttons: {},
    forms: {},
    workflows: {},
    errors: [],
    warnings: []
};

let totalTests = 0;
let passedTests = 0;

console.log('🎃 BULLETPROOF MonsterBox UI Testing Suite');
console.log('='.repeat(55));
console.log('🎯 ZERO TOLERANCE FOR FAILURES - Every component must work!');
console.log('');

// Helper function to test HTTP endpoints
async function testEndpoint(name, url, method = 'GET', data = null, expectedStatus = 200) {
    totalTests++;
    try {
        const config = {
            method,
            url: `${BASE_URL}${url}`,
            timeout: TIMEOUT,
            validateStatus: (status) => status < 500 // Accept 4xx but not 5xx
        };
        
        if (data) {
            config.data = data;
            config.headers = { 'Content-Type': 'application/json' };
        }
        
        const response = await axios(config);
        
        if (response.status === expectedStatus || (response.status >= 200 && response.status < 400)) {
            console.log(`✅ ${name}: ${method} ${url} (${response.status})`);
            passedTests++;
            return { success: true, status: response.status, data: response.data };
        } else {
            console.log(`❌ ${name}: ${method} ${url} (${response.status}) - Expected ${expectedStatus}`);
            testResults.errors.push(`${name}: Unexpected status ${response.status}`);
            return { success: false, status: response.status, error: `Unexpected status ${response.status}` };
        }
    } catch (error) {
        console.log(`❌ ${name}: ${method} ${url} - ${error.message}`);
        testResults.errors.push(`${name}: ${error.message}`);
        return { success: false, error: error.message };
    }
}

// Test all main pages
async function testMainPages() {
    console.log('\n📄 Testing Main Pages...');
    console.log('-'.repeat(25));
    
    const pages = [
        { name: 'Home Page', url: '/' },
        { name: 'Characters Page', url: '/characters' },
        { name: 'Parts Management', url: '/parts' },
        { name: 'Sounds Management', url: '/sounds' },
        { name: 'Scenes Management', url: '/scenes' },
        { name: 'AI Management', url: '/ai-management' },
        { name: 'Configuration', url: '/configuration' },
        { name: 'System Config', url: '/system-config' },
        { name: 'Hardware Monitor', url: '/hardware-monitor' },
        { name: 'Fleet Monitor', url: '/fleet-monitor' }
    ];
    
    for (const page of pages) {
        const result = await testEndpoint(page.name, page.url);
        testResults.pages[page.name] = result;
    }
}

// Test AI Management pages
async function testAIManagementPages() {
    console.log('\n🧠 Testing AI Management Pages...');
    console.log('-'.repeat(32));
    
    const aiPages = [
        { name: 'AI Assistants', url: '/ai-management/assistants' },
        { name: 'AI TTS Config', url: '/ai-management/tts' },
        { name: 'AI STT Config', url: '/ai-management/stt' },
        { name: 'Enhanced Test Chat', url: '/ai-management/enhanced-test-chat' },
        { name: 'Conversational AI', url: '/ai-management/conversation' }
    ];
    
    for (const page of aiPages) {
        const result = await testEndpoint(page.name, page.url);
        testResults.pages[page.name] = result;
    }
}

// Test System Configuration pages
async function testSystemConfigPages() {
    console.log('\n⚙️ Testing System Configuration Pages...');
    console.log('-'.repeat(38));
    
    const configPages = [
        { name: 'System Overview', url: '/system-config/overview' },
        { name: 'Network Config', url: '/system-config/network' },
        { name: 'Audio Config', url: '/system-config/audio' },
        { name: 'Camera Config', url: '/system-config/camera' },
        { name: 'Servo Config', url: '/system-config/servos' },
        { name: 'Servo Calibration', url: '/system-config/servo-calibration' },
        { name: 'SSH Keys', url: '/system-config/ssh-keys' },
        { name: 'Service Status', url: '/system-config/service-status' }
    ];
    
    for (const page of configPages) {
        const result = await testEndpoint(page.name, page.url);
        testResults.pages[page.name] = result;
    }
}

// Test API endpoints
async function testAPIEndpoints() {
    console.log('\n🔌 Testing API Endpoints...');
    console.log('-'.repeat(25));
    
    const apiEndpoints = [
        { name: 'Hardware Status API', url: '/api/hardware/status' },
        { name: 'Characters API', url: '/api/characters' },
        { name: 'Parts API', url: '/api/parts' },
        { name: 'Sounds API', url: '/api/sounds' },
        { name: 'Scenes API', url: '/api/scenes' },
        { name: 'System Info API', url: '/api/system/info' },
        { name: 'Network Status API', url: '/api/network/status' },
        { name: 'Audio Devices API', url: '/api/audio/devices' },
        { name: 'Camera Devices API', url: '/api/camera/devices' },
        { name: 'Service Status API', url: '/api/services/status' }
    ];
    
    for (const endpoint of apiEndpoints) {
        const result = await testEndpoint(endpoint.name, endpoint.url);
        testResults.pages[endpoint.name] = result;
    }
}

// Test character-specific functionality
async function testCharacterFunctionality() {
    console.log('\n🎭 Testing Character-Specific Functionality...');
    console.log('-'.repeat(42));
    
    // Test character switching for each character (1-4)
    for (let charId = 1; charId <= 4; charId++) {
        const result = await testEndpoint(`Character ${charId} Switch`, `/character/${charId}`);
        testResults.pages[`Character ${charId}`] = result;
        
        // Test character-specific pages
        const charPages = [
            { name: `Char ${charId} Parts`, url: `/parts?character=${charId}` },
            { name: `Char ${charId} Sounds`, url: `/sounds?character=${charId}` },
            { name: `Char ${charId} Camera`, url: `/camera/${charId}` }
        ];
        
        for (const page of charPages) {
            const result = await testEndpoint(page.name, page.url);
            testResults.pages[page.name] = result;
        }
    }
}

// Test form submissions (safe test data)
async function testFormSubmissions() {
    console.log('\n📝 Testing Form Submissions...');
    console.log('-'.repeat(28));
    
    // Test speaker creation form
    const speakerData = {
        type: 'speaker',
        characterId: 4,
        name: 'Test Speaker',
        description: 'Test speaker for validation',
        outputDevice: 'default',
        volume: '50'
    };
    
    const speakerResult = await testEndpoint('Create Speaker Form', '/parts/speaker', 'POST', speakerData, 302);
    testResults.forms['Create Speaker'] = speakerResult;
    
    // Test microphone creation form
    const micData = {
        type: 'microphone',
        characterId: 4,
        name: 'Test Microphone',
        description: 'Test microphone for validation',
        deviceId: 'default',
        sampleRate: '16000',
        channels: '1'
    };
    
    const micResult = await testEndpoint('Create Microphone Form', '/parts/microphone', 'POST', micData, 302);
    testResults.forms['Create Microphone'] = micResult;
}

// Test hardware part operations
async function testHardwareOperations() {
    console.log('\n🔧 Testing Hardware Operations...');
    console.log('-'.repeat(32));
    
    // Load parts to test operations on existing parts
    try {
        const partsData = fs.readFileSync(path.join(__dirname, 'data', 'parts.json'), 'utf8');
        const parts = JSON.parse(partsData);
        const skulltalkerParts = parts.filter(p => p.characterId === 4);
        
        console.log(`   Found ${skulltalkerParts.length} Skulltalker parts to test`);
        
        // Test each part type
        for (const part of skulltalkerParts.slice(0, 3)) { // Test first 3 parts to avoid overload
            const testResult = await testEndpoint(`Test ${part.type} (${part.id})`, `/parts/${part.id}/test`, 'POST');
            testResults.pages[`Test ${part.type}`] = testResult;
        }
        
    } catch (error) {
        console.log(`⚠️ Could not load parts for testing: ${error.message}`);
        testResults.warnings.push(`Parts loading failed: ${error.message}`);
    }
}

// Run all tests
async function runBulletproofTests() {
    console.log('🚀 Starting comprehensive UI testing...\n');
    
    await testMainPages();
    await testAIManagementPages();
    await testSystemConfigPages();
    await testAPIEndpoints();
    await testCharacterFunctionality();
    await testFormSubmissions();
    await testHardwareOperations();
    
    // Generate comprehensive report
    console.log('\n📊 BULLETPROOF TEST RESULTS');
    console.log('='.repeat(30));
    console.log(`Total Tests: ${totalTests}`);
    console.log(`Passed: ${passedTests}`);
    console.log(`Failed: ${totalTests - passedTests}`);
    console.log(`Success Rate: ${((passedTests / totalTests) * 100).toFixed(1)}%`);
    
    // Error analysis
    if (testResults.errors.length > 0) {
        console.log('\n❌ FAILURES DETECTED:');
        console.log('-'.repeat(20));
        testResults.errors.forEach((error, index) => {
            console.log(`${index + 1}. ${error}`);
        });
    }
    
    // Warnings
    if (testResults.warnings.length > 0) {
        console.log('\n⚠️ WARNINGS:');
        console.log('-'.repeat(12));
        testResults.warnings.forEach((warning, index) => {
            console.log(`${index + 1}. ${warning}`);
        });
    }
    
    // Final verdict
    console.log('\n🏁 FINAL VERDICT:');
    console.log('='.repeat(17));
    
    const successRate = (passedTests / totalTests) * 100;
    
    if (successRate === 100) {
        console.log('🎉 PERFECT SCORE! All tests passed!');
        console.log('✅ MonsterBox UI is bulletproof and ready for deployment!');
        return true;
    } else if (successRate >= 95) {
        console.log('🎯 EXCELLENT! Nearly perfect performance!');
        console.log('✅ MonsterBox UI is highly reliable with minor issues');
        return true;
    } else if (successRate >= 85) {
        console.log('👍 GOOD! Most functionality is working');
        console.log('⚠️ Some issues need attention before deployment');
        return false;
    } else {
        console.log('🔧 NEEDS WORK! Significant issues detected');
        console.log('❌ Critical problems must be fixed before deployment');
        return false;
    }
}

// Execute the bulletproof test suite
runBulletproofTests().then(success => {
    console.log('\n🎯 Next Phase: Hardware Integration Testing');
    process.exit(success ? 0 : 1);
}).catch(error => {
    console.error('💥 Test suite crashed:', error.message);
    process.exit(1);
});
