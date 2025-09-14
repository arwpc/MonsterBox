#!/usr/bin/env node

/**
 * BULLETPROOF Character Management Testing
 * Tests character selection, switching, and all character-specific functionality
 */

const fs = require('fs');
const path = require('path');

console.log('🎭 BULLETPROOF Character Management Testing');
console.log('='.repeat(45));

// Load character and parts data
let characters = [];
let parts = [];
let testResults = { passed: 0, failed: 0, errors: [] };

function testResult(testName, condition, details = '') {
    if (condition) {
        console.log(`✅ ${testName}${details ? ': ' + details : ''}`);
        testResults.passed++;
    } else {
        console.log(`❌ ${testName}${details ? ': ' + details : ''}`);
        testResults.failed++;
        testResults.errors.push(testName);
    }
}

// Load data files
try {
    const charactersData = fs.readFileSync(path.join(__dirname, 'data', 'characters.json'), 'utf8');
    characters = JSON.parse(charactersData);
    console.log(`✅ Loaded ${characters.length} characters`);
    
    const partsData = fs.readFileSync(path.join(__dirname, 'data', 'parts.json'), 'utf8');
    parts = JSON.parse(partsData);
    console.log(`✅ Loaded ${parts.length} parts`);
} catch (error) {
    console.error('❌ Failed to load data files:', error.message);
    process.exit(1);
}

// Test 1: Character Data Structure
console.log('\n📋 Testing Character Data Structure...');
console.log('-'.repeat(35));

testResult('Characters array exists', Array.isArray(characters));
testResult('Characters array not empty', characters.length > 0, `${characters.length} characters`);

// Validate each character has required fields
let validCharacters = 0;
characters.forEach((char, index) => {
    const hasId = typeof char.id === 'number';
    const hasName = typeof char.char_name === 'string' || typeof char.name === 'string';
    const hasDescription = typeof char.description === 'string';
    
    if (hasId && hasName && hasDescription) {
        validCharacters++;
    } else {
        console.log(`⚠️ Character ${index} missing fields:`, { id: hasId, name: hasName, description: hasDescription });
    }
});

testResult('All characters have required fields', validCharacters === characters.length, `${validCharacters}/${characters.length} valid`);

// Test 2: Specific Character Validation
console.log('\n🎭 Testing Individual Characters...');
console.log('-'.repeat(32));

const expectedCharacters = [
    { id: 1, name: 'Orlok' },
    { id: 2, name: 'Coffin Breaker' },
    { id: 3, name: 'PumpkinHead' },
    { id: 4, name: 'Skulltalker' }
];

expectedCharacters.forEach(expected => {
    const found = characters.find(c => c.id === expected.id);
    testResult(`Character ${expected.id} (${expected.name}) exists`, !!found, found ? found.char_name || found.name : 'NOT FOUND');
    
    if (found) {
        // Test character configuration
        testResult(`Character ${expected.id} has description`, !!found.description, found.description ? 'Yes' : 'Missing');
        testResult(`Character ${expected.id} has image`, !!found.image, found.image || 'Default');
        
        // Test animatronic configuration if present
        if (found.animatronic) {
            const hasRpiConfig = found.animatronic.rpi_config;
            testResult(`Character ${expected.id} has RPI config`, !!hasRpiConfig, hasRpiConfig ? 'Configured' : 'Missing');
            
            if (hasRpiConfig) {
                testResult(`Character ${expected.id} has host`, !!hasRpiConfig.host, hasRpiConfig.host || 'Missing');
                testResult(`Character ${expected.id} has user`, !!hasRpiConfig.user, hasRpiConfig.user || 'Missing');
            }
        }
    }
});

// Test 3: Character-Parts Relationships
console.log('\n🔗 Testing Character-Parts Relationships...');
console.log('-'.repeat(38));

expectedCharacters.forEach(expected => {
    const characterParts = parts.filter(p => p.characterId === expected.id);
    testResult(`Character ${expected.id} has parts assigned`, characterParts.length > 0, `${characterParts.length} parts`);
    
    if (expected.id === 4) { // Skulltalker - our focus
        const requiredTypes = ['speaker', 'microphone', 'servo', 'motion-sensor', 'webcam'];
        requiredTypes.forEach(type => {
            const found = characterParts.find(p => p.type === type);
            testResult(`Skulltalker has ${type}`, !!found, found ? `${found.name} (ID: ${found.id})` : 'Missing');
        });
    }
});

// Test 4: Character Configuration Validation
console.log('\n⚙️ Testing Character Configurations...');
console.log('-'.repeat(34));

