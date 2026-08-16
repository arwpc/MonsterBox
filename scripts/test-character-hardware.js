#!/usr/bin/env node
/**
 * Hardware smoke test — linear actuators and servos for ANY character.
 *
 * Drives every actuator/servo the safety layer marks safe for automated testing,
 * through the same parts test API the Setup UI uses.
 *
 * Usage:
 *   node scripts/test-character-hardware.js                   # this node's character
 *   node scripts/test-character-hardware.js --character 2     # a named fleet node
 *   node scripts/test-character-hardware.js --base-url http://localhost:3000
 *
 * Parts the safety config marks unsafe (dead channels, parts sharing a fuse with a
 * mutually exclusive voltage domain) are listed and skipped rather than driven —
 * picking "every servo" once meant slamming a 150 kg servo on a shared fuse.
 */

import fetch from 'node-fetch';
import { resolveCharacterTarget, resolveBaseUrl, loadParts } from './lib/character-target.mjs';
import { isTestSafePart } from '../services/hardwareService/safetyLimits.js';

// Test configuration
const TEST_DURATION = 2000; // 2 seconds
const TEST_SPEED = 50; // 50%
const SERVO_ANGLE_CHANGE = 20; // degrees off the servo's current angle

async function sleep(ms) {
    return new Promise(resolve => setTimeout(resolve, ms));
}

async function testLinearActuator(baseUrl, partId, partName, direction) {
    console.log(`\n  Testing ${partName} - ${direction}...`);
    try {
        const response = await fetch(`${baseUrl}/setup/parts/api/parts/${partId}/test`, {
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

async function testServo(baseUrl, partId, partName, currentAngle, change) {
    const newAngle = Math.max(0, Math.min(180, currentAngle + change));
    console.log(`\n  Testing ${partName} - Moving from ${currentAngle}° to ${newAngle}°...`);

    try {
        const response = await fetch(`${baseUrl}/setup/parts/api/parts/${partId}/test`, {
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

/** Split parts of one type into the ones automation may drive and the ones it may not. */
async function partitionBySafety(characterId, parts, type) {
    const safe = [];
    const blocked = [];
    for (const part of parts.filter(p => p.type === type)) {
        if (await isTestSafePart(characterId, part.id)) safe.push(part);
        else blocked.push(part);
    }
    return { safe, blocked };
}

async function main() {
    const target = await resolveCharacterTarget();
    const baseUrl = await resolveBaseUrl(process.argv.slice(2), { characterId: target.characterId });

    console.log('🎃 HARDWARE TEST 🎃');
    console.log('========================\n');
    console.log(`Character: ${target.name} (id ${target.characterId}, resolved from ${target.source})`);
    console.log(`Target node: ${baseUrl}\n`);

    const parts = await loadParts(target.characterId);

    if (!parts || parts.length === 0) {
        console.error(`❌ No parts found for ${target.name} (id ${target.characterId})`);
        process.exit(1);
    }

    console.log(`✅ Found ${parts.length} parts\n`);

    const actuators = await partitionBySafety(target.characterId, parts, 'linear_actuator');
    const servos = await partitionBySafety(target.characterId, parts, 'servo');

    for (const part of [...actuators.blocked, ...servos.blocked]) {
        console.log(`⛔ Skipping ${part.name} (id ${part.id}) — marked unsafe for automated testing`);
    }
    if (actuators.blocked.length || servos.blocked.length) console.log('');

    console.log('═══════════════════════════════════════');
    console.log('PART 1: LINEAR ACTUATOR TESTS');
    console.log('═══════════════════════════════════════');

    if (actuators.safe.length === 0) {
        console.log('\n⚠️  No testable linear actuators found');
    }
    for (const actuator of actuators.safe) {
        console.log(`\n📍 ${actuator.name} (DIR=${actuator.directionPin ?? '-'}, PWM=${actuator.pwmPin ?? '-'}, RPWM=${actuator.rpwmPin ?? '-'}, LPWM=${actuator.lpwmPin ?? '-'})`);
        await testLinearActuator(baseUrl, actuator.id, actuator.name, 'extend');
        await sleep(1000);
        await testLinearActuator(baseUrl, actuator.id, actuator.name, 'retract');
        await sleep(1000);
    }

    console.log('\n═══════════════════════════════════════');
    console.log('PART 2: SERVO TESTS');
    console.log('═══════════════════════════════════════');

    if (servos.safe.length === 0) {
        console.log('\n⚠️  No testable servos found');
    } else {
        console.log(`\nTesting ${servos.safe.length} of ${servos.safe.length + servos.blocked.length} servos\n`);

        for (const servo of servos.safe) {
            const currentAngle = servo.currentAngle || 90; // Default to 90 if not set

            console.log(`\n📍 Testing ${servo.name} (Channel ${servo.channel || servo.pin})`);

            const upResult = await testServo(baseUrl, servo.id, servo.name, currentAngle, SERVO_ANGLE_CHANGE);
            await sleep(1000);

            if (upResult.success) {
                await testServo(baseUrl, servo.id, servo.name, upResult.newAngle, -SERVO_ANGLE_CHANGE);
                await sleep(1000);
            }
        }
    }

    console.log('\n═══════════════════════════════════════');
    console.log('✅ ALL TESTS COMPLETED!');
    console.log('═══════════════════════════════════════\n');

    console.log('Summary:');
    console.log(`  • Linear Actuators: ${actuators.safe.length} tested, ${actuators.blocked.length} skipped as unsafe`);
    console.log(`  • Servos: ${servos.safe.length} tested, ${servos.blocked.length} skipped as unsafe`);
    console.log('\nCheck the output above for any failures.');
}

main().catch(error => {
    console.error('Fatal error:', error);
    process.exit(1);
});
