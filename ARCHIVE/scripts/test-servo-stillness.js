#!/usr/bin/env node

/**
 * Test script to verify servo stillness during silence periods
 * This test specifically checks for servo chattering issues
 */

const { UnifiedJawAnimationClient } = require('../services/unifiedJawAnimationClient');

async function testServoStillness() {
    console.log('🔇 Testing Servo Stillness During Silence...');
    
    const client = new UnifiedJawAnimationClient('ws://127.0.0.1:8765');
    let servoMovements = 0;
    let lastAngle = null;
    
    // Track servo movements
    client.on('jawMoved', (data) => {
        if (lastAngle !== null && Math.abs(data.angle - lastAngle) > 0.1) {
            servoMovements++;
            console.log(`🦴 Servo moved: ${lastAngle}° → ${data.angle}° (Movement #${servoMovements})`);
        }
        lastAngle = data.angle;
    });
    
    client.on('audioProcessed', (data) => {
        if (data.voice_active) {
            console.log(`🎵 Voice detected: ${data.target_angle.toFixed(1)}°`);
        }
    });
    
    try {
        // Connect to service
        console.log('Connecting to jaw animation service...');
        await client.connect();
        console.log('✅ Connected successfully');
        
        // Test 1: Ensure jaw starts in closed position
        console.log('\n📍 Test 1: Initial position');
        client.moveJawToAngle(50.0); // Closed position
        await sleep(2000);
        
        // Test 2: Start animation and send silence
        console.log('\n🔇 Test 2: Silence period (10 seconds)');
        console.log('Starting animation...');
        client.startAnimation();
        
        // Send 10 seconds of silence (empty audio buffers)
        console.log('Sending silence for 10 seconds...');
        const silenceStartTime = Date.now();
        servoMovements = 0; // Reset counter
        
        for (let i = 0; i < 100; i++) { // 10 seconds at 100ms intervals
            const silenceBuffer = Buffer.alloc(1024, 0); // Complete silence
            client.sendAudioData(silenceBuffer);
            await sleep(100);
        }
        
        const silenceEndTime = Date.now();
        const silenceDuration = (silenceEndTime - silenceStartTime) / 1000;
        
        console.log(`\n📊 Silence Test Results:`);
        console.log(`Duration: ${silenceDuration.toFixed(1)} seconds`);
        console.log(`Servo movements during silence: ${servoMovements}`);
        
        if (servoMovements === 0) {
            console.log('✅ PASS: No servo chattering detected during silence');
        } else if (servoMovements <= 2) {
            console.log('⚠️  ACCEPTABLE: Minimal servo movement (likely settling)');
        } else {
            console.log('❌ FAIL: Excessive servo chattering detected');
        }
        
        // Test 3: Brief audio burst to verify responsiveness
        console.log('\n🎵 Test 3: Audio responsiveness check');
        console.log('Sending brief audio burst...');
        
        for (let i = 0; i < 10; i++) {
            const audioBuffer = Buffer.alloc(1024);
            for (let j = 0; j < audioBuffer.length; j += 2) {
                const sample = Math.sin(j * 0.01) * 20000; // Medium amplitude
                audioBuffer.writeInt16LE(sample, j);
            }
            client.sendAudioData(audioBuffer);
            await sleep(50);
        }
        
        // Return to silence
        console.log('Returning to silence...');
        for (let i = 0; i < 20; i++) {
            const silenceBuffer = Buffer.alloc(1024, 0);
            client.sendAudioData(silenceBuffer);
            await sleep(50);
        }
        
        client.stopAnimation();
        console.log('\n✅ Servo stillness test completed');
        
    } catch (error) {
        console.error('❌ Test failed:', error);
    } finally {
        client.disconnect();
        console.log('🔌 Disconnected from service');
    }
}

function sleep(ms) {
    return new Promise(resolve => setTimeout(resolve, ms));
}

// Run the test
if (require.main === module) {
    testServoStillness().catch(console.error);
}

module.exports = { testServoStillness };
