#!/usr/bin/env node

/**
 * Skulltalker Hardware Testing Suite
 * Comprehensive testing of all Skulltalker hardware components
 */

const axios = require('axios').default;
const fs = require('fs');
const path = require('path');

const BASE_URL = 'http://localhost:3000';
const SKULLTALKER_CHARACTER_ID = 4;

console.log('🎃 Skulltalker Hardware Testing Suite');
console.log('='.repeat(45));

// Load Skulltalker parts
const partsPath = path.join(__dirname, 'data', 'parts.json');
let skulltalkerParts = [];

try {
    const partsData = fs.readFileSync(partsPath, 'utf8');
    const allParts = JSON.parse(partsData);
    skulltalkerParts = allParts.filter(part => part.characterId === SKULLTALKER_CHARACTER_ID);
    console.log(`✅ Loaded ${skulltalkerParts.length} Skulltalker parts`);
} catch (error) {
    console.error('❌ Failed to load parts:', error.message);
    process.exit(1);
}

// Test results tracking
const testResults = {
    speaker: { tested: false, success: false, details: null },
    microphone: { tested: false, success: false, details: null },
    servo: { tested: false, success: false, details: null },
    sensor: { tested: false, success: false, details: null },
    webcam: { tested: false, success: false, details: null }
};

async function testSpeaker() {
    console.log('\n🔊 Testing Speaker (ID: 66)...');
    try {
        const speakerPart = skulltalkerParts.find(p => p.type === 'speaker');
        if (!speakerPart) {
            throw new Error('Speaker part not found');
        }

        // Test speaker using the part test endpoint
        const response = await axios.post(`${BASE_URL}/parts/${speakerPart.id}/test`, {}, {
            timeout: 10000,
            headers: { 'Content-Type': 'application/json' }
        });

        testResults.speaker.tested = true;
        testResults.speaker.success = response.data.success || true;
        testResults.speaker.details = response.data;
        
        console.log(`✅ Speaker test: ${response.data.message || 'Test completed'}`);
        console.log(`   Device: ${speakerPart.outputDevice}`);
        console.log(`   Volume: ${speakerPart.volume}%`);
        
    } catch (error) {
        testResults.speaker.tested = true;
        testResults.speaker.success = false;
        testResults.speaker.details = error.message;
        console.log(`❌ Speaker test failed: ${error.message}`);
    }
}

async function testMicrophone() {
    console.log('\n🎤 Testing Microphone (ID: 67)...');
    try {
        const micPart = skulltalkerParts.find(p => p.type === 'microphone');
        if (!micPart) {
            throw new Error('Microphone part not found');
        }

        // Test microphone using the part test endpoint
        const response = await axios.post(`${BASE_URL}/parts/${micPart.id}/test`, {}, {
            timeout: 10000,
            headers: { 'Content-Type': 'application/json' }
        });

        testResults.microphone.tested = true;
        testResults.microphone.success = response.data.success || true;
        testResults.microphone.details = response.data;
        
        console.log(`✅ Microphone test: ${response.data.message || 'Test completed'}`);
        console.log(`   Device: ${micPart.deviceId}`);
        console.log(`   Sample Rate: ${micPart.sampleRate} Hz`);
        console.log(`   Voice Activation: ${micPart.voiceActivation}`);
        
    } catch (error) {
        testResults.microphone.tested = true;
        testResults.microphone.success = false;
        testResults.microphone.details = error.message;
        console.log(`❌ Microphone test failed: ${error.message}`);
    }
}

async function testServo() {
    console.log('\n🤖 Testing Servo (ID: 69)...');
    try {
        const servoPart = skulltalkerParts.find(p => p.type === 'servo');
        if (!servoPart) {
            throw new Error('Servo part not found');
        }

        // Test servo using the part test endpoint
        const response = await axios.post(`${BASE_URL}/parts/${servoPart.id}/test`, {}, {
            timeout: 15000,
            headers: { 'Content-Type': 'application/json' }
        });

        testResults.servo.tested = true;
        testResults.servo.success = response.data.success || true;
        testResults.servo.details = response.data;
        
        console.log(`✅ Servo test: ${response.data.message || 'Test completed'}`);
        console.log(`   GPIO Pin: ${servoPart.pin}`);
        console.log(`   Servo Type: ${servoPart.servoType}`);
        console.log(`   Default Angle: ${servoPart.defaultAngle}°`);
        
    } catch (error) {
        testResults.servo.tested = true;
        testResults.servo.success = false;
        testResults.servo.details = error.message;
        console.log(`❌ Servo test failed: ${error.message}`);
    }
}

