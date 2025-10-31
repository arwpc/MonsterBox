#!/usr/bin/env node
/**
 * Quick hardware test script for Halloween emergency
 * Tests servos and actuators to ensure they're working
 */

import hardwareService from './services/hardwareService/index.js';

async function testCoffinServos() {
    console.log('\n🎃 TESTING COFFIN BREAKER SERVOS...\n');
    
    // Test Jaw servo (channel 4)
    console.log('Testing Jaw servo (channel 4)...');
    let result = await hardwareService.controlPart('1', 'moveToAngle', { angleDeg: 90 });
    console.log('Jaw test result:', result.success ? '✅ SUCCESS' : '❌ FAILED', result.message);
    
    await new Promise(resolve => setTimeout(resolve, 1000));
    
    // Test Neck servo (channel 0)
    console.log('\nTesting Neck servo (channel 0)...');
    result = await hardwareService.controlPart('2', 'moveToAngle', { angleDeg: 90 });
    console.log('Neck test result:', result.success ? '✅ SUCCESS' : '❌ FAILED', result.message);
    
    await new Promise(resolve => setTimeout(resolve, 1000));
    
    // Test Eyes servo (channel 2)
    console.log('\nTesting Eyes servo (channel 2)...');
    result = await hardwareService.controlPart('3', 'moveToAngle', { angleDeg: 90 });
    console.log('Eyes test result:', result.success ? '✅ SUCCESS' : '❌ FAILED', result.message);
    
    return true;
}

async function testOrlokParts() {
    console.log('\n🧛 TESTING ORLOK PARTS...\n');
    
    // Test Right Arm actuator
    console.log('Testing Right Arm actuator (part 1)...');
    let result = await hardwareService.controlPart('1', 'extend', { speed: 30, duration: 1000 });
    console.log('Right Arm test result:', result.success ? '✅ SUCCESS' : '❌ FAILED', result.message);
    
    await new Promise(resolve => setTimeout(resolve, 2000));
    
    // Test Left Arm actuator
    console.log('\nTesting Left Arm actuator (part 2)...');
    result = await hardwareService.controlPart('2', 'extend', { speed: 30, duration: 1000 });
    console.log('Left Arm test result:', result.success ? '✅ SUCCESS' : '❌ FAILED', result.message);
    
    await new Promise(resolve => setTimeout(resolve, 2000));
    
    // Test Bow actuator (BTS7960)
    console.log('\nTesting Bow/Waist actuator (part 3, BTS7960)...');
    result = await hardwareService.controlPart('3', 'extend', { speed: 30, duration: 1000 });
    console.log('Bow test result:', result.success ? '✅ SUCCESS' : '❌ FAILED', result.message);
    
    await new Promise(resolve => setTimeout(resolve, 2000));
    
    // Test Elbow servo (channel 4)
    console.log('\nTesting Elbow servo (channel 4)...');
    result = await hardwareService.controlPart('4', 'moveToAngle', { angleDeg: 90 });
    console.log('Elbow test result:', result.success ? '✅ SUCCESS' : '❌ FAILED', result.message);
    
    await new Promise(resolve => setTimeout(resolve, 1000));
    
    // Test Forearm servo (channel 5)
    console.log('\nTesting Forearm servo (channel 5)...');
    result = await hardwareService.controlPart('5', 'moveToAngle', { angleDeg: 90 });
    console.log('Forearm test result:', result.success ? '✅ SUCCESS' : '❌ FAILED', result.message);
    
    await new Promise(resolve => setTimeout(resolve, 1000));
    
    // Test Head continuous servo (channel 0)
    console.log('\nTesting Head continuous servo (channel 0)...');
    result = await hardwareService.controlPart('11', 'rotateContinuous', { direction: 'cw', speed: 30, duration: 1000 });
    console.log('Head test result:', result.success ? '✅ SUCCESS' : '❌ FAILED', result.message);
    
    await new Promise(resolve => setTimeout(resolve, 2000));
    
    // Test Jaw servo (channel 8)
    console.log('\nTesting Jaw servo (channel 8)...');
    result = await hardwareService.controlPart('10', 'moveToAngle', { angleDeg: 83 });
    console.log('Jaw test result:', result.success ? '✅ SUCCESS' : '❌ FAILED', result.message);
    
    return true;
}

async function main() {
    const hostname = require('os').hostname();
    
    console.log(`\n🎃 HALLOWEEN EMERGENCY HARDWARE TEST 🎃`);
    console.log(`Running on: ${hostname}\n`);
    
    try {
        if (hostname.includes('coffin')) {
            await testCoffinServos();
        } else if (hostname.includes('orlok')) {
            await testOrlokParts();
        } else {
            console.log('Unknown host. Please run this on coffin or orlok.');
            process.exit(1);
        }
        
        console.log('\n✅ Hardware test completed!\n');
        process.exit(0);
    } catch (error) {
        console.error('\n❌ Hardware test failed:', error);
        process.exit(1);
    }
}

main();
