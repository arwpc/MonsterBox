#!/usr/bin/env node

/**
 * Test script to verify jaw animation deployment
 * This script tests the jaw animation system components
 */

const path = require('path');
const fs = require('fs');

console.log('🦴 Testing Jaw Animation System Deployment');
console.log('==========================================\n');

// Test 1: Check if all required files exist
console.log('1. Checking required files...');
const requiredFiles = [
    'scripts/jaw-animation/jawAnimationSystem.js',
    'scripts/jaw-animation/audio/audioAnalyzer.js',
    'scripts/jaw-animation/servo/servoMapper.js',
    'scripts/jaw-animation/servo/servoController.js',
    'scripts/jaw-animation/config/jawConfig.js',
    'scripts/jaw-animation/websocket/jawWebSocket.js',
    'routes/jawAnimationRoutes.js',
    'views/jaw-animation-test.ejs',
    'data/jaw-animation-config.json'
];

let allFilesExist = true;
for (const file of requiredFiles) {
    if (fs.existsSync(file)) {
        console.log(`✅ ${file}`);
    } else {
        console.log(`❌ ${file} - MISSING`);
        allFilesExist = false;
    }
}

if (!allFilesExist) {
    console.log('\n❌ Some required files are missing!');
    process.exit(1);
}

// Test 2: Check imports
console.log('\n2. Testing module imports...');
try {
    const JawAnimationSystem = require('./scripts/jaw-animation/jawAnimationSystem');
    console.log('✅ JawAnimationSystem imported successfully');
    
    const AudioAnalyzer = require('./scripts/jaw-animation/audio/audioAnalyzer');
    console.log('✅ AudioAnalyzer imported successfully');
    
    const ServoController = require('./scripts/jaw-animation/servo/servoController');
    console.log('✅ ServoController imported successfully');
    
    const JawConfig = require('./scripts/jaw-animation/config/jawConfig');
    console.log('✅ JawConfig imported successfully');
    
} catch (error) {
    console.log(`❌ Import failed: ${error.message}`);
    process.exit(1);
}

// Test 3: Check configuration
console.log('\n3. Testing configuration...');
try {
    const configData = fs.readFileSync('data/jaw-animation-config.json', 'utf8');
    const config = JSON.parse(configData);
    
    if (config.characters && config.characters['4']) {
        console.log('✅ Skulltalker character configuration found');
        console.log(`   - Character Type: ${config.characters['4'].characterType}`);
        console.log(`   - Min Position: ${config.characters['4'].servoMapping.minPosition}`);
        console.log(`   - Max Position: ${config.characters['4'].servoMapping.maxPosition}`);
    } else {
        console.log('❌ Skulltalker character configuration missing');
    }
    
} catch (error) {
    console.log(`❌ Configuration test failed: ${error.message}`);
}

// Test 4: Check character and parts data
console.log('\n4. Testing character and parts data...');
try {
    const charactersData = fs.readFileSync('data/characters.json', 'utf8');
    const characters = JSON.parse(charactersData);
    
    const skulltalker = characters.find(c => c.id === 4);
    if (skulltalker) {
        console.log('✅ Skulltalker character found');
        console.log(`   - Name: ${skulltalker.char_name}`);
        console.log(`   - Status: ${skulltalker.animatronic.status}`);
        console.log(`   - Host: ${skulltalker.animatronic.rpi_config?.host || 'Not configured'}`);
    } else {
        console.log('❌ Skulltalker character not found');
    }
    
    const partsData = fs.readFileSync('data/parts.json', 'utf8');
    const parts = JSON.parse(partsData);
    
    const jawServo = parts.find(p => p.name === 'Jaw Servo' && p.characterId === 4);
    if (jawServo) {
        console.log('✅ Jaw Servo found');
        console.log(`   - Type: ${jawServo.type}`);
        console.log(`   - Pin: ${jawServo.pin}`);
        console.log(`   - PCA9685: ${jawServo.usePCA9685}`);
        console.log(`   - Servo Type: ${jawServo.servoType}`);
    } else {
        console.log('❌ Jaw Servo not found');
    }
    
} catch (error) {
    console.log(`❌ Character/Parts test failed: ${error.message}`);
}

// Test 5: Check test audio file
console.log('\n5. Testing audio file availability...');
try {
    const soundsData = fs.readFileSync('data/sounds.json', 'utf8');
    const sounds = JSON.parse(soundsData);
    
    const testAudio = sounds.find(s => s.filename === '1730419838788-I_m_stuck_in_this_coffin__plea.mp3');
    if (testAudio) {
        console.log('✅ Test audio file found in sounds database');
        console.log(`   - ID: ${testAudio.id}`);
        console.log(`   - Name: ${testAudio.name}`);
        
        // Check if physical file exists
        const audioPath = path.join('public', 'sounds', testAudio.filename);
        if (fs.existsSync(audioPath)) {
            console.log('✅ Physical audio file exists');
        } else {
            console.log('⚠️  Physical audio file not found (may be on remote server)');
        }
    } else {
        console.log('❌ Test audio file not found in database');
    }
    
} catch (error) {
    console.log(`❌ Audio file test failed: ${error.message}`);
}

console.log('\n🎉 Deployment test completed!');
console.log('\n📋 Next Steps:');
console.log('1. Access jaw animation test page: http://192.168.8.130:3000/jaw-animation/test');
console.log('2. Select Skulltalker character (ID: 4)');
console.log('3. Select Jaw Servo (ID: 19)');
console.log('4. Test servo movement');
console.log('5. Start jaw animation');
console.log('6. Play test audio file and observe jaw movement');