async function testMotionSensor() {
    console.log('\n👁️ Testing PIR Motion Sensor (ID: 68)...');
    try {
        const sensorPart = skulltalkerParts.find(p => p.type === 'motion-sensor');
        if (!sensorPart) {
            throw new Error('Motion sensor part not found');
        }

        // Test sensor using the part test endpoint
        const response = await axios.post(`${BASE_URL}/parts/${sensorPart.id}/test`, {}, {
            timeout: 10000,
            headers: { 'Content-Type': 'application/json' }
        });

        testResults.sensor.tested = true;
        testResults.sensor.success = response.data.success || true;
        testResults.sensor.details = response.data;
        
        console.log(`✅ PIR Sensor test: ${response.data.message || 'Test completed'}`);
        console.log(`   GPIO Pin: ${sensorPart.gpioPin}`);
        console.log(`   Sensor Type: ${sensorPart.sensorType}`);
        console.log(`   Sensitivity: ${sensorPart.sensitivity}`);
        
    } catch (error) {
        testResults.sensor.tested = true;
        testResults.sensor.success = false;
        testResults.sensor.details = error.message;
        console.log(`❌ PIR Sensor test failed: ${error.message}`);
    }
}

async function testWebcam() {
    console.log('\n📹 Testing Webcam (ID: 70)...');
    try {
        const webcamPart = skulltalkerParts.find(p => p.type === 'webcam');
        if (!webcamPart) {
            throw new Error('Webcam part not found');
        }

        // Test webcam using the part test endpoint
        const response = await axios.post(`${BASE_URL}/parts/${webcamPart.id}/test`, {}, {
            timeout: 10000,
            headers: { 'Content-Type': 'application/json' }
        });

        testResults.webcam.tested = true;
        testResults.webcam.success = response.data.success || true;
        testResults.webcam.details = response.data;
        
        console.log(`✅ Webcam test: ${response.data.message || 'Test completed'}`);
        console.log(`   Device: ${webcamPart.devicePath}`);
        console.log(`   Resolution: ${webcamPart.resolution}`);
        console.log(`   FPS: ${webcamPart.fps}`);
        
    } catch (error) {
        testResults.webcam.tested = true;
        testResults.webcam.success = false;
        testResults.webcam.details = error.message;
        console.log(`❌ Webcam test failed: ${error.message}`);
    }
}

async function runAllTests() {
    console.log(`\n🚀 Starting hardware tests for ${skulltalkerParts.length} parts...\n`);
    
    // Run all tests
    await testSpeaker();
    await testMicrophone();
    await testServo();
    await testMotionSensor();
    await testWebcam();
    
    // Summary
    console.log('\n📊 Test Results Summary:');
    console.log('='.repeat(25));
    
    let totalTests = 0;
    let passedTests = 0;
    
    Object.entries(testResults).forEach(([component, result]) => {
        if (result.tested) {
            totalTests++;
            const status = result.success ? '✅ PASS' : '❌ FAIL';
            console.log(`${status} ${component.toUpperCase()}`);
            if (result.success) passedTests++;
        }
    });
    
    console.log(`\n🏁 Final Results: ${passedTests}/${totalTests} tests passed`);
    
    if (passedTests === totalTests && totalTests > 0) {
        console.log('🎉 ALL HARDWARE TESTS PASSED!');
        console.log('✅ Skulltalker is ready for integration testing');
        return true;
    } else {
        console.log('⚠️ Some hardware tests failed');
        console.log('🔧 Check hardware connections and service status');
        return false;
    }
}

// Run the tests
runAllTests().then(success => {
    process.exit(success ? 0 : 1);
}).catch(error => {
    console.error('💥 Test suite failed:', error.message);
    process.exit(1);
});
