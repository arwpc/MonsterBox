#!/usr/bin/env node

/**
 * Comprehensive Motor Test Suite for MonsterBox 4.0
 * Tests the Physical Motor with direction pin 6 and PWM pin 13
 */

import { execSync } from 'child_process';

const MOTOR_PART_ID = '29'; // Physical Motor part ID
const BASE_URL = 'http://localhost:3000';

console.log('🔄 MonsterBox 4.0 - Comprehensive Motor Test Suite');
console.log('================================================');

async function testMotorControl(direction, speed, duration) {
    console.log(`\n🧪 Testing Motor: ${direction} at ${speed}% for ${duration}ms`);
    
    const command = `curl -s -X POST ${BASE_URL}/setup/parts/api/parts/${MOTOR_PART_ID}/test \\
        -H "Content-Type: application/json" \\
        -d '{"action": "control", "params": {"direction": "${direction}", "speed": ${speed}, "duration": ${duration}}}'`;
    
    try {
        const result = execSync(command, { encoding: 'utf8' });
        const response = JSON.parse(result);
        
        if (response.success) {
            console.log(`✅ SUCCESS: ${response.message}`);
            console.log(`   Details: Direction=${response.testResult.details.direction}, Speed=${response.testResult.details.speed}%, Duration=${response.testResult.details.duration}ms`);
            console.log(`   Hardware: Dir Pin ${response.testResult.details.directionPin}, PWM Pin ${response.testResult.details.pwmPin}`);
            return true;
        } else {
            console.log(`❌ FAILED: ${response.message}`);
            return false;
        }
    } catch (error) {
        console.log(`❌ ERROR: ${error.message}`);
        return false;
    }
}

async function testMotorStop() {
    console.log(`\n🛑 Testing Motor: Emergency Stop`);
    
    const command = `curl -s -X POST ${BASE_URL}/setup/parts/api/parts/${MOTOR_PART_ID}/test \\
        -H "Content-Type: application/json" \\
        -d '{"action": "stop"}'`;
    
    try {
        const result = execSync(command, { encoding: 'utf8' });
        const response = JSON.parse(result);
        
        if (response.success) {
            console.log(`✅ SUCCESS: ${response.message}`);
            return true;
        } else {
            console.log(`❌ FAILED: ${response.message}`);
            return false;
        }
    } catch (error) {
        console.log(`❌ ERROR: ${error.message}`);
        return false;
    }
}

async function runComprehensiveTests() {
    let passedTests = 0;
    let totalTests = 0;
    
    // Test 1: Forward direction at low speed
    totalTests++;
    if (await testMotorControl('forward', 25, 1000)) passedTests++;
    
    // Wait between tests
    await new Promise(resolve => setTimeout(resolve, 1500));
    
    // Test 2: Backward direction at medium speed
    totalTests++;
    if (await testMotorControl('backward', 50, 1500)) passedTests++;
    
    // Wait between tests
    await new Promise(resolve => setTimeout(resolve, 2000));
    
    // Test 3: Forward direction at high speed (short duration)
    totalTests++;
    if (await testMotorControl('forward', 75, 800)) passedTests++;
    
    // Wait between tests
    await new Promise(resolve => setTimeout(resolve, 1000));
    
    // Test 4: Emergency stop
    totalTests++;
    if (await testMotorStop()) passedTests++;
    
    // Test 5: Variable speed test
    console.log(`\n🎛️  Variable Speed Test Sequence`);
    const speeds = [20, 40, 60, 80];
    for (const speed of speeds) {
        totalTests++;
        console.log(`   Testing speed: ${speed}%`);
        if (await testMotorControl('forward', speed, 500)) {
            passedTests++;
        }
        await new Promise(resolve => setTimeout(resolve, 800));
    }
    
    // Test 6: Direction change test
    console.log(`\n🔄 Direction Change Test Sequence`);
    const directions = ['forward', 'backward', 'forward'];
    for (let i = 0; i < directions.length; i++) {
        totalTests++;
        console.log(`   Testing direction: ${directions[i]} (${i + 1}/${directions.length})`);
        if (await testMotorControl(directions[i], 40, 600)) {
            passedTests++;
        }
        await new Promise(resolve => setTimeout(resolve, 1000));
    }
    
    // Final stop
    console.log(`\n🛑 Final Safety Stop`);
    await testMotorStop();
    
    // Results
    console.log('\n================================================');
    console.log('🏁 Test Results Summary');
    console.log('================================================');
    console.log(`Total Tests: ${totalTests}`);
    console.log(`Passed: ${passedTests}`);
    console.log(`Failed: ${totalTests - passedTests}`);
    console.log(`Success Rate: ${Math.round((passedTests / totalTests) * 100)}%`);
    
    if (passedTests === totalTests) {
        console.log('\n🎉 ALL TESTS PASSED! Motor is fully functional.');
        console.log('✅ Motor Control: Forward/Backward directions working');
        console.log('✅ Speed Control: Variable speed (20-80%) working');
        console.log('✅ Duration Control: Timed operation working');
        console.log('✅ Emergency Stop: Safety stop function working');
        console.log('✅ Hardware Integration: Direction Pin 6, PWM Pin 13 working');
    } else {
        console.log('\n⚠️  Some tests failed. Check motor hardware and connections.');
    }
    
    console.log('\n🔄 Motor Test Suite Complete');
}

// Run the comprehensive test suite
runComprehensiveTests().catch(console.error);
