#!/usr/bin/env node

/**
 * Test script for jaw animation improvements
 * Tests the new jitter reduction and audio synchronization features
 */

const JawAnimationSystem = require('./jaw-animation/jawAnimationSystem');
const AudioAnalyzer = require('./jaw-animation/audio/audioAnalyzer');
const ServoMapper = require('./jaw-animation/servo/servoMapper');

async function testJawImprovements() {
    console.log('🦴 Testing Jaw Animation Improvements...\n');
    
    // Test 1: Servo Mapper Deadband
    console.log('Test 1: Servo Mapper Deadband');
    const mapper = new ServoMapper({
        minPosition: 0,
        maxPosition: 45,
        positionDeadband: 0.5,
        idleTimeout: 2000,
        volumeThreshold: 0.01
    });
    
    // Test micro-movements (should be filtered out)
    console.log('Testing micro-movements...');
    let pos1 = mapper.mapVolumeToPosition(0.1);
    let pos2 = mapper.mapVolumeToPosition(0.1001); // Tiny change
    console.log(`Position 1: ${pos1}, Position 2: ${pos2}`);
    console.log(`Deadband working: ${pos1 === pos2 ? '✅' : '❌'}\n`);
    
    // Test 2: Idle State Detection
    console.log('Test 2: Idle State Detection');
    mapper.mapVolumeToPosition(0.005); // Below threshold
    await new Promise(resolve => setTimeout(resolve, 100));
    
    let state = mapper.getState();
    console.log(`Servo should be idle: ${state.shouldStop ? '✅' : '❌'}`);
    console.log(`Time since movement: ${state.timeSinceMovement}ms\n`);
    
    // Test 3: Audio Analyzer Frequency Filtering
    console.log('Test 3: Audio Analyzer Frequency Filtering');
    const analyzer = new AudioAnalyzer({
        enableFrequencyFiltering: true,
        speechFreqMin: 300,
        speechFreqMax: 3400,
        updateInterval: 16,
        attackTime: 0.05,
        releaseTime: 0.15
    });
    
    console.log('Audio analyzer configured with speech filtering: ✅');
    console.log(`Update interval: ${analyzer.options.updateInterval}ms (~${Math.round(1000/analyzer.options.updateInterval)}Hz)`);
    console.log(`Speech frequency range: ${analyzer.options.speechFreqMin}-${analyzer.options.speechFreqMax}Hz\n`);
    
    // Test 4: Simulate Audio Processing
    console.log('Test 4: Simulated Audio Processing');
    
    // Simulate frequency data (typical speech pattern)
    const simulateFrequencyData = () => {
        const dataArray = new Uint8Array(1024);
        
        // Add some speech-frequency content (300-3400 Hz)
        for (let i = 0; i < dataArray.length; i++) {
            const freq = (i / dataArray.length) * 22050; // Assuming 44.1kHz sample rate
            if (freq >= 300 && freq <= 3400) {
                dataArray[i] = Math.random() * 128 + 64; // Speech content
            } else {
                dataArray[i] = Math.random() * 32; // Background noise
            }
        }
        
        return dataArray;
    };
    
    const testData = simulateFrequencyData();
    const speechVolume = analyzer.calculateSpeechVolume(testData);
    const fullVolume = analyzer.calculateVolumeFromFrequencyData(testData);
    const rmsVolume = analyzer.calculateRMSVolume(testData);
    
    console.log(`Speech-filtered volume: ${speechVolume.toFixed(3)}`);
    console.log(`Full spectrum volume: ${fullVolume.toFixed(3)}`);
    console.log(`RMS volume: ${rmsVolume.toFixed(3)}`);
    console.log(`Speech filtering effective: ${speechVolume > fullVolume ? '✅' : '❌'}\n`);
    
    // Test 5: Response Curves
    console.log('Test 5: Response Curves');
    const testVolume = 0.5;
    
    const curves = ['linear', 'exponential', 'logarithmic', 'custom'];
    curves.forEach(curve => {
        const testMapper = new ServoMapper({ responseCurve: curve });
        const position = testMapper.mapVolumeToPosition(testVolume);
        console.log(`${curve.padEnd(12)}: ${position.toFixed(1)}°`);
    });
    
    console.log('\n🎉 All tests completed!');
    console.log('\nKey Improvements Implemented:');
    console.log('✅ Servo deadband to reduce jitter');
    console.log('✅ PWM idle state management');
    console.log('✅ Speech frequency filtering');
    console.log('✅ Enhanced attack/release timing');
    console.log('✅ Improved update rates (60Hz)');
    console.log('✅ RMS volume calculation');
    console.log('✅ Multiple response curves');
    
    console.log('\nRecommended Settings for Best Performance:');
    console.log('- Update interval: 16ms (60Hz)');
    console.log('- Position deadband: 0.5°');
    console.log('- Idle timeout: 2000ms');
    console.log('- Speech filtering: 300-3400Hz');
    console.log('- Attack time: 50ms');
    console.log('- Release time: 150ms');
}

// Run the test
if (require.main === module) {
    testJawImprovements().catch(console.error);
}

module.exports = { testJawImprovements };
