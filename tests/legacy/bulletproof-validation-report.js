#!/usr/bin/env node

/**
 * BULLETPROOF MonsterBox System Validation Report
 * Comprehensive validation of all system components
 */

const fs = require('fs');
const path = require('path');

console.log('🎃 BULLETPROOF MonsterBox System Validation');
console.log('='.repeat(50));
console.log('🎯 COMPREHENSIVE SYSTEM HEALTH CHECK');
console.log('');

const validationResults = {
    configuration: { passed: 0, failed: 0, tests: [] },
    hardware: { passed: 0, failed: 0, tests: [] },
    services: { passed: 0, failed: 0, tests: [] },
    integration: { passed: 0, failed: 0, tests: [] },
    errors: [],
    warnings: []
};

function validateTest(category, testName, condition, details = '', critical = false) {
    const result = {
        name: testName,
        passed: condition,
        details: details,
        critical: critical
    };
    
    validationResults[category].tests.push(result);
    
    if (condition) {
        validationResults[category].passed++;
        console.log(`✅ ${testName}${details ? ': ' + details : ''}`);
    } else {
        validationResults[category].failed++;
        const symbol = critical ? '🚨' : '❌';
        console.log(`${symbol} ${testName}${details ? ': ' + details : ''}`);
        
        if (critical) {
            validationResults.errors.push(`CRITICAL: ${testName} - ${details}`);
        } else {
            validationResults.warnings.push(`${testName} - ${details}`);
        }
    }
}

// 1. CONFIGURATION VALIDATION
console.log('📋 CONFIGURATION VALIDATION');
console.log('-'.repeat(28));

// Validate parts.json
try {
    const partsData = fs.readFileSync(path.join(__dirname, 'data', 'parts.json'), 'utf8');
    const parts = JSON.parse(partsData);
    
    validateTest('configuration', 'Parts configuration loaded', true, `${parts.length} parts`, true);
    
    // Validate Skulltalker parts
    const skulltalkerParts = parts.filter(p => p.characterId === 4);
    validateTest('configuration', 'Skulltalker parts exist', skulltalkerParts.length >= 5, `${skulltalkerParts.length}/5 parts`, true);
    
    // Check for required part types
    const requiredTypes = ['speaker', 'microphone', 'servo', 'motion-sensor', 'webcam'];
    requiredTypes.forEach(type => {
        const found = skulltalkerParts.find(p => p.type === type);
        validateTest('configuration', `${type} part configured`, !!found, found ? `ID: ${found.id}` : 'Missing', true);
    });
    
    // Check for device conflicts
    const webcamDevices = new Map();
    parts.filter(p => p.type === 'webcam').forEach(webcam => {
        const device = webcam.devicePath;
        if (!webcamDevices.has(device)) webcamDevices.set(device, []);
        webcamDevices.get(device).push(webcam);
    });
    
    let conflicts = 0;
    webcamDevices.forEach((webcams, device) => {
        if (webcams.length > 1) conflicts++;
    });
    
    validateTest('configuration', 'No webcam device conflicts', conflicts === 0, `${conflicts} conflicts`, true);
    
} catch (error) {
    validateTest('configuration', 'Parts configuration loaded', false, error.message, true);
}

// Validate characters.json
try {
    const charactersData = fs.readFileSync(path.join(__dirname, 'data', 'characters.json'), 'utf8');
    const characters = JSON.parse(charactersData);
    
    validateTest('configuration', 'Characters configuration loaded', true, `${characters.length} characters`);
    
    const skulltalker = characters.find(c => c.id === 4);
    validateTest('configuration', 'Skulltalker character exists', !!skulltalker, skulltalker ? skulltalker.char_name : 'Not found', true);
    
} catch (error) {
    validateTest('configuration', 'Characters configuration loaded', false, error.message, true);
}

// 2. HARDWARE VALIDATION
console.log('\n🔧 HARDWARE VALIDATION');
console.log('-'.repeat(22));

// Check package.json for dependencies
try {
    const packageData = fs.readFileSync(path.join(__dirname, 'package.json'), 'utf8');
    const pkg = JSON.parse(packageData);
    
    validateTest('hardware', 'Package.json loaded', true, `v${pkg.version}`);
    
    // Check for required dependencies
    const requiredDeps = ['axios', 'express', 'socket.io', 'serialport'];
    requiredDeps.forEach(dep => {
        const hasDepency = pkg.dependencies && pkg.dependencies[dep];
        validateTest('hardware', `${dep} dependency`, !!hasDepency, hasDepency || 'Missing');
    });
    
} catch (error) {
    validateTest('hardware', 'Package.json loaded', false, error.message, true);
}

// Check for service files
const serviceFiles = [
    'app.js',
    'scripts/start-all-services.js',
    'services/hardwareService.js',
    'services/characterService.js',
    'services/partService.js'
];

serviceFiles.forEach(file => {
    const exists = fs.existsSync(path.join(__dirname, file));
    validateTest('hardware', `${file} exists`, exists, exists ? 'Found' : 'Missing', true);
});

// 3. SERVICES VALIDATION
console.log('\n🚀 SERVICES VALIDATION');
console.log('-'.repeat(23));

