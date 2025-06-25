#!/usr/bin/env node

/**
 * Test script for the Unified Jaw Animation Service
 * Tests servo movement, audio processing, and silence detection
 */

const { UnifiedJawAnimationClient } = require('../services/unifiedJawAnimationClient');
const fs = require('fs');
const path = require('path');

async function testJawAnimation() {
    console.log('🦴 Testing Unified Jaw Animation Service...');
    
    const client = new UnifiedJawAnimationClient('ws://localhost:8765');
    
    try {
        // Connect to service
        console.log('Connecting to jaw animation service...');
        await client.connect();
        console.log('✅ Connected successfully');
        
        // Test 1: Basic servo movement
        console.log('\n📍 Test 1: Basic servo movement');
        console.log('Moving jaw to closed position (50°)...');
        client.moveJawToAngle(50.0);
        await sleep(2000);
        
        console.log('Moving jaw to open position (30°)...');
        client.moveJawToAngle(30.0);
        await sleep(2000);
        
        console.log('Moving jaw to mid position (40°)...');
        client.moveJawToAngle(40.0);
        await sleep(2000);
        
        console.log('Returning to closed position...');
        client.moveJawToAngle(50.0);
        await sleep(1000);
        
        // Test 2: Animation start/stop
        console.log('\n🎬 Test 2: Animation control');
        console.log('Starting animation...');
        client.startAnimation();
        await sleep(1000);
        
        console.log('Stopping animation...');
        client.stopAnimation();
        await sleep(1000);
        
        // Test 3: Audio data processing (simulated)
        console.log('\n🎵 Test 3: Audio data processing');
        console.log('Starting animation for audio test...');
        client.startAnimation();
        
        // Simulate audio data with varying amplitudes
        const testAudioData = generateTestAudioData();
        console.log('Sending test audio data...');
        
        for (let i = 0; i < testAudioData.length; i++) {
            client.sendAudioData(testAudioData[i]);
            await sleep(100); // 100ms intervals
        }
        
        console.log('Stopping animation...');
        client.stopAnimation();
        await sleep(1000);
        
        // Test 4: Get status
        console.log('\n📊 Test 4: Service status');
        client.getStatus();
        
        // Wait for status response
        await sleep(1000);
        
        console.log('\n📈 Client Statistics:');
        console.log(JSON.stringify(client.getStats(), null, 2));
        
        console.log('\n✅ All tests completed successfully!');
        
    } catch (error) {
        console.error('❌ Test failed:', error);
    } finally {
        client.disconnect();
        console.log('🔌 Disconnected from service');
    }
}

function generateTestAudioData() {
    /**
     * Generate simulated audio data for testing
     * Creates varying amplitude patterns to test jaw movement
     */
    const testData = [];
    
    // Silence (should keep jaw closed)
    testData.push(Buffer.alloc(1024, 0));
    
    // Low volume speech (small jaw opening)
    for (let i = 0; i < 5; i++) {
        const buffer = Buffer.alloc(1024);
        for (let j = 0; j < buffer.length; j += 2) {
            const sample = Math.sin(j * 0.01) * 5000; // Low amplitude
            buffer.writeInt16LE(sample, j);
        }
        testData.push(buffer);
    }
    
    // Medium volume speech (medium jaw opening)
    for (let i = 0; i < 5; i++) {
        const buffer = Buffer.alloc(1024);
        for (let j = 0; j < buffer.length; j += 2) {
            const sample = Math.sin(j * 0.01) * 15000; // Medium amplitude
            buffer.writeInt16LE(sample, j);
        }
        testData.push(buffer);
    }
    
    // High volume speech (full jaw opening)
    for (let i = 0; i < 5; i++) {
        const buffer = Buffer.alloc(1024);
        for (let j = 0; j < buffer.length; j += 2) {
            const sample = Math.sin(j * 0.01) * 25000; // High amplitude
            buffer.writeInt16LE(sample, j);
        }
        testData.push(buffer);
    }
    
    // Return to silence (jaw should close)
    testData.push(Buffer.alloc(1024, 0));
    testData.push(Buffer.alloc(1024, 0));
    
    return testData;
}

function sleep(ms) {
    return new Promise(resolve => setTimeout(resolve, ms));
}

// Event handlers for testing
function setupEventHandlers(client) {
    client.on('connected', () => {
        console.log('🔗 Event: Connected to jaw animation service');
    });
    
    client.on('disconnected', () => {
        console.log('🔌 Event: Disconnected from jaw animation service');
    });
    
    client.on('jawMoved', (data) => {
        console.log(`🦴 Event: Jaw moved to ${data.angle}° (success: ${data.success})`);
    });
    
    client.on('audioProcessed', (data) => {
        console.log(`🎵 Event: Audio processed - Voice active: ${data.voice_active}, Target angle: ${data.target_angle.toFixed(1)}°`);
    });
    
    client.on('animationStarted', () => {
        console.log('🎬 Event: Animation started');
    });
    
    client.on('animationStopped', () => {
        console.log('🛑 Event: Animation stopped');
    });
    
    client.on('status', (data) => {
        console.log('📊 Event: Status received:', JSON.stringify(data, null, 2));
    });
    
    client.on('serviceError', (error) => {
        console.error('❌ Event: Service error:', error.message);
    });
    
    client.on('error', (error) => {
        console.error('❌ Event: Client error:', error);
    });
}

// Run the test
if (require.main === module) {
    testJawAnimation().catch(console.error);
}
