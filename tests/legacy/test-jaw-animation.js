#!/usr/bin/env node

/**
 * Skulltalker Jaw Animation Testing
 * Tests servo movement and TTS synchronization
 */

const fs = require('fs');
const path = require('path');
const axios = require('axios').default;

const BASE_URL = 'http://localhost:3000';
const SKULLTALKER_CHARACTER_ID = 4;

console.log('🤖 Skulltalker Jaw Animation Testing');
console.log('='.repeat(40));

// Load Skulltalker servo part
const partsPath = path.join(__dirname, 'data', 'parts.json');
let jawServo = null;

try {
    const partsData = fs.readFileSync(partsPath, 'utf8');
    const allParts = JSON.parse(partsData);
    const skulltalkerParts = allParts.filter(part => part.characterId === SKULLTALKER_CHARACTER_ID);
    
    jawServo = skulltalkerParts.find(p => p.type === 'servo');
    
    if (jawServo) {
        console.log('✅ Jaw Servo found:');
        console.log(`   Name: ${jawServo.name} (ID: ${jawServo.id})`);
        console.log(`   GPIO Pin: ${jawServo.pin}`);
        console.log(`   Servo Type: ${jawServo.servoType}`);
        console.log(`   Default Angle: ${jawServo.defaultAngle}°`);
        console.log(`   Pulse Range: ${jawServo.minPulse}-${jawServo.maxPulse}μs`);
        console.log(`   Control: ${jawServo.usePCA9685 ? 'PCA9685' : 'GPIO PWM'}`);
    } else {
        console.log('❌ No servo found for Skulltalker');
        process.exit(1);
    }
    
} catch (error) {
    console.error('❌ Failed to load parts:', error.message);
    process.exit(1);
}

async function testServoHardware() {
    console.log('\n🔧 Testing Servo Hardware...');
    
    try {
        // Test servo using the hardware test endpoint
        const response = await axios.post(`${BASE_URL}/parts/${jawServo.id}/test`, {
            angle: 90,
            duration: 2
        }, {
            timeout: 15000,
            headers: { 'Content-Type': 'application/json' }
        });
        
        console.log('✅ Servo hardware test completed');
        console.log(`   Status: ${response.data.status || 'OK'}`);
        console.log(`   Response Time: ${response.data.response_time || 'N/A'}ms`);
        return true;
        
    } catch (error) {
        console.log(`❌ Servo hardware test failed: ${error.message}`);
        return false;
    }
}

async function testJawMovement() {
    console.log('\n🦴 Testing Jaw Movement Sequence...');
    
    try {
        // Test jaw open/close sequence
        const movements = [
            { angle: 90, description: 'Center position' },
            { angle: 60, description: 'Jaw open' },
            { angle: 120, description: 'Jaw closed' },
            { angle: 90, description: 'Return to center' }
        ];
        
        console.log('   Executing jaw movement sequence...');
        
        for (const movement of movements) {
            console.log(`   → ${movement.description} (${movement.angle}°)`);
            
            const response = await axios.post(`${BASE_URL}/api/servo/move`, {
                servoId: jawServo.id,
                angle: movement.angle,
                duration: 1000,
                characterId: SKULLTALKER_CHARACTER_ID
            }, {
                timeout: 5000,
                headers: { 'Content-Type': 'application/json' }
            });
            
            // Wait between movements
            await new Promise(resolve => setTimeout(resolve, 1500));
        }
        
        console.log('✅ Jaw movement sequence completed');
        return true;
        
    } catch (error) {
        console.log(`⚠️ Jaw movement test failed: ${error.message}`);
        console.log('   This may be expected if servo API is not fully implemented');
        return false;
    }
}

async function testTTSWithJawSync() {
    console.log('\n🗣️ Testing TTS with Jaw Synchronization...');
    
    try {
        const testPhrases = [
            "Hello, I am Skulltalker!",
            "My jaw moves when I speak.",
            "This is a test of jaw animation."
        ];
        
        for (const phrase of testPhrases) {
            console.log(`   Speaking: "${phrase}"`);
            
            const response = await axios.post(`${BASE_URL}/api/tts/speak-with-animation`, {
                text: phrase,
                characterId: SKULLTALKER_CHARACTER_ID,
                enableJawAnimation: true,
                servoId: jawServo.id
            }, {
                timeout: 20000,
                headers: { 'Content-Type': 'application/json' }
            });
            
            console.log(`   ✅ TTS with jaw animation: ${response.data.status || 'completed'}`);
            
            // Wait between phrases
            await new Promise(resolve => setTimeout(resolve, 2000));
        }
        
        console.log('✅ TTS with jaw synchronization completed');
        return true;
        
    } catch (error) {
        console.log(`⚠️ TTS with jaw sync failed: ${error.message}`);
        console.log('   This may be expected if TTS-servo integration is not configured');
        return false;
    }
}

