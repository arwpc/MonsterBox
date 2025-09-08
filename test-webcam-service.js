#!/usr/bin/env node

/**
 * Webcam Service Test and Validation
 * Tests webcam service functionality and resolves common issues
 */

const fs = require('fs');
const path = require('path');

console.log('📹 Webcam Service Test and Validation');
console.log('='.repeat(40));

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

// Filter webcam parts
const webcamParts = parts.filter(part => part.type === 'webcam');
console.log(`📹 Found ${webcamParts.length} webcam parts`);

if (webcamParts.length === 0) {
    console.log('❌ No webcam parts found. Test failed.');
    process.exit(1);
}

console.log('\n📋 Webcam Parts Configuration:');
console.log('-'.repeat(35));

const deviceConflicts = new Map();
const characterWebcams = new Map();

webcamParts.forEach((webcam, index) => {
    console.log(`${index + 1}. ${webcam.name} (ID: ${webcam.id})`);
    console.log(`   Character: ${webcam.characterId}`);
    console.log(`   Device: ${webcam.devicePath} (ID: ${webcam.deviceId})`);
    console.log(`   Resolution: ${webcam.resolution}`);
    console.log(`   FPS: ${webcam.fps}`);
    console.log(`   Status: ${webcam.status || 'unknown'}`);
    
    // Track device conflicts
    const deviceKey = webcam.devicePath || `/dev/video${webcam.deviceId}`;
    if (!deviceConflicts.has(deviceKey)) {
        deviceConflicts.set(deviceKey, []);
    }
    deviceConflicts.get(deviceKey).push({
        name: webcam.name,
        characterId: webcam.characterId,
        id: webcam.id
    });
    
    // Track character assignments
    characterWebcams.set(webcam.characterId, webcam);
    
    console.log('');
});

// Check for device conflicts
console.log('🔍 Device Conflict Analysis:');
console.log('-'.repeat(25));

let hasConflicts = false;
deviceConflicts.forEach((webcams, device) => {
    if (webcams.length > 1) {
        console.log(`❌ CONFLICT: ${device} is assigned to ${webcams.length} webcams:`);
        webcams.forEach(webcam => {
            console.log(`   - ${webcam.name} (Character ${webcam.characterId}, ID: ${webcam.id})`);
        });
        hasConflicts = true;
    } else {
        console.log(`✅ ${device}: ${webcams[0].name} (Character ${webcams[0].characterId})`);
    }
});

// Load character data to check for remote configurations
const charactersPath = path.join(__dirname, 'data', 'characters.json');
let characters = [];

try {
    const charactersData = fs.readFileSync(charactersPath, 'utf8');
    characters = JSON.parse(charactersData);
} catch (error) {
    console.warn('⚠️ Could not load characters.json:', error.message);
}

console.log('\n🌐 Remote Configuration Analysis:');
console.log('-'.repeat(30));

characters.forEach(character => {
    const webcam = characterWebcams.get(character.id);
    if (webcam) {
        const isRemote = character.animatronic && 
                        character.animatronic.rpi_config && 
                        character.animatronic.rpi_config.host !== 'localhost';
        
        console.log(`Character ${character.id} (${character.char_name}):`);
        console.log(`   Webcam: ${webcam.name}`);
        console.log(`   Remote: ${isRemote ? 'Yes' : 'No'}`);
        
        if (isRemote) {
            const host = character.animatronic.rpi_config.host;
            console.log(`   Host: ${host}`);
            console.log(`   User: ${character.animatronic.rpi_config.user || 'remote'}`);
        }
        console.log('');
    }
});

// Recommendations
console.log('💡 Recommendations:');
console.log('-'.repeat(15));

if (hasConflicts) {
    console.log('❌ CRITICAL: Device conflicts detected!');
    console.log('   - Each webcam must use a unique device path');
    console.log('   - Update deviceId and devicePath for conflicting webcams');
    console.log('   - Suggested assignment:');
    console.log('     * Character 1 (Orlok): /dev/video0');
    console.log('     * Character 2 (Coffin Breaker): /dev/video1');
    console.log('     * Character 3 (PumpkinHead): /dev/video2');
    console.log('     * Character 4 (Skulltalker): /dev/video0 (if local)');
} else {
    console.log('✅ No device conflicts detected');
}

console.log('\n🔧 Service Health Recommendations:');
console.log('1. Ensure webcam devices exist on target systems');
console.log('2. Verify SSH connectivity to remote animatronic systems');
console.log('3. Check camera permissions (user in video group)');
console.log('4. Test camera access: v4l2-ctl --list-devices');
console.log('5. Monitor service logs for connection timeouts');

console.log('\n🚀 Next Steps:');
console.log('1. Restart MonsterBox services to apply changes');
console.log('2. Test webcam streaming for each character');
console.log('3. Monitor hardware service logs');
console.log('4. Use hardware monitor interface for real-time status');

console.log('\n🏁 Test Results:');
console.log('='.repeat(15));

if (hasConflicts) {
    console.log('❌ FAILURE: Device conflicts must be resolved');
    process.exit(1);
} else {
    console.log('✅ SUCCESS: Webcam configuration validated');
    console.log('✅ Ready for service testing');
    process.exit(0);
}
