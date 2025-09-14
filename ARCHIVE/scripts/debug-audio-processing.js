#!/usr/bin/env node

/**
 * Debug script to analyze audio processing behavior
 * Helps identify why silence is being detected as voice activity
 */

const { UnifiedJawAnimationClient } = require('../services/unifiedJawAnimationClient');

async function debugAudioProcessing() {
    console.log('🔍 Debugging Audio Processing...');
    
    const client = new UnifiedJawAnimationClient('ws://127.0.0.1:8765');
    let audioSamples = [];
    
    // Track detailed audio processing
    client.on('audioProcessed', (data) => {
        audioSamples.push({
            timestamp: new Date().toISOString(),
            raw_amplitude: data.raw_amplitude,
            smoothed_volume: data.smoothed_volume,
            voice_active: data.voice_active,
            target_angle: data.target_angle
        });
        
        console.log(`🎵 Audio: Raw=${data.raw_amplitude.toFixed(6)}, Smooth=${data.smoothed_volume.toFixed(6)}, Voice=${data.voice_active}, Angle=${data.target_angle.toFixed(1)}°`);
    });
    
    try {
        // Connect to service
        console.log('Connecting to jaw animation service...');
        await client.connect();
        console.log('✅ Connected successfully');
        
        // Test 1: Send true silence
        console.log('\n🔇 Test 1: True silence (all zeros)');
        client.startAnimation();
        
        for (let i = 0; i < 10; i++) {
            const silenceBuffer = Buffer.alloc(1024, 0); // All zeros
            console.log(`Sending silence buffer ${i+1}/10 (${silenceBuffer.length} bytes, all zeros)`);
            client.sendAudioData(silenceBuffer);
            await sleep(200);
        }
        
        console.log('\n📊 Analysis after true silence:');
        const recentSamples = audioSamples.slice(-10);
        const avgRaw = recentSamples.reduce((sum, s) => sum + s.raw_amplitude, 0) / recentSamples.length;
        const avgSmooth = recentSamples.reduce((sum, s) => sum + s.smoothed_volume, 0) / recentSamples.length;
        const voiceDetections = recentSamples.filter(s => s.voice_active).length;
        
        console.log(`Average raw amplitude: ${avgRaw.toFixed(8)}`);
        console.log(`Average smoothed volume: ${avgSmooth.toFixed(8)}`);
        console.log(`Voice detections: ${voiceDetections}/10`);
        console.log(`Volume threshold: 0.01`);
        
        // Test 2: Send very low amplitude audio
        console.log('\n🔉 Test 2: Very low amplitude audio');
        audioSamples = []; // Reset
        
        for (let i = 0; i < 10; i++) {
            const lowAudioBuffer = Buffer.alloc(1024);
            for (let j = 0; j < lowAudioBuffer.length; j += 2) {
                const sample = Math.sin(j * 0.01) * 100; // Very low amplitude
                lowAudioBuffer.writeInt16LE(sample, j);
            }
            console.log(`Sending low audio buffer ${i+1}/10`);
            client.sendAudioData(lowAudioBuffer);
            await sleep(200);
        }
        
        console.log('\n📊 Analysis after low amplitude audio:');
        const lowSamples = audioSamples.slice(-10);
        const avgRawLow = lowSamples.reduce((sum, s) => sum + s.raw_amplitude, 0) / lowSamples.length;
        const avgSmoothLow = lowSamples.reduce((sum, s) => sum + s.smoothed_volume, 0) / lowSamples.length;
        const voiceDetectionsLow = lowSamples.filter(s => s.voice_active).length;
        
        console.log(`Average raw amplitude: ${avgRawLow.toFixed(8)}`);
        console.log(`Average smoothed volume: ${avgSmoothLow.toFixed(8)}`);
        console.log(`Voice detections: ${voiceDetectionsLow}/10`);
        
        // Test 3: Send medium amplitude audio
        console.log('\n🔊 Test 3: Medium amplitude audio');
        audioSamples = []; // Reset
        
        for (let i = 0; i < 10; i++) {
            const mediumAudioBuffer = Buffer.alloc(1024);
            for (let j = 0; j < mediumAudioBuffer.length; j += 2) {
                const sample = Math.sin(j * 0.01) * 15000; // Medium amplitude
                mediumAudioBuffer.writeInt16LE(sample, j);
            }
            console.log(`Sending medium audio buffer ${i+1}/10`);
            client.sendAudioData(mediumAudioBuffer);
            await sleep(200);
        }
        
        console.log('\n📊 Analysis after medium amplitude audio:');
        const mediumSamples = audioSamples.slice(-10);
        const avgRawMedium = mediumSamples.reduce((sum, s) => sum + s.raw_amplitude, 0) / mediumSamples.length;
        const avgSmoothMedium = mediumSamples.reduce((sum, s) => sum + s.smoothed_volume, 0) / mediumSamples.length;
        const voiceDetectionsMedium = mediumSamples.filter(s => s.voice_active).length;
        
        console.log(`Average raw amplitude: ${avgRawMedium.toFixed(8)}`);
        console.log(`Average smoothed volume: ${avgSmoothMedium.toFixed(8)}`);
        console.log(`Voice detections: ${voiceDetectionsMedium}/10`);
        
        // Test 4: Return to silence and wait for timeout
        console.log('\n⏱️  Test 4: Return to silence and wait for timeout');
        audioSamples = []; // Reset
        
        for (let i = 0; i < 15; i++) { // 3 seconds at 200ms intervals
            const silenceBuffer = Buffer.alloc(1024, 0);
            console.log(`Sending silence buffer ${i+1}/15 (waiting for timeout)`);
            client.sendAudioData(silenceBuffer);
            await sleep(200);
        }
        
        console.log('\n📊 Final analysis after timeout period:');
        const finalSamples = audioSamples.slice(-15);
        const finalVoiceDetections = finalSamples.filter(s => s.voice_active).length;
        const lastSample = finalSamples[finalSamples.length - 1];
        
        console.log(`Voice detections in final 15 samples: ${finalVoiceDetections}/15`);
        console.log(`Last sample voice_active: ${lastSample?.voice_active}`);
        console.log(`Last sample target_angle: ${lastSample?.target_angle}°`);
        
        client.stopAnimation();
        console.log('\n✅ Audio processing debug completed');
        
    } catch (error) {
        console.error('❌ Debug failed:', error);
    } finally {
        client.disconnect();
        console.log('🔌 Disconnected from service');
    }
}

function sleep(ms) {
    return new Promise(resolve => setTimeout(resolve, ms));
}

// Run the debug
if (require.main === module) {
    debugAudioProcessing().catch(console.error);
}

module.exports = { debugAudioProcessing };
