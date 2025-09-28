#!/usr/bin/env node

/**
 * Skulltalker Parts Integration Test
 * Tests all newly created Skulltalker hardware parts
 */

const fs = require('fs');
const path = require('path');

console.log('🎃 Skulltalker Hardware Parts Integration Test');
console.log('='.repeat(50));

// Load parts data
const partsPath = path.join(__dirname, 'data', 'parts.json');
let parts = [];

try {
    const partsData = fs.readFileSync(partsPath, 'utf8');
    parts = JSON.parse(partsData);
    console.log(`✅ Loaded ${parts.length} total parts from parts.json`);
} catch (error) {
    console.error('❌ Failed to load parts.json:', error.message);
    process.exit(1);
}

// Filter Skulltalker parts (character ID 4)
const skulltalkerParts = parts.filter(part => part.characterId === 4);
console.log(`🎭 Found ${skulltalkerParts.length} parts assigned to Skulltalker (ID: 4)`);

if (skulltalkerParts.length === 0) {
    console.log('❌ No parts found for Skulltalker. Test failed.');
    process.exit(1);
}

console.log('\n📋 Skulltalker Parts Inventory:');
console.log('-'.repeat(30));

skulltalkerParts.forEach((part, index) => {
    console.log(`${index + 1}. ${part.name} (ID: ${part.id})`);
    console.log(`   Type: ${part.type}`);
    console.log(`   Description: ${part.description || 'No description'}`);
    
    // Part-specific details
    switch (part.type) {
        case 'speaker':
            console.log(`   Output Device: ${part.outputDevice}`);
            console.log(`   Volume: ${part.volume}%`);
            break;
        case 'microphone':
            console.log(`   Device ID: ${part.deviceId}`);
            console.log(`   Sample Rate: ${part.sampleRate} Hz`);
            console.log(`   Voice Activation: ${part.voiceActivation}`);
            break;
        case 'motion-sensor':
            console.log(`   GPIO Pin: ${part.gpioPin}`);
            console.log(`   Sensor Type: ${part.sensorType}`);
            console.log(`   Sensitivity: ${part.sensitivity}`);
            break;
        case 'servo':
            console.log(`   GPIO Pin: ${part.pin}`);
            console.log(`   Servo Type: ${part.servoType}`);
            console.log(`   Default Angle: ${part.defaultAngle}°`);
            break;
    }
    console.log('');
});

// Validate expected parts
const expectedParts = [
    { type: 'speaker', name: 'Skulltalker Speaker' },
    { type: 'microphone', name: 'Skulltalker Microphone' },
    { type: 'motion-sensor', name: 'Skulltalker PIR Sensor' },
    { type: 'servo', name: 'Skulltalker Jaw Servo' }
];

console.log('🔍 Validation Results:');
console.log('-'.repeat(20));

let allPartsFound = true;

expectedParts.forEach(expected => {
    const found = skulltalkerParts.find(part => 
        part.type === expected.type && part.name === expected.name
    );
    
    if (found) {
        console.log(`✅ ${expected.type}: ${expected.name} (ID: ${found.id})`);
    } else {
        console.log(`❌ ${expected.type}: ${expected.name} - NOT FOUND`);
        allPartsFound = false;
    }
});

console.log('\n🎯 Hardware Configuration Summary:');
console.log('-'.repeat(35));

// GPIO Pin assignments
const gpioPins = [];
skulltalkerParts.forEach(part => {
    if (part.gpioPin) gpioPins.push({ pin: part.gpioPin, part: part.name, type: part.type });
    if (part.pin) gpioPins.push({ pin: part.pin, part: part.name, type: part.type });
});

if (gpioPins.length > 0) {
    console.log('GPIO Pin Assignments:');
    gpioPins.forEach(gpio => {
        console.log(`  Pin ${gpio.pin}: ${gpio.part} (${gpio.type})`);
    });
} else {
    console.log('No GPIO pins assigned');
}

// Audio configuration
const audioConfig = skulltalkerParts.filter(part => 
    part.type === 'speaker' || part.type === 'microphone'
);

if (audioConfig.length > 0) {
    console.log('\nAudio Configuration:');
    audioConfig.forEach(part => {
        if (part.type === 'speaker') {
            console.log(`  Speaker Output: ${part.outputDevice}`);
        } else if (part.type === 'microphone') {
            console.log(`  Microphone Input: ${part.deviceId}`);
            console.log(`  Sample Rate: ${part.sampleRate} Hz`);
        }
    });
}

console.log('\n🏁 Test Results:');
console.log('='.repeat(15));

if (allPartsFound && skulltalkerParts.length === expectedParts.length) {
    console.log('✅ SUCCESS: All Skulltalker parts created and configured correctly!');
    console.log('✅ Ready for end-to-end integration testing');
    
    console.log('\n🚀 Next Steps:');
    console.log('1. Test speaker audio output');
    console.log('2. Test microphone input detection');
    console.log('3. Test PIR sensor motion detection');
    console.log('4. Test servo jaw movement');
    console.log('5. Test complete AI conversation flow');
    
    process.exit(0);
} else {
    console.log('❌ FAILURE: Missing or incorrect parts configuration');
    console.log(`Expected ${expectedParts.length} parts, found ${skulltalkerParts.length}`);
    process.exit(1);
}
