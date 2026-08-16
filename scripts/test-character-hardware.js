#!/usr/bin/env node
/**
 * Test Orlok's Linear Actuators and Servos
 * This script tests all hardware components via direct API calls
 */

import fetch from 'node-fetch';

const ORLOK_URL = 'http://192.168.8.120:3000';
const CHARACTER_ID = 3; // Orlok

// Test configuration
const TEST_DURATION = 2000; // 2 seconds
const TEST_SPEED = 50; // 50%
const SERVO_ANGLE_CHANGE = 20; // 20% movement

async function sleep(ms) {
    return new Promise(resolve => setTimeout(resolve, ms));
}

async function testLinearActuator(partId, partName, direction) {
    console.log(`\n  Testing ${partName} - ${direction}...`);
    try {
        const response = await fetch(`${ORLOK_URL}/setup/parts/api/parts/${partId}/test`, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({
                action: direction,
                params: {
                    speed: TEST_SPEED,
                    duration: TEST_DURATION
                }
            })
        });

        const result = await response.json();
        if (result.success) {
            console.log(`  ✅ ${partName} ${direction} - SUCCESS`);
            return true;
        } else {
            console.log(`  ❌ ${partName} ${direction} - FAILED: ${result.error || result.message || 'Unknown error'}`);
            return false;
        }
    } catch (error) {
        console.log(`  ❌ ${partName} ${direction} - ERROR: ${error.message}`);
        return false;
    }
}

async function testServo(partId, partName, currentAngle, change) {
    const newAngle = Math.max(0, Math.min(180, currentAngle + change));
    console.log(`\n  Testing ${partName} - Moving from ${currentAngle}° to ${newAngle}°...`);

    try {
        const response = await fetch(`${ORLOK_URL}/setup/parts/api/parts/${partId}/test`, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({
                action: 'moveToAngle',
                params: {
                    angleDeg: newAngle,
                    duration: 1.0
                }
            })
        });

        const result = await response.json();
        if (result.success) {
            console.log(`  ✅ ${partName} moved to ${newAngle}° - SUCCESS`);
            return { success: true, newAngle };
        } else {
            console.log(`  ❌ ${partName} - FAILED: ${result.error || result.message || 'Unknown error'}`);
            return { success: false, newAngle: currentAngle };
        }
    } catch (error) {
        console.log(`  ❌ ${partName} - ERROR: ${error.message}`);
        return { success: false, newAngle: currentAngle };
    }
}

async function getCharacterParts() {
    try {
        // Read parts directly from the file system
        const fs = await import('fs/promises');
        const path = await import('path');
        const partsPath = path.join(process.cwd(), 'data', `character-${CHARACTER_ID}`, 'parts.json');
        const partsData = await fs.readFile(partsPath, 'utf8');
        const parts = JSON.parse(partsData);
        return parts;
    } catch (error) {
        console.error(`Failed to get character parts: ${error.message}`);
        return [];
    }
}

async function main() {
    console.log('🎃 ORLOK HARDWARE TEST 🎃');
    console.log('========================\n');

    // Get all parts
    console.log('Fetching Orlok parts...');
    const parts = await getCharacterParts();

    if (!parts || parts.length === 0) {
        console.error('❌ Failed to retrieve parts');
        process.exit(1);
    }

    console.log(`✅ Found ${parts.length} parts\n`);

    // Find linear actuators
    const leftArm = parts.find(p => p.name === 'Left Arm' && p.type === 'linear_actuator');
    const rightArm = parts.find(p => p.name === 'Right Arm of Satan' && p.type === 'linear_actuator');
    const loomOver = parts.find(p => p.name === 'Loom Over' && p.type === 'linear_actuator');

    // Find servos
    const servos = parts.filter(p => p.type === 'servo');

    console.log('═══════════════════════════════════════');
    console.log('PART 1: LINEAR ACTUATOR TESTS');
    console.log('═══════════════════════════════════════');

    // Test Left Arm
    if (leftArm) {
        console.log(`\n📍 Test 1: Left Arm (MDD10A - DIR=${leftArm.directionPin}, PWM=${leftArm.pwmPin})`);
        await testLinearActuator(leftArm.id, 'Left Arm', 'extend');
        await sleep(1000);
        await testLinearActuator(leftArm.id, 'Left Arm', 'retract');
        await sleep(1000);
    } else {
        console.log('\n⚠️  Left Arm not found');
    }

    // Test Right Arm
    if (rightArm) {
        console.log(`\n📍 Test 2: Right Arm (MDD10A - DIR=${rightArm.directionPin}, PWM=${rightArm.pwmPin})`);
        await testLinearActuator(rightArm.id, 'Right Arm', 'extend');
        await sleep(1000);
        await testLinearActuator(rightArm.id, 'Right Arm', 'retract');
        await sleep(1000);
    } else {
        console.log('\n⚠️  Right Arm not found');
    }

    // Test Loom Over
    if (loomOver) {
        console.log(`\n📍 Test 3: Loom Over (BTS7960 - RPWM=${loomOver.rpwmPin}, LPWM=${loomOver.lpwmPin})`);
        await testLinearActuator(loomOver.id, 'Loom Over', 'extend');
        await sleep(1000);
        await testLinearActuator(loomOver.id, 'Loom Over', 'retract');
        await sleep(1000);
    } else {
        console.log('\n⚠️  Loom Over not found');
    }

    console.log('\n═══════════════════════════════════════');
    console.log('PART 2: SERVO TESTS');
    console.log('═══════════════════════════════════════');

    if (servos.length === 0) {
        console.log('\n⚠️  No servos found');
    } else {
        console.log(`\nFound ${servos.length} servos\n`);

        for (const servo of servos) {
            const currentAngle = servo.currentAngle || 90; // Default to 90 if not set

            console.log(`\n📍 Testing ${servo.name} (Channel ${servo.channel || servo.pin})`);

            // Move up 20%
            const upResult = await testServo(servo.id, servo.name, currentAngle, SERVO_ANGLE_CHANGE);
            await sleep(1000);

            // Move down 20%
            if (upResult.success) {
                await testServo(servo.id, servo.name, upResult.newAngle, -SERVO_ANGLE_CHANGE);
                await sleep(1000);
            }
        }
    }

    console.log('\n═══════════════════════════════════════');
    console.log('✅ ALL TESTS COMPLETED!');
    console.log('═══════════════════════════════════════\n');

    console.log('Summary:');
    console.log(`  • Linear Actuators: ${leftArm ? '✓' : '✗'} Left Arm, ${rightArm ? '✓' : '✗'} Right Arm, ${loomOver ? '✓' : '✗'} Loom Over`);
    console.log(`  • Servos: ${servos.length} tested`);
    console.log('\nCheck the output above for any failures.');
}

main().catch(error => {
    console.error('Fatal error:', error);
    process.exit(1);
});