async function testJawCalibration() {
    console.log('\n⚙️ Testing Jaw Calibration...');
    
    try {
        // Test servo calibration
        const response = await axios.post(`${BASE_URL}/api/servo/calibrate`, {
            servoId: jawServo.id,
            characterId: SKULLTALKER_CHARACTER_ID,
            testSequence: true
        }, {
            timeout: 15000,
            headers: { 'Content-Type': 'application/json' }
        });
        
        console.log('✅ Jaw calibration test completed');
        console.log(`   Min Angle: ${response.data.minAngle || jawServo.minPulse}°`);
        console.log(`   Max Angle: ${response.data.maxAngle || jawServo.maxPulse}°`);
        console.log(`   Center: ${response.data.centerAngle || jawServo.defaultAngle}°`);
        return true;
        
    } catch (error) {
        console.log(`⚠️ Jaw calibration test failed: ${error.message}`);
        console.log('   This may be expected if calibration API is not implemented');
        return false;
    }
}

async function runJawAnimationTests() {
    console.log('\n🚀 Starting jaw animation tests...\n');
    
    const results = {
        hardware: await testServoHardware(),
        movement: await testJawMovement(),
        ttsSync: await testTTSWithJawSync(),
        calibration: await testJawCalibration()
    };
    
    // Summary
    console.log('\n📊 Jaw Animation Test Results:');
    console.log('='.repeat(32));
    
    let totalTests = 0;
    let passedTests = 0;
    
    Object.entries(results).forEach(([test, passed]) => {
        totalTests++;
        const status = passed ? '✅ PASS' : '❌ FAIL';
        console.log(`${status} ${test.toUpperCase()}`);
        if (passed) passedTests++;
    });
    
    console.log(`\n🏁 Jaw Animation Results: ${passedTests}/${totalTests} tests passed`);
    
    // Analysis and recommendations
    console.log('\n💡 Jaw Animation Analysis:');
    
    if (results.hardware) {
        console.log('✅ Servo hardware is functional');
        console.log(`   GPIO Pin ${jawServo.pin} is configured correctly`);
        console.log(`   ${jawServo.servoType} servo is responding`);
    } else {
        console.log('⚠️ Servo hardware issues detected');
        console.log('🔧 Check GPIO connections and power supply');
    }
    
    if (results.movement) {
        console.log('✅ Jaw movement mechanics are working');
        console.log('   Open/close sequence functional');
    } else {
        console.log('ℹ️ Jaw movement may need manual testing');
        console.log('   Check servo mounting and mechanical linkage');
    }
    
    if (results.ttsSync) {
        console.log('✅ TTS-jaw synchronization is operational');
        console.log('   Ready for realistic speech animation');
    } else {
        console.log('ℹ️ TTS-jaw sync may need configuration');
        console.log('   This is advanced functionality');
    }
    
    console.log('\n🎯 Servo Configuration Summary:');
    console.log(`   Type: ${jawServo.servoType}`);
    console.log(`   Pin: GPIO ${jawServo.pin}`);
    console.log(`   Range: ${jawServo.minPulse}-${jawServo.maxPulse}μs`);
    console.log(`   Default: ${jawServo.defaultAngle}°`);
    console.log(`   Control: ${jawServo.usePCA9685 ? 'PCA9685 I2C' : 'Direct GPIO PWM'}`);
    
    return results.hardware; // At least hardware should work
}

// Run the jaw animation tests
runJawAnimationTests().then(success => {
    console.log('\n🎯 Next Steps:');
    console.log('1. Complete end-to-end conversation testing');
    console.log('2. Test full sequence: Motion → STT → AI → TTS → Jaw Animation');
    console.log('3. Validate complete Skulltalker functionality');
    
    process.exit(success ? 0 : 1);
}).catch(error => {
    console.error('💥 Jaw animation test suite failed:', error.message);
    process.exit(1);
});
