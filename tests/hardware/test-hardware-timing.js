#!/usr/bin/env node
/**
 * Hardware Movement Timing Test
 * Tests that 8000ms movements at 100% actually take the expected time
 */

import fetch from 'node-fetch';

const SERVER_URL = 'http://localhost:3000';

async function testHardwareMovement(characterName, partName, duration = 8000, position = 100) {
    console.log(`\n🔧 Testing ${characterName} ${partName} movement for ${duration}ms at ${position}%`);
    
    const startTime = Date.now();
    
    try {
        // Execute hardware movement via scene API
        const response = await fetch(`${SERVER_URL}/api/scenes/execute-step`, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({
                step: {
                    type: 'hardware',
                    action: 'move_servo',
                    partName: partName,
                    position: position,
                    duration: duration
                },
                characterId: characterName.toLowerCase()
            })
        });

        const result = await response.json();
        const actualDuration = Date.now() - startTime;
        
        console.log(`📊 Expected duration: ${duration}ms`);
        console.log(`⏱️  Actual duration: ${actualDuration}ms`);
        console.log(`📈 Difference: ${actualDuration - duration}ms`);
        
        if (result.success) {
            console.log(`✅ ${characterName} ${partName} movement completed successfully`);
            
            // Check if timing is within reasonable bounds (±500ms tolerance)
            const tolerance = 500;
            if (Math.abs(actualDuration - duration) <= tolerance) {
                console.log(`✅ Timing validation PASSED (within ${tolerance}ms tolerance)`);
                return { success: true, expectedDuration: duration, actualDuration, character: characterName, part: partName };
            } else {
                console.log(`❌ Timing validation FAILED (outside ${tolerance}ms tolerance)`);
                return { success: false, expectedDuration: duration, actualDuration, character: characterName, part: partName, error: 'Timing outside tolerance' };
            }
        } else {
            console.log(`❌ ${characterName} ${partName} movement failed:`, result.error);
            return { success: false, expectedDuration: duration, actualDuration, character: characterName, part: partName, error: result.error };
        }
    } catch (error) {
        const actualDuration = Date.now() - startTime;
        console.log(`❌ Error testing ${characterName} ${partName}:`, error.message);
        return { success: false, expectedDuration: duration, actualDuration, character: characterName, part: partName, error: error.message };
    }
}

async function main() {
    console.log('🧪 MonsterBox Hardware Timing Verification Test');
    console.log('🎯 Testing 8000ms movements at 100% position on Mina and Orlok');
    console.log('⏰ Validating that physical movements take the expected time\n');

    const results = [];

    // Test Mina system - common servo parts
    results.push(await testHardwareMovement('Mina', 'coffin_lid_servo', 8000, 100));
    results.push(await testHardwareMovement('Mina', 'fog_machine_servo', 8000, 100));
    
    // Test Orlok system - common servo parts  
    results.push(await testHardwareMovement('Orlok', 'head_tilt_servo', 8000, 100));
    results.push(await testHardwareMovement('Orlok', 'jaw_servo', 8000, 100));

    console.log('\n📋 TEST SUMMARY');
    console.log('==============');
    
    const passed = results.filter(r => r.success).length;
    const failed = results.filter(r => !r.success).length;
    
    results.forEach(result => {
        const status = result.success ? '✅ PASS' : '❌ FAIL';
        const timing = `${result.actualDuration}ms (expected ${result.expectedDuration}ms)`;
        console.log(`${status} ${result.character} ${result.part}: ${timing}`);
        if (!result.success && result.error) {
            console.log(`    Error: ${result.error}`);
        }
    });
    
    console.log(`\n🎯 Results: ${passed} passed, ${failed} failed`);
    
    if (failed === 0) {
        console.log('✅ All hardware timing tests PASSED - movements execute for the expected duration');
    } else {
        console.log('❌ Some hardware timing tests FAILED - check hardware configuration');
        process.exit(1);
    }
}

// Only run if called directly
if (import.meta.url === `file://${process.argv[1]}`) {
    main().catch(error => {
        console.error('❌ Test script error:', error);
        process.exit(1);
    });
}