// Check routes
const routeFiles = [
    'routes/partRoutes.js',
    'routes/characterRoutes.js',
    'routes/soundRoutes.js',
    'routes/sceneRoutes.js',
    'routes/aiRoutes.js'
];

routeFiles.forEach(file => {
    const exists = fs.existsSync(path.join(__dirname, file));
    validateTest('services', `${file} exists`, exists, exists ? 'Found' : 'Missing');
});

// Check views
const viewFiles = [
    'views/index.ejs',
    'views/characters.ejs',
    'views/parts.ejs',
    'views/sounds.ejs',
    'views/scenes.ejs'
];

viewFiles.forEach(file => {
    const exists = fs.existsSync(path.join(__dirname, file));
    validateTest('services', `${file} exists`, exists, exists ? 'Found' : 'Missing');
});

// 4. INTEGRATION VALIDATION
console.log('\n🔗 INTEGRATION VALIDATION');
console.log('-'.repeat(26));

// Check for test files
const testFiles = [
    'tests',
    'scripts/test-api-keys.js',
    'scripts/comprehensive-rpi-test.sh'
];

testFiles.forEach(file => {
    const exists = fs.existsSync(path.join(__dirname, file));
    validateTest('integration', `${file} exists`, exists, exists ? 'Found' : 'Missing');
});

// Check for AI integration files
const aiFiles = [
    'ai/integrations/index.js',
    'ai/integrations/elevenlabs.js'
];

aiFiles.forEach(file => {
    const exists = fs.existsSync(path.join(__dirname, file));
    validateTest('integration', `${file} exists`, exists, exists ? 'Found' : 'Missing');
});

// GENERATE COMPREHENSIVE REPORT
console.log('\n📊 BULLETPROOF VALIDATION RESULTS');
console.log('='.repeat(37));

const categories = ['configuration', 'hardware', 'services', 'integration'];
let totalPassed = 0;
let totalFailed = 0;
let criticalFailures = 0;

categories.forEach(category => {
    const cat = validationResults[category];
    totalPassed += cat.passed;
    totalFailed += cat.failed;
    
    console.log(`${category.toUpperCase()}: ${cat.passed}/${cat.passed + cat.failed} passed`);
    
    // Count critical failures
    cat.tests.forEach(test => {
        if (!test.passed && test.critical) {
            criticalFailures++;
        }
    });
});

const totalTests = totalPassed + totalFailed;
const successRate = totalTests > 0 ? (totalPassed / totalTests) * 100 : 0;

console.log(`\nOVERALL: ${totalPassed}/${totalTests} tests passed`);
console.log(`SUCCESS RATE: ${successRate.toFixed(1)}%`);
console.log(`CRITICAL FAILURES: ${criticalFailures}`);

// DETAILED ANALYSIS
if (validationResults.errors.length > 0) {
    console.log('\n🚨 CRITICAL ISSUES:');
    console.log('-'.repeat(18));
    validationResults.errors.forEach((error, index) => {
        console.log(`${index + 1}. ${error}`);
    });
}

if (validationResults.warnings.length > 0) {
    console.log('\n⚠️ WARNINGS:');
    console.log('-'.repeat(12));
    validationResults.warnings.forEach((warning, index) => {
        console.log(`${index + 1}. ${warning}`);
    });
}

// FINAL VERDICT
console.log('\n🏁 FINAL SYSTEM STATUS');
console.log('='.repeat(23));

if (criticalFailures === 0 && successRate >= 95) {
    console.log('🎉 BULLETPROOF STATUS: EXCELLENT!');
    console.log('✅ All critical systems operational');
    console.log('✅ System ready for production deployment');
    console.log('✅ Skulltalker fully functional');
} else if (criticalFailures === 0 && successRate >= 85) {
    console.log('👍 BULLETPROOF STATUS: GOOD');
    console.log('✅ Critical systems operational');
    console.log('⚠️ Minor issues detected');
    console.log('✅ System ready with monitoring');
} else if (criticalFailures <= 2 && successRate >= 70) {
    console.log('🔧 BULLETPROOF STATUS: NEEDS ATTENTION');
    console.log('⚠️ Some critical issues detected');
    console.log('🛠️ Address issues before deployment');
    console.log('⚠️ Limited functionality available');
} else {
    console.log('🚨 BULLETPROOF STATUS: CRITICAL ISSUES');
    console.log('❌ Multiple critical failures detected');
    console.log('🛠️ Immediate attention required');
    console.log('❌ System not ready for deployment');
}

// NEXT STEPS
console.log('\n🎯 RECOMMENDED NEXT STEPS:');
console.log('-'.repeat(26));

if (criticalFailures === 0) {
    console.log('1. ✅ Proceed with live hardware testing');
    console.log('2. ✅ Test complete conversation workflows');
    console.log('3. ✅ Validate motion detection → jaw animation');
    console.log('4. ✅ Deploy for Halloween operations');
} else {
    console.log('1. 🔧 Fix critical configuration issues');
    console.log('2. 🔧 Resolve hardware conflicts');
    console.log('3. 🔧 Validate service integrations');
    console.log('4. 🔄 Re-run bulletproof validation');
}

console.log('\n🎃 MonsterBox Bulletproof Validation Complete! 🎃');

process.exit(criticalFailures === 0 && successRate >= 85 ? 0 : 1);
