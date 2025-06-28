#!/usr/bin/env node

/**
 * Test script to verify full range jaw movement (30°-50°)
 * Tests dramatic opening for visibility during speech
 */

const { UnifiedJawAnimationClient } = require('../services/unifiedJawAnimationClient');

async function testJawRange() {
    console.log('📐 Testing Full Range Jaw Movement (30°-50°)...');
    
    const client = new UnifiedJawAnimationClient('ws://127.0.0.1:8765');
    let jawPositions = [];
    
    // Track jaw movements
    client.on('jawMoved', (data) => {
        jawPositions.push({
            timestamp: new Date().toISOString(),
            angle: data.angle,
            success: data.success
        });
        console.log(`🦴 Jaw moved to ${data.angle}° (${data.success ? 'SUCCESS' : 'FAILED'})`);
    });
    
    client.on('audioProcessed', (data) => {
        if (data.voice_active) {
            console.log(`🎵 Voice active: Target angle ${data.target_angle.toFixed(1)}°, Volume ${data.smoothed_volume.toFixed(4)}`);
        }
    });
    
    try {
        // Connect to service
        console.log('Connecting to jaw animation service...');
        await client.connect();
        console.log('✅ Connected successfully');
        
        // Test 1: Manual position testing
        console.log('\n📍 Test 1: Manual position verification');
        
        console.log('Setting jaw to fully closed (50°)...');
        client.moveJawToAngle(50.0);
        await sleep(2000);
        
        console.log('Setting jaw to fully open (30°)...');
        client.moveJawToAngle(30.0);
        await sleep(2000);
        
        console.log('Setting jaw to mid position (40°)...');
        client.moveJawToAngle(40.0);
        await sleep(2000);
        
        console.log('Returning to closed (50°)...');
        client.moveJawToAngle(50.0);
        await sleep(1000);
        
        // Test 2: Audio-driven range testing
        console.log('\n🎵 Test 2: Audio-driven range testing');
        client.startAnimation();
        
        // Send progressively louder audio to test full range
        const volumeLevels = [
            { name: 'Very Quiet', amplitude: 1000, expectedRange: '48-50°' },
            { name: 'Quiet', amplitude: 5000, expectedRange: '40-50°' },
            { name: 'Medium', amplitude: 15000, expectedRange: '30-40°' },
            { name: 'Loud', amplitude: 25000, expectedRange: '30-35°' },
            { name: 'Very Loud', amplitude: 32000, expectedRange: '30°' }
        ];
        
        for (const level of volumeLevels) {
            console.log(`\n🔊 Testing ${level.name} audio (amplitude: ${level.amplitude}, expected: ${level.expectedRange})`);
            
            // Send audio at this level for 1 second
            for (let i = 0; i < 10; i++) {
                const audioBuffer = Buffer.alloc(1024);
                for (let j = 0; j < audioBuffer.length; j += 2) {
                    const sample = Math.sin(j * 0.01) * level.amplitude;
                    audioBuffer.writeInt16LE(sample, j);
                }
                client.sendAudioData(audioBuffer);
                await sleep(100);
            }
            
            // Brief pause between levels
            await sleep(500);
        }
        
        // Test 3: Return to silence and verify closure
        console.log('\n🔇 Test 3: Return to silence verification');
        console.log('Sending silence to verify jaw closes to 50°...');
        
        for (let i = 0; i < 20; i++) {
            const silenceBuffer = Buffer.alloc(1024, 0);
            client.sendAudioData(silenceBuffer);
            await sleep(100);
        }
        
        client.stopAnimation();
        
        // Analyze results
        console.log('\n📊 Range Analysis:');
        if (jawPositions.length > 0) {
            const angles = jawPositions.map(p => p.angle);
            const minAngle = Math.min(...angles);
            const maxAngle = Math.max(...angles);
            const range = maxAngle - minAngle;
            
            console.log(`Minimum angle reached: ${minAngle}°`);
            console.log(`Maximum angle reached: ${maxAngle}°`);
            console.log(`Total range used: ${range}°`);
            console.log(`Expected range: 20° (30° to 50°)`);
            
            // Verify full range usage
            if (minAngle <= 30.5 && maxAngle >= 49.5) {
                console.log('✅ PASS: Full range (30°-50°) utilized');
            } else if (range >= 15) {
                console.log('⚠️  ACCEPTABLE: Good range utilization');
            } else {
                console.log('❌ FAIL: Insufficient range utilization');
            }
            
            // Check for dramatic opening
            const dramaticOpenings = jawPositions.filter(p => p.angle <= 32).length;
            if (dramaticOpenings > 0) {
                console.log(`✅ PASS: Dramatic opening achieved (${dramaticOpenings} times at ≤32°)`);
            } else {
                console.log('❌ FAIL: No dramatic opening detected');
            }
        } else {
            console.log('❌ No jaw movements recorded');
        }
        
        console.log('\n✅ Full range jaw movement test completed');
        
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
    testJawRange().catch(console.error);
}

module.exports = { testJawRange };