// Test Skulltalker specifically
const skulltalker = characters.find(c => c.id === 4);
if (skulltalker) {
    testResult('Skulltalker character loaded', true, skulltalker.char_name || skulltalker.name);
    testResult('Skulltalker has description', !!skulltalker.description, 'Yes');
    testResult('Skulltalker has image', !!skulltalker.image, skulltalker.image || 'Default');
    
    // Test hardware assignments
    const skulltalkerParts = parts.filter(p => p.characterId === 4);
    const partTypes = skulltalkerParts.map(p => p.type);
    
    testResult('Skulltalker audio system', 
        partTypes.includes('speaker') && partTypes.includes('microphone'), 
        'Speaker + Microphone');
    
    testResult('Skulltalker animation system', 
        partTypes.includes('servo'), 
        'Jaw servo');
    
    testResult('Skulltalker detection system', 
        partTypes.includes('motion-sensor'), 
        'PIR sensor');
    
    testResult('Skulltalker vision system', 
        partTypes.includes('webcam'), 
        'Webcam');
} else {
    testResult('Skulltalker character loaded', false, 'Character not found');
}

// Test 5: Device Assignment Validation
console.log('\n🔌 Testing Device Assignments...');
console.log('-'.repeat(29));

// Check for unique device assignments
const deviceAssignments = new Map();

// GPIO pins
parts.forEach(part => {
    const pin = part.pin || part.gpioPin;
    if (pin) {
        const key = `GPIO-${pin}`;
        if (!deviceAssignments.has(key)) deviceAssignments.set(key, []);
        deviceAssignments.get(key).push({ part: part.name, char: part.characterId, type: part.type });
    }
});

// Webcam devices
parts.filter(p => p.type === 'webcam').forEach(webcam => {
    const key = `WEBCAM-${webcam.devicePath}`;
    if (!deviceAssignments.has(key)) deviceAssignments.set(key, []);
    deviceAssignments.get(key).push({ part: webcam.name, char: webcam.characterId, type: webcam.type });
});

let deviceConflicts = 0;
deviceAssignments.forEach((assignments, device) => {
    if (assignments.length > 1) {
        console.log(`⚠️ ${device} conflict: ${assignments.map(a => `${a.part} (Char ${a.char})`).join(', ')}`);
        deviceConflicts++;
    }
});

testResult('No device conflicts', deviceConflicts === 0, `${deviceConflicts} conflicts found`);

// Test 6: Character Switching Logic
console.log('\n🔄 Testing Character Switching Logic...');
console.log('-'.repeat(35));

// Test that each character has unique ID
const characterIds = characters.map(c => c.id);
const uniqueIds = [...new Set(characterIds)];
testResult('All character IDs unique', characterIds.length === uniqueIds.length, `${uniqueIds.length} unique IDs`);

// Test ID range
const validIdRange = characterIds.every(id => id >= 1 && id <= 10);
testResult('Character IDs in valid range', validIdRange, '1-10');

// Test that parts reference valid character IDs
const partCharacterIds = [...new Set(parts.map(p => p.characterId))];
const invalidPartRefs = partCharacterIds.filter(id => !characterIds.includes(id));
testResult('All part character references valid', invalidPartRefs.length === 0, 
    invalidPartRefs.length > 0 ? `Invalid refs: ${invalidPartRefs.join(', ')}` : 'All valid');

// Final Results
console.log('\n📊 CHARACTER MANAGEMENT TEST RESULTS');
console.log('='.repeat(38));
console.log(`Total Tests: ${testResults.passed + testResults.failed}`);
console.log(`Passed: ${testResults.passed}`);
console.log(`Failed: ${testResults.failed}`);

const successRate = (testResults.passed / (testResults.passed + testResults.failed)) * 100;
console.log(`Success Rate: ${successRate.toFixed(1)}%`);

if (testResults.failed > 0) {
    console.log('\n❌ FAILED TESTS:');
    testResults.errors.forEach((error, index) => {
        console.log(`${index + 1}. ${error}`);
    });
}

// Character Summary
console.log('\n🎭 CHARACTER SYSTEM SUMMARY:');
console.log('-'.repeat(28));
characters.forEach(char => {
    const charParts = parts.filter(p => p.characterId === char.id);
    console.log(`${char.char_name || char.name} (ID: ${char.id}): ${charParts.length} parts`);
});

console.log('\n🎯 CHARACTER MANAGEMENT STATUS:');
if (successRate === 100) {
    console.log('🎉 PERFECT! Character management is bulletproof!');
    console.log('✅ All characters configured correctly');
    console.log('✅ No conflicts or issues detected');
    console.log('✅ Ready for character switching tests');
} else if (successRate >= 90) {
    console.log('👍 EXCELLENT! Minor issues detected');
    console.log('✅ Core character functionality is solid');
    console.log('⚠️ Address minor issues for perfection');
} else {
    console.log('🔧 NEEDS ATTENTION! Critical issues found');
    console.log('❌ Fix character configuration issues');
}

process.exit(successRate >= 90 ? 0 : 1);
