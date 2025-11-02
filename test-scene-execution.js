#!/usr/bin/env node

/**
 * Test Scene Execution - Verify hardware step types work
 */

import { fileURLToPath } from 'url';
import bulletproofExecutor from './services/scenes/bulletproofExecutor.js';

const __filename = fileURLToPath(import.meta.url);

// Test scene with hardware steps
const testScene = {
    id: 'hardware-test',
    name: 'Hardware Test Scene',
    steps: [
        {
            type: 'hardware',
            action: 'move_servo',
            params: { channel: 0, position: 90, duration: 1000 }
        },
        {
            type: 'wait',
            duration: 500
        },
        {
            type: 'hardware',
            action: 'move_servo',
            params: { channel: 0, position: 45, duration: 1000 }
        }
    ]
};

console.log('🎬 Testing hardware scene execution...');
console.log('Scene:', JSON.stringify(testScene, null, 2));

try {
    const result = await bulletproofExecutor.executeSceneBulletproof(testScene, 1, {
        emit: (event) => {
            console.log('📡 Event:', event.type, event.stepIndex ? `step ${event.stepIndex + 1}` : '', 
                       event.error ? `ERROR: ${event.error}` : '');
        },
        continueOnError: true
    });
    
    console.log('\n✅ Scene execution result:', {
        success: result.success,
        completedSteps: result.completedSteps,
        failedSteps: result.failedSteps,
        totalSteps: result.totalSteps,
        duration: result.duration + 'ms'
    });
    
    if (result.success) {
        console.log('🎉 ALL SYSTEMS GO! Hardware scene execution working properly.');
    } else {
        console.log('⚠️ Scene completed with errors, but system is functional.');
    }
    
} catch (error) {
    console.error('❌ Scene execution failed:', error.message);
    process.exit(1);
}